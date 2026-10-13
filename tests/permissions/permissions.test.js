import { describe, it, expect, beforeEach } from "vitest";
import { makeGame } from "../setup/foundry-shim.js";
import * as permissions from "../../scripts/core/permissions.js";
import { importBundle } from "../../scripts/import/importer.js";
import { runPipeline } from "../../scripts/import/pipeline.js";
import { compatibility } from "../../scripts/core/compatibility.js";
import { registerIntegrations } from "../../scripts/automation/integrations/index.js";
import { runtime } from "../../scripts/automation/runtime.js";
import { triggerRegistry } from "../../scripts/automation/trigger-registry.js";
import { readFileSync } from "node:fs";

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

function actorOwnedBy(ownerId) {
  const items = [];
  const actor = {
    name: "Someone's PC", uuid: "Actor.pc", id: "pc", items,
    testUserPermission: (user, level) => user.id === ownerId || user.isGM,
    createEmbeddedDocuments: async (type, data) => { const made = data.map((d, i) => ({ ...d, id: `i${items.length + i}`, uuid: `Actor.pc.Item.i${items.length + i}`, toObject: () => d, getFlag: (s, k) => d.flags?.[s]?.[k], effects: d.effects ?? [] })); items.push(...made); return made; }
  };
  return actor;
}

describe("permissions", () => {
  it("players may only import into actors they own and are redirected to staging when allowed", () => {
    globalThis.game = makeGame({ isGM: false, settings: { playerDestinations: "both" } });
    const mine = actorOwnedBy("user1");
    const theirs = actorOwnedBy("user2");
    expect(permissions.authorizeDestination({ type: "actor", actor: mine }).allowed).toBe(true);
    const denied = permissions.authorizeDestination({ type: "actor", actor: theirs });
    expect(denied.allowed).toBe(false);
    expect(denied.redirect).toEqual({ type: "staging" });
    expect(permissions.authorizeDestination({ type: "compendium" }).allowed).toBe(false);
  });

  it("players cannot create world documents without the core permission", () => {
    globalThis.game = makeGame({ isGM: false });
    const r = permissions.authorizeDestination({ type: "world" });
    expect(r.allowed).toBe(false);
    globalThis.game = makeGame({ isGM: false, can: p => p === "ITEM_CREATE" });
    expect(permissions.authorizeDestination({ type: "world" }).allowed).toBe(true);
  });

  it("player imports are disabled by setting", () => {
    globalThis.game = makeGame({ isGM: false, settings: { allowPlayerImport: false } });
    expect(permissions.canUseImporter()).toBe(false);
    expect(permissions.authorizeDestination({ type: "staging" }).allowed).toBe(false);
  });

  it("macro policy gates script macro generation", () => {
    globalThis.game = makeGame({ isGM: false, settings: { macroPolicy: "gmOnly" } });
    expect(permissions.canGenerateMacros()).toBe(false);
    globalThis.game = makeGame({ isGM: false, can: p => p === "MACRO_SCRIPT", settings: { macroPolicy: "owners" } });
    expect(permissions.canGenerateMacros()).toBe(true);
    globalThis.game = makeGame({ isGM: true, settings: { macroPolicy: "never" } });
    expect(permissions.canGenerateMacros()).toBe(false);
  });

  it("strips ownership, ids, folders and foreign flags from imported data", () => {
    const out = permissions.sanitizeOwnership({ name: "x", _id: "abc", ownership: { default: 3 }, folder: "f", flags: { core: { sourceId: "z", other: 1 }, evil: { a: 1 }, dnd5e: { ok: true } }, items: [{ name: "i", ownership: { default: 3 } }] });
    expect(out._id).toBeUndefined();
    expect(out.ownership).toBeUndefined();
    expect(out.folder).toBeUndefined();
    expect(out.flags.evil).toBeUndefined();
    expect(out.flags.core.sourceId).toBeUndefined();
    expect(out.flags.dnd5e.ok).toBe(true);
    expect(out.items[0].ownership).toBeUndefined();
  });
});

describe("importer (scenario 5 & 7)", () => {
  beforeEach(() => { Hooks.reset(); compatibility.reset(); triggerRegistry.reset(); });

  it("rejects a player import into an actor they do not own and redirects to staging", async () => {
    globalThis.game = makeGame({ isGM: false, settings: { playerDestinations: "both", duplicatePolicy: "create" } });
    game.items = []; game.actors = []; game.folders = { find: () => null };
    registerIntegrations(compatibility); compatibility.detect(); runtime.ready({ compatibility, triggerRegistry });
    const created = [];
    globalThis.Item = { createDocuments: async docs => docs.map((d, i) => { const doc = { ...d, id: `w${i}`, uuid: `Item.w${i}`, toObject: () => d, getFlag: (s, k) => d.flags?.[s]?.[k], effects: d.effects ?? [], delete: async () => {} }; created.push(doc); return doc; }) };
    const theirs = actorOwnedBy("user2");
    const bundle = runPipeline(fixture("longsword-plus-one.txt"));
    const report = await importBundle(bundle, { destination: { type: "actor", actor: theirs }, acknowledgeReview: true });
    expect(theirs.items).toHaveLength(0);
    expect(report.status).toBe("complete");
    expect(report.warnings.some(w => /Redirected to staging/.test(w))).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].flags["stat-block-importer"].staging).toBe(true);
    expect(created[0].ownership).toBeUndefined();
  });

  it("imports into an owned actor and detects re-imports", async () => {
    globalThis.game = makeGame({ isGM: false, settings: { duplicatePolicy: "ask" } });
    game.items = []; game.actors = []; game.folders = { find: () => null };
    registerIntegrations(compatibility); compatibility.detect(); runtime.ready({ compatibility, triggerRegistry });
    const mine = actorOwnedBy("user1");
    const bundle = runPipeline(fixture("flame-tongue.txt"));
    const first = await importBundle(bundle, { destination: { type: "actor", actor: mine }, acknowledgeReview: true });
    expect(first.status).toBe("complete");
    expect(mine.items).toHaveLength(1);
    expect(first.embedded[0].actor).toBe("Someone's PC");
    expect(first.mechanics.implemented.length).toBeGreaterThan(0);
    const second = await importBundle(runPipeline(fixture("flame-tongue.txt")), { destination: { type: "actor", actor: mine } , acknowledgeReview: true });
    expect(second.status).toBe("duplicates");
    expect(second.conflicts[0].matches[0].reason).toBe("fingerprint");
    expect(mine.items).toHaveLength(1);
    const third = await importBundle(runPipeline(fixture("flame-tongue.txt")), { destination: { type: "actor", actor: mine }, duplicatePolicy: "skip", acknowledgeReview: true });
    expect(third.status).toBe("complete");
    expect(third.skipped[0].reason).toBe("duplicate");
    expect(mine.items).toHaveLength(1);
  });

  it("enforces the batch size and review gate", async () => {
    globalThis.game = makeGame({ isGM: true, settings: { maxBatchSize: 2 } });
    game.items = []; game.actors = []; game.folders = { find: () => null };
    registerIntegrations(compatibility); compatibility.detect(); runtime.ready({ compatibility, triggerRegistry });
    const big = runPipeline(fixture("adult-red-dragon-2024.txt"));
    const r = await importBundle(big, { destination: { type: "world" } });
    expect(r.status).toBe("rejected");
    globalThis.game = makeGame({ isGM: true, settings: { reviewPolicy: "ambiguous" } });
    game.items = []; game.actors = []; game.folders = { find: () => null };
    const ambiguous = runPipeline("Shriek Stone\nWondrous item, rare\nA creature that hears it must succeed on a Constitution saving throw or be deafened for 1 minute.");
    const r2 = await importBundle(ambiguous, { destination: { type: "world" } });
    expect(r2.status).toBe("review-required");
    expect(r2.review[0].mechanic.kind).toBe("condition.on-failed-save");
  });

  it("rolls back created documents when a later creation fails", async () => {
    globalThis.game = makeGame({ isGM: true, settings: { duplicatePolicy: "create" } });
    game.items = []; game.actors = []; game.folders = { find: () => null };
    registerIntegrations(compatibility); compatibility.detect(); runtime.ready({ compatibility, triggerRegistry });
    const deleted = [];
    let calls = 0;
    globalThis.Item = { createDocuments: async docs => { calls++; if ( calls === 2 ) throw new Error("boom"); return docs.map((d, i) => ({ ...d, id: `r${i}`, uuid: `Item.r${i}`, toObject: () => d, getFlag: (s, k) => d.flags?.[s]?.[k], effects: [], delete: async () => deleted.push(d.name) })); } };
    const bundle = runPipeline(`${fixture("flame-tongue.txt")}\n\n${fixture("potion-of-healing.txt")}`);
    expect(bundle.entries).toHaveLength(2);
    const report = await importBundle(bundle, { destination: { type: "world" }, acknowledgeReview: true });
    expect(report.status).toBe("failed");
    expect(report.rolledBack).toBe(true);
    expect(deleted).toEqual(["Flame Tongue"]);
  });
});
