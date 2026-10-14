/**
 * Regenerate the examples/ directory from the curriculum's tested capstone solutions.
 * Usage: node tools/build-examples.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { loadCurriculum } = await import(`${root}/curriculum/index.js`);
const bundle = await loadCurriculum();
const PICK = [
  ["01-beginner-welcome-macro.js", "t0-welcome-macro", "t0-welcome-macro-build", "Beginner"],
  ["02-beginner-combat-helper.js", "t1-combat-helper", "t1-combat-helper-build", "Beginner"],
  ["03-intermediate-encounter-utility.js", "t2-encounter-utility", "t2-encounter-utility-build", "Intermediate"],
  ["04-intermediate-scene-inspector.js", "t3-scene-inspector", "t3-scene-inspector-build", "Intermediate"],
  ["05-intermediate-gm-utility-menu.js", "t4-gm-utility-menu", "t4-gm-utility-menu-build", "Intermediate"],
  ["06-advanced-combat-assistant.js", "t5-combat-assistant", "t5-combat-assistant-build", "Advanced"],
  ["07-advanced-automation-toolkit.js", "t6-automation-toolkit", "t6-automation-toolkit-build", "Advanced"],
  ["08-expert-thunderous-rebuke.js", "t7-integration-project", "t7-integration-project-midi", "Expert"],
  ["09-expert-gm-suite-repaired.js", "t8-repair-suite", "t8-repair-suite-build", "Expert"],
  ["10-expert-config-service.js", "t9-capstone", "t9-capstone-core", "Expert"]
];
mkdirSync(resolve(root, "examples"), { recursive: true });
const rows = ["# Example macros", "", "Reference solutions for the capstone of every tier, extracted from the curriculum by `node tools/build-examples.mjs`. Each file is the exact code the automated curriculum tests execute (in the sandbox or the Foundry emulator) before a release, so what you read here has been run. Headers state the runtime the example was tested in, the practice fixture it expects, and the Foundry/system versions it was written against.", "", "| File | Level | Lesson | Tested in |", "|---|---|---|---|"];
for ( const [file, lessonId, exId, level] of PICK ) {
  const lesson = bundle.lessons.find(l => l.id === lessonId);
  const ex = [...lesson.exercises, lesson.challenge].find(e => e.id === exId);
  if ( !lesson || !ex ) throw new Error(`Missing ${lessonId}/${exId}`);
  const fixture = ex.snapshot ?? "practice";
  const req = lesson.requirements?.system ? `System: ${lesson.requirements.system.id} ${lesson.requirements.system.minimum}+ (verified ${lesson.requirements.system.verified}).` : "System: any (core Foundry APIs only).";
  const header = `/**\n * ${lesson.title}\n * Level: ${level}. Lesson: ${lesson.id} (The Game Master's Macro Academy, Tier ${lesson.tier}).\n * Exercise: ${ex.id} (${ex.type}). Tested in: ${ex.runtime === "sandbox" ? "the JavaScript sandbox (no Foundry APIs)" : `the Foundry emulator with the "${fixture}" practice fixture`}.\n * Verified against: Foundry VTT 14.369 API documentation. ${req}\n * Access: reads=${lesson.access.reads} writes=${lesson.access.writes} creates=${lesson.access.creates} mechanics=${lesson.access.mechanics}.\n *\n * ${ex.prompt.replace(/\s+/g, " ").slice(0, 400)}${ex.prompt.length > 400 ? "…" : ""}\n *\n * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the\n * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.\n */\n`;
  writeFileSync(resolve(root, "examples", file), header + ex.solution.code.trimEnd() + "\n");
  rows.push(`| \`${file}\` | ${level} | ${lesson.id} | ${ex.runtime}${ex.snapshot ? ` (${ex.snapshot})` : ""} |`);
}
rows.push("", "The sandbox examples run in any JavaScript engine; the emulator examples need Foundry globals and are meant to be pasted into the Academy workshop or a script macro.", "");
writeFileSync(resolve(root, "examples", "README.md"), rows.join("\n"));
console.log(`Wrote ${PICK.length} examples.`);
