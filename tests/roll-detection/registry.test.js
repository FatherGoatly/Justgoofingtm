import { describe, it, expect } from "vitest";
import { RollRegistry, buildRollKey, getRollTag, setRollTag, KEY_SOURCES } from "../../scripts/roll-registry.js";
import { natural20Attack } from "../fixtures/rolls.js";

describe("roll keys", () => {
  it("prefers the serialized tag, then workflow, then message, then nothing", () => {
    const roll = natural20Attack();
    expect(buildRollKey({ roll }).source).toBe(KEY_SOURCES.NONE);
    expect(buildRollKey({ roll, messageId: "m1", index: 2 })).toEqual({ key: "message:m1:2", source: KEY_SOURCES.MESSAGE });
    expect(buildRollKey({ roll, messageId: "m1", workflowKey: "midi:w" })).toEqual({ key: "workflow:midi:w", source: KEY_SOURCES.WORKFLOW });
    setRollTag(roll, "abc");
    expect(getRollTag(roll)).toBe("abc");
    expect(buildRollKey({ roll, messageId: "m1", workflowKey: "w" })).toEqual({ key: "tag:abc", source: KEY_SOURCES.TAG });
  });
  it("tags survive JSON serialization (as roll options do in chat messages)", () => {
    const roll = natural20Attack();
    setRollTag(roll, "xyz");
    expect(getRollTag(JSON.parse(JSON.stringify(roll)))).toBe("xyz");
  });
});

describe("RollRegistry", () => {
  it("claims a key once", () => {
    const r = new RollRegistry();
    expect(r.claim("a")).toBe(true);
    expect(r.claim("a")).toBe(false);
  });
  it("tracks object identity when no key is available", () => {
    const r = new RollRegistry();
    const roll = natural20Attack();
    const twin = natural20Attack();
    expect(r.claim(null, roll)).toBe(true);
    expect(r.claim(null, roll)).toBe(false);
    expect(r.claim(null, twin)).toBe(true);
  });
  it("does not conflate distinct rolls with identical totals", () => {
    const r = new RollRegistry();
    expect(r.claim("message:m1:0")).toBe(true);
    expect(r.claim("message:m2:0")).toBe(true);
    expect(r.claim("message:m1:1")).toBe(true);
  });
  it("expires keys after the ttl and enforces the size limit", () => {
    let now = 1000;
    const r = new RollRegistry({ ttl: 100, max: 2, now: () => now });
    r.claim("a"); r.claim("b"); r.claim("c");
    expect(r.size).toBe(2);
    now += 200;
    expect(r.has("b")).toBe(false);
    expect(r.size).toBe(0);
  });
  it("release allows a retry after a failed award", () => {
    const r = new RollRegistry();
    r.claim("k");
    r.release("k");
    expect(r.claim("k")).toBe(true);
  });
});
