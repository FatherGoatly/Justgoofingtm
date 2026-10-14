import { describe, expect, it } from "vitest";
import { createFileRecord } from "../../scripts/catalog/asset-record.js";
import { CatalogService } from "../../scripts/catalog/catalog-service.js";
import { SearchService } from "../../scripts/search/search-service.js";
import { OrganizationService } from "../../scripts/collections/organization-service.js";
import { HealthService } from "../../scripts/health/health-service.js";
import { VirtualGrid } from "../../scripts/applications/virtual-grid.js";
import { MediaCache } from "../../scripts/metadata/media-cache.js";
import { registerSettings } from "../../scripts/core/settings.js";
import { makeGame, syntheticFiles } from "../setup/foundry-shim.js";

const N = Number(process.env.GMAL_BENCH_N ?? 50000);

/**
 * Large synthetic catalog benchmark. Thresholds are deliberately generous (CI machines vary); the
 * measured numbers are printed and recorded in docs/testing.md.
 */
describe(`benchmark with ${N} synthetic records`, () => {
  it("builds, searches, filters, sorts, selects and virtualizes within budget", async () => {
    makeGame();
    registerSettings();
    const org = new OrganizationService().load();
    const catalog = new CatalogService({ cache: new MediaCache({ indexedDB: null }) });
    const search = new SearchService({ organization: org });
    const health = new HealthService({ catalog });
    const timings = {};
    const time = (label, fn) => { const t0 = performance.now(); const r = fn(); timings[label] = Math.round((performance.now() - t0) * 10) / 10; return r; };

    const paths = syntheticFiles(N);
    const records = time("createRecords", () => paths.map(p => createFileRecord({ url: p })));
    time("upsert", () => { for ( const r of records ) catalog.upsert(r, "files"); });
    records.forEach((r, i) => { if ( i % 5 === 0 ) { r.meta.width = 1000 + (i % 7) * 500; r.meta.height = 800 + (i % 5) * 300; r.meta.size = 100000 + i; } });
    const all = [...catalog.all()];
    const first = time("search:firstPass(goblin dragon)", () => search.query(all, { text: "goblin dragon" }));
    const second = time("search:cached(goblin dragon)", () => search.query(all, { text: "goblin dragon" }));
    expect(first.total).toBe(second.total);
    expect(first.total).toBeGreaterThan(0);
    time("search:operators", () => search.query(all, { text: "type:image role:map -tokens width:>2000" }));
    time("filter:sizeSort", () => search.query(all, { filters: { types: ["image"], minWidth: 1500 }, sort: "size:desc" }));
    time("sort:name", () => search.sort([...all], "name:asc"));
    time("facets", () => search.facets(all));
    time("duplicates", () => health.computeDuplicates(all));
    const selection = new Set();
    time("selectAll", () => { for ( const r of all ) selection.add(r.id); });
    const v = document.createElement("div");
    Object.defineProperty(v, "clientWidth", { value: 1200 });
    Object.defineProperty(v, "clientHeight", { value: 800 });
    document.body.append(v);
    let renders = 0;
    const grid = new VirtualGrid(v, { renderCard: (r, elm) => { renders++; elm.textContent = r.name; } });
    time("grid:setItems", () => grid.setItems(all));
    time("grid:scroll", () => { for ( let i = 0; i < 50; i++ ) { v.scrollTop = i * 4000; grid.render(); } });
    expect(renders).toBeLessThan(50 * 120);
    expect(v.querySelectorAll(".gmal-card").length).toBeLessThan(120);
    time("cache:save", () => catalog.saveCache("files"));
    grid.destroy();

    console.log(`[benchmark N=${N}] ${JSON.stringify(timings)}`);
    expect(timings["search:cached(goblin dragon)"]).toBeLessThan(1500);
    expect(timings["search:operators"]).toBeLessThan(1500);
    expect(timings["grid:scroll"]).toBeLessThan(3000);
  }, 120000);
});
