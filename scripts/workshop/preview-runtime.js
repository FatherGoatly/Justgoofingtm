/**
 * The Foundry emulator used by "Foundry Preview" (dry run). It builds a small, emulated Foundry API from a
 * read-only JSON snapshot of the real world. Learner code runs against it inside a Web Worker: nothing here can
 * touch the real game. Writes (update/create/delete) are applied to the emulated copies and recorded so the
 * workshop can show "what would have happened".
 *
 * The emulation covers the APIs the curriculum teaches (see docs/architecture.md#foundry-emulator for the
 * documented subset). Anything else throws a clear "not emulated" error rather than pretending to work.
 */
import { evaluateFormula, validateFormula } from "./dice.js";

const NOT_EMULATED = name => new Error(`${name} is not part of the Foundry Preview emulation. It may work in Live execution; the emulator only covers the documented subset (see the Workshop help panel).`);

/* ------------------------------------------------------------------------------------------------------------ */
/* Utilities (subset of foundry.utils)                                                                          */
/* ------------------------------------------------------------------------------------------------------------ */

export function deepClone(v) {
  if ( v === null || typeof v !== "object" ) return v;
  if ( Array.isArray(v) ) return v.map(deepClone);
  if ( v instanceof Set ) return new Set([...v].map(deepClone));
  if ( v instanceof Map ) return new Map([...v].map(([k, x]) => [k, deepClone(x)]));
  const out = {};
  for ( const [k, x] of Object.entries(v) ) out[k] = deepClone(x);
  return out;
}

export function getProperty(obj, path) {
  if ( !path ) return undefined;
  return String(path).split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

export function setProperty(obj, path, value) {
  const keys = String(path).split(".");
  let o = obj;
  for ( let i = 0; i < keys.length - 1; i++ ) {
    if ( o[keys[i]] === null || typeof o[keys[i]] !== "object" ) o[keys[i]] = {};
    o = o[keys[i]];
  }
  const changed = o[keys.at(-1)] !== value;
  o[keys.at(-1)] = value;
  return changed;
}

export function hasProperty(obj, path) { return getProperty(obj, path) !== undefined; }

export function expandObject(obj) {
  const out = {};
  for ( const [k, v] of Object.entries(obj ?? {}) ) {
    const value = (v !== null && typeof v === "object" && !Array.isArray(v)) ? expandObject(v) : v;
    if ( k.includes(".") ) setProperty(out, k, value);
    else if ( out[k] !== null && typeof out[k] === "object" && value !== null && typeof value === "object" && !Array.isArray(value) ) out[k] = mergeObject(out[k], value);
    else out[k] = value;
  }
  return out;
}

export function flattenObject(obj, prefix="", out={}) {
  for ( const [k, v] of Object.entries(obj ?? {}) ) {
    const key = prefix ? `${prefix}.${k}` : k;
    if ( v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length ) flattenObject(v, key, out);
    else out[key] = v;
  }
  return out;
}

export function mergeObject(original, other={}, { inplace=true, overwrite=true, insertKeys=true, insertValues=true }={}) {
  const target = inplace ? original : deepClone(original);
  const source = expandObject(other);
  for ( const [k, v] of Object.entries(source) ) {
    const exists = k in target;
    if ( v !== null && typeof v === "object" && !Array.isArray(v) && target[k] !== null && typeof target[k] === "object" && !Array.isArray(target[k]) ) {
      mergeObject(target[k], v, { inplace: true, overwrite, insertKeys: insertValues, insertValues });
    } else if ( exists ? overwrite : insertKeys ) target[k] = Array.isArray(v) ? deepClone(v) : v;
  }
  return target;
}

export function isEmpty(v) {
  if ( v === null || v === undefined ) return true;
  if ( typeof v === "string" || Array.isArray(v) ) return v.length === 0;
  if ( v instanceof Set || v instanceof Map ) return v.size === 0;
  if ( typeof v === "object" ) return Object.keys(v).length === 0;
  return false;
}

export function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); }

export function randomID(length=16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for ( let i = 0; i < length; i++ ) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function isNewerVersion(v1, v0) {
  const a = String(v1).split(".").map(n => parseInt(n, 10) || 0);
  const b = String(v0).split(".").map(n => parseInt(n, 10) || 0);
  for ( let i = 0; i < Math.max(a.length, b.length); i++ ) { const x = a[i] ?? 0, y = b[i] ?? 0; if ( x !== y ) return x > y; }
  return false;
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Collections                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------ */

/** A Map subclass mimicking Foundry's Collection: iteration yields values and array helpers exist. */
export class Collection extends Map {
  constructor(entries=[]) { super(); for ( const e of entries ) this.set(e.id, e); }
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
  getName(name, { strict=false }={}) { const v = this.contents.find(d => d.name === name); if ( !v && strict ) throw new Error(`No document with name "${name}"`); return v; }
  filter(fn) { return this.contents.filter(fn); }
  find(fn) { return this.contents.find(fn); }
  map(fn) { return this.contents.map(fn); }
  some(fn) { return this.contents.some(fn); }
  every(fn) { return this.contents.every(fn); }
  reduce(fn, init) { return this.contents.reduce(fn, init); }
  forEach(fn) { for ( const v of this.contents ) fn(v); }
  toJSON() { return this.contents.map(d => d.toObject?.() ?? d); }
  get(key, { strict=false }={}) { const v = super.get(key); if ( v === undefined && strict ) throw new Error(`No document with id "${key}"`); return v; }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Emulated documents                                                                                           */
/* ------------------------------------------------------------------------------------------------------------ */

class EmulatedDocument {
  /**
   * @param {string} documentName
   * @param {object} data
   * @param {PreviewRuntime} rt
   * @param {EmulatedDocument|null} parent
   */
  constructor(documentName, data, rt, parent=null) {
    Object.defineProperty(this, "_rt", { value: rt, enumerable: false });
    Object.defineProperty(this, "documentName", { value: documentName, enumerable: false });
    Object.defineProperty(this, "parent", { value: parent, enumerable: false });
    this._source = data;
    this.id = data.id;
    this.name = data.name ?? "";
    this.img = data.img;
    this.type = data.type;
    this.flags = data.flags ?? {};
    this.system = data.system ?? {};
    this.ownership = data.ownership ?? { default: 0 };
  }
  get _id() { return this.id; }
  get uuid() { return this._source.uuid ?? (this.parent ? `${this.parent.uuid}.${this.documentName}.${this.id}` : `${this.documentName}.${this.id}`); }
  get isOwner() { return this._rt.snapshot.user.isGM || this._source.isOwner !== false; }
  get isEmbedded() { return Boolean(this.parent); }
  get sheet() { return { render: () => this._rt.record("sheets", { uuid: this.uuid, name: this.name }), close: () => {} }; }
  get documentClass() { return this.constructor; }
  get collectionName() { return `${this.documentName.toLowerCase()}s`; }
  testUserPermission(user, permission) {
    if ( user?.isGM ) return true;
    const levels = { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 };
    const want = typeof permission === "number" ? permission : (levels[permission] ?? 0);
    const level = this.ownership?.[user?.id] ?? this.ownership?.default ?? 0;
    const effective = this._source.isOwner === false ? Math.min(level, 2) : Math.max(level, 3);
    return effective >= want;
  }
  canUserModify(user, action="update") { return this.testUserPermission(user, "OWNER") && action !== "delete" || user?.isGM; }
  getFlag(scope, key) { return getProperty(this.flags, `${scope}.${key}`); }
  async setFlag(scope, key, value) { return this.update({ [`flags.${scope}.${key}`]: value }); }
  async unsetFlag(scope, key) {
    // Foundry expresses deletion with the "-=" key prefix; the emulator applies it directly and records the same change.
    this._rt.assertWritable(this);
    if ( this.flags[scope] ) delete this.flags[scope][key];
    this._rt.record("updates", { uuid: this.uuid, name: this.name, documentName: this.documentName, data: { [`flags.${scope}.-=${key}`]: null } });
    return this;
  }
  toObject() { return deepClone({ _id: this.id, name: this.name, img: this.img, type: this.type, flags: this.flags, system: this.system, ownership: this.ownership }); }
  toJSON() { return this.toObject(); }
  async update(changes={}, options={}) {
    this._rt.assertWritable(this);
    // Document hooks fire as in Foundry: preUpdate<Document> may veto by returning false; update<Document> fires afterwards.
    const userId = this._rt.snapshot.user?.id;
    const Hooks = this._rt.globals?.Hooks;
    // Hooks receive the change delta in expanded form ({ system: { attributes: ... } }), as Foundry passes it.
    const expanded = expandObject(deepClone(changes));
    if ( Hooks && Hooks.call(`preUpdate${this.documentName}`, this, expanded, options, userId) === false ) {
      this._rt.record("warnings", { type: "hook", message: `preUpdate${this.documentName} hook cancelled an update to ${this.name}.` });
      return this;
    }
    // In Foundry the change is applied after a server round-trip; yielding here means code that forgets to await
    // sees stale data in the emulator too, instead of being taught that updates are instantaneous.
    await Promise.resolve();
    if ( "name" in expanded ) this.name = expanded.name;
    if ( "img" in expanded ) this.img = expanded.img;
    if ( expanded.system ) mergeObject(this.system, expanded.system);
    if ( expanded.flags ) mergeObject(this.flags, expanded.flags);
    if ( expanded.ownership ) mergeObject(this.ownership, expanded.ownership);
    this._applyExtra(expanded);
    this._rt.record("updates", { uuid: this.uuid, name: this.name, documentName: this.documentName, data: deepClone(changes) });
    Hooks?.callAll(`update${this.documentName}`, this, expanded, options, userId);
    return this;
  }
  _applyExtra(_expanded) {}
  async delete(options={}) {
    this._rt.assertWritable(this, "delete");
    const userId = this._rt.snapshot.user?.id;
    const Hooks = this._rt.globals?.Hooks;
    if ( Hooks && Hooks.call(`preDelete${this.documentName}`, this, options, userId) === false ) {
      this._rt.record("warnings", { type: "hook", message: `preDelete${this.documentName} hook cancelled deleting ${this.name}.` });
      return this;
    }
    this._rt.record("deletes", { uuid: this.uuid, name: this.name, documentName: this.documentName });
    const coll = this._rt.collectionFor(this);
    coll?.delete(this.id);
    Hooks?.callAll(`delete${this.documentName}`, this, options, userId);
    return this;
  }
}

class EmulatedItem extends EmulatedDocument {
  constructor(data, rt, parent) { super("Item", data, rt, parent); }
  get actor() { return this.parent; }
  get hasDamage() { return Boolean(this.system?.damage); }
  async use(config={}, _dialog={}, _message={}) {
    this._rt.record("uses", { uuid: this.uuid, name: this.name, actor: this.parent?.name ?? null, config: deepClone(config) });
    const content = `${this.parent ? `${this.parent.name} uses ` : "Uses "}${this.name}`;
    const message = await this._rt.globals.ChatMessage.create({ content: `<div class="item-card">${escapeHTML(content)}</div>`, speaker: this.parent ? { actor: this.parent.id, alias: this.parent.name } : {} });
    return { message, effects: [], templates: [], updates: {} };
  }
  async roll(...args) { return this.use(...args); }
  async displayCard() { return this._rt.globals.ChatMessage.create({ content: `<div class="item-card">${escapeHTML(this.name)}</div>` }); }
}

class EmulatedActiveEffect extends EmulatedDocument {
  constructor(data, rt, parent) { super("ActiveEffect", data, rt, parent); this.disabled = data.disabled ?? false; this.statuses = new Set(data.statuses ?? []); this.duration = data.duration ?? {}; this.changes = data.changes ?? []; }
  get active() { return !this.disabled; }
  _applyExtra(e) { if ( "disabled" in e ) this.disabled = e.disabled; }
}

class EmulatedActor extends EmulatedDocument {
  constructor(data, rt) {
    super("Actor", data, rt);
    this.items = new Collection((data.items ?? []).map(i => new EmulatedItem(i, rt, this)));
    this.effects = new Collection((data.effects ?? []).map(e => new EmulatedActiveEffect(e, rt, this)));
    this.statuses = new Set(data.statuses ?? []);
    this.prototypeToken = data.prototypeToken ?? { name: data.name, actorLink: data.type === "character" };
  }
  get isToken() { return false; }
  get token() { return null; }
  get uuid() { return super.uuid; }
  get itemTypes() {
    const out = {};
    for ( const i of this.items ) (out[i.type] ??= []).push(i);
    return out;
  }
  getRollData() { return deepClone(this.system); }
  getActiveTokens(_linked=false, document=false) {
    const docs = this._rt.sceneTokens().filter(t => t.actorId === this.id);
    return document ? docs : docs.map(t => t.object);
  }
  get appliedEffects() { return this.effects.filter(e => !e.disabled); }
  get allApplicableEffects() { return this.effects.contents; }
  async createEmbeddedDocuments(embeddedName, data=[]) {
    this._rt.assertWritable(this);
    const created = [];
    for ( const d of data ) {
      const id = d._id ?? randomID();
      const doc = embeddedName === "Item" ? new EmulatedItem({ ...d, id }, this._rt, this) : new EmulatedActiveEffect({ ...d, id }, this._rt, this);
      (embeddedName === "Item" ? this.items : this.effects).set(id, doc);
      created.push(doc);
      this._rt.record("creates", { documentName: embeddedName, parent: this.name, data: deepClone(d) });
      this._rt.globals?.Hooks?.callAll(`create${embeddedName}`, doc, {}, this._rt.snapshot.user?.id);
    }
    return created;
  }
  async updateEmbeddedDocuments(embeddedName, updates=[]) {
    const coll = embeddedName === "Item" ? this.items : this.effects;
    const out = [];
    for ( const u of updates ) { const doc = coll.get(u._id); if ( !doc ) throw new Error(`No ${embeddedName} with id ${u._id}`); const { _id, ...rest } = u; await doc.update(rest); out.push(doc); }
    return out;
  }
  async deleteEmbeddedDocuments(embeddedName, ids=[]) {
    const coll = embeddedName === "Item" ? this.items : this.effects;
    const out = [];
    for ( const id of ids ) { const doc = coll.get(id); if ( doc ) { await doc.delete(); out.push(doc); } }
    return out;
  }
  async toggleStatusEffect(statusId, { active }={}) {
    this._rt.assertWritable(this);
    const has = this.statuses.has(statusId);
    const makeActive = active ?? !has;
    if ( makeActive === has ) return undefined;
    if ( makeActive ) {
      this.statuses.add(statusId);
      const [effect] = await this.createEmbeddedDocuments("ActiveEffect", [{ name: statusId.charAt(0).toUpperCase() + statusId.slice(1), statuses: [statusId], img: `icons/svg/${statusId}.svg` }]);
      return effect;
    }
    this.statuses.delete(statusId);
    const existing = this.effects.find(e => e.statuses.has(statusId));
    if ( existing ) await existing.delete();
    return false;
  }
  /* dnd5e-style helpers, available only when the snapshot system is dnd5e */
  async applyDamage(damages, options={}) {
    this._rt.assertSystem("dnd5e", "Actor#applyDamage");
    const hp = this.system?.attributes?.hp;
    if ( !hp ) return this;
    let amount = typeof damages === "number" ? damages : (damages ?? []).reduce((s, d) => s + (d.value ?? 0) * (d.type === "healing" && options.invertHealing !== false ? -1 : 1), 0);
    amount = amount * (options.multiplier ?? 1);
    const temp = hp.temp ?? 0;
    const deltaTemp = amount > 0 ? Math.min(temp, amount) : 0;
    const remaining = amount - deltaTemp;
    const newValue = Math.max(0, Math.min(hp.max ?? Infinity, (hp.value ?? 0) - remaining));
    await this.update({ "system.attributes.hp.temp": temp - deltaTemp, "system.attributes.hp.value": newValue });
    this._rt.record("mechanics", { type: "applyDamage", actor: this.name, amount });
    return this;
  }
  async applyTempHP(amount=0) {
    this._rt.assertSystem("dnd5e", "Actor#applyTempHP");
    const current = this.system?.attributes?.hp?.temp ?? 0;
    if ( amount > current ) await this.update({ "system.attributes.hp.temp": amount });
    return this;
  }
  async #rollD20(kind, config={}, dialog={}, message={}) {
    this._rt.assertSystem("dnd5e", `Actor#${kind}`);
    const abilityKey = config.ability ?? (config.skill ? this.system?.skills?.[config.skill]?.ability : undefined);
    let mod = 0;
    let label = kind;
    if ( kind === "rollSkill" ) { mod = this.system?.skills?.[config.skill]?.total ?? 0; label = `${config.skill} skill check`; }
    else if ( kind === "rollSavingThrow" ) { mod = this.system?.abilities?.[abilityKey]?.save?.value ?? this.system?.abilities?.[abilityKey]?.mod ?? 0; label = `${abilityKey} saving throw`; }
    else { mod = this.system?.abilities?.[abilityKey]?.mod ?? 0; label = `${abilityKey} ability check`; }
    const adv = config.advantage ? "2d20kh" : (config.disadvantage ? "2d20kl" : "1d20");
    const roll = new this._rt.globals.Roll(`${adv} + ${mod}`);
    await roll.evaluate();
    roll.options = { target: config.target };
    this._rt.record("mechanics", { type: kind, actor: this.name, label, total: roll.total, config: deepClone(config), dialog: dialog.configure !== false });
    if ( message.create !== false ) await roll.toMessage({ flavor: `${this.name}: ${label}`, speaker: { actor: this.id, alias: this.name } });
    return [roll];
  }
  async rollAbilityCheck(config={}, dialog={}, message={}) { return this.#rollD20("rollAbilityCheck", config, dialog, message); }
  async rollSavingThrow(config={}, dialog={}, message={}) { return this.#rollD20("rollSavingThrow", config, dialog, message); }
  async rollSkill(config={}, dialog={}, message={}) { return this.#rollD20("rollSkill", config, dialog, message); }
  async rollInitiative({ createCombatants=false, rerollInitiative=false }={}) {
    const combat = this._rt.globals.game.combat;
    if ( !combat ) throw new Error("No active combat: create a combat encounter first.");
    const combatants = combat.combatants.filter(c => c.actorId === this.id);
    if ( !combatants.length && createCombatants ) { for ( const t of this.getActiveTokens(false, true) ) await combat.createEmbeddedDocuments("Combatant", [{ tokenId: t.id, actorId: this.id, name: t.name }]); }
    const ids = combat.combatants.filter(c => c.actorId === this.id && (rerollInitiative || c.initiative === null)).map(c => c.id);
    return combat.rollInitiative(ids);
  }
}

class EmulatedTokenDocument extends EmulatedDocument {
  constructor(data, rt, scene) {
    super("Token", data, rt, scene);
    Object.assign(this, { x: data.x, y: data.y, width: data.width ?? 1, height: data.height ?? 1, disposition: data.disposition ?? 0, hidden: Boolean(data.hidden), elevation: data.elevation ?? 0, actorId: data.actorId, actorLink: Boolean(data.actorLink) });
    this._controlled = Boolean(data.controlled);
    this._targeted = Boolean(data.targeted);
    Object.defineProperty(this, "object", { value: new EmulatedToken(this, rt), enumerable: false });
  }
  get actor() {
    if ( !this.actorLink && this._source.syntheticActor ) {
      if ( !this._synthetic ) {
        const synth = new EmulatedActor(this._source.syntheticActor, this._rt);
        Object.defineProperty(synth, "isToken", { value: true });
        Object.defineProperty(synth, "token", { value: this });
        Object.defineProperty(synth, "uuid", { get: () => `${this.uuid}.Actor.${synth.id}` });
        Object.defineProperty(this, "_synthetic", { value: synth, enumerable: false });
      }
      return this._synthetic;
    }
    return this._rt.globals.game.actors.get(this.actorId) ?? null;
  }
  get baseActor() { return this._rt.globals.game.actors.get(this.actorId) ?? null; }
  get combatant() { return this._rt.globals.game.combat?.combatants.find(c => c.tokenId === this.id) ?? null; }
  get inCombat() { return Boolean(this.combatant); }
  get isOwner() { return this.actor ? this.actor.isOwner : this._rt.snapshot.user.isGM; }
  _applyExtra(e) { for ( const k of ["x", "y", "hidden", "elevation", "disposition", "width", "height"] ) if ( k in e ) this[k] = e[k]; }
  getBarAttribute(bar="bar1") {
    const path = bar === "bar1" ? "attributes.hp" : null;
    const hp = path ? getProperty(this.actor?.system, path) : null;
    return hp ? { type: "bar", attribute: path, value: hp.value, max: hp.max } : null;
  }
  async toggleActiveEffect(effectData, { active }={}) { return this.actor?.toggleStatusEffect(effectData.id ?? effectData, { active }); }
  toObject() { return deepClone({ _id: this.id, name: this.name, x: this.x, y: this.y, width: this.width, height: this.height, hidden: this.hidden, disposition: this.disposition, elevation: this.elevation, actorId: this.actorId, actorLink: this.actorLink, flags: this.flags }); }
}

class EmulatedToken {
  constructor(document, rt) { this.document = document; Object.defineProperty(this, "_rt", { value: rt, enumerable: false }); }
  get id() { return this.document.id; }
  get name() { return this.document.name; }
  get actor() { return this.document.actor; }
  get x() { return this.document.x; }
  get y() { return this.document.y; }
  get w() { return this.document.width * this._rt.snapshot.scene.grid.size; }
  get h() { return this.document.height * this._rt.snapshot.scene.grid.size; }
  get center() { return { x: this.x + this.w / 2, y: this.y + this.h / 2 }; }
  get controlled() { return this.document._controlled; }
  get isTargeted() { return this.document._targeted; }
  get isOwner() { return this.document.isOwner; }
  get visible() { return !this.document.hidden || this._rt.snapshot.user.isGM; }
  get combatant() { return this.document.combatant; }
  get inCombat() { return this.document.inCombat; }
  get scene() { return this.document.parent; }
  get bounds() { return { x: this.x, y: this.y, width: this.w, height: this.h }; }
  control({ releaseOthers=true }={}) { if ( releaseOthers ) for ( const t of this._rt.sceneTokens() ) t._controlled = false; this.document._controlled = true; return true; }
  release() { this.document._controlled = false; return true; }
  setTarget(targeted=true, { releaseOthers=true }={}) { if ( releaseOthers ) for ( const t of this._rt.sceneTokens() ) t._targeted = false; this.document._targeted = targeted; }
  toggleCombat() { return this._rt.globals.game.combat?.createEmbeddedDocuments("Combatant", [{ tokenId: this.id, actorId: this.actor?.id, name: this.name }]); }
  get distance() { throw NOT_EMULATED("Token#distance"); }
}

class EmulatedCombatant extends EmulatedDocument {
  constructor(data, rt, combat) { super("Combatant", data, rt, combat); this.tokenId = data.tokenId; this.actorId = data.actorId; this.initiative = data.initiative ?? null; this.defeated = Boolean(data.defeated); this.hidden = Boolean(data.hidden); }
  get actor() { return this._rt.globals.game.actors.get(this.actorId) ?? null; }
  get token() { return this._rt.globals.game.scenes.active?.tokens.get(this.tokenId) ?? null; }
  get isDefeated() { return this.defeated; }
  get isOwner() { return this.actor?.isOwner ?? this._rt.snapshot.user.isGM; }
  get isNPC() { return !this.actor || this.actor.type !== "character"; }
  get combat() { return this.parent; }
  _applyExtra(e) { if ( "initiative" in e ) this.initiative = e.initiative; if ( "defeated" in e ) this.defeated = e.defeated; }
  getInitiativeRoll() { const dex = this.actor?.system?.abilities?.dex?.mod ?? 0; return new this._rt.globals.Roll(`1d20 + ${dex}`); }
}

class EmulatedCombat extends EmulatedDocument {
  constructor(data, rt) {
    super("Combat", data, rt);
    this.round = data.round ?? 0;
    this.turn = data.turn ?? null;
    this.started = Boolean(data.started);
    this.active = true;
    this.combatants = new Collection((data.combatants ?? []).map(c => new EmulatedCombatant(c, rt, this)));
    this.scene = rt.snapshot.scene?.id ?? null;
  }
  get turns() { return this.combatants.contents.slice().sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity) || a.name.localeCompare(b.name)); }
  get combatant() { return this.turn === null ? null : (this.turns[this.turn] ?? null); }
  get current() { const c = this.combatant; return { round: this.round, turn: this.turn, combatantId: c?.id ?? null, tokenId: c?.tokenId ?? null }; }
  get nextCombatant() { return this.turns[(this.turn ?? -1) + 1] ?? this.turns[0] ?? null; }
  get isActive() { return true; }
  _applyExtra(e) { if ( "round" in e ) this.round = e.round; if ( "turn" in e ) this.turn = e.turn; }
  async startCombat() { this.started = true; this.round = 1; this.turn = 0; this._rt.record("mechanics", { type: "startCombat" }); return this; }
  async nextTurn() { const n = (this.turn ?? -1) + 1; if ( n >= this.turns.length ) return this.nextRound(); this.turn = n; this._rt.record("mechanics", { type: "nextTurn", round: this.round, turn: this.turn }); return this; }
  async previousTurn() { this.turn = Math.max(0, (this.turn ?? 0) - 1); return this; }
  async nextRound() { this.round += 1; this.turn = 0; this._rt.record("mechanics", { type: "nextRound", round: this.round }); return this; }
  async endCombat() { this._rt.record("deletes", { uuid: this.uuid, name: "Combat", documentName: "Combat" }); this._rt.globals.game.combats.delete(this.id); this._rt._combat = null; return this; }
  async rollInitiative(ids, { updateTurn=true, messageOptions={} }={}) {
    ids = Array.isArray(ids) ? ids : [ids];
    for ( const id of ids ) {
      const c = this.combatants.get(id);
      if ( !c ) throw new Error(`No combatant with id ${id}`);
      const roll = c.getInitiativeRoll();
      await roll.evaluate();
      await c.update({ initiative: roll.total });
      await roll.toMessage({ flavor: `${c.name} rolls for Initiative!`, speaker: { alias: c.name }, ...messageOptions });
      this._rt.record("mechanics", { type: "rollInitiative", combatant: c.name, total: roll.total });
    }
    if ( updateTurn && this.turn === null && this.turns.length ) this.turn = 0;
    return this;
  }
  async rollAll(options) { return this.rollInitiative(this.combatants.filter(c => c.initiative === null).map(c => c.id), options); }
  async rollNPC(options) { return this.rollInitiative(this.combatants.filter(c => c.isNPC && c.initiative === null).map(c => c.id), options); }
  async createEmbeddedDocuments(embeddedName, data=[]) {
    if ( embeddedName !== "Combatant" ) throw NOT_EMULATED(`Combat#createEmbeddedDocuments("${embeddedName}")`);
    const out = [];
    for ( const d of data ) { const c = new EmulatedCombatant({ ...d, id: d._id ?? randomID(), name: d.name ?? this._rt.globals.game.scenes.active?.tokens.get(d.tokenId)?.name ?? "Combatant" }, this._rt, this); this.combatants.set(c.id, c); out.push(c); this._rt.record("creates", { documentName: "Combatant", data: deepClone(d) }); }
    return out;
  }
  async setInitiative(id, value) { const c = this.combatants.get(id); if ( c ) await c.update({ initiative: value }); }
  getCombatantByToken(tokenId) { return this.combatants.find(c => c.tokenId === tokenId) ?? null; }
  getCombatantsByActor(actor) { const id = typeof actor === "string" ? actor : actor?.id; return this.combatants.filter(c => c.actorId === id); }
}

class EmulatedScene extends EmulatedDocument {
  constructor(data, rt, tokens=[]) {
    super("Scene", data, rt);
    this.active = Boolean(data.active);
    this.grid = { size: data.grid?.size ?? 100, distance: data.grid?.distance ?? 5, units: data.grid?.units ?? "ft", type: data.grid?.type ?? 1 };
    this.width = data.width ?? 4000; this.height = data.height ?? 3000;
    this.tokens = new Collection(tokens.map(t => new EmulatedTokenDocument(t, rt, this)));
    this.navigation = true;
  }
  get isView() { return this.active; }
  async view() { this._rt.record("navigation", { type: "view", scene: this.name }); return this; }
  async activate() { this._rt.assertWritable(this); this._rt.record("navigation", { type: "activate", scene: this.name }); return this; }
  async createEmbeddedDocuments(embeddedName, data=[]) {
    if ( embeddedName !== "Token" ) throw NOT_EMULATED(`Scene#createEmbeddedDocuments("${embeddedName}")`);
    this._rt.assertWritable(this);
    const out = [];
    for ( const d of data ) { const t = new EmulatedTokenDocument({ ...d, id: d._id ?? randomID(), name: d.name ?? "Token" }, this._rt, this); this.tokens.set(t.id, t); out.push(t); this._rt.record("creates", { documentName: "Token", data: deepClone(d) }); }
    return out;
  }
  async updateEmbeddedDocuments(embeddedName, updates=[]) {
    if ( embeddedName !== "Token" ) throw NOT_EMULATED(`Scene#updateEmbeddedDocuments("${embeddedName}")`);
    const out = [];
    for ( const u of updates ) { const t = this.tokens.get(u._id); if ( !t ) throw new Error(`No Token with id ${u._id}`); const { _id, ...rest } = u; await t.update(rest); out.push(t); }
    return out;
  }
  async deleteEmbeddedDocuments(embeddedName, ids=[]) {
    if ( embeddedName !== "Token" ) throw NOT_EMULATED(`Scene#deleteEmbeddedDocuments("${embeddedName}")`);
    const out = []; for ( const id of ids ) { const t = this.tokens.get(id); if ( t ) { await t.delete(); out.push(t); } } return out;
  }
}

/**
 * Foundry extends Set.prototype with helpers (first, filter, map, find, some, every, reduce). The emulator provides them
 * on the user's target set without touching the global prototype.
 */
class UserTargets extends Set {
  first() { return this.values().next().value; }
  filter(fn) { return [...this].filter(fn); }
  map(fn) { return [...this].map(fn); }
  find(fn) { return [...this].find(fn); }
  some(fn) { return [...this].some(fn); }
  every(fn) { return [...this].every(fn); }
  reduce(fn, init) { return [...this].reduce(fn, init); }
  get ids() { return new Set([...this].map(t => t.id)); }
}

class EmulatedUser extends EmulatedDocument {
  constructor(data, rt) { super("User", data, rt); this.role = data.role ?? 1; this.color = data.color ?? "#ffffff"; this._characterId = data.character ?? null; this.active = true; this.targets = new UserTargets(); }
  get isGM() { return this.role >= 3; }
  get isSelf() { return this.id === this._rt.snapshot.user.id; }
  get character() { return this._characterId ? this._rt.globals.game.actors.get(this._characterId) ?? null : null; }
  hasRole(role, { exact=false }={}) { const roles = { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 }; const n = typeof role === "number" ? role : roles[role]; return exact ? this.role === n : this.role >= n; }
  can(permission) {
    if ( this.isGM ) return true;
    const defaults = { MACRO_SCRIPT: 1, ACTOR_CREATE: 3, ITEM_CREATE: 3, TOKEN_CREATE: 3, TOKEN_DELETE: 3, TOKEN_CONFIGURE: 2, JOURNAL_CREATE: 2, SETTINGS_MODIFY: 3, FILES_UPLOAD: 3, FILES_BROWSE: 2, TEMPLATE_CREATE: 1, DRAWING_CREATE: 2, SHOW_CURSOR: 1, SHOW_RULER: 1, MESSAGE_WHISPER: 1, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 };
    const need = defaults[permission];
    if ( need === undefined ) return false;
    return this.role >= need;
  }
  hasPermission(permission) { return this.can(permission); }
  async query() { throw NOT_EMULATED("User#query"); }
}

class EmulatedChatMessage {
  constructor(data, rt) { this.id = randomID(); this.content = data.content ?? ""; this.speaker = data.speaker ?? {}; this.whisper = data.whisper ?? []; this.flavor = data.flavor ?? ""; this.rolls = data.rolls ?? []; this.flags = data.flags ?? {}; this.style = data.style ?? 0; this.blind = Boolean(data.blind); Object.defineProperty(this, "_rt", { value: rt, enumerable: false }); this.author = rt.snapshot.user.id; this.timestamp = Date.now(); }
  get uuid() { return `ChatMessage.${this.id}`; }
  get isRoll() { return this.rolls.length > 0; }
  get alias() { return this.speaker.alias ?? "Unknown"; }
  async update(changes) { Object.assign(this, expandObject(changes)); this._rt.record("updates", { uuid: this.uuid, name: "ChatMessage", documentName: "ChatMessage", data: deepClone(changes) }); return this; }
  async delete() { this._rt.record("deletes", { uuid: this.uuid, name: "ChatMessage", documentName: "ChatMessage" }); return this; }
  toObject() { return deepClone({ _id: this.id, content: this.content, speaker: this.speaker, whisper: this.whisper, flavor: this.flavor, flags: this.flags }); }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Runtime                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------ */

export class PreviewRuntime {
  /**
   * @param {object} snapshot          Snapshot built by snapshot.js or practice-snapshot.js
   * @param {object} [options]
   * @param {unknown[]} [options.inputs=[]]   Scripted answers for dialogs, in order
   * @param {() => number} [options.random]   RNG for rolls
   * @param {boolean} [options.enforcePermissions=true]
   */
  constructor(snapshot, { inputs=[], random=Math.random, enforcePermissions=true }={}) {
    this.snapshot = deepClone(snapshot);
    this.inputs = [...inputs];
    this.random = random;
    this.enforcePermissions = enforcePermissions;
    this.records = { chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], settings: [], navigation: [], uses: [], sheets: [], warnings: [] };
    this.hookRegistry = new Map();
    this.hookId = 0;
    this.globals = this.#buildGlobals();
  }

  record(kind, entry) { (this.records[kind] ??= []).push(entry); }

  assertSystem(id, api) {
    if ( this.snapshot.system?.id !== id ) throw new Error(`${api} belongs to the ${id} game system. The current snapshot uses "${this.snapshot.system?.id ?? "no"}" system, so this call would fail in the live game too.`);
  }

  assertWritable(doc, action="update") {
    if ( !this.enforcePermissions ) return;
    const user = this.globals.game.user;
    if ( user.isGM ) return;
    if ( doc.documentName === "Scene" || doc.documentName === "Combat" ) throw new Error(`Permission denied: only a Gamemaster can ${action} a ${doc.documentName}.`);
    if ( !doc.testUserPermission(user, "OWNER") ) throw new Error(`Permission denied: ${user.name} does not own "${doc.name}" and cannot ${action} it. In the live game this error comes from the server.`);
  }

  collectionFor(doc) {
    const g = this.globals.game;
    switch ( doc.documentName ) {
      case "Actor": return g.actors;
      case "Item": return doc.parent ? doc.parent.items : g.items;
      case "ActiveEffect": return doc.parent?.effects ?? null;
      case "Token": return doc.parent?.tokens ?? null;
      case "Combatant": return doc.parent?.combatants ?? null;
      case "Macro": return g.macros;
      case "Scene": return g.scenes;
      default: return null;
    }
  }

  sceneTokens() { return this.globals.game.scenes.active?.tokens.contents ?? []; }

  nextInput(type, title) {
    if ( !this.inputs.length ) {
      this.record("warnings", { type: "dialog", message: `A ${type} dialog ("${title ?? ""}") was shown but no scripted answer was provided; the dialog was treated as cancelled.` });
      return undefined;
    }
    return this.inputs.shift();
  }

  /** Output of the run, in the shape evaluator.js expects. */
  get results() {
    return {
      chat: this.records.chat.map(m => ({ content: m.content, speaker: m.speaker, whisper: m.whisper, flavor: m.flavor, rolls: m.rolls.map(r => ({ formula: r.formula, total: r.total })) })),
      notifications: this.records.notifications,
      updates: this.records.updates,
      creates: this.records.creates,
      deletes: this.records.deletes,
      dialogs: this.records.dialogs,
      rolls: this.records.rolls,
      hooks: this.records.hooks,
      mechanics: this.records.mechanics,
      settings: this.records.settings,
      navigation: this.records.navigation,
      uses: this.records.uses,
      sheets: this.records.sheets,
      warnings: this.records.warnings
    };
  }

  /**
   * A stand-in for the Midi-QOL public surface (dnd6 branch 14.6.x) used by Tier 7 lessons. It implements only the
   * functions listed in scripts/adapters/integrations/midi-qol.js, with simplified behaviour, and records every call as
   * a mechanic of type "midi-qol.<name>" so exercises can assert that the integration path was taken. It is not Midi-QOL.
   */
  #buildMidiQOL(rt, { game, canvas }) {
    const tokenOf = t => t?.document ? t : (t?.object ?? (t?.documentName === "Actor" ? t.getActiveTokens(true, false)[0] : null));
    const record = (name, data={}) => rt.record("mechanics", { type: `midi-qol.${name}`, ...data });
    const distance = (a, b) => canvas.grid.measurePath([a.center, b.center]).distance;
    return {
      emulated: true,
      async applyTokenDamage(damageDetail, totalDamage, theTargets, item=null, saves=new Set(), options={}) {
        const targets = [...(theTargets ?? [])].map(tokenOf).filter(Boolean);
        const out = [];
        for ( const t of targets ) {
          if ( !t.actor ) continue;
          const saved = saves instanceof Set ? saves.has(t) : false;
          const parts = (damageDetail ?? []).map(d => ({ value: saved ? Math.floor((d.damage ?? d.value ?? 0) / 2) : (d.damage ?? d.value ?? 0), type: d.type ?? "untyped" }));
          await t.actor.applyDamage(parts, { ...options });
          out.push({ token: t, actor: t.actor, applied: parts.reduce((s, p) => s + p.value, 0) });
        }
        record("applyTokenDamage", { targets: targets.map(t => t.name), total: totalDamage, item: item?.name ?? null, saves: targets.filter(t => saves instanceof Set && saves.has(t)).map(t => t.name) });
        return out;
      },
      async completeItemUse(item, config={}, options={}) {
        record("completeItemUse", { item: item?.name ?? null, config: deepClone(config), options: deepClone(options) });
        if ( typeof item?.use === "function" ) await item.use(config, { configure: false }, {});
        return { item, targets: new Set([...game.user.targets]), hitTargets: new Set([...game.user.targets]), failedSaves: new Set(), emulated: true };
      },
      async completeActivityUse(activity, config={}, options={}) {
        record("completeActivityUse", { activity: activity?.name ?? null, config: deepClone(config), options: deepClone(options) });
        if ( typeof activity?.use === "function" ) await activity.use(config, { configure: false }, {});
        return { activity, targets: new Set([...game.user.targets]), emulated: true };
      },
      findNearby(disposition, token, range, options={}) {
        const origin = tokenOf(token);
        if ( !origin ) return [];
        const want = disposition === null || disposition === undefined ? null : (Array.isArray(disposition) ? disposition : [disposition]);
        const near = canvas.tokens.placeables.filter(t => t !== origin && (!want || want.includes(t.document.disposition)) && (options.includeIncapacitated || (t.actor?.system?.attributes?.hp?.value ?? 1) > 0) && distance(origin, t) <= range);
        record("findNearby", { origin: origin.name, range, found: near.map(t => t.name) });
        return near;
      },
      getDistance(t1, t2) { const a = tokenOf(t1), b = tokenOf(t2); if ( !a || !b ) return -1; return distance(a, b); },
      hasCondition(tokenOrActor, condition) {
        const actor = tokenOrActor?.actor ?? tokenOrActor;
        const has = Boolean(actor?.statuses?.has(String(condition).toLowerCase()));
        record("hasCondition", { actor: actor?.name ?? null, condition, has });
        return has;
      }
    };
  }

  #buildGlobals() {
    const rt = this;
    const snap = this.snapshot;
    const actors = new Collection((snap.actors ?? []).map(a => new EmulatedActor(a, rt)));
    const items = new Collection((snap.items ?? []).map(i => new EmulatedItem(i, rt, null)));
    const scenes = new Collection();
    const activeSceneTokens = (snap.tokens ?? []);
    for ( const s of snap.scenes ?? [] ) scenes.set(s.id, new EmulatedScene(s, rt, s.id === snap.scene?.id ? activeSceneTokens : []));
    if ( snap.scene && !scenes.has(snap.scene.id) ) scenes.set(snap.scene.id, new EmulatedScene(snap.scene, rt, activeSceneTokens));
    Object.defineProperty(scenes, "active", { get: () => scenes.contents.find(s => s.active) ?? null });
    Object.defineProperty(scenes, "current", { get: () => scenes.active });
    Object.defineProperty(scenes, "viewed", { get: () => scenes.active });
    const users = new Collection((snap.users ?? [snap.user]).map(u => new EmulatedUser(u, rt)));
    const user = users.get(snap.user.id) ?? new EmulatedUser(snap.user, rt);
    for ( const t of activeSceneTokens ) if ( t.targeted ) { const doc = scenes.active?.tokens.get(t.id); if ( doc ) user.targets.add(doc.object); }
    const macros = new Collection((snap.macros ?? []).map(m => {
      const d = new EmulatedDocument("Macro", m, rt);
      d.command = m.command; d.type = m.type ?? "script";
      d.execute = async () => { rt.record("mechanics", { type: "executeMacro", name: d.name }); return undefined; };
      Object.defineProperty(d, "canExecute", { get: () => user.can("MACRO_SCRIPT") });
      return d;
    }));
    const journal = new Collection((snap.journal ?? []).map(j => new EmulatedDocument("JournalEntry", j, rt)));
    const combats = new Collection();
    this._combat = snap.combat ? new EmulatedCombat(snap.combat, rt) : null;
    if ( this._combat ) combats.set(this._combat.id, this._combat);
    const settingsStore = { ...(snap.settings ?? {}) };
    const registered = new Map();

    const game = {
      actors, items, scenes, users, macros, journal, combats, user,
      get combat() { return rt._combat; },
      get userId() { return user.id; },
      system: { id: snap.system?.id ?? "generic", title: snap.system?.title ?? "", version: snap.system?.version ?? "" },
      version: snap.foundryVersion ?? "14.369",
      release: { generation: 14, version: snap.foundryVersion ?? "14.369" },
      modules: {
        get: id => { const m = (snap.modules ?? []).find(x => x.id === id); return m ? { id: m.id, title: m.title, version: m.version, active: Boolean(m.active), compatibility: deepClone(m.compatibility ?? {}), esmodules: [...(m.esmodules ?? [])], api: m.api ?? undefined } : undefined; },
        contents: (snap.modules ?? []).map(m => ({ ...m })),
        get size() { return (snap.modules ?? []).length; },
        has: id => (snap.modules ?? []).some(m => m.id === id),
        [Symbol.iterator]() { return (snap.modules ?? []).map(m => ({ ...m }))[Symbol.iterator](); }
      },
      settings: {
        register(namespace, key, config) { registered.set(`${namespace}.${key}`, config); if ( !(`${namespace}.${key}` in settingsStore) ) settingsStore[`${namespace}.${key}`] = config.default; },
        registerMenu() { },
        get(namespace, key) { const k = `${namespace}.${key}`; if ( !(k in settingsStore) && !registered.has(k) ) throw new Error(`"${k}" is not a registered game setting`); return settingsStore[k]; },
        async set(namespace, key, value) { const k = `${namespace}.${key}`; if ( !(k in settingsStore) && !registered.has(k) ) throw new Error(`"${k}" is not a registered game setting`); settingsStore[k] = value; rt.record("settings", { key: k, value: deepClone(value) }); return value; }
      },
      i18n: { localize: k => String(k), format: (k, data={}) => String(k).replace(/\{(\w+)\}/g, (_m, p) => String(data[p] ?? `{${p}}`)), has: () => false, lang: "en" },
      time: { worldTime: snap.worldTime ?? 0, async advance(n) { this.worldTime += n; rt.record("mechanics", { type: "advanceTime", seconds: n }); } },
      paused: Boolean(snap.paused),
      togglePause(state) { this.paused = state ?? !this.paused; rt.record("mechanics", { type: "togglePause", paused: this.paused }); },
      get canvas() { return canvas; },
      ready: true,
      world: { id: "academy-world", title: "Academy World" },
      keybindings: { register() {}, get: () => [] },
      permissions: { get: () => 1 }
    };

    const ui = {
      notifications: {
        info: (message, options={}) => { rt.record("notifications", { type: "info", message: String(message), options }); return { id: randomID() }; },
        warn: (message, options={}) => { rt.record("notifications", { type: "warn", message: String(message), options }); return { id: randomID() }; },
        error: (message, options={}) => { rt.record("notifications", { type: "error", message: String(message), options }); return { id: randomID() }; },
        notify: (message, type="info", options={}) => { rt.record("notifications", { type, message: String(message), options }); return { id: randomID() }; }
      },
      chat: { scrollBottom() {} },
      sidebar: { expand() {}, collapse() {}, tabs: {} },
      combat: { render() {} },
      players: { render() {} },
      hotbar: { render() {} },
      controls: { render() {}, control: { name: "tokens" }, tool: { name: "select" } },
      nav: { render() {} }
    };

    const canvas = {
      ready: true,
      get scene() { return scenes.active; },
      tokens: {
        get placeables() { return rt.sceneTokens().map(t => t.object); },
        get controlled() { return rt.sceneTokens().filter(t => t._controlled).map(t => t.object); },
        get ownedTokens() { return rt.sceneTokens().filter(t => t.isOwner).map(t => t.object); },
        get(id) { return scenes.active?.tokens.get(id)?.object ?? undefined; },
        releaseAll() { for ( const t of rt.sceneTokens() ) t._controlled = false; },
        get documentCollection() { return scenes.active?.tokens ?? null; },
        get objects() { return { children: rt.sceneTokens().map(t => t.object) }; },
        get hud() { return { render() {} }; }
      },
      grid: {
        get size() { return scenes.active?.grid.size ?? 100; },
        get distance() { return scenes.active?.grid.distance ?? 5; },
        get units() { return scenes.active?.grid.units ?? "ft"; },
        get type() { return scenes.active?.grid.type ?? 1; },
        get isSquare() { return true; },
        measurePath(points) {
          // Equidistant diagonals (Foundry V12+ default for square grids); good enough for the emulator.
          const size = scenes.active?.grid.size ?? 100, dist = scenes.active?.grid.distance ?? 5;
          let total = 0;
          for ( let i = 1; i < points.length; i++ ) {
            const a = points[i - 1], b = points[i];
            const dx = Math.abs(Math.round((b.x - a.x) / size)), dy = Math.abs(Math.round((b.y - a.y) / size));
            total += Math.max(dx, dy) * dist;
          }
          return { distance: total, spaces: total / dist, cost: total };
        },
        getOffset(point) { const size = scenes.active?.grid.size ?? 100; return { i: Math.floor(point.y / size), j: Math.floor(point.x / size) }; },
        getCenterPoint(point) { const size = scenes.active?.grid.size ?? 100; return { x: Math.floor(point.x / size) * size + size / 2, y: Math.floor(point.y / size) * size + size / 2 }; }
      },
      get dimensions() { const s = scenes.active; return { width: s?.width ?? 4000, height: s?.height ?? 3000, size: s?.grid.size ?? 100, distance: s?.grid.distance ?? 5 }; },
      async pan({ x, y, scale }={}) { rt.record("navigation", { type: "pan", x, y, scale }); },
      async animatePan({ x, y, scale }={}) { rt.record("navigation", { type: "pan", x, y, scale }); },
      ping(point) { rt.record("navigation", { type: "ping", ...point }); return true; },
      walls: { placeables: [] }, lighting: { placeables: [] }, templates: { placeables: [] }, drawings: { placeables: [] }, notes: { placeables: [] }, sounds: { placeables: [] },
      app: { ticker: { add() {} } },
      stage: {}
    };

    class RollEmu {
      constructor(formula, data={}, options={}) { this.formula = String(formula); this.data = data ?? {}; this.options = options; this._evaluated = false; this._total = undefined; this.dice = []; this.terms = []; }
      static validate(formula) { return validateFormula(formula); }
      static create(formula, data, options) { return new RollEmu(formula, data, options); }
      get total() { if ( !this._evaluated ) throw new Error("Roll has not been evaluated yet. Call await roll.evaluate() first."); return this._total; }
      get result() { return this._evaluated ? String(this._total) : ""; }
      get isDeterministic() { return !/\d*d\d+/i.test(this.formula); }
      async evaluate({ maximize=false, minimize=false }={}) { return this.#evaluate({ maximize, minimize }); }
      evaluateSync(options={}) { return this.#evaluate(options); }
      async roll(options={}) { return this.evaluate(options); }
      #evaluate({ maximize=false, minimize=false }={}) {
        if ( this._evaluated ) throw new Error("This Roll object has already been rolled and cannot be evaluated again.");
        const r = evaluateFormula(this.formula, this.data, { random: rt.random, maximize, minimize });
        this._total = r.total; this.dice = r.dice.map(d => ({ ...d, faces: d.faces, number: d.count, values: d.results.filter(x => x.active).map(x => x.result), formula: d.formula })); this.terms = r.terms; this._evaluated = true;
        this.formula = r.formula;
        rt.record("rolls", { formula: r.formula, total: r.total, dice: this.dice.map(d => ({ formula: d.formula, values: d.values })) });
        return this;
      }
      async render() { return `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">${escapeHTML(this.formula)}</div><h4 class="dice-total">${escapeHTML(this.total)}</h4></div></div>`; }
      async toMessage(messageData={}, { create=true, rollMode }={}) {
        if ( !this._evaluated ) await this.evaluate();
        const data = { ...messageData, rolls: [this], content: messageData.content ?? String(this.total) };
        if ( rollMode ) data.rollMode = rollMode;
        return create ? ChatMessageEmu.create(data) : data;
      }
      toJSON() { return { formula: this.formula, total: this._total, evaluated: this._evaluated }; }
      toAnchor() { return { outerHTML: `<a class="inline-roll">${escapeHTML(this.formula)}</a>` }; }
      getTooltip() { return Promise.resolve(""); }
    }

    class ChatMessageEmu {
      static async create(data={}, _options={}) {
        if ( Array.isArray(data) ) return Promise.all(data.map(d => ChatMessageEmu.create(d)));
        if ( data.content === undefined && !data.rolls ) throw new Error("ChatMessage.create requires a content string (or rolls).");
        const msg = new EmulatedChatMessage({ ...data, content: data.content === undefined ? "" : String(data.content) }, rt);
        if ( data.rollMode ) ChatMessageEmu.applyRollMode(msg, data.rollMode);
        rt.records.chat.push(msg);
        return msg;
      }
      static getSpeaker({ scene, actor, token, alias }={}) {
        if ( token ) { const doc = token.document ?? token; return { scene: scene?.id ?? scenes.active?.id ?? null, token: doc.id, actor: doc.actor?.id ?? null, alias: alias ?? doc.name }; }
        if ( actor ) { return { scene: scene?.id ?? scenes.active?.id ?? null, token: null, actor: actor.id, alias: alias ?? actor.name }; }
        const controlled = canvas.tokens.controlled[0];
        if ( controlled ) return ChatMessageEmu.getSpeaker({ token: controlled, alias });
        const character = user.character;
        if ( character ) return { scene: scenes.active?.id ?? null, token: null, actor: character.id, alias: alias ?? character.name };
        return { scene: scenes.active?.id ?? null, token: null, actor: null, alias: alias ?? user.name };
      }
      static getSpeakerActor(speaker={}) { return speaker.actor ? actors.get(speaker.actor) ?? null : null; }
      static getWhisperRecipients(name) { if ( name === "GM" || name === "gm" ) return users.filter(u => u.isGM); return users.filter(u => u.name === name); }
      static applyRollMode(data, mode) {
        if ( mode === "gmroll" || mode === "blindroll" ) data.whisper = users.filter(u => u.isGM).map(u => u.id);
        if ( mode === "blindroll" ) data.blind = true;
        if ( mode === "selfroll" ) data.whisper = [user.id];
        return data;
      }
      static get implementation() { return ChatMessageEmu; }
    }

    const Hooks = {
      on(name, fn, { once=false }={}) { const id = ++rt.hookId; const list = rt.hookRegistry.get(name) ?? []; list.push({ id, fn, once }); rt.hookRegistry.set(name, list); rt.record("hooks", { name, id, once }); return id; },
      once(name, fn) { return Hooks.on(name, fn, { once: true }); },
      off(name, idOrFn) { const list = rt.hookRegistry.get(name) ?? []; rt.hookRegistry.set(name, list.filter(h => h.id !== idOrFn && h.fn !== idOrFn)); },
      call(name, ...args) { for ( const h of [...(rt.hookRegistry.get(name) ?? [])] ) { if ( h.once ) Hooks.off(name, h.id); if ( h.fn(...args) === false ) return false; } return true; },
      callAll(name, ...args) { for ( const h of [...(rt.hookRegistry.get(name) ?? [])] ) { if ( h.once ) Hooks.off(name, h.id); h.fn(...args); } },
      get events() { const out = {}; for ( const [k, v] of rt.hookRegistry ) out[k] = v.map(h => ({ id: h.id, fn: h.fn, once: h.once })); return out; }
    };

    const DialogV2 = {
      async prompt({ window: w, content, ok }={}) { const title = w?.title; rt.record("dialogs", { type: "prompt", title, content: String(content ?? "") }); const input = rt.nextInput("prompt", title); if ( input === null ) return null; return ok?.callback ? ok.callback(null, null, null) : (input ?? "ok"); },
      async confirm({ window: w, content, yes, no }={}) { const title = w?.title; rt.record("dialogs", { type: "confirm", title, content: String(content ?? "") }); const input = rt.nextInput("confirm", title); if ( input === undefined || input === null ) return null; const answer = Boolean(input); if ( answer && yes?.callback ) return yes.callback(); if ( !answer && no?.callback ) return no.callback(); return answer; },
      async input({ window: w, content }={}) { const title = w?.title; rt.record("dialogs", { type: "input", title, content: String(content ?? "") }); const input = rt.nextInput("input", title); if ( input === undefined || input === null ) return null; if ( typeof input === "object" ) return deepClone(input); const names = [...String(content ?? "").matchAll(/name="([^"]+)"/g)].map(m => m[1]); return names.length ? { [names[0]]: input } : { value: input }; },
      async wait({ window: w, content, buttons=[] }={}) { const title = w?.title; rt.record("dialogs", { type: "wait", title, content: String(content ?? ""), buttons: buttons.map(b => b.action) }); const input = rt.nextInput("wait", title); if ( input === undefined || input === null ) return null; const btn = buttons.find(b => b.action === input) ?? buttons.find(b => b.default) ?? buttons[0]; if ( btn?.callback ) return btn.callback(null, btn, null); return btn?.action ?? input; },
      async query() { throw NOT_EMULATED("DialogV2.query"); }
    };

    const foundry = {
      utils: { deepClone, duplicate: deepClone, mergeObject, expandObject, flattenObject, getProperty, setProperty, hasProperty, isEmpty, escapeHTML, randomID, isNewerVersion, debounce: (fn) => fn, throttle: (fn) => fn, isSubclass: (a, b) => a === b || b.isPrototypeOf(a), fetchJsonWithTimeout: async () => { throw NOT_EMULATED("foundry.utils.fetchJsonWithTimeout"); } },
      applications: { api: { DialogV2, ApplicationV2: class { constructor() { throw NOT_EMULATED("ApplicationV2 subclasses"); } }, HandlebarsApplicationMixin: () => class {} }, handlebars: { renderTemplate: async () => { throw NOT_EMULATED("renderTemplate"); } }, ux: { TextEditor: { implementation: { enrichHTML: async html => String(html) } } } },
      documents: { Actor: EmulatedActor, Item: EmulatedItem, Macro: class {}, ChatMessage: ChatMessageEmu },
      canvas: { placeables: { Token: EmulatedToken } },
      dice: { Roll: RollEmu },
      audio: { AudioHelper: { play: () => { throw NOT_EMULATED("AudioHelper.play"); } } }
    };

    const CONST = {
      USER_ROLES: { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 },
      USER_ROLE_NAMES: { 0: "NONE", 1: "PLAYER", 2: "TRUSTED", 3: "ASSISTANT", 4: "GAMEMASTER" },
      TOKEN_DISPOSITIONS: { SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 },
      DOCUMENT_OWNERSHIP_LEVELS: { INHERIT: -1, NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
      CHAT_MESSAGE_STYLES: { OTHER: 0, OOC: 1, IC: 2, EMOTE: 3 },
      MACRO_TYPES: { SCRIPT: "script", CHAT: "chat" },
      DICE_ROLL_MODES: { PUBLIC: "publicroll", PRIVATE: "gmroll", BLIND: "blindroll", SELF: "selfroll" }
    };

    const CONFIG = {
      statusEffects: ["dead", "unconscious", "sleep", "stun", "prone", "restrain", "paralysis", "fly", "blind", "deaf", "silence", "fear", "burning", "frozen", "shock", "corrode", "bleeding", "disease", "poison", "curse", "regen", "degen", "hover", "burrow", "upgrade", "downgrade", "invisible", "target", "eye", "bless", "fireShield", "coldShield", "magicShield", "holyShield", "holyBeam"].map(id => ({ id, name: `EFFECT.Status${id.charAt(0).toUpperCase() + id.slice(1)}`, img: `icons/svg/${id}.svg` })),
      Actor: { documentClass: EmulatedActor, typeLabels: {} },
      Item: { documentClass: EmulatedItem },
      Dice: { rolls: [RollEmu] },
      ChatMessage: { documentClass: ChatMessageEmu },
      debug: { hooks: false },
      DND5E: snap.system?.id === "dnd5e" ? {
        abilities: { str: { label: "Strength", abbreviation: "str" }, dex: { label: "Dexterity", abbreviation: "dex" }, con: { label: "Constitution", abbreviation: "con" }, int: { label: "Intelligence", abbreviation: "int" }, wis: { label: "Wisdom", abbreviation: "wis" }, cha: { label: "Charisma", abbreviation: "cha" } },
        skills: { acr: { label: "Acrobatics", ability: "dex" }, ani: { label: "Animal Handling", ability: "wis" }, arc: { label: "Arcana", ability: "int" }, ath: { label: "Athletics", ability: "str" }, dec: { label: "Deception", ability: "cha" }, his: { label: "History", ability: "int" }, ins: { label: "Insight", ability: "wis" }, itm: { label: "Intimidation", ability: "cha" }, inv: { label: "Investigation", ability: "int" }, med: { label: "Medicine", ability: "wis" }, nat: { label: "Nature", ability: "int" }, prc: { label: "Perception", ability: "wis" }, prf: { label: "Performance", ability: "cha" }, per: { label: "Persuasion", ability: "cha" }, rel: { label: "Religion", ability: "int" }, slt: { label: "Sleight of Hand", ability: "dex" }, ste: { label: "Stealth", ability: "dex" }, sur: { label: "Survival", ability: "wis" } },
        damageTypes: { acid: { label: "Acid" }, bludgeoning: { label: "Bludgeoning" }, cold: { label: "Cold" }, fire: { label: "Fire" }, force: { label: "Force" }, lightning: { label: "Lightning" }, necrotic: { label: "Necrotic" }, piercing: { label: "Piercing" }, poison: { label: "Poison" }, psychic: { label: "Psychic" }, radiant: { label: "Radiant" }, slashing: { label: "Slashing" }, thunder: { label: "Thunder" } },
        healingTypes: { healing: { label: "Healing" }, temphp: { label: "Temporary HP" } },
        conditionTypes: { blinded: { label: "Blinded" }, charmed: { label: "Charmed" }, deafened: { label: "Deafened" }, exhaustion: { label: "Exhaustion" }, frightened: { label: "Frightened" }, grappled: { label: "Grappled" }, incapacitated: { label: "Incapacitated" }, invisible: { label: "Invisible" }, paralyzed: { label: "Paralyzed" }, petrified: { label: "Petrified" }, poisoned: { label: "Poisoned" }, prone: { label: "Prone" }, restrained: { label: "Restrained" }, stunned: { label: "Stunned" }, unconscious: { label: "Unconscious" } }
      } : undefined
    };

    const fromUuid = async uuid => fromUuidSync(uuid);
    const fromUuidSync = uuid => {
      if ( typeof uuid !== "string" ) return null;
      const parts = uuid.split(".");
      let doc = null;
      const top = { Actor: actors, Item: items, Scene: scenes, Macro: macros, JournalEntry: journal, User: users, Combat: combats };
      for ( let i = 0; i < parts.length; i += 2 ) {
        const [type, id] = [parts[i], parts[i + 1]];
        if ( i === 0 ) doc = top[type]?.get(id) ?? null;
        else if ( doc ) doc = (type === "Item" ? doc.items : type === "ActiveEffect" ? doc.effects : type === "Token" ? doc.tokens : type === "Combatant" ? doc.combatants : null)?.get(id) ?? null;
        if ( !doc ) return null;
      }
      return doc;
    };

    const deprecated = (name, replacement) => class { constructor() { throw new Error(`${name} was deprecated in Foundry V13 and should not be used in new code. Use ${replacement} instead.`); } static async confirm() { throw new Error(`${name}.confirm was deprecated in V13. Use ${replacement}.confirm instead.`); } static async prompt() { throw new Error(`${name}.prompt was deprecated in V13. Use ${replacement}.prompt instead.`); } static async wait() { throw new Error(`${name}.wait was deprecated in V13. Use ${replacement}.wait instead.`); } };

    const ActorStatic = { create: async data => { rt.assertCreate("Actor"); const a = new EmulatedActor({ ...data, id: data._id ?? randomID(), isOwner: true }, rt); actors.set(a.id, a); rt.record("creates", { documentName: "Actor", data: deepClone(data) }); Hooks.callAll("createActor", a, {}, user.id); return a; }, get implementation() { return ActorStatic; }, documentName: "Actor", canUserCreate: u => u.can("ACTOR_CREATE"), updateDocuments: async (updates=[]) => { const out = []; for ( const u of updates ) { const doc = actors.get(u._id); if ( !doc ) throw new Error(`No Actor with id ${u._id}`); const { _id, ...rest } = u; await doc.update(rest); out.push(doc); } rt.record("mechanics", { type: "batchUpdate", documentName: "Actor", count: updates.length }); return out; } };
    const ItemStatic = { create: async (data, { parent }={}) => { if ( parent ) return (await parent.createEmbeddedDocuments("Item", [data]))[0]; rt.assertCreate("Item"); const i = new EmulatedItem({ ...data, id: data._id ?? randomID() }, rt, null); items.set(i.id, i); rt.record("creates", { documentName: "Item", data: deepClone(data) }); Hooks.callAll("createItem", i, {}, user.id); return i; }, get implementation() { return ItemStatic; }, documentName: "Item", updateDocuments: async (updates=[]) => { const out = []; for ( const u of updates ) { const doc = items.get(u._id); if ( !doc ) throw new Error(`No Item with id ${u._id}`); const { _id, ...rest } = u; await doc.update(rest); out.push(doc); } rt.record("mechanics", { type: "batchUpdate", documentName: "Item", count: updates.length }); return out; } };
    const MacroStatic = { create: async data => { if ( !user.can("MACRO_SCRIPT") && (data.type ?? "script") === "script" ) throw new Error("Permission denied: your user cannot create script macros."); const m = new EmulatedDocument("Macro", { ...data, id: data._id ?? randomID() }, rt); m.command = data.command ?? ""; m.type = data.type ?? "script"; macros.set(m.id, m); rt.record("creates", { documentName: "Macro", data: deepClone(data) }); Hooks.callAll("createMacro", m, {}, user.id); return m; }, get implementation() { return MacroStatic; }, documentName: "Macro", canUserCreate: u => u.hasRole("PLAYER") };

    const midi = (snap.modules ?? []).find(m => m.id === "midi-qol" && m.active);
    const MidiQOL = midi ? this.#buildMidiQOL(rt, { game, canvas }) : undefined;

    return {
      game, ui, canvas, Hooks, CONST, CONFIG, foundry, fromUuid, fromUuidSync,
      ...(MidiQOL ? { MidiQOL } : {}),
      ChatMessage: ChatMessageEmu, Roll: RollEmu, Actor: ActorStatic, Item: ItemStatic, Macro: MacroStatic,
      Dialog: deprecated("Dialog", "foundry.applications.api.DialogV2"),
      renderTemplate: () => { throw new Error("The global renderTemplate was deprecated in V13. Use foundry.applications.handlebars.renderTemplate instead (and note the emulator does not render templates)."); },
      getDocumentClass: name => ({ Actor: ActorStatic, Item: ItemStatic, Macro: MacroStatic, ChatMessage: ChatMessageEmu })[name],
      duplicate: deepClone
    };
  }

  assertCreate(documentName) {
    if ( !this.enforcePermissions ) return;
    const user = this.globals.game.user;
    const perm = { Actor: "ACTOR_CREATE", Item: "ITEM_CREATE", Scene: "GAMEMASTER", JournalEntry: "JOURNAL_CREATE" }[documentName];
    if ( perm && !user.can(perm) ) throw new Error(`Permission denied: ${user.name} lacks the ${perm} permission needed to create a ${documentName}.`);
  }
}
