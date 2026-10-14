/**
 * Progress record shape, validation, migration and merge rules. Pure JavaScript.
 * Imported records are DATA: they are validated field by field and never executed.
 */
import { PROGRESS_SCHEMA_VERSION, CURRICULUM_SCHEMA_VERSION, LESSON_STATES, LIMITS } from "../core/constants.js";

/** @returns {object} A fresh progress record */
export function createEmptyProgress() {
  const now = Date.now();
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    curriculumVersion: CURRICULUM_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    lessons: {},
    exercises: {},
    achievements: {},
    bookmarks: [],
    lastLesson: null,
    lastSection: null,
    activity: [],
    stats: { runs: 0, liveRuns: 0, hintsUsed: 0, solutionsRevealed: 0, exercisesPassed: 0 },
    projects: {}
  };
}

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v, fallback=0) => (Number.isFinite(v) ? v : fallback);
const str = (v, fallback=null) => (typeof v === "string" ? v : fallback);
const bool = v => v === true;
const VALID_STATES = new Set(Object.values(LESSON_STATES));

/**
 * Validate a raw progress record and return a cleaned copy plus the problems found. Unknown keys are dropped.
 * @param {unknown} raw
 * @returns {{record:object|null, errors:string[], warnings:string[]}}
 */
export function validateProgress(raw) {
  const errors = [];
  const warnings = [];
  if ( !isObj(raw) ) return { record: null, errors: ["Progress data must be a JSON object."], warnings };
  if ( !Number.isInteger(raw.schemaVersion) ) errors.push("Missing schemaVersion.");
  if ( raw.schemaVersion > PROGRESS_SCHEMA_VERSION ) errors.push(`This record was written by a newer academy version (schema ${raw.schemaVersion} > ${PROGRESS_SCHEMA_VERSION}). Update the module before importing.`);
  if ( errors.length ) return { record: null, errors, warnings };
  const rec = createEmptyProgress();
  rec.schemaVersion = raw.schemaVersion;
  rec.curriculumVersion = Number.isInteger(raw.curriculumVersion) ? raw.curriculumVersion : 1;
  rec.createdAt = num(raw.createdAt, rec.createdAt);
  rec.updatedAt = num(raw.updatedAt, rec.updatedAt);
  for ( const [id, l] of Object.entries(isObj(raw.lessons) ? raw.lessons : {}) ) {
    if ( !isObj(l) || typeof id !== "string" ) { warnings.push(`Skipped malformed lesson record "${id}".`); continue; }
    const state = VALID_STATES.has(l.state) ? l.state : LESSON_STATES.IN_PROGRESS;
    rec.lessons[id] = {
      state,
      openedAt: num(l.openedAt, 0) || null,
      completedAt: num(l.completedAt, 0) || null,
      lessonVersion: Number.isInteger(l.lessonVersion) ? l.lessonVersion : 1,
      checkpoint: isObj(l.checkpoint) ? { passed: bool(l.checkpoint.passed), score: Math.max(0, Math.min(1, num(l.checkpoint.score))), at: num(l.checkpoint.at, 0) || null, attempts: Math.max(0, Math.floor(num(l.checkpoint.attempts))) } : null,
      lastSection: str(l.lastSection)
    };
  }
  for ( const [id, e] of Object.entries(isObj(raw.exercises) ? raw.exercises : {}) ) {
    if ( !isObj(e) ) { warnings.push(`Skipped malformed exercise record "${id}".`); continue; }
    const attempts = (Array.isArray(e.attempts) ? e.attempts : []).filter(isObj).slice(-LIMITS.MAX_ATTEMPTS_PER_EXERCISE).map(a => ({ at: num(a.at), passed: bool(a.passed), score: Math.max(0, Math.min(1, num(a.score))), assisted: bool(a.assisted), hints: Math.max(0, Math.floor(num(a.hints))), mode: str(a.mode, "guided") }));
    rec.exercises[id] = { passed: bool(e.passed), assisted: bool(e.assisted), bestScore: Math.max(0, Math.min(1, num(e.bestScore))), hintsUsed: Math.max(0, Math.floor(num(e.hintsUsed))), attempts, firstPassedAt: num(e.firstPassedAt, 0) || null };
  }
  for ( const [id, at] of Object.entries(isObj(raw.achievements) ? raw.achievements : {}) ) { if ( Number.isFinite(at) ) rec.achievements[id] = at; else warnings.push(`Skipped malformed achievement "${id}".`); }
  rec.bookmarks = (Array.isArray(raw.bookmarks) ? raw.bookmarks : []).filter(b => typeof b === "string").slice(0, 200);
  rec.lastLesson = str(raw.lastLesson);
  rec.lastSection = str(raw.lastSection);
  rec.activity = (Array.isArray(raw.activity) ? raw.activity : []).filter(isObj).slice(-LIMITS.MAX_ACTIVITY_ENTRIES).map(a => ({ at: num(a.at), type: str(a.type, "unknown"), id: str(a.id), label: str(a.label, "") }));
  const s = isObj(raw.stats) ? raw.stats : {};
  rec.stats = { runs: Math.max(0, Math.floor(num(s.runs))), liveRuns: Math.max(0, Math.floor(num(s.liveRuns))), hintsUsed: Math.max(0, Math.floor(num(s.hintsUsed))), solutionsRevealed: Math.max(0, Math.floor(num(s.solutionsRevealed))), exercisesPassed: Math.max(0, Math.floor(num(s.exercisesPassed))) };
  for ( const [id, p] of Object.entries(isObj(raw.projects) ? raw.projects : {}) ) {
    if ( !isObj(p) ) continue;
    rec.projects[id] = { name: str(p.name, id), description: str(p.description, ""), lessonId: str(p.lessonId), draftId: str(p.draftId), status: ["planned", "in-progress", "complete"].includes(p.status) ? p.status : "in-progress", updatedAt: num(p.updatedAt, Date.now()), notes: str(p.notes, "") };
  }
  return { record: rec, errors, warnings };
}

/**
 * Ordered migrations. Each entry upgrades a record from `from` to `from + 1`.
 * @type {Array<{from:number, description:string, migrate:(record:object)=>object}>}
 */
export const MIGRATIONS = [
  // Schema version 1 is the first release. Future entries look like:
  // { from: 1, description: "Rename bookmarks to pins", migrate: r => ({ ...r, pins: r.bookmarks }) }
];

/**
 * Migrate a validated record to the current schema version.
 * @param {object} record
 * @returns {{record:object, applied:string[]}}
 */
export function migrateProgress(record) {
  const applied = [];
  let current = record;
  while ( current.schemaVersion < PROGRESS_SCHEMA_VERSION ) {
    const step = MIGRATIONS.find(m => m.from === current.schemaVersion);
    if ( !step ) throw new Error(`No migration from progress schema ${current.schemaVersion}.`);
    current = { ...step.migrate(current), schemaVersion: current.schemaVersion + 1 };
    applied.push(step.description);
  }
  return { record: current, applied };
}

/**
 * Reconcile a record with the current curriculum: unknown lesson/exercise ids are kept but reported (a pack
 * may be temporarily disabled), and lessons whose version changed are reported.
 * @param {object} record
 * @param {import("../curriculum/registry.js").CurriculumRegistry} registry
 * @returns {{unknownLessons:string[], unknownExercises:string[], changedLessons:string[]}}
 */
export function reconcileWithCurriculum(record, registry) {
  const unknownLessons = Object.keys(record.lessons).filter(id => !registry.getLesson(id));
  const unknownExercises = Object.keys(record.exercises).filter(id => !registry.getExercise(id));
  const changedLessons = Object.entries(record.lessons).filter(([id, l]) => { const lesson = registry.getLesson(id); return lesson && lesson.version > l.lessonVersion; }).map(([id]) => id);
  return { unknownLessons, unknownExercises, changedLessons };
}

/**
 * Merge an imported record into an existing one.
 * @param {object} existing
 * @param {object} incoming
 * @param {"replace"|"merge"|"keep-existing"} strategy
 * @returns {object}
 */
export function mergeProgress(existing, incoming, strategy="merge") {
  if ( strategy === "replace" ) return { ...incoming, updatedAt: Date.now() };
  if ( strategy === "keep-existing" ) {
    const out = structuredClone(existing);
    for ( const [id, l] of Object.entries(incoming.lessons) ) if ( !out.lessons[id] ) out.lessons[id] = l;
    for ( const [id, e] of Object.entries(incoming.exercises) ) if ( !out.exercises[id] ) out.exercises[id] = e;
    for ( const [id, at] of Object.entries(incoming.achievements) ) if ( !out.achievements[id] ) out.achievements[id] = at;
    out.updatedAt = Date.now();
    return out;
  }
  // merge: union, preferring the more advanced state
  const rank = { [LESSON_STATES.NOT_STARTED]: 0, [LESSON_STATES.LOCKED]: 0, [LESSON_STATES.IN_PROGRESS]: 1, [LESSON_STATES.NEEDS_REVIEW]: 1, [LESSON_STATES.COMPLETED_GUIDED]: 2, [LESSON_STATES.COMPLETED_INDEPENDENT]: 3, [LESSON_STATES.MASTERED]: 4 };
  const out = structuredClone(existing);
  for ( const [id, l] of Object.entries(incoming.lessons) ) {
    const cur = out.lessons[id];
    if ( !cur || (rank[l.state] ?? 0) > (rank[cur.state] ?? 0) ) out.lessons[id] = l;
    else if ( cur && l.checkpoint?.passed && !cur.checkpoint?.passed ) cur.checkpoint = l.checkpoint;
  }
  for ( const [id, e] of Object.entries(incoming.exercises) ) {
    const cur = out.exercises[id];
    if ( !cur ) { out.exercises[id] = e; continue; }
    cur.attempts = [...cur.attempts, ...e.attempts].sort((a, b) => a.at - b.at).slice(-LIMITS.MAX_ATTEMPTS_PER_EXERCISE);
    const bothPassed = cur.passed && e.passed;
    // An independent pass on either side wins; otherwise the record that passed decides.
    cur.assisted = bothPassed ? (cur.assisted && e.assisted) : (cur.passed ? cur.assisted : e.assisted);
    cur.passed = cur.passed || e.passed;
    cur.bestScore = Math.max(cur.bestScore, e.bestScore);
    cur.hintsUsed = Math.max(cur.hintsUsed, e.hintsUsed);
    cur.firstPassedAt = [cur.firstPassedAt, e.firstPassedAt].filter(Boolean).sort()[0] ?? null;
  }
  for ( const [id, at] of Object.entries(incoming.achievements) ) out.achievements[id] = Math.min(out.achievements[id] ?? Infinity, at);
  out.bookmarks = [...new Set([...out.bookmarks, ...incoming.bookmarks])];
  out.activity = [...out.activity, ...incoming.activity].sort((a, b) => a.at - b.at).slice(-LIMITS.MAX_ACTIVITY_ENTRIES);
  for ( const k of Object.keys(out.stats) ) out.stats[k] = Math.max(out.stats[k], incoming.stats[k] ?? 0);
  out.projects = { ...incoming.projects, ...out.projects };
  out.lastLesson = out.lastLesson ?? incoming.lastLesson;
  out.updatedAt = Date.now();
  return out;
}

/**
 * Summarize a record for display before import.
 * @param {object} record
 * @returns {{lessons:number, completed:number, exercises:number, achievements:number, updatedAt:number}}
 */
export function summarizeProgress(record) {
  const completed = Object.values(record.lessons).filter(l => String(l.state).startsWith("completed") || l.state === LESSON_STATES.MASTERED).length;
  return { lessons: Object.keys(record.lessons).length, completed, exercises: Object.keys(record.exercises).length, achievements: Object.keys(record.achievements).length, updatedAt: record.updatedAt };
}
