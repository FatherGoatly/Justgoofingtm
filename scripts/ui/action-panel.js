/**
 * Dedicated action panel: view and spend resources, define and edit abilities, inspect history.
 */

import { MODULE_ID, POOL_LIST, POOLS, MAX_PER_POOL, ABILITY_MODES, APPROVAL_STATES } from "../constants.js";
import { resourceManager, HOOKS } from "../resource-manager.js";
import { activateAbility, defineAbility, clearAbility, setApproval } from "../ability-manager.js";
import { canActivate, canEditAbility, canView, canAdminister, canDefineAbility } from "../permission-service.js";
import { isDefined } from "../ability-schema.js";
import { notifyError } from "../notification-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

export class ActionPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.actorUuid = options.actor?.uuid ?? options.actorUuid ?? null;
    this.followSelection = !this.actorUuid;
    this.showHistory = false;
    this.#hookIds = [];
  }

  #hookIds;

  static DEFAULT_OPTIONS = {
    id: "hva-panel-{id}",
    classes: ["hva", "hva-panel"],
    window: { title: "HVA.Panel.Title", icon: "fa-solid fa-dice-d20", resizable: true },
    position: { width: 620, height: "auto" },
    actions: {
      activate: ActionPanel.#onActivate,
      define: ActionPanel.#onDefine,
      edit: ActionPanel.#onDefine,
      clear: ActionPanel.#onClear,
      approve: ActionPanel.#onApprove,
      reject: ActionPanel.#onReject,
      toggleHistory: ActionPanel.#onToggleHistory,
      openSheet: ActionPanel.#onOpenSheet
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/action-panel.hbs` }
  };

  /** Singleton-per-actor convenience opener. */
  static open(actor=null) {
    const existing = Array.from(foundry.applications.instances?.values() ?? [])
      .find(app => (app instanceof ActionPanel) && (app.actorUuid === (actor?.uuid ?? null)));
    if ( existing ) return existing.render({ force: true });
    return new ActionPanel({ actor }).render({ force: true });
  }

  get actor() {
    if ( this.actorUuid ) return fromUuidSync(this.actorUuid);
    const controlled = canvas?.tokens?.controlled?.[0]?.actor;
    return controlled ?? game.user.character ?? null;
  }

  get title() {
    const actor = this.actor;
    return actor ? loc("HVA.Panel.TitleFor", { actor: actor.name }) : loc("HVA.Panel.Title");
  }

  async _prepareContext() {
    const actor = this.actor;
    if ( !actor || !canView(game.user, actor) ) return { actor: null, noActor: true };
    const data = resourceManager.getData(actor);
    const user = game.user;
    const pools = POOL_LIST.map(pool => {
      const ability = data.abilities[pool];
      const defined = isDefined(ability);
      const count = data.resources[pool].value;
      return {
        pool,
        isHeroic: pool === POOLS.HEROIC,
        label: loc(pool === POOLS.HEROIC ? "HVA.Pool.Heroic" : "HVA.Pool.Villainous"),
        icon: pool === POOLS.HEROIC ? "fa-solid fa-sun" : "fa-solid fa-skull",
        count, max: MAX_PER_POOL,
        pips: Array.from({ length: MAX_PER_POOL }, (_v, i) => ({ filled: i < count })),
        ability, defined,
        descriptionLines: defined ? String(ability.description ?? "").split("\n") : [],
        isManual: !defined || ability.mode !== ABILITY_MODES.AUTOMATED,
        modeLabel: defined ? loc(`HVA.Mode.${ability.mode}`) : null,
        activationLabel: defined ? loc(`HVA.Activation.${ability.activation?.type ?? "action"}`) : null,
        approval: ability?.approval?.status ?? null,
        approvalLabel: ability?.approval?.status ? loc(`HVA.Approval.State.${ability.approval.status}`) : null,
        canActivate: canActivate(user, actor) && (count >= 1),
        canDefine: !defined && canDefineAbility(user, actor),
        canEdit: defined && canEditAbility(user, actor),
        canApprove: defined && canAdminister(user) && (ability.mode === ABILITY_MODES.AUTOMATED)
          && (ability.approval?.status !== APPROVAL_STATES.APPROVED),
        canReject: defined && canAdminister(user) && (ability.approval?.status === APPROVAL_STATES.APPROVED)
      };
    });
    const history = data.history.slice(0, 15).map(h => ({
      ...h,
      kindLabel: loc(`HVA.History.${h.kind}`),
      poolLabel: h.pool ? loc(h.pool === POOLS.HEROIC ? "HVA.Pool.Heroic" : "HVA.Pool.Villainous") : "—",
      time: new Date(h.at).toLocaleTimeString(),
      userName: game.users.get(h.user)?.name ?? "—",
      note: h.source?.category ? loc(`HVA.Category.${h.source.category}.Name`) : (h.source?.ability ?? h.source?.note ?? "")
    }));
    return {
      actor, pools, history, showHistory: this.showHistory, followSelection: this.followSelection,
      img: actor.img, isGM: user.isGM
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const rerender = (doc) => {
      const actor = this.actor;
      if ( !actor ) return;
      if ( (doc?.uuid === actor.uuid) || (doc?.id === actor.id) ) this.render();
    };
    this.#hookIds.push(["updateActor", Hooks.on("updateActor", rerender)]);
    this.#hookIds.push([HOOKS.RESOURCE_CHANGED, Hooks.on(HOOKS.RESOURCE_CHANGED, rerender)]);
    this.#hookIds.push([HOOKS.ABILITY_CHANGED, Hooks.on(HOOKS.ABILITY_CHANGED, rerender)]);
    if ( this.followSelection ) {
      this.#hookIds.push(["controlToken", Hooks.on("controlToken", () => this.render())]);
    }
  }

  async close(options) {
    for ( const [name, id] of this.#hookIds ) Hooks.off(name, id);
    this.#hookIds = [];
    return super.close(options);
  }

  async #run(fn) {
    try {
      await fn();
    } catch(err) {
      notifyError(err.message);
    }
  }

  static async #onActivate(_event, target) {
    const actor = this.actor;
    if ( !actor ) return;
    await this.#run(() => activateAbility(actor, target.dataset.pool));
    this.render();
  }

  static async #onDefine(_event, target) {
    const actor = this.actor;
    if ( !actor ) return;
    await this.#run(() => defineAbility(actor, target.dataset.pool));
    this.render();
  }

  static async #onClear(_event, target) {
    const actor = this.actor;
    if ( !actor ) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: loc("HVA.Panel.ClearTitle") },
      content: `<p>${loc("HVA.Panel.ClearConfirm")}</p>`, rejectClose: false
    });
    if ( !confirmed ) return;
    await this.#run(() => clearAbility(actor, target.dataset.pool));
    this.render();
  }

  static async #onApprove(_event, target) {
    const actor = this.actor;
    if ( !actor ) return;
    await this.#run(() => setApproval(actor, target.dataset.pool, true));
    this.render();
  }

  static async #onReject(_event, target) {
    const actor = this.actor;
    if ( !actor ) return;
    await this.#run(() => setApproval(actor, target.dataset.pool, false));
    this.render();
  }

  static #onToggleHistory() {
    this.showHistory = !this.showHistory;
    this.render();
  }

  static #onOpenSheet() {
    this.actor?.sheet?.render({ force: true });
  }
}
