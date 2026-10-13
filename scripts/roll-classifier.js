/**
 * Natural-result classification for D&D 5e d20 tests.
 *
 * Verified against dnd5e 6.0.6 (`module/dice/d20-roll.mjs`, `d20-die.mjs`, `basic-die.mjs`):
 *  - The primary d20 of a D20Roll is always `roll.terms[0]`, an instance of `D20Die` (faces 20).
 *  - Advantage/disadvantage use the system's `adv`/`dis` modifiers, which keep the best or worst set and mark the
 *    others `{ discarded: true, active: false }`.
 *  - Rerolls (Halfling Lucky `r1=1`) mark the replaced die `{ rerolled: true, active: false }` and append a result.
 *  - Minimum modifiers (Reliable Talent) never change `result`; they only raise the counted value.
 *  - Roll options are serialized into chat messages (`roll.toJSON()` includes `options`), so classification works on
 *    live Roll instances and on message roll data alike.
 *
 * This file must stay free of Foundry globals so it can be unit tested.
 */

import {
  ADVANTAGE_POLICIES,
  NATURAL_TRIGGERS,
  POOLS,
  REROLL_POLICIES,
  ROLL_CATEGORIES
} from "./constants.js";

export const CLASSIFY_REASONS = Object.freeze({
  NOT_EVALUATED: "notEvaluated",
  NO_PRIMARY_D20: "noPrimaryD20",
  ADVANTAGE_EXCLUDED: "advantageExcluded",
  REROLL_EXCLUDED: "rerollExcluded",
  NO_SELECTED_DIE: "noSelectedDie",
  AMBIGUOUS_SELECTION: "ambiguousSelection",
  NO_TRIGGER: "noTrigger",
  POOL_DISABLED: "poolDisabled",
  QUALIFIES: "qualifies"
});

/**
 * Normalize a die result record from either a live DiceTerm or serialized data.
 * @param {object} r
 * @returns {{result: number, active: boolean, discarded: boolean, rerolled: boolean}}
 */
export function normalizeDieResult(r) {
  const discarded = r.discarded === true;
  const rerolled = r.rerolled === true;
  const active = (r.active !== false) && !discarded && !rerolled;
  return { result: Number(r.result), active, discarded, rerolled };
}

/**
 * Extract the primary d20 of a roll, if the roll's first term is a 20-sided die term.
 * Damage dice and secondary d20s elsewhere in the formula are deliberately ignored.
 * @param {object} roll  A Roll instance or its JSON representation.
 * @returns {{faces: number, modifiers: string[], results: object[], className: string}|null}
 */
export function extractPrimaryD20(roll) {
  const terms = roll?.terms;
  if ( !Array.isArray(terms) || !terms.length ) return null;
  const first = terms[0];
  if ( !first || (typeof first !== "object") ) return null;
  if ( Number(first.faces) !== 20 ) return null;
  if ( !Array.isArray(first.results) ) return null;
  return {
    faces: 20,
    className: first.class ?? first.constructor?.name ?? "Die",
    modifiers: Array.isArray(first.modifiers) ? first.modifiers.map(m => String(m)) : [],
    results: first.results.map(normalizeDieResult)
  };
}

/**
 * Determine whether a roll was evaluated.
 * @param {object} roll
 * @returns {boolean}
 */
export function isRollEvaluated(roll) {
  if ( !roll ) return false;
  if ( typeof roll.evaluated === "boolean" ) return roll.evaluated;
  if ( typeof roll._evaluated === "boolean" ) return roll._evaluated;
  return false;
}

/**
 * Determine the advantage mode of a roll: 1 (advantage), -1 (disadvantage) or 0 (normal).
 * @param {object} roll
 * @param {{modifiers: string[]}|null} d20
 * @returns {number}
 */
export function getAdvantageMode(roll, d20) {
  const mode = Number(roll?.options?.advantageMode);
  if ( (mode === 1) || (mode === -1) || (mode === 0) ) return mode;
  const mods = d20?.modifiers ?? [];
  if ( mods.some(m => /^adv\d*$/i.test(m) || /^kh\d*$/i.test(m)) ) return 1;
  if ( mods.some(m => /^dis\d*$/i.test(m) || /^kl\d*$/i.test(m)) ) return -1;
  return 0;
}

/**
 * Determine the pool a natural face value maps to.
 * @param {number} natural
 * @returns {string|null}
 */
export function poolForNatural(natural) {
  if ( natural === NATURAL_TRIGGERS[POOLS.HEROIC] ) return POOLS.HEROIC;
  if ( natural === NATURAL_TRIGGERS[POOLS.VILLAINOUS] ) return POOLS.VILLAINOUS;
  return null;
}

/**
 * Classify a roll under the configured policies.
 * @param {object} roll  A Roll instance or its serialized data.
 * @param {object} [policy]
 * @param {string} [policy.advantagePolicy="selected"]
 * @param {string} [policy.rerollPolicy="final"]
 * @param {boolean} [policy.enableHeroic=true]
 * @param {boolean} [policy.enableVillainous=true]
 * @returns {{qualifies: boolean, reason: string, outcomes: {pool: string, natural: number}[],
 *   selectedNatural: number|null, naturals: number[], advantageMode: number, rerolled: boolean, d20: object|null}}
 */
export function classifyRoll(roll, policy={}) {
  const {
    advantagePolicy=ADVANTAGE_POLICIES.SELECTED,
    rerollPolicy=REROLL_POLICIES.FINAL,
    enableHeroic=true,
    enableVillainous=true
  } = policy;

  const base = {
    qualifies: false, reason: CLASSIFY_REASONS.NO_PRIMARY_D20, outcomes: [],
    selectedNatural: null, naturals: [], advantageMode: 0, rerolled: false, d20: null
  };

  if ( !isRollEvaluated(roll) ) return { ...base, reason: CLASSIFY_REASONS.NOT_EVALUATED };
  const d20 = extractPrimaryD20(roll);
  if ( !d20 ) return base;

  const advantageMode = getAdvantageMode(roll, d20);
  const rerolled = d20.results.some(r => r.rerolled);
  const result = { ...base, d20, advantageMode, rerolled, naturals: d20.results.map(r => r.result) };

  if ( (advantagePolicy === ADVANTAGE_POLICIES.ORDINARY_ONLY) && (advantageMode !== 0) ) {
    return { ...result, reason: CLASSIFY_REASONS.ADVANTAGE_EXCLUDED };
  }
  if ( (rerollPolicy === REROLL_POLICIES.EXCLUDE_REROLLED) && rerolled ) {
    return { ...result, reason: CLASSIFY_REASONS.REROLL_EXCLUDED };
  }

  let candidates;
  if ( advantagePolicy === ADVANTAGE_POLICIES.ANY ) {
    // Every die that was part of the completed roll, excluding dice replaced by a reroll.
    candidates = d20.results.filter(r => !r.rerolled);
  } else {
    const active = d20.results.filter(r => r.active);
    if ( !active.length ) return { ...result, reason: CLASSIFY_REASONS.NO_SELECTED_DIE };
    if ( (active.length > 1) && (new Set(active.map(r => r.result)).size > 1) ) {
      return { ...result, reason: CLASSIFY_REASONS.AMBIGUOUS_SELECTION };
    }
    candidates = [active[0]];
    result.selectedNatural = active[0].result;
  }

  const enabled = { [POOLS.HEROIC]: enableHeroic, [POOLS.VILLAINOUS]: enableVillainous };
  const outcomes = [];
  let disabledHit = false;
  for ( const candidate of candidates ) {
    const pool = poolForNatural(candidate.result);
    if ( !pool ) continue;
    if ( !enabled[pool] ) { disabledHit = true; continue; }
    if ( outcomes.some(o => o.pool === pool) ) continue;
    outcomes.push({ pool, natural: candidate.result });
  }

  if ( !outcomes.length ) {
    return { ...result, reason: disabledHit ? CLASSIFY_REASONS.POOL_DISABLED : CLASSIFY_REASONS.NO_TRIGGER };
  }
  return { ...result, qualifies: true, reason: CLASSIFY_REASONS.QUALIFIES, outcomes };
}

/* -------------------------------------------- */
/*  Category determination                      */
/* -------------------------------------------- */

const HOOK_CATEGORY = Object.freeze({
  rollAttack: ROLL_CATEGORIES.ATTACK,
  rollAttackV2: ROLL_CATEGORIES.ATTACK,
  rollAbilityCheck: ROLL_CATEGORIES.ABILITY_CHECK,
  rollAbilityCheckV2: ROLL_CATEGORIES.ABILITY_CHECK,
  rollSkill: ROLL_CATEGORIES.SKILL_CHECK,
  rollSkillV2: ROLL_CATEGORIES.SKILL_CHECK,
  rollToolCheck: ROLL_CATEGORIES.TOOL_CHECK,
  rollToolCheckV2: ROLL_CATEGORIES.TOOL_CHECK,
  rollSavingThrow: ROLL_CATEGORIES.SAVING_THROW,
  rollSavingThrowV2: ROLL_CATEGORIES.SAVING_THROW,
  rollDeathSave: ROLL_CATEGORIES.DEATH_SAVE,
  rollDeathSaveV2: ROLL_CATEGORIES.DEATH_SAVE,
  rollConcentration: ROLL_CATEGORIES.CONCENTRATION,
  rollConcentrationV2: ROLL_CATEGORIES.CONCENTRATION,
  rollInitiative: ROLL_CATEGORIES.INITIATIVE
});

/**
 * Determine the roll category from the richest available provenance: message type/system data first, then the
 * delivering hook, then the roll's own options (`rollType`, `saveType`, `isConcentration`).
 * @param {object} source
 * @param {string} [source.hookName]       dnd5e hook name without the `dnd5e.` prefix.
 * @param {object} [source.rollOptions]    `roll.options` from the D20Roll.
 * @param {string} [source.messageType]    `message.type` (dnd5e: attack, check, save, ...).
 * @param {object} [source.messageSystem]  `message.system` data.
 * @returns {string}  One of ROLL_CATEGORIES.
 */
export function determineCategory({ hookName, rollOptions={}, messageType, messageSystem={} }={}) {
  const saveType = rollOptions?.saveType ?? messageSystem?.type;
  const isConcentration = (rollOptions?.isConcentration === true) || (saveType === "concentration");
  const refineSave = () => {
    if ( saveType === "death" ) return ROLL_CATEGORIES.DEATH_SAVE;
    if ( isConcentration ) return ROLL_CATEGORIES.CONCENTRATION;
    return ROLL_CATEGORIES.SAVING_THROW;
  };

  if ( messageType === "attack" ) return ROLL_CATEGORIES.ATTACK;
  if ( messageType === "save" ) return refineSave();
  if ( messageType === "check" ) {
    if ( messageSystem?.type === "initiative" ) return ROLL_CATEGORIES.INITIATIVE;
    if ( messageSystem?.skill ) return ROLL_CATEGORIES.SKILL_CHECK;
    if ( messageSystem?.tool ) return ROLL_CATEGORIES.TOOL_CHECK;
    return ROLL_CATEGORIES.ABILITY_CHECK;
  }

  const hookCategory = HOOK_CATEGORY[hookName];
  if ( hookCategory ) return hookCategory === ROLL_CATEGORIES.SAVING_THROW ? refineSave() : hookCategory;

  const rollType = rollOptions?.rollType;
  if ( rollType === "attack" ) return ROLL_CATEGORIES.ATTACK;
  if ( rollType === "save" ) return refineSave();
  if ( rollType === "check" ) return ROLL_CATEGORIES.ABILITY_CHECK;
  if ( rollType === "initiative" ) return ROLL_CATEGORIES.INITIATIVE;
  return ROLL_CATEGORIES.UNKNOWN;
}

/**
 * Whether a roll is a D&D 5e D20Roll by class name.
 * @param {object} roll
 * @returns {boolean}
 */
export function isD20TestRoll(roll) {
  return (roll?.class ?? roll?.constructor?.name) === "D20Roll";
}
