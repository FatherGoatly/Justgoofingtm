import { describe, it, expect } from "vitest";
import { evaluateActivation, ACTIVATION_REASONS, nextLegendaryUsage } from "../../scripts/activation-policy.js";

const base = { activationPolicy: "flexible", allowOutsideCombat: true, requireGMApprovalForAutomation: true, playersCanUseManualWithoutApproval: true, legendaryUsesPerRound: 1 };
const manual = { mode: "manual", cost: 1, activation: { type: "action" }, approval: { status: "notRequired" } };
const reaction = { ...manual, activation: { type: "reaction" } };

describe("activation policy", () => {
  it("blocks without resources", () => {
    expect(evaluateActivation({ ability: manual, available: 0, settings: base }).reason).toBe(ACTIVATION_REASONS.NO_RESOURCE);
    expect(evaluateActivation({ ability: { ...manual, cost: 2 }, available: 1, settings: base }).allowed).toBe(false);
  });
  it("flexible allows anything with resources", () => {
    expect(evaluateActivation({ ability: manual, available: 1, settings: base, combat: { active: true, isActorTurn: false } }).allowed).toBe(true);
  });
  it("outside combat can be forbidden for players but not the GM", () => {
    const s = { ...base, allowOutsideCombat: false };
    expect(evaluateActivation({ ability: manual, available: 1, settings: s }).reason).toBe(ACTIVATION_REASONS.OUTSIDE_COMBAT);
    expect(evaluateActivation({ ability: manual, available: 1, settings: s, isGM: true }).allowed).toBe(true);
  });
  it("turn-bound blocks off-turn actions but allows reactions and special activations", () => {
    const s = { ...base, activationPolicy: "turnBound" };
    const combat = { active: true, isActorTurn: false, round: 2, combatId: "c" };
    expect(evaluateActivation({ ability: manual, available: 1, settings: s, combat }).reason).toBe(ACTIVATION_REASONS.NOT_YOUR_TURN);
    expect(evaluateActivation({ ability: reaction, available: 1, settings: s, combat }).allowed).toBe(true);
    expect(evaluateActivation({ ability: manual, available: 1, settings: s, combat: { ...combat, isActorTurn: true } }).allowed).toBe(true);
  });
  it("legendary-style limits off-turn uses per round", () => {
    const s = { ...base, activationPolicy: "legendary", legendaryUsesPerRound: 1 };
    const combat = { active: true, isActorTurn: false, round: 3, combatId: "c" };
    expect(evaluateActivation({ ability: manual, available: 1, settings: s, combat }).reason).toBe(ACTIVATION_REASONS.NOT_YOUR_TURN);
    expect(evaluateActivation({ ability: reaction, available: 1, settings: s, combat, usage: {} }).allowed).toBe(true);
    const used = nextLegendaryUsage({}, combat);
    expect(used).toEqual({ combatId: "c", round: 3, count: 1 });
    expect(evaluateActivation({ ability: reaction, available: 1, settings: s, combat, usage: used }).reason).toBe(ACTIVATION_REASONS.LEGENDARY_LIMIT);
    expect(evaluateActivation({ ability: reaction, available: 1, settings: s, combat: { ...combat, round: 4 }, usage: used }).allowed).toBe(true);
    expect(evaluateActivation({ ability: reaction, available: 1, settings: { ...s, legendaryUsesPerRound: 0 }, combat, usage: used }).allowed).toBe(true);
  });
  it("GM-controlled requires approval for players only", () => {
    const s = { ...base, activationPolicy: "gmControlled" };
    expect(evaluateActivation({ ability: manual, available: 1, settings: s })).toMatchObject({ allowed: true, requiresApproval: true });
    expect(evaluateActivation({ ability: manual, available: 1, settings: s, isGM: true })).toMatchObject({ allowed: true, requiresApproval: false });
  });
  it("unapproved automation and unapproved manual abilities are blocked when required", () => {
    const auto = { ...manual, mode: "automated", approval: { status: "pending" } };
    expect(evaluateActivation({ ability: auto, available: 1, settings: base }).reason).toBe(ACTIVATION_REASONS.AUTOMATION_NOT_APPROVED);
    expect(evaluateActivation({ ability: { ...auto, approval: { status: "approved" } }, available: 1, settings: base }).allowed).toBe(true);
    expect(evaluateActivation({ ability: auto, available: 1, settings: { ...base, requireGMApprovalForAutomation: false } }).allowed).toBe(true);
    expect(evaluateActivation({ ability: manual, available: 1, settings: { ...base, playersCanUseManualWithoutApproval: false } }).reason).toBe(ACTIVATION_REASONS.MANUAL_NOT_APPROVED);
  });
});
