import { ASSET_TYPE, CATEGORIES, SOURCE_KIND } from "../core/constants.js";
import { sourceLabel } from "../catalog/asset-record.js";
import { compare, parseComparison, parseQuery } from "./query-parser.js";

/**
 * Search, filter and sort over the in-memory catalog.
 *
 * Matching is purely textual over verified metadata (names, aliases, paths, folders, tags, notes,
 * types, sources, pack labels). It never claims to know what an image depicts.
 *
 * The service keeps a lazily built, lower-cased search string per record (`_search`), rebuilt when
 * the record or its organization data changes (`invalidate`).
 */
export class SearchService {
  /**
   * @param {object} deps
   * @param {object} deps.organization  OrganizationService (favorites, tags, aliases, notes, collections)
   * @param {object} [deps.health]      HealthService (duplicate candidates) — optional
   */
  constructor({ organization=null, health=null }={}) {
    this.organization = organization;
    this.health = health;
    this.lastWarnings = [];
  }

  /** Force the search text of a record (or all) to be rebuilt. */
  invalidate(records) {
    if ( !records ) return;
    for ( const r of records ) delete r._search;
  }

  searchText(record) {
    if ( record._search ) return record._search;
    const org = this.organization;
    const parts = [record.name, record.fileName, record.path, record.folder, record.type, record.role, record.mapType, record.documentName, record.documentType, record.extension, sourceLabel(record), record.source.packLabel, record.source.pack, record.source.storage, record.summary];
    if ( org ) {
      parts.push(org.getAlias(record.id), org.getNote(record.id), ...org.getTags(record.id), ...org.collectionsOf(record.id).map(c => c.name));
    }
    if ( record.children ) for ( const c of record.children ) parts.push(c.name);
    record._search = parts.filter(p => typeof p === "string" && p.length).join(" \n ").toLowerCase();
    return record._search;
  }

  /**
   * Run a query.
   * @param {Iterable<object>} records
   * @param {object} q               { text, category, filters, sort, scope }
   * @returns {{results: object[], total: number, warnings: string[], parsed: object}}
   */
  query(records, { text="", category="all", filters={}, sort="name:asc", scope="all" }={}) {
    const parsed = parseQuery(text);
    const warnings = [...parsed.warnings];
    const cat = CATEGORIES.find(c => c.id === category) ?? CATEGORIES[0];
    const predicates = [];

    // Scope (user setting)
    if ( scope === "files" ) predicates.push(r => r.source.kind === SOURCE_KIND.FILE);
    else if ( scope === "world" ) predicates.push(r => r.source.kind === SOURCE_KIND.WORLD);
    else if ( scope === "noCompendium" ) predicates.push(r => r.source.kind !== SOURCE_KIND.COMPENDIUM);

    // Category
    if ( cat.id !== "all" ) predicates.push(cat.match);
    // Virtual categories handled by the browser: favorites / collection / recent are passed via filters.
    const fp = this.#filterPredicates(filters, warnings);
    predicates.push(...fp);
    const op = this.#operatorPredicates(parsed.operators, warnings);
    predicates.push(...op);

    const terms = parsed.terms;
    const results = [];
    for ( const r of records ) {
      let ok = true;
      for ( const p of predicates ) { if ( !p(r) ) { ok = false; break; } }
      if ( !ok ) continue;
      if ( terms.length ) {
        const hay = this.searchText(r);
        for ( const t of terms ) {
          const hit = hay.includes(t.value);
          if ( hit === t.negate ) { ok = false; break; }
        }
        if ( !ok ) continue;
      }
      results.push(r);
    }
    this.sort(results, sort);
    this.lastWarnings = warnings;
    return { results, total: results.length, warnings, parsed };
  }

  #filterPredicates(f, warnings) {
    const out = [];
    const org = this.organization;
    if ( f.types?.length ) { const s = new Set(f.types); out.push(r => s.has(r.type)); }
    if ( f.sources?.length ) { const s = new Set(f.sources); out.push(r => s.has(r.source.kind)); }
    if ( f.storages?.length ) { const s = new Set(f.storages); out.push(r => s.has(r.source.storage)); }
    if ( f.roles?.length ) { const s = new Set(f.roles); out.push(r => s.has(r.role ?? "none")); }
    if ( f.mapTypes?.length ) { const s = new Set(f.mapTypes); out.push(r => s.has(r.mapType ?? "unknown")); }
    if ( f.extensions?.length ) { const s = new Set(f.extensions.map(e => e.toLowerCase())); out.push(r => s.has(r.extension)); }
    if ( f.documentNames?.length ) { const s = new Set(f.documentNames); out.push(r => s.has(r.documentName)); }
    if ( f.packs?.length ) { const s = new Set(f.packs); out.push(r => s.has(r.source.pack)); }
    if ( f.folder ) { const needle = String(f.folder).toLowerCase(); out.push(r => (r.folder ?? "").toLowerCase().includes(needle)); }
    if ( f.favorite === true ) out.push(r => Boolean(org?.isFavorite(r.id)));
    if ( f.favorite === false ) out.push(r => !org?.isFavorite(r.id));
    if ( f.tags?.length ) { const want = f.tags.map(t => t.toLowerCase()); out.push(r => { const tags = org?.getTags(r.id).map(t => t.toLowerCase()) ?? []; return want.every(t => tags.includes(t)); }); }
    if ( f.collections?.length ) { out.push(r => { const ids = org?.collectionsOf(r.id).map(c => c.id) ?? []; return f.collections.some(c => ids.includes(c)); }); }
    if ( f.ids ) { const s = f.ids instanceof Set ? f.ids : new Set(f.ids); out.push(r => s.has(r.id)); }
    if ( f.recentDays ) { const since = Date.now() - f.recentDays * 86400000; out.push(r => (org?.lastAccessed(r.id) ?? 0) >= since); }
    if ( f.discoveredSince ) out.push(r => (r.meta.discoveredAt ?? 0) >= f.discoveredSince);
    if ( f.missingPreview ) out.push(r => !r.thumbnail || r.accessible === false || Boolean(r.previewError));
    if ( f.missingSource ) out.push(r => r.accessible === false);
    if ( f.duplicates ) { out.push(r => Boolean(this.health?.isDuplicateCandidate(r.id))); }
    if ( f.minWidth ) out.push(r => r.meta.width >= f.minWidth);
    if ( f.maxWidth ) out.push(r => r.meta.width != null && r.meta.width <= f.maxWidth);
    if ( f.minHeight ) out.push(r => r.meta.height >= f.minHeight);
    if ( f.maxHeight ) out.push(r => r.meta.height != null && r.meta.height <= f.maxHeight);
    if ( f.aspect ) out.push(r => matchesAspect(r, f.aspect));
    if ( f.minDuration ) out.push(r => r.meta.duration >= f.minDuration);
    if ( f.maxDuration ) out.push(r => r.meta.duration != null && r.meta.duration <= f.maxDuration);
    if ( f.minSize ) out.push(r => r.meta.size >= f.minSize);
    if ( f.maxSize ) out.push(r => r.meta.size != null && r.meta.size <= f.maxSize);
    return out;
  }

  #operatorPredicates(operators, warnings) {
    const out = [];
    const org = this.organization;
    for ( const o of operators ) {
      let pred = null;
      const vals = o.values;
      switch ( o.key ) {
        case "type": pred = r => vals.includes(r.type); break;
        case "source": pred = r => vals.includes(r.source.kind); break;
        case "storage": pred = r => vals.includes(r.source.storage ?? ""); break;
        case "ext": pred = r => vals.includes(r.extension); break;
        case "folder": { const needles = vals.map(v => v.toLowerCase()); pred = r => needles.some(n => (r.folder ?? "").toLowerCase().includes(n)); break; }
        case "pack": { const needles = vals.map(v => v.toLowerCase()); pred = r => r.source.kind === SOURCE_KIND.COMPENDIUM && needles.some(n => (r.source.packLabel ?? "").toLowerCase().includes(n) || (r.source.pack ?? "").toLowerCase().includes(n)); break; }
        case "role": pred = r => vals.includes(r.role ?? "none"); break;
        case "map": pred = r => r.role === "map" && vals.includes(r.mapType ?? "unknown"); break;
        case "doc": { const low = vals.map(v => v.toLowerCase()); pred = r => low.includes((r.documentName ?? "").toLowerCase()); break; }
        case "tag": { const want = vals.map(v => v.toLowerCase()); pred = r => { const tags = org?.getTags(r.id).map(t => t.toLowerCase()) ?? []; return want.some(t => tags.includes(t)); }; break; }
        case "collection": { const want = vals.map(v => v.toLowerCase()); pred = r => org?.collectionsOf(r.id).some(c => want.includes(c.name.toLowerCase())) ?? false; break; }
        case "favorite": { const yes = !["false", "no", "0"].includes(vals[0]); pred = r => Boolean(org?.isFavorite(r.id)) === yes; break; }
        case "in": { const cat = CATEGORIES.find(c => c.id === vals[0]); if ( !cat ) { warnings.push(`Unknown category "${vals[0]}" for in:.`); continue; } pred = cat.match; break; }
        case "is": pred = this.#isPredicate(vals, warnings); break;
        case "width": case "height": {
          const cmp = parseComparison(vals[0]);
          if ( !cmp ) { warnings.push(`Could not read ${o.key}:${vals[0]}.`); continue; }
          pred = r => compare(r.meta[o.key], cmp);
          break;
        }
        case "size": {
          const cmp = parseComparison(vals[0], { bytes: true });
          if ( !cmp ) { warnings.push(`Could not read size:${vals[0]}.`); continue; }
          pred = r => compare(r.meta.size, cmp);
          break;
        }
        case "duration": {
          const cmp = parseComparison(vals[0], { time: true });
          if ( !cmp ) { warnings.push(`Could not read duration:${vals[0]}.`); continue; }
          pred = r => compare(r.meta.duration, cmp);
          break;
        }
        case "aspect": pred = r => vals.some(v => matchesAspect(r, v)); break;
        default: continue;
      }
      if ( !pred ) continue;
      out.push(o.negate ? r => !pred(r) : pred);
    }
    return out;
  }

  #isPredicate(vals, warnings) {
    const org = this.organization;
    const preds = [];
    for ( const v of vals ) {
      switch ( v ) {
        case "favorite": case "favourite": preds.push(r => Boolean(org?.isFavorite(r.id))); break;
        case "missing": preds.push(r => r.accessible === false); break;
        case "unchecked": preds.push(r => r.accessible === null); break;
        case "nopreview": preds.push(r => !r.thumbnail || Boolean(r.previewError)); break;
        case "duplicate": preds.push(r => Boolean(this.health?.isDuplicateCandidate(r.id))); break;
        case "tagged": preds.push(r => (org?.getTags(r.id).length ?? 0) > 0); break;
        case "untagged": preds.push(r => (org?.getTags(r.id).length ?? 0) === 0); break;
        case "animated": preds.push(r => r.type === ASSET_TYPE.VIDEO || ["gif", "apng", "webm", "mp4", "m4v", "ogv"].includes(r.extension)); break;
        case "file": preds.push(r => r.source.kind === SOURCE_KIND.FILE); break;
        case "document": preds.push(r => r.kind === "document"); break;
        default: warnings.push(`Unknown is: value "${v}".`);
      }
    }
    if ( !preds.length ) return null;
    return r => preds.some(p => p(r));
  }

  /**
   * Stable sort in place. Records without a value for the key are grouped at the end in name order.
   * @param {object[]} results
   * @param {string} sort   "key:asc" | "key:desc"
   */
  sort(results, sort="name:asc") {
    const [key, dirRaw] = String(sort).split(":");
    const dir = dirRaw === "desc" ? -1 : 1;
    const org = this.organization;
    const valueOf = valueAccessor(key, org);
    const decorated = results.map((r, i) => ({ r, i, v: valueOf(r), n: (org?.getAlias(r.id) ?? r.name ?? "").toLowerCase() }));
    decorated.sort((a, b) => {
      const an = a.v === null || a.v === undefined || a.v === "";
      const bn = b.v === null || b.v === undefined || b.v === "";
      if ( an && bn ) return a.n < b.n ? -1 : a.n > b.n ? 1 : a.i - b.i;
      if ( an ) return 1;
      if ( bn ) return -1;
      let c;
      if ( typeof a.v === "number" && typeof b.v === "number" ) c = a.v - b.v;
      else c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      if ( c !== 0 ) return c * dir;
      c = a.n < b.n ? -1 : a.n > b.n ? 1 : 0;
      return c !== 0 ? c : a.i - b.i;
    });
    for ( let i = 0; i < decorated.length; i++ ) results[i] = decorated[i].r;
    return results;
  }

  /** Facet counts for the filter panel. */
  facets(records) {
    const counts = { types: new Map(), sources: new Map(), roles: new Map(), mapTypes: new Map(), extensions: new Map(), documentNames: new Map(), packs: new Map(), tags: new Map(), storages: new Map() };
    const bump = (map, key, label) => { if ( key === null || key === undefined || key === "" ) return; const e = map.get(key) ?? { key, label: label ?? key, count: 0 }; e.count++; map.set(key, e); };
    for ( const r of records ) {
      bump(counts.types, r.type);
      bump(counts.sources, r.source.kind);
      if ( r.source.storage ) bump(counts.storages, r.source.storage);
      if ( r.type === ASSET_TYPE.IMAGE ) bump(counts.roles, r.role ?? "none");
      if ( r.role === "map" ) bump(counts.mapTypes, r.mapType ?? "unknown");
      if ( r.extension ) bump(counts.extensions, r.extension);
      if ( r.documentName ) bump(counts.documentNames, r.documentName);
      if ( r.source.pack ) bump(counts.packs, r.source.pack, r.source.packLabel);
      if ( this.organization ) for ( const t of this.organization.getTags(r.id) ) bump(counts.tags, t);
    }
    const toArray = m => [...m.values()].sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, toArray(v)]));
  }
}

function valueAccessor(key, org) {
  switch ( key ) {
    case "name": return r => (org?.getAlias(r.id) ?? r.name ?? "").toLowerCase();
    case "type": return r => r.type;
    case "source": return r => `${r.source.kind}:${r.source.storage ?? r.source.packLabel ?? ""}`;
    case "folder": return r => (r.folder ?? "").toLowerCase() || null;
    case "size": return r => r.meta.size;
    case "dimensions": return r => (r.meta.width && r.meta.height) ? r.meta.width * r.meta.height : null;
    case "duration": return r => r.meta.duration;
    case "recent": return r => org?.lastAccessed(r.id) ?? null;
    case "discovered": return r => r.meta.discoveredAt ?? null;
    case "favorite": return r => org?.isFavorite(r.id) ? 1 : 0;
    default: return r => (r.name ?? "").toLowerCase();
  }
}

export function matchesAspect(r, aspect) {
  const { width: w, height: h } = r.meta;
  if ( !w || !h ) return false;
  const ratio = w / h;
  switch ( String(aspect).toLowerCase() ) {
    case "landscape": case "wide": return ratio > 1.05;
    case "portrait": case "tall": return ratio < 0.95;
    case "square": return ratio >= 0.95 && ratio <= 1.05;
    default: {
      const m = String(aspect).match(/^(\d+(?:\.\d+)?)[:/x](\d+(?:\.\d+)?)$/);
      if ( !m ) return false;
      return Math.abs(ratio - Number(m[1]) / Number(m[2])) < 0.02;
    }
  }
}
