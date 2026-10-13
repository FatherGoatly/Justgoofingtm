/**
 * Minimal Foundry VTT runtime mock for unit tests. Models the subset of the V14 API the module relies on.
 * This is a mock: real-environment compatibility is verified separately (see COMPATIBILITY.md).
 */
import { beforeEach } from "vitest";

const OWNERSHIP = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };

function randomID(length=16) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for ( let i = 0; i < length; i++ ) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getProperty(obj, path) {
  return path.split(".").reduce((o, k) => (o && (typeof o === "object")) ? o[k] : undefined, obj);
}

function setProperty(obj, path, value) {
  const parts = path.split(".");
  let target = obj;
  for ( let i = 0; i < parts.length - 1; i++ ) {
    if ( !target[parts[i]] || (typeof target[parts[i]] !== "object") ) target[parts[i]] = {};
    target = target[parts[i]];
  }
  target[parts.at(-1)] = value;
  return true;
}

function expandObject(flat) {
  const out = {};
  for ( const [k, v] of Object.entries(flat) ) setProperty(out, k, v);
  return out;
}

function mergeObject(original, other={}, { inplace=true }={}) {
  const target = inplace ? original : deepClone(original);
  for ( const [k, v] of Object.entries(other) ) {
    if ( v && (typeof v === "object") && !Array.isArray(v) && target[k] && (typeof target[k] === "object") ) {
      mergeObject(target[k], v);
    } else target[k] = v;
  }
  return target;
}

function isNewerVersion(v1, v0) {
  const a = String(v1).split(".").map(Number), b = String(v0).split(".").map(Number);
  for ( let i = 0; i < Math.max(a.length, b.length); i++ ) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if ( x > y ) return true;
    if ( x < y ) return false;
  }
  return false;
}

/** Apply a Foundry-style differential update ({"a.b.c": v, "a.-=b": null}) to a plain object. */
export function applyUpdate(obj, changes) {
  for ( const [key, value] of Object.entries(changes) ) {
    const parts = key.split(".");
    const last = parts.pop();
    let target = obj;
    for ( const p of parts ) {
      if ( !target[p] || (typeof target[p] !== "object") ) target[p] = {};
      target = target[p];
    }
    if ( last.startsWith("-=") ) delete target[last.slice(2)];
    else target[last] = deepClone(value);
  }
}

export class MockUser {
  constructor({ id=randomID(8), name="User", isGM=false, active=true, character=null }={}) {
    Object.assign(this, { id, name, isGM, active, character, targets: new Set() });
  }
}

export class MockActor {
  constructor({ id=randomID(16), name="Actor", type="character", ownership={}, flags={}, img="" }={}) {
    Object.assign(this, { id, name, type, ownership, flags: deepClone(flags), img, documentName: "Actor" });
    this.updates = [];
    this.failNextUpdate = false;
    this.items = new Map();
    this.effects = new Map();
    this.statuses = new Set();
    this.system = { attributes: { hp: { value: 10, max: 10, temp: 0 } } };
  }

  get uuid() { return `Actor.${this.id}`; }

  get isOwner() { return this.testUserPermission(globalThis.game.user, OWNERSHIP.OWNER); }

  testUserPermission(user, level) {
    if ( !user ) return false;
    if ( user.isGM ) return true;
    const numeric = typeof level === "string" ? OWNERSHIP[level] : level;
    const own = this.ownership[user.id] ?? this.ownership.default ?? 0;
    return own >= numeric;
  }

  getFlag(scope, key) {
    return getProperty(this.flags, `${scope}.${key}`);
  }

  async update(changes) {
    if ( this.failNextUpdate ) {
      this.failNextUpdate = false;
      throw new Error("Simulated update failure");
    }
    this.updates.push(deepClone(changes));
    // Simulate database latency so concurrent callers interleave.
    await new Promise(r => setTimeout(r, 1));
    applyUpdate(this, changes);
    globalThis.Hooks.callAll("updateActor", this, changes, {}, globalThis.game.user.id);
    return this;
  }

  getRollData() { return {}; }
  getActiveTokens() { return []; }
  async applyDamage(damages) { this.appliedDamage = (this.appliedDamage ?? []).concat(damages); return this; }
  async applyTempHP(amount) { this.system.attributes.hp.temp = Math.max(this.system.attributes.hp.temp, amount); return this; }
  async toggleStatusEffect(id, { active }={}) {
    if ( active === false ) { this.statuses.delete(id); return false; }
    this.statuses.add(id);
    return { update: async () => {} };
  }
}

export class MockMessage {
  constructor({ id=randomID(16), author, speaker={}, rolls=[], type="base", system={}, flags={} }={}) {
    Object.assign(this, { id, author, speaker, rolls, type, system, flags, documentName: "ChatMessage" });
  }

  getAssociatedActor() {
    const scene = this.speaker.scene ? globalThis.game.scenes.get(this.speaker.scene) : null;
    const token = scene?.tokens?.get(this.speaker.token);
    return token?.actor ?? globalThis.game.actors.get(this.speaker.actor) ?? null;
  }
}

class HooksRegistry {
  constructor() { this.events = new Map(); this.nextId = 1; }
  on(name, fn) {
    const id = this.nextId++;
    if ( !this.events.has(name) ) this.events.set(name, []);
    this.events.get(name).push({ id, fn });
    return id;
  }
  once(name, fn) { return this.on(name, fn); }
  off(name, id) {
    const list = this.events.get(name) ?? [];
    this.events.set(name, list.filter(h => h.id !== id));
  }
  callAll(name, ...args) {
    for ( const { fn } of [...(this.events.get(name) ?? [])] ) fn(...args);
    return true;
  }
  call(name, ...args) {
    for ( const { fn } of [...(this.events.get(name) ?? [])] ) if ( fn(...args) === false ) return false;
    return true;
  }
  reset() { this.events.clear(); }
}

class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
  get contents() { return Array.from(this.values()); }
  filter(fn) { return this.contents.filter(fn); }
  find(fn) { return this.contents.find(fn); }
  map(fn) { return this.contents.map(fn); }
}

class UsersCollection extends Collection {
  get activeGM() { return this.contents.find(u => u.isGM && u.active) ?? null; }
}

class SettingsStore {
  constructor() { this.settings = new Map(); this.values = new Map(); this.menus = new Map(); }
  register(scope, key, data) { this.settings.set(`${scope}.${key}`, data); }
  registerMenu(scope, key, data) { this.menus.set(`${scope}.${key}`, data); }
  get(scope, key) {
    const id = `${scope}.${key}`;
    if ( this.values.has(id) ) return this.values.get(id);
    const def = this.settings.get(id);
    if ( !def ) throw new Error(`Setting ${id} not registered`);
    return def.default;
  }
  async set(scope, key, value) { this.values.set(`${scope}.${key}`, value); return value; }
}

export const created = { messages: [], notifications: [], sockets: [], templates: [] };

export function installFoundryMock() {
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: OWNERSHIP, DICE_ROLL_MODES: { PUBLIC: "publicroll", BLIND: "blindroll" } };
  globalThis.foundry = {
    utils: { randomID, deepClone, getProperty, setProperty, expandObject, mergeObject, isNewerVersion,
      escapeHTML: s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])) },
    applications: {
      handlebars: {
        renderTemplate: async (path, data) => { created.templates.push({ path, data }); return `<template path="${path}"></template>`; },
        loadTemplates: async () => {}
      },
      api: {
        DialogV2: { confirm: async () => true, wait: async () => null, prompt: async () => null },
        ApplicationV2: class {},
        HandlebarsApplicationMixin: Base => Base
      },
      ux: {}
    }
  };
  globalThis.Hooks = new HooksRegistry();
  globalThis.CONFIG = {
    statusEffects: [{ id: "prone", name: "Prone" }, { id: "frightened", name: "Frightened" }, { id: "stunned", name: "Stunned" }],
    DND5E: {
      damageTypes: { fire: { label: "Fire" }, slashing: { label: "Slashing" }, radiant: { label: "Radiant" } },
      skills: { acr: { label: "Acrobatics" }, ath: { label: "Athletics" } },
      abilities: { str: { label: "Strength" }, dex: { label: "Dexterity" }, con: { label: "Constitution" }, int: { label: "Intelligence" }, wis: { label: "Wisdom" }, cha: { label: "Charisma" } }
    },
    Dice: { BasicRoll: { getMessageMode: () => game.settings.get("core", "messageMode") } }
  };
  globalThis.ui = {
    notifications: {
      info: m => created.notifications.push({ level: "info", m }),
      warn: m => created.notifications.push({ level: "warn", m }),
      error: m => created.notifications.push({ level: "error", m })
    }
  };
  globalThis.ChatMessage = class {
    static getSpeaker({ actor }={}) { return { actor: actor?.id ?? null, alias: actor?.name ?? null }; }
    static applyMode(data, mode) {
      if ( mode === "gm" ) data.whisper = game.users.filter(u => u.isGM).map(u => u.id);
      if ( mode === "blind" ) { data.whisper = game.users.filter(u => u.isGM).map(u => u.id); data.blind = true; }
      if ( mode === "self" ) data.whisper = [game.user.id];
      if ( mode === "public" ) { data.whisper = []; data.blind = false; }
      return data;
    }
    static async create(data, options={}) {
      if ( options.messageMode ) this.applyMode(data, options.messageMode);
      created.messages.push(data);
      return new MockMessage({ ...data, author: game.user });
    }
  };
  globalThis.getDocumentClass = () => globalThis.ChatMessage;
  globalThis.Roll = class {
    constructor(formula, data={}) { this.formula = formula; this.data = data; this.total = 0; }
    static validate(formula) { return /^[0-9d+\-*/()\s.@a-zA-Z]+$/.test(String(formula)); }
    async evaluate() { this.total = 7; this._evaluated = true; return this; }
  };
  globalThis.canvas = { tokens: { controlled: [] }, scene: null };
  globalThis.fromUuid = async uuid => game.actors.get(String(uuid).replace("Actor.", "")) ?? null;
  globalThis.fromUuidSync = uuid => game.actors.get(String(uuid).replace("Actor.", "")) ?? null;
  globalThis.Handlebars = { helpers: {}, registerHelper(n, f) { this.helpers[n] = f; } };

  const settings = new SettingsStore();
  const users = new UsersCollection();
  const gm = new MockUser({ id: "gm", name: "Gamemaster", isGM: true });
  const player = new MockUser({ id: "p1", name: "Player One" });
  const other = new MockUser({ id: "p2", name: "Player Two" });
  for ( const u of [gm, player, other] ) users.set(u.id, u);
  globalThis.game = {
    settings, users, user: player,
    actors: new Collection(), messages: new Collection(), scenes: new Collection(),
    combat: null,
    system: { id: "dnd5e", version: "6.0.6" },
    modules: new Map([["heroic-villainous-actions", { active: true, api: null }], ["midi-qol", { active: false }]]),
    socket: { emit: (name, data) => created.sockets.push({ name, data }), on: () => {} },
    keybindings: { register() {} },
    i18n: {
      localize: key => key,
      format: (key, data={}) => `${key}:${Object.entries(data).map(([k, v]) => `${k}=${v}`).join(",")}`
    }
  };
  settings.register("core", "messageMode", { default: "public" });
  created.messages.length = 0;
  created.notifications.length = 0;
  created.sockets.length = 0;
  created.templates.length = 0;
  return { gm, player, other };
}

/** Convenience: make a player-owned character actor registered in the world. */
export function makeActor(overrides={}) {
  const actor = new MockActor({ name: "Hero", type: "character", ownership: { p1: 3 }, ...overrides });
  globalThis.game.actors.set(actor.id, actor);
  return actor;
}

export function setUser(id) {
  globalThis.game.user = globalThis.game.users.get(id);
  return globalThis.game.user;
}

export const mockState = {};
beforeEach(() => {
  Object.assign(mockState, installFoundryMock());
});
