import { MODULE_ID } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";

const DB_NAME = `${MODULE_ID}-cache`;
const DB_VERSION = 1;
export const STORES = Object.freeze({ MEDIA: "media", THUMBS: "thumbs", CATALOG: "catalog" });

/**
 * A small IndexedDB wrapper for per-client caches (probed media metadata, generated thumbnails,
 * the last file catalog). Falls back to an in-memory Map when IndexedDB is unavailable or fails, so
 * the module keeps working: the browser cache is a convenience, never the source of truth.
 */
export class MediaCache {
  #db = null;

  #opening = null;

  #memory = new Map(Object.values(STORES).map(s => [s, new Map()]));

  #disabled = false;

  constructor({ indexedDB: idb=globalThis.indexedDB ?? null, name=DB_NAME }={}) {
    this.idb = idb;
    this.name = name;
    if ( !idb ) this.#disabled = true;
  }

  get persistent() { return !this.#disabled; }

  async #open() {
    if ( this.#disabled ) return null;
    if ( this.#db ) return this.#db;
    if ( this.#opening ) return this.#opening;
    this.#opening = new Promise(resolve => {
      let req;
      try { req = this.idb.open(this.name, DB_VERSION); } catch (err) { this.#disabled = true; resolve(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        for ( const s of Object.values(STORES) ) if ( !db.objectStoreNames.contains(s) ) db.createObjectStore(s);
      };
      req.onsuccess = () => { this.#db = req.result; this.#db.onversionchange = () => { this.#db?.close(); this.#db = null; }; resolve(this.#db); };
      req.onerror = () => { diagnostics.warn("IndexedDB unavailable, using in-memory cache", req.error); this.#disabled = true; resolve(null); };
      req.onblocked = () => { this.#disabled = true; resolve(null); };
    });
    return this.#opening;
  }

  async #tx(store, mode, fn) {
    const db = await this.#open();
    if ( !db ) return fn(null);
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(store, mode); } catch (err) { this.#disabled = true; resolve(fn(null)); return; }
      const os = tx.objectStore(store);
      let result;
      try { result = fn(os); } catch (err) { reject(err); return; }
      tx.oncomplete = () => resolve(result?.result !== undefined ? result.result : result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
    });
  }

  async get(store, key) {
    if ( this.#disabled ) return this.#memory.get(store).get(key) ?? null;
    try {
      const v = await this.#tx(store, "readonly", os => os ? os.get(key) : null);
      return v ?? null;
    } catch (err) { return this.#memory.get(store).get(key) ?? null; }
  }

  async set(store, key, value) {
    this.#memory.get(store).set(key, value);
    if ( this.#disabled ) return;
    try { await this.#tx(store, "readwrite", os => os?.put(value, key)); } catch (err) {
      diagnostics.debug(`Cache write failed for ${store}/${key}`, err);
    }
  }

  async delete(store, key) {
    this.#memory.get(store).delete(key);
    if ( this.#disabled ) return;
    try { await this.#tx(store, "readwrite", os => os?.delete(key)); } catch {}
  }

  async clear(store) {
    this.#memory.get(store).clear();
    if ( this.#disabled ) return;
    try { await this.#tx(store, "readwrite", os => os?.clear()); } catch {}
  }

  async clearAll() { for ( const s of Object.values(STORES) ) await this.clear(s); }

  async count(store) {
    if ( this.#disabled ) return this.#memory.get(store).size;
    try { return await this.#tx(store, "readonly", os => os ? os.count() : 0); } catch { return this.#memory.get(store).size; }
  }
}

export const mediaCache = new MediaCache();
