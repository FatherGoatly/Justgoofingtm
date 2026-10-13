import { describe, it, expect } from "vitest";
import { ResourceManager } from "../../scripts/resource-manager.js";
import { FLAG_SCOPE, HISTORY_KINDS, HISTORY_LIMIT } from "../../scripts/constants.js";
import { makeActor, setUser, MockActor } from "../setup/foundry-mock.js";

describe("ResourceManager", () => {
  it("awards from zero and persists on the actor flags", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    const res = await rm.award(actor, "heroic", { source: { category: "attack", natural: 20 } });
    expect(res).toMatchObject({ applied: true, after: 1 });
    expect(actor.flags[FLAG_SCOPE].resources.heroic.value).toBe(1);
    expect(actor.flags[FLAG_SCOPE].history[0]).toMatchObject({ kind: HISTORY_KINDS.AWARD, pool: "heroic", after: 1 });
    expect(actor.flags[FLAG_SCOPE].stats.heroicEarned).toBe(1);
  });

  it("keeps the pools independent and caps each at three", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    for ( let i = 0; i < 4; i++ ) await rm.award(actor, "heroic");
    for ( let i = 0; i < 2; i++ ) await rm.award(actor, "villainous");
    expect(rm.getCount(actor, "heroic")).toBe(3);
    expect(rm.getCount(actor, "villainous")).toBe(2);
    const blocked = actor.flags[FLAG_SCOPE].history.filter(h => h.kind === HISTORY_KINDS.BLOCKED);
    expect(blocked).toHaveLength(1);
    expect(actor.flags[FLAG_SCOPE].stats.heroicBlocked).toBe(1);
  });

  it("serializes concurrent awards so none are lost and the cap holds", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => rm.award(actor, "heroic")));
    expect(results.filter(r => r.applied)).toHaveLength(3);
    expect(results.filter(r => r.blocked)).toHaveLength(2);
    expect(rm.getCount(actor, "heroic")).toBe(3);
  });

  it("spends, refuses to go negative, and refunds without exceeding the cap", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    await rm.award(actor, "villainous");
    expect(await rm.spend(actor, "villainous", 1)).toMatchObject({ ok: true, after: 0 });
    expect(await rm.spend(actor, "villainous", 1)).toMatchObject({ ok: false, reason: "insufficient", after: 0 });
    expect(rm.getCount(actor, "villainous")).toBe(0);
    await rm.refund(actor, "villainous", 5);
    expect(rm.getCount(actor, "villainous")).toBe(3);
  });

  it("re-reads the actor rather than caching: data survives a simulated reload", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    await rm.award(actor, "heroic");
    const reloaded = new MockActor({ id: actor.id, ownership: { p1: 3 }, flags: JSON.parse(JSON.stringify(actor.flags)) });
    expect(new ResourceManager().getCount(reloaded, "heroic")).toBe(1);
  });

  it("rejects awards by users who cannot update the actor", async () => {
    const rm = new ResourceManager();
    const actor = makeActor({ ownership: { p2: 3 } });
    await expect(rm.award(actor, "heroic")).rejects.toThrow("HVA.Errors.CannotUpdateActor");
    expect(actor.updates).toHaveLength(0);
  });

  it("rejects unsupported actor types", async () => {
    const rm = new ResourceManager();
    const actor = makeActor({ type: "vehicle" });
    setUser("gm");
    await expect(rm.award(actor, "heroic")).rejects.toThrow("HVA.Errors.UnsupportedActor");
  });

  it("propagates a failed update without corrupting state", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    actor.failNextUpdate = true;
    await expect(rm.award(actor, "heroic")).rejects.toThrow("Simulated update failure");
    expect(rm.getCount(actor, "heroic")).toBe(0);
    expect(await rm.award(actor, "heroic")).toMatchObject({ applied: true, after: 1 });
  });

  it("GM adjustments respect the cap, log overrides only when enabled, and reset both pools", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    await expect(rm.adjust(actor, "heroic", { delta: 1 })).rejects.toThrow("HVA.Errors.GMOnly");
    setUser("gm");
    await rm.adjust(actor, "heroic", { value: 9 });
    expect(rm.getCount(actor, "heroic")).toBe(3);
    await rm.adjust(actor, "heroic", { value: 9, override: true });
    expect(rm.getCount(actor, "heroic")).toBe(3); // override setting disabled
    await game.settings.set("heroic-villainous-actions", "allowAdminOverride", true);
    await rm.adjust(actor, "heroic", { value: 5, override: true });
    expect(rm.getCount(actor, "heroic")).toBe(5);
    expect(actor.flags[FLAG_SCOPE].history[0].kind).toBe(HISTORY_KINDS.OVERRIDE);
    await rm.adjust(actor, "villainous", { delta: 2 });
    await rm.reset(actor);
    expect(rm.getCount(actor, "heroic")).toBe(0);
    expect(rm.getCount(actor, "villainous")).toBe(0);
  });

  it("caps history length", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    setUser("gm");
    for ( let i = 0; i < HISTORY_LIMIT + 5; i++ ) await rm.adjust(actor, "heroic", { delta: i % 2 ? -1 : 1 });
    expect(actor.flags[FLAG_SCOPE].history.length).toBe(HISTORY_LIMIT);
  });

  it("stores, replaces and clears ability definitions with ownership metadata", async () => {
    const rm = new ResourceManager();
    const actor = makeActor();
    const def = { name: "Perfect Strike", description: "Your next attack cannot miss.", mode: "manual", cost: 1, mechanics: [] };
    const stored = await rm.setAbility(actor, "heroic", def, { isNew: true });
    expect(stored.meta.createdBy).toBe("p1");
    expect(rm.getAbility(actor, "heroic").name).toBe("Perfect Strike");
    expect(rm.getAbility(actor, "villainous")).toBeNull();
    await rm.clearAbility(actor, "heroic");
    expect(rm.getAbility(actor, "heroic")).toBeNull();
  });
});
