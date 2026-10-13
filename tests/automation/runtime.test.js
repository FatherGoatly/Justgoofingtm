import { describe, it, expect, beforeEach } from "vitest";
import { makeGame } from "../setup/foundry-shim.js";
import { runtime } from "../../scripts/automation/runtime.js";
import { triggerRegistry } from "../../scripts/automation/trigger-registry.js";
import { compatibility } from "../../scripts/core/compatibility.js";
import { registerIntegrations, MidiQolAdapter, DaeAdapter } from "../../scripts/automation/integrations/index.js";
import { mechanicRegistry } from "../../scripts/rules/mechanic-registry.js";
import { renderMacroCommand, buildMacroData, macroGenerator } from "../../scripts/automation/macro-generator.js";
import { runPipeline } from "../../scripts/import/pipeline.js";
import { buildItem } from "../../scripts/documents/item-builder.js";
import { planBundle } from "../../scripts/automation/planner.js";
import { FLAG_SCOPE } from "../../scripts/core/constants.js";

function fakeItem(data, actor=null) {
  return { ...data, uuid: `Item.${data.name}`, id: data.name, actor, isOwner: true, getFlag: (scope, key) => data.flags?.[scope]?.[key] };
}
const undeadActor = { name: "Zombie", system: { details: { type: { value: "undead" } } } };
const humanActor = { name: "Guard", system: { details: { type: { value: "humanoid" } } } };

function undeadBane(capabilities) {
  const bundle = runPipeline("Undead Bane\nWeapon (longsword), rare\nWhen you hit an undead with this weapon, the target takes an extra 2d6 radiant damage.");
  planBundle(bundle, { capabilities });
  return buildItem(bundle.entries[0]).data;
}

describe("runtime: conditional on-hit damage", () => {
  beforeEach(() => { Hooks.reset(); compatibility.reset(); triggerRegistry.reset(); mechanicRegistry.reset(); });

  it("adds the conditional roll only for matching targets through dnd5e.preRollDamageV2 when Midi is absent", () => {
    globalThis.game = makeGame({ isGM: true });
    registerIntegrations(compatibility);
    compatibility.detect();
    runtime.ready({ compatibility, triggerRegistry });
    const data = undeadBane(new Set(["dnd5e.preRollDamageV2"]));
    const spec = data.flags[FLAG_SCOPE].mechanics.find(m => m.kind === "damage.bonus-on-hit");
    expect(spec.implementation.owner).toBe("module");
    const item = fakeItem(data);
    expect(runtime.conditionalHitDamage(item, [undeadActor])).toHaveLength(1);
    expect(runtime.conditionalHitDamage(item, [humanActor])).toHaveLength(0);
    // Hook dispatch
    game.user.targets = new Set([{ actor: undeadActor }]);
    const config = { subject: { item, id: "act1" }, rolls: [], event: { timeStamp: 1 } };
    expect(triggerRegistry.installedHooks).toContain("dnd5e.preRollDamageV2");
    Hooks.call("dnd5e.preRollDamageV2", config, {}, {});
    expect(config.rolls).toHaveLength(1);
    expect(config.rolls[0].parts).toEqual(["2d6"]);
    expect(config.rolls[0].options.type).toBe("radiant");
    // Same event again does not double-add
    Hooks.call("dnd5e.preRollDamageV2", config, {}, {});
    expect(config.rolls).toHaveLength(1);
  });

  it("returns a Midi damageBonus result and leaves the dnd5e hook inert when Midi owns the workflow", () => {
    globalThis.MidiQOL = { applyTokenDamage() {}, Workflow: class {} };
    globalThis.game = makeGame({ isGM: true, modules: [{ id: "midi-qol", version: "14.6.2" }] });
    registerIntegrations(compatibility);
    compatibility.detect();
    expect(compatibility.hasCapability("midi.damageBonus")).toBe(true);
    runtime.ready({ compatibility, triggerRegistry });
    const data = undeadBane(new Set(compatibility.report.capabilities));
    const spec = data.flags[FLAG_SCOPE].mechanics.find(m => m.kind === "damage.bonus-on-hit");
    expect(spec.implementation.owner).toBe("midi-qol");
    MidiQolAdapter.prepareItemData(data);
    expect(data.flags["midi-qol"].onUseMacroName).toBe("[damageBonus]function.StatBlockImporter.midi.damageBonus");
    MidiQolAdapter.prepareItemData(data);
    expect(data.flags["midi-qol"].onUseMacroName.split(",")).toHaveLength(1);
    const item = fakeItem(data);
    globalThis.fromUuidSync = () => item;
    const result = runtime.integrations.midiDamageBonus({ rolledItem: item, workflow: { hitTargets: new Set([{ actor: undeadActor }, { actor: humanActor }]) } });
    expect(result).toEqual([{ damageRoll: "2d6", damageType: "radiant", flavor: expect.stringContaining("radiant") }]);
    // The dnd5e hook path must not add a second roll.
    game.user.targets = new Set([{ actor: undeadActor }]);
    const config = { subject: { item, id: "act1" }, rolls: [], event: { timeStamp: 2 } };
    Hooks.call("dnd5e.preRollDamageV2", config, {}, {});
    expect(config.rolls).toHaveLength(0);
    delete globalThis.MidiQOL;
    delete globalThis.fromUuidSync;
  });

  it("respects the automation disable flag", () => {
    globalThis.game = makeGame({ isGM: true });
    registerIntegrations(compatibility); compatibility.detect(); runtime.ready({ compatibility, triggerRegistry });
    const data = undeadBane(new Set(["dnd5e.preRollDamageV2"]));
    data.flags[FLAG_SCOPE].automationDisabled = true;
    const item = fakeItem(data);
    game.user.targets = new Set([{ actor: undeadActor }]);
    const config = { subject: { item, id: "a" }, rolls: [], event: { timeStamp: 3 } };
    Hooks.call("dnd5e.preRollDamageV2", config, {}, {});
    expect(config.rolls).toHaveLength(0);
  });
});

describe("trigger registry", () => {
  beforeEach(() => { Hooks.reset(); triggerRegistry.reset(); });

  it("installs each hook once and replaces handlers by id", () => {
    triggerRegistry.register("h1", "hit", () => {});
    triggerRegistry.register("h1", "hit", () => {});
    triggerRegistry.register("h2", "resource.consumed", () => {});
    triggerRegistry.activate();
    triggerRegistry.activate();
    expect(Hooks.events.get("dnd5e.preRollDamageV2")).toHaveLength(1);
    expect(Hooks.events.get("dnd5e.postActivityConsumption")).toHaveLength(1);
    expect(triggerRegistry.handlersFor("hit")).toHaveLength(1);
    expect(() => triggerRegistry.register("x", "not-a-trigger", () => {})).toThrow();
  });
});

describe("runtime verification", () => {
  it("verifies native mechanics against built data", () => {
    const bundle = runPipeline("Frost Blade\nWeapon (longsword), rare\nWhen you hit a creature with this magic weapon, the target takes an extra 1d6 cold damage.");
    planBundle(bundle, { capabilities: new Set() });
    const { data } = buildItem(bundle.entries[0]);
    const v = runtime.verifyItem(data);
    expect(v.ok).toBe(true);
    expect(v.results.find(r => r.kind === "damage.bonus-on-hit").ok).toBe(true);
  });

  it("reports Midi-owned mechanics as unverified when Midi is inactive", () => {
    compatibility.reset();
    globalThis.game = makeGame({ isGM: true });
    registerIntegrations(compatibility); compatibility.detect(); runtime.ready({ compatibility, triggerRegistry });
    const data = undeadBane(new Set(["midi.damageBonus"]));
    const v = runtime.verifyItem(data);
    const r = v.results.find(x => x.kind === "damage.bonus-on-hit");
    expect(r.owner).toBe("midi-qol");
    expect(r.ok).toBe(false);
  });
});

describe("macro generator", () => {
  it("renders a wrapper that only calls the runtime and never embeds imported text", () => {
    const spec = { id: "mech-1", kind: "teleport", label: "Teleport up to 30 ft.", version: 1, sourceText: "alert('x')</script>" };
    const cmd = renderMacroCommand(spec, { itemUuid: "Item.abc", itemName: "Cape of \"Blinking\"" });
    expect(cmd).toContain("api.execute(\"mech-1\", { itemUuid: \"Item.abc\"");
    expect(cmd).not.toContain("alert");
    expect(cmd.split("\n").filter(l => !l.startsWith("//")).join("\n")).not.toContain("Blinking");
    const data = buildMacroData(spec, { itemUuid: "Item.abc", itemName: "Cape" });
    expect(data.type).toBe("script");
    expect(data.flags[FLAG_SCOPE].macro).toMatchObject({ mechanicId: "mech-1", itemUuid: "Item.abc" });
  });

  it("is idempotent: the same mechanic maps to one macro", async () => {
    const created = [];
    const store = [];
    globalThis.game = makeGame({ isGM: true });
    game.macros = { find: fn => store.find(fn), filter: fn => store.filter(fn) };
    globalThis.Macro = { create: async d => { const m = { ...d, id: `m${created.length}`, uuid: `Macro.m${created.length}`, isOwner: true, getFlag: (s, k) => d.flags?.[s]?.[k], update: async u => Object.assign(m, u) }; created.push(m); store.push(m); return m; } };
    const spec = { id: "mech-2", kind: "teleport", label: "Teleport", version: 1 };
    const a = await macroGenerator.ensureMacro(spec, { itemUuid: "Item.x", itemName: "Boots" });
    const b = await macroGenerator.ensureMacro(spec, { itemUuid: "Item.x", itemName: "Boots" });
    expect(a).toBe(b);
    expect(created).toHaveLength(1);
    delete globalThis.Macro;
  });
});

describe("integration adapters", () => {
  beforeEach(() => compatibility.reset());

  it("detects missing modules gracefully and verifies API surfaces", () => {
    globalThis.game = makeGame({ isGM: true, modules: [{ id: "dae", version: "14.6.1" }, { id: "midi-qol", version: "14.0.14" }] });
    registerIntegrations(compatibility);
    const report = compatibility.detect();
    const midi = report.integrations.find(i => i.id === "midi-qol");
    expect(midi.installed).toBe(true);
    expect(midi.compatible).toBe(false); // too old
    const dae = report.integrations.find(i => i.id === "dae");
    expect(dae.compatible).toBe(false); // API missing
    globalThis.DAE = { daeSpecialDurations: {} };
    const report2 = compatibility.detect();
    expect(report2.integrations.find(i => i.id === "dae").active).toBe(true);
    expect(compatibility.hasCapability("dae.specialDuration")).toBe(true);
    delete globalThis.DAE;
    expect(report2.integrations.find(i => i.id === "times-up").installed).toBe(false);
  });

  it("maps expiry phrases to DAE special durations and adds flags once", () => {
    expect(DaeAdapter.specialDurationFor("until the target takes damage")).toBe("isDamaged");
    expect(DaeAdapter.specialDurationFor("for 1 minute")).toBeNull();
    const eff = { flags: {} };
    DaeAdapter.withSpecialDuration(eff, "isDamaged");
    DaeAdapter.withSpecialDuration(eff, "isDamaged");
    expect(eff.flags.dae.specialDuration).toEqual(["isDamaged"]);
    DaeAdapter.withSpecialDuration(eff, "bogus");
    expect(eff.flags.dae.specialDuration).toEqual(["isDamaged"]);
  });

  it("honours the GM integration allow-list", () => {
    globalThis.DAE = { daeSpecialDurations: {} };
    globalThis.game = makeGame({ isGM: true, modules: [{ id: "dae", version: "14.6.1" }], settings: { integrations: "midi-qol" } });
    registerIntegrations(compatibility);
    const report = compatibility.detect();
    expect(report.integrations.find(i => i.id === "dae").active).toBe(false);
    expect(compatibility.hasCapability("dae.specialDuration")).toBe(false);
    delete globalThis.DAE;
  });
});
