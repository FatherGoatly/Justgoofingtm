/**
 * Minimal Foundry/dnd5e globals for Node tests. Only the small subset of `foundry.utils` and
 * `game` that the pure modules touch. Builders prefer the static dnd5e reference tables when
 * `CONFIG.DND5E` is absent.
 */
import { randomUUID } from "node:crypto";

function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

function deepClone(v) {
  if ( Array.isArray(v) ) return v.map(deepClone);
  if ( v instanceof Set ) return new Set([...v]);
  if ( isObject(v) ) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepClone(x)]));
  return v;
}

function mergeObject(target, source={}, { inplace=true, insertKeys=true, overwrite=true }={}) {
  const out = inplace ? target : deepClone(target);
  for ( const [k, v] of Object.entries(source ?? {}) ) {
    if ( k.includes(".") ) { setProperty(out, k, v); continue; }
    if ( isObject(v) && isObject(out[k]) ) mergeObject(out[k], v, { inplace: true, insertKeys, overwrite });
    else if ( overwrite || !(k in out) ) { if ( k in out || insertKeys ) out[k] = deepClone(v); }
  }
  return out;
}

function getProperty(obj, key) {
  return String(key).split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

function setProperty(obj, key, value) {
  const parts = String(key).split(".");
  let o = obj;
  for ( const p of parts.slice(0, -1) ) { if ( !isObject(o[p]) ) o[p] = {}; o = o[p]; }
  o[parts.at(-1)] = value;
  return true;
}

function expandObject(obj) {
  const out = {};
  for ( const [k, v] of Object.entries(obj ?? {}) ) setProperty(out, k, isObject(v) ? expandObject(v) : v);
  return out;
}

function flattenObject(obj, prefix="") {
  const out = {};
  for ( const [k, v] of Object.entries(obj ?? {}) ) {
    const key = prefix ? `${prefix}.${k}` : k;
    if ( isObject(v) && Object.keys(v).length ) Object.assign(out, flattenObject(v, key));
    else out[key] = v;
  }
  return out;
}

globalThis.foundry = {
  utils: {
    deepClone, mergeObject, getProperty, setProperty, expandObject, flattenObject,
    isEmpty: v => v == null || (Array.isArray(v) && !v.length) || (isObject(v) && !Object.keys(v).length) || v === "",
    randomID: (n=16) => randomUUID().replace(/-/g, "").slice(0, n),
    hasProperty: (o, k) => getProperty(o, k) !== undefined,
    isNewerVersion: (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }) > 0,
    getType: v => Array.isArray(v) ? "Array" : v === null ? "null" : typeof v === "object" ? "Object" : typeof v
  }
};

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
  TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 }
};

/** Simple Hooks mock recording registrations and allowing manual firing. */
class HooksMock {
  constructor() { this.events = new Map(); }

  on(name, fn) { if ( !this.events.has(name) ) this.events.set(name, []); this.events.get(name).push(fn); return this.events.get(name).length; }

  once(name, fn) { return this.on(name, fn); }

  off(name, fn) { const arr = this.events.get(name) ?? []; const i = arr.indexOf(fn); if ( i >= 0 ) arr.splice(i, 1); }

  call(name, ...args) { for ( const fn of this.events.get(name) ?? [] ) { if ( fn(...args) === false ) return false; } return true; }

  callAll(name, ...args) { for ( const fn of this.events.get(name) ?? [] ) fn(...args); return true; }

  reset() { this.events.clear(); }
}
globalThis.Hooks = new HooksMock();

/** Test helper to build a fake game object; tests override as needed. */
export function makeGame({ isGM=false, can=() => false, settings={}, modules=[] }={}) {
  const store = new Map();
  const user = { id: "user1", isGM, can, name: "Tester" };
  const mods = new Map(modules.map(m => [m.id, { id: m.id, active: m.active ?? true, version: m.version ?? "1.0.0", api: m.api }]));
  return {
    user, users: { activeGM: isGM ? user : null, get: () => user },
    version: "14.369",
    system: { id: "dnd5e", version: "6.0.6" },
    modules: { get: id => mods.get(id) },
    settings: {
      register: (scope, key, data) => { if ( !store.has(`${scope}.${key}`) ) store.set(`${scope}.${key}`, settings[key] ?? data.default); },
      get: (scope, key) => { if ( key in settings ) return settings[key]; if ( store.has(`${scope}.${key}`) ) return store.get(`${scope}.${key}`); throw new Error(`Setting ${key} not registered`); },
      set: (scope, key, value) => { store.set(`${scope}.${key}`, value); return Promise.resolve(value); }
    },
    i18n: { localize: k => k, format: (k, d) => `${k} ${JSON.stringify(d)}`, has: () => true },
    actors: new Map(), items: new Map(), macros: new Map(), folders: new Map(), packs: new Map()
  };
}

globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
