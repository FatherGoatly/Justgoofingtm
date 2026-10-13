import { describe, it, expect } from "vitest";
import { clampPool, computeAward, computeSpend, computeAdjust } from "../../scripts/resource-math.js";

describe("resource math", () => {
  it("awards from zero, one and two", () => {
    expect(computeAward(0)).toMatchObject({ after: 1, applied: true, blocked: false });
    expect(computeAward(1)).toMatchObject({ after: 2, applied: true });
    expect(computeAward(2)).toMatchObject({ after: 3, applied: true });
  });
  it("blocks a fourth award without converting overflow", () => {
    expect(computeAward(3)).toMatchObject({ before: 3, after: 3, applied: false, blocked: true });
  });
  it("spends and refuses when insufficient or cost invalid", () => {
    expect(computeSpend(2)).toMatchObject({ ok: true, after: 1 });
    expect(computeSpend(0)).toMatchObject({ ok: false, reason: "insufficient", after: 0 });
    expect(computeSpend(1, 2)).toMatchObject({ ok: false, reason: "insufficient" });
    expect(computeSpend(3, 0)).toMatchObject({ ok: false, reason: "invalidCost" });
    expect(computeSpend(3, 3)).toMatchObject({ ok: true, after: 0 });
  });
  it("adjusts within bounds, clamps, and overrides only when allowed", () => {
    expect(computeAdjust(1, { delta: 1 })).toMatchObject({ after: 2, changed: true, clamped: false });
    expect(computeAdjust(3, { delta: 1 })).toMatchObject({ after: 3, clamped: true });
    expect(computeAdjust(0, { delta: -1 })).toMatchObject({ after: 0, clamped: true });
    expect(computeAdjust(0, { value: 5 })).toMatchObject({ after: 3, clamped: true, overridden: false });
    expect(computeAdjust(0, { value: 5, override: true })).toMatchObject({ after: 5, overridden: true });
    expect(computeAdjust(2, { value: "garbage" })).toMatchObject({ after: 2, changed: false });
  });
  it("clamps garbage stored values", () => {
    expect(clampPool("7")).toBe(3);
    expect(clampPool(-2)).toBe(0);
    expect(clampPool(undefined)).toBe(0);
    expect(clampPool(2.9)).toBe(2);
  });
});
