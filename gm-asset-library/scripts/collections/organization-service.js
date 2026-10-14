import { RECENTS_LIMIT } from "../core/constants.js";
import { SETTINGS } from "../core/settings.js";
import { Emitter } from "../utilities/async.js";
import { normalizeTag, SettingStore, validators } from "./storage.js";

/**
 * Favorites, recents and saved searches are personal (user scope). Collections, tags, aliases, notes
 * and role corrections describe the campaign's assets and are shared (world scope, GM-writable).
 *
 * Everything references catalog ids, never file contents, so nothing here moves or renames a file.
 */
export class OrganizationService extends Emitter {
  constructor({ io=null, randomId=null }={}) {
    super();
    const opts = io ? { io } : {};
    this.stores = {
      favorites: new SettingStore(SETTINGS.STORE_FAVORITES, { empty: () => [], validate: validators.idList, ...opts }),
      recents: new SettingStore(SETTINGS.STORE_RECENTS, { empty: () => [], validate: validators.recents, ...opts }),
      savedSearches: new SettingStore(SETTINGS.STORE_SAVED_SEARCHES, { empty: () => [], validate: validators.savedSearches, ...opts }),
      collections: new SettingStore(SETTINGS.STORE_COLLECTIONS, { empty: () => [], validate: validators.collections, ...opts }),
      tags: new SettingStore(SETTINGS.STORE_TAGS, { empty: () => ({}), validate: validators.tagMap, ...opts }),
      aliases: new SettingStore(SETTINGS.STORE_ALIASES, { empty: () => ({}), validate: d => validators.stringMap(d, 200), ...opts }),
      notes: new SettingStore(SETTINGS.STORE_NOTES, { empty: () => ({}), validate: d => validators.stringMap(d, 4000), ...opts }),
      roles: new SettingStore(SETTINGS.STORE_ROLES, { empty: () => ({}), validate: validators.roleMap, ...opts })
    };
    this.randomId = randomId ?? (() => globalThis.foundry?.utils?.randomID?.(16) ?? Math.random().toString(36).slice(2, 18));
    this.#favoriteSet = null;
  }

  #favoriteSet;

  load() {
    for ( const s of Object.values(this.stores) ) s.load();
    this.#favoriteSet = new Set(this.stores.favorites.data.data);
    return this;
  }

  reload() {
    for ( const s of Object.values(this.stores) ) s.reload();
    this.#favoriteSet = new Set(this.stores.favorites.data.data);
    this.emit("changed", { kind: "all" });
  }

  get canEditShared() { return this.stores.collections.writable; }

  #data(store) { return this.stores[store].load().data; }

  async #update(store, mutator, kind, ids=null) {
    const result = await this.stores[store].update(mutator);
    if ( store === "favorites" ) this.#favoriteSet = new Set(this.stores.favorites.data.data);
    this.emit("changed", { kind: kind ?? store, ids });
    return result;
  }

  /* ---------------- Favorites (user) ---------------- */

  isFavorite(id) { if ( !this.#favoriteSet ) this.load(); return this.#favoriteSet.has(id); }

  favoriteIds() { return [...(this.#favoriteSet ?? this.load().#favoriteSet)]; }

  async setFavorite(ids, value) {
    const list = Array.isArray(ids) ? ids : [ids];
    return this.#update("favorites", data => {
      const set = new Set(data);
      for ( const id of list ) { if ( value ) set.add(id); else set.delete(id); }
      return [...set];
    }, "favorites", list);
  }

  async toggleFavorite(id) { return this.setFavorite([id], !this.isFavorite(id)); }

  /* ---------------- Recents (user) ---------------- */

  lastAccessed(id) { return this.#data("recents").find(e => e.id === id)?.at ?? null; }

  recentIds() { return [...this.#data("recents")].sort((a, b) => b.at - a.at).map(e => e.id); }

  async touch(id) {
    return this.#update("recents", data => {
      const rest = data.filter(e => e.id !== id);
      rest.unshift({ id, at: Date.now() });
      return rest.slice(0, RECENTS_LIMIT);
    }, "recents", [id]);
  }

  async clearRecents() { return this.#update("recents", () => [], "recents"); }

  /* ---------------- Saved searches (user) ---------------- */

  savedSearches() { return [...this.#data("savedSearches")]; }

  async saveSearch({ name, text="", category="all", filters={}, sort="name:asc" }) {
    const entry = { id: this.randomId(), name: String(name).trim(), text, category, filters, sort, createdAt: Date.now() };
    if ( !entry.name ) throw new Error("A saved search needs a name");
    await this.#update("savedSearches", data => [...data, entry], "savedSearches");
    return entry;
  }

  async updateSavedSearch(id, changes) {
    return this.#update("savedSearches", data => data.map(s => s.id === id ? { ...s, ...changes, id } : s), "savedSearches");
  }

  async duplicateSavedSearch(id) {
    const src = this.#data("savedSearches").find(s => s.id === id);
    if ( !src ) return null;
    const copy = { ...src, id: this.randomId(), name: `${src.name} (copy)`, createdAt: Date.now() };
    await this.#update("savedSearches", data => [...data, copy], "savedSearches");
    return copy;
  }

  async deleteSavedSearch(id) { return this.#update("savedSearches", data => data.filter(s => s.id !== id), "savedSearches"); }

  /* ---------------- Collections (world) ---------------- */

  collections() { return [...this.#data("collections")].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)); }

  getCollection(id) { return this.#data("collections").find(c => c.id === id) ?? null; }

  collectionsOf(assetId) { return this.#data("collections").filter(c => c.assetIds.includes(assetId)); }

  async createCollection(name) {
    const trimmed = String(name ?? "").trim();
    if ( !trimmed ) throw new Error("A collection needs a name");
    const col = { id: this.randomId(), name: trimmed, sort: this.#data("collections").length, createdAt: Date.now(), assetIds: [] };
    await this.#update("collections", data => [...data, col], "collections");
    return col;
  }

  async renameCollection(id, name) {
    const trimmed = String(name ?? "").trim();
    if ( !trimmed ) throw new Error("A collection needs a name");
    return this.#update("collections", data => data.map(c => c.id === id ? { ...c, name: trimmed } : c), "collections");
  }

  async duplicateCollection(id) {
    const src = this.getCollection(id);
    if ( !src ) return null;
    const copy = { ...src, id: this.randomId(), name: `${src.name} (copy)`, sort: src.sort + 0.5, createdAt: Date.now(), assetIds: [...src.assetIds] };
    await this.#update("collections", data => renumber([...data, copy]), "collections");
    return copy;
  }

  /** Delete a collection. Assets are untouched: only the grouping disappears. */
  async deleteCollection(id) { return this.#update("collections", data => renumber(data.filter(c => c.id !== id)), "collections"); }

  async reorderCollections(orderedIds) {
    return this.#update("collections", data => {
      const pos = new Map(orderedIds.map((id, i) => [id, i]));
      return renumber(data.map(c => ({ ...c, sort: pos.has(c.id) ? pos.get(c.id) : 1e6 + c.sort })));
    }, "collections");
  }

  async addToCollection(collectionId, assetIds) {
    const list = Array.isArray(assetIds) ? assetIds : [assetIds];
    return this.#update("collections", data => data.map(c => c.id === collectionId ? { ...c, assetIds: [...new Set([...c.assetIds, ...list])] } : c), "collections", list);
  }

  async removeFromCollection(collectionId, assetIds) {
    const set = new Set(Array.isArray(assetIds) ? assetIds : [assetIds]);
    return this.#update("collections", data => data.map(c => c.id === collectionId ? { ...c, assetIds: c.assetIds.filter(id => !set.has(id)) } : c), "collections", [...set]);
  }

  /* ---------------- Tags (world) ---------------- */

  getTags(id) { return this.#data("tags")[id] ?? []; }

  allTags() {
    const counts = new Map();
    for ( const tags of Object.values(this.#data("tags")) ) for ( const t of tags ) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  async addTags(assetIds, tags) {
    const list = Array.isArray(assetIds) ? assetIds : [assetIds];
    const clean = (Array.isArray(tags) ? tags : [tags]).map(normalizeTag).filter(Boolean);
    if ( !clean.length ) return;
    return this.#update("tags", data => {
      const next = { ...data };
      for ( const id of list ) next[id] = [...new Set([...(next[id] ?? []), ...clean])];
      return next;
    }, "tags", list);
  }

  async removeTags(assetIds, tags) {
    const list = Array.isArray(assetIds) ? assetIds : [assetIds];
    const remove = new Set((Array.isArray(tags) ? tags : [tags]).map(normalizeTag));
    return this.#update("tags", data => {
      const next = { ...data };
      for ( const id of list ) {
        const kept = (next[id] ?? []).filter(t => !remove.has(t));
        if ( kept.length ) next[id] = kept; else delete next[id];
      }
      return next;
    }, "tags", list);
  }

  /* ---------------- Aliases / notes / roles (world) ---------------- */

  getAlias(id) { return this.#data("aliases")[id] ?? null; }

  async setAlias(id, alias) {
    return this.#update("aliases", data => { const next = { ...data }; const v = String(alias ?? "").trim(); if ( v ) next[id] = v; else delete next[id]; return next; }, "aliases", [id]);
  }

  getNote(id) { return this.#data("notes")[id] ?? null; }

  async setNote(id, note) {
    return this.#update("notes", data => { const next = { ...data }; const v = String(note ?? "").trim(); if ( v ) next[id] = v; else delete next[id]; return next; }, "notes", [id]);
  }

  getRole(id) { return this.#data("roles")[id] ?? null; }

  /** Set (or clear with role === null) a user classification for an asset. */
  async setRole(ids, role, mapType=null) {
    const list = Array.isArray(ids) ? ids : [ids];
    return this.#update("roles", data => {
      const next = { ...data };
      for ( const id of list ) { if ( role === undefined ) delete next[id]; else next[id] = { role, mapType }; }
      return next;
    }, "roles", list);
  }

  /** Apply stored role corrections to records. */
  applyRoles(records) {
    const roles = this.#data("roles");
    for ( const r of records ) {
      const o = roles[r.id];
      if ( !o ) { if ( r.roleSource === "user" ) { r.roleSource = r.role ? "inferred" : null; } continue; }
      r.role = o.role;
      r.mapType = o.mapType ?? null;
      r.roleSource = "user";
    }
  }

  /** Ids referenced anywhere in organization data. */
  referencedIds() {
    const ids = new Set(this.favoriteIds());
    for ( const c of this.#data("collections") ) for ( const id of c.assetIds ) ids.add(id);
    for ( const id of Object.keys(this.#data("tags")) ) ids.add(id);
    for ( const id of Object.keys(this.#data("aliases")) ) ids.add(id);
    for ( const id of Object.keys(this.#data("notes")) ) ids.add(id);
    return ids;
  }

  /** Referenced ids that do not exist in the catalog: shown as "missing" entries, never deleted silently. */
  orphans(catalogHas) {
    return [...this.referencedIds()].filter(id => !catalogHas(id));
  }

  /** Remove organization data for the given ids (explicit user action). */
  async forget(ids) {
    const set = new Set(ids);
    await this.#update("favorites", data => data.filter(id => !set.has(id)), "favorites");
    if ( this.canEditShared ) {
      await this.#update("collections", data => data.map(c => ({ ...c, assetIds: c.assetIds.filter(id => !set.has(id)) })), "collections");
      for ( const store of ["tags", "aliases", "notes", "roles"] ) await this.#update(store, data => Object.fromEntries(Object.entries(data).filter(([k]) => !set.has(k))), store);
    }
  }

  /** Export shared and personal organization data as a plain object (for backup). */
  export() {
    return { version: 1, exportedAt: Date.now(), favorites: this.favoriteIds(), savedSearches: this.savedSearches(), collections: this.collections(), tags: this.#data("tags"), aliases: this.#data("aliases"), notes: this.#data("notes"), roles: this.#data("roles") };
  }
}

function renumber(list) {
  return [...list].sort((a, b) => a.sort - b.sort).map((c, i) => ({ ...c, sort: i }));
}
