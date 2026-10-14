import { describe, it, expect } from "vitest";
import { DraftService, normalizeDraftStore, createEmptyDraftStore } from "../../scripts/workshop/drafts.js";
import { LIMITS } from "../../scripts/core/constants.js";

function makeService(initial=null) {
  let stored = initial;
  return { svc: new DraftService({ load: () => stored, save: async s => { stored = s; } }), stored: () => stored };
}

describe("draft service", () => {
  it("normalizes unknown stores", () => {
    expect(normalizeDraftStore(null).store).toEqual(createEmptyDraftStore());
    const n = normalizeDraftStore({ version: 1, drafts: { a: "junk", b: { name: "ok", code: "x", runtime: "weird" } } });
    expect(n.dropped).toEqual(["a"]);
    expect(n.store.drafts.b.runtime).toBe("sandbox");
  });
  it("creates, saves versions, renames, duplicates, restores and deletes", async () => {
    const { svc } = makeService();
    const d = await svc.create({ name: "Heal", code: "v1" });
    expect(svc.get(d.id).code).toBe("v1");
    await svc.save(d.id, "v2");
    await svc.save(d.id, "v3");
    expect(svc.get(d.id).versions.length).toBe(2);
    await svc.rename(d.id, "Heal party");
    expect(svc.get(d.id).name).toBe("Heal party");
    const copy = await svc.duplicate(d.id);
    expect(copy.id).not.toBe(d.id);
    expect(copy.code).toBe("v3");
    await svc.restoreVersion(d.id, 0);
    expect(svc.get(d.id).code).toBe("v1");
    await svc.delete(d.id);
    expect(svc.get(d.id)).toBeNull();
    expect(svc.list().length).toBe(1);
  });
  it("caps version history and enforces draft limits", async () => {
    const { svc } = makeService();
    const d = await svc.create({ name: "Big", code: "0" });
    for ( let i = 1; i <= LIMITS.MAX_DRAFT_VERSIONS + 3; i++ ) await svc.save(d.id, String(i));
    expect(svc.get(d.id).versions.length).toBe(LIMITS.MAX_DRAFT_VERSIONS);
    await expect(svc.save(d.id, "x".repeat(LIMITS.MAX_DRAFT_BYTES + 1))).rejects.toThrow(/at most/);
    const usage = svc.usage();
    expect(usage.count).toBe(1);
    expect(usage.bytes).toBeGreaterThan(0);
  });
});
