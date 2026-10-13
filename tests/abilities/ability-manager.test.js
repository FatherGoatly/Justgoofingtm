import { describe, it, expect, vi } from "vitest";
import { activateAbility, defineAbility, clearAbility, setApproval, dialogs, ACTIVATION_STATUS } from "../../scripts/ability-manager.js";
import { resourceManager } from "../../scripts/resource-manager.js";
import { makeActor, setUser, created } from "../setup/foundry-mock.js";
import { FLAG_SCOPE } from "../../scripts/constants.js";

const heroicDef = { name: "Inspiring Rally", description: "Allies within 30 feet gain temporary hit points.", mode: "manual" };
const villainDef = { name: "Ruthless Blow", description: "Deal extra damage and knock the target prone.", mode: "manual" };

function installDialogs({ define=heroicDef, confirm=true }={}) {
  dialogs.define = vi.fn(async () => (typeof define === "function" ? define() : define));
  dialogs.confirm = vi.fn(async () => confirm);
}

describe("first-use definition workflow", () => {
  it("does nothing (and does not prompt) when the pool is empty", async () => {
    installDialogs();
    const actor = makeActor();
    const r = await activateAbility(actor, "heroic");
    expect(r.status).toBe(ACTIVATION_STATUS.BLOCKED);
    expect(dialogs.define).not.toHaveBeenCalled();
  });

  it("prompts for a Heroic definition on first use, saves it, confirms, then spends", async () => {
    installDialogs();
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    const r = await activateAbility(actor, "heroic");
    expect(dialogs.define).toHaveBeenCalledTimes(1);
    expect(dialogs.confirm).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(ACTIVATION_STATUS.ACTIVATED);
    expect(resourceManager.getAbility(actor, "heroic").name).toBe("Inspiring Rally");
    expect(resourceManager.getAbility(actor, "villainous")).toBeNull();
    expect(resourceManager.getCount(actor, "heroic")).toBe(0);
    expect(created.messages.at(-1).flags[FLAG_SCOPE]).toMatchObject({ type: "activation", pool: "heroic" });
  });

  it("prompts independently for the Villainous definition", async () => {
    installDialogs({ define: villainDef });
    const actor = makeActor();
    await resourceManager.award(actor, "villainous");
    await resourceManager.setAbility(actor, "heroic", { ...heroicDef, cost: 1, mechanics: [], activation: { type: "action" } });
    const r = await activateAbility(actor, "villainous");
    expect(dialogs.define).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(ACTIVATION_STATUS.ACTIVATED);
    expect(resourceManager.getAbility(actor, "villainous").name).toBe("Ruthless Blow");
    expect(resourceManager.getAbility(actor, "heroic").name).toBe("Inspiring Rally");
  });

  it("cancelling the definition dialog spends nothing and stores nothing", async () => {
    installDialogs({ define: null });
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    const r = await activateAbility(actor, "heroic");
    expect(r.status).toBe(ACTIVATION_STATUS.CANCELLED);
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
    expect(resourceManager.getAbility(actor, "heroic")).toBeNull();
  });

  it("cancelling the activation confirmation spends nothing", async () => {
    installDialogs({ confirm: false });
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    const r = await activateAbility(actor, "heroic");
    expect(r.status).toBe(ACTIVATION_STATUS.CANCELLED);
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
    expect(resourceManager.getAbility(actor, "heroic").name).toBe("Inspiring Rally");
  });

  it("rejects empty names and descriptions from the dialog", async () => {
    installDialogs({ define: { name: "", description: "" } });
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    await expect(activateAbility(actor, "heroic")).rejects.toThrow("HVA.Errors.InvalidDefinition");
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
  });

  it("reuses the stored definition on later activations", async () => {
    installDialogs();
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    await resourceManager.award(actor, "heroic");
    await activateAbility(actor, "heroic");
    await activateAbility(actor, "heroic");
    expect(dialogs.define).toHaveBeenCalledTimes(1);
    expect(resourceManager.getCount(actor, "heroic")).toBe(0);
    const r = await activateAbility(actor, "heroic");
    expect(r.status).toBe(ACTIVATION_STATUS.BLOCKED);
  });
});

describe("editing, clearing and permissions", () => {
  it("owners can edit when allowed; another player cannot", async () => {
    installDialogs({ define: { ...heroicDef, name: "Renamed" } });
    const actor = makeActor();
    await defineAbility(actor, "heroic");
    expect(resourceManager.getAbility(actor, "heroic").name).toBe("Renamed");
    setUser("p2");
    await expect(defineAbility(actor, "heroic")).rejects.toThrow("HVA.Errors.CannotEditAbility");
    await expect(clearAbility(actor, "heroic")).rejects.toThrow("HVA.Errors.CannotEditAbility");
    await expect(activateAbility(actor, "heroic")).rejects.toThrow("HVA.Errors.CannotActivate");
  });

  it("players cannot edit when the world setting forbids it, GM always can", async () => {
    installDialogs();
    const actor = makeActor();
    await defineAbility(actor, "heroic");
    await game.settings.set("heroic-villainous-actions", "playersCanEditAbilities", false);
    await expect(defineAbility(actor, "heroic")).rejects.toThrow("HVA.Errors.CannotEditAbility");
    setUser("gm");
    installDialogs({ define: { ...heroicDef, name: "GM Edit" } });
    await defineAbility(actor, "heroic");
    expect(resourceManager.getAbility(actor, "heroic").name).toBe("GM Edit");
    await clearAbility(actor, "heroic");
    expect(resourceManager.getAbility(actor, "heroic")).toBeNull();
  });

  it("a second authorized owner shares the actor's definition", async () => {
    installDialogs();
    const actor = makeActor({ ownership: { p1: 3, p2: 3 } });
    await defineAbility(actor, "heroic");
    setUser("p2");
    expect(resourceManager.getAbility(actor, "heroic").name).toBe("Inspiring Rally");
    await resourceManager.award(actor, "heroic");
    expect((await activateAbility(actor, "heroic")).status).toBe(ACTIVATION_STATUS.ACTIVATED);
  });
});

describe("automated abilities", () => {
  const autoDef = { ...heroicDef, mode: "automated", mechanics: [{ type: "note", text: "Shine brightly" }, { type: "tempHp", formula: "1d8" }] };

  it("player-defined automation is pending until the GM approves; description edits keep approval, mechanic edits reset it", async () => {
    installDialogs({ define: autoDef });
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    expect((await activateAbility(actor, "heroic")).reason).toBe("automationNotApproved");
    expect(resourceManager.getAbility(actor, "heroic").approval.status).toBe("pending");
    setUser("gm");
    await setApproval(actor, "heroic", true);
    setUser("p1");
    installDialogs({ define: { ...autoDef, description: "A brand new description of the same effect." } });
    await defineAbility(actor, "heroic");
    expect(resourceManager.getAbility(actor, "heroic").approval.status).toBe("approved");
    installDialogs({ define: { ...autoDef, mechanics: [{ type: "note", text: "changed" }] } });
    await defineAbility(actor, "heroic");
    expect(resourceManager.getAbility(actor, "heroic").approval.status).toBe("pending");
  });

  it("executes approved automation and spends after confirmation", async () => {
    installDialogs({ define: autoDef });
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    setUser("gm");
    await defineAbility(actor, "heroic");
    setUser("p1");
    const r = await activateAbility(actor, "heroic");
    expect(r.status).toBe(ACTIVATION_STATUS.ACTIVATED);
    expect(r.results.map(x => x.type)).toEqual(["note", "tempHp"]);
    expect(actor.system.attributes.hp.temp).toBe(7);
    expect(resourceManager.getCount(actor, "heroic")).toBe(0);
  });

  it("refunds the resource when execution fails", async () => {
    installDialogs({ define: { ...autoDef, mechanics: [{ type: "prompt", title: "Pick", options: ["a", "b"] }] } });
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    setUser("gm");
    await defineAbility(actor, "heroic");
    setUser("p1");
    foundry.applications.api.DialogV2.wait = async () => null; // user dismisses the prompt
    const r = await activateAbility(actor, "heroic");
    expect(r.status).toBe(ACTIVATION_STATUS.FAILED);
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
    expect(actor.flags[FLAG_SCOPE].history[0].kind).toBe("refund");
  });

  it("unsupported mechanics stored out-of-band fail safely", async () => {
    installDialogs();
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    await resourceManager.setAbility(actor, "heroic", { ...autoDef, mechanics: [{ type: "runScript", code: "1" }], approval: { status: "approved" }, cost: 1, activation: { type: "action" } });
    const r = await activateAbility(actor, "heroic");
    expect(r.status).toBe(ACTIVATION_STATUS.FAILED);
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
  });
});

describe("GM-controlled activation", () => {
  it("asks the GM over the socket and denies when no GM responds", async () => {
    installDialogs();
    const actor = makeActor();
    await resourceManager.award(actor, "heroic");
    await game.settings.set("heroic-villainous-actions", "activationPolicy", "gmControlled");
    game.users.get("gm").active = false; // no GM connected
    const r = await activateAbility(actor, "heroic");
    expect(r.status).toBe(ACTIVATION_STATUS.DENIED);
    expect(resourceManager.getCount(actor, "heroic")).toBe(1);
  });
});

describe("activation chat visibility", () => {
  it("uses the user's message mode unless public messages are required", async () => {
    installDialogs();
    const actor = makeActor();
    await game.settings.set("core", "messageMode", "gm");
    await resourceManager.award(actor, "heroic");
    await resourceManager.award(actor, "heroic");
    await activateAbility(actor, "heroic");
    expect(created.messages.at(-1).whisper).toEqual(["gm"]);
    await game.settings.set("heroic-villainous-actions", "requirePublicChat", true);
    await activateAbility(actor, "heroic");
    expect(created.messages.at(-1).whisper).toEqual([]);
  });
});
