import { describe, it, expect } from "vitest";
import { createEmptyProgress, validateProgress, migrateProgress, mergeProgress, summarizeProgress, reconcileWithCurriculum } from "../../scripts/progress/schema.js";
import { ProgressService } from "../../scripts/progress/service.js";
import { CurriculumRegistry } from "../../scripts/curriculum/registry.js";
import { loadCurriculum } from "../../curriculum/index.js";
import { PROGRESS_SCHEMA_VERSION, LESSON_STATES } from "../../scripts/core/constants.js";

const bundle = await loadCurriculum();
const registry = new CurriculumRegistry(bundle);
const first = registry.orderedLessons[0];

describe("progress schema", () => {
  it("creates an empty record at the current schema version", () => {
    const p = createEmptyProgress();
    expect(p.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
    expect(p.lessons).toEqual({});
    expect(p.stats.runs).toBe(0);
  });
  it("rejects non-objects and newer schemas", () => {
    expect(validateProgress("nope").record).toBeNull();
    expect(validateProgress({ schemaVersion: PROGRESS_SCHEMA_VERSION + 1 }).errors[0]).toMatch(/newer/);
  });
  it("cleans a record field by field, dropping unknown keys and malformed entries", () => {
    const { record, warnings } = validateProgress({ schemaVersion: 1, lessons: { good: { state: "mastered", openedAt: 5 }, bad: "x" }, exercises: {}, evil: { run: "code" }, stats: { runs: "many" } });
    expect(record.lessons.good.state).toBe("mastered");
    expect(record.lessons.bad).toBeUndefined();
    expect(warnings.some(w => w.includes("bad"))).toBe(true);
    expect(record.evil).toBeUndefined();
    expect(record.stats.runs).toBe(0);
  });
  it("coerces unknown lesson states to in-progress", () => {
    const { record } = validateProgress({ schemaVersion: 1, lessons: { x: { state: "nonsense" } } });
    expect(record.lessons.x.state).toBe(LESSON_STATES.IN_PROGRESS);
  });
  it("migrates a current record without applying anything", () => {
    const { record, applied } = migrateProgress(createEmptyProgress());
    expect(applied).toEqual([]);
    expect(record.schemaVersion).toBe(PROGRESS_SCHEMA_VERSION);
  });
  it("merges preferring the more advanced state and unioning attempts", () => {
    const a = createEmptyProgress(); const b = createEmptyProgress();
    a.lessons.l1 = { state: "in-progress", checkpoint: { passed: false } };
    b.lessons.l1 = { state: "mastered", checkpoint: { passed: true } };
    a.exercises.e1 = { attempts: [{ at: 1, passed: false }], passed: false, assisted: false, bestScore: 0, hintsUsed: 1, firstPassedAt: null };
    b.exercises.e1 = { attempts: [{ at: 2, passed: true }], passed: true, assisted: true, bestScore: 1, hintsUsed: 0, firstPassedAt: 2 };
    b.bookmarks = ["l1"]; a.bookmarks = ["l0"];
    const m = mergeProgress(a, b, "merge");
    expect(m.lessons.l1.state).toBe("mastered");
    expect(m.exercises.e1.attempts.length).toBe(2);
    expect(m.exercises.e1.passed).toBe(true);
    expect(m.exercises.e1.assisted).toBe(true);
    expect(m.bookmarks.sort()).toEqual(["l0", "l1"]);
    const keep = mergeProgress(a, b, "keep-existing");
    expect(keep.lessons.l1.state).toBe("in-progress");
    const replace = mergeProgress(a, b, "replace");
    expect(replace.lessons.l1.state).toBe("mastered");
    expect(replace.bookmarks).toEqual(["l1"]);
  });
  it("summarizes and reconciles with the curriculum", () => {
    const p = createEmptyProgress();
    p.lessons[first.id] = { state: "completed-guided", lessonVersion: 1 };
    p.lessons["ghost-lesson"] = { state: "in-progress", lessonVersion: 1 };
    p.exercises["ghost-ex"] = { attempts: [] };
    expect(summarizeProgress(p).completed).toBe(1);
    const rec = reconcileWithCurriculum(p, registry);
    expect(rec.unknownLessons).toEqual(["ghost-lesson"]);
    expect(rec.unknownExercises).toEqual(["ghost-ex"]);
  });
});

describe("progress service", () => {
  function makeService(initial=null) {
    let stored = initial;
    const saves = [];
    const svc = new ProgressService({ registry, load: () => stored, save: async r => { stored = r; saves.push(r); }, getSetting: () => true });
    return { svc, saves, stored: () => stored };
  }
  it("starts fresh when nothing is stored and persists on changes", async () => {
    const { svc, saves } = makeService(null);
    expect(svc.progress.lessons).toEqual({});
    await svc.recordLessonOpened(first.id);
    expect(saves.length).toBe(1);
    expect(svc.progress.lessons[first.id].state).toBe(LESSON_STATES.IN_PROGRESS);
    expect(svc.progress.lastLesson).toBe(first.id);
  });
  it("records attempts, completes a lesson from real records and awards first-macro on a run", async () => {
    const { svc } = makeService(null);
    await svc.recordLessonOpened(first.id);
    for ( const id of first.completion.required ) await svc.recordAttempt(id, { passed: true, score: 1 });
    await svc.recordCheckpoint(first.id, { passed: true, score: 1 });
    expect([LESSON_STATES.COMPLETED_INDEPENDENT, LESSON_STATES.MASTERED]).toContain(svc.progress.lessons[first.id].state);
    await svc.recordRun();
    expect(svc.progress.achievements["first-macro"]).toBeTypeOf("number");
  });
  it("marks a lesson completed-guided when a required exercise was assisted", async () => {
    const { svc } = makeService(null);
    await svc.recordLessonOpened(first.id);
    const [a, ...rest] = first.completion.required;
    await svc.recordAttempt(a, { passed: true, score: 1, assisted: true });
    for ( const id of rest ) await svc.recordAttempt(id, { passed: true, score: 1 });
    await svc.recordCheckpoint(first.id, { passed: true, score: 1 });
    expect(svc.progress.lessons[first.id].state).toBe(LESSON_STATES.COMPLETED_GUIDED);
  });
  it("exports JSON that it can inspect and import again", async () => {
    const { svc } = makeService(null);
    await svc.recordLessonOpened(first.id);
    await svc.toggleBookmark(first.id);
    const json = svc.exportJSON();
    const other = makeService(null).svc;
    const inspected = other.inspectImport(json);
    expect(inspected.ok).toBe(true);
    expect(inspected.summary.lessons).toBe(1);
    await other.applyImport(inspected.record, "merge");
    expect(other.progress.bookmarks).toEqual([first.id]);
    expect(other.inspectImport("{not json").ok).toBe(false);
    expect(other.inspectImport(JSON.stringify({ schemaVersion: 99 })).ok).toBe(false);
  });
  it("loads a corrupt store as a fresh record and reports it", () => {
    const { svc } = makeService({ schemaVersion: "bad" });
    expect(svc.progress.lessons).toEqual({});
    expect(svc.lastReport.errors.length).toBeGreaterThan(0);
  });
  it("resets to an empty record", async () => {
    const { svc } = makeService(null);
    await svc.recordLessonOpened(first.id);
    await svc.reset();
    expect(svc.progress.lessons).toEqual({});
  });
});
