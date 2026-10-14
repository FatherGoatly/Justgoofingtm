import diagnostics from "../core/diagnostics.js";
import { isValidRecord } from "./asset-record.js";
import { CancellationToken, CancelledError, Emitter } from "../utilities/async.js";
import { mediaCache as defaultCache, STORES } from "../metadata/media-cache.js";

const CATALOG_CACHE_KEY = "files";
const CATALOG_CACHE_VERSION = 1;

/**
 * The catalog: the single in-memory collection of normalized records from every adapter, plus the
 * indexing state machine.
 *
 * Indexing is incremental: adapters yield batches which are merged into the catalog and announced
 * through the "updated" event, so the browser can show results while a long file scan is still
 * running. A scan can be cancelled; the catalog then keeps everything found so far and reports the
 * "interrupted" state instead of throwing results away.
 */
export class CatalogService extends Emitter {
  /** @type {Map<string, object>} id → record */
  records = new Map();

  /** @type {Map<string, string>} id → adapter id */
  origin = new Map();

  /** @type {Map<string, import("../adapters/base-adapter.js").BaseAdapter>} */
  adapters = new Map();

  state = { status: "idle", startedAt: null, finishedAt: null, adapters: {}, error: null, fromCache: false };

  #token = null;

  constructor({ cache=defaultCache }={}) {
    super();
    this.cache = cache;
  }

  registerAdapter(adapter, { options={} }={}) {
    if ( !adapter?.id ) throw new Error("Adapter needs an id");
    this.adapters.set(adapter.id, { adapter, options });
    this.state.adapters[adapter.id] = { status: "idle", label: adapter.label, count: 0, status_detail: null, availability: null };
  }

  unregisterAdapter(id) { this.adapters.delete(id); delete this.state.adapters[id]; }

  get size() { return this.records.size; }

  get indexing() { return this.state.status === "indexing"; }

  get(id) { return this.records.get(id) ?? null; }

  all() { return this.records.values(); }

  byAdapter(adapterId) {
    const out = [];
    for ( const [id, a] of this.origin ) if ( a === adapterId ) { const r = this.records.get(id); if ( r ) out.push(r); }
    return out;
  }

  /** Cancel a running index. Records discovered so far are kept. */
  cancel() { this.#token?.cancel("user"); }

  /**
   * Index all (or the given) adapters.
   * @param {object} options
   * @param {string[]} [options.only]         Adapter ids to run; defaults to all registered
   * @param {object} [options.adapterOptions] Per-adapter scan options { [id]: {...} }
   * @param {boolean} [options.replace=true]  Remove records of a re-scanned adapter that were not seen again
   */
  async index({ only=null, adapterOptions={}, replace=true }={}) {
    if ( this.indexing ) { this.cancel(); await new Promise(r => setTimeout(r, 30)); }
    const token = new CancellationToken();
    this.#token = token;
    this.state = { ...this.state, status: "indexing", startedAt: Date.now(), finishedAt: null, error: null };
    this.emit("state", this.state);
    const ids = only ?? [...this.adapters.keys()];
    let interrupted = false;
    try {
      for ( const id of ids ) {
        const entry = this.adapters.get(id);
        if ( !entry ) continue;
        if ( token.cancelled ) { interrupted = true; break; }
        const { adapter, options } = entry;
        const a = this.state.adapters[id];
        const availability = safeAvailability(adapter);
        a.availability = availability;
        if ( !availability.available ) { a.status = "unavailable"; this.emit("state", this.state); continue; }
        a.status = "scanning";
        a.count = 0;
        a.startedAt = Date.now();
        this.emit("state", this.state);
        const seen = new Set();
        try {
          for await ( const batch of adapter.scan({ ...options, ...(adapterOptions[id] ?? {}), token }) ) {
            if ( batch.records?.length ) {
              for ( const rec of batch.records ) {
                if ( !isValidRecord(rec) ) continue;
                this.#upsert(rec, id);
                seen.add(rec.id);
              }
              a.count = seen.size;
              this.emit("updated", { adapter: id, added: batch.records.length });
            }
            if ( batch.status ) a.detail = batch.status;
            if ( batch.done ) break;
            this.emit("state", this.state);
          }
          if ( replace && !token.cancelled ) this.#removeUnseen(id, seen);
          a.status = token.cancelled ? "interrupted" : "done";
        } catch (err) {
          if ( err instanceof CancelledError || err?.cancelled ) { a.status = "interrupted"; interrupted = true; }
          else {
            a.status = "error";
            a.error = err?.message ?? String(err);
            diagnostics.error(`Adapter ${id} failed`, err);
            diagnostics.count("failedSources");
          }
        }
        a.finishedAt = Date.now();
        this.emit("state", this.state);
        if ( token.cancelled ) { interrupted = true; break; }
      }
    } finally {
      this.state.status = interrupted ? "interrupted" : "done";
      this.state.finishedAt = Date.now();
      this.state.fromCache = false;
      this.#token = null;
      this.emit("state", this.state);
      this.emit("done", { interrupted, size: this.records.size });
    }
    return { interrupted, size: this.records.size };
  }

  #upsert(rec, adapterId) {
    const existing = this.records.get(rec.id);
    if ( existing ) {
      // Preserve probed metadata and enrichment when the same asset is rediscovered.
      rec.meta = { ...rec.meta, ...pickKnown(existing.meta), discoveredAt: existing.meta.discoveredAt ?? rec.meta.discoveredAt };
      if ( existing.accessible !== null && rec.accessible === null ) rec.accessible = existing.accessible;
      if ( existing.roleSource === "user" ) { rec.role = existing.role; rec.roleSource = "user"; }
      Object.assign(existing, rec);
      delete existing._search;
    } else {
      this.records.set(rec.id, rec);
    }
    this.origin.set(rec.id, adapterId);
  }

  #removeUnseen(adapterId, seen) {
    let removed = 0;
    for ( const [id, a] of [...this.origin] ) {
      if ( a !== adapterId || seen.has(id) ) continue;
      this.records.delete(id);
      this.origin.delete(id);
      removed++;
    }
    if ( removed ) this.emit("updated", { adapter: adapterId, removed });
  }

  /** Remove a single record (e.g. after a document deletion). */
  remove(id) {
    const had = this.records.delete(id);
    this.origin.delete(id);
    if ( had ) this.emit("updated", { removed: 1 });
    return had;
  }

  /** Insert or update a record outside a scan (e.g. document created while the browser is open). */
  upsert(rec, adapterId) {
    if ( !isValidRecord(rec) ) return false;
    this.#upsert(rec, adapterId);
    this.emit("updated", { adapter: adapterId, added: 1 });
    return true;
  }

  /** Persist the file records to the client cache so the next open is instant. */
  async saveCache(adapterId="files") {
    const records = this.byAdapter(adapterId).map(stripVolatile);
    try {
      await this.cache.set(STORES.CATALOG, CATALOG_CACHE_KEY, { version: CATALOG_CACHE_VERSION, savedAt: Date.now(), adapter: adapterId, records });
      diagnostics.debug(`Saved ${records.length} cached file records`);
    } catch (err) { diagnostics.warn("Could not save catalog cache", err); }
  }

  /** Load cached file records. Returns the number loaded (0 when nothing usable was cached). */
  async loadCache(adapterId="files") {
    try {
      const data = await this.cache.get(STORES.CATALOG, CATALOG_CACHE_KEY);
      if ( !data || data.version !== CATALOG_CACHE_VERSION || !Array.isArray(data.records) ) return 0;
      let n = 0;
      for ( const rec of data.records ) { if ( isValidRecord(rec) ) { this.#upsert(rec, adapterId); n++; } }
      if ( n ) {
        this.state.fromCache = true;
        this.state.cacheSavedAt = data.savedAt;
        const a = this.state.adapters[adapterId];
        if ( a ) { a.status = "cached"; a.count = n; }
        this.emit("updated", { adapter: adapterId, added: n, cached: true });
        this.emit("state", this.state);
      }
      return n;
    } catch (err) { diagnostics.warn("Could not load catalog cache", err); return 0; }
  }

  async clearCache() { await this.cache.delete(STORES.CATALOG, CATALOG_CACHE_KEY); }

  /** Summary for the diagnostics view. */
  summary() {
    const byAdapter = {};
    for ( const [id, s] of Object.entries(this.state.adapters) ) byAdapter[id] = { ...s, detail: s.detail ? { ...s.detail, failures: (s.detail.failures ?? []).slice(0, 10) } : null };
    return { status: this.state.status, size: this.records.size, startedAt: this.state.startedAt, finishedAt: this.state.finishedAt, fromCache: this.state.fromCache, adapters: byAdapter };
  }
}

function safeAvailability(adapter) {
  try { return adapter.availability() ?? { available: true, reason: null }; } catch (err) { return { available: false, reason: err?.message ?? "error" }; }
}

function pickKnown(meta) {
  const out = {};
  for ( const k of ["width", "height", "size", "duration", "modifiedAt"] ) if ( meta?.[k] !== null && meta?.[k] !== undefined ) out[k] = meta[k];
  return out;
}

function stripVolatile(rec) {
  const copy = { ...rec };
  delete copy._search;
  delete copy.previewError;
  delete copy._probed;
  return copy;
}
