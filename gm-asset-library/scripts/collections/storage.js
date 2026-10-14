import { STORAGE_SCHEMA_VERSION } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { getSetting, setSetting, settingScope } from "../core/settings.js";
import { canEditSharedOrganization } from "../core/permissions.js";

export class PermissionError extends Error {
  constructor(message="You do not have permission to change shared organization data.") { super(message); this.name = "PermissionError"; }
}

/**
 * A versioned record stored in one Foundry setting. Each kind of organization data (favorites, tags,
 * collections, …) has its own store so no single setting grows without bound and migrations can be
 * applied per kind.
 *
 * Writes are serialized so rapid successive changes never race each other.
 */
export class SettingStore {
  /**
   * @param {string} key          Setting key (see core/settings.js)
   * @param {object} options
   * @param {Function} options.empty      Returns the empty payload
   * @param {Function} [options.validate] (data) → data | throws
   * @param {Function} [options.migrate]  (data, fromVersion) → data
   * @param {object} [options.io]         { get(key), set(key, value), scope(key) } for tests
   */
  constructor(key, { empty, validate=null, migrate=null, io=null }={}) {
    this.key = key;
    this.empty = empty;
    this.validate = validate;
    this.migrate = migrate;
    this.io = io ?? { get: getSetting, set: setSetting, scope: settingScope };
    this.data = null;
    this.#chain = Promise.resolve();
  }

  #chain;

  get scope() { return this.io.scope(this.key); }

  get shared() { return this.scope === "world"; }

  /** Load from the setting (idempotent). */
  load() {
    if ( this.data ) return this.data;
    let raw = null;
    try { raw = this.io.get(this.key); } catch (err) { diagnostics.warn(`Could not read store ${this.key}`, err); }
    this.data = this.#normalize(raw);
    return this.data;
  }

  #normalize(raw) {
    if ( !raw || typeof raw !== "object" || (!Array.isArray(raw) && !Object.keys(raw).length) ) return { version: STORAGE_SCHEMA_VERSION, data: this.empty() };
    let { version=0, data } = raw;
    if ( data === undefined ) { data = raw; version = 0; }
    try {
      if ( version !== STORAGE_SCHEMA_VERSION && this.migrate ) data = this.migrate(data, version);
      if ( this.validate ) data = this.validate(data);
      return { version: STORAGE_SCHEMA_VERSION, data };
    } catch (err) {
      diagnostics.error(`Store ${this.key} contained invalid data and was reset. A copy is kept in memory as "corrupt".`, err);
      return { version: STORAGE_SCHEMA_VERSION, data: this.empty(), corrupt: raw };
    }
  }

  /** Can the current user write this store? */
  get writable() { return this.shared ? canEditSharedOrganization() : true; }

  /**
   * Apply a mutation and persist. The mutator receives the data payload and may return a new payload.
   */
  async update(mutator) {
    if ( !this.writable ) throw new PermissionError();
    this.load();
    const next = mutator(this.data.data) ?? this.data.data;
    this.data = { version: STORAGE_SCHEMA_VERSION, data: next };
    const snapshot = JSON.parse(JSON.stringify(this.data));
    this.#chain = this.#chain.then(() => this.io.set(this.key, snapshot)).catch(err => {
      diagnostics.error(`Could not save store ${this.key}`, err);
      throw err;
    });
    return this.#chain;
  }

  /** Refresh from the setting (e.g. after another GM changed a world store). */
  reload() { this.data = null; return this.load(); }
}

/* -------------------------------------------- */
/*  Validators                                   */
/* -------------------------------------------- */

const isStr = v => typeof v === "string";
const str = (v, max=500) => String(v ?? "").slice(0, max);

export const validators = {
  idList(data) {
    if ( !Array.isArray(data) ) throw new Error("expected array");
    return [...new Set(data.filter(isStr))];
  },
  recents(data) {
    if ( !Array.isArray(data) ) throw new Error("expected array");
    return data.filter(e => e && isStr(e.id) && Number.isFinite(e.at)).map(e => ({ id: e.id, at: e.at }));
  },
  collections(data) {
    if ( !Array.isArray(data) ) throw new Error("expected array");
    return data.filter(c => c && isStr(c.id) && isStr(c.name)).map((c, i) => ({
      id: c.id, name: str(c.name, 200), sort: Number.isFinite(c.sort) ? c.sort : i, createdAt: c.createdAt ?? Date.now(),
      assetIds: Array.isArray(c.assetIds) ? [...new Set(c.assetIds.filter(isStr))] : []
    }));
  },
  stringMap(data, maxLen=2000) {
    if ( !data || typeof data !== "object" || Array.isArray(data) ) throw new Error("expected object");
    const out = {};
    for ( const [k, v] of Object.entries(data) ) if ( isStr(k) && isStr(v) && v.length ) out[k] = str(v, maxLen);
    return out;
  },
  tagMap(data) {
    if ( !data || typeof data !== "object" || Array.isArray(data) ) throw new Error("expected object");
    const out = {};
    for ( const [k, v] of Object.entries(data) ) {
      if ( !isStr(k) || !Array.isArray(v) ) continue;
      const tags = [...new Set(v.filter(isStr).map(normalizeTag).filter(Boolean))];
      if ( tags.length ) out[k] = tags;
    }
    return out;
  },
  roleMap(data) {
    if ( !data || typeof data !== "object" || Array.isArray(data) ) throw new Error("expected object");
    const out = {};
    for ( const [k, v] of Object.entries(data) ) {
      if ( !isStr(k) || !v || typeof v !== "object" ) continue;
      out[k] = { role: v.role === null ? null : str(v.role, 40), mapType: v.mapType ? str(v.mapType, 40) : null };
    }
    return out;
  },
  savedSearches(data) {
    if ( !Array.isArray(data) ) throw new Error("expected array");
    return data.filter(s => s && isStr(s.id) && isStr(s.name)).map(s => ({
      id: s.id, name: str(s.name, 200), text: str(s.text ?? "", 500), category: str(s.category ?? "all", 50),
      filters: s.filters && typeof s.filters === "object" ? s.filters : {}, sort: str(s.sort ?? "name:asc", 40), createdAt: s.createdAt ?? Date.now()
    }));
  }
};

export function normalizeTag(tag) {
  return String(tag ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
}
