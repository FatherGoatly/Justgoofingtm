import { describe, expect, it } from "vitest";
import { HealthService } from "../../scripts/health/health-service.js";
import { CatalogService } from "../../scripts/catalog/catalog-service.js";
import { createFileRecord } from "../../scripts/catalog/asset-record.js";
import { MediaCache } from "../../scripts/metadata/media-cache.js";
import { makeDoc, makeGame } from "../setup/foundry-shim.js";

function catalogWith(paths, mutate=() => {}) {
  const catalog = new CatalogService({ cache: new MediaCache({ indexedDB: null }) });
  for ( const p of paths ) { const r = createFileRecord({ url: p }); mutate(r); catalog.upsert(r, "files"); }
  catalog.state.status = "done";
  catalog.state.adapters.files = { status: "done", detail: { truncated: false } };
  return catalog;
}

describe("HealthService duplicates", () => {
  it("classifies exact and candidate duplicates and never from name similarity alone", () => {
    makeGame();
    const catalog = catalogWith(["a/goblin.png", "b/goblin.png", "c/goblin_2.png", "x/big.webp", "y/other.webp"], r => {
      if ( r.path === "x/big.webp" || r.path === "y/other.webp" ) { r.meta.size = 1000; r.meta.width = 10; r.meta.height = 10; }
    });
    const other = createFileRecord({ url: "a/goblin.png", storage: "public" });
    catalog.upsert(other, "files");
    const health = new HealthService({ catalog });
    const groups = health.computeDuplicates();
    const byReason = Object.fromEntries(groups.map(g => [g.reason, g]));
    expect(byReason["same-path"].kind).toBe("exact");
    expect(byReason["same-path"].records).toHaveLength(2);
    expect(byReason["same-filename"].kind).toBe("candidate");
    expect(byReason["same-filename"].records.map(r => r.path).sort()).toEqual(["a/goblin.png", "a/goblin.png", "b/goblin.png"]);
    expect(byReason["same-size-dimensions"].records.map(r => r.path).sort()).toEqual(["x/big.webp", "y/other.webp"]);
    expect(health.isDuplicateCandidate("file:data:c/goblin_2.png")).toBe(false);
  });
});

describe("HealthService references", () => {
  function world() {
    const actor = makeDoc({ documentName: "Actor", name: "Goblin", img: "tokens/goblin.png", extra: { prototypeToken: { texture: { src: "tokens/Goblin%20Token.png" } } } });
    const hidden = makeDoc({ documentName: "Actor", name: "Secret", img: "tokens/secret.png", visible: false });
    const scene = makeDoc({ documentName: "Scene", name: "Chapel", extra: { background: { src: "maps/chapel.webp" }, tiles: { contents: [{ uuid: "Scene.s.Tile.1", texture: { src: "tiles/crate.png" } }] }, tokens: { contents: [{ uuid: "Scene.s.Token.1", name: "Gob", texture: { src: "tokens/goblin.png" } }] }, sounds: { contents: [] }, notes: { contents: [] } } });
    const playlist = makeDoc({ documentName: "Playlist", name: "Mood", extra: { sounds: { contents: [{ uuid: "Playlist.p.PlaylistSound.1", name: "Cave", path: "https://cdn.example.com/cave.ogg" }] } } });
    return makeGame({ isGM: false, collections: { actors: [actor, hidden], scenes: [scene], playlists: [playlist] } });
  }

  it("finds usages within an explicit scope", async () => {
    const game = world();
    const catalog = catalogWith(["tokens/goblin.png"]);
    const health = new HealthService({ catalog, game });
    const { references, scope } = await health.usagesOf(catalog.get("file:data:tokens/goblin.png"));
    expect(references.map(r => `${r.documentName}:${r.field}`).sort()).toEqual(["Actor:img", "Token:texture.src"]);
    expect(scope.compendiums).toBe(false);
    expect(scope.documentTypes).toContain("Scene");
    // Hidden documents are not inspected for a player.
    expect(health.references.has("tokens/secret.png")).toBe(false);
    // Encoded and decoded paths resolve to the same key.
    expect(health.references.has("tokens/goblin token.png")).toBe(true);
  });

  it("distinguishes missing from unchecked references", async () => {
    const game = world();
    const catalog = catalogWith(["tokens/goblin.png", "tokens/Goblin%20Token.png"], r => { if ( r.path.includes("Token") ) r.accessible = false; });
    const health = new HealthService({ catalog, game });
    const probe = async p => (p.includes("crate") ? false : null);
    const { results } = await health.missingReferences({ roots: [{ source: "data", target: "maps" }], probe });
    const by = Object.fromEntries(results.map(r => [r.path, r]));
    expect(by["tokens/goblin.png"].status).toBe("ok");
    expect(by["tokens/goblin token.png"]).toMatchObject({ status: "missing", reason: "probe-failed" });
    expect(by["maps/chapel.webp"]).toMatchObject({ status: "missing", reason: "not-in-scan" });
    expect(by["tiles/crate.png"]).toMatchObject({ status: "missing", reason: "probed" });
    expect(by["https://cdn.example.com/cave.ogg"]).toMatchObject({ status: "unchecked", reason: "remote" });
    const noProbe = await health.missingReferences({ roots: [] });
    expect(noProbe.results.find(r => r.path === "tiles/crate.png").status).toBe("unchecked");
  });
});
