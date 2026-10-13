import { MODULE_ID, DESTINATION, DUPLICATE_POLICY, MECHANIC_CATEGORY, confidenceLabel } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { getSetting, setSetting, SETTINGS } from "../core/settings.js";
import * as permissions from "../core/permissions.js";
import { compatibility } from "../core/compatibility.js";
import { acceptFile, acceptText, checkFormatAllowed, InputError } from "../import/input-manager.js";
import { runPipeline, summarize } from "../import/pipeline.js";
import { detectFormat } from "../import/format-detector.js";
import { importBundle, prepareImport } from "../import/importer.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The importer window: Source → Preview → Options → Report.
 */
export class ImporterApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.state = {
      text: "", filename: null, contentKind: "", detection: null, bundle: null, prepared: null, report: null,
      destination: DESTINATION.WORLD, actorId: null, folderName: "", duplicatePolicy: getSetting(SETTINGS.DUPLICATE_POLICY), automation: getSetting(SETTINGS.AUTOMATION_ENABLED), macros: false,
      busy: false, error: null, resolutions: {}
    };
    this.tabGroups = { primary: options.tab ?? getSetting(SETTINGS.CLIENT_LAST_TAB) ?? "source" };
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    classes: [MODULE_ID, "standard-form"],
    tag: "form",
    window: { title: "SBI.Title", icon: "fa-solid fa-file-import", resizable: true },
    position: { width: 860, height: 720 },
    form: { handler: ImporterApplication.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      parse: ImporterApplication.#onParse,
      import: ImporterApplication.#onImport,
      toggleMechanic: ImporterApplication.#onToggleMechanic,
      reviewMechanic: ImporterApplication.#onReviewMechanic,
      resolveDuplicate: ImporterApplication.#onResolveDuplicate,
      clear: ImporterApplication.#onClear,
      openDoc: ImporterApplication.#onOpenDoc,
      copyDiagnostics: ImporterApplication.#onCopyDiagnostics
    }
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    source: { template: `modules/${MODULE_ID}/templates/source.hbs`, scrollable: [".scrollable"] },
    preview: { template: `modules/${MODULE_ID}/templates/preview.hbs`, scrollable: [".scrollable"] },
    options: { template: `modules/${MODULE_ID}/templates/options.hbs`, scrollable: [".scrollable"] },
    report: { template: `modules/${MODULE_ID}/templates/report.hbs`, scrollable: [".scrollable"] },
    footer: { template: `modules/${MODULE_ID}/templates/footer.hbs` }
  };

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const s = this.state;
    context.state = s;
    context.tabs = this.#tabs();
    context.user = { isGM: game.user.isGM };
    context.formats = s.detection ? { format: s.detection.format, contentKind: s.contentKind || s.detection.contentKind, confidence: Math.round((s.detection.confidence ?? 0) * 100), scores: s.detection.scores } : null;
    context.contentKinds = [["", "Auto-detect"], ["statblock", "Creature / NPC stat block"], ["item", "Weapon / armor / magic item"], ["spell", "Spell"], ["character", "Character sheet"]].map(([value, label]) => ({ value, label, selected: value === s.contentKind }));
    context.preview = s.bundle ? this.#previewContext(s.bundle, s.prepared) : null;
    context.destinations = [...permissions.availableDestinations()].map(d => ({ value: d, label: game.i18n.localize(`SBI.Options.Destination${d.charAt(0).toUpperCase()}${d.slice(1)}`), selected: d === s.destination }));
    context.actors = game.actors.filter(a => a.isOwner).map(a => ({ id: a.id, name: a.name, selected: a.id === s.actorId }));
    context.duplicatePolicies = Object.values(DUPLICATE_POLICY).map(p => ({ value: p, label: game.i18n.localize(`SBI.Settings.DuplicatePolicy.${p.charAt(0).toUpperCase()}${p.slice(1)}`), selected: p === s.duplicatePolicy }));
    context.canMacros = permissions.canGenerateMacros();
    context.report = s.report;
    context.compat = compatibility.report;
    context.diagnostics = diagnostics.entries.slice(-50).reverse();
    context.tab = context.tabs[this.tabGroups.primary];
    return context;
  }

  async _preparePartContext(partId, context) {
    context = await super._preparePartContext(partId, context);
    if ( context.tabs[partId] ) context.tab = context.tabs[partId];
    return context;
  }

  #tabs() {
    const tabs = {};
    for ( const id of ["source", "preview", "options", "report"] ) {
      tabs[id] = { id, group: "primary", label: `SBI.Tabs.${id.charAt(0).toUpperCase()}${id.slice(1)}`, active: this.tabGroups.primary === id, cssClass: this.tabGroups.primary === id ? "active" : "" };
    }
    return tabs;
  }

  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    setSetting(SETTINGS.CLIENT_LAST_TAB, tab).catch(() => {});
  }

  /* -------------------------------------------- */

  #previewContext(bundle, prepared) {
    const summary = summarize(bundle);
    const entries = bundle.entries.map(e => {
      const items = e.kind === "actor" ? (e.items ?? []) : [e];
      const mechanics = [];
      const collect = (item, ownerName) => {
        for ( const m of item.mechanics ?? [] ) mechanics.push({
          id: m.id, item: ownerName, label: m.label, kind: m.kind, category: m.category, categoryLabel: game.i18n.localize(`SBI.Mechanic.Category.${m.category}`),
          confidence: confidenceLabel(m.confidence), confidencePct: Math.round(m.confidence * 100), enabled: m.enabled !== false, reviewRequired: Boolean(m.reviewRequired) && !m.reviewed,
          trigger: m.trigger?.event ?? "—", condition: m.trigger?.condition ?? "", owner: m.implementation?.owner ?? "—", requires: (m.implementation?.requires ?? []).join(", "), notes: [...(m.implementation?.limitations ?? []), ...(m.notes ?? []), ...(m.assumptions ?? [])].join(" "), sourceText: m.sourceText, canToggle: m.category !== MECHANIC_CATEGORY.UNRESOLVED, unresolved: m.category === MECHANIC_CATEGORY.UNRESOLVED
        });
        for ( const c of item.contents ?? [] ) collect(c, c.name);
      };
      for ( const i of items ) collect(i, i.name);
      return {
        id: e.id, name: e.name, kind: e.kind, type: e.kind === "actor" ? e.actorType : e.itemType, valid: e.validation?.valid !== false,
        errors: e.validation?.errors ?? [], warnings: e.warnings ?? [], confidence: confidenceLabel(e.confidence ?? 1),
        stats: e.kind === "actor" ? this.#actorStats(e) : this.#itemStats(e),
        items: e.kind === "actor" ? e.items.map(i => ({ name: i.name, type: i.itemType, section: i.section ?? "", activities: i.activities.map(a => a.type).join(", ") })) : [],
        effects: items.reduce((n, i) => n + (i.effects?.length ?? 0), 0),
        mechanics,
        duplicate: prepared?.entries?.find(p => p.entry.id === e.id)?.duplicate ?? null
      };
    });
    const diags = bundle.diagnostics.map(d => ({ level: d.level, message: d.message }));
    return { summary, entries, diagnostics: diags, review: entries.flatMap(e => e.mechanics.filter(m => m.reviewRequired)) };
  }

  #actorStats(a) {
    const abilities = Object.entries(a.abilities).map(([k, v]) => `${k.toUpperCase()} ${v.value}`).join(" · ");
    return [
      ["Type", `${a.size} ${a.creatureType.value || a.creatureType.custom}${a.creatureType.subtype ? ` (${a.creatureType.subtype})` : ""}${a.alignment ? `, ${a.alignment}` : ""}`],
      ["AC", a.ac.value ?? "—"], ["HP", `${a.hp.max ?? "—"}${a.hp.formula ? ` (${a.hp.formula})` : ""}`],
      ["Speed", Object.entries(a.movement).filter(([k, v]) => typeof v === "number").map(([k, v]) => `${k} ${v} ft.`).join(", ") || "—"],
      ["Abilities", abilities], ["CR / Level", a.cr ?? a.character?.level ?? "—"],
      ["Spellcasting", a.spellcasting ? `${a.spellcasting.ability ?? "?"} DC ${a.spellcasting.dc ?? "?"} (${a.spellcasting.spells.length} spells)` : "—"]
    ].map(([label, value]) => ({ label, value }));
  }

  #itemStats(i) {
    const rows = [["Type", `${i.itemType}${i.equipmentType ? ` (${i.equipmentType})` : ""}${i.consumableType ? ` (${i.consumableType})` : ""}`]];
    if ( i.rarity ) rows.push(["Rarity", i.rarity]);
    if ( i.attunement ) rows.push(["Attunement", `${i.attunement}${i.attunementNote ? ` (${i.attunementNote})` : ""}`]);
    if ( i.weapon?.damage ) rows.push(["Damage", `${i.weapon.damage.formula} ${i.weapon.damage.type}${i.weapon.versatile ? ` / ${i.weapon.versatile.formula}` : ""}`]);
    if ( i.armor ) rows.push(["AC", `${i.armor.value ?? "—"}${i.armor.magicalBonus ? ` +${i.armor.magicalBonus}` : ""}`]);
    if ( i.uses?.max ) rows.push(["Uses", `${i.uses.max}${i.uses.recovery[0] ? ` (${i.uses.recovery[0].period}${i.uses.recovery[0].formula ? ` ${i.uses.recovery[0].formula}` : ""})` : ""}`]);
    if ( i.spell ) rows.push(["Spell", `Level ${i.spell.level} ${i.spell.school}${i.spell.concentration ? ", concentration" : ""}${i.spell.ritual ? ", ritual" : ""}`]);
    rows.push(["Activities", i.activities.map(a => `${a.type}${a.name ? ` (${a.name})` : ""}`).join(", ") || "—"]);
    return rows.map(([label, value]) => ({ label, value }));
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static async #onSubmit(event, form, formData) {
    this.#readForm(formData.object);
  }

  #readForm(data) {
    const s = this.state;
    if ( data.text !== undefined ) s.text = data.text;
    if ( data.contentKind !== undefined ) s.contentKind = data.contentKind;
    if ( data.destination !== undefined ) s.destination = data.destination;
    if ( data.actorId !== undefined ) s.actorId = data.actorId;
    if ( data.folderName !== undefined ) s.folderName = data.folderName;
    if ( data.duplicatePolicy !== undefined ) s.duplicatePolicy = data.duplicatePolicy;
    if ( data.automation !== undefined ) s.automation = Boolean(data.automation);
    if ( data.macros !== undefined ) s.macros = Boolean(data.macros);
  }

  #currentForm() {
    const fd = new foundry.applications.ux.FormDataExtended(this.element);
    this.#readForm(fd.object);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const file = this.element.querySelector("input[type=file][name=upload]");
    file?.addEventListener("change", async (ev) => {
      try {
        const { text, filename } = await acceptFile(ev.target.files?.[0]);
        this.state.text = text; this.state.filename = filename;
        this.state.detection = detectFormat(text, { filename });
        this.render();
      } catch (err) { this.#error(err); }
    });
    const textarea = this.element.querySelector("textarea[name=text]");
    textarea?.addEventListener("input", foundry.utils.debounce(() => {
      this.state.text = textarea.value;
      this.state.detection = textarea.value.trim() ? detectFormat(textarea.value) : null;
      const label = this.element.querySelector(".sbi-detected");
      if ( label ) label.textContent = this.state.detection ? `${this.state.detection.format} / ${this.state.contentKind || this.state.detection.contentKind} (${Math.round(this.state.detection.confidence * 100)}%)` : "";
    }, 300));
  }

  static async #onParse() {
    this.#currentForm();
    const s = this.state;
    s.error = null;
    try {
      const text = acceptText(s.text);
      const detection = detectFormat(text, { filename: s.filename });
      const allowed = checkFormatAllowed(detection.format);
      if ( !allowed.allowed ) throw new InputError(game.i18n.format("SBI.Import.FormatNotAllowed", { format: detection.format }) + ` (${allowed.reason})`);
      s.busy = true; this.render();
      s.bundle = runPipeline(text, { filename: s.filename, contentKind: s.contentKind || undefined });
      s.prepared = await prepareImport(s.bundle, { macros: s.macros, automation: s.automation });
      s.report = null;
      this.tabGroups.primary = "preview";
    } catch (err) { this.#error(err); }
    s.busy = false;
    this.render();
  }

  static async #onImport() {
    this.#currentForm();
    const s = this.state;
    if ( !s.bundle?.entries?.length ) { ui.notifications.warn(game.i18n.localize("SBI.Import.NothingToImport")); return; }
    s.error = null; s.busy = true; this.render();
    try {
      const destination = { type: s.destination, actor: s.destination === DESTINATION.ACTOR ? game.actors.get(s.actorId) : null, folderName: s.folderName || null };
      const review = s.bundle.entries.flatMap(e => (e.kind === "actor" ? e.items : [e]).flatMap(i => i.mechanics ?? [])).filter(m => m.reviewRequired && !m.reviewed);
      if ( review.length ) { ui.notifications.warn(game.i18n.localize("SBI.Import.ReviewRequired")); s.busy = false; this.tabGroups.primary = "preview"; this.render(); return; }
      const report = await importBundle(s.bundle, { destination, duplicatePolicy: s.duplicatePolicy, automation: s.automation, macros: s.macros, acknowledgeReview: true, resolutions: s.resolutions, progress: (step) => diagnostics.debug(`import step ${step}`) });
      s.report = report;
      if ( report.status === "duplicates" ) { ui.notifications.info("Duplicates found; choose how to handle them in the Preview tab."); s.prepared = await prepareImport(s.bundle, { macros: s.macros, automation: s.automation }); for ( const c of report.conflicts ) { const p = s.prepared.entries.find(e => e.entry.id === c.entryId); if ( p ) p.duplicate = { matches: c.matches, policy: null }; } this.tabGroups.primary = "preview"; }
      else if ( report.status === "complete" ) { ui.notifications.info(game.i18n.localize("SBI.Import.Done")); this.tabGroups.primary = "report"; }
      else { ui.notifications.error(`${game.i18n.localize("SBI.Import.Failed")}: ${report.errors.join("; ")}`); this.tabGroups.primary = "report"; }
    } catch (err) { this.#error(err); }
    s.busy = false;
    this.render();
  }

  static #onToggleMechanic(event, target) {
    const id = target.dataset.mechanic;
    for ( const m of this.#allMechanics() ) if ( m.id === id ) m.enabled = !m.enabled;
    this.render();
  }

  static #onReviewMechanic(event, target) {
    const id = target.dataset.mechanic;
    const decision = target.dataset.decision;
    for ( const m of this.#allMechanics() ) {
      if ( m.id !== id ) continue;
      m.reviewed = true;
      if ( decision === "disable" ) m.enabled = false;
    }
    this.render();
  }

  static #onResolveDuplicate(event, target) {
    this.state.resolutions[target.dataset.entry] = target.dataset.policy;
    const p = this.state.prepared?.entries?.find(e => e.entry.id === target.dataset.entry);
    if ( p?.duplicate ) p.duplicate.policy = target.dataset.policy;
    this.render();
  }

  static #onClear() {
    Object.assign(this.state, { text: "", filename: null, detection: null, bundle: null, prepared: null, report: null, error: null, resolutions: {} });
    this.tabGroups.primary = "source";
    this.render();
  }

  static async #onOpenDoc(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet?.render(true);
  }

  static async #onCopyDiagnostics() {
    const text = JSON.stringify({ report: this.state.report, compatibility: compatibility.report, diagnostics: diagnostics.entries.slice(-100) }, null, 2);
    try { await navigator.clipboard.writeText(text); ui.notifications.info("Diagnostics copied to clipboard."); } catch { console.log(text); }
  }

  #allMechanics() {
    const out = [];
    for ( const e of this.state.bundle?.entries ?? [] ) for ( const i of (e.kind === "actor" ? e.items : [e]) ) out.push(...(i.mechanics ?? []));
    return out;
  }

  #error(err) {
    this.state.error = err?.message ?? String(err);
    diagnostics.error("Importer error", err);
    ui.notifications.error(this.state.error);
  }
}
