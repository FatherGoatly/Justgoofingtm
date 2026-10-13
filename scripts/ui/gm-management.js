/**
 * GM management application: adjust, set and reset resources, manage definitions, inspect history and diagnostics.
 */

import { MODULE_ID, POOL_LIST, POOLS, MAX_PER_POOL, ABILITY_MODES, APPROVAL_STATES } from "../constants.js";
import { resourceManager, HOOKS } from "../resource-manager.js";
import { defineAbility, clearAbility, setApproval } from "../ability-manager.js";
import { diagnostics } from "../diagnostics.js";
import { getSetting, SETTINGS } from "../settings.js";
import { isDefined } from "../ability-schema.js";
import { notifyError } from "../notification-service.js";
import { ActionPanel } from "./action-panel.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

export class GMManagement extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.tab = "actors";
    this.includeNPCs = false;
    this.#hookIds = [];
  }

  #hookIds;

  static DEFAULT_OPTIONS = {
    id: "hva-gm-management",
    classes: ["hva", "hva-gm"],
    window: { title: "HVA.GM.Title", icon: "fa-solid fa-crown", resizable: true },
    position: { width: 860, height: 640 },
    actions: {
      tab: GMManagement.#onTab,
      adjust: GMManagement.#onAdjust,
      set: GMManagement.#onSet,
      reset: GMManagement.#onReset,
      define: GMManagement.#onDefine,
      clear: GMManagement.#onClear,
      approve: GMManagement.#onApprove,
      reject: GMManagement.#onReject,
      openPanel: GMManagement.#onOpenPanel,
      toggleNPCs: GMManagement.#onToggleNPCs,
      clearDiagnostics: GMManagement.#onClearDiagnostics,
      refresh: GMManagement.#onRefresh
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/gm-management.hbs`, scrollable: [".hva-scroll"] }
  };

  get title() {
    return loc("HVA.GM.Title");
  }

  async _prepareContext() {
    const actors = game.actors.filter(a => (a.type === "character") || (this.includeNPCs && (a.type === "npc")))
      .sort((a, b) => a.name.localeCompare(b.name));
    const rows = actors.map(actor => {
      const data = resourceManager.getData(actor);
      return {
        uuid: actor.uuid, name: actor.name, img: actor.img, type: actor.type,
        owners: game.users.filter(u => !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.name).join(", "),
        pools: POOL_LIST.map(pool => {
          const ability = data.abilities[pool];
          const defined = isDefined(ability);
          return {
            pool, count: data.resources[pool].value, max: MAX_PER_POOL,
            label: loc(pool === POOLS.HEROIC ? "HVA.Pool.Heroic" : "HVA.Pool.Villainous"),
            icon: pool === POOLS.HEROIC ? "fa-solid fa-sun" : "fa-solid fa-skull",
            ability, defined,
            approval: ability?.approval?.status ?? null,
            approvalLabel: ability?.approval?.status ? loc(`HVA.Approval.State.${ability.approval.status}`) : null,
            needsApproval: defined && (ability.mode === ABILITY_MODES.AUTOMATED)
              && (ability.approval?.status !== APPROVAL_STATES.APPROVED),
            isApproved: defined && (ability.approval?.status === APPROVAL_STATES.APPROVED)
          };
        }),
        lastHistory: data.history[0] ? `${loc(`HVA.History.${data.history[0].kind}`)} (${new Date(data.history[0].at).toLocaleString()})` : "—"
      };
    });
    const entries = diagnostics.recent(60).map(e => ({
      ...e,
      time: new Date(e.timestamp).toLocaleTimeString(),
      statusLabel: loc(`HVA.Diag.${e.status ?? "unknown"}`),
      categoryLabel: e.category ? loc(`HVA.Category.${e.category}.Name`) : "—",
      naturals: e.classification?.naturals?.join(", ") ?? "",
      reason: e.classification?.reason ?? "",
      json: JSON.stringify(e)
    }));
    return {
      tab: this.tab, rows, entries, includeNPCs: this.includeNPCs,
      overrideAllowed: getSetting(SETTINGS.ALLOW_ADMIN_OVERRIDE) === true,
      diagnosticsEnabled: diagnostics.enabled,
      max: MAX_PER_POOL
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const rerender = () => this.render();
    this.#hookIds.push([HOOKS.RESOURCE_CHANGED, Hooks.on(HOOKS.RESOURCE_CHANGED, rerender)]);
    this.#hookIds.push([HOOKS.ABILITY_CHANGED, Hooks.on(HOOKS.ABILITY_CHANGED, rerender)]);
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
    this.render();
  }

  static #onTab(_event, target) {
    this.tab = target.dataset.tab;
    this.render();
  }

  static async #onAdjust(_event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    const delta = Number(target.dataset.delta);
    await this.#run(() => resourceManager.adjust(actor, target.dataset.pool, { delta, note: "gm-adjust" }));
  }

  static async #onSet(_event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    const input = this.element.querySelector(`input[data-set-for="${target.dataset.uuid}:${target.dataset.pool}"]`);
    const value = Number(input?.value);
    if ( !Number.isFinite(value) ) return;
    const override = (value > MAX_PER_POOL) && (getSetting(SETTINGS.ALLOW_ADMIN_OVERRIDE) === true);
    await this.#run(() => resourceManager.adjust(actor, target.dataset.pool, { value, override, note: "gm-set" }));
  }

  static async #onReset(_event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    await this.#run(() => resourceManager.reset(actor, { note: "gm-reset" }));
  }

  static async #onDefine(_event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    await this.#run(() => defineAbility(actor, target.dataset.pool));
  }

  static async #onClear(_event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: loc("HVA.Panel.ClearTitle") }, content: `<p>${loc("HVA.Panel.ClearConfirm")}</p>`, rejectClose: false
    });
    if ( !confirmed ) return;
    await this.#run(() => clearAbility(actor, target.dataset.pool));
  }

  static async #onApprove(_event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    await this.#run(() => setApproval(actor, target.dataset.pool, true));
  }

  static async #onReject(_event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    await this.#run(() => setApproval(actor, target.dataset.pool, false));
  }

  static async #onOpenPanel(_event, target) {
    const actor = await fromUuid(target.dataset.uuid);
    ActionPanel.open(actor);
  }

  static #onToggleNPCs() {
    this.includeNPCs = !this.includeNPCs;
    this.render();
  }

  static #onClearDiagnostics() {
    diagnostics.clear();
    this.render();
  }

  static #onRefresh() {
    this.render();
  }
}
