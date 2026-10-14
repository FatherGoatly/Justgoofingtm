import { beforeEach, describe, expect, it } from "vitest";
import { matchesAspect, SearchService } from "../../scripts/search/search-service.js";
import { createCompendiumRecord, createDocumentRecord, createFileRecord } from "../../scripts/catalog/asset-record.js";
import { OrganizationService } from "../../scripts/collections/organization-service.js";
import { registerSettings } from "../../scripts/core/settings.js";
import { makeGame } from "../setup/foundry-shim.js";

function fixtures() {
  const recs = [
    createFileRecord({ url: "assets/maps/battle/Old%20Chapel.webp" }),
    createFileRecord({ url: "assets/maps/forest_road.jpg" }),
    createFileRecord({ url: "assets/tokens/red_dragon.png" }),
    createFileRecord({ url: "assets/portraits/merchant.webp" }),
    createFileRecord({ url: "assets/audio/cave_ambient.ogg" }),
    createFileRecord({ url: "assets/video/intro.webm" }),
    createDocumentRecord({ uuid: "Actor.a1", documentName: "Actor", documentType: "npc", name: "Red Dragon", img: "assets/tokens/red_dragon.png", folder: "Monsters" }),
    createCompendiumRecord({ uuid: "Compendium.srd.monsters.Actor.g1", pack: "srd.monsters", packLabel: "SRD Monsters", documentName: "Actor", name: "Goblin Boss", img: "g.png" })
  ];
  recs[0].meta.width = 4000; recs[0].meta.height = 3000; recs[0].meta.size = 6 * 1024 ** 2;
  recs[2].meta.width = 400; recs[2].meta.height = 400; recs[2].meta.size = 120 * 1024;
  recs[4].meta.duration = 185;
  return recs;
}

describe("SearchService", () => {
  let org;
  let search;
  let recs;

  beforeEach(async () => {
    makeGame({ isGM: true });
    registerSettings();
    org = new OrganizationService().load();
    search = new SearchService({ organization: org });
    recs = fixtures();
  });

  it("matches words in any order, case-insensitively, across names, paths and aliases", async () => {
    expect(search.query(recs, { text: "DRAGON red" }).results.map(r => r.name).sort()).toEqual(["Red Dragon", "red dragon"]);
    expect(search.query(recs, { text: "chapel" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "battle" }).results).toHaveLength(1); // folder match
    await org.setAlias("file:data:assets/portraits/merchant.webp", "Shady Trader");
    search.invalidate(recs);
    expect(search.query(recs, { text: "shady" }).results[0].path).toContain("merchant");
  });

  it("supports phrases, negation and tags/notes", async () => {
    await org.addTags("file:data:assets/maps/forest_road.jpg", ["forest", "Session 12"]);
    await org.setNote("file:data:assets/audio/cave_ambient.ogg", "Use for the underdark chase");
    search.invalidate(recs);
    expect(search.query(recs, { text: '"session 12"' }).results).toHaveLength(1);
    expect(search.query(recs, { text: "underdark" }).results[0].type).toBe("audio");
    expect(search.query(recs, { text: "dragon -actor" }).results.map(r => r.kind)).toEqual(["file"]);
  });

  it("applies operators", async () => {
    await org.setFavorite(["file:data:assets/tokens/red_dragon.png"], true);
    expect(search.query(recs, { text: "type:audio" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "source:compendium" }).results[0].name).toBe("Goblin Boss");
    expect(search.query(recs, { text: "pack:srd" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "role:map" }).results).toHaveLength(2);
    expect(search.query(recs, { text: "map:battle" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "ext:webp" }).results).toHaveLength(2);
    expect(search.query(recs, { text: "favorite:true" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "is:favorite" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "doc:actor" }).results).toHaveLength(2);
    expect(search.query(recs, { text: "width:>2000" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "size:>5mb" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "duration:>2:00" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "aspect:square" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "in:tokens" }).results).toHaveLength(1);
    expect(search.query(recs, { text: "is:untagged type:image" }).results).toHaveLength(4);
    const bad = search.query(recs, { text: "width:abc in:nowhere" });
    expect(bad.warnings).toHaveLength(2);
  });

  it("combines category, filters and scope", () => {
    expect(search.query(recs, { category: "maps" }).results).toHaveLength(2);
    expect(search.query(recs, { category: "foundry" }).results).toHaveLength(1);
    expect(search.query(recs, { scope: "files" }).results).toHaveLength(6);
    expect(search.query(recs, { scope: "noCompendium" }).results).toHaveLength(7);
    expect(search.query(recs, { filters: { types: ["image"], extensions: ["png"] } }).results).toHaveLength(1);
    expect(search.query(recs, { filters: { minWidth: 1000 } }).results).toHaveLength(1);
    expect(search.query(recs, { filters: { aspect: "landscape" } }).results).toHaveLength(1);
    expect(search.query(recs, { filters: { folder: "audio" } }).results).toHaveLength(1);
    expect(search.query(recs, { filters: { documentNames: ["Actor"], sources: ["world"] } }).results).toHaveLength(1);
    expect(search.query(recs, { text: "zzz" }).results).toEqual([]);
  });

  it("sorts stably and groups unknown values last", () => {
    const bySize = search.query(recs, { sort: "size:desc" }).results;
    expect(bySize[0].path).toContain("Chapel");
    expect(bySize[1].path).toContain("red_dragon");
    expect(bySize.slice(2).every(r => r.meta.size === null)).toBe(true);
    const names = bySize.slice(2).map(r => r.name.toLowerCase());
    expect(names).toEqual([...names].sort());
    const byNameDesc = search.query(recs, { sort: "name:desc" }).results.map(r => r.name.toLowerCase());
    expect(byNameDesc).toEqual([...byNameDesc].sort().reverse());
    const byDuration = search.query(recs, { sort: "duration:desc" }).results;
    expect(byDuration[0].type).toBe("audio");
  });

  it("computes facets", () => {
    const f = search.facets(recs);
    expect(f.types.find(t => t.key === "image").count).toBe(4);
    expect(f.sources.map(s => s.key).sort()).toEqual(["compendium", "file", "world"]);
    expect(f.roles.find(r => r.key === "map").count).toBe(2);
    expect(f.packs[0]).toMatchObject({ key: "srd.monsters", label: "SRD Monsters", count: 1 });
  });

  it("matches aspect ratios", () => {
    const r = { meta: { width: 1920, height: 1080 } };
    expect(matchesAspect(r, "16:9")).toBe(true);
    expect(matchesAspect(r, "landscape")).toBe(true);
    expect(matchesAspect(r, "portrait")).toBe(false);
    expect(matchesAspect({ meta: { width: null, height: null } }, "square")).toBe(false);
  });
});
