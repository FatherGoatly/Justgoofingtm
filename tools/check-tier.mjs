/**
 * Development helper: validate and execute the lessons of one tier without the whole curriculum being present.
 * Usage: node tools/check-tier.mjs 0
 */
import { validateLesson, validateTier, CODE_EXERCISE_TYPES } from "../scripts/curriculum/schema.js";
import { evaluateRun, evaluateSubmission, evaluateCheckpoint } from "../scripts/assessment/evaluator.js";
import { createPracticeSnapshot } from "../scripts/workshop/practice-snapshot.js";
import { checkSyntax } from "../scripts/workshop/harness.js";
import { runInNodeWorker } from "../tests/setup/node-runner.js";
import { renderLessonSections, renderLessonHeader } from "../scripts/curriculum/renderer.js";
import { renderExercise, renderCheckpoint } from "../scripts/applications/exercise-renderer.js";

const tierNumbers = process.argv.slice(2).map(Number);
const known = new Set();
const tiers = [];
for ( let n = 0; n <= 9; n++ ) {
  try { const m = await import(`../curriculum/tier-0${n}/index.js`); tiers.push(m); for ( const l of m.lessons ) known.add(l.id); } catch(_err) { /* tier not written yet */ }
}
let terms = null;
try { const g = await import("../curriculum/glossary.js"); terms = new Set(g.GLOSSARY.map(t => t.slug)); } catch(_err) { /* ignore */ }
const snapshotFor = name => name === "practice-player" ? createPracticeSnapshot({ gm: false }) : name === "practice-generic" ? createPracticeSnapshot({ system: "generic" }) : name === "practice-nocombat" ? createPracticeSnapshot({ combat: false }) : createPracticeSnapshot();
const run = async ({ code, runtime, tests=[], inputs=[], snapshot, seed=11 }) => runInNodeWorker({ mode: runtime, code, tests, ...(runtime === "preview" ? { snapshot: snapshotFor(snapshot), inputs, seed } : {}) }, { timeoutMs: 4000 });
const declared = ex => ({ "multiple-choice": ex.answer, "predict-output": Array.isArray(ex.answer) ? ex.answer[0] : ex.answer, "fill-blank": ex.blanks?.map(b => b.accept[0]), "identify-error": ex.answer, "reorder-steps": ex.answer, "api-discovery": ex.accept?.[0], "explain-code": { text: Array(80).fill("w").join(" "), rubric: ex.rubric?.map(r => r.id) }, "capstone": { text: Array(80).fill("w").join(" "), rubric: ex.rubric?.map(r => r.id) } })[ex.type];

let failures = 0;
const fail = msg => { failures++; console.error(`  ✖ ${msg}`); };
for ( const m of tiers ) {
  if ( tierNumbers.length && !tierNumbers.includes(m.tier.number) ) continue;
  console.log(`Tier ${m.tier.number}: ${m.tier.title}`);
  for ( const i of validateTier(m.tier) ) fail(`${i.path}: ${i.message}`);
  for ( const lesson of m.lessons ) {
    console.log(` - ${lesson.id}`);
    for ( const i of validateLesson(lesson, { knownIds: known, knownTerms: terms }) ) fail(`${i.path}: ${i.message}`);
    try { const html = renderLessonHeader(lesson) + renderLessonSections(lesson) + (lesson.exercises ?? []).map(e => renderExercise(e)).join("") + (lesson.challenge ? renderExercise(lesson.challenge) : "") + (lesson.checkpoint ? renderCheckpoint(lesson.checkpoint) : ""); if ( /<script/i.test(html) ) fail("rendered html contains <script"); } catch(err) { fail(`render failed: ${err.message}`); }
    for ( const s of lesson.sections ?? [] ) for ( const b of s.blocks ?? [] ) {
      if ( b.type !== "code" ) continue;
      if ( !b.expectError && ["javascript", "foundry", "dnd5e", "module"].includes(b.compat?.target) ) { const r = checkSyntax(b.code); if ( !r.ok ) fail(`${lesson.id}/${s.id}: syntax ${r.error.message}`); }
      if ( b.runnable ) {
        const r = await run({ code: b.code, runtime: b.runnable, inputs: b.inputs ?? [], snapshot: b.snapshot });
        if ( b.expectError && r.ok ) fail(`${lesson.id}/${s.id}: expected an error but ran cleanly`);
        if ( !b.expectError && !r.ok ) fail(`${lesson.id}/${s.id}: ${r.error?.name}: ${r.error?.message} (line ${r.error?.line})`);
        if ( b.expectOutput && JSON.stringify(r.output) !== JSON.stringify(b.expectOutput) ) fail(`${lesson.id}/${s.id}: output ${JSON.stringify(r.output)} != ${JSON.stringify(b.expectOutput)}`);
      }
    }
    for ( const ex of [...(lesson.exercises ?? []), lesson.challenge].filter(Boolean) ) {
      if ( CODE_EXERCISE_TYPES.includes(ex.type) ) {
        const good = await run({ code: ex.solution.code, runtime: ex.runtime, tests: ex.tests, inputs: ex.inputs ?? [], snapshot: ex.snapshot, seed: ex.seed ?? 11 });
        const ev = evaluateRun(ex, good, ex.solution.code);
        if ( !ev.passed ) fail(`${ex.id}: solution fails: ${ev.checks.filter(c => !c.passed).map(c => `${c.name}: ${c.message}`).join(" | ")} ${good.error ? `ERROR ${good.error.message}` : ""}`);
        const bad = await run({ code: ex.starter, runtime: ex.runtime, tests: ex.tests, inputs: ex.inputs ?? [], snapshot: ex.snapshot, seed: ex.seed ?? 11 });
        if ( evaluateRun(ex, bad, ex.starter).passed ) fail(`${ex.id}: starter already passes`);
      } else {
        const r = evaluateSubmission(ex, declared(ex));
        if ( !r.passed ) fail(`${ex.id}: declared answer rejected: ${r.feedback.join(" ")}`);
      }
    }
    if ( lesson.checkpoint ) { const answers = Object.fromEntries(lesson.checkpoint.questions.map(qq => [qq.id, qq.answer])); if ( !evaluateCheckpoint(lesson.checkpoint, answers).passed ) fail(`${lesson.id}: checkpoint declared answers do not pass`); }
  }
}
console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
