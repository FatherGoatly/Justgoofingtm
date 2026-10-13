import { describe, it, expect } from "vitest";
import { migrateFlagData, migrateWorld } from "../../scripts/migration.js";
import { SCHEMA_VERSION, FLAG_SCOPE } from "../../scripts/constants.js";
import { makeActor, setUser } from "../setup/foundry-mock.js";
import { registerSettings } from "../../scripts/settings.js";

describe("migration", () => {
  it("returns null for missing or current data and fills structure for legacy data", () => {
    expect(migrateFlagData(undefined)).toBeNull();
    expect(migrateFlagData({ schemaVersion: SCHEMA_VERSION })).toBeNull();
    const migrated = migrateFlagData({ resources: { heroic: { value: 2 } } });
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.resources.villainous.value).toBe(0);
    expect(migrated.resources.heroic.value).toBe(2);
    expect(migrated.abilities).toEqual({ heroic: null, villainous: null });
  });
  it("migrates world actors once and records the world version", async () => {
    registerSettings();
    setUser("gm");
    const actor = makeActor({ flags: { [FLAG_SCOPE]: { resources: { villainous: { value: 1 } } } } });
    const untouched = makeActor({ flags: {} });
    await migrateWorld();
    expect(actor.flags[FLAG_SCOPE].schemaVersion).toBe(SCHEMA_VERSION);
    expect(actor.flags[FLAG_SCOPE].resources.villainous.value).toBe(1);
    expect(untouched.updates).toHaveLength(0);
    expect(game.settings.get("heroic-villainous-actions", "schemaVersion")).toBe(SCHEMA_VERSION);
    const updates = actor.updates.length;
    await migrateWorld();
    expect(actor.updates.length).toBe(updates);
  });
});
