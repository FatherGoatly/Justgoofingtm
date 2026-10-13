import { describe, it, expect } from "vitest";
import { validateFormula, splitSimpleDice, cleanFormulaText, evaluate } from "../../scripts/rules/formula-validator.js";

describe("formula validator", () => {
  it("accepts simple dice formulas and computes statistics", () => {
    const v = validateFormula("2d6 + 3");
    expect(v.valid).toBe(true);
    expect(v.formula).toBe("2d6 + 3");
    expect(v.deterministic).toBe(false);
    expect(v.average).toBe(10);
    expect(v.min).toBe(5);
    expect(v.max).toBe(15);
    expect(v.dice).toEqual(["2d6"]);
  });

  it("accepts references and functions from the allow-list", () => {
    const v = validateFormula("floor(@abilities.str.mod / 2) + @prof + max(1, @item.level)");
    expect(v.valid).toBe(true);
    expect(v.references).toEqual(["abilities.str.mod", "prof", "item.level"]);
    expect(v.functions).toEqual(["floor", "max"]);
  });

  it("rejects disallowed references, functions and characters", () => {
    expect(validateFormula("@flags.foo").valid).toBe(false);
    expect(validateFormula("@abilities.__proto__.x").valid).toBe(false);
    expect(validateFormula("eval(1)").valid).toBe(false);
    expect(validateFormula("1d6; alert(1)").valid).toBe(false);
    expect(validateFormula("1d6 + window.foo").valid).toBe(false);
    expect(validateFormula("1d6 ** 2").valid).toBe(false);
    expect(validateFormula("1d6 +").valid).toBe(false);
    expect(validateFormula("(1d6").valid).toBe(false);
  });

  it("enforces size limits", () => {
    expect(validateFormula("999d6").valid).toBe(false);
    expect(validateFormula("1d5000").valid).toBe(false);
    expect(validateFormula("1d6 + ".repeat(100) + "1").valid).toBe(false);
  });

  it("supports deterministic-only mode", () => {
    expect(validateFormula("3 + @prof", { deterministic: true }).valid).toBe(true);
    expect(validateFormula("1d4", { deterministic: true }).valid).toBe(false);
  });

  it("evaluates references against data", () => {
    const v = validateFormula("8 + @prof + @abilities.wis.mod", { data: { prof: 3, abilities: { wis: { mod: 2 } } } });
    expect(v.average).toBe(13);
  });

  it("accepts dice modifiers from the allow-list", () => {
    expect(validateFormula("2d20kh").valid).toBe(true);
    expect(validateFormula("4d6kh3").valid).toBe(true);
    expect(validateFormula("1d8r1").valid).toBe(true);
    expect(validateFormula("1d8ro<2").valid).toBe(true);
    expect(validateFormula("1d6x").valid).toBe(true);
    expect(validateFormula("1d6zz").valid).toBe(false);
  });

  it("splits simple dice formulas", () => {
    expect(splitSimpleDice("1d6 + 2")).toEqual({ number: 1, denomination: 6, bonus: "2" });
    expect(splitSimpleDice("2d6")).toEqual({ number: 2, denomination: 6, bonus: "" });
    expect(splitSimpleDice("1d6 + 1d4")).toBeNull();
    expect(splitSimpleDice("3")).toBeNull();
  });

  it("cleans formula text", () => {
    expect(cleanFormulaText("1d6 − 1")).toBe("1d6 - 1");
    expect(cleanFormulaText("2d8+3")).toBe("2d8 + 3");
  });

  it("empty formulas are valid unless disallowed", () => {
    expect(validateFormula("").valid).toBe(true);
    expect(validateFormula("", { allowEmpty: false }).valid).toBe(false);
  });

  it("evaluate handles min/max keep modifiers", () => {
    const v = validateFormula("2d20kh1");
    expect(evaluate(v.ast, {}, { dice: "max" })).toBe(20);
  });
});
