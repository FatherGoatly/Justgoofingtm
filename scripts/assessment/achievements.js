/**
 * Achievements are awarded only from saved progress records, by the rules below. They are informative, not a
 * substitute for mastery states.
 */
import { LESSON_STATES, COMPLETED_STATES } from "../core/constants.js";

const completed = (progress, id) => COMPLETED_STATES.includes(progress?.lessons?.[id]?.state);
const independent = (progress, id) => [LESSON_STATES.COMPLETED_INDEPENDENT, LESSON_STATES.MASTERED].includes(progress?.lessons?.[id]?.state);
const tierDone = (progress, registry, n) => registry.lessonsInTier(n).every(l => completed(progress, l.id));
const passedConcept = (progress, registry, concept, min=1) => Object.entries(progress?.exercises ?? {}).filter(([id, r]) => r.passed && (registry.getExercise(id)?.concepts ?? []).includes(concept)).length >= min;

export const ACHIEVEMENTS = Object.freeze([
  { id: "first-macro", title: "First Macro", icon: "fa-wand-magic-sparkles", description: "Ran your first macro in the workshop.", check: p => Boolean(p?.stats?.runs >= 1) },
  { id: "variable-virtuoso", title: "Variable Virtuoso", icon: "fa-box", description: "Passed five exercises that use variables.", check: (p, r) => passedConcept(p, r, "variables", 5) },
  { id: "logic-architect", title: "Logic Architect", icon: "fa-code-branch", description: "Passed four exercises about conditions and boolean logic.", check: (p, r) => passedConcept(p, r, "conditions", 4) },
  { id: "loop-wrangler", title: "Loop Wrangler", icon: "fa-rotate", description: "Passed four exercises that use loops or array iteration.", check: (p, r) => passedConcept(p, r, "loops", 4) },
  { id: "foundry-explorer", title: "Foundry Explorer", icon: "fa-compass", description: "Completed every Tier 3 lesson.", check: (p, r) => tierDone(p, r, 3) },
  { id: "macro-mechanic", title: "Macro Mechanic", icon: "fa-screwdriver-wrench", description: "Completed the Tier 4 macro library capstone.", check: (p, r) => completed(p, r.getTier(4)?.capstone) },
  { id: "debugging-detective", title: "Debugging Detective", icon: "fa-magnifying-glass", description: "Repaired eight broken programs.", check: (p, r) => Object.entries(p?.exercises ?? {}).filter(([id, rec]) => rec.passed && ["repair-code", "debug-scenario"].includes(r.getExercise(id)?.type)).length >= 8 },
  { id: "automation-engineer", title: "Automation Engineer", icon: "fa-gears", description: "Completed the Tier 6 toolkit capstone independently.", check: (p, r) => independent(p, r.getTier(6)?.capstone) },
  { id: "integration-specialist", title: "Integration Specialist", icon: "fa-puzzle-piece", description: "Completed every Tier 7 lesson.", check: (p, r) => tierDone(p, r, 7) },
  { id: "refactoring-expert", title: "Refactoring Expert", icon: "fa-broom", description: "Completed the Tier 8 repair-the-suite capstone.", check: (p, r) => completed(p, r.getTier(8)?.capstone) },
  { id: "independent-builder", title: "Independent Builder", icon: "fa-hammer", description: "Completed three capstone projects without revealing a solution.", check: (p, r) => r.projects.filter(l => independent(p, l.id)).length >= 3 },
  { id: "expert-macro-engineer", title: "Expert Macro Engineer", icon: "fa-crown", description: "Completed the expert capstone and every tier.", check: (p, r) => r.tiers.every(t => tierDone(p, r, t.number)) && completed(p, r.getTier(9)?.capstone) }
]);

/**
 * Achievements the learner is now eligible for but has not yet been awarded.
 * @param {object} progress
 * @param {import("../curriculum/registry.js").CurriculumRegistry} registry
 * @returns {object[]}
 */
export function newlyEarned(progress, registry) {
  const have = progress?.achievements ?? {};
  return ACHIEVEMENTS.filter(a => !have[a.id] && safeCheck(a, progress, registry));
}

/**
 * Achievement list with earned status.
 * @param {object} progress
 * @returns {Array<{id:string,title:string,description:string,icon:string,earned:boolean,earnedAt:number|null}>}
 */
export function achievementStatus(progress) {
  const have = progress?.achievements ?? {};
  return ACHIEVEMENTS.map(a => ({ id: a.id, title: a.title, description: a.description, icon: a.icon, earned: Boolean(have[a.id]), earnedAt: have[a.id] ?? null }));
}

function safeCheck(a, progress, registry) {
  try { return Boolean(a.check(progress, registry)); } catch(_err) { return false; }
}
