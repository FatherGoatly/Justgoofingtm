import { describe, it, expect, beforeEach } from "vitest";
import { isNewerVersion, satisfiesMinimum, describeEnvironment, checkRequirements, SUPPORTED_FOUNDRY } from "../../scripts/core/compatibility.js";
import { canUseAcademy, canExecuteLive, canCreateMacro, canManageFixtures, describeUserPermissions } from "../../scripts/core/permissions.js";
import { getActiveAdapter, listAdapters } from "../../scripts/adapters/registry.js";
import { detectMidiQOL } from "../../scripts/adapters/integrations/midi-qol.js";
import { installFoundryGlobals } from "../setup/foundry-mock.js";
import { MODULE_ID, SETTINGS } from "../../scripts/core/constants.js";

describe("version helpers", () => {
  it("compares dotted versions numerically", () => {
    expect(isNewerVersion("14.369", "9.280")).toBe(true);
    expect(isNewerVersion("6.0.6", "6.0.0")).toBe(true);
    expect(isNewerVersion("6.0.0", "6.0.6")).toBe(false);
    expect(isNewerVersion("14", "14.0")).toBe(false);
    expect(satisfiesMinimum("6.0.6", "6.0.0")).toBe(true);
    expect(satisfiesMinimum("6.0.0", "6.0.0")).toBe(true);
    expect(satisfiesMinimum("5.9.9", "6.0.0")).toBe(false);
    expect(satisfiesMinimum(null, "6.0.0")).toBe(false);
  });
});

describe("environment and requirements", () => {
  beforeEach(() => installFoundryGlobals({ isGM: true, system: "dnd5e", systemVersion: "6.0.6", modules: [{ id: "midi-qol", version: "14.6.2" }] }));
  it("describes the environment from game globals", () => {
    const env = describeEnvironment();
    expect(env.foundryGeneration).toBe(SUPPORTED_FOUNDRY.minimum);
    expect(env.foundrySupported).toBe(true);
    expect(env.system.id).toBe("dnd5e");
    expect(env.systemVersionSupported).toBe(true);
    expect(env.modules.find(m => m.id === "midi-qol").active).toBe(true);
  });
  it("checks lesson requirements against the environment", () => {
    const env = describeEnvironment();
    expect(checkRequirements({ system: { id: "dnd5e", minimum: "6.0.0" } }, env).available).toBe(true);
    expect(checkRequirements({ system: { id: "dnd5e", minimum: "7.0.0" } }, env).reasons[0]).toMatch(/7\.0\.0/);
    expect(checkRequirements({ system: { id: "pf2e", title: "Pathfinder" } }, env).reasons[0]).toMatch(/Pathfinder/);
    expect(checkRequirements({ modules: [{ id: "nope", optional: true }] }, env).available).toBe(true);
    expect(checkRequirements({ modules: [{ id: "nope", optional: false }] }, env).available).toBe(false);
  });
  it("picks the dnd5e adapter and detects Midi-QOL by surface, not presence", () => {
    const adapter = getActiveAdapter(describeEnvironment());
    expect(adapter.constructor.id).toBe("dnd5e");
    expect(adapter.capabilities.has("apply-damage")).toBe(true);
    expect(listAdapters().map(a => a.id)).toContain("dnd5e");
    const noApi = detectMidiQOL();
    expect(noApi.active).toBe(true);
    expect(noApi.apiPresent).toBe(false);
    globalThis.MidiQOL = { applyTokenDamage() {}, completeItemUse() {}, completeActivityUse() {}, findNearby() {}, getDistance() {}, hasCondition() {} };
    expect(detectMidiQOL().apiPresent).toBe(true);
    delete globalThis.MidiQOL;
  });
  it("falls back to the core adapter on another system", () => {
    installFoundryGlobals({ system: "pf2e" });
    const adapter = getActiveAdapter(describeEnvironment());
    expect(adapter.constructor.id).not.toBe("dnd5e");
    expect(describeEnvironment().systemSupported).toBe(false);
  });
});

describe("permissions", () => {
  it("lets GMs do everything and players what the settings allow", () => {
    installFoundryGlobals({ isGM: true });
    const ok = v => v === true || v?.allowed === true;
    expect(canUseAcademy()).toBe(true);
    expect(ok(canExecuteLive())).toBe(true);
    expect(ok(canCreateMacro())).toBe(true);
    expect(ok(canManageFixtures())).toBe(true);
    installFoundryGlobals({ isGM: false, settings: { [`${MODULE_ID}.${SETTINGS.PLAYER_LIVE_EXECUTION}`]: false } });
    expect(ok(canManageFixtures())).toBe(false);
    expect(ok(canExecuteLive())).toBe(false);
    expect(canExecuteLive().reason).toBeTypeOf("string");
    const d = describeUserPermissions();
    expect(d.isGM).toBe(false);
    expect(typeof d.permissions).toBe("object");
    expect(d.role).toBeTypeOf("string");
  });
});
