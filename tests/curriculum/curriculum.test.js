/**
 * Curriculum quality gate: every lesson validates, every runnable example executes as claimed, every code
 * exercise's reference solution passes its own tests, every starter does NOT already pass, and every non-code
 * exercise's declared answer is accepted by the evaluator.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadCurriculum } from "../../curriculum/index.js";
import { validateCurriculum, CODE_EXERCISE_TYPES } from "../../scripts/curriculum/schema.js";
import { CurriculumRegistry } from "../../scripts/curriculum/registry.js";
import { evaluateRun, evaluateSubmission, evaluateCheckpoint } from "../../scripts/assessment/evaluator.js";
import { renderLessonSections, renderLessonHeader } from "../../scripts/curriculum/renderer.js";
import { renderExercise, renderCheckpoint } from "../../scripts/applications/exercise-renderer.js";
import { createPracticeSnapshot } from "../../scripts/workshop/practice-snapshot.js";
import { runInNodeWorker } from "../setup/node-runner.js";
import { checkSyntax } from "../../scripts/workshop/harness.js";

let bundle, registry;
beforeAll(async () => { bundle = await loadCurriculum(); registry = new CurriculumRegistry(bundle); });

function snapshotFor(name) {
  switch ( name ) {
    case "practice-player": return createPracticeSnapshot({ gm: false });
    case "practice-generic": return createPracticeSnapshot({ system: "generic" });
    case "practice-nocombat": return createPracticeSnapshot({ combat: false });
    default: return createPracticeSnapshot();
  }
}

async function runCode({ code, runtime, tests=[], inputs=[], snapshot, seed=11 }) {
  const request = { mode: runtime, code, tests };
  if ( runtime === "preview" ) { request.snapshot = snapshotFor(snapshot); request.inputs = inputs; request.seed = seed; }
  return runInNodeWorker(request, { timeoutMs: 4000 });
}

function declaredAnswer(exercise) {
  switch ( exercise.type ) {
    case "multiple-choice": return exercise.answer;
    case "predict-output": return Array.isArray(exercise.answer) ? exercise.answer[0] : exercise.answer;
    case "fill-blank": return exercise.blanks.map(b => b.accept[0]);
    case "identify-error": return exercise.answer;
    case "reorder-steps": return exercise.answer;
    case "api-discovery": return exercise.accept[0];
    case "explain-code": case "capstone": return { text: Array(80).fill("word").join(" "), rubric: exercise.rubric.map(r => r.id) };
    default: return null;
  }
}

describe("curriculum bundle", () => {
  it("validates against the schema with no issues", () => {
    const issues = validateCurriculum(bundle);
    if ( issues.length ) console.error(issues.map(i => `${i.path}: ${i.message}`).join("\n"));
    expect(issues).toEqual([]);
  });
  it("has ten tiers with lessons, exercises and capstones", () => {
    expect(bundle.tiers.length).toBe(10);
    for ( const tier of bundle.tiers ) {
      expect(tier.lessons.length).toBeGreaterThanOrEqual(3);
      expect(registry.getLesson(tier.capstone)?.category).toBe("project");
    }
  });
  it("renders every lesson without raw markup from data", () => {
    for ( const lesson of bundle.lessons ) {
      const html = renderLessonHeader(lesson) + renderLessonSections(lesson, { progressive: false }) + lesson.exercises.map(e => renderExercise(e)).join("") + renderExercise(lesson.challenge) + renderCheckpoint(lesson.checkpoint);
      expect(html).not.toMatch(/<script/i);
      expect(html.length).toBeGreaterThan(2000);
    }
  });
  it("accepts the declared answer of every non-code exercise and checkpoint", () => {
    for ( const lesson of bundle.lessons ) {
      for ( const ex of [...lesson.exercises, lesson.challenge] ) {
        if ( CODE_EXERCISE_TYPES.includes(ex.type) ) continue;
        const r = evaluateSubmission(ex, declaredAnswer(ex));
        expect(r.passed, `${ex.id} declared answer should pass: ${r.feedback.join(" ")}`).toBe(true);
      }
      const answers = Object.fromEntries(lesson.checkpoint.questions.map(qq => [qq.id, qq.answer]));
      expect(evaluateCheckpoint(lesson.checkpoint, answers).passed, `${lesson.id} checkpoint`).toBe(true);
    }
  });
  it("rejects an obviously wrong answer for every non-code exercise", () => {
    for ( const lesson of bundle.lessons ) {
      for ( const ex of [...lesson.exercises, lesson.challenge] ) {
        if ( CODE_EXERCISE_TYPES.includes(ex.type) || ["explain-code", "capstone"].includes(ex.type) ) continue;
        let wrong;
        switch ( ex.type ) {
          case "multiple-choice": { const ans = new Set(Array.isArray(ex.answer) ? ex.answer : [ex.answer]); wrong = ex.options.map(o => o.id).find(id => !ans.has(id)) ?? "zzz"; if ( Array.isArray(ex.answer) ) wrong = [wrong]; break; }
          case "predict-output": case "api-discovery": wrong = "definitely not the answer 42"; break;
          case "fill-blank": wrong = ex.blanks.map(() => "nope"); break;
          case "identify-error": wrong = [999]; break;
          case "reorder-steps": wrong = [...ex.answer].reverse(); break;
        }
        expect(evaluateSubmission(ex, wrong).passed, `${ex.id} should reject a wrong answer`).toBe(false);
      }
    }
  });
});

describe("executable examples", () => {
  it("every code block is syntactically valid JavaScript (unless pseudocode/json/html/shell)", () => {
    for ( const lesson of bundle.lessons ) for ( const s of lesson.sections ) for ( const b of s.blocks ) {
      if ( b.type !== "code" || b.expectError || !["javascript", "foundry", "dnd5e", "module"].includes(b.compat.target) ) continue;
      const r = checkSyntax(b.code);
      expect(r.ok, `${lesson.id}/${s.id}: ${r.error?.message}\n${b.code}`).toBe(true);
    }
  });
});

const bundlePromise = loadCurriculum();
const lessonsForRuns = await bundlePromise;
for ( const lesson of lessonsForRuns.lessons ) {
  describe(`lesson ${lesson.id}`, () => {
    const runnable = lesson.sections.flatMap(s => s.blocks.filter(b => b.type === "code" && b.runnable).map(b => ({ s, b })));
    for ( const { s, b } of runnable ) {
      it(`example in "${s.id}" runs in ${b.runnable} ${b.expectError ? "and fails as intended" : "without error"}`, async () => {
        const r = await runCode({ code: b.code, runtime: b.runnable, inputs: b.inputs ?? [], snapshot: b.snapshot });
        if ( b.expectError ) expect(r.ok, "expected an error but it ran cleanly").toBe(false);
        else expect(r.ok, `${r.error?.name}: ${r.error?.message} (line ${r.error?.line})\n${b.code}`).toBe(true);
        if ( b.expectOutput ) expect(r.output).toEqual(b.expectOutput);
      });
    }
    for ( const ex of [...lesson.exercises, lesson.challenge].filter(e => CODE_EXERCISE_TYPES.includes(e.type)) ) {
      it(`exercise ${ex.id}: reference solution passes its tests`, async () => {
        const r = await runCode({ code: ex.solution.code, runtime: ex.runtime, tests: ex.tests, inputs: ex.inputs ?? [], snapshot: ex.snapshot, seed: ex.seed ?? 11 });
        const ev = evaluateRun(ex, r, ex.solution.code);
        expect(ev.passed, `${ex.id}: ${ev.checks.filter(c => !c.passed).map(c => `${c.name}: ${c.message}`).join(" | ")} ${r.error ? `ERROR ${r.error.message}` : ""}`).toBe(true);
      });
      it(`exercise ${ex.id}: starter code does not already pass`, async () => {
        const r = await runCode({ code: ex.starter, runtime: ex.runtime, tests: ex.tests, inputs: ex.inputs ?? [], snapshot: ex.snapshot, seed: ex.seed ?? 11 });
        const ev = evaluateRun(ex, r, ex.starter);
        expect(ev.passed, `${ex.id}: the starter already satisfies every test`).toBe(false);
      });
    }
  });
}

describe("broken macro library", () => {
  for ( const b of lessonsForRuns.brokenMacros ) {
    it(`${b.id}: starter reproduces the fault and the solution repairs it`, async () => {
      const ex = b.exercise;
      const bad = await runCode({ code: ex.starter, runtime: ex.runtime, tests: ex.tests, inputs: ex.inputs ?? [], snapshot: ex.snapshot });
      expect(evaluateRun(ex, bad, ex.starter).passed).toBe(false);
      const good = await runCode({ code: ex.solution.code, runtime: ex.runtime, tests: ex.tests, inputs: ex.inputs ?? [], snapshot: ex.snapshot });
      const ev = evaluateRun(ex, good, ex.solution.code);
      expect(ev.passed, `${b.id}: ${ev.checks.filter(c => !c.passed).map(c => `${c.name}: ${c.message}`).join(" | ")} ${good.error ? `ERROR ${good.error.message}` : ""}`).toBe(true);
    });
  }
});
