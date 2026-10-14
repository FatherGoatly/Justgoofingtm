import { describe, expect, it } from "vitest";
import { compare, parseComparison, parseQuery } from "../../scripts/search/query-parser.js";

describe("parseQuery", () => {
  it("splits words, phrases and negations", () => {
    const q = parseQuery('red dragon "old chapel" -token');
    expect(q.terms).toEqual([
      { value: "red", negate: false, phrase: false },
      { value: "dragon", negate: false, phrase: false },
      { value: "old chapel", negate: false, phrase: true },
      { value: "token", negate: true, phrase: false }
    ]);
    expect(q.operators).toEqual([]);
    expect(q.empty).toBe(false);
  });

  it("parses operators with multiple values and quoted values", () => {
    const q = parseQuery('type:image,audio folder:"Battle Maps" -tag:undead favorite:true');
    expect(q.operators).toEqual([
      { key: "type", values: ["image", "audio"], negate: false, raw: "type:image,audio" },
      { key: "folder", values: ["Battle Maps"], negate: false, raw: 'folder:"Battle Maps"' },
      { key: "tag", values: ["undead"], negate: true, raw: "-tag:undead" },
      { key: "favorite", values: ["true"], negate: false, raw: "favorite:true" }
    ]);
  });

  it("reports unknown operators and still searches them as text", () => {
    const q = parseQuery("colour:red goblin");
    expect(q.warnings).toHaveLength(1);
    expect(q.warnings[0]).toMatch(/Unknown operator "colour:"/);
    expect(q.terms.map(t => t.value)).toEqual(["colour:red", "goblin"]);
  });

  it("ignores operators without a value and empty input", () => {
    expect(parseQuery("type:").operators).toEqual([]);
    expect(parseQuery("type:").warnings[0]).toMatch(/no value/);
    expect(parseQuery("   ").empty).toBe(true);
  });

  it("parses numeric comparisons including sizes and times", () => {
    expect(parseComparison(">2000")).toEqual({ op: ">", value: 2000 });
    expect(parseComparison("<=512")).toEqual({ op: "<=", value: 512 });
    expect(parseComparison(">5mb", { bytes: true })).toEqual({ op: ">", value: 5 * 1024 ** 2 });
    expect(parseComparison("2:30", { time: true })).toEqual({ op: "=", value: 150 });
    expect(parseComparison("abc")).toBeNull();
    expect(compare(2048, { op: ">", value: 2000 })).toBe(true);
    expect(compare(null, { op: ">", value: 1 })).toBe(false);
    expect(compare(150, { op: "=", value: 150 })).toBe(true);
  });
});
