import { FLAG_SCOPE, FLAGS, MODULE_VERSION } from "../core/constants.js";
import { CONDITIONS, EFFECT_CHANGE_TYPES, STATUS_EFFECTS } from "../core/dnd5e-reference.js";
import { validateFormula } from "../rules/formula-validator.js";

/**
 * Build Foundry V14 / dnd5e 6 ActiveEffect data from an effect IR.
 *
 * Only validated change keys are emitted. Keys are checked against an allow-list of document paths
 * so imported data can never write ownership, flags of other modules, or arbitrary properties.
 */

const ALLOWED_KEY_PREFIXES = [
  "system.attributes.ac.", "system.attributes.hp.", "system.attributes.init.", "system.attributes.movement.",
  "system.attributes.senses.", "system.attributes.spell", "system.attributes.concentration.", "system.attributes.death.",
  "system.attributes.attunement.", "system.attributes.exhaustion",
  "system.traits.", "system.rolls.", "system.bonuses.", "system.abilities.", "system.skills.", "system.tools.",
  "system.spells.", "system.resources.", "system.details.", "system.damage.", "system.magicalBonus", "system.armor.",
  "system.properties", "system.activation", "activities[", "system.activities.",
  "flags.dnd5e.", "flags.midi-qol.", "flags.dae."
];

const FORBIDDEN = /ownership|permission|_id|__proto__|constructor|prototype|flags\.core|flags\.stat-block-importer|system\.description|name$|img$/;

export function isAllowedChangeKey(key) {
  if ( typeof key !== "string" || !key.length || FORBIDDEN.test(key) ) return false;
  return ALLOWED_KEY_PREFIXES.some(p => key === p || key.startsWith(p));
}

/** Map IR duration units to effect duration units accepted by core. */
export function effectDuration(duration) {
  if ( !duration ) return {};
  const map = { turn: "turns", round: "rounds", second: "seconds", minute: "minutes", hour: "hours", day: "days", month: "months", year: "years" };
  const units = map[duration.units];
  const value = Number(duration.value);
  if ( !units || !Number.isFinite(value) || value <= 0 ) {
    return duration.expiry ? { expiry: duration.expiry } : {};
  }
  const out = { value, units };
  if ( duration.expiry ) out.expiry = duration.expiry;
  else if ( units !== "turns" ) out.expiry = "turnStart";
  return out;
}

/**
 * @param {object} effect     Effect IR
 * @param {object} [options]
 * @param {string} [options.img]
 * @param {string} [options.itemName]
 * @param {object} [options.provenance]
 * @returns {{data: object, warnings: string[]}}
 */
export function buildEffect(effect, options={}) {
  const warnings = [];
  const changes = [];
  for ( const c of effect.changes ?? [] ) {
    if ( !isAllowedChangeKey(c.key) ) { warnings.push(`Change key "${c.key}" is not allowed and was dropped`); continue; }
    const type = EFFECT_CHANGE_TYPES.includes(c.type) ? c.type : "add";
    const value = String(c.value ?? "");
    if ( /^[+-]?\d*d\d+/.test(value) === false && /@|[+\-*/]/.test(value) && !/^[+-]?\d+(\.\d+)?$/.test(value) ) {
      const v = validateFormula(value.replace(/^\+/, ""));
      if ( !v.valid && !/^-?[a-z]+$/i.test(value) ) { warnings.push(`Change value "${value}" for ${c.key} is not a valid formula and was dropped`); continue; }
    }
    const change = { key: c.key, value, type, priority: c.priority ?? null, phase: "initial" };
    changes.push(change);
  }
  const statuses = (effect.statuses ?? []).filter(s => CONDITIONS.includes(s) || STATUS_EFFECTS.includes(s));
  for ( const s of effect.statuses ?? [] ) if ( !statuses.includes(s) ) warnings.push(`Unknown status "${s}" dropped`);
  const data = {
    _id: effect.foundryId ?? randomID(),
    name: effect.name || options.itemName || "Effect",
    type: "base",
    img: effect.img ?? (statuses.length ? `systems/dnd5e/icons/svg/statuses/${statuses[0]}.svg` : options.img ?? "icons/svg/aura.svg"),
    disabled: Boolean(effect.disabled),
    transfer: Boolean(effect.transfer),
    statuses,
    duration: effectDuration(effect.duration),
    description: effect.description ? `<p>${escape(effect.description)}</p>` : "",
    system: { changes, magical: Boolean(effect.magical) },
    flags: { [FLAG_SCOPE]: { [FLAGS.IMPORT]: { moduleVersion: MODULE_VERSION, irId: effect.id, sourceText: effect.sourceText ?? "", ...(options.provenance ?? {}) } } }
  };
  effect.foundryId = data._id;
  return { data, warnings };
}

export function randomID(length=16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const rnd = globalThis.foundry?.utils?.randomID;
  if ( rnd ) return rnd(length);
  let out = "";
  for ( let i = 0; i < length; i++ ) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function escape(text) { return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c])); }
