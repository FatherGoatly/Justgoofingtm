/**
 * The Academy singleton wires the engines together: curriculum registry, progress service, drafts, the
 * sandbox runner, the active system adapter and the applications. UI code reaches everything through it.
 */
import { MODULE_ID, SETTINGS, OPEN_BEHAVIORS } from "./constants.js";
import { Logger } from "./logger.js";
import { describeEnvironment, checkRequirements } from "./compatibility.js";
import { canUseAcademy } from "./permissions.js";
import { getSetting } from "./settings.js";
import { CurriculumRegistry } from "../curriculum/registry.js";
import { ProgressService } from "../progress/service.js";
import { DraftService } from "../workshop/drafts.js";
import { SandboxRunner } from "../workshop/runner.js";
import { getActiveAdapter } from "../adapters/registry.js";
import { HookMonitor } from "../diagnostics/hook-monitor.js";

export class Academy {
  static #instance = null;
  static get instance() { return Academy.#instance; }

  constructor({ bundle }) {
    this.env = describeEnvironment();
    this.registry = new CurriculumRegistry(bundle);
    this.progress = new ProgressService({ registry: this.registry });
    this.drafts = new DraftService();
    this.runner = new SandboxRunner();
    this.adapter = getActiveAdapter(this.env);
    this.hookMonitor = new HookMonitor();
    this.apps = { academy: null, workshop: null };
    this.AcademyApplication = null;
    this.WorkshopApplication = null;
    Academy.#instance = this;
  }

  /** Initialise services; called once at ready. */
  initialize({ AcademyApplication, WorkshopApplication }) {
    this.AcademyApplication = AcademyApplication;
    this.WorkshopApplication = WorkshopApplication;
    if ( !this.registry.valid ) Logger.error(`Curriculum validation found ${this.registry.issues.length} issue(s). Affected lessons may not render correctly.`, this.registry.issues);
    this.progress.load();
    this.progress.recomputeAll();
    this.drafts.load();
    for ( const w of this.env.warnings ) Logger.warn(w);
    return this;
  }

  /** Can the current user open the academy? */
  get accessible() { return canUseAcademy(); }

  /** Is a lesson available in this environment (system/module requirements)? */
  lessonAvailability(lesson) {
    const req = checkRequirements(lesson.requirements ?? {}, this.env);
    if ( lesson.category === "system" && getSetting(SETTINGS.SHOW_SYSTEM_LESSONS, true) === false ) return { available: false, reasons: ["System-specific lessons are hidden by the world settings."] };
    return req;
  }

  /** Open (or focus) the main academy window. */
  async open(view=null) {
    if ( !this.accessible ) { ui.notifications.warn(game.i18n.localize("GMMA.Errors.NoAccess")); return null; }
    if ( !this.apps.academy ) this.apps.academy = new this.AcademyApplication({ academy: this });
    const app = this.apps.academy;
    if ( view ) app.setView(view);
    else if ( !app.rendered ) {
      const behavior = getSetting(SETTINGS.OPEN_BEHAVIOR, OPEN_BEHAVIORS.DASHBOARD);
      const last = this.progress.progress.lastLesson;
      if ( behavior === OPEN_BEHAVIORS.RESUME && last && this.registry.getLesson(last) ) app.setView({ name: "lesson", lessonId: last });
      else app.setView({ name: "dashboard" });
    }
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  async openLesson(lessonId) { return this.open({ name: "lesson", lessonId }); }

  /** Open the workshop, optionally loaded with an exercise, a draft, or starter code. */
  async openWorkshop(options={}) {
    if ( !this.accessible ) { ui.notifications.warn(game.i18n.localize("GMMA.Errors.NoAccess")); return null; }
    if ( !this.apps.workshop ) this.apps.workshop = new this.WorkshopApplication({ academy: this });
    const app = this.apps.workshop;
    await app.load(options);
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** Toggle the main window (scene control button behaviour). */
  async toggle() {
    const app = this.apps.academy;
    if ( app?.rendered ) return app.close();
    return this.open();
  }

  /** Public API exposed on game.modules.get(MODULE_ID).api */
  get api() {
    return Object.freeze({
      open: view => this.open(view),
      openLesson: id => this.openLesson(id),
      openWorkshop: options => this.openWorkshop(options),
      registry: this.registry,
      registerCurriculumPack: pack => { const issues = this.registry.registerPack(pack); if ( issues.length ) Logger.error(`Curriculum pack "${pack?.id}" rejected`, issues); else { this.progress.recomputeAll(); this.apps.academy?.render(); } return issues; },
      environment: () => this.env,
      adapter: this.adapter,
      version: game.modules.get(MODULE_ID)?.version
    });
  }
}
