/**
 * A minimal Foundry runtime mock for unit tests. Only the surfaces the module touches outside the UI are
 * modelled; UI classes are tested through their pure helpers instead.
 */
import { vi } from "vitest";

export function createMockGame({ isGM=true, system="dnd5e", systemVersion="6.0.6", modules=[], settings={} }={}) {
  const store = new Map(Object.entries(settings));
  const registered = new Map();
  const user = {
    id: "user1", name: isGM ? "GM" : "Player", role: isGM ? 4 : 1, isGM,
    can: perm => isGM || ["MACRO_SCRIPT", "PLAYER"].includes(perm),
    hasRole: role => isGM || role === "PLAYER" || role === 1,
    flags: {},
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async setFlag(scope, key, value) { this.flags[scope] ??= {}; this.flags[scope][key] = value; return this; },
    async unsetFlag(scope, key) { delete this.flags?.[scope]?.[key]; return this; },
    targets: new Set()
  };
  const game = {
    version: "14.369",
    release: { generation: 14, version: "14.369" },
    system: { id: system, title: system === "dnd5e" ? "Dungeons & Dragons Fifth Edition" : system, version: systemVersion },
    modules: new Map(modules.map(m => [m.id, { active: true, version: "1.0.0", title: m.id, ...m }])),
    user,
    users: { contents: [user], filter: fn => [user].filter(fn), get: id => id === user.id ? user : undefined },
    settings: {
      register: vi.fn((ns, key, cfg) => { registered.set(`${ns}.${key}`, cfg); if ( !store.has(`${ns}.${key}`) ) store.set(`${ns}.${key}`, cfg.default); }),
      registerMenu: vi.fn(),
      get: vi.fn((ns, key) => { const k = `${ns}.${key}`; if ( !registered.has(k) && !store.has(k) ) throw new Error(`Setting ${k} not registered`); return store.get(k); }),
      set: vi.fn(async (ns, key, value) => { store.set(`${ns}.${key}`, value); registered.get(`${ns}.${key}`)?.onChange?.(value); return value; }),
      _store: store, _registered: registered
    },
    i18n: { localize: k => k, format: (k, d) => `${k} ${JSON.stringify(d)}`, has: () => false },
    keybindings: { register: vi.fn() },
    actors: { contents: [], get: () => undefined, filter: () => [], getName: () => undefined },
    items: { contents: [], filter: () => [] },
    scenes: { contents: [], active: null, filter: () => [], get: () => undefined },
    macros: { contents: [], get: () => undefined, filter: () => [], find: () => undefined },
    combat: null,
    ready: true
  };
  return game;
}

export function installFoundryGlobals(options={}) {
  const game = createMockGame(options);
  globalThis.game = game;
  globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
  globalThis.Hooks = { on: vi.fn(() => 1), once: vi.fn(() => 1), off: vi.fn(), call: vi.fn(() => true), callAll: vi.fn(), events: {} };
  globalThis.CONST = { USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 }, USER_ROLE_NAMES: { 0: "NONE", 1: "PLAYER", 2: "TRUSTED", 3: "ASSISTANT", 4: "GAMEMASTER" } };
  globalThis.foundry = {
    utils: {
      isNewerVersion: (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for ( let i = 0; i < Math.max(x.length, y.length); i++ ) { if ( (x[i] ?? 0) !== (y[i] ?? 0) ) return (x[i] ?? 0) > (y[i] ?? 0); } return false; },
      deepClone: v => JSON.parse(JSON.stringify(v)), randomID: () => Math.random().toString(36).slice(2, 18), escapeHTML: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
      saveDataToFile: vi.fn(), AsyncFunction: Object.getPrototypeOf(async function() {}).constructor
    },
    applications: { api: { DialogV2: { confirm: vi.fn(async () => true), prompt: vi.fn(async () => "ok"), input: vi.fn(async () => ({})), wait: vi.fn(async () => null) } } }
  };
  globalThis.Macro = { canUserCreate: u => Boolean(u), create: vi.fn(async data => ({ id: "newmacro", ...data, update: vi.fn(async d => ({ ...data, ...d })) })), implementation: null };
  globalThis.Macro.implementation = globalThis.Macro;
  globalThis.ChatMessage = { create: vi.fn(async d => d), getSpeaker: () => ({ alias: "GM" }) };
  return game;
}

installFoundryGlobals();
