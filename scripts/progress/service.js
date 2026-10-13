/**
 * The ProgressService owns the learner's progress record: loading it from a user-scoped setting, recording
 * events, recomputing lesson states and awarding achievements, exporting and importing.
 */
import { MODULE_ID, SETTINGS, LIMITS, LESSON_STATES, COMPLETED_STATES } from "../core/constants.js";
import { createEmptyProgress, validateProgress, migrateProgress, mergeProgress, reconcileWithCurriculum, summarizeProgress } from "./schema.js";
import { computeLessonState } from "../assessment/mastery.js";
import { newlyEarned } from "../assessment/achievements.js";
import { lessonsNeedingReview } from "../assessment/review.js";
import { Logger } from "../core/logger.js";
import { clone } from "../utilities/text.js";

export class ProgressService {
  /**
   * @param {object} options
   * @param {import("../curriculum/registry.js").CurriculumRegistry} options.registry
   * @param {Function} [options.load]
   * @param {Function} [options.save]
   * @param {Function} [options.getSetting]
   */
  constructor({ registry, load=null, save=null, getSetting=null }) {
    this.registry = registry;
    this._load = load ?? (() => { try { return game.settings.get(MODULE_ID, SETTINGS.PROGRESS); } catch(_err) { return null; } });
    this._save = save ?? (record => game.settings.set(MODULE_ID, SETTINGS.PROGRESS, record));
    this._getSetting = getSetting ?? (key => { try { return game.settings.get(MODULE_ID, key); } catch(_err) { return undefined; } });
    this.record = null;
    this.listeners = new Set();
    this.lastReport = null;
  }

  /** Load the record, validating and migrating as needed. */
  load() {
    const raw = this._load();
    if ( !raw || (typeof raw === "object" && !Object.keys(raw).length) ) { this.record = createEmptyProgress(); return this.record; }
    const { record, errors, warnings } = validateProgress(raw);
    if ( !record ) { Logger.error("Stored progress is unreadable; starting fresh (the stored data is left untouched until you save).", errors); this.record = createEmptyProgress(); this.lastReport = { errors, warnings }; return this.record; }
    const { record: migrated, applied } = migrateProgress(record);
    if ( applied.length ) Logger.info(`Migrated progress: ${applied.join("; ")}`);
    this.record = migrated;
    this.lastReport = { errors, warnings, applied, reconciliation: reconcileWithCurriculum(migrated, this.registry) };
    if ( warnings.length ) Logger.warn("Progress warnings", warnings);
    return this.record;
  }

  get progress() { if ( !this.record ) this.load(); return this.record; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  async save() {
    this.progress.updatedAt = Date.now();
    await this._save(clone(this.progress));
    for ( const fn of this.listeners ) { try { fn(this.progress); } catch(err) { Logger.report("Progress listener", err); } }
  }

  #activity(type, id, label) {
    this.progress.activity.push({ at: Date.now(), type, id, label });
    if ( this.progress.activity.length > LIMITS.MAX_ACTIVITY_ENTRIES ) this.progress.activity.splice(0, this.progress.activity.length - LIMITS.MAX_ACTIVITY_ENTRIES);
  }

  lessonRecord(id) {
    const lesson = this.registry.getLesson(id);
    return this.progress.lessons[id] ??= { state: LESSON_STATES.NOT_STARTED, openedAt: null, completedAt: null, lessonVersion: lesson?.version ?? 1, checkpoint: null, lastSection: null };
  }

  exerciseRecord(id) {
    return this.progress.exercises[id] ??= { passed: false, assisted: false, bestScore: 0, hintsUsed: 0, attempts: [], firstPassedAt: null };
  }

  /** Record that a lesson was opened. */
  async recordLessonOpened(id) {
    const rec = this.lessonRecord(id);
    const first = !rec.openedAt;
    rec.openedAt ??= Date.now();
    this.progress.lastLesson = id;
    if ( first ) this.#activity("opened", id, this.registry.getLesson(id)?.title ?? id);
    this.recomputeLesson(id);
    await this.save();
  }

  async recordSection(lessonId, sectionId) {
    const rec = this.lessonRecord(lessonId);
    rec.lastSection = sectionId;
    this.progress.lastSection = sectionId;
    await this.save();
  }

  /**
   * Record an exercise attempt.
   * @param {string} exerciseId
   * @param {{passed:boolean, score:number, assisted:boolean, hints:number, mode:string}} attempt
   */
  async recordAttempt(exerciseId, { passed, score=0, assisted=false, hints=0, mode="guided" }) {
    const rec = this.exerciseRecord(exerciseId);
    rec.attempts.push({ at: Date.now(), passed, score, assisted, hints, mode });
    if ( rec.attempts.length > LIMITS.MAX_ATTEMPTS_PER_EXERCISE ) rec.attempts.splice(0, rec.attempts.length - LIMITS.MAX_ATTEMPTS_PER_EXERCISE);
    rec.bestScore = Math.max(rec.bestScore, score);
    rec.hintsUsed = Math.max(rec.hintsUsed, hints);
    if ( passed ) {
      if ( !rec.passed ) { rec.firstPassedAt = Date.now(); this.progress.stats.exercisesPassed += 1; this.#activity("passed", exerciseId, this.registry.getExercise(exerciseId)?.title ?? exerciseId); }
      // An exercise counts as independent once it has been passed without assistance at least once.
      rec.assisted = rec.passed ? (rec.assisted && assisted) : assisted;
      rec.passed = true;
    }
    const lesson = this.registry.getExerciseLesson(exerciseId);
    if ( lesson ) { this.lessonRecord(lesson.id); this.recomputeLesson(lesson.id); }
    this.#applyReviewFlags();
    const earned = this.#awardAchievements();
    await this.save();
    return { earned, lessonState: lesson ? this.progress.lessons[lesson.id].state : null };
  }

  async recordCheckpoint(lessonId, { passed, score }) {
    const rec = this.lessonRecord(lessonId);
    rec.checkpoint = { passed: Boolean(rec.checkpoint?.passed) || passed, score: Math.max(rec.checkpoint?.score ?? 0, score), at: Date.now(), attempts: (rec.checkpoint?.attempts ?? 0) + 1 };
    if ( passed ) this.#activity("checkpoint", lessonId, this.registry.getLesson(lessonId)?.title ?? lessonId);
    this.recomputeLesson(lessonId);
    const earned = this.#awardAchievements();
    await this.save();
    return { earned, lessonState: rec.state };
  }

  async recordHint(exerciseId) { this.exerciseRecord(exerciseId).hintsUsed += 1; this.progress.stats.hintsUsed += 1; await this.save(); }
  async recordSolutionRevealed(_exerciseId) { this.progress.stats.solutionsRevealed += 1; await this.save(); }
  async recordRun({ live=false }={}) { this.progress.stats.runs += 1; if ( live ) this.progress.stats.liveRuns += 1; const earned = this.#awardAchievements(); await this.save(); return { earned }; }

  async toggleBookmark(lessonId) {
    const i = this.progress.bookmarks.indexOf(lessonId);
    if ( i >= 0 ) this.progress.bookmarks.splice(i, 1); else this.progress.bookmarks.push(lessonId);
    await this.save();
    return i < 0;
  }

  async saveProject(id, data) {
    this.progress.projects[id] = { ...(this.progress.projects[id] ?? {}), ...data, updatedAt: Date.now() };
    await this.save();
    return this.progress.projects[id];
  }

  async deleteProject(id) { delete this.progress.projects[id]; await this.save(); }

  /** Recompute one lesson's state from its records. */
  recomputeLesson(id) {
    const lesson = this.registry.getLesson(id);
    if ( !lesson ) return;
    const rec = this.lessonRecord(id);
    const requireAssessment = this._getSetting(SETTINGS.REQUIRE_ASSESSMENT) !== false;
    const prev = rec.state;
    const next = computeLessonState(lesson, this.progress, { requireAssessment });
    rec.state = next;
    rec.lessonVersion = lesson.version;
    if ( COMPLETED_STATES.includes(next) && !COMPLETED_STATES.includes(prev) ) { rec.completedAt = Date.now(); this.#activity("completed", id, lesson.title); }
    return next;
  }

  /** Recompute every lesson (after settings or curriculum changes). */
  recomputeAll() { for ( const id of Object.keys(this.progress.lessons) ) this.recomputeLesson(id); this.#applyReviewFlags(); }

  #applyReviewFlags() {
    const flagged = new Set(lessonsNeedingReview(this.progress, this.registry));
    for ( const [id, rec] of Object.entries(this.progress.lessons) ) {
      if ( flagged.has(id) && COMPLETED_STATES.includes(rec.state) ) rec.reviewSuggested = true;
      else delete rec.reviewSuggested;
    }
  }

  #awardAchievements() {
    const earned = newlyEarned(this.progress, this.registry);
    for ( const a of earned ) { this.progress.achievements[a.id] = Date.now(); this.#activity("achievement", a.id, a.title); }
    return earned;
  }

  /**
   * Export the record as a JSON string.
   * @param {object} [options]
   * @param {boolean} [options.includeProjects=true]
   * @returns {string}
   */
  exportJSON({ includeProjects=true }={}) {
    const rec = clone(this.progress);
    if ( !includeProjects ) rec.projects = {};
    return JSON.stringify({ format: `${MODULE_ID}-progress`, exportedAt: new Date().toISOString(), moduleVersion: game?.modules?.get?.(MODULE_ID)?.version ?? "unknown", record: rec }, null, 2);
  }

  /**
   * Inspect an import payload without applying it.
   * @param {string|object} payload
   * @returns {{ok:boolean, errors:string[], warnings:string[], summary:object|null, record:object|null, reconciliation:object|null}}
   */
  inspectImport(payload) {
    let data = payload;
    if ( typeof payload === "string" ) { try { data = JSON.parse(payload); } catch(_err) { return { ok: false, errors: ["The file is not valid JSON."], warnings: [], summary: null, record: null, reconciliation: null }; } }
    const raw = data?.format === `${MODULE_ID}-progress` ? data.record : data;
    const { record, errors, warnings } = validateProgress(raw);
    if ( !record ) return { ok: false, errors, warnings, summary: null, record: null, reconciliation: null };
    let migrated;
    try { migrated = migrateProgress(record).record; } catch(err) { return { ok: false, errors: [err.message], warnings, summary: null, record: null, reconciliation: null }; }
    const reconciliation = reconcileWithCurriculum(migrated, this.registry);
    if ( reconciliation.unknownLessons.length ) warnings.push(`${reconciliation.unknownLessons.length} lesson record(s) refer to lessons not in this curriculum (kept, hidden until the lesson exists).`);
    return { ok: true, errors, warnings, summary: summarizeProgress(migrated), record: migrated, reconciliation };
  }

  /**
   * Apply an import with the chosen strategy. Never silently overwrites: the caller must have shown the
   * inspection summary and obtained confirmation.
   * @param {object} record     Validated record from inspectImport()
   * @param {"replace"|"merge"|"keep-existing"} strategy
   */
  async applyImport(record, strategy="merge") {
    this.record = mergeProgress(this.progress, record, strategy);
    this.recomputeAll();
    this.#awardAchievements();
    await this.save();
    return this.record;
  }

  /** Reset all progress (caller confirms). */
  async reset() {
    this.record = createEmptyProgress();
    await this.save();
  }
}
