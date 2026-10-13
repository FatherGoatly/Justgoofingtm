import { describe, it, expect } from "vitest";
import { evaluateFormula, validateFormula, seededRandom } from "../../scripts/workshop/dice.js";

describe("dice evaluator", () => {
  it("evaluates simple arithmetic and dice deterministically", () => {
    const r = evaluateFormula("2d6 + 3", {}, { random: seededRandom(1) });
    expect(r.total).toBeGreaterThanOrEqual(5);
    expect(r.total).toBeLessThanOrEqual(15);
    expect(r.dice[0].results.length).toBe(2);
    expect(evaluateFormula("1d20", {}, { maximize: true }).total).toBe(20);
    expect(evaluateFormula("4 * (2 + 1) - 2").total).toBe(10);
  });
  it("keeps highest and lowest", () => {
    const hi = evaluateFormula("2d20kh", {}, { random: seededRandom(7) });
    const vals = hi.dice[0].results.map(r => r.result);
    expect(hi.total).toBe(Math.max(...vals));
    const lo = evaluateFormula("2d20kl1", {}, { random: seededRandom(7) });
    expect(lo.total).toBe(Math.min(...lo.dice[0].results.map(r => r.result)));
  });
  it("substitutes data and reports missing paths", () => {
    expect(evaluateFormula("1d1 + @abilities.str.mod", { abilities: { str: { mod: 3 } } }).total).toBe(4);
    expect(() => evaluateFormula("1d4 + @nope")).toThrow(/@nope/);
  });
  it("validates formulas", () => {
    expect(validateFormula("1d20 + 5")).toBe(true);
    expect(validateFormula("1d20 +")).toBe(false);
    expect(validateFormula("hello")).toBe(false);
  });
});
