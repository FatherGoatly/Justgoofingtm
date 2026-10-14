import { describe, it, expect } from "vitest";
import { CurriculumRegistry, completedSet } from "../../scripts/curriculum/registry.js";
import { loadCurriculum } from "../../curriculum/index.js";
import { createEmptyProgress } from "../../scripts/progress/schema.js";
import { LESSON_STATES } from "../../scripts/core/constants.js";

const bundle = await loadCurriculum();
const registry = new CurriculumRegistry(bundle);

describe("curriculum registry", () => {
  it("loads a valid bundle with ten tiers and ordered lessons", () => {
    expect(registry.valid).toBe(true);
    expect(registry.tiers.length).toBe(10);
    const order = registry.orderedLessons.map(l => l.tier);
    expect([...order]).toEqual([...order].sort((a, b) => a - b));
    expect(registry.orderedLessons[0].id).toBe("t0-what-is-code");
  });
  it("resolves prerequisites transitively and availability from completion", () => {
    const last = registry.orderedLessons.at(-1);
    const prereqs = registry.allPrerequisites(last.id);
    expect(prereqs).toContain("t0-what-is-code");
    expect(registry.availability("t0-what-is-code", new Set()).available).toBe(true);
    const second = registry.orderedLessons[1];
    expect(registry.availability(second.id, new Set()).available).toBe(false);
    expect(registry.availability(second.id, new Set(second.prerequisites)).available).toBe(true);
    expect(registry.dependents("t0-what-is-code").length).toBeGreaterThan(0);
  });
  it("reports locked and recorded states and recommends the next lesson", () => {
    const p = createEmptyProgress();
    expect(registry.stateOf(registry.orderedLessons[1].id, p)).toBe(LESSON_STATES.LOCKED);
    expect(registry.recommendNext(p).id).toBe("t0-what-is-code");
    p.lessons["t0-what-is-code"] = { state: LESSON_STATES.COMPLETED_INDEPENDENT };
    expect(completedSet(p).has("t0-what-is-code")).toBe(true);
    expect(registry.recommendNext(p).id).not.toBe("t0-what-is-code");
  });
  it("searches by text, difficulty, category, tier and status", () => {
    expect(registry.search({ text: "hook" }).some(l => l.id === "t6-hooks-events")).toBe(true);
    expect(registry.search({ tiers: [5] }).every(l => l.tier === 5)).toBe(true);
    expect(registry.search({ categories: ["project"] }).every(l => l.category === "project")).toBe(true);
    const p = createEmptyProgress();
    expect(registry.search({ status: "available", progress: p }).map(l => l.id)).toEqual(["t0-what-is-code"]);
  });
  it("links glossary terms, related lessons and concepts", () => {
    expect(registry.searchTerms("hook").some(t => t.slug === "hook")).toBe(true);
    expect(registry.orderedLessons.some(l => registry.termsFor(l.id).length > 0)).toBe(true);
    expect(registry.related("t6-hooks-events").prerequisites.length).toBeGreaterThan(0);
    expect(registry.related("t6-hooks-events").dependents.length).toBeGreaterThan(0);
    expect(registry.lessonsForConcept("hooks").some(l => l.id === "t6-hooks-events")).toBe(true);
    expect(registry.projects.length).toBe(10);
  });
  it("exposes the broken macro library and exercises by id", () => {
    expect(registry.brokenMacros.length).toBe(15);
    const b = registry.brokenMacros[0];
    expect(registry.getExercise(b.exercise.id)).toBeTruthy();
  });
  it("registers an additional curriculum pack and rejects invalid ones", () => {
    const cloned = JSON.parse(JSON.stringify(registry.getLesson("t0-what-is-code")).replaceAll("t0-what-is-code", "tx-extra"));
    const extra = { id: "extra", lessons: [{ ...cloned, prerequisites: ["t0-what-is-code"] }], glossary: [], tierLessons: { 0: ["tx-extra"] } };
    const issues = registry.registerPack(extra);
    expect(issues, JSON.stringify(issues)).toEqual([]);
    expect(registry.getLesson("tx-extra")).toBeTruthy();
    const bad = registry.registerPack({ id: "bad", lessons: [{ id: "nope" }], glossary: [] });
    expect(bad.length).toBeGreaterThan(0);
    expect(registry.getLesson("nope")).toBeNull();
  });
});
