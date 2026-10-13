import { describe, it, expect } from "vitest";
import * as P from "../../scripts/permission-service.js";
import { makeActor, setUser } from "../setup/foundry-mock.js";

describe("permission service", () => {
  it("owners and GMs own; observers do not", () => {
    const actor = makeActor({ ownership: { p1: 3, p2: 2 } });
    expect(P.isOwner(game.users.get("p1"), actor)).toBe(true);
    expect(P.isOwner(game.users.get("p2"), actor)).toBe(false);
    expect(P.isOwner(game.users.get("gm"), actor)).toBe(true);
    expect(P.canView(game.users.get("p2"), actor)).toBe(true);
    expect(P.canActivate(game.users.get("p2"), actor)).toBe(false);
  });
  it("administration and approval are GM-only", () => {
    expect(P.canAdminister(game.users.get("p1"))).toBe(false);
    expect(P.canAdminister(game.users.get("gm"))).toBe(true);
    expect(P.canApprove(game.users.get("p1"))).toBe(false);
  });
  it("editing can be restricted by world setting", async () => {
    const actor = makeActor();
    expect(P.canEditAbility(game.users.get("p1"), actor)).toBe(true);
    await game.settings.set("heroic-villainous-actions", "playersCanEditAbilities", false);
    expect(P.canEditAbility(game.users.get("p1"), actor)).toBe(false);
    expect(P.canEditAbility(game.users.get("gm"), actor)).toBe(true);
  });
  it("participation follows actor type and the NPC setting", async () => {
    expect(P.actorParticipates(makeActor())).toBe(true);
    const npc = makeActor({ type: "npc" });
    expect(P.actorParticipates(npc)).toBe(false);
    await game.settings.set("heroic-villainous-actions", "npcGeneration", true);
    expect(P.actorParticipates(npc)).toBe(true);
    expect(P.actorParticipates(makeActor({ type: "vehicle" }))).toBe(false);
    expect(P.actorSupported(npc)).toBe(true);
    expect(P.actorSupported(makeActor({ type: "group" }))).toBe(false);
  });
  it("assertPermission throws localized errors", () => {
    setUser("p1");
    expect(() => P.assertPermission(false, "GMOnly")).toThrow("HVA.Errors.GMOnly");
    expect(() => P.assertPermission(true, "GMOnly")).not.toThrow();
  });
});
