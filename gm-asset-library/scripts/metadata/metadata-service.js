import { ASSET_TYPE } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { TaskQueue } from "../utilities/async.js";
import { mediaCache as defaultCache, STORES } from "./media-cache.js";

const FRESH_MS = 30 * 24 * 3600 * 1000;

/**
 * Extracts the metadata the browser can actually measure: image dimensions, media duration and
 * (optionally) file size through a HEAD request. Values are cached per URL in IndexedDB.
 * Nothing here loads a full-resolution image into the page: the probe uses a detached element and
 * discards it.
 */
export class MetadataService {
  constructor({ cache=defaultCache, probes={}, concurrency=4, probeSizes=true }={}) {
    this.cache = cache;
    this.queue = new TaskQueue(concurrency);
    this.probes = { image: probeImage, audio: probeMedia("audio"), video: probeMedia("video"), size: probeSize, ...probes };
    this.probeSizes = probeSizes;
    this.inflight = new Map();
  }

  /** Fill `record.meta` from cache or by probing. Resolves with the record. */
  async enrich(record, { force=false, priority=false }={}) {
    if ( !record?.url || record.kind !== "file" && !record.path ) return record;
    const url = record.url ?? record.path;
    if ( this.inflight.has(url) ) return this.inflight.get(url).then(() => record);
    const p = this.queue.push(async () => {
      try {
        const cached = force ? null : await this.cache.get(STORES.MEDIA, url);
        if ( cached && (Date.now() - (cached.checkedAt ?? 0)) < FRESH_MS ) { apply(record, cached); return; }
        const result = await this.#probe(record);
        result.checkedAt = Date.now();
        await this.cache.set(STORES.MEDIA, url, result);
        apply(record, result);
      } catch (err) {
        diagnostics.debug(`Metadata probe failed for ${url}`, err);
        record.accessible = record.accessible ?? null;
      } finally {
        this.inflight.delete(url);
      }
    }, { priority });
    this.inflight.set(url, p);
    return p.then(() => record);
  }

  async #probe(record) {
    const url = record.url ?? record.path;
    const out = { width: null, height: null, duration: null, size: null, accessible: null };
    let probe = null;
    if ( record.type === ASSET_TYPE.IMAGE ) probe = this.probes.image;
    else if ( record.type === ASSET_TYPE.AUDIO ) probe = this.probes.audio;
    else if ( record.type === ASSET_TYPE.VIDEO ) probe = this.probes.video;
    if ( probe ) {
      try {
        const r = await probe(url);
        Object.assign(out, r, { accessible: true });
      } catch (err) {
        out.accessible = err?.inaccessible === true ? false : null;
        out.error = err?.message ?? String(err);
      }
    }
    if ( this.probeSizes && !isCrossOrigin(url) ) {
      try {
        const s = await this.probes.size(url);
        if ( s ) { out.size = s.size ?? out.size; if ( s.modifiedAt ) out.modifiedAt = s.modifiedAt; if ( s.exists === false ) out.accessible = false; else if ( s.exists === true && out.accessible === null ) out.accessible = true; }
      } catch {}
    }
    return out;
  }

  cancelPending() { this.queue.clear(); this.inflight.clear(); }
}

function apply(record, data) {
  const m = record.meta;
  if ( Number.isFinite(data.width) ) m.width = data.width;
  if ( Number.isFinite(data.height) ) m.height = data.height;
  if ( Number.isFinite(data.duration) ) m.duration = data.duration;
  if ( Number.isFinite(data.size) ) m.size = data.size;
  if ( data.modifiedAt ) m.modifiedAt = data.modifiedAt;
  if ( typeof data.accessible === "boolean" ) record.accessible = data.accessible;
  if ( data.error ) record.previewError = data.error;
  else if ( data.accessible === true ) delete record.previewError;
}

export function isCrossOrigin(url) {
  if ( !/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ) return false;
  try { return new URL(url).origin !== globalThis.location?.origin; } catch { return true; }
}

function probeImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const done = () => { img.onload = img.onerror = null; img.src = ""; };
    img.onload = () => { const r = { width: img.naturalWidth, height: img.naturalHeight }; done(); resolve(r); };
    img.onerror = () => { done(); const e = new Error("Image failed to load"); e.inaccessible = true; reject(e); };
    img.decoding = "async";
    img.src = url;
  });
}

function probeMedia(tag) {
  return url => new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    const cleanup = () => { el.onloadedmetadata = el.onerror = null; el.removeAttribute("src"); try { el.load(); } catch {} };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Timed out reading media metadata")); }, 15000);
    el.preload = "metadata";
    el.muted = true;
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      const r = { duration: Number.isFinite(el.duration) ? el.duration : null };
      if ( tag === "video" ) { r.width = el.videoWidth || null; r.height = el.videoHeight || null; }
      cleanup();
      resolve(r);
    };
    el.onerror = () => { clearTimeout(timer); cleanup(); const e = new Error("Media failed to load"); e.inaccessible = el.error?.code === 4 ? null : true; reject(e); };
    el.src = url;
  });
}

async function probeSize(url) {
  const f = globalThis.fetch;
  if ( !f ) return null;
  const res = await f(url, { method: "HEAD", cache: "no-store" });
  if ( res.status === 404 ) return { exists: false };
  if ( !res.ok ) return null;
  const len = Number(res.headers.get("content-length"));
  const lm = res.headers.get("last-modified");
  return { exists: true, size: Number.isFinite(len) && len > 0 ? len : null, modifiedAt: lm ? Date.parse(lm) || null : null };
}
