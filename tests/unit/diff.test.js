import { describe, it, expect } from "vitest";
import { diffLines, summarizeDiff, explainDiff } from "../../scripts/utilities/diff.js";

describe("diff", () => {
  it("identifies added and removed lines", () => {
    const d = diffLines("a\nb\nc", "a\nc\nd");
    expect(d.map(x => x.type)).toEqual(["same", "removed", "same", "added"]);
    expect(summarizeDiff(d)).toMatchObject({ added: 1, removed: 1 });
  });
  it("reports identical texts", () => {
    expect(summarizeDiff(diffLines("x", "x")).summary).toMatch(/identical/);
  });
  it("explains notable differences", () => {
    const notes = explainDiff(diffLines("const r = actor.update(data);", "const r = await actor.update(data);"));
    expect(notes.join(" ")).toMatch(/await/);
  });
});
