/**
 * Minimal Foundry globals for Node/jsdom tests. Only the surface the module touches. The i18n shim reads
 * lang/en.json so tests can assert on real English strings.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const lang = JSON.parse(fs.readFileSync(path.join(root, "lang/en.json"), "utf8"));

function lookup(key) { return String(key).split(".").reduce((o, k) => (o != null ? o[k] : undefined), lang); }
function format(str, data={}) { return String(str).replace(/\{([^}]+)\}/g, (m, k) => (k in data ? String(data[k]) : m)); }

function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }

globalThis.foundry = {
  utils: {
    randomID: (n=16) => randomUUID().replace(/-/g, "").slice(0, n),
    escapeHTML,
    getRoute: p => `/${String(p).replace(/^\/+/, "")}`,
    parseUuid: uuid => { const parts = String(uuid).split("."); return parts[0] === "Compendium" ? { collection: null, id: parts.at(-1), documentType: parts[3] } : { id: parts.at(-1), documentType: parts[0] }; },
    getDocumentClass: name => globalThis.CONFIG?.[name]?.documentClass ?? null,
    debounce: (fn, ms) => fn
  },
  applications: { api: {}, apps: {}, ux: {} }
};

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
  USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 }
};

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
globalThis.ui = { notifications: { info() {}, warn() {}, error() {}, success() {} } };

/** In-memory settings store honouring scope semantics (world writes require the GM flag). */
export class SettingsMock {
  constructor(user) { this.user = user; this.defs = new Map(); this.values = new Map(); this.sheet = { render() {} }; }

  register(ns, key, data) { this.defs.set(`${ns}.${key}`, data); }

  get(ns, key) {
    const id = `${ns}.${key}`;
    if ( !this.defs.has(id) ) throw new Error(`Setting ${id} not registered`);
    return this.values.has(id) ? this.values.get(id) : this.defs.get(id).default;
  }

  async set(ns, key, value) {
    const id = `${ns}.${key}`;
    const def = this.defs.get(id);
    if ( !def ) throw new Error(`Setting ${id} not registered`);
    if ( def.scope === "world" && !(this.user.isGM || this.user.permissions?.SETTINGS_MODIFY) ) throw new Error("User lacks permission to update world setting");
    this.values.set(id, JSON.parse(JSON.stringify(value)));
    return value;
  }
}

/** Build a fake `game`. */
export function makeGame({ isGM=true, permissions={}, modules=[], collections={} }={}) {
  const user = { id: "user1", name: isGM ? "GM" : "Player", isGM, role: isGM ? 4 : 1, isTrusted: isGM, permissions, can: p => isGM || Boolean(permissions[p]) };
  const mods = new Map(modules.map(m => [m.id, { id: m.id, active: m.active ?? true, version: m.version ?? "1.0.0", api: m.api }]));
  const settings = new SettingsMock(user);
  const col = list => ({ contents: list, get: id => list.find(d => d.id === id), filter: f => list.filter(f), [Symbol.iterator]: () => list[Symbol.iterator]() });
  const game = {
    user, users: { activeGM: isGM ? user : null, get: () => user },
    version: "14.368", ready: true,
    system: { id: "test-system", version: "1.0.0" },
    modules: { get: id => mods.get(id) },
    settings,
    i18n: { localize: k => lookup(k) ?? k, format: (k, d) => format(lookup(k) ?? k, d), has: k => lookup(k) !== undefined },
    actors: col(collections.actors ?? []), items: col(collections.items ?? []), scenes: col(collections.scenes ?? []), journal: col(collections.journal ?? []),
    playlists: col(collections.playlists ?? []), tables: col(collections.tables ?? []), macros: col(collections.macros ?? []), cards: col(collections.cards ?? []),
    packs: col(collections.packs ?? []),
    clipboard: { copied: null, copyPlainText(t) { this.copied = t; return Promise.resolve(); } },
    keybindings: { register() {} }
  };
  globalThis.game = game;
  return game;
}

/** Build a fake document with the properties the adapters read. */
export function makeDoc({ documentName, id=randomUUID().slice(0, 16), name="Doc", type=null, img=null, folder=null, visible=true, owner=true, extra={} }) {
  const doc = {
    id, documentName, name, type, img, folder: folder ? { name: folder } : null, visible,
    get uuid() { return `${documentName}.${id}`; },
    isOwner: owner, isEmbedded: false, pack: null,
    testUserPermission: () => visible,
    canUserModify: () => owner,
    sheet: { rendered: false, render(force) { this.rendered = true; } },
    update: async changes => { doc.updates = [...(doc.updates ?? []), changes]; for ( const [k, v] of Object.entries(changes) ) setPath(doc, k, v); return doc; },
    ...extra
  };
  return doc;
}

export function setPath(obj, key, value) {
  const parts = String(key).split(".");
  let o = obj;
  for ( const p of parts.slice(0, -1) ) { if ( typeof o[p] !== "object" || o[p] === null ) o[p] = {}; o = o[p]; }
  o[parts.at(-1)] = value;
}

/** A browse() implementation over an in-memory tree: { "assets": { "maps": ["a.webp"], "tokens": [...] } }. */
export function makeBrowse(tree, { failures=[] }={}) {
  const calls = [];
  const fn = async (source, target, options={}) => {
    calls.push({ source, target });
    const key = `${source}:${target}`;
    if ( failures.includes(key) ) throw new Error(`Access denied: ${key}`);
    const node = getNode(tree[source] ?? {}, target);
    if ( node === undefined ) throw new Error(`Directory not found: ${key}`);
    const dirs = [];
    const files = [];
    if ( Array.isArray(node) ) { for ( const f of node ) files.push(target ? `${target}/${f}` : f); }
    else {
      for ( const [k, v] of Object.entries(node) ) {
        if ( Array.isArray(v) || (v && typeof v === "object") ) dirs.push(target ? `${target}/${k}` : k);
      }
      for ( const f of node.__files ?? [] ) files.push(target ? `${target}/${f}` : f);
      const i = dirs.indexOf(target ? `${target}/__files` : "__files");
      if ( i >= 0 ) dirs.splice(i, 1);
    }
    return { target, dirs, files, private: false, gridSize: null, extensions: options.extensions ?? [] };
  };
  fn.calls = calls;
  return fn;
}

function getNode(root, target) {
  if ( !target ) return root;
  let node = root;
  for ( const part of target.split("/") ) { if ( node == null || typeof node !== "object" || Array.isArray(node) ) return undefined; node = node[part]; }
  return node;
}

/** Deterministic synthetic file list for benchmarks: n paths across folders and types. */
export function syntheticFiles(n) {
  const folders = ["assets/maps/battle", "assets/maps/dungeon", "assets/tokens/monsters", "assets/tokens/npcs", "assets/portraits", "assets/tiles", "assets/audio/ambient", "assets/audio/music", "assets/video", "worlds/demo/handouts"];
  const exts = { "assets/audio/ambient": "ogg", "assets/audio/music": "mp3", "assets/video": "webm", "worlds/demo/handouts": "pdf" };
  const words = ["red", "dragon", "forest", "merchant", "cave", "city", "night", "goblin", "boss", "temple", "road", "river", "castle", "swamp", "ancient", "ruined"];
  const out = [];
  for ( let i = 0; i < n; i++ ) {
    const folder = folders[i % folders.length];
    const ext = exts[folder] ?? (i % 3 === 0 ? "png" : "webp");
    const name = `${words[i % words.length]}_${words[(i * 7) % words.length]}_${i}.${ext}`;
    out.push(`${folder}/${name}`);
  }
  return out;
}
