/**
 * Ability definition / editing dialog (ApplicationV2 form with an edit step and a review step).
 */

import { ABILITY_MODES, ACTIVATION_TYPES, MECHANIC_TYPE_LIST, MODULE_ID, POOLS, TEMPLATE_TYPES, TEXT_LIMITS }
  from "../constants.js";
import { validateAbilityDefinition } from "../ability-schema.js";
import { describeMechanics } from "../ability-executor.js";
import { getSetting, SETTINGS } from "../settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

export class AbilityDefinitionDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} options
   * @param {Actor} options.actor
   * @param {string} options.pool
   * @param {object|null} [options.existing]
   * @param {object} [options.runtime]
   * @param {Function} options.resolve
   */
  constructor(options) {
    super(options);
    this.actor = options.actor;
    this.pool = options.pool;
    this.existing = options.existing ?? null;
    this.runtime = options.runtime ?? {};
    this.resolve = options.resolve;
    this.step = "edit";
    this.errors = [];
    this.raw = this.existing ? foundry.utils.deepClone(this.existing) : {
      name: "", description: "", mode: ABILITY_MODES.MANUAL, activation: { type: "action", condition: "" },
      target: "", range: "", duration: "", cost: Number(getSetting(SETTINGS.DEFAULT_COST) ?? 1), mechanics: []
    };
    this.draft = null;
    this.resolved = false;
  }

  static DEFAULT_OPTIONS = {
    id: "hva-define-{id}",
    classes: ["hva", "hva-define"],
    tag: "form",
    window: { title: "HVA.Define.Title", contentClasses: ["standard-form"], resizable: true },
    position: { width: 600 },
    form: { handler: AbilityDefinitionDialog.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: {
      addMechanic: AbilityDefinitionDialog.#onAddMechanic,
      removeMechanic: AbilityDefinitionDialog.#onRemoveMechanic,
      back: AbilityDefinitionDialog.#onBack,
      confirm: AbilityDefinitionDialog.#onConfirm,
      cancel: AbilityDefinitionDialog.#onCancel
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/define-ability.hbs` }
  };

  get title() {
    const key = this.existing ? "HVA.Define.EditTitle" : `HVA.Define.Title.${this.pool}`;
    return loc(key, { actor: this.actor.name });
  }

  /** Open the dialog and resolve with validated raw data or null when cancelled. */
  static async prompt({ actor, pool, existing=null, runtime={} }) {
    return new Promise(resolve => {
      new AbilityDefinitionDialog({ actor, pool, existing, runtime, resolve }).render({ force: true });
    });
  }

  /* -------------------------------------------- */

  async _prepareContext() {
    const isHeroic = this.pool === POOLS.HEROIC;
    const mechanics = (this.raw.mechanics ?? []).map((m, index) => ({ ...m, index }));
    const statuses = (CONFIG.statusEffects ?? []).map(s => ({ value: s.id, label: loc(s.name) }));
    return {
      pool: this.pool, isHeroic,
      poolLabel: loc(isHeroic ? "HVA.Pool.Heroic" : "HVA.Pool.Villainous"),
      prompt: loc(`HVA.Define.Prompt.${this.pool}`),
      examples: loc(`HVA.Define.Examples.${this.pool}`).split("\n").filter(Boolean),
      step: this.step,
      isEdit: !!this.existing,
      raw: this.raw,
      isAutomated: this.raw.mode === ABILITY_MODES.AUTOMATED,
      mechanics,
      errors: this.errors.map(e => loc(`HVA.Validation.${e}`)),
      draft: this.draft,
      previewMechanics: this.draft ? describeMechanics(this.draft) : [],
      limits: TEXT_LIMITS,
      maxCost: 3,
      modes: [
        { value: ABILITY_MODES.MANUAL, label: loc("HVA.Mode.manual") },
        { value: ABILITY_MODES.AUTOMATED, label: loc("HVA.Mode.automated") }
      ],
      activationTypes: ACTIVATION_TYPES.map(t => ({ value: t, label: loc(`HVA.Activation.${t}`) })),
      mechanicTypes: MECHANIC_TYPE_LIST.map(t => ({ value: t, label: loc(`HVA.Mechanic.${t}`) })),
      abilities: Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([k, v]) => ({ value: k, label: v.label })),
      skills: Object.entries(CONFIG.DND5E?.skills ?? {}).map(([k, v]) => ({ value: k, label: v.label })),
      damageTypes: Object.entries(CONFIG.DND5E?.damageTypes ?? {}).map(([k, v]) => ({ value: k, label: v.label })),
      statuses,
      templateTypes: TEMPLATE_TYPES.map(t => ({ value: t, label: t })),
      requireApproval: getSetting(SETTINGS.REQUIRE_GM_APPROVAL_AUTOMATION) === true && !game.user.isGM,
      buttons: this.step === "edit"
        ? [{ type: "submit", icon: "fa-solid fa-magnifying-glass", label: "HVA.Define.Review" },
          { type: "button", action: "cancel", icon: "fa-solid fa-xmark", label: "Cancel" }]
        : [{ type: "button", action: "confirm", icon: "fa-solid fa-check", label: "HVA.Define.Save" },
          { type: "button", action: "back", icon: "fa-solid fa-arrow-left", label: "HVA.Define.Back" },
          { type: "button", action: "cancel", icon: "fa-solid fa-xmark", label: "Cancel" }]
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const mode = this.element.querySelector("select[name='mode']");
    mode?.addEventListener("change", () => {
      this.#capture();
      this.render();
    });
    this.element.querySelectorAll("select[name$='.type']").forEach(select => {
      select.addEventListener("change", () => {
        this.#capture();
        this.render();
      });
    });
  }

  /** Read the current form values into `this.raw` without validation. */
  #capture() {
    const form = this.element;
    if ( !form ) return this.raw;
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
    const mechanics = data.mechanics ? Object.keys(data.mechanics).sort((a, b) => Number(a) - Number(b))
      .map(k => data.mechanics[k]) : [];
    this.raw = { ...this.raw, ...data, mechanics };
    return this.raw;
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const mechanics = data.mechanics ? Object.keys(data.mechanics).sort((a, b) => Number(a) - Number(b))
      .map(k => data.mechanics[k]) : [];
    this.raw = { ...this.raw, ...data, mechanics };
    const result = validateAbilityDefinition(this.raw, {
      runtime: this.runtime, defaultCost: Number(getSetting(SETTINGS.DEFAULT_COST) ?? 1)
    });
    this.errors = result.errors;
    if ( result.valid ) {
      this.draft = result.value;
      this.step = "preview";
    }
    this.render();
  }

  static #onAddMechanic() {
    this.#capture();
    this.raw.mechanics ??= [];
    if ( this.raw.mechanics.length >= 8 ) return;
    this.raw.mechanics.push({ type: "note", text: "" });
    this.render();
  }

  static #onRemoveMechanic(event, target) {
    this.#capture();
    const index = Number(target.dataset.index);
    this.raw.mechanics = (this.raw.mechanics ?? []).filter((_m, i) => i !== index);
    this.render();
  }

  static #onBack() {
    this.step = "edit";
    this.render();
  }

  static #onConfirm() {
    if ( !this.draft ) return;
    this.resolved = true;
    this.resolve(this.draft);
    this.close();
  }

  static #onCancel() {
    this.close();
  }

  async close(options) {
    if ( !this.resolved ) {
      this.resolved = true;
      this.resolve(null);
    }
    return super.close(options);
  }
}
