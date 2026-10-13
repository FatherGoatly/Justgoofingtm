import { describe, it, expect } from "vitest";
import { validateAbilityDefinition, validateMechanic, sanitizeText, isSafeFormula, mechanicsChanged, isDefined } from "../../scripts/ability-schema.js";

const good = () => ({ name: "Perfect Strike", description: "Your next attack this turn cannot miss.", mode: "manual" });

describe("ability definition validation", () => {
  it("accepts a manual definition and normalizes defaults", () => {
    const r = validateAbilityDefinition(good());
    expect(r.valid).toBe(true);
    expect(r.value).toMatchObject({ mode: "manual", cost: 1, activation: { type: "action" }, mechanics: [], approval: { status: "notRequired" } });
  });
  it("rejects empty or whitespace-only names and descriptions", () => {
    expect(validateAbilityDefinition({ ...good(), name: "   " }).errors).toContain("ability.name");
    expect(validateAbilityDefinition({ ...good(), description: "\n \t" }).errors).toContain("ability.description");
    expect(validateAbilityDefinition({ ...good(), description: "short" }).errors).toContain("ability.description");
  });
  it("strips HTML and control characters and enforces length limits", () => {
    expect(sanitizeText("<script>alert(1)</script>Hello\u0000 world", 100)).toBe("alert(1)Hello world");
    const r = validateAbilityDefinition({ ...good(), name: "x".repeat(500) });
    expect(r.value.name.length).toBe(80);
  });
  it("rejects invalid costs", () => {
    expect(validateAbilityDefinition({ ...good(), cost: 0 }).errors).toContain("ability.cost");
    expect(validateAbilityDefinition({ ...good(), cost: 4 }).errors).toContain("ability.cost");
    expect(validateAbilityDefinition({ ...good(), cost: 2 }).value.cost).toBe(2);
  });
  it("automated abilities need at least one valid mechanic", () => {
    expect(validateAbilityDefinition({ ...good(), mode: "automated" }).errors).toContain("ability.noMechanics");
    const r = validateAbilityDefinition({ ...good(), mode: "automated", mechanics: [{ type: "damage", formula: "2d6", damageType: "fire" }] });
    expect(r.valid).toBe(true);
    expect(r.value.mechanics[0]).toEqual({ type: "damage", formula: "2d6", damageType: "fire" });
  });
  it("never accepts code-like formulas or unknown mechanic types", () => {
    expect(isSafeFormula("2d6 + @abilities.str.mod")).toBe(true);
    expect(isSafeFormula("(function(){return 1})()")).toBe(false);
    expect(isSafeFormula("1d6; game.user.isGM = true")).toBe(false);
    expect(isSafeFormula("`${x}`")).toBe(false);
    expect(isSafeFormula("eval(1)")).toBe(false);
    expect(isSafeFormula("game.user.name")).toBe(false);
    expect(isSafeFormula("1d20r1=1 + 2d6kh1 + max(1d4, 2) + @prof")).toBe(true);
    expect(isSafeFormula("floor(@abilities.dex.mod / 2) + 1")).toBe(true);
    expect(validateMechanic({ type: "script", code: "x" }).errors).toContain("mechanic.unsupportedType");
    expect(validateMechanic({ type: "damage", formula: "eval(1)" }).errors).toContain("mechanic.formula");
  });
  it("validates mechanic fields against runtime catalogs", () => {
    const runtime = { damageTypes: ["fire"], statuses: ["prone"], skills: ["acr"], validateFormula: f => /^\d+d\d+$/.test(f) };
    expect(validateMechanic({ type: "damage", formula: "2d6", damageType: "acid" }, runtime).errors).toContain("mechanic.damageType");
    expect(validateMechanic({ type: "applyCondition", status: "dead" }, runtime).errors).toContain("mechanic.status");
    expect(validateMechanic({ type: "check", ability: "dex", skill: "ath" }, runtime).errors).toContain("mechanic.skill");
    expect(validateMechanic({ type: "save", ability: "xyz", dc: 15 }).errors).toContain("mechanic.ability");
    expect(validateMechanic({ type: "save", ability: "dex", dc: 99 }).errors).toContain("mechanic.dc");
    expect(validateMechanic({ type: "template", shape: "cube", distance: 10 }).errors).toContain("mechanic.shape");
    expect(validateMechanic({ type: "prompt", options: "only one" }).errors).toContain("mechanic.promptOptions");
    expect(validateMechanic({ type: "prompt", title: "Pick", options: "a | b" }).value.options).toEqual(["a", "b"]);
    expect(validateMechanic({ type: "heal", formula: "1d8" }, runtime).valid).toBe(true);
    expect(validateMechanic({ type: "heal", formula: "1d8+2" }, runtime).valid).toBe(false);
  });
  it("detects mechanics changes separately from descriptive edits", () => {
    const a = validateAbilityDefinition({ ...good(), mode: "automated", mechanics: [{ type: "note", text: "hi" }] }).value;
    const b = { ...a, description: "Different words entirely for this ability." };
    const c = { ...a, mechanics: [{ type: "note", text: "changed" }] };
    expect(mechanicsChanged(a, b)).toBe(false);
    expect(mechanicsChanged(a, c)).toBe(true);
    expect(isDefined(a)).toBe(true);
    expect(isDefined(null)).toBe(false);
    expect(isDefined({ name: " " })).toBe(false);
  });
});
