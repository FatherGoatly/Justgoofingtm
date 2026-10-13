import { describe, it, expect } from "vitest";
import { classifyRoll, determineCategory, extractPrimaryD20, CLASSIFY_REASONS, isD20TestRoll } from "../../scripts/roll-classifier.js";
import { ADVANTAGE_POLICIES, REROLL_POLICIES, ROLL_CATEGORIES } from "../../scripts/constants.js";
import * as F from "../fixtures/rolls.js";

const outcomes = r => classifyRoll(r).outcomes.map(o => o.pool);

describe("natural result extraction", () => {
  it("reads the primary d20 from terms[0]", () => {
    const d20 = extractPrimaryD20(F.natural20Attack());
    expect(d20.faces).toBe(20);
    expect(d20.results[0].result).toBe(20);
  });
  it("returns null for damage rolls that begin with non-d20 dice or are not D20Rolls", () => {
    expect(isD20TestRoll(F.damageRollWithD20s())).toBe(false);
    expect(extractPrimaryD20({ terms: [{ faces: 6, results: [{ result: 6 }] }] })).toBeNull();
  });
});

describe("natural 20 / natural 1 (default policy)", () => {
  it("natural 20 on an attack awards heroic", () => expect(outcomes(F.natural20Attack())).toEqual(["heroic"]));
  it("natural 1 on an attack awards villainous", () => expect(outcomes(F.natural1Attack())).toEqual(["villainous"]));
  it("natural 20 on an ability check awards heroic", () => expect(outcomes(F.natural20Check())).toEqual(["heroic"]));
  it("natural 1 on a saving throw awards villainous", () => expect(outcomes(F.natural1Save())).toEqual(["villainous"]));
  it("modified total of 20 without a natural 20 awards nothing", () => {
    const c = classifyRoll(F.total20NoNatural());
    expect(c.qualifies).toBe(false);
    expect(c.reason).toBe(CLASSIFY_REASONS.NO_TRIGGER);
    expect(F.total20NoNatural().total).toBe(20);
  });
  it("modified total of 1 without a natural 1 awards nothing", () => {
    expect(classifyRoll(F.total1NoNatural()).qualifies).toBe(false);
    expect(F.total1NoNatural().total).toBe(1);
  });
  it("a critical hit on a 19 (expanded crit range) is not a natural 20", () => {
    expect(classifyRoll(F.natural19Champion()).qualifies).toBe(false);
  });
  it("secondary d20 elsewhere in the formula is ignored", () => {
    expect(classifyRoll(F.attackWithSecondaryD20()).qualifies).toBe(false);
  });
  it("unevaluated rolls never qualify", () => {
    expect(classifyRoll(F.unevaluated()).reason).toBe(CLASSIFY_REASONS.NOT_EVALUATED);
  });
  it("respects pool enable flags", () => {
    expect(classifyRoll(F.natural20Attack(), { enableHeroic: false }).reason).toBe(CLASSIFY_REASONS.POOL_DISABLED);
    expect(classifyRoll(F.natural1Attack(), { enableVillainous: false }).qualifies).toBe(false);
  });
});

describe("advantage and disadvantage", () => {
  it("selected policy: advantage keeping 20 awards heroic only", () => {
    const c = classifyRoll(F.advantage1and20());
    expect(c.outcomes).toEqual([{ pool: "heroic", natural: 20 }]);
    expect(c.selectedNatural).toBe(20);
    expect(c.advantageMode).toBe(1);
  });
  it("selected policy: disadvantage keeping 1 awards villainous only", () => {
    expect(outcomes(F.disadvantage1and20())).toEqual(["villainous"]);
  });
  it("selected policy: advantage keeping 8 over a 1 awards nothing", () => {
    expect(classifyRoll(F.advantage1and8()).qualifies).toBe(false);
  });
  it("selected policy: disadvantage keeping 15 over a 20 awards nothing", () => {
    expect(classifyRoll(F.disadvantage15and20()).qualifies).toBe(false);
  });
  it("elven accuracy (three dice) uses the kept die", () => {
    expect(outcomes(F.elvenAccuracy())).toEqual(["heroic"]);
  });
  it("any-die policy awards for unselected dice too", () => {
    const c = classifyRoll(F.advantage1and8(), { advantagePolicy: ADVANTAGE_POLICIES.ANY });
    expect(c.outcomes.map(o => o.pool)).toEqual(["villainous"]);
    const both = classifyRoll(F.advantage1and20(), { advantagePolicy: ADVANTAGE_POLICIES.ANY });
    expect(both.outcomes.map(o => o.pool).sort()).toEqual(["heroic", "villainous"]);
  });
  it("ordinary-only policy excludes advantage/disadvantage rolls but keeps normal rolls", () => {
    expect(classifyRoll(F.advantage1and20(), { advantagePolicy: ADVANTAGE_POLICIES.ORDINARY_ONLY }).reason)
      .toBe(CLASSIFY_REASONS.ADVANTAGE_EXCLUDED);
    expect(classifyRoll(F.natural20Attack(), { advantagePolicy: ADVANTAGE_POLICIES.ORDINARY_ONLY }).qualifies).toBe(true);
  });
  it("falls back to modifier inspection when advantageMode is absent", () => {
    const roll = F.advantage1and20();
    delete roll.options.advantageMode;
    expect(classifyRoll(roll).advantageMode).toBe(1);
  });
});

describe("rerolls", () => {
  it("final policy: a rerolled 1 that becomes 20 awards heroic once and never villainous", () => {
    const c = classifyRoll(F.rerolled1to20());
    expect(c.outcomes).toEqual([{ pool: "heroic", natural: 20 }]);
    expect(c.rerolled).toBe(true);
  });
  it("final policy: a rerolled 1 that becomes 7 awards nothing", () => {
    expect(classifyRoll(F.rerolled1to7()).qualifies).toBe(false);
  });
  it("any-die policy ignores dice that were replaced by a reroll", () => {
    expect(classifyRoll(F.rerolled1to7(), { advantagePolicy: ADVANTAGE_POLICIES.ANY }).qualifies).toBe(false);
  });
  it("exclude policy: rolls with rerolls never award", () => {
    expect(classifyRoll(F.rerolled1to20(), { rerollPolicy: REROLL_POLICIES.EXCLUDE_REROLLED }).reason)
      .toBe(CLASSIFY_REASONS.REROLL_EXCLUDED);
  });
  it("reliable talent minimum does not hide the natural 1 face", () => {
    expect(outcomes(F.reliableTalentNatural1())).toEqual(["villainous"]);
  });
});

describe("category determination", () => {
  it("uses message provenance first", () => {
    expect(determineCategory({ messageType: "attack" })).toBe(ROLL_CATEGORIES.ATTACK);
    expect(determineCategory({ messageType: "check", messageSystem: { skill: "acr" } })).toBe(ROLL_CATEGORIES.SKILL_CHECK);
    expect(determineCategory({ messageType: "check", messageSystem: { tool: "thief" } })).toBe(ROLL_CATEGORIES.TOOL_CHECK);
    expect(determineCategory({ messageType: "check", messageSystem: { type: "initiative" } })).toBe(ROLL_CATEGORIES.INITIATIVE);
    expect(determineCategory({ messageType: "check", messageSystem: { ability: "str" } })).toBe(ROLL_CATEGORIES.ABILITY_CHECK);
    expect(determineCategory({ messageType: "save", messageSystem: { type: "death" } })).toBe(ROLL_CATEGORIES.DEATH_SAVE);
    expect(determineCategory({ messageType: "save", messageSystem: { type: "concentration" } })).toBe(ROLL_CATEGORIES.CONCENTRATION);
    expect(determineCategory({ messageType: "save", messageSystem: { type: "ability" } })).toBe(ROLL_CATEGORIES.SAVING_THROW);
  });
  it("uses the delivering hook when no message is available", () => {
    expect(determineCategory({ hookName: "rollSkill" })).toBe(ROLL_CATEGORIES.SKILL_CHECK);
    expect(determineCategory({ hookName: "rollSavingThrow", rollOptions: { saveType: "death" } })).toBe(ROLL_CATEGORIES.DEATH_SAVE);
    expect(determineCategory({ hookName: "rollSavingThrow", rollOptions: { isConcentration: true } })).toBe(ROLL_CATEGORIES.CONCENTRATION);
    expect(determineCategory({ hookName: "rollDeathSave" })).toBe(ROLL_CATEGORIES.DEATH_SAVE);
  });
  it("falls back to roll options and finally unknown", () => {
    expect(determineCategory({ rollOptions: { rollType: "attack" } })).toBe(ROLL_CATEGORIES.ATTACK);
    expect(determineCategory({})).toBe(ROLL_CATEGORIES.UNKNOWN);
  });
});
