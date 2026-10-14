import { describe, it, expect } from "vitest";
import { evaluateSubmission, evaluateCheckpoint, evaluateRun, deepEqual, flatten } from "../../scripts/assessment/evaluator.js";
import { createHintState, revealNextHint, revealNextSolutionStep, isAssisted, revealedHints, HINT_LEVEL_LABELS } from "../../scripts/assessment/hints.js";
import { computeLessonState, tierMastery, overallProgress, currentTier } from "../../scripts/assessment/mastery.js";
import { ACHIEVEMENTS, newlyEarned, achievementStatus } from "../../scripts/assessment/achievements.js";
import { conceptStats, reviewRecommendations, lessonsNeedingReview, REVIEW_RULES } from "../../scripts/assessment/review.js";
import { createEmptyProgress } from "../../scripts/progress/schema.js";
import { CurriculumRegistry } from "../../scripts/curriculum/registry.js";
import { loadCurriculum } from "../../curriculum/index.js";
import { LESSON_STATES } from "../../scripts/core/constants.js";

const bundle = await loadCurriculum();
const registry = new CurriculumRegistry(bundle);
const byType = type => registry.orderedLessons.flatMap(l => [...l.exercises, l.challenge].filter(Boolean)).find(e => e.type === type);

describe("evaluator: submissions", () => {
  it("grades multiple choice, including wrong answers", () => {
    const ex = byType("multiple-choice");
    expect(evaluateSubmission(ex, ex.answer).passed).toBe(true);
    const wrong = ex.options.find(o => o.id !== ex.answer).id;
    expect(evaluateSubmission(ex, wrong).passed).toBe(false);
  });
  it("grades predicted output ignoring trailing whitespace but not content", () => {
    const ex = byType("predict-output");
    const answer = Array.isArray(ex.answer) ? ex.answer[0] : ex.answer;
    expect(evaluateSubmission(ex, answer + "   ").passed).toBe(true);
    expect(evaluateSubmission(ex, answer + "\nextra").passed).toBe(false);
  });
  it("grades fill-blank case-insensitively", () => {
    const ex = byType("fill-blank");
    expect(evaluateSubmission(ex, ex.blanks.map(b => b.accept[0].toUpperCase())).passed).toBe(true);
    expect(evaluateSubmission(ex, ex.blanks.map(() => "zzz")).passed).toBe(false);
  });
  it("grades identify-error requiring exactly the faulty lines", () => {
    const ex = byType("identify-error");
    expect(evaluateSubmission(ex, ex.answer).passed).toBe(true);
    expect(evaluateSubmission(ex, [...ex.answer, 999]).passed).toBe(false);
  });
  it("grades reorder-steps", () => {
    const ex = byType("reorder-steps");
    expect(evaluateSubmission(ex, ex.answer).passed).toBe(true);
    expect(evaluateSubmission(ex, [...ex.answer].reverse()).passed).toBe(false);
  });
  it("grades api-discovery against accepted paths ignoring spacing and case", () => {
    const ex = byType("api-discovery");
    expect(evaluateSubmission(ex, " " + ex.accept[0].toUpperCase() + " ").passed).toBe(true);
    expect(evaluateSubmission(ex, "game.nothing.here").passed).toBe(false);
  });
  it("requires rubric coverage and enough words for explanations", () => {
    const ex = byType("explain-code");
    const all = ex.rubric.map(r => r.id);
    const words = Array(ex.minWords + 1).fill("word").join(" ");
    expect(evaluateSubmission(ex, { text: words, rubric: all }).passed).toBe(true);
    expect(evaluateSubmission(ex, { text: "short", rubric: all }).passed).toBe(false);
    expect(evaluateSubmission(ex, { text: words, rubric: [] }).passed).toBe(false);
  });
  it("grades checkpoints by pass score", () => {
    const lesson = registry.orderedLessons[0];
    const cp = lesson.checkpoint;
    const right = Object.fromEntries(cp.questions.map(q => [q.id, q.answer]));
    expect(evaluateCheckpoint(cp, right).passed).toBe(true);
    expect(evaluateCheckpoint(cp, {}).passed).toBe(false);
    expect(evaluateCheckpoint(cp, {}).score).toBe(0);
  });
});

describe("evaluator: run results", () => {
  const ex = { id: "x", type: "complete-macro", tests: [
    { name: "no error", expectNoError: true },
    { name: "output", expectOutput: ["a", "b"] },
    { name: "includes", outputIncludes: "b" },
    { name: "chat", expectChat: { count: 1, contains: "Hi <there>", whisperToGM: true } },
    { name: "update", expectUpdate: { name: "Orc", path: "system.attributes.hp.value", value: 3 } },
    { name: "no update", expectNoUpdate: { name: "Wolf" } },
    { name: "mechanic", expectMechanic: { type: "midi-qol.findNearby" } },
    { name: "hook", expectHook: { name: "updateActor" } },
    { name: "code", codeIncludes: "escapeHTML" },
    { name: "code excludes", codeExcludes: "eval\\(" }
  ] };
  const run = { ok: true, error: null, output: ["a", "b"], chat: [{ content: "<p>Hi &lt;there&gt;</p>", whisper: ["gm"], speaker: {}, rolls: [] }], updates: [{ name: "Orc", data: { "system.attributes.hp.value": 3 } }], mechanics: [{ type: "midi-qol.findNearby" }], hooks: [{ name: "updateActor" }], notifications: [], dialogs: [], rolls: [], creates: [] };
  it("passes a matching run", () => {
    const r = evaluateRun(ex, run, "foundry.utils.escapeHTML(x)");
    expect(r.checks.filter(c => !c.passed).map(c => c.name)).toEqual([]);
    expect(r.passed).toBe(true);
  });
  it("fails the right checks on a bad run", () => {
    const bad = { ...run, output: ["a"], chat: [], updates: [{ name: "Wolf", data: { "system.attributes.hp.value": 0 } }], mechanics: [], hooks: [] };
    const r = evaluateRun(ex, bad, "eval(x)");
    const failed = r.checks.filter(c => !c.passed).map(c => c.name);
    expect(failed).toEqual(["output", "includes", "chat", "update", "no update", "mechanic", "hook", "code", "code excludes"]);
  });
  it("reports thrown errors with the learner line", () => {
    const r = evaluateRun({ id: "y", tests: [{ name: "runs", expectNoError: true }] }, { ok: false, error: { name: "TypeError", message: "boom", line: 3 }, output: [] }, "");
    expect(r.passed).toBe(false);
    expect(r.checks[0].message).toMatch(/TypeError: boom/);
  });
  it("deepEqual and flatten behave", () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: "1" })).toBe(false);
    expect(flatten({ system: { attributes: { hp: { value: 3 } } } })["system.attributes.hp.value"]).toBe(3);
  });
});

describe("hints", () => {
  const ex = { hints: ["h1", "h2", "h3"], reveal: [{ title: "s1", code: "a" }, { title: "s2", code: "b" }] };
  it("reveals hints in order with level labels and never counts them as assistance", () => {
    let state = createHintState();
    const first = revealNextHint(state, ex);
    expect(first.hint).toEqual({ level: 1, label: HINT_LEVEL_LABELS[0], text: "h1" });
    state = revealNextHint(revealNextHint(first.state, ex).state, ex).state;
    expect(revealNextHint(state, ex).hint).toBeNull();
    expect(revealedHints(state, ex).map(h => h.text)).toEqual(["h1", "h2", "h3"]);
    expect(isAssisted(state)).toBe(false);
  });
  it("marks the exercise assisted once the final solution step is revealed", () => {
    let state = createHintState();
    const s1 = revealNextSolutionStep(state, ex);
    expect(s1.step.title).toBe("s1");
    expect(isAssisted(s1.state)).toBe(false);
    const s2 = revealNextSolutionStep(s1.state, ex);
    expect(s2.complete).toBe(true);
    expect(isAssisted(s2.state)).toBe(true);
  });
});

describe("mastery", () => {
  const lesson = registry.orderedLessons[1];
  const req = lesson.completion.required;
  const passed = (ids, assisted=false) => Object.fromEntries(ids.map(id => [id, { passed: true, assisted, attempts: [{ passed: true }] }]));
  it("derives states from records only", () => {
    expect(computeLessonState(lesson, createEmptyProgress())).toBe(LESSON_STATES.NOT_STARTED);
    const opened = { lessons: { [lesson.id]: { openedAt: 1 } }, exercises: {} };
    expect(computeLessonState(lesson, opened)).toBe(LESSON_STATES.IN_PROGRESS);
    const done = { lessons: { [lesson.id]: { openedAt: 1, checkpoint: { passed: true } } }, exercises: passed(req) };
    expect(computeLessonState(lesson, done)).toBe(LESSON_STATES.COMPLETED_INDEPENDENT);
    const guided = { lessons: { [lesson.id]: { openedAt: 1, checkpoint: { passed: true } } }, exercises: passed(req, true) };
    expect(computeLessonState(lesson, guided)).toBe(LESSON_STATES.COMPLETED_GUIDED);
    const noCheckpoint = { lessons: { [lesson.id]: { openedAt: 1 } }, exercises: passed(req) };
    expect(computeLessonState(lesson, noCheckpoint)).toBe(LESSON_STATES.IN_PROGRESS);
    expect(computeLessonState(lesson, noCheckpoint, { requireAssessment: false })).toBe(LESSON_STATES.COMPLETED_INDEPENDENT);
  });
  it("masters a lesson when the challenge passes without assistance", () => {
    const ex = { ...passed(req), [lesson.challenge.id]: { passed: true, assisted: false, attempts: [{ passed: true }] } };
    expect(computeLessonState(lesson, { lessons: { [lesson.id]: { openedAt: 1, checkpoint: { passed: true } } }, exercises: ex })).toBe(LESSON_STATES.MASTERED);
  });
  it("summarises tiers and finds the current tier", () => {
    const tier = registry.getTier(0);
    const lessons = tier.lessons.map(id => registry.getLesson(id));
    const empty = tierMastery(tier, lessons, createEmptyProgress());
    expect(empty.completed).toBe(0);
    expect(empty.mastered).toBe(false);
    const p = createEmptyProgress();
    for ( const l of lessons ) p.lessons[l.id] = { state: LESSON_STATES.COMPLETED_INDEPENDENT, checkpoint: { passed: true } };
    const full = tierMastery(tier, lessons, p);
    expect(full.completed).toBe(lessons.length);
    expect(full.capstoneDone).toBe(true);
    expect(overallProgress(registry.orderedLessons, p).completed).toBe(lessons.length);
    expect(currentTier(registry.tiers, registry.lessons, p)).toBe(1);
    expect(currentTier(registry.tiers, registry.lessons, createEmptyProgress())).toBe(0);
  });
});

describe("achievements", () => {
  it("defines twelve achievements with unique ids", () => {
    expect(ACHIEVEMENTS.length).toBe(12);
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(12);
  });
  it("awards from real records and reports status", () => {
    const p = createEmptyProgress();
    expect(newlyEarned(p, registry)).toEqual([]);
    p.stats.runs = 1;
    const earned = newlyEarned(p, registry);
    expect(earned.map(a => a.id)).toContain("first-macro");
    p.achievements["first-macro"] = Date.now();
    expect(newlyEarned(p, registry).map(a => a.id)).not.toContain("first-macro");
    const status = achievementStatus(p);
    expect(status.find(a => a.id === "first-macro").earned).toBe(true);
    expect(status.filter(a => a.earned).length).toBe(1);
  });
  it("awards concept achievements only after enough passed exercises", () => {
    const p = createEmptyProgress();
    const variableExercises = registry.orderedLessons.flatMap(l => [...l.exercises, l.challenge].filter(Boolean)).filter(e => (e.concepts ?? []).includes("variables")).slice(0, 5);
    expect(variableExercises.length).toBe(5);
    for ( const e of variableExercises.slice(0, 4) ) p.exercises[e.id] = { passed: true };
    expect(newlyEarned(p, registry).map(a => a.id)).not.toContain("variable-virtuoso");
    p.exercises[variableExercises[4].id] = { passed: true };
    expect(newlyEarned(p, registry).map(a => a.id)).toContain("variable-virtuoso");
  });
});

describe("adaptive review", () => {
  const ex = registry.orderedLessons.flatMap(l => l.exercises).find(e => (e.concepts ?? []).length);
  const concept = ex.concepts[0];
  it("recommends review only after repeated recent failures", () => {
    const p = createEmptyProgress();
    p.exercises[ex.id] = { attempts: [{ passed: false }, { passed: true }], passed: true };
    expect(reviewRecommendations(p, registry)).toEqual([]);
    p.exercises[ex.id] = { attempts: Array(REVIEW_RULES.minFailedAttempts).fill({ passed: false }), passed: false };
    const recs = reviewRecommendations(p, registry);
    expect(recs.map(r => r.concept)).toContain(concept);
    expect(recs.find(r => r.concept === concept).reason).toMatch(/did not pass/);
    expect(conceptStats(p, registry)[concept].failures).toBe(REVIEW_RULES.minFailedAttempts);
  });
  it("flags completed lessons that teach a struggling concept", () => {
    const p = createEmptyProgress();
    p.exercises[ex.id] = { attempts: Array(REVIEW_RULES.minFailedAttempts).fill({ passed: false }), passed: false };
    for ( const l of registry.lessonsForConcept(concept) ) p.lessons[l.id] = { state: LESSON_STATES.COMPLETED_INDEPENDENT };
    expect(lessonsNeedingReview(p, registry).length).toBeGreaterThan(0);
  });
});
