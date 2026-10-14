import { SOURCE_KIND } from "../core/constants.js";
import { canObserveDocument } from "../core/permissions.js";
import { basename, isUnder, normalizePath } from "../utilities/paths.js";
import { nextTick } from "../utilities/async.js";

/**
 * Asset health: duplicate candidates, references from world documents to files, and missing-file
 * detection. Everything here is a report; nothing is ever deleted.
 */
export class HealthService {
  constructor({ catalog, game: g=null }={}) {
    this.catalog = catalog;
    this._game = g;
    this.duplicateGroups = [];
    this.duplicateIds = new Set();
    this.references = null; // Map<normalizedPath, Reference[]>
    this.referencesBuiltAt = null;
  }

  get game() { return this._game ?? globalThis.game; }

  /* ---------------- Duplicates ---------------- */

  /**
   * Find duplicate candidates among file records. Signals, strongest first:
   *  - "same-path": identical normalized path in different storages (exact same relative file)
   *  - "same-size-dimensions": identical file size and pixel dimensions (both known) — strong candidate
   *  - "same-filename": identical filename in different folders — weak candidate
   * Filename similarity alone is never reported as a verified duplicate.
   */
  computeDuplicates(records=this.catalog?.all() ?? []) {
    const files = [];
    for ( const r of records ) if ( r.source.kind === SOURCE_KIND.FILE ) files.push(r);
    const groups = [];
    const byPath = groupBy(files, r => normalizePath(r.path).toLowerCase());
    for ( const [key, list] of byPath ) if ( list.length > 1 ) groups.push({ kind: "exact", reason: "same-path", key, records: list });
    const bySizeDims = groupBy(files.filter(r => r.meta.size && r.meta.width && r.meta.height), r => `${r.meta.size}|${r.meta.width}x${r.meta.height}`);
    for ( const [key, list] of bySizeDims ) if ( list.length > 1 && !allSamePath(list) ) groups.push({ kind: "candidate", reason: "same-size-dimensions", key, records: list });
    const byName = groupBy(files, r => basename(r.path).toLowerCase());
    for ( const [key, list] of byName ) if ( list.length > 1 && !allSamePath(list) ) groups.push({ kind: "candidate", reason: "same-filename", key, records: list });
    this.duplicateGroups = groups;
    this.duplicateIds = new Set(groups.flatMap(g => g.records.map(r => r.id)));
    return groups;
  }

  isDuplicateCandidate(id) { return this.duplicateIds.has(id); }

  /* ---------------- References ---------------- */

  /** Document types and fields that are inspected for file references. This is the whole scope; compendiums are not included. */
  static REFERENCE_SCOPE = Object.freeze([
    { documentName: "Actor", fields: ["img", "prototypeToken.texture.src"] },
    { documentName: "Item", fields: ["img"] },
    { documentName: "Scene", fields: ["background.src", "foreground", "thumb"], embedded: { Tile: ["texture.src"], Token: ["texture.src"], AmbientSound: ["path"], Note: ["texture.src"] } },
    { documentName: "JournalEntry", embedded: { JournalEntryPage: ["src"] } },
    { documentName: "Playlist", embedded: { PlaylistSound: ["path"] } },
    { documentName: "RollTable", fields: ["img"], embedded: { TableResult: ["img"] } },
    { documentName: "Macro", fields: ["img"] },
    { documentName: "Cards", fields: ["img"], embedded: { Card: ["faces.*.img", "back.img"] } }
  ]);

  /** Build the path → references map from the world's documents visible to this user. */
  async buildReferences() {
    const map = new Map();
    const collections = { Actor: "actors", Item: "items", Scene: "scenes", JournalEntry: "journal", Playlist: "playlists", RollTable: "tables", Macro: "macros", Cards: "cards" };
    const embeddedCollections = { Tile: "tiles", Token: "tokens", AmbientSound: "sounds", Note: "notes", JournalEntryPage: "pages", PlaylistSound: "sounds", TableResult: "results", Card: "cards" };
    let i = 0;
    for ( const scope of HealthService.REFERENCE_SCOPE ) {
      const coll = this.game?.[collections[scope.documentName]];
      if ( !coll ) continue;
      for ( const doc of coll.contents ?? coll ) {
        if ( ++i % 100 === 0 ) await nextTick();
        if ( !canObserveDocument(doc) ) continue;
        for ( const field of scope.fields ?? [] ) addRef(map, getPath(doc, field), { uuid: doc.uuid, name: doc.name, documentName: scope.documentName, field });
        for ( const [embName, fields] of Object.entries(scope.embedded ?? {}) ) {
          const emb = doc[embeddedCollections[embName]];
          if ( !emb ) continue;
          for ( const child of emb.contents ?? emb ) {
            for ( const field of fields ) {
              if ( field.includes("*") ) {
                const [arrKey, , leaf] = field.split(".");
                for ( const item of getPath(child, arrKey) ?? [] ) addRef(map, item?.[leaf], { uuid: child.uuid, name: child.name ?? doc.name, documentName: embName, parent: doc.name, field });
              } else addRef(map, getPath(child, field), { uuid: child.uuid, name: child.name ?? doc.name, documentName: embName, parent: doc.name, field });
            }
          }
        }
      }
    }
    this.references = map;
    this.referencesBuiltAt = Date.now();
    return map;
  }

  /**
   * Where is this file used? Returns the references and the explicit scope that was searched.
   */
  async usagesOf(record) {
    if ( !this.references ) await this.buildReferences();
    const candidates = new Set();
    if ( record.path ) candidates.add(normalizePath(record.path).toLowerCase());
    if ( record.url ) candidates.add(normalizePath(record.url).toLowerCase());
    const refs = [];
    for ( const key of candidates ) for ( const r of this.references.get(key) ?? [] ) refs.push(r);
    return { references: dedupe(refs), scope: this.scopeDescription() };
  }

  scopeDescription() {
    return {
      documentTypes: HealthService.REFERENCE_SCOPE.map(s => s.documentName),
      embedded: HealthService.REFERENCE_SCOPE.flatMap(s => Object.keys(s.embedded ?? {})),
      compendiums: false,
      note: "World documents visible to you only. Compendium content, module/system defaults and references inside HTML text are not searched."
    };
  }

  /* ---------------- Missing references ---------------- */

  /**
   * Compare world references against the catalog.
   * @param {object} options
   * @param {Array<{source, target}>} options.roots   Scanned file roots, to tell "missing" from "unchecked"
   * @param {Function} [options.probe]               async (url) → true|false|null, used for paths outside the scanned roots (bounded)
   * @param {number} [options.maxProbes=200]
   */
  async missingReferences({ roots=[], probe=null, maxProbes=200 }={}) {
    if ( !this.references ) await this.buildReferences();
    const catalogPaths = new Set();
    const inaccessible = new Set();
    for ( const r of this.catalog?.all() ?? [] ) {
      if ( r.source.kind !== SOURCE_KIND.FILE || !r.path ) continue;
      const key = normalizePath(r.path).toLowerCase();
      catalogPaths.add(key);
      if ( r.accessible === false ) inaccessible.add(key);
    }
    const results = [];
    let probes = 0;
    for ( const [path, refs] of this.references ) {
      if ( isRemote(path) || path.startsWith("data:") ) { results.push({ path, refs, status: "unchecked", reason: "remote" }); continue; }
      if ( inaccessible.has(path) ) { results.push({ path, refs, status: "missing", reason: "probe-failed" }); continue; }
      if ( catalogPaths.has(path) ) { results.push({ path, refs, status: "ok" }); continue; }
      const inRoots = roots.some(root => (root.source ?? "data") === "data" && isUnder(path, root.target ?? ""));
      if ( inRoots && this.catalog?.state?.status === "done" && !this.catalog.state.adapters?.files?.detail?.truncated ) {
        results.push({ path, refs, status: "missing", reason: "not-in-scan" });
        continue;
      }
      if ( probe && probes < maxProbes ) {
        probes++;
        let ok = null;
        try { ok = await probe(path); } catch { ok = null; }
        results.push({ path, refs, status: ok === true ? "ok" : ok === false ? "missing" : "unchecked", reason: ok === null ? "probe-inconclusive" : "probed" });
        continue;
      }
      results.push({ path, refs, status: "unchecked", reason: inRoots ? "scan-incomplete" : "outside-roots" });
    }
    return { results, scope: this.scopeDescription(), probes };
  }

  /** Catalog records whose source failed to load. */
  staleEntries() {
    const out = [];
    for ( const r of this.catalog?.all() ?? [] ) if ( r.accessible === false ) out.push(r);
    return out;
  }
}

function groupBy(list, keyFn) {
  const map = new Map();
  for ( const item of list ) { const k = keyFn(item); if ( !k ) continue; if ( !map.has(k) ) map.set(k, []); map.get(k).push(item); }
  return map;
}

function allSamePath(list) {
  const first = normalizePath(list[0].path).toLowerCase();
  return list.every(r => normalizePath(r.path).toLowerCase() === first);
}

function getPath(obj, path) {
  return String(path).split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

function addRef(map, value, ref) {
  if ( typeof value !== "string" || !value ) return;
  const key = normalizePath(value).toLowerCase();
  if ( !map.has(key) ) map.set(key, []);
  map.get(key).push({ ...ref, path: value });
}

function dedupe(refs) {
  const seen = new Set();
  return refs.filter(r => { const k = `${r.uuid}|${r.field}`; if ( seen.has(k) ) return false; seen.add(k); return true; });
}

function isRemote(path) { return /^[a-z][a-z0-9+.-]*:\/\//i.test(path); }
