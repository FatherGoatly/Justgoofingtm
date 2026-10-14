import { describe, expect, it } from "vitest";
import { inferRoleFromPath, disambiguateType } from "../../scripts/metadata/classification.js";
import { MetadataService } from "../../scripts/metadata/metadata-service.js";
import { ThumbnailService } from "../../scripts/metadata/thumbnail-service.js";
import { MediaCache, STORES } from "../../scripts/metadata/media-cache.js";
import { createFileRecord } from "../../scripts/catalog/asset-record.js";
import { basename, dirname, displayName, extension, folderSegments, isUnder, normalizePath } from "../../scripts/utilities/paths.js";
import { formatAspect, formatBytes, formatDuration } from "../../scripts/utilities/format.js";
import { makeGame } from "../setup/foundry-shim.js";

describe("paths", () => {
  it("normalizes, decodes and splits paths", () => {
    expect(normalizePath("./assets//Maps/My%20Map.webp/")).toBe("assets/Maps/My Map.webp");
    expect(normalizePath("https://cdn.example.com//a//b.png")).toBe("https://cdn.example.com/a/b.png");
    expect(basename("a/b/c.PNG")).toBe("c.PNG");
    expect(dirname("a/b/c.png")).toBe("a/b");
    expect(dirname("c.png")).toBe("");
    expect(extension("a/b/c.PNG?x=1")).toBe("png");
    expect(extension("noext")).toBe("");
    expect(displayName("IMG_8492-final.webp")).toBe("IMG 8492 final");
    expect(folderSegments("https://cdn.example.com/Maps/Battle/x.png")).toEqual(["maps", "battle"]);
    expect(isUnder("assets/maps/x.png", "assets")).toBe(true);
    expect(isUnder("assets2/x.png", "assets")).toBe(false);
    expect(isUnder("anything", "")).toBe(true);
  });
});

describe("classification", () => {
  it("infers roles only from folder names, deepest first", () => {
    expect(inferRoleFromPath("assets/maps/tokens/x.png")).toEqual({ role: "token", mapType: null });
    expect(inferRoleFromPath("assets/Battle Maps/Dungeons/x.png")).toEqual({ role: "map", mapType: "dungeon" });
    expect(inferRoleFromPath("assets/fantasy-tokens/x.png").role).toBe("token");
    expect(inferRoleFromPath("assets/random/x.png")).toEqual({ role: null, mapType: null });
    expect(inferRoleFromPath("x.png")).toEqual({ role: null, mapType: null });
    expect(disambiguateType(["video", "audio"], "assets/sfx/thunder.webm")).toBe("audio");
    expect(disambiguateType(["video", "audio"], "assets/misc/clip.webm")).toBe("video");
  });
});

describe("format", () => {
  it("formats bytes, durations and aspects", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.50 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.00 MB");
    expect(formatBytes(null)).toBe("");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatAspect(1920, 1080)).toBe("16:9");
    expect(formatAspect(1000, 700)).toBe("1.43:1");
  });
});

describe("MediaCache (memory fallback)", () => {
  it("stores and clears values without IndexedDB", async () => {
    const cache = new MediaCache({ indexedDB: null });
    expect(cache.persistent).toBe(false);
    await cache.set(STORES.MEDIA, "k", { width: 1 });
    expect(await cache.get(STORES.MEDIA, "k")).toEqual({ width: 1 });
    expect(await cache.count(STORES.MEDIA)).toBe(1);
    await cache.clear(STORES.MEDIA);
    expect(await cache.get(STORES.MEDIA, "k")).toBeNull();
  });
});

describe("MetadataService", () => {
  it("probes, caches and marks inaccessible files", async () => {
    makeGame();
    const cache = new MediaCache({ indexedDB: null });
    let probes = 0;
    const image = async url => { probes++; if ( url.includes("missing") ) { const e = new Error("fail"); e.inaccessible = true; throw e; } return { width: 800, height: 600 }; };
    const size = async () => ({ exists: true, size: 2048 });
    const svc = new MetadataService({ cache, probes: { image, size } });
    const ok = createFileRecord({ url: "a/ok.png" });
    const missing = createFileRecord({ url: "a/missing.png" });
    await Promise.all([svc.enrich(ok), svc.enrich(missing), svc.enrich(ok)]);
    expect(ok.meta).toMatchObject({ width: 800, height: 600, size: 2048 });
    expect(ok.accessible).toBe(true);
    expect(missing.accessible).toBe(false);
    expect(missing.previewError).toBe("fail");
    expect(probes).toBe(2);
    const again = createFileRecord({ url: "a/ok.png" });
    await svc.enrich(again);
    expect(probes).toBe(2); // served from cache
    expect(again.meta.width).toBe(800);
    await svc.enrich(again, { force: true });
    expect(probes).toBe(3);
  });

  it("skips size probes for cross-origin files", async () => {
    makeGame();
    let sized = false;
    const svc = new MetadataService({ cache: new MediaCache({ indexedDB: null }), probes: { image: async () => ({ width: 1, height: 1 }), size: async () => { sized = true; return null; } } });
    await svc.enrich(createFileRecord({ url: "https://cdn.example.com/x.png", storage: "s3" }));
    expect(sized).toBe(false);
  });
});

describe("ThumbnailService", () => {
  it("falls back to the source URL for svg, cross-origin and failed generation", async () => {
    makeGame();
    const svc = new ThumbnailService({ cache: new MediaCache({ indexedDB: null }), loaders: { image: async () => { throw new Error("no canvas"); } } });
    expect(await svc.resolve(createFileRecord({ url: "icons/x.svg" }))).toEqual({ url: "icons/x.svg", generated: false });
    expect((await svc.resolve(createFileRecord({ url: "https://cdn.example.com/x.png", storage: "s3" }))).generated).toBe(false);
    const rec = createFileRecord({ url: "a/x.png" });
    const res = await svc.resolve(rec);
    expect(res).toEqual({ url: "a/x.png", generated: false });
    expect(svc.failed.has("a/x.png")).toBe(true);
    expect((await svc.resolve(createFileRecord({ url: "a/x.mp3" }))).url).toBeNull();
    expect(await svc.resolve({ thumbnail: null })).toEqual({ url: null, generated: false });
  });

  it("generates, caches and reference-counts thumbnails", async () => {
    makeGame();
    const created = [];
    const revoked = [];
    globalThis.URL.createObjectURL = blob => { const u = `blob:${created.length}`; created.push(u); return u; };
    globalThis.URL.revokeObjectURL = u => revoked.push(u);
    const proto = globalThis.HTMLCanvasElement.prototype;
    proto.getContext = () => ({ drawImage() {} });
    proto.toBlob = function(cb) { cb(new Blob(["x"], { type: "image/webp" })); };
    let loads = 0;
    const svc = new ThumbnailService({ cache: new MediaCache({ indexedDB: null }), size: 64, loaders: { image: async () => { loads++; return { element: document.createElement("canvas"), width: 1000, height: 500 }; } } });
    const rec = createFileRecord({ url: "a/big.png" });
    const first = await svc.resolve(rec);
    expect(first.generated).toBe(true);
    expect(first.width).toBe(64);
    expect(first.height).toBe(32);
    const second = await svc.resolve(rec);
    expect(second.url).toBe(first.url);
    expect(loads).toBe(1);
    svc.release(first.key);
    expect(revoked).toEqual([]);
    svc.release(second.key);
    expect(revoked).toEqual([first.url]);
    const third = await svc.resolve(rec);
    expect(loads).toBe(1); // blob came from cache
    expect(third.url).not.toBe(first.url);
    svc.releaseAll();
    expect(svc.objectUrls.size).toBe(0);
  });
});
