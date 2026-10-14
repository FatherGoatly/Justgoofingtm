import { beforeEach, describe, expect, it } from "vitest";
import { OrganizationService } from "../../scripts/collections/organization-service.js";
import { PermissionError, SettingStore, validators } from "../../scripts/collections/storage.js";
import { registerSettings, SETTINGS } from "../../scripts/core/settings.js";
import { MODULE_ID } from "../../scripts/core/constants.js";
import { makeGame } from "../setup/foundry-shim.js";

describe("OrganizationService", () => {
  let org;
  let game;

  beforeEach(() => {
    game = makeGame({ isGM: true });
    registerSettings();
    org = new OrganizationService().load();
  });

  it("persists favorites, recents and saved searches per user", async () => {
    await org.setFavorite(["a", "b"], true);
    await org.setFavorite("a", false);
    expect(org.favoriteIds()).toEqual(["b"]);
    expect(game.settings.get(MODULE_ID, SETTINGS.STORE_FAVORITES)).toEqual({ version: 1, data: ["b"] });
    await org.touch("x"); await org.touch("y"); await org.touch("x");
    expect(org.recentIds()).toEqual(["x", "y"]);
    const saved = await org.saveSearch({ name: "Undead tokens", text: "tag:undead role:token", category: "tokens", filters: { types: ["image"] }, sort: "name:asc" });
    await org.updateSavedSearch(saved.id, { name: "Undead" });
    const copy = await org.duplicateSavedSearch(saved.id);
    expect(org.savedSearches().map(s => s.name)).toEqual(["Undead", "Undead (copy)"]);
    await org.deleteSavedSearch(copy.id);
    expect(org.savedSearches()).toHaveLength(1);
    // Reload from storage: data survives.
    const again = new OrganizationService().load();
    expect(again.isFavorite("b")).toBe(true);
    expect(again.savedSearches()[0].text).toBe("tag:undead role:token");
  });

  it("manages collections without touching assets", async () => {
    const a = await org.createCollection("Session 01");
    const b = await org.createCollection("Final Boss");
    await org.addToCollection(a.id, ["f1", "f2"]);
    await org.addToCollection(b.id, "f2");
    expect(org.collectionsOf("f2").map(c => c.name)).toEqual(["Session 01", "Final Boss"]);
    await org.renameCollection(a.id, "Session One");
    await org.removeFromCollection(a.id, "f1");
    expect(org.getCollection(a.id)).toMatchObject({ name: "Session One", assetIds: ["f2"] });
    const dup = await org.duplicateCollection(b.id);
    expect(dup.assetIds).toEqual(["f2"]);
    await org.reorderCollections([dup.id, b.id, a.id]);
    expect(org.collections().map(c => c.id)).toEqual([dup.id, b.id, a.id]);
    await org.deleteCollection(b.id);
    expect(org.collections()).toHaveLength(2);
    expect(org.collectionsOf("f2")).toHaveLength(2);
    await expect(org.createCollection("  ")).rejects.toThrow();
  });

  it("manages tags, aliases, notes and roles", async () => {
    await org.addTags(["f1", "f2"], ["Undead", " forest ", ""]);
    expect(org.getTags("f1")).toEqual(["Undead", "forest"]);
    await org.removeTags("f1", "forest");
    expect(org.getTags("f1")).toEqual(["Undead"]);
    expect(org.allTags()).toEqual([{ tag: "Undead", count: 2 }, { tag: "forest", count: 1 }]);
    await org.setAlias("f1", "Old Chapel Battle Map");
    await org.setAlias("f2", "   ");
    expect(org.getAlias("f1")).toBe("Old Chapel Battle Map");
    expect(org.getAlias("f2")).toBeNull();
    await org.setNote("f1", "Use at night");
    expect(org.getNote("f1")).toBe("Use at night");
    await org.setRole(["f1"], "map", "dungeon");
    const rec = { id: "f1", role: null, roleSource: null, mapType: null };
    org.applyRoles([rec]);
    expect(rec).toMatchObject({ role: "map", mapType: "dungeon", roleSource: "user" });
    await org.setRole(["f1"], undefined);
    const rec2 = { id: "f1", role: "token", roleSource: "user", mapType: null };
    org.applyRoles([rec2]);
    expect(rec2.roleSource).toBe("inferred");
  });

  it("reports orphans and forgets them only on request", async () => {
    await org.setFavorite("gone", true);
    const col = await org.createCollection("C");
    await org.addToCollection(col.id, ["gone", "here"]);
    await org.addTags("gone", "x");
    expect(org.orphans(id => id === "here")).toEqual(["gone"]);
    await org.forget(["gone"]);
    expect(org.favoriteIds()).toEqual([]);
    expect(org.getCollection(col.id).assetIds).toEqual(["here"]);
    expect(org.getTags("gone")).toEqual([]);
  });

  it("blocks shared writes for users without settings permission but allows personal ones", async () => {
    makeGame({ isGM: false });
    registerSettings();
    const player = new OrganizationService().load();
    expect(player.canEditShared).toBe(false);
    await expect(player.createCollection("Mine")).rejects.toBeInstanceOf(PermissionError);
    await expect(player.addTags("f", "t")).rejects.toBeInstanceOf(PermissionError);
    await player.setFavorite("f", true);
    expect(player.isFavorite("f")).toBe(true);
  });

  it("emits change events", async () => {
    const events = [];
    org.on("changed", e => events.push(e.kind));
    await org.setFavorite("a", true);
    await org.createCollection("X");
    expect(events).toEqual(["favorites", "collections"]);
  });
});

describe("SettingStore", () => {
  it("resets invalid stored data instead of crashing and keeps a copy", () => {
    const io = { get: () => ({ version: 1, data: "not-an-array" }), set: async () => {}, scope: () => "user" };
    const store = new SettingStore("x", { empty: () => [], validate: validators.idList, io });
    expect(store.load()).toMatchObject({ data: [], corrupt: { version: 1, data: "not-an-array" } });
  });

  it("migrates unversioned payloads", () => {
    const io = { get: () => ["a", "b", "a"], set: async () => {}, scope: () => "user" };
    const store = new SettingStore("x", { empty: () => [], validate: validators.idList, migrate: (d, v) => (v === 0 ? d : d), io });
    expect(store.load().data).toEqual(["a", "b"]);
  });

  it("serializes writes", async () => {
    const writes = [];
    const io = { get: () => null, set: async (k, v) => { await new Promise(r => setTimeout(r, 5)); writes.push(v.data.length); }, scope: () => "user" };
    const store = new SettingStore("x", { empty: () => [], validate: validators.idList, io });
    await Promise.all([store.update(d => [...d, "1"]), store.update(d => [...d, "2"]), store.update(d => [...d, "3"])]);
    expect(writes).toEqual([1, 2, 3]);
  });
});
