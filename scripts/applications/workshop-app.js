/**
 * The Code Workshop: editor, three execution modes, exercise tests, hints, comparison, drafts and export.
 */
import { MODULE_ID, SETTINGS, EXECUTION_MODES, LEARNING_MODES } from "../core/constants.js";
import { Logger } from "../core/logger.js";
import { getSetting } from "../core/settings.js";
import { t } from "../core/i18n.js";
import { TEMPLATES } from "./templates.js";
import { renderRunResult, EXERCISE_TYPE_LABELS } from "./exercise-renderer.js";
import { evaluateRun } from "../assessment/evaluator.js";
import { createHintState, revealNextHint, revealNextSolutionStep, revealedHints, isAssisted } from "../assessment/hints.js";
import { createPracticeSnapshot } from "../workshop/practice-snapshot.js";
import { buildLiveSnapshot } from "../workshop/snapshot.js";
import { executeLive } from "../workshop/live-executor.js";
import { canExecuteLive, canCreateMacro } from "../core/permissions.js";
import { DraftService } from "../workshop/drafts.js";
import { exportAsFile, copyToClipboard, createOrUpdateMacro } from "../workshop/exporter.js";
import { diffLines, summarizeDiff, explainDiff } from "../utilities/diff.js";
import { escapeHTML, renderInline, renderCodeBlock } from "../utilities/html.js";
import { checkSyntax } from "../workshop/harness.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class WorkshopApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ academy, ...options }={}) {
    super(options);
    this.academy = academy;
    this.state = { exercise: null, lesson: null, broken: null, draft: null, code: "", starter: "", runtime: EXECUTION_MODES.SANDBOX, snapshotSource: "practice", lastResult: null, evaluation: null, hintState: createHintState(), revealedSteps: [], sideTab: "task", running: false, dirty: false, inputs: "" };
    this.autosaveKey = "workshop";
  }

  static DEFAULT_OPTIONS = {
    id: "gm-macro-academy-workshop",
    classes: ["gm-macro-academy", "workshop-app"],
    window: { title: "GMMA.Workshop.Title", icon: "fa-solid fa-flask", resizable: true, contentClasses: ["workshop-content"] },
    position: { width: 1180, height: 780 },
    actions: {
      run: WorkshopApplication.#onRun,
      cancelRun: WorkshopApplication.#onCancelRun,
      setRuntime: WorkshopApplication.#onSetRuntime,
      setSnapshot: WorkshopApplication.#onSetSnapshot,
      resetStarter: WorkshopApplication.#onResetStarter,
      revealHint: WorkshopApplication.#onRevealHint,
      revealStep: WorkshopApplication.#onRevealStep,
      sideTab: WorkshopApplication.#onSideTab,
      saveDraft: WorkshopApplication.#onSaveDraft,
      saveDraftAs: WorkshopApplication.#onSaveDraftAs,
      loadDraft: WorkshopApplication.#onLoadDraft,
      duplicateDraft: WorkshopApplication.#onDuplicateDraft,
      deleteDraft: WorkshopApplication.#onDeleteDraft,
      restoreVersion: WorkshopApplication.#onRestoreVersion,
      exportFile: WorkshopApplication.#onExportFile,
      copyCode: WorkshopApplication.#onCopyCode,
      createMacro: WorkshopApplication.#onCreateMacro,
      insertSolution: WorkshopApplication.#onInsertSolution,
      openLesson: WorkshopApplication.#onOpenLesson,
      newScratch: WorkshopApplication.#onNewScratch,
      fontSize: WorkshopApplication.#onFontSize
    }
  };

  static PARTS = {
    header: { template: TEMPLATES.workshopHeader },
    editor: { template: TEMPLATES.workshopEditor },
    results: { template: TEMPLATES.workshopResults, scrollable: [".results-scroll"] },
    side: { template: TEMPLATES.workshopSide, scrollable: [".side-scroll"] }
  };

  get title() { return game.i18n.localize("GMMA.Workshop.Title"); }

  /**
   * Load content into the workshop.
   * @param {object} options
   * @param {string} [options.exerciseId]
   * @param {string} [options.draftId]
   * @param {string} [options.brokenId]
   * @param {string} [options.code]
   * @param {string} [options.runtime]
   * @param {string} [options.lessonId]
   */
  async load({ exerciseId=null, draftId=null, brokenId=null, code=null, runtime=null, lessonId=null }={}) {
    const registry = this.academy.registry;
    const s = this.state;
    s.lastResult = null; s.evaluation = null; s.hintState = createHintState(); s.revealedSteps = []; s.sideTab = "task"; s.dirty = false;
    if ( exerciseId ) {
      const exercise = registry.getExercise(exerciseId);
      if ( !exercise ) { ui.notifications.warn(`Unknown exercise ${exerciseId}`); return; }
      s.exercise = exercise; s.lesson = registry.getExerciseLesson(exerciseId); s.broken = null;
      const draft = this.academy.drafts.forExercise(exerciseId);
      s.draft = draft;
      s.starter = exercise.starter ?? "";
      s.code = draft?.code ?? exercise.starter ?? "";
      s.runtime = exercise.runtime ?? EXECUTION_MODES.SANDBOX;
      s.inputs = JSON.stringify(exercise.inputs ?? []);
      this.autosaveKey = `exercise.${exerciseId}`;
    } else if ( brokenId ) {
      const broken = this.academy.registry.brokenMacros.find(b => b.id === brokenId);
      if ( !broken ) { ui.notifications.warn(`Unknown broken macro ${brokenId}`); return; }
      s.broken = broken; s.exercise = broken.exercise; s.lesson = null;
      const draft = this.academy.drafts.forExercise(broken.exercise.id);
      s.draft = draft;
      s.starter = broken.exercise.starter;
      s.code = draft?.code ?? broken.exercise.starter;
      s.runtime = broken.exercise.runtime;
      s.inputs = JSON.stringify(broken.exercise.inputs ?? []);
      this.autosaveKey = `broken.${brokenId}`;
    } else if ( draftId ) {
      const draft = this.academy.drafts.get(draftId);
      if ( !draft ) { ui.notifications.warn("Draft not found"); return; }
      s.draft = draft; s.exercise = draft.exerciseId ? registry.getExercise(draft.exerciseId) : null; s.lesson = draft.lessonId ? registry.getLesson(draft.lessonId) : null; s.broken = null;
      s.starter = draft.starter ?? s.exercise?.starter ?? ""; s.code = draft.code; s.runtime = draft.runtime; s.inputs = JSON.stringify(s.exercise?.inputs ?? []);
      this.autosaveKey = `draft.${draftId}`;
    } else if ( code !== null || !s.code ) {
      s.exercise = null; s.broken = null; s.draft = null; s.lesson = lessonId ? registry.getLesson(lessonId) : null;
      s.starter = code ?? ""; s.code = code ?? defaultScratch(); s.runtime = runtime ?? EXECUTION_MODES.SANDBOX; s.inputs = "[]";
      this.autosaveKey = "scratch";
    } else if ( runtime ) {
      s.runtime = runtime;
    }
    const recovered = DraftService.recoverAutosave(this.autosaveKey);
    if ( recovered && recovered.code !== s.code && recovered.code !== s.starter && (!s.draft || recovered.at > s.draft.updatedAt) && code === null ) {
      s.recovered = recovered;
    } else s.recovered = null;
    if ( this.rendered ) await this.render();
  }

  /** Apply the editor font size preference. */
  applyFontSize(size) { this.element?.style.setProperty("--gmma-editor-font-size", `${size}px`); }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.state;
    const exercise = s.exercise;
    const live = canExecuteLive();
    const macro = canCreateMacro();
    const record = exercise ? this.academy.progress.progress.exercises[exercise.id] : null;
    const runtimes = [
      { id: EXECUTION_MODES.SANDBOX, label: t("Workshop.Sandbox"), hint: t("Workshop.SandboxHint"), icon: "fa-cube", active: s.runtime === EXECUTION_MODES.SANDBOX, disabled: false },
      { id: EXECUTION_MODES.PREVIEW, label: t("Workshop.Preview"), hint: t("Workshop.PreviewHint"), icon: "fa-eye", active: s.runtime === EXECUTION_MODES.PREVIEW, disabled: false },
      { id: EXECUTION_MODES.LIVE, label: t("Workshop.Live"), hint: live.allowed ? t("Workshop.LiveHint") : live.reason, icon: "fa-bolt", active: s.runtime === EXECUTION_MODES.LIVE, disabled: !live.allowed }
    ];
    const side = {
      task: exercise ? renderTask(exercise, s, record) : renderScratchTask(s),
      hints: exercise ? renderHints(exercise, s) : `<p class="hint">${t("Workshop.NoExerciseHints")}</p>`,
      compare: renderCompare(s),
      drafts: renderDrafts(this.academy.drafts, s),
      help: renderHelp(s.runtime)
    };
    return {
      ...context,
      title: exercise ? exercise.title : (s.draft ? s.draft.name : t("Workshop.Scratch")),
      subtitle: exercise ? `${EXERCISE_TYPE_LABELS[exercise.type] ?? exercise.type}${s.lesson ? ` · ${s.lesson.title}` : (s.broken ? ` · ${t("Workshop.BrokenLibrary")}` : "")}` : t("Workshop.ScratchHint"),
      lessonId: s.lesson?.id ?? null, exerciseId: exercise?.id ?? null, brokenId: s.broken?.id ?? null, draftName: s.draft?.name ?? null, dirty: s.dirty,
      code: s.code, starter: s.starter, runtime: s.runtime, runtimes, running: s.running,
      isPreview: s.runtime === EXECUTION_MODES.PREVIEW, isLive: s.runtime === EXECUTION_MODES.LIVE, isSandbox: s.runtime === EXECUTION_MODES.SANDBOX,
      snapshotSource: s.snapshotSource, snapshotLocked: Boolean(exercise), liveAllowed: live.allowed, liveReason: live.reason,
      macroAllowed: macro.allowed, macroReason: macro.reason,
      resultsHtml: renderRunResult(s.lastResult, { evaluation: s.evaluation }),
      sideTabs: [["task", t("Workshop.Tabs.Task"), "fa-list-check"], ["hints", t("Workshop.Tabs.Hints"), "fa-lightbulb"], ["compare", t("Workshop.Tabs.Compare"), "fa-code-compare"], ["drafts", t("Workshop.Tabs.Drafts"), "fa-folder-open"], ["help", t("Workshop.Tabs.Help"), "fa-circle-question"]].map(([id, label, icon]) => ({ id, label, icon, active: s.sideTab === id })),
      sideHtml: side[s.sideTab] ?? side.task,
      recovered: s.recovered ? { when: new Date(s.recovered.at).toLocaleString() } : null,
      inputs: s.inputs, fontSize: getSetting(SETTINGS.EDITOR_FONT_SIZE, 14), codeMirror: Boolean(customElements.get("code-mirror")),
      mode: getSetting(SETTINGS.DEFAULT_MODE, LEARNING_MODES.GUIDED)
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.applyFontSize(getSetting(SETTINGS.EDITOR_FONT_SIZE, 14));
    const editor = this.#editorElement;
    if ( editor && (!options.parts || options.parts.includes("editor")) ) {
      if ( editor.value !== this.state.code ) editor.value = this.state.code;
      const onInput = () => { this.state.code = String(editor.value ?? ""); this.state.dirty = true; DraftService.autosave(this.autosaveKey, this.state.code); this.#updateDirtyIndicator(); };
      editor.addEventListener("input", onInput);
      editor.addEventListener("change", onInput);
      editor.addEventListener("keydown", ev => { if ( (ev.ctrlKey || ev.metaKey) && ev.key === "Enter" ) { ev.preventDefault(); WorkshopApplication.#onRun.call(this, ev, editor); } if ( (ev.ctrlKey || ev.metaKey) && ev.key === "s" ) { ev.preventDefault(); WorkshopApplication.#onSaveDraft.call(this, ev, editor); } });
      const recover = this.element.querySelector("[data-recover]");
      if ( recover ) recover.addEventListener("click", () => { this.state.code = this.state.recovered.code; this.state.recovered = null; editor.value = this.state.code; this.state.dirty = true; this.render({ parts: ["editor"] }); });
      const dismiss = this.element.querySelector("[data-dismiss-recover]");
      if ( dismiss ) dismiss.addEventListener("click", () => { this.state.recovered = null; DraftService.clearAutosave(this.autosaveKey); this.render({ parts: ["editor"] }); });
      const search = this.element.querySelector("input[name='editor-search']");
      if ( search ) search.addEventListener("keydown", ev => { if ( ev.key === "Enter" ) { ev.preventDefault(); this.#findInCode(search.value); } });
    }
    const inputs = this.element.querySelector("textarea[name='scripted-inputs']");
    if ( inputs ) inputs.addEventListener("change", () => { this.state.inputs = inputs.value; });
  }

  get #editorElement() { return this.element?.querySelector("code-mirror[name='code'], textarea[name='code']") ?? null; }

  #syncCode() { const el = this.#editorElement; if ( el ) this.state.code = String(el.value ?? ""); return this.state.code; }

  #updateDirtyIndicator() { const el = this.element?.querySelector(".dirty-indicator"); if ( el ) el.hidden = !this.state.dirty; }

  #findInCode(text) {
    const editor = this.#editorElement;
    if ( !editor || !text ) return;
    const code = String(editor.value ?? "");
    const idx = code.toLowerCase().indexOf(text.toLowerCase(), (this._lastFind ?? -1) + 1);
    const pos = idx >= 0 ? idx : code.toLowerCase().indexOf(text.toLowerCase());
    if ( pos < 0 ) { ui.notifications.info(game.i18n.format("GMMA.Workshop.NotFound", { text })); return; }
    this._lastFind = pos;
    const line = code.slice(0, pos).split("\n").length;
    const status = this.element.querySelector(".find-status");
    if ( status ) status.textContent = game.i18n.format("GMMA.Workshop.FoundAtLine", { line });
    if ( editor.tagName.toLowerCase() === "textarea" ) { editor.focus(); editor.setSelectionRange(pos, pos + text.length); }
    else { editor.focus(); try { editor.scrollTo?.(0, Math.max(0, (line - 3) * 20)); } catch(_err) { /* ignore */ } }
  }

  /* ---------------------------------------------------------------------------------------------------------- */
  /* Running                                                                                                    */
  /* ---------------------------------------------------------------------------------------------------------- */

  async run() {
    const s = this.state;
    if ( s.running ) return;
    const code = this.#syncCode();
    const syntax = checkSyntax(code);
    s.running = true;
    await this.render({ parts: ["results", "header"] });
    let result;
    try {
      if ( !syntax.ok ) {
        result = { mode: s.runtime, ok: false, error: { ...syntax.error, line: null }, output: [], callResults: [], chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], warnings: [], timedOut: false, durationMs: 0 };
      } else if ( s.runtime === EXECUTION_MODES.LIVE ) {
        result = await executeLive(code);
        if ( !result.cancelled ) await this.academy.progress.recordRun({ live: true });
      } else {
        const request = { mode: s.runtime, code, tests: s.exercise?.tests ?? [] };
        if ( s.runtime === EXECUTION_MODES.PREVIEW ) {
          request.snapshot = this.#buildSnapshot();
          request.inputs = parseInputs(s.inputs);
          if ( s.exercise?.seed !== undefined ) request.seed = s.exercise.seed;
        }
        result = await this.academy.runner.execute(request);
        const { earned } = await this.academy.progress.recordRun({ live: false });
        for ( const a of earned ) ui.notifications.info(game.i18n.format("GMMA.Notices.Achievement", { title: a.title }));
      }
      s.lastResult = result;
      s.evaluation = null;
      if ( s.exercise && s.runtime !== EXECUTION_MODES.LIVE && !result.cancelled ) {
        const evaluation = evaluateRun(s.exercise, result, code);
        s.evaluation = evaluation;
        const assisted = isAssisted(s.hintState);
        const recordAssisted = getSetting(SETTINGS.RECORD_ASSISTED, true) !== false;
        const { earned } = await this.academy.progress.recordAttempt(s.exercise.id, { passed: evaluation.passed, score: evaluation.score, assisted: recordAssisted && assisted, hints: s.hintState.revealed, mode: getSetting(SETTINGS.DEFAULT_MODE, "guided") });
        for ( const a of earned ) ui.notifications.info(game.i18n.format("GMMA.Notices.Achievement", { title: a.title }));
        if ( evaluation.passed && s.draft ) await this.academy.drafts.save(s.draft.id, code).catch(() => {});
      }
    } catch(err) {
      Logger.report("Workshop run", err);
      s.lastResult = { mode: s.runtime, ok: false, error: { name: err.name, message: err.message, line: null }, output: [], callResults: [], chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], warnings: [], timedOut: false, durationMs: 0 };
    } finally {
      s.running = false;
    }
    await this.render({ parts: ["results", "header", "side"] });
  }

  #buildSnapshot() {
    const s = this.state;
    const gm = game.user.isGM;
    if ( s.exercise?.snapshot === "live" || (!s.exercise && s.snapshotSource === "live") ) {
      try { return buildLiveSnapshot(); } catch(err) { Logger.report("Live snapshot", err, { notify: true }); }
    }
    const systemId = s.exercise?.snapshot === "practice-generic" ? "generic" : (game.system?.id === "dnd5e" || s.exercise?.requirements?.system?.id === "dnd5e" || s.lesson?.requirements?.system?.id === "dnd5e" ? "dnd5e" : (s.exercise ? "dnd5e" : (game.system?.id === "dnd5e" ? "dnd5e" : "generic")));
    return createPracticeSnapshot({ system: s.exercise?.snapshot === "practice-generic" ? "generic" : systemId, gm: s.exercise?.snapshot === "practice-player" ? false : gm, combat: s.exercise?.snapshot !== "practice-nocombat" });
  }

  /* ---------------------------------------------------------------------------------------------------------- */
  /* Actions                                                                                                    */
  /* ---------------------------------------------------------------------------------------------------------- */

  static async #onRun() { await this.run(); }
  static async #onCancelRun() { this.academy.runner.cancel(); this.state.running = false; await this.render({ parts: ["results", "header"] }); }
  static async #onSetRuntime(_ev, target) {
    const runtime = target.dataset.runtime;
    if ( runtime === EXECUTION_MODES.LIVE && !canExecuteLive().allowed ) { ui.notifications.warn(canExecuteLive().reason); return; }
    this.#syncCode();
    this.state.runtime = runtime;
    await this.render({ parts: ["header", "side", "results"] });
  }
  static async #onSetSnapshot(_ev, target) { this.#syncCode(); this.state.snapshotSource = target.dataset.snapshot; await this.render({ parts: ["header"] }); }
  static async #onResetStarter() {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Workshop.ResetTitle") }, content: `<p>${t("Workshop.ResetWarning")}</p>`, rejectClose: false });
    if ( !ok ) return;
    this.state.code = this.state.starter; this.state.dirty = true; this.state.lastResult = null; this.state.evaluation = null;
    await this.render({ parts: ["editor", "results"] });
  }
  static async #onRevealHint() {
    const s = this.state;
    if ( !s.exercise ) return;
    const { state } = revealNextHint(s.hintState, s.exercise);
    s.hintState = state;
    await this.academy.progress.recordHint(s.exercise.id);
    s.sideTab = "hints";
    await this.render({ parts: ["side"] });
  }
  static async #onRevealStep() {
    const s = this.state;
    if ( !s.exercise ) return;
    const { state, step, complete } = revealNextSolutionStep(s.hintState, s.exercise);
    s.hintState = state;
    if ( step ) s.revealedSteps.push(step);
    if ( complete ) await this.academy.progress.recordSolutionRevealed(s.exercise.id);
    s.sideTab = "hints";
    await this.render({ parts: ["side"] });
  }
  static async #onSideTab(_ev, target) { this.#syncCode(); this.state.sideTab = target.dataset.tab; await this.render({ parts: ["side"] }); }
  static async #onSaveDraft() {
    const s = this.state;
    const code = this.#syncCode();
    try {
      if ( s.draft ) s.draft = await this.academy.drafts.save(s.draft.id, code, { runtime: s.runtime });
      else s.draft = await this.academy.drafts.create({ name: s.exercise?.title ?? s.broken?.title ?? t("Workshop.Scratch"), code, runtime: s.runtime, exerciseId: s.exercise?.id ?? null, lessonId: s.lesson?.id ?? null, starter: s.starter });
      s.dirty = false; DraftService.clearAutosave(this.autosaveKey);
      ui.notifications.info(game.i18n.format("GMMA.Workshop.Saved", { name: s.draft.name }));
    } catch(err) { ui.notifications.error(err.message); }
    await this.render({ parts: ["header", "side"] });
  }
  static async #onSaveDraftAs() {
    const s = this.state;
    const code = this.#syncCode();
    const data = await foundry.applications.api.DialogV2.input({ window: { title: t("Workshop.SaveAsTitle") }, content: `<div class="form-group"><label for="gmma-draft-name">${t("Workshop.DraftName")}</label><input id="gmma-draft-name" name="name" type="text" value="${escapeHTML(s.draft?.name ?? s.exercise?.title ?? "")}" autofocus></div><div class="form-group"><label for="gmma-draft-desc">${t("Workshop.DraftDescription")}</label><input id="gmma-draft-desc" name="description" type="text" value="${escapeHTML(s.draft?.description ?? "")}"></div>`, rejectClose: false });
    if ( !data ) return;
    try {
      s.draft = await this.academy.drafts.create({ name: data.name, description: data.description, code, runtime: s.runtime, exerciseId: s.exercise?.id ?? null, lessonId: s.lesson?.id ?? null, starter: s.starter });
      s.dirty = false; DraftService.clearAutosave(this.autosaveKey);
      ui.notifications.info(game.i18n.format("GMMA.Workshop.Saved", { name: s.draft.name }));
    } catch(err) { ui.notifications.error(err.message); }
    await this.render({ parts: ["header", "side"] });
  }
  static async #onLoadDraft(_ev, target) {
    if ( this.state.dirty ) { const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Workshop.UnsavedTitle") }, content: `<p>${t("Workshop.UnsavedWarning")}</p>`, rejectClose: false }); if ( !ok ) return; }
    await this.load({ draftId: target.dataset.draftId });
    this.state.sideTab = "drafts";
    await this.render();
  }
  static async #onDuplicateDraft(_ev, target) {
    try { const copy = await this.academy.drafts.duplicate(target.dataset.draftId); ui.notifications.info(game.i18n.format("GMMA.Workshop.Duplicated", { name: copy.name })); }
    catch(err) { ui.notifications.error(err.message); }
    await this.render({ parts: ["side"] });
  }
  static async #onDeleteDraft(_ev, target) {
    const draft = this.academy.drafts.get(target.dataset.draftId);
    if ( !draft ) return;
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Workshop.DeleteDraftTitle") }, content: `<p>${game.i18n.format("GMMA.Workshop.DeleteDraftWarning", { name: escapeHTML(draft.name) })}</p>`, rejectClose: false, yes: { icon: "fa-solid fa-trash" }, no: { default: true } });
    if ( !ok ) return;
    await this.academy.drafts.delete(draft.id);
    if ( this.state.draft?.id === draft.id ) this.state.draft = null;
    await this.render({ parts: ["header", "side"] });
  }
  static async #onRestoreVersion(_ev, target) {
    const s = this.state;
    if ( !s.draft ) return;
    s.draft = await this.academy.drafts.restoreVersion(s.draft.id, Number(target.dataset.version));
    s.code = s.draft.code; s.dirty = false;
    await this.render({ parts: ["editor", "side"] });
  }
  static async #onExportFile() { const name = exportAsFile(this.#syncCode(), this.state.draft?.name ?? this.state.exercise?.title ?? "academy-macro"); ui.notifications.info(game.i18n.format("GMMA.Workshop.Exported", { name })); }
  static async #onCopyCode() { const ok = await copyToClipboard(this.#syncCode()); ui.notifications[ok ? "info" : "warn"](game.i18n.localize(ok ? "GMMA.Notices.Copied" : "GMMA.Notices.CopyFailed")); }
  static async #onCreateMacro() {
    const s = this.state;
    const code = this.#syncCode();
    const result = await createOrUpdateMacro({ name: s.draft?.name ?? s.exercise?.title ?? t("Workshop.Scratch"), code, draftId: s.draft?.id ?? null });
    if ( result.status === "denied" ) ui.notifications.warn(result.reason);
    else if ( result.status === "created" ) ui.notifications.info(game.i18n.format("GMMA.Workshop.MacroCreated", { name: result.macro.name }));
    else if ( result.status === "updated" ) ui.notifications.info(game.i18n.format("GMMA.Workshop.MacroUpdated", { name: result.macro.name }));
  }
  static async #onInsertSolution() {
    const s = this.state;
    if ( !s.exercise?.solution ) return;
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Workshop.InsertSolutionTitle") }, content: `<p>${t("Workshop.InsertSolutionWarning")}</p>`, rejectClose: false });
    if ( !ok ) return;
    s.hintState = { ...s.hintState, solutionRevealed: true };
    await this.academy.progress.recordSolutionRevealed(s.exercise.id);
    s.code = s.exercise.solution.code; s.dirty = true;
    await this.render({ parts: ["editor", "side"] });
  }
  static async #onOpenLesson(_ev, target) { await this.academy.openLesson(target.dataset.lessonId ?? this.state.lesson?.id); }
  static async #onNewScratch() {
    if ( this.state.dirty ) { const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Workshop.UnsavedTitle") }, content: `<p>${t("Workshop.UnsavedWarning")}</p>`, rejectClose: false }); if ( !ok ) return; }
    await this.load({ code: defaultScratch(), runtime: EXECUTION_MODES.SANDBOX });
    await this.render();
  }
  static async #onFontSize(_ev, target) {
    const current = getSetting(SETTINGS.EDITOR_FONT_SIZE, 14);
    const next = Math.max(10, Math.min(24, current + Number(target.dataset.delta)));
    await game.settings.set(MODULE_ID, SETTINGS.EDITOR_FONT_SIZE, next);
    this.applyFontSize(next);
  }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Side panel renderers                                                                                         */
/* ------------------------------------------------------------------------------------------------------------ */

function defaultScratch() {
  return `// Scratch space. Try something:\nconst greeting = "Hello, Game Master!";\nconsole.log(greeting);\n`;
}

function parseInputs(text) {
  try { const v = JSON.parse(text || "[]"); return Array.isArray(v) ? v : []; } catch(_err) { return []; }
}

function renderTask(exercise, s, record) {
  const status = record?.passed ? `<p class="exercise-status passed"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Passed${record.assisted ? " (with solution)" : " independently"}</p>` : (record?.attempts?.length ? `<p class="exercise-status attempted">${record.attempts.length} attempt(s) so far</p>` : "");
  const tests = exercise.tests.map((tc, i) => { const check = s.evaluation?.checks?.[i]; return `<li class="${check ? (check.passed ? "ok" : "fail") : ""}"><i class="fa-solid ${check ? (check.passed ? "fa-check" : "fa-xmark") : "fa-circle-dot"}" aria-hidden="true"></i> ${escapeHTML(tc.name)}${check && !check.passed ? `<div class="check-message">${escapeHTML(check.message)}</div>` : ""}</li>`; }).join("");
  const inputs = exercise.inputs?.length ? `<p class="hint">Scripted dialog answers for this exercise: <code>${escapeHTML(JSON.stringify(exercise.inputs))}</code>. In preview, each dialog takes the next answer from this list.</p>` : "";
  return `<div class="task-panel">${status}<div class="task-prompt">${renderInline(exercise.prompt)}</div><h5>Checks</h5><ul class="check-list">${tests}</ul><h5>Assessment criteria</h5><ul>${exercise.criteria.map(c => `<li>${renderInline(c)}</li>`).join("")}</ul>${inputs}${exercise.runtime === "preview" ? `<p class="hint">Runs in <strong>Foundry Preview</strong> against the practice snapshot (${escapeHTML(exercise.snapshot ?? "practice")}). Nothing in your world changes.</p>` : `<p class="hint">Runs in the <strong>Concept Sandbox</strong>: plain JavaScript with <code>console.log</code>, no Foundry objects.</p>`}</div>`;
}

function renderScratchTask(s) {
  return `<div class="task-panel"><p>${t("Workshop.ScratchHint")}</p><ul><li><strong>Concept Sandbox</strong>: plain JavaScript in a Web Worker. Use <code>console.log</code>.</li><li><strong>Foundry Preview</strong>: an emulated <code>game</code>, <code>canvas</code>, <code>ui</code>, <code>ChatMessage</code>, <code>Roll</code>, <code>DialogV2</code>, <code>Hooks</code> built from a snapshot. Changes are recorded, not applied.</li><li><strong>Live</strong>: the real game, after an explicit confirmation.</li></ul>${s.lesson ? `<p>Opened from <a class="academy-link lesson-link" data-action="openLesson" data-lesson-id="${escapeHTML(s.lesson.id)}">${escapeHTML(s.lesson.title)}</a>.</p>` : ""}</div>`;
}

function renderHints(exercise, s) {
  const hints = revealedHints(s.hintState, exercise);
  const remaining = (exercise.hints?.length ?? 0) - hints.length;
  const list = hints.length ? `<ol class="hint-list">${hints.map(h => `<li class="hint-item"><span class="hint-level">${escapeHTML(h.label)}</span> ${renderInline(h.text)}</li>`).join("")}</ol>` : `<p class="hint">No hints revealed yet. Hints are free: they explain the reasoning for the next step without giving the whole answer.</p>`;
  const hintBtn = remaining > 0 ? `<button type="button" class="hint-button" data-action="revealHint"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> Reveal next hint (${remaining} left)</button>` : "";
  const steps = s.revealedSteps.map((st, i) => `<section class="reveal-step"><h6>${i + 1}. ${escapeHTML(st.title)}</h6>${st.text ? `<p>${renderInline(st.text)}</p>` : ""}${st.code ? renderCodeBlock(st.code) : ""}</section>`).join("");
  const total = exercise.reveal?.length ?? 0;
  const stepBtn = s.revealedSteps.length < total ? `<button type="button" class="secondary-button" data-action="revealStep"><i class="fa-solid fa-stairs" aria-hidden="true"></i> Reveal solution step ${s.revealedSteps.length + 1} of ${total}</button>` : "";
  const insert = s.hintState.solutionRevealed && exercise.solution ? `<button type="button" class="secondary-button" data-action="insertSolution"><i class="fa-solid fa-file-import" aria-hidden="true"></i> Insert reference solution into editor</button><p>${renderInline(exercise.solution.explanation)}</p>` : "";
  return `<div class="hints-panel"><h5>Hints</h5>${list}${hintBtn}<h5>Progressive solution</h5><p class="hint">Revealing the final step marks this exercise as solution-assisted if you pass it afterwards; you can always retry later for an independent pass.</p>${steps}${stepBtn}${insert}</div>`;
}

function renderCompare(s) {
  const current = s.code ?? "";
  const starter = s.starter ?? "";
  const blocks = [];
  const vsStarter = diffLines(starter, current);
  blocks.push(renderDiff("Your code vs starter code", vsStarter, { leftLabel: "starter", rightLabel: "yours" }));
  if ( s.exercise?.solution && s.hintState.solutionRevealed ) blocks.push(renderDiff("Your code vs reference solution", diffLines(current, s.exercise.solution.code), { leftLabel: "yours", rightLabel: "reference" }));
  else if ( s.exercise?.solution ) blocks.push(`<p class="hint">The comparison with the reference solution unlocks after you reveal the full solution (Hints tab). Different code that passes the checks is still correct.</p>`);
  return `<div class="compare-panel">${blocks.join("")}</div>`;
}

function renderDiff(title, diff, { leftLabel, rightLabel }) {
  const summary = summarizeDiff(diff);
  const notes = explainDiff(diff);
  const rows = diff.map(d => `<div class="diff-line diff-${d.type}"><span class="diff-marker" aria-hidden="true">${d.type === "added" ? "+" : (d.type === "removed" ? "−" : " ")}</span><span class="diff-text">${escapeHTML(d.text)}</span></div>`).join("");
  return `<section class="diff-section"><h5>${escapeHTML(title)}</h5><p class="hint">${escapeHTML(summary.summary)} Lines marked − exist only in ${escapeHTML(leftLabel)}; + only in ${escapeHTML(rightLabel)}.</p><div class="diff-view" role="region" aria-label="${escapeHTML(title)}">${rows || `<div class="diff-line">(both empty)</div>`}</div>${notes.length ? `<ul class="diff-notes">${notes.map(n => `<li>${renderInline(n)}</li>`).join("")}</ul>` : ""}</section>`;
}

function renderDrafts(drafts, s) {
  const list = drafts.list();
  const usage = drafts.usage();
  const items = list.map(d => `<li class="draft-item ${s.draft?.id === d.id ? "current" : ""}"><div class="draft-main"><strong>${escapeHTML(d.name)}</strong> <span class="draft-meta">${escapeHTML(d.runtime)} · ${new Date(d.updatedAt).toLocaleString()}${d.exerciseId ? " · exercise" : ""}</span>${d.description ? `<div class="draft-desc">${escapeHTML(d.description)}</div>` : ""}</div><div class="draft-actions"><button type="button" class="icon-button" data-action="loadDraft" data-draft-id="${escapeHTML(d.id)}" aria-label="Open draft ${escapeHTML(d.name)}"><i class="fa-solid fa-folder-open" aria-hidden="true"></i></button><button type="button" class="icon-button" data-action="duplicateDraft" data-draft-id="${escapeHTML(d.id)}" aria-label="Duplicate draft ${escapeHTML(d.name)}"><i class="fa-solid fa-copy" aria-hidden="true"></i></button><button type="button" class="icon-button danger" data-action="deleteDraft" data-draft-id="${escapeHTML(d.id)}" aria-label="Delete draft ${escapeHTML(d.name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></li>`).join("");
  const versions = s.draft?.versions?.length ? `<h5>Previous versions of "${escapeHTML(s.draft.name)}"</h5><ul class="version-list">${s.draft.versions.map((v, i) => `<li><span>${new Date(v.savedAt).toLocaleString()}</span> <button type="button" class="link-button" data-action="restoreVersion" data-version="${i}">restore</button></li>`).reverse().join("")}</ul>` : "";
  return `<div class="drafts-panel"><div class="draft-toolbar"><button type="button" class="secondary-button" data-action="saveDraft"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save</button><button type="button" class="secondary-button" data-action="saveDraftAs"><i class="fa-solid fa-file-circle-plus" aria-hidden="true"></i> Save as…</button><button type="button" class="secondary-button" data-action="newScratch"><i class="fa-solid fa-file" aria-hidden="true"></i> New scratch</button></div><p class="hint">Drafts are stored per user on the Foundry server (${usage.count}/${usage.maxCount} drafts, ${Math.round(usage.bytes / 1024)} KB of ${Math.round(usage.maxBytes / 1024)} KB). They are private to you and the world's Gamemaster.</p>${list.length ? `<ul class="draft-list">${items}</ul>` : `<p class="hint">No drafts yet.</p>`}${versions}</div>`;
}

function renderHelp(runtime) {
  const emulated = [["game", "user, users, actors, items, scenes (+ .active), macros, journal, combat, combats, settings (register/get/set), i18n, system, modules.get, version, time, paused"], ["canvas", "scene, tokens.controlled / placeables / get, grid.size / distance / units / measurePath, pan"], ["ui.notifications", "info, warn, error (recorded)"], ["ChatMessage", "create, getSpeaker, getSpeakerActor, getWhisperRecipients, applyRollMode"], ["Roll", "new Roll(formula, data), evaluate, total, dice, toMessage, render, Roll.validate (dice: NdX, kh/kl, r, min/max, x, arithmetic, @paths)"], ["foundry.applications.api.DialogV2", "prompt, confirm, input, wait (answers come from the scripted inputs list)"], ["Hooks", "on, once, off, call, callAll (registrations recorded; call runs your own handlers)"], ["foundry.utils", "deepClone, duplicate, mergeObject, expandObject, flattenObject, getProperty, setProperty, hasProperty, isEmpty, escapeHTML, randomID, isNewerVersion"], ["Documents", "name, id, uuid, system, flags, isOwner, testUserPermission, update, delete, getFlag, setFlag, toObject; Actor: items, effects, statuses, itemTypes, getRollData, getActiveTokens, create/update/deleteEmbeddedDocuments, toggleStatusEffect; Item: use; Token placeable: document, actor, name, x/y, center, control, release, setTarget; Combat: combatants, combatant, round, turn, nextTurn, rollInitiative, startCombat"], ["dnd5e (when the snapshot system is dnd5e)", "actor.applyDamage, applyTempHP, rollAbilityCheck, rollSavingThrow, rollSkill, rollInitiative; CONFIG.DND5E abilities/skills/damageTypes/conditionTypes"], ["fromUuid / fromUuidSync", "resolves Actor, Item, Scene, Token, Combat, Macro, JournalEntry and embedded uuids in the snapshot"], ["Not emulated", "ApplicationV2 subclasses, renderTemplate, canvas drawing, audio, sockets, compendium packs, User#query, network access. These throw a clear 'not emulated' error."]];
  return `<div class="help-panel"><h5>Execution modes</h5><ul><li><strong>Concept Sandbox</strong> runs plain JavaScript inside a Web Worker. No DOM, no Foundry objects, no page access. A time limit stops runaway loops.</li><li><strong>Foundry Preview (dry run)</strong> runs in the same worker against an <em>emulated</em> Foundry built from a read-only snapshot (practice data, or a copy of what you can see in the live world). Updates, creations, chat and dialogs are recorded and shown, never applied.</li><li><strong>Live</strong> runs on the main thread with the real API and your privileges, after an explicit confirmation. Nothing is sandboxed.</li></ul><p class="hint">The worker isolates code from the page and from Foundry, not from the network: a worker can still make same-origin requests. Treat pasted code accordingly.</p><h5>What the emulator covers</h5><table class="help-table"><tbody>${emulated.map(([k, v]) => `<tr><th scope="row"><code>${escapeHTML(k)}</code></th><td>${escapeHTML(v)}</td></tr>`).join("")}</tbody></table><h5>Keyboard</h5><ul><li><kbd>Ctrl</kbd>+<kbd>Enter</kbd> run</li><li><kbd>Ctrl</kbd>+<kbd>S</kbd> save draft</li><li><kbd>Tab</kbd> indents inside the editor; use the toolbar buttons or <kbd>Shift</kbd>+<kbd>Tab</kbd>/<kbd>Esc</kbd> then <kbd>Tab</kbd> to move focus out</li></ul>${runtime === "live" ? `<p class="callout callout-danger">Live mode is selected. Every run is confirmed and executes with your privileges.</p>` : ""}</div>`;
}
