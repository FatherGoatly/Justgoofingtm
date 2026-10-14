import { describe, expect, it } from "vitest";
import { CatalogService } from "../../scripts/catalog/catalog-service.js";
import { BaseAdapter } from "../../scripts/adapters/base-adapter.js";
import { createFileRecord } from "../../scripts/catalog/asset-record.js";
import { MediaCache } from "../../scripts/metadata/media-cache.js";
import { CancelledError } from "../../scripts/utilities/async.js";
import { makeGame } from "../setup/foundry-shim.js";

class ListAdapter extends BaseAdapter {
  constructor(id, paths, { fail=false, cancelAfter=null }={}) { super(); this.id = id; this.label = id; this.paths = paths; this.fail = fail; this.cancelAfter = cancelAfter; }

  async* scan({ token }) {
    if ( this.fail ) throw new Error("adapter exploded");
    let i = 0;
    for ( const p of this.paths ) {
      if ( this.cancelAfter !== null && i++ >= this.cancelAfter ) { token.cancel(); throw new CancelledError("test"); }
      yield { records: [createFileRecord({ url: p })] };
    }
    yield { records: [], done: true, status: { files: this.paths.length } };
  }
}

describe("CatalogService", () => {
  it("merges batches incrementally and emits events", async () => {
    makeGame();
    const catalog = new CatalogService({ cache: new MediaCache({ indexedDB: null }) });
    catalog.registerAdapter(new ListAdapter("a", ["x/a.png", "x/b.png"]));
    catalog.registerAdapter(new ListAdapter("b", ["y/c.mp3"]));
    const updates = [];
    catalog.on("updated", e => updates.push(e));
    const res = await catalog.index();
    expect(res).toEqual({ interrupted: false, size: 3 });
    expect(updates.length).toBeGreaterThanOrEqual(3);
    expect(catalog.state.status).toBe("done");
    expect(catalog.state.adapters.a.status).toBe("done");
    expect(catalog.byAdapter("b")).toHaveLength(1);
  });

  it("removes records that disappear on re-scan but keeps probed metadata for survivors", async () => {
    makeGame();
    const catalog = new CatalogService({ cache: new MediaCache({ indexedDB: null }) });
    const adapter = new ListAdapter("a", ["x/a.png", "x/b.png"]);
    catalog.registerAdapter(adapter);
    await catalog.index();
    catalog.get("file:data:x/a.png").meta.width = 1024;
    catalog.get("file:data:x/a.png").roleSource = "user";
    catalog.get("file:a:x/a.png");
    adapter.paths = ["x/a.png", "x/new.png"];
    await catalog.index();
    expect(catalog.get("file:data:x/b.png")).toBeNull();
    expect(catalog.get("file:data:x/new.png")).toBeTruthy();
    expect(catalog.get("file:data:x/a.png").meta.width).toBe(1024);
  });

  it("isolates adapter failures and keeps the rest of the catalog", async () => {
    makeGame();
    const catalog = new CatalogService({ cache: new MediaCache({ indexedDB: null }) });
    catalog.registerAdapter(new ListAdapter("bad", [], { fail: true }));
    catalog.registerAdapter(new ListAdapter("good", ["z/ok.png"]));
    const res = await catalog.index();
    expect(res.size).toBe(1);
    expect(catalog.state.adapters.bad.status).toBe("error");
    expect(catalog.state.adapters.good.status).toBe("done");
    expect(catalog.state.status).toBe("done");
  });

  it("keeps records discovered before a cancellation and reports interruption", async () => {
    makeGame();
    const catalog = new CatalogService({ cache: new MediaCache({ indexedDB: null }) });
    catalog.registerAdapter(new ListAdapter("a", ["1.png", "2.png", "3.png"], { cancelAfter: 2 }));
    catalog.registerAdapter(new ListAdapter("b", ["never.png"]));
    const res = await catalog.index();
    expect(res.interrupted).toBe(true);
    expect(catalog.size).toBe(2);
    expect(catalog.state.status).toBe("interrupted");
    expect(catalog.state.adapters.a.status).toBe("interrupted");
    expect(catalog.get("file:data:never.png")).toBeNull();
  });

  it("round-trips the file catalog through the cache", async () => {
    makeGame();
    const cache = new MediaCache({ indexedDB: null });
    const catalog = new CatalogService({ cache });
    catalog.registerAdapter(new ListAdapter("files", ["m/a.webp", "m/b.webp"]));
    await catalog.index();
    catalog.get("file:data:m/a.webp")._search = "volatile";
    await catalog.saveCache("files");
    const fresh = new CatalogService({ cache });
    fresh.registerAdapter(new ListAdapter("files", []));
    const n = await fresh.loadCache("files");
    expect(n).toBe(2);
    expect(fresh.state.fromCache).toBe(true);
    expect(fresh.get("file:data:m/a.webp")._search).toBeUndefined();
    expect(fresh.state.adapters.files.status).toBe("cached");
  });

  it("supports live upsert and removal outside a scan", async () => {
    makeGame();
    const catalog = new CatalogService({ cache: new MediaCache({ indexedDB: null }) });
    expect(catalog.upsert(createFileRecord({ url: "live.png" }), "files")).toBe(true);
    expect(catalog.upsert({ nope: true }, "files")).toBe(false);
    expect(catalog.remove("file:data:live.png")).toBe(true);
    expect(catalog.remove("file:data:live.png")).toBe(false);
  });
});
