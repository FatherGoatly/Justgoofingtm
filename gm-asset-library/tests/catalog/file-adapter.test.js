import { describe, expect, it } from "vitest";
import { FileAdapter } from "../../scripts/adapters/file-adapter.js";
import { CancellationToken } from "../../scripts/utilities/async.js";
import { makeBrowse, makeGame } from "../setup/foundry-shim.js";

const TREE = {
  data: {
    assets: { maps: ["Old%20Chapel.webp", "Forest.jpg"], tokens: { monsters: ["goblin.png", "goblin.png"], __files: ["hero.webp"] }, audio: ["cave_ambient.ogg"], private: ["secret.png"] },
    modules: { "some-module": ["icon.svg"] },
    __files: ["readme.txt"]
  },
  public: { icons: ["sword.svg"] }
};

async function collect(gen) {
  const batches = [];
  for await ( const b of gen ) batches.push(b);
  return batches;
}

describe("FileAdapter", () => {
  it("walks directories recursively, dedupes files and reports status", async () => {
    makeGame({ isGM: true });
    const browse = makeBrowse(TREE);
    const adapter = new FileAdapter({ browse });
    const batches = await collect(adapter.scan({ roots: [{ source: "data", target: "" }], excluded: ["modules", "systems"], batchSize: 2 }));
    const records = batches.flatMap(b => b.records);
    const paths = records.map(r => r.path).sort();
    expect(paths).toEqual(["assets/audio/cave_ambient.ogg", "assets/maps/Forest.jpg", "assets/maps/Old Chapel.webp", "assets/private/secret.png", "assets/tokens/hero.webp", "assets/tokens/monsters/goblin.png", "readme.txt"]);
    const done = batches.at(-1);
    expect(done.done).toBe(true);
    expect(done.status.files).toBe(7);
    expect(done.status.skipped).toBe(1); // modules excluded
    expect(browse.calls.some(c => c.target === "modules")).toBe(false);
  });

  it("honours excluded paths relative to the root and supports several roots", async () => {
    makeGame({ isGM: true });
    const adapter = new FileAdapter({ browse: makeBrowse(TREE) });
    const batches = await collect(adapter.scan({ roots: [{ source: "data", target: "assets" }, { source: "public", target: "icons" }], excluded: ["assets/private"] }));
    const records = batches.flatMap(b => b.records);
    expect(records.some(r => r.path.includes("private"))).toBe(false);
    expect(records.find(r => r.path === "icons/sword.svg").source.storage).toBe("public");
    expect(records.every(r => r.id.startsWith("file:"))).toBe(true);
  });

  it("keeps going when a directory fails and records the failure", async () => {
    makeGame({ isGM: true });
    const adapter = new FileAdapter({ browse: makeBrowse(TREE, { failures: ["data:assets/private"] }) });
    const batches = await collect(adapter.scan({ roots: [{ source: "data", target: "assets" }] }));
    const status = batches.at(-1).status;
    expect(status.failed).toBe(1);
    expect(status.failures[0].target).toBe("assets/private");
    expect(status.files).toBe(5);
  });

  it("stops at the file limit and flags truncation", async () => {
    makeGame({ isGM: true });
    const adapter = new FileAdapter({ browse: makeBrowse(TREE) });
    const batches = await collect(adapter.scan({ roots: [{ source: "data", target: "" }], excluded: [], maxFiles: 3 }));
    const status = batches.at(-1).status;
    expect(status.truncated).toBe(true);
    expect(status.files).toBe(3);
  });

  it("can be cancelled and leaves a recoverable state", async () => {
    makeGame({ isGM: true });
    const token = new CancellationToken();
    const slow = makeBrowse(TREE);
    const browse = async (...args) => { const r = await slow(...args); if ( slow.calls.length >= 2 ) token.cancel(); return r; };
    const adapter = new FileAdapter({ browse });
    await expect(collect(adapter.scan({ roots: [{ source: "data", target: "" }], token }))).rejects.toMatchObject({ cancelled: true });
  });

  it("is unavailable without the file browsing permission", () => {
    makeGame({ isGM: false, permissions: {} });
    expect(new FileAdapter({ browse: makeBrowse(TREE) }).availability().available).toBe(false);
    makeGame({ isGM: false, permissions: { FILES_BROWSE: true } });
    expect(new FileAdapter({ browse: makeBrowse(TREE) }).availability().available).toBe(true);
  });

  it("verifies whether a file still exists, returning null on access errors", async () => {
    makeGame({ isGM: true });
    const adapter = new FileAdapter({ browse: makeBrowse(TREE, { failures: ["data:assets/private"] }) });
    const rec = { url: "assets/maps/Forest.jpg", path: "assets/maps/Forest.jpg", folder: "assets/maps", source: { storage: "data" } };
    expect(await adapter.verify(rec)).toBe(true);
    expect(await adapter.verify({ ...rec, url: "assets/maps/Gone.jpg", path: "assets/maps/Gone.jpg" })).toBe(false);
    expect(await adapter.verify({ ...rec, folder: "assets/private", path: "assets/private/x.png" })).toBeNull();
  });
});
