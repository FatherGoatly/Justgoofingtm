import { describe, it, expect } from "vitest";
import { explainError } from "../../scripts/diagnostics/error-explainer.js";
import { inspect, typeOf, resolvePath } from "../../scripts/diagnostics/inspector.js";
import { HookMonitor, describeArg } from "../../scripts/diagnostics/hook-monitor.js";
import { formatDiagnosticReport } from "../../scripts/diagnostics/report.js";
import { installFoundryGlobals } from "../setup/foundry-mock.js";
import { loadCurriculum } from "../../curriculum/index.js";
import { CurriculumRegistry } from "../../scripts/curriculum/registry.js";

const registry = new CurriculumRegistry(await loadCurriculum());

describe("error explainer", () => {
  it("explains common messages with a real lesson and extracted names, without inventing details", () => {
    const e = explainError({ name: "ReferenceError", message: "tokn is not defined", line: 3 });
    expect(e.confirmed).toBe(true);
    expect(e.extracted).toBe("tokn");
    expect(registry.getLesson(e.lessonId)).toBeTruthy();
    const t = explainError({ name: "TypeError", message: "Cannot read properties of undefined (reading 'hp')" });
    expect(t.extracted).toBe("hp");
    expect(registry.getLesson(t.lessonId)).toBeTruthy();
  });
  it("falls back to the general method for unknown messages and says so", () => {
    const u = explainError({ name: "Error", message: "something entirely unexpected 9f8a" });
    expect(u.confirmed).toBe(false);
    expect(u.title).toMatch(/not a message the academy recognises/);
    expect(registry.getLesson(u.lessonId)).toBeTruthy();
  });
  it("links every rule to an existing lesson", () => {
    const samples = [
      "Permission denied: Player One does not own \"Goblin Scout\" and cannot update it.",
      "\"x.y\" is not a registered game setting",
      "Dialog is not defined",
      "Unexpected token '}'",
      "canvas.tokens.controlled[0] is undefined",
      "Cannot read properties of null (reading 'actor')",
      "actor.rollAbilitySave is not a function",
      "Maximum call stack size exceeded",
      "t.actor.update is not a function"
    ];
    for ( const message of samples ) {
      const e = explainError({ name: "Error", message });
      expect(registry.getLesson(e.lessonId), `${message} -> ${e.lessonId}`).toBeTruthy();
    }
  });
});

describe("object inspector", () => {
  it("inspects nested values with depth and key limits and never calls functions", () => {
    let called = false;
    const obj = { a: 1, b: "two", c: [1, 2, 3], d: { e: { f: { g: { h: 1 } } } }, fn() { called = true; return 1; }, s: new Set([1]), m: new Map([["k", 1]]) };
    const tree = inspect(obj, { maxDepth: 2 });
    expect(called).toBe(false);
    expect(tree.type).toBe("object");
    const names = tree.children.map(c => c.key);
    expect(names).toContain("fn");
    expect(tree.children.find(c => c.key === "fn").type).toBe("function");
    expect(JSON.stringify(tree)).toMatch(/"truncated":true/);
  });
  it("describes types and resolves paths safely", () => {
    expect(typeOf(null)).toBe("null");
    expect(typeOf([])).toBe("array");
    expect(typeOf(new Map())).toBe("map");
    expect(typeOf(new Set())).toBe("set");
    expect(resolvePath({ a: { b: [1, { c: 5 }] } }, "a.b.1.c")).toBe(5);
    expect(resolvePath({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(resolvePath(new Map([["k", new Set([7])]]), "k.0")).toBe(7);
  });
});

describe("hook monitor and report", () => {
  it("records hook events with argument summaries and caps the log", () => {
    const calls = [];
    globalThis.Hooks = { on: (name, fn) => { calls.push({ name, fn }); return calls.length; }, off: () => {} };
    const m = new HookMonitor({ max: 3 });
    m.start(["updateActor"]);
    expect(m.active).toBe(true);
    for ( let i = 0; i < 5; i++ ) calls[0].fn({ documentName: "Actor", name: "Orc", id: "o" + i }, { system: {} }, {}, "u");
    expect(m.events.length).toBe(3);
    expect(m.events[0].summary).toMatch(/Actor|Orc/);
    m.stop();
    expect(m.active).toBe(false);
    installFoundryGlobals();
  });
  it("summarizes arguments without dumping whole objects", () => {
    expect(describeArg({ documentName: "Actor", name: "Orc", id: "x" })).toMatch(/Actor/);
    expect(describeArg("text")).toBe("\"text\"");
    expect(describeArg(42)).toBe("42");
    expect(describeArg(null)).toBe("null");
    const big = describeArg({ a: "x".repeat(500) });
    expect(big.length).toBeLessThan(400);
  });
  it("formats a report as text and omits secrets", () => {
    const text = formatDiagnosticReport({ generatedAt: "now", module: { id: "gm-macro-academy", version: "1.0.0", active: true }, foundry: { version: "14.369", supported: true }, system: { id: "dnd5e", version: "6.0.6", adapter: "dnd5e", adapterVerified: { verified: "6.0.6" }, versionSupported: true }, user: { role: "GAMEMASTER", isGM: true, permissions: { MACRO_SCRIPT: true } }, modules: [{ id: "midi-qol", version: "14.6.2", active: true, verified: "14.6.2", supported: true }], integrations: { "midi-qol": { active: true, version: "14.6.2", apiPresent: true, missing: [] } }, activeModuleCount: 2, browser: { userAgent: "test", workers: true }, warnings: ["careful"] });
    expect(text).toMatch(/gm-macro-academy/);
    expect(text).toMatch(/14\.369/);
    expect(text).toMatch(/careful/);
    expect(text).not.toMatch(/password|token|apiKey/i);
  });
});
