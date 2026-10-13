/**
 * Progressive hints. Five conceptual levels are described in docs/architecture.md; a lesson supplies as many
 * hint strings as it has levels. Revealing the full solution is always allowed and is recorded as "assisted".
 */

export const HINT_LEVEL_LABELS = Object.freeze([
  "Conceptual nudge",
  "Which construct to use",
  "Pseudocode outline",
  "Partial implementation",
  "Worked solution"
]);

/**
 * @typedef {object} HintState
 * @property {number} revealed       Number of hints revealed (0..hints.length)
 * @property {boolean} solutionRevealed
 * @property {number} revealSteps    Number of progressive reveal steps shown
 */

/**
 * Create a fresh hint state.
 * @returns {HintState}
 */
export function createHintState() {
  return { revealed: 0, solutionRevealed: false, revealSteps: 0 };
}

/**
 * Reveal the next hint.
 * @param {HintState} state
 * @param {object} exercise
 * @returns {{state:HintState, hint:{level:number,label:string,text:string}|null}}
 */
export function revealNextHint(state, exercise) {
  const hints = exercise.hints ?? [];
  if ( state.revealed >= hints.length ) return { state, hint: null };
  const level = state.revealed;
  const next = { ...state, revealed: level + 1 };
  return { state: next, hint: { level: level + 1, label: HINT_LEVEL_LABELS[Math.min(level, HINT_LEVEL_LABELS.length - 1)], text: hints[level] } };
}

/**
 * Reveal the next step of the progressive solution.
 * @param {HintState} state
 * @param {object} exercise
 * @returns {{state:HintState, step:object|null, complete:boolean}}
 */
export function revealNextSolutionStep(state, exercise) {
  const steps = exercise.reveal ?? [];
  if ( state.revealSteps >= steps.length ) return { state: { ...state, solutionRevealed: true }, step: null, complete: true };
  const step = steps[state.revealSteps];
  const n = state.revealSteps + 1;
  return { state: { ...state, revealSteps: n, solutionRevealed: n >= steps.length }, step, complete: n >= steps.length };
}

/**
 * Was the exercise completed with assistance? Hints alone do not count as assistance; seeing the final
 * solution step (or the reference solution) does.
 * @param {HintState} state
 * @returns {boolean}
 */
export function isAssisted(state) {
  return Boolean(state?.solutionRevealed);
}

/**
 * Hints revealed so far, for display.
 * @param {HintState} state
 * @param {object} exercise
 * @returns {Array<{level:number,label:string,text:string}>}
 */
export function revealedHints(state, exercise) {
  return (exercise.hints ?? []).slice(0, state.revealed).map((text, i) => ({ level: i + 1, label: HINT_LEVEL_LABELS[Math.min(i, HINT_LEVEL_LABELS.length - 1)], text }));
}
