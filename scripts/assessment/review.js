/**
 * Adaptive review: recommendations derived only from the recorded attempt history. Transparent rules, no hidden
 * scoring. See docs/architecture.md#adaptive-review.
 */

export const REVIEW_RULES = Object.freeze({
  minFailedAttempts: 3,     // failures on exercises tagged with a concept before we suggest review
  windowSize: 10,           // consider the most recent N attempts per concept
  failureRatio: 0.5         // at least half of those attempts failed
});

/**
 * Aggregate attempt statistics per concept tag.
 * @param {object} progress
 * @param {import("../curriculum/registry.js").CurriculumRegistry} registry
 * @returns {Record<string, {attempts:number, failures:number, recentFailures:number, exercises:string[]}>}
 */
export function conceptStats(progress, registry) {
  const stats = {};
  for ( const [exId, rec] of Object.entries(progress?.exercises ?? {}) ) {
    const exercise = registry.getExercise(exId);
    if ( !exercise ) continue;
    const attempts = rec.attempts ?? [];
    for ( const concept of exercise.concepts ?? [] ) {
      const s = stats[concept] ??= { attempts: 0, failures: 0, recentFailures: 0, exercises: [] };
      s.attempts += attempts.length;
      s.failures += attempts.filter(a => !a.passed).length;
      s.recentFailures += attempts.slice(-REVIEW_RULES.windowSize).filter(a => !a.passed).length;
      if ( !s.exercises.includes(exId) ) s.exercises.push(exId);
    }
  }
  return stats;
}

/**
 * Build review recommendations.
 * @param {object} progress
 * @param {import("../curriculum/registry.js").CurriculumRegistry} registry
 * @returns {Array<{concept:string, reason:string, lessons:object[], practice:object[]}>}
 */
export function reviewRecommendations(progress, registry) {
  const stats = conceptStats(progress, registry);
  const out = [];
  for ( const [concept, s] of Object.entries(stats) ) {
    const recentWindow = Math.min(s.attempts, REVIEW_RULES.windowSize);
    if ( s.recentFailures < REVIEW_RULES.minFailedAttempts ) continue;
    if ( recentWindow && s.recentFailures / recentWindow < REVIEW_RULES.failureRatio ) continue;
    const lessons = registry.lessonsForConcept(concept);
    const practice = lessons.flatMap(l => [...(l.exercises ?? [])].filter(e => (e.concepts ?? []).includes(concept) && !progress?.exercises?.[e.id]?.passed)).slice(0, 3);
    out.push({
      concept,
      reason: `${s.recentFailures} of your last ${recentWindow} attempts on exercises about "${concept}" did not pass.`,
      lessons: lessons.slice(0, 3),
      practice
    });
  }
  return out.sort((a, b) => b.reason.localeCompare(a.reason));
}

/**
 * Lesson ids that should be flagged needs-review because a majority of recent attempts on their concepts failed
 * after the lesson was completed.
 * @param {object} progress
 * @param {import("../curriculum/registry.js").CurriculumRegistry} registry
 * @returns {string[]}
 */
export function lessonsNeedingReview(progress, registry) {
  const recs = reviewRecommendations(progress, registry);
  const ids = new Set();
  for ( const r of recs ) for ( const l of r.lessons ) if ( progress?.lessons?.[l.id]?.state?.startsWith("completed") ) ids.add(l.id);
  return [...ids];
}
