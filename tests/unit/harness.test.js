import { describe, it, expect } from "vitest";
import { runProgram, checkSyntax, describeError } from "../../scripts/workshop/harness.js";
import { runInNodeWorker } from "../setup/node-runner.js";

describe("execution harness", () => {
  it("captures console output and return values", async () => {
    const r = await runProgram({ code: `console.log("hi", 2, {a: 1}); return 5;`, globals: {} });
    expect(r.ok).toBe(true);
    expect(r.output).toEqual(["hi 2 { a: 1 }"]);
    expect(r.returnValue).toBe(5);
  });
  it("reports runtime errors with a learner line number", async () => {
    const r = await runProgram({ code: `const a = 1;\nconst b = a.foo.bar;`, globals: {} });
    expect(r.ok).toBe(false);
    expect(r.error.name).toBe("TypeError");
    expect(r.error.line).toBe(2);
  });
  it("reports syntax errors", async () => {
    const r = await runProgram({ code: `const = 5`, globals: {} });
    expect(r.ok).toBe(false);
    expect(r.error.name).toBe("SyntaxError");
    expect(checkSyntax("if (").ok).toBe(false);
    expect(checkSyntax("const x = await Promise.resolve(1);").ok).toBe(true);
  });
  it("runs call tests against defined functions", async () => {
    const r = await runProgram({ code: `function add(a, b) { return a + b; }\nconst twice = x => x * 2;`, globals: {}, tests: [{ name: "a", call: "add", args: [2, 3], expect: 5 }, { name: "b", call: "twice", args: [4], expect: 8 }, { name: "c", call: "missing", args: [] }] });
    expect(r.callResults).toEqual([{ index: 0, result: 5 }, { index: 1, result: 8 }, { index: 2, missing: true }]);
  });
  it("does not expose the page or network to programs", async () => {
    const r = await runInNodeWorker({ mode: "sandbox", code: `return [typeof document, typeof window, typeof fetch, typeof game];` });
    expect(r.returnValue).toEqual(["undefined", "undefined", "undefined", "undefined"]);
  });
  it("terminates infinite loops in the worker", async () => {
    const r = await runInNodeWorker({ mode: "sandbox", code: `let i = 0; while (true) { i++; }` }, { timeoutMs: 500 });
    expect(r.timedOut).toBe(true);
  });
  it("describes non-Error throws", () => {
    expect(describeError("boom")).toMatchObject({ name: "Error", message: "boom" });
  });
});
