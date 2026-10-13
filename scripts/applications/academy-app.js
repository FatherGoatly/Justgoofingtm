/**
 * The main academy window: dashboard, curriculum browser, lesson viewer, glossary, progress, debugging
 * workbench, diagnostics and help, in one ApplicationV2 with a sidebar navigation.
 */
import { MODULE_ID, SETTINGS, LESSON_STATES, COMPLETED_STATES, CATEGORIES, DIFFICULTIES, LEARNING_MODES } from "../core/constants.js";
import { Logger } from "../core/logger.js";
import { getSetting } from "../core/settings.js";
import { t } from "../core/i18n.js";
import { TEMPLATES } from "./templates.js";
import { renderLessonHeader, renderLessonSections, sectionNav, renderDocumentation, renderTerm } from "../curriculum/renderer.js";
import { renderExercise, renderCheckpoint, EXERCISE_TYPE_LABELS } from "./exercise-renderer.js";
import { evaluateSubmission, evaluateCheckpoint } from "../assessment/evaluator.js";
import { createHintState, revealNextHint, isAssisted } from "../assessment/hints.js";
import { STATE_LABELS, STATE_DESCRIPTIONS, tierMastery, overallProgress, currentTier } from "../assessment/mastery.js";
import { achievementStatus } from "../assessment/achievements.js";
import { reviewRecommendations } from "../assessment/review.js";
import { completedSet } from "../curriculum/registry.js";
import { escapeHTML, renderInline } from "../utilities/html.js";
import { formatDuration } from "../utilities/text.js";
import { copyToClipboard } from "../workshop/exporter.js";
import { fixtureStatus, createFixtures, cleanupFixtures, resetFixtures, describeCreation } from "../workshop/fixtures.js";
import { canManageFixtures, describeUserPermissions } from "../core/permissions.js";
import { buildDiagnosticReport, formatDiagnosticReport } from "../diagnostics/report.js";
import { SUGGESTED_HOOKS } from "../diagnostics/hook-monitor.js";
import { inspect } from "../diagnostics/inspector.js";
import { explainError } from "../diagnostics/error-explainer.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AcademyApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ academy, ...options }={}) {
    super(options);
    this.academy = academy;
    this.view = { name: "dashboard" };
    /** Per-exercise UI state for the open lesson: hints, last result, submission. */
    this.exerciseState = new Map();
    this.checkpointState = null;
    this.filters = { text: "", difficulties: [], categories: [], tiers: [], status: "all" };
    this.glossaryFilter = { text: "", tag: "" };
    this.debug = { selectedBroken: null, lastInspect: null, errorText: "", lastExplanation: null };
    this._progressUnsubscribe = academy.progress.onChange(() => { if ( this.rendered ) this.render(); });
    this._hookUnsubscribe = academy.hookMonitor.onEvent(() => { if ( this.rendered && this.view.name === "debug" ) this.#refreshHookLog(); });
  }

  static DEFAULT_OPTIONS = {
    id: "gm-macro-academy",
    classes: ["gm-macro-academy", "academy-app"],
    tag: "div",
    window: { title: "GMMA.Title", icon: "fa-solid fa-graduation-cap", resizable: true, contentClasses: ["academy-content"] },
    position: { width: 1120, height: 760 },
    actions: {
      navigate: AcademyApplication.#onNavigate,
      openLesson: AcademyApplication.#onOpenLesson,
      openTerm: AcademyApplication.#onOpenTerm,
      resume: AcademyApplication.#onResume,
      startExercise: AcademyApplication.#onStartExercise,
      revealHint: AcademyApplication.#onRevealHint,
      revealSolution: AcademyApplication.#onRevealSolution,
      moveStep: AcademyApplication.#onMoveStep,
      toggleBookmark: AcademyApplication.#onToggleBookmark,
      openWorkshop: AcademyApplication.#onOpenWorkshop,
      openInWorkshop: AcademyApplication.#onOpenInWorkshop,
      copyCode: AcademyApplication.#onCopyCode,
      jumpSection: AcademyApplication.#onJumpSection,
      exportProgress: AcademyApplication.#onExportProgress,
      importProgress: AcademyApplication.#onImportProgress,
      resetProgress: AcademyApplication.#onResetProgress,
      createFixtures: AcademyApplication.#onCreateFixtures,
      cleanupFixtures: AcademyApplication.#onCleanupFixtures,
      resetFixtures: AcademyApplication.#onResetFixtures,
      copyDiagnostics: AcademyApplication.#onCopyDiagnostics,
      startHooks: AcademyApplication.#onStartHooks,
      stopHooks: AcademyApplication.#onStopHooks,
      clearHooks: AcademyApplication.#onClearHooks,
      inspectSelection: AcademyApplication.#onInspectSelection,
      inspectExpand: AcademyApplication.#onInspectExpand,
      explainError: AcademyApplication.#onExplainError,
      openBroken: AcademyApplication.#onOpenBroken,
      clearFilters: AcademyApplication.#onClearFilters,
      setMode: AcademyApplication.#onSetMode,
      openSettings: () => game.settings.sheet.render({ force: true })
    }
  };

  static PARTS = {
    nav: { template: TEMPLATES.nav },
    content: { template: TEMPLATES.content, scrollable: [".view-scroll"] }
  };

  get title() { return game.i18n.localize("GMMA.Title"); }

  /** Change the active view (does not render by itself). */
  setView(view) {
    this.view = { ...view };
    if ( view.name === "lesson" ) { this.exerciseState = new Map(); this.checkpointState = null; }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const academy = this.academy;
    const progress = academy.progress.progress;
    const nav = [
      { id: "dashboard", icon: "fa-house", label: t("Nav.Dashboard") },
      { id: "curriculum", icon: "fa-sitemap", label: t("Nav.Curriculum") },
      { id: "lesson", icon: "fa-book-open", label: t("Nav.Lesson"), disabled: !this.view.lessonId && !progress.lastLesson },
      { id: "glossary", icon: "fa-spell-check", label: t("Nav.Glossary") },
      { id: "progress", icon: "fa-chart-line", label: t("Nav.Progress") },
      { id: "debug", icon: "fa-bug", label: t("Nav.Debug") },
      { id: "diagnostics", icon: "fa-stethoscope", label: t("Nav.Diagnostics") },
      { id: "help", icon: "fa-circle-question", label: t("Nav.Help") }
    ].map(n => ({ ...n, active: n.id === this.view.name }));
    const views = { dashboard: this.#dashboardContext, curriculum: this.#curriculumContext, lesson: this.#lessonContext, glossary: this.#glossaryContext, progress: this.#progressContext, debug: this.#debugContext, diagnostics: this.#diagnosticsContext, help: this.#helpContext };
    const builder = views[this.view.name] ?? views.dashboard;
    const viewContext = await builder.call(this);
    return { ...context, nav, view: this.view.name, viewTemplate: TEMPLATES[this.view.name] ?? TEMPLATES.dashboard, mode: getSetting(SETTINGS.DEFAULT_MODE, LEARNING_MODES.GUIDED), modes: Object.values(LEARNING_MODES), isGM: game.user.isGM, ...viewContext };
  }

  /* ---------------------------------------------------------------------------------------------------------- */
  /* View contexts                                                                                              */
  /* ---------------------------------------------------------------------------------------------------------- */

  #lessonCard(lesson, { reason=null }={}) {
    const academy = this.academy;
    const progress = academy.progress.progress;
    const state = academy.registry.stateOf(lesson.id, progress);
    const availability = academy.lessonAvailability(lesson);
    const missing = academy.registry.availability(lesson.id, completedSet(progress)).missing;
    return {
      id: lesson.id, title: lesson.title, summary: lesson.summary, tier: lesson.tier, topic: lesson.topic, difficulty: lesson.difficulty, category: lesson.category,
      duration: formatDuration(lesson.estimatedMinutes), state, stateLabel: STATE_LABELS[state], stateDescription: STATE_DESCRIPTIONS[state],
      locked: state === LESSON_STATES.LOCKED, missing: missing.map(m => ({ id: m.id, title: m.title })),
      unavailable: !availability.available, unavailableReasons: availability.reasons, reason,
      bookmarked: progress.bookmarks.includes(lesson.id), reviewSuggested: Boolean(progress.lessons[lesson.id]?.reviewSuggested), isProject: lesson.category === CATEGORIES.PROJECT
    };
  }

  async #dashboardContext() {
    const academy = this.academy;
    const progress = academy.progress.progress;
    const registry = academy.registry;
    const lessons = registry.orderedLessons;
    const overall = overallProgress(lessons, progress);
    const tierNumber = currentTier(registry.tiers, registry.lessons, progress);
    const tier = registry.getTier(tierNumber);
    const mastery = tier ? tierMastery(tier, registry.lessonsInTier(tierNumber), progress) : null;
    const next = registry.recommendNext(progress, { filter: l => academy.lessonAvailability(l).available });
    const last = progress.lastLesson ? registry.getLesson(progress.lastLesson) : null;
    const recent = [...progress.activity].reverse().slice(0, 8).map(a => ({ ...a, when: timeAgo(a.at), icon: { opened: "fa-book-open", passed: "fa-check", completed: "fa-flag-checkered", achievement: "fa-trophy", checkpoint: "fa-clipboard-check" }[a.type] ?? "fa-circle" }));
    const achievements = achievementStatus(progress);
    const earned = achievements.filter(a => a.earned).slice(-6);
    const projects = Object.entries(progress.projects).map(([id, p]) => ({ id, ...p })).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const review = reviewRecommendations(progress, registry).slice(0, 3).map(r => ({ ...r, lessons: r.lessons.map(l => ({ id: l.id, title: l.title })) }));
    const available = lessons.filter(l => !completedSet(progress).has(l.id) && registry.availability(l.id, completedSet(progress)).available && academy.lessonAvailability(l).available).slice(0, 6).map(l => this.#lessonCard(l));
    const activeDays = new Set(progress.activity.map(a => new Date(a.at).toDateString())).size;
    return {
      overall, tier: tier ? { number: tier.number, title: tier.title, objective: tier.objective } : null, mastery,
      next: next ? this.#lessonCard(next) : null, last: last ? this.#lessonCard(last) : null, recent, earned, achievementCount: achievements.filter(a => a.earned).length, achievementTotal: achievements.length,
      projects, review, available, activeDays, stats: progress.stats, env: academy.env, warnings: academy.env.warnings
    };
  }

  async #curriculumContext() {
    const academy = this.academy;
    const registry = academy.registry;
    const progress = academy.progress.progress;
    const results = registry.search({ ...this.filters, progress });
    const ids = new Set(results.map(l => l.id));
    const tiers = registry.tiers.map(tier => {
      const lessons = registry.lessonsInTier(tier.number).filter(l => ids.has(l.id)).map(l => this.#lessonCard(l));
      const m = tierMastery(tier, registry.lessonsInTier(tier.number), progress);
      return { number: tier.number, title: tier.title, objective: tier.objective, graduation: tier.graduation, lessons, mastery: m, collapsed: lessons.length === 0 };
    }).filter(t => t.lessons.length || !this.#filtersActive());
    return {
      tiers, filters: this.filters, filtersActive: this.#filtersActive(), resultCount: results.length,
      difficulties: DIFFICULTIES.map(d => ({ id: d, label: capitalize(d), checked: this.filters.difficulties.includes(d) })),
      categories: Object.values(CATEGORIES).map(c => ({ id: c, label: t(`Categories.${c}`), checked: this.filters.categories.includes(c) })),
      statuses: ["all", "available", "incomplete", "completed"].map(s => ({ id: s, label: t(`Status.${s}`), selected: this.filters.status === s })),
      tierOptions: registry.tiers.map(tr => ({ id: tr.number, label: `Tier ${tr.number}`, checked: this.filters.tiers.includes(tr.number) }))
    };
  }

  #filtersActive() { const f = this.filters; return Boolean(f.text || f.difficulties.length || f.categories.length || f.tiers.length || f.status !== "all"); }

  async #lessonContext() {
    const academy = this.academy;
    const registry = academy.registry;
    const progress = academy.progress.progress;
    const lessonId = this.view.lessonId ?? progress.lastLesson;
    const lesson = lessonId ? registry.getLesson(lessonId) : null;
    if ( !lesson ) return { lesson: null, missingLesson: lessonId };
    this.view.lessonId = lesson.id;
    if ( !progress.lessons[lesson.id]?.openedAt ) academy.progress.recordLessonOpened(lesson.id).catch(err => Logger.report("Record lesson opened", err));
    else if ( progress.lastLesson !== lesson.id ) { progress.lastLesson = lesson.id; academy.progress.save().catch(() => {}); }
    const card = this.#lessonCard(lesson);
    const tier = registry.getTier(lesson.tier);
    const rec = progress.lessons[lesson.id] ?? {};
    const progressive = getSetting(SETTINGS.DEFAULT_MODE, LEARNING_MODES.GUIDED) === LEARNING_MODES.GUIDED;
    const headerHtml = renderLessonHeader(lesson, { stateLabel: STATE_LABELS[card.state], tier });
    const sectionsHtml = renderLessonSections(lesson, { progressive });
    const exercisesHtml = lesson.exercises.map(e => renderExercise(e, this.#exerciseRenderState(e))).join("");
    const challengeHtml = renderExercise(lesson.challenge, this.#exerciseRenderState(lesson.challenge));
    const checkpointHtml = renderCheckpoint(lesson.checkpoint, { record: rec.checkpoint, lastResult: this.checkpointState?.result ?? null, answers: this.checkpointState?.answers ?? {} });
    const related = registry.related(lesson.id);
    const terms = registry.termsFor(lesson.id);
    const required = lesson.completion.required.map(id => { const e = registry.getExercise(id); const r = progress.exercises[id]; return { id, title: e?.title ?? id, type: EXERCISE_TYPE_LABELS[e?.type] ?? e?.type, passed: Boolean(r?.passed), assisted: Boolean(r?.assisted) }; });
    const completion = { required, checkpoint: lesson.completion.checkpoint, checkpointPassed: Boolean(rec.checkpoint?.passed), criterion: lesson.completion.criterion, requireAssessment: getSetting(SETTINGS.REQUIRE_ASSESSMENT, true) !== false, state: card.state, stateLabel: card.stateLabel, stateDescription: card.stateDescription };
    const navItems = sectionNav(lesson);
    const prerequisiteCards = related.prerequisites.map(l => this.#lessonCard(l));
    const requirementsHtml = lesson.requirements?.system || lesson.requirements?.modules?.length ? renderRequirements(lesson.requirements, academy) : "";
    return {
      lesson: { id: lesson.id, title: lesson.title, tier: lesson.tier, bookmarked: card.bookmarked, locked: card.locked, unavailable: card.unavailable, unavailableReasons: card.unavailableReasons, missing: card.missing },
      headerHtml, sectionsHtml, exercisesHtml, challengeHtml, checkpointHtml, requirementsHtml, navItems, completion,
      related: { prerequisites: prerequisiteCards, dependents: related.dependents.map(l => ({ id: l.id, title: l.title })), reinforces: related.reinforces.map(l => ({ id: l.id, title: l.title })), sameTopic: related.sameTopic.slice(0, 6).map(l => ({ id: l.id, title: l.title })) },
      terms: terms.map(tm => ({ slug: tm.slug, term: tm.term, plain: tm.plain })),
      documentationHtml: renderDocumentation(lesson.documentation),
      reinforcesHtml: lesson.reinforces.length ? `<p>${lesson.reinforces.map(id => `<a class="academy-link lesson-link" data-action="openLesson" data-lesson-id="${escapeHTML(id)}">${escapeHTML(registry.getLesson(id)?.title ?? id)}</a>`).join(", ")}</p>` : "",
      nextLesson: (() => { const n = registry.recommendNext(progress, { filter: l => l.id !== lesson.id && academy.lessonAvailability(l).available }); return n ? { id: n.id, title: n.title } : null; })()
    };
  }

  #exerciseRenderState(exercise) {
    const st = this.exerciseState.get(exercise.id) ?? {};
    return { record: this.academy.progress.progress.exercises[exercise.id] ?? null, hintState: st.hintState ?? createHintState(), lastResult: st.lastResult ?? null, submission: st.submission ?? null, solutionShown: Boolean(st.solutionShown) };
  }

  async #glossaryContext() {
    const registry = this.academy.registry;
    const terms = registry.searchTerms(this.glossaryFilter.text, this.glossaryFilter.tag ? [this.glossaryFilter.tag] : []);
    const tags = [...new Set([...registry.glossary.values()].flatMap(g => g.tags))].sort();
    const selected = this.view.term ? registry.getTerm(this.view.term) : null;
    const letters = {};
    for ( const term of terms ) (letters[term.term[0].toUpperCase()] ??= []).push({ slug: term.slug, term: term.term, plain: term.plain, active: selected?.slug === term.slug });
    return {
      groups: Object.entries(letters).sort(([a], [b]) => a.localeCompare(b)).map(([letter, items]) => ({ letter, items })),
      count: terms.length, total: registry.glossary.size, filter: this.glossaryFilter, tags: tags.map(tg => ({ id: tg, selected: this.glossaryFilter.tag === tg })),
      selectedHtml: selected ? renderTerm(selected, selected.related.map(id => registry.getLesson(id)).filter(Boolean)) : ""
    };
  }

  async #progressContext() {
    const academy = this.academy;
    const registry = academy.registry;
    const progress = academy.progress.progress;
    const overall = overallProgress(registry.orderedLessons, progress);
    const tiers = registry.tiers.map(tier => { const lessons = registry.lessonsInTier(tier.number); const m = tierMastery(tier, lessons, progress); return { number: tier.number, title: tier.title, mastery: m, lessons: lessons.map(l => this.#lessonCard(l)) }; });
    const achievements = achievementStatus(progress).map(a => ({ ...a, when: a.earnedAt ? new Date(a.earnedAt).toLocaleDateString() : null }));
    const review = reviewRecommendations(progress, registry).map(r => ({ ...r, lessons: r.lessons.map(l => ({ id: l.id, title: l.title })), practice: r.practice.map(e => ({ id: e.id, title: e.title, lessonId: registry.getExerciseLesson(e.id)?.id })) }));
    const bookmarks = progress.bookmarks.map(id => registry.getLesson(id)).filter(Boolean).map(l => ({ id: l.id, title: l.title }));
    const projects = Object.entries(progress.projects).map(([id, p]) => ({ id, ...p, when: new Date(p.updatedAt).toLocaleDateString() }));
    const states = Object.entries(STATE_LABELS).map(([id, label]) => ({ id, label, description: STATE_DESCRIPTIONS[id] }));
    const report = academy.progress.lastReport;
    return { overall, tiers, achievements, review, bookmarks, projects, states, stats: progress.stats, report, exportIncludesProjects: getSetting(SETTINGS.EXPORT_PROJECTS, true) !== false, drafts: academy.drafts.usage() };
  }

  async #debugContext() {
    const academy = this.academy;
    const monitor = academy.hookMonitor;
    const broken = this.academy.registry.brokenMacros.map(b => ({ id: b.id, title: b.title, category: b.category, difficulty: b.difficulty, summary: b.summary, selected: this.debug.selectedBroken === b.id, passed: Boolean(academy.progress.progress.exercises[b.exercise.id]?.passed) }));
    const selected = this.academy.registry.brokenMacros.find(b => b.id === this.debug.selectedBroken) ?? null;
    const selectedHtml = selected ? renderBrokenMacro(selected, academy.progress.progress.exercises[selected.id]) : "";
    const hooks = SUGGESTED_HOOKS.map(h => ({ name: h, watched: monitor.watched.includes(h) }));
    const inspectHtml = this.debug.lastInspect ? renderInspectTree(this.debug.lastInspect) : "";
    const explanation = this.debug.lastExplanation;
    return { broken, selectedHtml, hooks, monitorActive: monitor.active, events: [...monitor.events].reverse().slice(0, 100).map(e => ({ ...e, time: new Date(e.at).toLocaleTimeString() })), inspectHtml, errorText: this.debug.errorText, explanation, inspectTargets: inspectTargets() };
  }

  async #diagnosticsContext() {
    const academy = this.academy;
    const progress = academy.progress.progress;
    const overall = overallProgress(academy.registry.orderedLessons, progress);
    const report = buildDiagnosticReport({
      progress: { completed: overall.completed, total: overall.total, exercises: Object.keys(progress.exercises).length, schemaVersion: progress.schemaVersion },
      curriculum: { lessons: academy.registry.lessons.size, terms: academy.registry.glossary.size, packs: academy.registry.packs, issues: academy.registry.issues.length }
    });
    const fixtures = fixtureStatus();
    return { report, reportText: formatDiagnosticReport(report), permissions: describeUserPermissions(), fixtures: { exists: Boolean(fixtures.scene), actorCount: fixtures.actors.length, complete: fixtures.complete, sceneName: fixtures.scene?.name ?? null, canManage: canManageFixtures().allowed, steps: describeCreation() }, adapter: academy.adapter.describe(), workflows: academy.adapter.workflows ? Object.entries(academy.adapter.workflows).map(([k, w]) => ({ id: k, ...w })) : [], curriculumIssues: academy.registry.issues.slice(0, 50), workersSupported: typeof Worker === "function" };
  }

  async #helpContext() {
    return { version: game.modules.get(MODULE_ID)?.version ?? "?" };
  }

  /* ---------------------------------------------------------------------------------------------------------- */
  /* Rendering                                                                                                  */
  /* ---------------------------------------------------------------------------------------------------------- */

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    // Exercise forms
    for ( const form of root.querySelectorAll("form.exercise-form") ) form.addEventListener("submit", ev => this.#onSubmitExercise(ev, form));
    for ( const form of root.querySelectorAll("form.checkpoint-form") ) form.addEventListener("submit", ev => this.#onSubmitCheckpoint(ev, form));
    // Curriculum search and filters
    const search = root.querySelector("input[name='curriculum-search']");
    if ( search ) search.addEventListener("input", debounce(ev => { this.filters.text = ev.target.value; this.render({ parts: ["content"] }).then(() => this.element.querySelector("input[name='curriculum-search']")?.focus()); }, 250));
    for ( const input of root.querySelectorAll("[data-filter]") ) input.addEventListener("change", ev => this.#onFilterChange(ev));
    const gsearch = root.querySelector("input[name='glossary-search']");
    if ( gsearch ) gsearch.addEventListener("input", debounce(ev => { this.glossaryFilter.text = ev.target.value; this.render({ parts: ["content"] }).then(() => { const el = this.element.querySelector("input[name='glossary-search']"); if ( el ) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }); }, 250));
    const gtag = root.querySelector("select[name='glossary-tag']");
    if ( gtag ) gtag.addEventListener("change", ev => { this.glossaryFilter.tag = ev.target.value; this.render({ parts: ["content"] }); });
    // Reorder keyboard support
    for ( const item of root.querySelectorAll(".reorder-item") ) item.addEventListener("keydown", ev => { if ( ev.altKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown") ) { ev.preventDefault(); moveItem(item, ev.key === "ArrowUp" ? "up" : "down"); } });
    // Section tracking
    const scroll = root.querySelector(".view-scroll");
    if ( scroll && this.view.name === "lesson" ) {
      const rec = this.academy.progress.progress.lessons[this.view.lessonId];
      if ( rec?.lastSection && options?.parts?.includes?.("content") !== true ) { const target = root.querySelector(`#${CSS.escape(rec.lastSection)}`); if ( target && !this.view.scrollTo ) target.scrollIntoView({ block: "start" }); }
      if ( this.view.scrollTo ) { const target = root.querySelector(`#${CSS.escape(this.view.scrollTo)}`); target?.scrollIntoView({ block: "start" }); delete this.view.scrollTo; }
      scroll.addEventListener("scroll", debounce(() => this.#trackSection(scroll), 400));
    }
    // Error explainer textarea
    const errorInput = root.querySelector("textarea[name='error-text']");
    if ( errorInput ) errorInput.addEventListener("input", ev => { this.debug.errorText = ev.target.value; });
    const inspectPath = root.querySelector("input[name='inspect-path']");
    if ( inspectPath ) inspectPath.addEventListener("keydown", ev => { if ( ev.key === "Enter" ) { ev.preventDefault(); AcademyApplication.#onInspectSelection.call(this, ev, inspectPath); } });
    // Hook selection
    for ( const cb of root.querySelectorAll("input[name='hook']") ) cb.addEventListener("change", () => { const names = [...root.querySelectorAll("input[name='hook']:checked")].map(i => i.value); const monitor = this.academy.hookMonitor; if ( monitor.active ) { monitor.stop(); monitor.start(names); } });
  }

  #trackSection(scroll) {
    const sections = [...scroll.querySelectorAll(".lesson-section")];
    const top = scroll.getBoundingClientRect().top;
    let current = null;
    for ( const s of sections ) { if ( s.getBoundingClientRect().top - top <= 80 ) current = s.id; }
    if ( current && this.academy.progress.progress.lessons[this.view.lessonId]?.lastSection !== current ) this.academy.progress.recordSection(this.view.lessonId, current).catch(() => {});
  }

  #refreshHookLog() {
    const list = this.element?.querySelector(".hook-log");
    if ( !list ) return;
    const events = [...this.academy.hookMonitor.events].reverse().slice(0, 100);
    list.innerHTML = events.map(e => `<li><span class="hook-time">${escapeHTML(new Date(e.at).toLocaleTimeString())}</span> <code>${escapeHTML(e.name)}</code> <span class="hook-args">${escapeHTML(e.summary)}</span></li>`).join("") || `<li class="hint">Waiting for events…</li>`;
  }

  async close(options={}) {
    this.academy.hookMonitor.stop();
    return super.close(options);
  }

  /* ---------------------------------------------------------------------------------------------------------- */
  /* Event handlers                                                                                             */
  /* ---------------------------------------------------------------------------------------------------------- */

  #onFilterChange(ev) {
    const el = ev.currentTarget;
    const kind = el.dataset.filter;
    if ( kind === "status" ) this.filters.status = el.value;
    else if ( kind === "difficulty" || kind === "category" || kind === "tier" ) {
      const key = { difficulty: "difficulties", category: "categories", tier: "tiers" }[kind];
      const value = kind === "tier" ? Number(el.value) : el.value;
      const list = this.filters[key];
      if ( el.checked && !list.includes(value) ) list.push(value);
      if ( !el.checked ) this.filters[key] = list.filter(v => v !== value);
    }
    this.render({ parts: ["content"] });
  }

  async #onSubmitExercise(ev, form) {
    ev.preventDefault();
    const id = form.dataset.exerciseId;
    const exercise = this.academy.registry.getExercise(id);
    if ( !exercise ) return;
    const submission = readSubmission(form, exercise);
    const result = evaluateSubmission(exercise, submission);
    const st = this.exerciseState.get(id) ?? { hintState: createHintState() };
    st.lastResult = result; st.submission = submission;
    this.exerciseState.set(id, st);
    const assisted = isAssisted(st.hintState) || Boolean(st.solutionShown);
    const recordAssisted = getSetting(SETTINGS.RECORD_ASSISTED, true) !== false;
    const { earned } = await this.academy.progress.recordAttempt(id, { passed: result.passed, score: result.score, assisted: recordAssisted && assisted, hints: st.hintState.revealed, mode: getSetting(SETTINGS.DEFAULT_MODE, "guided") });
    this.#announceAchievements(earned);
    this.view.scrollTo = `exercise-${id}`;
    await this.render({ parts: ["content"] });
  }

  async #onSubmitCheckpoint(ev, form) {
    ev.preventDefault();
    const lesson = this.academy.registry.getLesson(this.view.lessonId);
    if ( !lesson ) return;
    const answers = {};
    for ( const q of lesson.checkpoint.questions ) {
      const values = [...form.querySelectorAll(`input[name="${CSS.escape(q.id)}"]:checked`)].map(i => i.value);
      answers[q.id] = Array.isArray(q.answer) ? values : values[0];
    }
    const result = evaluateCheckpoint(lesson.checkpoint, answers);
    this.checkpointState = { result, answers };
    const { earned } = await this.academy.progress.recordCheckpoint(lesson.id, { passed: result.passed, score: result.score });
    this.#announceAchievements(earned);
    this.view.scrollTo = "checkpoint";
    await this.render({ parts: ["content"] });
  }

  #announceAchievements(earned=[]) {
    if ( !earned.length || getSetting(SETTINGS.NOTIFICATIONS, true) === false ) return;
    for ( const a of earned ) ui.notifications.info(game.i18n.format("GMMA.Notices.Achievement", { title: a.title }));
  }

  static async #onNavigate(_ev, target) { this.setView({ name: target.dataset.view }); await this.render(); }
  static async #onOpenLesson(_ev, target) { this.setView({ name: "lesson", lessonId: target.dataset.lessonId }); await this.render(); }
  static async #onOpenTerm(_ev, target) { this.view = { name: "glossary", term: target.dataset.term }; await this.render(); }
  static async #onResume() { const last = this.academy.progress.progress.lastLesson; if ( last ) { this.setView({ name: "lesson", lessonId: last }); await this.render(); } }
  static async #onJumpSection(_ev, target) { const el = this.element.querySelector(`#${CSS.escape(target.dataset.section)}`); el?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" }); el?.focus?.(); }
  static async #onStartExercise(_ev, target) { await this.academy.openWorkshop({ exerciseId: target.dataset.exerciseId }); }
  static async #onOpenWorkshop(_ev, target) { await this.academy.openWorkshop({ runtime: target.dataset.runtime ?? "sandbox" }); }
  static async #onOpenInWorkshop(_ev, target) {
    const figure = target.closest(".code-figure");
    const code = figure?.querySelector("template.code-source")?.innerHTML ?? "";
    await this.academy.openWorkshop({ code: decodeEntities(code), runtime: target.dataset.runtime ?? "sandbox", lessonId: this.view.lessonId ?? null });
  }
  static async #onCopyCode(_ev, target) {
    const figure = target.closest(".code-figure");
    const code = decodeEntities(figure?.querySelector("template.code-source")?.innerHTML ?? "");
    const ok = await copyToClipboard(code);
    ui.notifications[ok ? "info" : "warn"](game.i18n.localize(ok ? "GMMA.Notices.Copied" : "GMMA.Notices.CopyFailed"));
  }
  static async #onRevealHint(_ev, target) {
    const id = target.dataset.exerciseId;
    const exercise = this.academy.registry.getExercise(id);
    const st = this.exerciseState.get(id) ?? { hintState: createHintState() };
    const { state } = revealNextHint(st.hintState, exercise);
    st.hintState = state;
    this.exerciseState.set(id, st);
    await this.academy.progress.recordHint(id);
    this.view.scrollTo = `exercise-${id}`;
    await this.render({ parts: ["content"] });
  }
  static async #onRevealSolution(_ev, target) {
    const id = target.dataset.exerciseId;
    const st = this.exerciseState.get(id) ?? { hintState: createHintState() };
    st.solutionShown = true; st.hintState = { ...st.hintState, solutionRevealed: true };
    this.exerciseState.set(id, st);
    await this.academy.progress.recordSolutionRevealed(id);
    this.view.scrollTo = `exercise-${id}`;
    await this.render({ parts: ["content"] });
  }
  static #onMoveStep(_ev, target) { moveItem(target.closest(".reorder-item"), target.dataset.direction); }
  static async #onToggleBookmark(_ev, target) { await this.academy.progress.toggleBookmark(target.dataset.lessonId ?? this.view.lessonId); }
  static async #onSetMode(_ev, target) { await game.settings.set(MODULE_ID, SETTINGS.DEFAULT_MODE, target.dataset.mode); await this.render(); }
  static async #onClearFilters() { this.filters = { text: "", difficulties: [], categories: [], tiers: [], status: "all" }; await this.render({ parts: ["content"] }); }

  static async #onExportProgress() {
    const json = this.academy.progress.exportJSON({ includeProjects: getSetting(SETTINGS.EXPORT_PROJECTS, true) !== false });
    foundry.utils.saveDataToFile(json, "application/json", `gm-macro-academy-progress-${game.user.name.replace(/[^\w-]+/g, "_")}-${new Date().toISOString().slice(0, 10)}.json`);
  }
  static async #onImportProgress() {
    const { ImportProgressDialog } = await import("./dialogs/import-progress.js");
    await ImportProgressDialog.run(this.academy);
    await this.render();
  }
  static async #onResetProgress() {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: game.i18n.localize("GMMA.Progress.ResetTitle") }, content: `<p>${game.i18n.localize("GMMA.Progress.ResetWarning")}</p>`, rejectClose: false, yes: { label: game.i18n.localize("GMMA.Progress.ResetConfirm"), icon: "fa-solid fa-trash" }, no: { default: true } });
    if ( !ok ) return;
    await this.academy.progress.reset();
    ui.notifications.info(game.i18n.localize("GMMA.Progress.ResetDone"));
    await this.render();
  }
  static async #onCreateFixtures() { await this.#fixtureAction("create", createFixtures); }
  static async #onCleanupFixtures() { await this.#fixtureAction("cleanup", cleanupFixtures); }
  static async #onResetFixtures() { await this.#fixtureAction("reset", resetFixtures); }
  async #fixtureAction(kind, fn) {
    const { FixturesDialog } = await import("./dialogs/fixtures.js");
    const ok = await FixturesDialog.confirm(kind);
    if ( !ok ) return;
    try { await fn(); ui.notifications.info(game.i18n.localize(`GMMA.Fixtures.Done.${kind}`)); }
    catch(err) { Logger.report("Fixtures", err, { notify: true }); }
    await this.render({ parts: ["content"] });
  }
  static async #onCopyDiagnostics() {
    const text = this.element.querySelector("textarea[name='diagnostic-report']")?.value ?? "";
    const ok = await copyToClipboard(text);
    ui.notifications[ok ? "info" : "warn"](game.i18n.localize(ok ? "GMMA.Notices.Copied" : "GMMA.Notices.CopyFailed"));
  }
  static async #onStartHooks() {
    const names = [...this.element.querySelectorAll("input[name='hook']:checked")].map(i => i.value);
    if ( !names.length ) { ui.notifications.warn(game.i18n.localize("GMMA.Debug.NoHooksSelected")); return; }
    this.academy.hookMonitor.start(names);
    await this.render({ parts: ["content"] });
  }
  static async #onStopHooks() { this.academy.hookMonitor.stop(); await this.render({ parts: ["content"] }); }
  static async #onClearHooks() { this.academy.hookMonitor.clear(); this.#refreshHookLog(); }
  static async #onInspectSelection(_ev, _target) {
    const select = this.element.querySelector("select[name='inspect-target']");
    const pathInput = this.element.querySelector("input[name='inspect-path']");
    const key = select?.value ?? "token";
    const root = resolveInspectTarget(key);
    if ( root === undefined ) { ui.notifications.warn(game.i18n.localize("GMMA.Debug.NothingToInspect")); return; }
    const { resolvePath } = await import("../diagnostics/inspector.js");
    const path = pathInput?.value?.trim() ?? "";
    let value;
    try { value = resolvePath(root, path); } catch(err) { ui.notifications.warn(err.message); return; }
    this.debug.lastInspect = { key, path, tree: inspect(value, { maxDepth: 2, maxKeys: 60, path }) };
    await this.render({ parts: ["content"] });
  }
  static async #onInspectExpand(_ev, target) {
    const path = target.dataset.path;
    const pathInput = this.element.querySelector("input[name='inspect-path']");
    if ( pathInput ) pathInput.value = path;
    await AcademyApplication.#onInspectSelection.call(this, _ev, target);
  }
  static async #onExplainError() {
    const text = this.debug.errorText.trim();
    if ( !text ) return;
    const m = /^([A-Za-z]*Error)\s*:\s*(.*)$/s.exec(text.split("\n")[0]);
    const error = m ? { name: m[1], message: m[2] } : { name: "Error", message: text.split("\n")[0] };
    this.debug.lastExplanation = { ...explainError(error), original: text };
    await this.render({ parts: ["content"] });
  }
  static async #onOpenBroken(_ev, target) {
    const id = target.dataset.brokenId;
    if ( target.dataset.workshop === "true" ) { await this.academy.openWorkshop({ brokenId: id }); return; }
    this.debug.selectedBroken = id;
    await this.render({ parts: ["content"] });
  }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Helpers                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------ */

function readSubmission(form, exercise) {
  const data = new FormData(form);
  switch ( exercise.type ) {
    case "multiple-choice": { const all = data.getAll("answer"); return Array.isArray(exercise.answer) ? all : all[0] ?? null; }
    case "predict-output": case "api-discovery": return data.get("answer") ?? "";
    case "fill-blank": return exercise.blanks.map((_b, i) => data.get(`blank-${i}`) ?? "");
    case "identify-error": return data.getAll("line").map(Number);
    case "reorder-steps": return [...form.querySelectorAll(".reorder-item")].map(li => li.dataset.stepId);
    case "explain-code": case "capstone": return { text: data.get("text") ?? "", rubric: data.getAll("rubric") };
    default: return null;
  }
}

function moveItem(item, direction) {
  if ( !item ) return;
  const sibling = direction === "up" ? item.previousElementSibling : item.nextElementSibling;
  if ( !sibling ) return;
  if ( direction === "up" ) sibling.before(item); else sibling.after(item);
  item.focus();
}

function debounce(fn, ms) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; }
function prefersReducedMotion() { return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false; }
function capitalize(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
function decodeEntities(html) { const el = document.createElement("textarea"); el.innerHTML = html; return el.value; }
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if ( m < 1 ) return "just now";
  if ( m < 60 ) return `${m} min ago`;
  const h = Math.round(m / 60);
  if ( h < 24 ) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function renderRequirements(req, academy) {
  const avail = academy.lessonAvailability({ requirements: req, category: "system" });
  const items = [];
  if ( req.system ) items.push(`Game system: <strong>${escapeHTML(req.system.title ?? req.system.id)}</strong>${req.system.minimum ? ` ${escapeHTML(req.system.minimum)}+` : ""}${req.system.verified ? ` (verified against ${escapeHTML(req.system.verified)})` : ""}`);
  for ( const m of req.modules ?? [] ) items.push(`${m.optional ? "Optional module" : "Module"}: <strong>${escapeHTML(m.title ?? m.id)}</strong>${m.minimum ? ` ${escapeHTML(m.minimum)}+` : ""}${m.verified ? ` (verified against ${escapeHTML(m.verified)})` : ""}`);
  const status = avail.available ? `<p class="req-ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Everything this lesson needs is active in this world.</p>` : `<p class="req-missing"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i> ${avail.reasons.map(escapeHTML).join(" ")} You can still read the lesson; the practical parts will not run here. ${req.alternative ? renderInline(req.alternative) : ""}</p>`;
  return `<aside class="lesson-requirements callout callout-note"><div class="callout-title"><i class="fa-solid fa-plug" aria-hidden="true"></i> Requirements</div><ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>${status}</aside>`;
}

function renderBrokenMacro(b, record) {
  return `<article class="broken-macro"><header><h4>${escapeHTML(b.title)}</h4><span class="broken-meta">${escapeHTML(b.category)} · ${escapeHTML(b.difficulty)}${record?.passed ? ' · <span class="exercise-status passed">repaired</span>' : ""}</span></header><p>${renderInline(b.summary)}</p><p><strong>Symptom:</strong> ${renderInline(b.symptom)}</p><p><strong>What it should do:</strong> ${renderInline(b.expected)}</p><p class="hint">Open it in the Workshop to run its test case and repair it. The explanation of the root cause is revealed through the hints and solution there, not here.</p><button type="button" class="primary-button" data-action="openBroken" data-broken-id="${escapeHTML(b.id)}" data-workshop="true"><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i> Repair in Workshop</button></article>`;
}

function renderInspectTree(state) {
  const render = (node, depth=0) => {
    const expandable = node.children?.length || node.truncated;
    const children = node.children?.length ? `<ul class="inspect-children">${node.children.map(c => render(c, depth + 1)).join("")}</ul>` : "";
    const expand = node.truncated && !node.children?.length ? `<button type="button" class="link-button" data-action="inspectExpand" data-path="${escapeHTML(node.path)}">expand</button>` : "";
    return `<li class="inspect-node type-${escapeHTML(node.type)}"><span class="inspect-key">${escapeHTML(node.key)}</span> <span class="inspect-type">${escapeHTML(node.type)}</span> <span class="inspect-preview">${escapeHTML(node.preview)}</span> ${expand}${expandable ? children : ""}</li>`;
  };
  return `<p class="hint">Inspecting <code>${escapeHTML(state.key)}${state.path ? "." + escapeHTML(state.path) : ""}</code>. Values are read, never changed; functions are listed but never called.</p><ul class="inspect-tree">${render(state.tree)}</ul>`;
}

function inspectTargets() {
  return [
    { id: "token", label: "Selected token (canvas.tokens.controlled[0])" },
    { id: "actor", label: "Selected token's actor" },
    { id: "character", label: "Your assigned character (game.user.character)" },
    { id: "scene", label: "Active scene (canvas.scene)" },
    { id: "combat", label: "Active combat (game.combat)" },
    { id: "user", label: "Your user (game.user)" },
    { id: "system", label: "Game system (game.system)" },
    { id: "targets", label: "Your targets (game.user.targets)" }
  ];
}

function resolveInspectTarget(key) {
  switch ( key ) {
    case "token": return canvas?.ready ? canvas.tokens.controlled[0] : undefined;
    case "actor": return canvas?.ready ? canvas.tokens.controlled[0]?.actor : undefined;
    case "character": return game.user.character ?? undefined;
    case "scene": return canvas?.ready ? canvas.scene ?? undefined : undefined;
    case "combat": return game.combat ?? undefined;
    case "user": return game.user;
    case "system": return game.system;
    case "targets": return game.user.targets;
    default: return undefined;
  }
}

export { COMPLETED_STATES };
