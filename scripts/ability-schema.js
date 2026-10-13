/**
 * Validation and normalization of player-defined ability definitions.
 * Every definition is treated as untrusted input: text is length-limited and stored as plain text (rendered with
 * escaping), and structured mechanics are restricted to a fixed set of types with validated fields.
 *
 * Free of Foundry globals for unit testing. Runtime-only validation (formulas, damage types, status ids) is
 * injected through the `runtime` option.
 */

import {
  ABILITY_MODES,
  ACTIVATION_TYPES,
  APPROVAL_STATES,
  MECHANIC_TYPES,
  MECHANIC_TYPE_LIST,
  SCHEMA_VERSION,
  TEMPLATE_TYPES,
  TEXT_LIMITS
} from "./constants.js";

export const ABILITY_SCHEMA_VERSION = SCHEMA_VERSION;

const ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"];

/**
 * Structural formula check. After removing roll-data references (`@abilities.str.mod`), dice terms with their
 * modifiers (`2d6kh1`, `1d20r1=1`) and the dice math functions Foundry supports, only numbers, operators,
 * parentheses and whitespace may remain. Anything else (identifiers, property access, calls) is rejected.
 */
const FORMULA_FUNCTIONS = /\b(min|max|floor|ceil|round|abs|sqrt|pow|clamp)\s*\(/gi;
const FORMULA_DICE = /\b\d*d(\d+|[fF])([a-zA-Z]+\d*[<>=]?\d*)*/g;
const FORMULA_REFS = /@[a-zA-Z_][a-zA-Z0-9_.]*/g;
const FORMULA_RESIDUE = /^[\d\s+\-*/().,]*$/;

function formulaIsStructurallySafe(text) {
  if ( /[;`\[\]{}=]/.test(text.replace(FORMULA_DICE, "")) ) return false;
  const residue = text.replace(FORMULA_REFS, "0").replace(FORMULA_DICE, "0").replace(FORMULA_FUNCTIONS, "(");
  return FORMULA_RESIDUE.test(residue);
}

/**
 * Collapse whitespace, strip control characters and HTML tags, and truncate.
 * @param {*} value
 * @param {number} limit
 * @returns {string}
 */
export function sanitizeText(value, limit) {
  if ( (value === null) || (value === undefined) ) return "";
  let text = String(value);
  text = text.replace(/<[^>]*>/g, "");
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  if ( limit && (text.length > limit) ) text = text.slice(0, limit);
  return text;
}

/**
 * Validate a dice formula without evaluating it.
 * @param {string} formula
 * @param {object} [runtime]
 * @param {Function} [runtime.validateFormula]  Runtime validator (e.g. Roll.validate).
 * @returns {boolean}
 */
export function isSafeFormula(formula, runtime={}) {
  const text = sanitizeText(formula, TEXT_LIMITS.formula);
  if ( !text ) return false;
  if ( !formulaIsStructurallySafe(text) ) return false;
  if ( typeof runtime.validateFormula === "function" ) {
    try {
      return runtime.validateFormula(text) !== false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Validate and normalize one structured mechanic.
 * @param {object} raw
 * @param {object} [runtime]
 * @returns {{valid: boolean, errors: string[], value: object|null}}
 */
export function validateMechanic(raw, runtime={}) {
  const errors = [];
  if ( !raw || (typeof raw !== "object") ) return { valid: false, errors: ["mechanic.invalid"], value: null };
  const type = String(raw.type ?? "");
  if ( !MECHANIC_TYPE_LIST.includes(type) ) return { valid: false, errors: ["mechanic.unsupportedType"], value: null };

  const value = { type };
  const formula = sanitizeText(raw.formula, TEXT_LIMITS.formula);
  const label = sanitizeText(raw.label, TEXT_LIMITS.shortField);
  if ( label ) value.label = label;

  switch ( type ) {
    case MECHANIC_TYPES.DAMAGE: {
      if ( !isSafeFormula(formula, runtime) ) errors.push("mechanic.formula");
      value.formula = formula;
      const damageType = sanitizeText(raw.damageType, 30).toLowerCase();
      if ( damageType ) {
        const known = runtime.damageTypes ? runtime.damageTypes.includes(damageType) : /^[a-z]+$/.test(damageType);
        if ( !known ) errors.push("mechanic.damageType");
        value.damageType = damageType;
      }
      break;
    }
    case MECHANIC_TYPES.HEAL:
    case MECHANIC_TYPES.TEMP_HP: {
      if ( !isSafeFormula(formula, runtime) ) errors.push("mechanic.formula");
      value.formula = formula;
      break;
    }
    case MECHANIC_TYPES.SAVE:
    case MECHANIC_TYPES.CHECK: {
      const ability = sanitizeText(raw.ability, 3).toLowerCase();
      if ( !ABILITY_IDS.includes(ability) ) errors.push("mechanic.ability");
      value.ability = ability;
      const dc = Number(raw.dc);
      if ( Number.isFinite(dc) && (dc >= 1) && (dc <= 40) ) value.dc = Math.trunc(dc);
      else if ( (raw.dc !== undefined) && (raw.dc !== null) && (raw.dc !== "") ) errors.push("mechanic.dc");
      if ( type === MECHANIC_TYPES.CHECK ) {
        const skill = sanitizeText(raw.skill, 3).toLowerCase();
        if ( skill ) {
          const known = runtime.skills ? runtime.skills.includes(skill) : /^[a-z]{3}$/.test(skill);
          if ( !known ) errors.push("mechanic.skill");
          value.skill = skill;
        }
      }
      break;
    }
    case MECHANIC_TYPES.APPLY_CONDITION:
    case MECHANIC_TYPES.REMOVE_CONDITION: {
      const status = sanitizeText(raw.status, 40).toLowerCase();
      const known = runtime.statuses ? runtime.statuses.includes(status) : /^[a-z][a-z0-9-]*$/.test(status);
      if ( !status || !known ) errors.push("mechanic.status");
      value.status = status;
      if ( type === MECHANIC_TYPES.APPLY_CONDITION ) {
        const rounds = Number(raw.rounds);
        if ( Number.isFinite(rounds) && (rounds > 0) && (rounds <= 100) ) value.rounds = Math.trunc(rounds);
      }
      break;
    }
    case MECHANIC_TYPES.TEMPLATE: {
      const shape = sanitizeText(raw.shape, 10).toLowerCase();
      if ( !TEMPLATE_TYPES.includes(shape) ) errors.push("mechanic.shape");
      value.shape = shape;
      const distance = Number(raw.distance);
      if ( !Number.isFinite(distance) || (distance <= 0) || (distance > 1000) ) errors.push("mechanic.distance");
      else value.distance = distance;
      break;
    }
    case MECHANIC_TYPES.PROMPT: {
      const title = sanitizeText(raw.title, TEXT_LIMITS.shortField);
      const options = Array.isArray(raw.options) ? raw.options : String(raw.options ?? "").split(/\n|\|/);
      const cleaned = options.map(o => sanitizeText(o, TEXT_LIMITS.shortField)).filter(Boolean).slice(0, 8);
      if ( cleaned.length < 2 ) errors.push("mechanic.promptOptions");
      value.title = title;
      value.options = cleaned;
      break;
    }
    case MECHANIC_TYPES.NOTE: {
      const text = sanitizeText(raw.text, TEXT_LIMITS.shortField);
      if ( !text ) errors.push("mechanic.note");
      value.text = text;
      break;
    }
  }

  return { valid: !errors.length, errors, value: errors.length ? null : value };
}

/**
 * Validate and normalize an ability definition.
 * @param {object} raw
 * @param {object} [options]
 * @param {object} [options.runtime]       Runtime validators (formula, damage types, statuses, skills).
 * @param {number} [options.defaultCost=1]
 * @param {number} [options.maxCost=3]
 * @returns {{valid: boolean, errors: string[], value: object|null}}
 */
export function validateAbilityDefinition(raw, { runtime={}, defaultCost=1, maxCost=3 }={}) {
  const errors = [];
  if ( !raw || (typeof raw !== "object") ) return { valid: false, errors: ["ability.invalid"], value: null };

  const name = sanitizeText(raw.name, TEXT_LIMITS.name);
  if ( name.length < 2 ) errors.push("ability.name");
  const description = sanitizeText(raw.description, TEXT_LIMITS.description);
  if ( description.length < 10 ) errors.push("ability.description");

  const mode = raw.mode === ABILITY_MODES.AUTOMATED ? ABILITY_MODES.AUTOMATED : ABILITY_MODES.MANUAL;

  const activationType = ACTIVATION_TYPES.includes(raw.activation?.type) ? raw.activation.type : "action";
  const activation = {
    type: activationType,
    condition: sanitizeText(raw.activation?.condition, TEXT_LIMITS.shortField)
  };

  let cost = Number(raw.cost);
  if ( !Number.isFinite(cost) ) cost = defaultCost;
  cost = Math.trunc(cost);
  if ( (cost < 1) || (cost > maxCost) ) errors.push("ability.cost");

  const mechanics = [];
  if ( mode === ABILITY_MODES.AUTOMATED ) {
    const rawMechanics = Array.isArray(raw.mechanics) ? raw.mechanics : [];
    if ( !rawMechanics.length ) errors.push("ability.noMechanics");
    if ( rawMechanics.length > 8 ) errors.push("ability.tooManyMechanics");
    for ( const m of rawMechanics.slice(0, 8) ) {
      const res = validateMechanic(m, runtime);
      if ( !res.valid ) errors.push(...res.errors);
      else mechanics.push(res.value);
    }
  }

  const approval = {
    status: Object.values(APPROVAL_STATES).includes(raw.approval?.status)
      ? raw.approval.status : APPROVAL_STATES.NOT_REQUIRED,
    by: sanitizeText(raw.approval?.by, 32) || null,
    at: Number.isFinite(Number(raw.approval?.at)) ? Number(raw.approval.at) : null
  };

  const value = {
    schemaVersion: ABILITY_SCHEMA_VERSION,
    name,
    description,
    mode,
    activation,
    target: sanitizeText(raw.target, TEXT_LIMITS.shortField),
    range: sanitizeText(raw.range, TEXT_LIMITS.shortField),
    duration: sanitizeText(raw.duration, TEXT_LIMITS.shortField),
    cost,
    mechanics,
    approval,
    meta: {
      createdBy: sanitizeText(raw.meta?.createdBy, 32) || null,
      createdAt: Number.isFinite(Number(raw.meta?.createdAt)) ? Number(raw.meta.createdAt) : null,
      updatedBy: sanitizeText(raw.meta?.updatedBy, 32) || null,
      updatedAt: Number.isFinite(Number(raw.meta?.updatedAt)) ? Number(raw.meta.updatedAt) : null
    }
  };

  return { valid: !errors.length, errors, value: errors.length ? null : value };
}

/**
 * Determine whether changing from one definition to another modifies executable mechanics.
 * @param {object|null} before
 * @param {object|null} after
 * @returns {boolean}
 */
export function mechanicsChanged(before, after) {
  const a = JSON.stringify({ mode: before?.mode ?? null, mechanics: before?.mechanics ?? [], cost: before?.cost ?? 1 });
  const b = JSON.stringify({ mode: after?.mode ?? null, mechanics: after?.mechanics ?? [], cost: after?.cost ?? 1 });
  return a !== b;
}

/**
 * Whether a stored definition is usable (defined and valid enough to display).
 * @param {object|null} def
 * @returns {boolean}
 */
export function isDefined(def) {
  return !!def && (typeof def === "object") && (typeof def.name === "string") && (def.name.trim().length > 0);
}
