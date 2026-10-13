/**
 * Mastery rules: how exercise results and checkpoint scores become lesson states, and how lesson states become
 * tier mastery. Pure functions over the progress record.
 */
import { LESSON_STATES, COMPLETED_STATES } from "../core/constants.js";

export const STATE_LABELS = Object.freeze({
  [LESSON_STATES.LOCKED]: "Locked",
  [LESSON_STATES.NOT_STARTED]: "Not started",
  [LESSON_STATES.IN_PROGRESS]: "In progress",
  [LESSON_STATES.COMPLETED_GUIDED]: "Completed with guidance",
  [LESSON_STATES.COMPLETED_INDEPENDENT]: "Completed independently",
  [LESSON_STATES.MASTERED]: "Mastered",
  [LESSON_STATES.NEEDS_REVIEW]: "Needs review"
});

export const STATE_DESCRIPTIONS = Object.freeze({
  [LESSON_STATES.LOCKED]: "One or more prerequisite lessons are not complete yet.",
  [LESSON_STATES.NOT_STARTED]: "You have not opened this lesson yet.",
  [LESSON_STATES.IN_PROGRESS]: "You opened the lesson or attempted an exercise, but the completion criteria are not met.",
  [LESSON_STATES.COMPLETED_GUIDED]: "Every required exercise and the checkpoint passed, but at least one solution was revealed before you passed it.",
  [LESSON_STATES.COMPLETED_INDEPENDENT]: "Every required exercise and the checkpoint passed without revealing a solution.",
  [LESSON_STATES.MASTERED]: "Completed independently, then the practical challenge was also passed independently.",
  [LESSON_STATES.NEEDS_REVIEW]: "Recent attempts at exercises using this lesson's concepts failed repeatedly. Revisit it when you have a moment."
});

/**
 * Compute the state a lesson should have from its exercise records and checkpoint result.
 * @param {object} lesson
 * @param {object} progress
 * @param {object} [options]
 * @param {boolean} [options.requireAssessment=true]  World/user setting: must the checkpoint pass to complete?
 * @returns {string}
 */
export function computeLessonState(lesson, progress, { requireAssessment=true }={}) {
  const rec = progress?.lessons?.[lesson.id] ?? {};
  const exRecords = progress?.exercises ?? {};
  const required = lesson.completion?.required ?? [];
  const passedAll = required.every(id => exRecords[id]?.passed);
  const checkpointOk = !requireAssessment || !lesson.completion?.checkpoint || Boolean(rec.checkpoint?.passed);
  const touched = Boolean(rec.openedAt) || required.some(id => exRecords[id]?.attempts?.length);
  if ( !touched ) return LESSON_STATES.NOT_STARTED;
  if ( !(passedAll && checkpointOk) ) return rec.state === LESSON_STATES.NEEDS_REVIEW ? LESSON_STATES.NEEDS_REVIEW : LESSON_STATES.IN_PROGRESS;
  const assisted = required.some(id => exRecords[id]?.assisted);
  if ( assisted ) return LESSON_STATES.COMPLETED_GUIDED;
  const challenge = lesson.challenge ? exRecords[lesson.challenge.id] : null;
  const challengeIndependent = Boolean(challenge?.passed && !challenge?.assisted);
  const challengeRequired = required.includes(lesson.challenge?.id);
  if ( challengeIndependent && !challengeRequired ) return LESSON_STATES.MASTERED;
  if ( challengeIndependent && challengeRequired ) return LESSON_STATES.MASTERED;
  return LESSON_STATES.COMPLETED_INDEPENDENT;
}

/**
 * Tier mastery summary.
 * @param {object} tier
 * @param {object[]} lessons   Lessons in the tier
 * @param {object} progress
 * @returns {{completed:number, total:number, independent:number, mastered:number, capstoneDone:boolean, mastered:boolean, percent:number, requirements:Array<{text:string, met:boolean}>}}
 */
export function tierMastery(tier, lessons, progress) {
  const states = lessons.map(l => progress?.lessons?.[l.id]?.state ?? LESSON_STATES.NOT_STARTED);
  const completed = states.filter(s => COMPLETED_STATES.includes(s)).length;
  const independent = states.filter(s => s === LESSON_STATES.COMPLETED_INDEPENDENT || s === LESSON_STATES.MASTERED).length;
  const masteredCount = states.filter(s => s === LESSON_STATES.MASTERED).length;
  const capstoneState = progress?.lessons?.[tier.capstone]?.state;
  const capstoneDone = COMPLETED_STATES.includes(capstoneState);
  const checkpoints = lessons.filter(l => l.completion?.checkpoint).map(l => Boolean(progress?.lessons?.[l.id]?.checkpoint?.passed));
  const checkpointsDone = checkpoints.filter(Boolean).length;
  const failureHandling = lessons.some(l => [...(l.exercises ?? []), l.challenge].filter(Boolean).some(e => (e.concepts ?? []).some(c => /error|validation|empty|cancel|permission|debug/i.test(c)) && progress?.exercises?.[e.id]?.passed));
  const requirements = [
    { text: `Complete all ${lessons.length} lessons`, met: completed === lessons.length },
    { text: `Pass every knowledge checkpoint (${checkpointsDone}/${checkpoints.length})`, met: checkpointsDone === checkpoints.length },
    { text: "Complete the tier capstone project", met: capstoneDone },
    { text: "Pass at least one exercise that handles a failure case (invalid input, empty selection, cancellation, permissions or an error)", met: failureHandling }
  ];
  const mastered = requirements.every(r => r.met);
  return { completed, total: lessons.length, independent, mastered: mastered, masteredLessons: masteredCount, capstoneDone, percent: lessons.length ? Math.round(100 * completed / lessons.length) : 0, requirements };
}

/**
 * Overall completion statistics.
 * @param {object[]} lessons
 * @param {object} progress
 * @returns {{completed:number, total:number, percent:number, inProgress:number, independent:number}}
 */
export function overallProgress(lessons, progress) {
  const states = lessons.map(l => progress?.lessons?.[l.id]?.state ?? LESSON_STATES.NOT_STARTED);
  const completed = states.filter(s => COMPLETED_STATES.includes(s)).length;
  const independent = states.filter(s => s === LESSON_STATES.COMPLETED_INDEPENDENT || s === LESSON_STATES.MASTERED).length;
  const inProgress = states.filter(s => s === LESSON_STATES.IN_PROGRESS || s === LESSON_STATES.NEEDS_REVIEW).length;
  return { completed, total: lessons.length, percent: lessons.length ? Math.round(100 * completed / lessons.length) : 0, inProgress, independent };
}

/**
 * The learner's current tier: the lowest tier that is not fully completed.
 * @param {object[]} tiers
 * @param {Map<string,object>|object} lessonsById
 * @param {object} progress
 * @returns {number}
 */
export function currentTier(tiers, lessonsById, progress) {
  const get = id => lessonsById instanceof Map ? lessonsById.get(id) : lessonsById[id];
  for ( const tier of tiers ) {
    const lessons = tier.lessons.map(get).filter(Boolean);
    const m = tierMastery(tier, lessons, progress);
    if ( m.completed < m.total ) return tier.number;
  }
  return tiers.length ? tiers[tiers.length - 1].number : 0;
}
