import { beforeEach, describe, expect, it } from "vitest";
import { buildServices, moduleApi } from "../../scripts/core/services.js";
import { registerSettings, SETTINGS } from "../../scripts/core/settings.js";
import { MODULE_ID } from "../../scripts/core/constants.js";
import { makeBrowse, makeDoc, makeGame } from "../setup/foundry-shim.js";
import { mediaCache } from "../../scripts/metadata/media-cache.js";

const TREE = { data: { assets: { maps: ["chapel.webp"], tokens: ["goblin.png"], __files: [] }, modules: { m: ["junk.png"] } }, public: { icons: ["sword.svg"] } };

describe("service graph (integration)", () => {
  let game;

  beforeEach(async () => {
    await mediaCache.clearAll();
    const actor = makeDoc({ documentName: "Actor", name: "Goblin Chief", img: "assets/tokens/goblin.png" });
    const pack = { collection: "srd.monsters", title: "SRD Monsters", metadata: { type: "Actor", label: "SRD Monsters", packageName: "srd" }, documentName: "Actor", visible: true, folders: [], index: new Map([["g", { _id: "g", name: "Goblin", img: "g.png", type: "npc" }]]), getIndex: async () => new Map([["g", { _id: "g", name: "Goblin", img: "g.png", type: "npc" }]]), getUuid: id => `Compendium.srd.monsters.Actor.${id}` };
    game = makeGame({ isGM: true, collections: { actors: [actor], packs: [pack] } });
    registerSettings();
    globalThis.foundry.applications.apps.FilePicker = { implementation: class { constructor() { this.sources = { data: {}, public: {} }; } static browse = makeBrowse(TREE); } };
    globalThis.indexedDB = undefined;
  });

  it("indexes files, world documents and compendiums through the real adapters and exposes the API", async () => {
    const services = buildServices();
    await services.ensureIndexed();
    const { catalog } = services;
    expect(catalog.state.status).toBe("done");
    expect(catalog.byAdapter("files").map(r => r.path).sort()).toEqual(["assets/maps/chapel.webp", "assets/tokens/goblin.png"]);
    expect(catalog.byAdapter("world")).toHaveLength(1);
    expect(catalog.byAdapter("compendiums")).toHaveLength(1);
    const api = moduleApi(services, { openBrowser() {}, openDiagnostics() {} });
    expect(api.id).toBe(MODULE_ID);
    expect(api.search("goblin").map(r => r.source.kind).sort()).toEqual(["compendium", "file", "world"]);
    expect(api.search("goblin", { scope: "files" })).toHaveLength(1);
    // Second call is a no-op; reindex with documents only keeps files.
    await services.ensureIndexed();
    await services.reindex({ full: false });
    expect(catalog.byAdapter("files")).toHaveLength(2);
    // Extension point.
    let ran = false;
    api.registerAction({ id: "ext-hello", label: "GMAL.Action.Open", icon: "x", available: () => true, run: async () => { ran = true; } }, { module: "other-module" });
    await services.actions.run("ext-hello", [catalog.byAdapter("files")[0]], {});
    expect(ran).toBe(true);
    expect(services.extensions.list()).toEqual([{ kind: "action", id: "ext-hello", module: "other-module" }]);
  });

  it("respects the include settings and the scan roots", async () => {
    await game.settings.set(MODULE_ID, SETTINGS.INCLUDE_COMPENDIUMS, false);
    await game.settings.set(MODULE_ID, SETTINGS.FILE_ROOTS, "data:assets/maps, public:icons");
    const services = buildServices();
    await services.ensureIndexed();
    expect(services.catalog.byAdapter("compendiums")).toHaveLength(0);
    expect(services.catalog.byAdapter("files").map(r => r.path).sort()).toEqual(["assets/maps/chapel.webp", "icons/sword.svg"]);
    expect(services.catalog.state.adapters.compendiums.status).toBe("idle");
  });

  it("marks file browsing unavailable for a player without permission but still catalogs visible documents", async () => {
    makeGame({ isGM: false, permissions: {}, collections: { actors: [makeDoc({ documentName: "Actor", name: "Visible", img: "v.png" })] } });
    registerSettings();
    const services = buildServices();
    await services.ensureIndexed();
    expect(services.catalog.state.adapters.files.status).toBe("unavailable");
    expect(services.catalog.byAdapter("world")).toHaveLength(1);
  });
});
