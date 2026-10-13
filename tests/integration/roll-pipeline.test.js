import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { processRoll, processMessageRolls, registry, PROCESS_RESULTS, resolveActor } from "../../scripts/roll-processor.js";
import { registerRollDetection, unregisterRollDetection } from "../../scripts/roll-detector.js";
import { resourceManager } from "../../scripts/resource-manager.js";
import { getRollTag } from "../../scripts/roll-registry.js";
import { diagnostics } from "../../scripts/diagnostics.js";
import { makeActor, setUser, created, MockMessage, MockActor } from "../setup/foundry-mock.js";
import * as F from "../fixtures/rolls.js";
import { FLAG_SCOPE } from "../../scripts/constants.js";

beforeEach(() => {
  registry.keys.clear();
  registry.objects = new WeakSet();
  diagnostics.clear();
  unregisterRollDetection();
});
afterEach(() => unregisterRollDetection());

function message(actor, rolls, { type="attack", system={}, author=game.user, speaker } = {}) {
  const msg = new MockMessage({ author, type, system, rolls, speaker: speaker ?? { actor: actor?.id ?? null } });
  game.messages.set(msg.id, msg);
  return msg;
}

describe("award pipeline", () => {
  it("awards the correct actor from a hook subject and announces it", async () => {
    const actor = makeActor();
    const other = makeActor({ name: "Bystander" });
    canvas.tokens.controlled = [{ actor: other }]; // selection must not matter
    const r = await processRoll({ roll: F.natural20Attack(), hookName: "rollAttack", subject: { actor, documentName: "Activity" } });
    expect(r.status).toBe(PROCESS_RESULTS.AWARDED);
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
    expect(resourceManager.getCount(other, "heroic")).toBe(0);
    expect(created.messages.at(-1).flags[FLAG_SCOPE]).toMatchObject({ type: "award", pool: "heroic", blocked: false });
  });

  it("awards villainous on a natural 1 saving throw", async () => {
    const actor = makeActor();
    const r = await processRoll({ roll: F.natural1Save(), hookName: "rollSavingThrow", subject: actor });
    expect(r.status).toBe(PROCESS_RESULTS.AWARDED);
    expect(resourceManager.getCount(actor, "villainous")).toBe(1);
  });

  it("never awards for damage rolls, plain core rolls, or secondary d20s", async () => {
    const actor = makeActor();
    expect((await processRoll({ roll: F.damageRollWithD20s(), hookName: "rollDamage", subject: actor })).status).toBe(PROCESS_RESULTS.NOT_D20_TEST);
    expect((await processRoll({ roll: F.plainCoreRoll(), message: message(actor, [F.plainCoreRoll()], { type: "base" }) })).status).toBe(PROCESS_RESULTS.NOT_D20_TEST);
    expect((await processRoll({ roll: F.attackWithSecondaryD20(), hookName: "rollAttack", subject: actor })).status).toBe(PROCESS_RESULTS.NOT_QUALIFYING);
    expect(resourceManager.getCount(actor, "heroic")).toBe(0);
  });

  it("deduplicates one roll seen by several hooks and the chat message (tagged roll)", async () => {
    const actor = makeActor();
    const roll = F.natural1Save();
    roll.options["heroic-villainous-actions"] = { rollId: "deathsave1" };
    const msg = message(actor, [JSON.parse(JSON.stringify(roll))], { type: "save", system: { type: "death" } });
    await game.settings.set("heroic-villainous-actions", "category-deathSave", true);
    const a = await processRoll({ roll, hookName: "rollSavingThrow", subject: actor, message: msg });
    const b = await processRoll({ roll, hookName: "rollDeathSave", subject: actor, message: msg });
    const [c] = await processMessageRolls(msg);
    expect([a.status, b.status, c.status]).toEqual([PROCESS_RESULTS.AWARDED, PROCESS_RESULTS.DUPLICATE, PROCESS_RESULTS.DUPLICATE]);
    expect(a.category).toBe("deathSave");
    expect(resourceManager.getCount(actor, "villainous")).toBe(1);
  });

  it("deduplicates by object identity when no tag or message exists", async () => {
    const actor = makeActor();
    const roll = F.natural20Check();
    await processRoll({ roll, hookName: "rollAbilityCheck", subject: actor });
    const dup = await processRoll({ roll, hookName: "rollSkill", subject: actor });
    expect(dup.status).toBe(PROCESS_RESULTS.DUPLICATE);
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
  });

  it("treats separate attacks in a multiattack (distinct rolls, same totals) as separate awards", async () => {
    const actor = makeActor();
    const msg1 = message(actor, [F.natural20Attack()]);
    const msg2 = message(actor, [F.natural20Attack()]);
    await processMessageRolls(msg1);
    await processMessageRolls(msg2);
    expect(resourceManager.getCount(actor, "heroic")).toBe(2);
    const twoRolls = message(actor, [F.natural20Attack(), F.natural20Attack()]);
    await processMessageRolls(twoRolls);
    expect(resourceManager.getCount(actor, "heroic")).toBe(3);
  });

  it("blocks a fourth award, reports it, and keeps pools independent", async () => {
    const actor = makeActor();
    for ( let i = 0; i < 3; i++ ) await processMessageRolls(message(actor, [F.natural20Attack()]));
    const [r] = await processMessageRolls(message(actor, [F.natural20Attack()]));
    expect(r.status).toBe(PROCESS_RESULTS.BLOCKED);
    expect(created.messages.at(-1).flags[FLAG_SCOPE].blocked).toBe(true);
    await processMessageRolls(message(actor, [F.natural1Attack()]));
    expect(resourceManager.getCount(actor, "heroic")).toBe(3);
    expect(resourceManager.getCount(actor, "villainous")).toBe(1);
  });

  it("silent cap behavior posts no chat message for blocked awards", async () => {
    const actor = makeActor();
    await game.settings.set("heroic-villainous-actions", "capBehavior", "silent");
    for ( let i = 0; i < 3; i++ ) await processMessageRolls(message(actor, [F.natural20Attack()]));
    const before = created.messages.length;
    await processMessageRolls(message(actor, [F.natural20Attack()]));
    expect(created.messages.length).toBe(before);
  });

  it("follows the advantage policy setting", async () => {
    const actor = makeActor();
    expect((await processMessageRolls(message(actor, [F.disadvantage15and20()], { type: "save" })))[0].status).toBe(PROCESS_RESULTS.NOT_QUALIFYING);
    await game.settings.set("heroic-villainous-actions", "advantagePolicy", "any");
    expect((await processMessageRolls(message(actor, [F.disadvantage15and20()], { type: "save" })))[0].status).toBe(PROCESS_RESULTS.AWARDED);
    await game.settings.set("heroic-villainous-actions", "advantagePolicy", "ordinaryOnly");
    expect((await processMessageRolls(message(actor, [F.advantage1and20()])))[0].status).toBe(PROCESS_RESULTS.NOT_QUALIFYING);
  });

  it("respects category toggles, pool toggles and the outside-combat setting", async () => {
    const actor = makeActor();
    expect((await processMessageRolls(message(actor, [F.natural20Check()], { type: "check", system: { type: "initiative" } })))[0].status).toBe(PROCESS_RESULTS.CATEGORY_DISABLED);
    await game.settings.set("heroic-villainous-actions", "category-attack", false);
    expect((await processMessageRolls(message(actor, [F.natural20Attack()])))[0].status).toBe(PROCESS_RESULTS.CATEGORY_DISABLED);
    await game.settings.set("heroic-villainous-actions", "category-attack", true);
    await game.settings.set("heroic-villainous-actions", "enableVillainous", false);
    expect((await processMessageRolls(message(actor, [F.natural1Attack()])))[0].status).toBe(PROCESS_RESULTS.NOT_QUALIFYING);
    await game.settings.set("heroic-villainous-actions", "countOutsideCombat", false);
    expect((await processMessageRolls(message(actor, [F.natural20Attack()])))[0].status).toBe(PROCESS_RESULTS.OUTSIDE_COMBAT);
    game.combat = { started: true, active: true };
    expect((await processMessageRolls(message(actor, [F.natural20Attack()])))[0].status).toBe(PROCESS_RESULTS.AWARDED);
  });

  it("NPC rolls are excluded unless enabled", async () => {
    const npc = makeActor({ type: "npc", ownership: {} });
    setUser("gm");
    expect((await processMessageRolls(message(npc, [F.natural20Attack()])))[0].status).toBe(PROCESS_RESULTS.ACTOR_EXCLUDED);
    await game.settings.set("heroic-villainous-actions", "npcGeneration", true);
    expect((await processMessageRolls(message(npc, [F.natural20Attack()])))[0].status).toBe(PROCESS_RESULTS.AWARDED);
  });

  it("resolves unlinked token actors from the speaker and ignores the selected token", async () => {
    const linked = makeActor({ name: "Linked" });
    const tokenActor = new MockActor({ name: "Unlinked Goblin", type: "character", ownership: { p1: 3 } });
    const scene = { id: "s1", tokens: new Map([["t1", { actor: tokenActor }]]) };
    game.scenes.set("s1", scene);
    canvas.tokens.controlled = [{ actor: linked }];
    const msg = message(null, [F.natural20Attack()], { speaker: { scene: "s1", token: "t1", actor: tokenActor.id } });
    expect(resolveActor({ message: msg })).toBe(tokenActor);
    await processMessageRolls(msg);
    expect(resourceManager.getCount(tokenActor, "heroic")).toBe(1);
    expect(resourceManager.getCount(linked, "heroic")).toBe(0);
  });

  it("rolls without a resolvable actor are logged and ignored", async () => {
    const msg = message(null, [F.natural20Attack()], { speaker: {} });
    expect((await processMessageRolls(msg))[0].status).toBe(PROCESS_RESULTS.NO_ACTOR);
    expect(diagnostics.recent(1)[0].status).toBe(PROCESS_RESULTS.NO_ACTOR);
  });

  it("delegates to the GM over the socket when the roller cannot update the actor, and the GM re-validates", async () => {
    const actor = makeActor({ ownership: { p2: 3 } }); // p1 rolled for an actor they do not own
    const msg = message(actor, [F.natural20Attack()]);
    const [r] = await processMessageRolls(msg);
    expect(r.status).toBe(PROCESS_RESULTS.DELEGATED);
    expect(created.sockets.at(-1).data).toMatchObject({ action: "awardRequest", messageId: msg.id, index: 0 });
    expect(resourceManager.getCount(actor, "heroic")).toBe(0);
    setUser("gm");
    registry.keys.clear(); // the GM runs in another client with its own registry
    registry.objects = new WeakSet();
    const [g] = await processMessageRolls(msg, { only: 0, allowDelegate: false });
    expect(g.status).toBe(PROCESS_RESULTS.AWARDED);
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
  });

  it("a failed actor update releases the dedupe claim so the roll can be retried", async () => {
    const actor = makeActor();
    actor.failNextUpdate = true;
    const msg = message(actor, [F.natural20Attack()]);
    expect((await processMessageRolls(msg))[0].status).toBe(PROCESS_RESULTS.ERROR);
    expect(resourceManager.getCount(actor, "heroic")).toBe(0);
    expect((await processMessageRolls(msg))[0].status).toBe(PROCESS_RESULTS.AWARDED);
  });

  it("handles concurrent qualifying rolls without losing awards", async () => {
    const actor = makeActor();
    await Promise.all([1, 2, 3].map(() => processMessageRolls(message(actor, [F.natural20Attack()]))));
    expect(resourceManager.getCount(actor, "heroic")).toBe(3);
  });
});

describe("hook wiring (roll-detector)", () => {
  it("tags rolls at configuration and processes dnd5e post-roll hooks once per logical roll", async () => {
    registerRollDetection();
    const actor = makeActor();
    const roll = F.natural20Attack();
    Hooks.callAll("dnd5e.postRollConfiguration", [roll], {}, {}, {});
    expect(getRollTag(roll)).toBeTruthy();
    const msg = message(actor, [roll]);
    roll.parent = msg;
    Hooks.callAll("dnd5e.rollAttack", [roll], { subject: { actor, documentName: "Activity" }, ammoUpdate: null });
    Hooks.callAll("dnd5e.rollAttackV2", [roll], { subject: { actor, documentName: "Activity" } });
    Hooks.callAll("createChatMessage", msg, {}, game.user.id);
    await new Promise(r => setTimeout(r, 20));
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
  });

  it("ignores chat messages authored by other users (their client processes them)", async () => {
    registerRollDetection();
    const actor = makeActor();
    const msg = message(actor, [F.natural20Attack()], { author: game.users.get("p2") });
    Hooks.callAll("createChatMessage", msg, {}, "p2");
    await new Promise(r => setTimeout(r, 10));
    expect(resourceManager.getCount(actor, "heroic")).toBe(0);
  });

  it("registration is idempotent", () => {
    registerRollDetection();
    registerRollDetection();
    expect(Hooks.events.get("createChatMessage")).toHaveLength(1);
  });
});

describe("chat visibility", () => {
  it("award notifications follow the notification mode and the user's message mode", async () => {
    const actor = makeActor();
    await game.settings.set("core", "messageMode", "gm");
    await processMessageRolls(message(actor, [F.natural20Attack()]));
    expect(created.messages.at(-1).whisper).toEqual([]); // public mode forces public
    await game.settings.set("heroic-villainous-actions", "notificationMode", "private");
    await processMessageRolls(message(actor, [F.natural20Attack()]));
    expect(created.messages.at(-1).whisper.sort()).toEqual(["gm", "p1"]);
    await game.settings.set("heroic-villainous-actions", "notificationMode", "none");
    const before = created.messages.length;
    await processMessageRolls(message(actor, [F.natural20Attack()]));
    expect(created.messages.length).toBe(before);
  });
});
