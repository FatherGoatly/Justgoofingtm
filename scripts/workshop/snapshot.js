/**
 * Builds a read-only JSON snapshot of the live world for the Foundry Preview emulator. Only documents the
 * current user can see are included, and only plain data is copied: the snapshot cannot reach back into the
 * real documents. Sizes are capped (LIMITS.SNAPSHOT_MAX_BYTES).
 */
import { LIMITS, MODULE_ID } from "../core/constants.js";
import { byteSize } from "../utilities/text.js";

/**
 * Convert a document/data-model tree into plain JSON-compatible data, keeping derived (prepared) values.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function plainify(value, depth=0) {
  if ( value === null || value === undefined ) return value;
  const t = typeof value;
  if ( t === "number" || t === "string" || t === "boolean" ) return value;
  if ( t === "bigint" ) return Number(value);
  if ( t === "function" || t === "symbol" ) return undefined;
  if ( depth > 10 ) return undefined;
  if ( Array.isArray(value) ) return value.map(v => plainify(v, depth + 1)).filter(v => v !== undefined);
  if ( value instanceof Set ) return [...value].map(v => plainify(v, depth + 1));
  if ( value instanceof Map ) return Object.fromEntries([...value].map(([k, v]) => [String(k), plainify(v, depth + 1)]));
  if ( value?.documentName && typeof value.toObject === "function" ) return { id: value.id, name: value.name, uuid: value.uuid, documentName: value.documentName };
  const out = {};
  for ( const key of Object.keys(value) ) {
    if ( key.startsWith("_") || key === "parent" || key === "schema" || key === "collection" ) continue;
    const v = plainify(value[key], depth + 1);
    if ( v !== undefined ) out[key] = v;
  }
  return out;
}

function describeUser(u) {
  return { id: u.id, name: u.name, role: u.role, isGM: u.isGM, color: u.color?.toString?.() ?? String(u.color ?? ""), character: u.character?.id ?? null, active: u.active };
}

function describeItem(item) {
  return { id: item.id, uuid: item.uuid, name: item.name, type: item.type, img: item.img, system: plainify(item.system), flags: plainify(item.flags) };
}

function describeEffect(e) {
  return { id: e.id, uuid: e.uuid, name: e.name, img: e.img, disabled: e.disabled, statuses: [...(e.statuses ?? [])], duration: plainify(e.duration), changes: plainify(e.changes) };
}

/**
 * Describe an actor for the snapshot.
 * @param {Actor} actor
 * @param {User} user
 * @param {object} [options]
 * @param {boolean} [options.full=true]   Include items, effects and system data
 * @returns {object}
 */
export function describeActor(actor, user, { full=true }={}) {
  const owner = actor.testUserPermission(user, "OWNER");
  const base = { id: actor.id, uuid: actor.uuid, name: actor.name, type: actor.type, img: actor.img, isOwner: owner, ownership: plainify(actor.ownership), prototypeToken: { name: actor.prototypeToken?.name, actorLink: Boolean(actor.prototypeToken?.actorLink) }, flags: plainify(actor.flags) };
  if ( !full ) return { ...base, system: {}, items: [], effects: [], statuses: [] };
  return { ...base, system: plainify(actor.system), items: actor.items.map(describeItem), effects: actor.effects.map(describeEffect), statuses: [...(actor.statuses ?? [])] };
}

/**
 * Build the snapshot from the live game.
 * @param {object} [options]
 * @param {User} [options.user=game.user]
 * @param {number} [options.maxActors=60]
 * @returns {object}
 */
export function buildLiveSnapshot({ user=game.user, maxActors=60 }={}) {
  const scene = canvas?.ready ? canvas.scene : game.scenes?.active ?? null;
  const tokensOnCanvas = canvas?.ready ? canvas.tokens.placeables.filter(t => t.visible || user.isGM) : [];
  const targets = new Set([...(user.targets ?? [])].map(t => t.id));
  const tokens = tokensOnCanvas.map(t => {
    const d = t.document;
    const entry = { id: d.id, uuid: d.uuid, name: d.name, actorId: d.actorId, actorLink: d.actorLink, x: d.x, y: d.y, width: d.width, height: d.height, disposition: d.disposition, hidden: d.hidden, elevation: d.elevation, controlled: t.controlled, targeted: targets.has(t.id) };
    if ( !d.actorLink && t.actor && t.actor.testUserPermission(user, "LIMITED") ) entry.syntheticActor = describeActor(t.actor, user, { full: t.actor.testUserPermission(user, "OBSERVER") });
    return entry;
  });
  const tokenActorIds = new Set(tokens.map(t => t.actorId).filter(Boolean));
  const actors = [];
  for ( const a of game.actors ?? [] ) {
    if ( !a.testUserPermission(user, "LIMITED") ) continue;
    const full = a.testUserPermission(user, "OBSERVER");
    if ( tokenActorIds.has(a.id) || actors.length < maxActors ) actors.push(describeActor(a, user, { full }));
  }
  const snapshot = {
    kind: "live",
    createdAt: Date.now(),
    user: describeUser(user),
    users: (game.users?.contents ?? []).map(describeUser),
    system: { id: game.system.id, title: game.system.title, version: game.system.version },
    foundryVersion: game.version,
    modules: [...(game.modules ?? [])].filter(m => m.active).map(m => ({ id: m.id, title: m.title, version: m.version, active: true })),
    scene: scene ? { id: scene.id, uuid: scene.uuid, name: scene.name, active: scene.active, grid: { size: scene.grid.size, distance: scene.grid.distance, units: scene.grid.units, type: scene.grid.type }, width: scene.width, height: scene.height, tokenIds: tokens.map(t => t.id) } : null,
    scenes: (game.scenes?.contents ?? []).filter(s => s.testUserPermission(user, "LIMITED") || s.navigation || user.isGM).map(s => ({ id: s.id, uuid: s.uuid, name: s.name, active: s.active })),
    actors,
    tokens,
    items: (game.items?.contents ?? []).filter(i => i.testUserPermission(user, "OBSERVER")).slice(0, 50).map(describeItem),
    macros: (game.macros?.contents ?? []).filter(m => m.testUserPermission(user, "OBSERVER")).slice(0, 50).map(m => ({ id: m.id, uuid: m.uuid, name: m.name, type: m.type, command: m.type === "script" ? "" : m.command })),
    journal: (game.journal?.contents ?? []).filter(j => j.testUserPermission(user, "OBSERVER")).slice(0, 50).map(j => ({ id: j.id, uuid: j.uuid, name: j.name })),
    combat: game.combat ? { id: game.combat.id, uuid: game.combat.uuid, round: game.combat.round, turn: game.combat.turn, started: game.combat.started, combatants: game.combat.combatants.map(c => ({ id: c.id, tokenId: c.tokenId, actorId: c.actorId, name: c.name, initiative: c.initiative, defeated: c.isDefeated, hidden: c.hidden })) } : null,
    settings: { "core.rollMode": safeGet("core", "rollMode") ?? "publicroll" },
    worldTime: game.time?.worldTime ?? 0,
    paused: Boolean(game.paused)
  };
  return enforceSize(snapshot);
}

function safeGet(ns, key) { try { return game.settings.get(ns, key); } catch(_err) { return undefined; } }

/**
 * Trim the snapshot until it fits the size budget, dropping the least important data first.
 * @param {object} snapshot
 * @returns {object}
 */
export function enforceSize(snapshot) {
  const limit = LIMITS.SNAPSHOT_MAX_BYTES;
  if ( byteSize(snapshot) <= limit ) return snapshot;
  const tokenActorIds = new Set((snapshot.tokens ?? []).map(t => t.actorId));
  snapshot.actors = snapshot.actors.map(a => tokenActorIds.has(a.id) ? a : { ...a, items: [], effects: [] });
  snapshot.trimmed = ["items of actors without tokens"];
  if ( byteSize(snapshot) <= limit ) return snapshot;
  snapshot.actors = snapshot.actors.filter(a => tokenActorIds.has(a.id));
  snapshot.trimmed.push("actors without tokens");
  if ( byteSize(snapshot) <= limit ) return snapshot;
  snapshot.items = []; snapshot.journal = []; snapshot.macros = [];
  snapshot.trimmed.push("world items, journal and macro lists");
  if ( byteSize(snapshot) <= limit ) return snapshot;
  snapshot.actors = snapshot.actors.map(a => ({ ...a, items: a.items.slice(0, 20), effects: a.effects.slice(0, 10) }));
  snapshot.trimmed.push("item lists capped at 20 per actor");
  return snapshot;
}

/** The module id, exported for flag lookups by the snapshot consumers. */
export const SNAPSHOT_MODULE = MODULE_ID;
