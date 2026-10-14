import { describe, expect, it } from "vitest";
import { createCompendiumRecord, createDocumentRecord, createFileRecord, isValidRecord, sourceLabel, typeForExtension } from "../../scripts/catalog/asset-record.js";
import { ASSET_ROLE, ASSET_TYPE, SOURCE_KIND } from "../../scripts/core/constants.js";

describe("file records", () => {
  it("normalizes an encoded path and classifies by extension and folder", () => {
    const r = createFileRecord({ url: "assets/Maps/Battle%20Maps/Old%20Chapel.webp", storage: "data" });
    expect(isValidRecord(r)).toBe(true);
    expect(r.id).toBe("file:data:assets/Maps/Battle Maps/Old Chapel.webp");
    expect(r.path).toBe("assets/Maps/Battle Maps/Old Chapel.webp");
    expect(r.url).toBe("assets/Maps/Battle%20Maps/Old%20Chapel.webp");
    expect(r.name).toBe("Old Chapel");
    expect(r.type).toBe(ASSET_TYPE.IMAGE);
    expect(r.role).toBe(ASSET_ROLE.MAP);
    expect(r.mapType).toBe("battle");
    expect(r.roleSource).toBe("inferred");
    expect(r.thumbnail).toBe(r.url);
    expect(r.source).toEqual({ kind: SOURCE_KIND.FILE, storage: "data", bucket: null, root: "" });
  });

  it("does not infer a role from the file name or dimensions", () => {
    const r = createFileRecord({ url: "uploads/dungeon_map_wide.jpg" });
    expect(r.role).toBeNull();
    expect(r.roleSource).toBeNull();
  });

  it("maps extensions to types and disambiguates webm by folder", () => {
    expect(typeForExtension("mp3")).toBe(ASSET_TYPE.AUDIO);
    expect(typeForExtension("PDF")).toBe(ASSET_TYPE.PDF);
    expect(typeForExtension("xyz")).toBe(ASSET_TYPE.OTHER);
    expect(typeForExtension("webm", "assets/video/intro.webm")).toBe(ASSET_TYPE.VIDEO);
    expect(typeForExtension("webm", "assets/music/loop.webm")).toBe(ASSET_TYPE.AUDIO);
  });

  it("keeps S3 URLs as absolute and identifies the storage", () => {
    const r = createFileRecord({ url: "https://bucket.s3.amazonaws.com/tokens/goblin.png", storage: "s3", bucket: "bucket" });
    expect(r.path).toBe("https://bucket.s3.amazonaws.com/tokens/goblin.png");
    expect(r.role).toBe(ASSET_ROLE.TOKEN);
    expect(sourceLabel(r)).toBe("S3 (bucket)");
  });

  it("gives non-previewable types an icon and no thumbnail", () => {
    const r = createFileRecord({ url: "docs/notes.docx" });
    expect(r.type).toBe(ASSET_TYPE.OTHER);
    expect(r.thumbnail).toBeNull();
    expect(r.previewable).toBe(false);
    expect(r.icon).toMatch(/fa-/);
  });
});

describe("document and compendium records", () => {
  it("creates distinct identities for world and compendium entries with the same name", () => {
    const world = createDocumentRecord({ uuid: "Actor.abc", documentName: "Actor", documentType: "npc", name: "Goblin", img: "tokens/goblin.png", folder: "Monsters" });
    const pack = createCompendiumRecord({ uuid: "Compendium.dnd5e.monsters.Actor.abc", pack: "dnd5e.monsters", packLabel: "Monsters (SRD)", documentName: "Actor", name: "Goblin", img: "tokens/goblin.png" });
    expect(world.id).toBe("doc:Actor.abc");
    expect(pack.id).toBe("pack:Compendium.dnd5e.monsters.Actor.abc");
    expect(world.source.kind).toBe(SOURCE_KIND.WORLD);
    expect(pack.source.kind).toBe(SOURCE_KIND.COMPENDIUM);
    expect(world.type).toBe(ASSET_TYPE.ACTOR);
    expect(sourceLabel(pack)).toBe("Compendium: Monsters (SRD)");
    expect(world.folder).toBe("Monsters");
    expect(isValidRecord(world) && isValidRecord(pack)).toBe(true);
  });

  it("handles documents without images", () => {
    const r = createDocumentRecord({ uuid: "Macro.m1", documentName: "Macro", documentType: "script", name: "Roll Init" });
    expect(r.thumbnail).toBeNull();
    expect(r.previewable).toBe(false);
    expect(r.type).toBe(ASSET_TYPE.MACRO);
  });

  it("rejects malformed records", () => {
    expect(isValidRecord(null)).toBe(false);
    expect(isValidRecord({ id: "x" })).toBe(false);
    expect(isValidRecord({ id: "x", source: { kind: "file" }, type: "image", name: "n", meta: {} })).toBe(true);
  });
});
