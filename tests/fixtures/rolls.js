/**
 * Roll fixtures modeled on the serialized form of dnd5e 6.0.6 D20Roll / DamageRoll (`roll.toJSON()`), as stored in
 * ChatMessage#rolls. Structure verified against `module/dice/d20-roll.mjs`, `d20-die.mjs`, `basic-die.mjs`:
 *  - terms[0] is the D20Die; advantage keeps results flagged { active, discarded }, rerolls flag { rerolled }.
 *  - options carry advantageMode, criticalSuccess/Failure, rollType and anything a module stores there.
 */

export function dieResult(result, { active=true, discarded=false, rerolled=false }={}) {
  const r = { result, active };
  if ( discarded ) r.discarded = true;
  if ( rerolled ) r.rerolled = true;
  return r;
}

/**
 * Build a serialized D20Roll.
 * @param {object} cfg
 * @param {object[]} cfg.results        Die results for the primary d20.
 * @param {string[]} [cfg.modifiers]    Modifiers on the d20 (e.g. ["adv"], ["dis"], ["r1=1"], ["min10"]).
 * @param {number} [cfg.advantageMode]  1, -1 or 0.
 * @param {number} [cfg.modifier=0]     Flat modifier added to the formula.
 * @param {string} [cfg.rollType]       "attack" | "check" | "save".
 * @param {object} [cfg.options]        Extra options.
 * @param {object[]} [cfg.extraTerms]   Extra serialized terms appended after the modifier.
 */
export function d20Roll({ results, modifiers=[], advantageMode=0, modifier=0, rollType, options={}, extraTerms=[], evaluated=true }={}) {
  const active = results.filter(r => (r.active !== false) && !r.discarded && !r.rerolled);
  const dieTotal = active.reduce((t, r) => t + r.result, 0);
  const terms = [
    { class: "D20Die", evaluated, number: 1, faces: 20, modifiers, results, options: { advantageMode, criticalSuccess: 20, criticalFailure: 1 } }
  ];
  if ( modifier ) {
    terms.push({ class: "OperatorTerm", evaluated, operator: modifier < 0 ? "-" : "+" });
    terms.push({ class: "NumericTerm", evaluated, number: Math.abs(modifier) });
  }
  terms.push(...extraTerms);
  const extraTotal = extraTerms.filter(t => t.class !== "OperatorTerm").reduce((t, term) => {
    if ( term.class === "NumericTerm" ) return t + term.number;
    if ( Array.isArray(term.results) ) return t + term.results.filter(r => r.active !== false).reduce((s, r) => s + r.result, 0);
    return t;
  }, 0);
  const formula = `1d20${modifiers.join("")}${modifier ? ` ${modifier < 0 ? "-" : "+"} ${Math.abs(modifier)}` : ""}`;
  return {
    class: "D20Roll",
    options: { advantageMode, criticalSuccess: 20, criticalFailure: 1, ...(rollType ? { rollType } : {}), ...options },
    formula,
    terms,
    total: dieTotal + modifier + extraTotal,
    evaluated
  };
}

export const natural20Attack = () => d20Roll({ results: [dieResult(20)], modifier: 5, rollType: "attack" });
export const natural1Attack = () => d20Roll({ results: [dieResult(1)], modifier: 5, rollType: "attack" });
export const natural20Check = () => d20Roll({ results: [dieResult(20)], modifier: 2, rollType: "check" });
export const natural1Save = () => d20Roll({ results: [dieResult(1)], modifier: -2, rollType: "save" });
export const total20NoNatural = () => d20Roll({ results: [dieResult(15)], modifier: 5, rollType: "check" });
export const total1NoNatural = () => d20Roll({ results: [dieResult(4)], modifier: -3, rollType: "save" });
export const natural19Champion = () => d20Roll({ results: [dieResult(19)], modifier: 5, rollType: "attack", options: { criticalSuccess: 19 } });

/** Advantage: rolled 1 and 20, keeps 20. */
export const advantage1and20 = () => d20Roll({
  results: [dieResult(1, { active: false, discarded: true }), dieResult(20)], modifiers: ["adv"], advantageMode: 1, modifier: 3, rollType: "attack"
});
/** Disadvantage: rolled 1 and 20, keeps 1. */
export const disadvantage1and20 = () => d20Roll({
  results: [dieResult(1), dieResult(20, { active: false, discarded: true })], modifiers: ["dis"], advantageMode: -1, modifier: 3, rollType: "attack"
});
/** Advantage: rolled 1 and 8, keeps 8. */
export const advantage1and8 = () => d20Roll({
  results: [dieResult(1, { active: false, discarded: true }), dieResult(8)], modifiers: ["adv"], advantageMode: 1, rollType: "check"
});
/** Disadvantage: rolled 15 and 20, keeps 15. */
export const disadvantage15and20 = () => d20Roll({
  results: [dieResult(15), dieResult(20, { active: false, discarded: true })], modifiers: ["dis"], advantageMode: -1, rollType: "save"
});
/** Elven accuracy: three dice, keeps 20. */
export const elvenAccuracy = () => d20Roll({
  results: [dieResult(3, { active: false, discarded: true }), dieResult(20), dieResult(11, { active: false, discarded: true })],
  modifiers: ["adv2"], advantageMode: 1, rollType: "attack"
});

/** Halfling Lucky: natural 1 rerolled into 20. */
export const rerolled1to20 = () => d20Roll({
  results: [dieResult(1, { active: false, rerolled: true }), dieResult(20)], modifiers: ["r1=1"], rollType: "attack"
});
/** Halfling Lucky: natural 1 rerolled into 7. */
export const rerolled1to7 = () => d20Roll({
  results: [dieResult(1, { active: false, rerolled: true }), dieResult(7)], modifiers: ["r1=1"], rollType: "attack"
});
/** Reliable talent: natural 1 raised to 10 by min10 (result face unchanged). */
export const reliableTalentNatural1 = () => d20Roll({
  results: [{ result: 1, active: true, count: 10 }], modifiers: ["min10"], rollType: "check"
});

/** Attack roll whose formula also carries a bonus d20-sized die elsewhere (never the primary die). */
export const attackWithSecondaryD20 = () => d20Roll({
  results: [dieResult(12)], modifier: 4, rollType: "attack",
  extraTerms: [
    { class: "OperatorTerm", evaluated: true, operator: "+" },
    { class: "Die", evaluated: true, number: 1, faces: 20, modifiers: [], results: [dieResult(20)] }
  ]
});

/** Damage roll with d20-shaped dice: must never award. */
export const damageRollWithD20s = () => ({
  class: "DamageRoll",
  options: { type: "slashing", rollType: "damage" },
  formula: "2d20 + 3",
  terms: [
    { class: "Die", evaluated: true, number: 2, faces: 20, modifiers: [], results: [dieResult(20), dieResult(1)] },
    { class: "OperatorTerm", evaluated: true, operator: "+" },
    { class: "NumericTerm", evaluated: true, number: 3 }
  ],
  total: 24,
  evaluated: true
});

/** Unevaluated roll (configured but not rolled). */
export const unevaluated = () => d20Roll({ results: [], rollType: "attack", evaluated: false });

/** A plain core Roll (e.g. /r 1d20) — unknown provenance. */
export const plainCoreRoll = () => ({
  class: "Roll", options: {}, formula: "1d20",
  terms: [{ class: "Die", evaluated: true, number: 1, faces: 20, modifiers: [], results: [dieResult(20)] }],
  total: 20, evaluated: true
});
