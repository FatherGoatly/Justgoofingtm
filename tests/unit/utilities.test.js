import { describe, it, expect } from "vitest";
import { formatDuration, normalizeWhitespace, looselyEqual, byteSize, shortId, clone, truncate } from "../../scripts/utilities/text.js";
import { plainify, enforceSize } from "../../scripts/workshop/snapshot.js";
import { LIMITS } from "../../scripts/core/constants.js";
import { liveWarningContent } from "../../scripts/workshop/live-executor.js";
import { createPracticeSnapshot } from "../../scripts/workshop/practice-snapshot.js";

describe("text utilities", () => {
  it("formats durations, normalizes and compares loosely", () => {
    expect(formatDuration(45)).toMatch(/45/);
    expect(formatDuration(90)).toMatch(/1/);
    expect(normalizeWhitespace("a \r\nb  \n")).toBe("a\nb");
    expect(looselyEqual("Hello World  \n", "Hello World")).toBe(true);
    expect(looselyEqual("a", "b")).toBe(false);
  });
  it("measures, ids, clones and truncates", () => {
    expect(byteSize({ a: "xy" })).toBeGreaterThan(5);
    expect(shortId(8)).toMatch(/^[A-Za-z0-9]{8}$/);
    const o = { a: [1] }; const c = clone(o); c.a.push(2);
    expect(o.a).toEqual([1]);
    expect(truncate("x".repeat(200), 10).length).toBeLessThanOrEqual(11);
  });
});

describe("snapshot helpers", () => {
  it("plainifies without functions, cycles or prototypes", () => {
    const cyc = { a: 1, fn() {}, nested: { b: new Set([1]) } }; cyc.self = cyc;
    const out = plainify(cyc);
    expect(out.fn).toBeUndefined();
    expect(JSON.stringify(out)).toBeTypeOf("string");
    expect(out.nested.b).toEqual([1]);
  });
  it("trims oversized snapshots in a documented order", () => {
    const snap = createPracticeSnapshot();
    snap.actors = Array.from({ length: 400 }, (_, i) => ({ id: "a" + i, name: "A" + i, items: Array.from({ length: 50 }, (_, j) => ({ id: "i" + j, name: "x".repeat(300) })), effects: [] }));
    expect(byteSize(snap)).toBeGreaterThan(LIMITS.SNAPSHOT_MAX_BYTES);
    const trimmed = enforceSize(snap);
    expect(trimmed.trimmed.length).toBeGreaterThan(0);
    expect(byteSize(trimmed)).toBeLessThanOrEqual(LIMITS.SNAPSHOT_MAX_BYTES);
  });
  it("practice snapshots are deterministic and self-consistent", () => {
    const a = createPracticeSnapshot(), b = createPracticeSnapshot();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const ids = new Set(a.actors.map(x => x.id));
    for ( const t of a.tokens ) expect(ids.has(t.actorId)).toBe(true);
    expect(createPracticeSnapshot({ gm: false }).user.isGM).toBe(false);
    expect(createPracticeSnapshot({ modules: ["midi-qol"] }).modules.some(m => m.id === "midi-qol" && m.active)).toBe(true);
  });
});

describe("live execution warning", () => {
  it("states that live code changes the world and names the permissions", () => {
    const html = liveWarningContent({ role: "GAMEMASTER", isGM: true, permissions: { MACRO_SCRIPT: true } });
    expect(html).toMatch(/live game/i);
    expect(html).toMatch(/Gamemaster/);
    expect(html).toMatch(/macro script/);
  });
});
