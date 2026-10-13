import diagnostics from "../core/diagnostics.js";
import { FLAG_SCOPE, FLAGS, MECHANIC_CATEGORY } from "../core/constants.js";
import { getSetting, SETTINGS } from "../core/settings.js";
import { mechanicRegistry } from "../rules/mechanic-registry.js";
import { validateFormula } from "../rules/formula-validator.js";
import { effectService } from "./effect-service.js";
import { CREATURE_TYPES } from "../core/dnd5e-reference.js";

/**
 * Automation runtime.
 *
 * Executes module-managed and interactive mechanics with a single authoritative implementation per
 * operation, strict ownership rules (see docs/automation.md) and duplicate guards.
 *
 * Module-managed handlers currently implemented:
 *  - damage.bonus-on-hit (conditional): adds a damage roll part when the targeted creature matches
 *    the condition. Owned by Midi-QOL's damageBonus pass when Midi is active, otherwise by the
 *    dnd5e.preRollDamageV2 hook. Never both.
 *  - resource.destroy-on-last-charge: after dnd5e consumes the last charge, roll the stated die and
 *    report; destruction is offered to the owner, never automatic.
 *  - teleport (interactive): owner picks a destination; the runtime validates range and moves the
 *    token through the token document update (permission enforced by the server).
 */
class Runtime {
  #ready = false;

  #compatibility = null;

  #triggers = null;

  /** Guards against double application within a single roll/workflow. */
  #applied = new Set();

  integrations = {
    midiDamageBonus: (args) => this.#midiDamageBonus(args),
    midiOnUse: (args) => this.#midiOnUse(args)
  };

  get isReady() { return this.#ready; }

  get compatibility() { return this.#compatibility; }

  /** Does Midi-QOL own the attack/damage workflow? */
  get midiOwnsWorkflow() { return Boolean(this.#compatibility?.hasCapability?.("midi.workflow")); }

  ready({ compatibility, triggerRegistry }) {
    this.#compatibility = compatibility;
    this.#triggers = triggerRegistry;
    this.#registerHandlers();
    if ( triggerRegistry && !triggerRegistry.active ) triggerRegistry.activate(compatibility);
    this.#indexWorld();
    this.#ready = true;
  }

  /** Register the module's hook-driven handlers (idempotent). */
  #registerHandlers() {
    const t = this.#triggers;
    if ( !t ) return;
    t.register(`${FLAG_SCOPE}.hit-damage`, "hit", (payload) => this.#onPreRollDamage(payload));
    t.register(`${FLAG_SCOPE}.last-charge`, "resource.consumed", (payload) => this.#onPostConsumption(payload));
    t.register(`${FLAG_SCOPE}.item-index`, "use", () => undefined);
  }

  /** Index mechanics stored on world/actor items so lookups are O(1) at event time. */
  #indexWorld() {
    mechanicRegistry.reset();
    const items = [...(globalThis.game?.items ?? [])];
    for ( const actor of globalThis.game?.actors ?? [] ) items.push(...(actor.items ?? []));
    for ( const item of items ) this.indexItem(item);
    diagnostics.debug(`Indexed ${mechanicRegistry.size} mechanics`);
  }

  indexItem(item) {
    const specs = item?.getFlag?.(FLAG_SCOPE, FLAGS.MECHANICS);
    if ( Array.isArray(specs) && specs.length ) mechanicRegistry.register(item.uuid, specs.map(s => mechanicRegistry.normalize(s)));
  }

  /** Mechanics of an item document, read from flags (source of truth). */
  mechanicsOf(item) {
    const specs = item?.getFlag?.(FLAG_SCOPE, FLAGS.MECHANICS) ?? item?.flags?.[FLAG_SCOPE]?.[FLAGS.MECHANICS] ?? [];
    return Array.isArray(specs) ? specs : [];
  }

  automationEnabled(item) {
    if ( getSetting(SETTINGS.AUTOMATION_ENABLED) === false ) return false;
    if ( effectService.isDisabled(item) ) return false;
    if ( item?.actor && effectService.isDisabled(item.actor) ) return false;
    return true;
  }

  /* -------------------------------------------- */
  /*  Conditional on-hit damage                   */
  /* -------------------------------------------- */

  /**
   * Evaluate which conditional on-hit mechanics apply for an activity against a set of target actors.
   * Pure: returns [{ spec, formula, type }].
   */
  conditionalHitDamage(item, targets=[]) {
    const out = [];
    for ( const spec of this.mechanicsOf(item) ) {
      if ( spec.kind !== "damage.bonus-on-hit" || spec.enabled === false ) continue;
      if ( !["module", "midi-qol"].includes(spec.implementation?.owner) ) continue;
      const filter = spec.target?.filter;
      if ( !filter ) continue;
      const v = validateFormula(spec.effect?.formula ?? "");
      if ( !v.valid || v.formula === "" ) { diagnostics.warn(`Mechanic ${spec.id} has an invalid formula`); continue; }
      const matching = targets.filter(a => this.matchesFilter(a, filter));
      if ( !matching.length ) continue;
      out.push({ spec, formula: v.formula, type: spec.effect.damageType, targets: matching });
    }
    return out;
  }

  /** Does an actor match a mechanic target filter? */
  matchesFilter(actor, filter) {
    if ( !actor || !filter ) return false;
    if ( filter.creatureType ) {
      const ct = String(filter.creatureType).toLowerCase();
      if ( !CREATURE_TYPES.includes(ct) ) return false;
      const type = actor.system?.details?.type;
      const value = (type?.value ?? "").toLowerCase();
      const custom = (type?.custom ?? "").toLowerCase();
      const race = (actor.system?.details?.race?.system?.type?.value ?? "").toLowerCase();
      return value === ct || custom.includes(ct) || race === ct;
    }
    return false;
  }

  /** dnd5e.preRollDamageV2 (config, dialog, message). Only used when Midi-QOL is not active. */
  #onPreRollDamage({ hookName, args }) {
    if ( hookName !== "dnd5e.preRollDamageV2" ) return;
    if ( this.midiOwnsWorkflow ) return; // Midi path owns conditional damage.
    const [config] = args;
    const activity = config?.subject;
    const item = activity?.item;
    if ( !item || !this.automationEnabled(item) ) return;
    const targets = [...(globalThis.game?.user?.targets ?? [])].map(t => t.actor).filter(Boolean);
    const extras = this.conditionalHitDamage(item, targets);
    if ( !extras.length ) return;
    const key = `${item.uuid}:${activity.id}:${config.event?.timeStamp ?? Date.now()}`;
    if ( this.#applied.has(key) ) return;
    this.#applied.add(key);
    setTimeout(() => this.#applied.delete(key), 5000);
    config.rolls ??= [];
    for ( const extra of extras ) {
      if ( extra.targets.length !== targets.length ) {
        diagnostics.info(`Conditional damage (${extra.spec.label}) applies to ${extra.targets.length} of ${targets.length} targets; added as a separate roll so it can be applied selectively.`);
      }
      config.rolls.push({ parts: [extra.formula], options: { type: extra.type, flavor: extra.spec.label, properties: ["mgc"] } });
    }
  }

  /** Midi-QOL `[damageBonus]function.StatBlockImporter.midi.damageBonus` */
  #midiDamageBonus(args) {
    const scope = args ?? {};
    const item = scope.rolledItem ?? scope.item ?? null;
    const workflow = scope.workflow;
    const doc = item?.uuid ? (globalThis.fromUuidSync?.(item.uuid) ?? item) : item;
    if ( !doc || !this.automationEnabled(doc) ) return [];
    const hit = [...(workflow?.hitTargets ?? [])].map(t => t.actor ?? t.document?.actor).filter(Boolean);
    const extras = this.conditionalHitDamage(doc, hit);
    return extras.map(e => ({ damageRoll: e.formula, damageType: e.type, flavor: e.spec.label }));
  }

  #midiOnUse(args) {
    // Reserved for future on-use passes; intentionally a no-op that never evaluates imported text.
    return undefined;
  }

  /* -------------------------------------------- */
  /*  Last-charge destruction                     */
  /* -------------------------------------------- */

  async #onPostConsumption({ hookName, args }) {
    if ( hookName !== "dnd5e.postActivityConsumption" ) return;
    const [activity, , , updates] = args;
    const item = activity?.item;
    if ( !item || !this.automationEnabled(item) ) return;
    const spec = this.mechanicsOf(item).find(m => m.kind === "resource.destroy-on-last-charge" && m.enabled !== false && m.implementation?.owner === "module");
    if ( !spec ) return;
    const newSpent = foundry.utils.getProperty(updates?.item?.find?.(u => u._id === item.id) ?? {}, "system.uses.spent");
    const max = Number(item.system?.uses?.max) || 0;
    if ( !max || newSpent === undefined || newSpent < max ) return;
    const key = `${item.uuid}:lastcharge:${newSpent}`;
    if ( this.#applied.has(key) ) return;
    this.#applied.add(key);
    setTimeout(() => this.#applied.delete(key), 10000);
    await this.rollLastCharge(item, spec);
  }

  async rollLastCharge(item, spec) {
    const die = Number(spec.effect?.die) || 20;
    const min = Number(spec.effect?.min) || 1;
    const max = Number(spec.effect?.max) || min;
    const RollCls = globalThis.Roll;
    if ( !RollCls ) return null;
    const roll = await new RollCls(`1d${die}`).evaluate();
    const destroyed = roll.total >= min && roll.total <= max;
    await roll.toMessage({ flavor: `${item.name}: last charge expended (destroyed on ${min === max ? min : `${min}-${max}`}) — ${destroyed ? "DESTROYED" : "survives"}`, speaker: globalThis.ChatMessage?.getSpeaker?.({ actor: item.actor }) });
    if ( destroyed && item.isOwner ) {
      const confirm = await globalThis.foundry?.applications?.api?.DialogV2?.confirm?.({ window: { title: item.name }, content: `<p>${item.name} crumbles away. Delete it?</p>` });
      if ( confirm ) await item.delete();
    }
    return { roll, destroyed };
  }

  /* -------------------------------------------- */
  /*  Interactive mechanics (macro entry point)   */
  /* -------------------------------------------- */

  /**
   * Entry point for generated macros. Validates the mechanic, the caller's ownership of the item,
   * and dispatches to the interactive handler.
   */
  async executeInteractive(mechanicId, context={}) {
    const entry = mechanicRegistry.get(mechanicId);
    let item = context.itemUuid ? await globalThis.fromUuid?.(context.itemUuid) : null;
    const spec = entry?.spec ?? (item ? this.mechanicsOf(item).find(m => m.id === mechanicId) : null);
    if ( !spec ) { globalThis.ui?.notifications?.warn("Mechanic not found; re-import the item to regenerate it."); return null; }
    item ??= entry?.itemUuid ? await globalThis.fromUuid?.(entry.itemUuid) : null;
    if ( !item ) { globalThis.ui?.notifications?.warn("The item for this macro no longer exists."); return null; }
    if ( !item.isOwner ) { globalThis.ui?.notifications?.error("You do not own this item."); return null; }
    if ( !this.automationEnabled(item) ) { globalThis.ui?.notifications?.info("Automation is disabled for this item."); return null; }
    if ( spec.category === MECHANIC_CATEGORY.UNRESOLVED || spec.enabled === false ) { globalThis.ui?.notifications?.info(`${spec.label}: this mechanic is not automated.`); return null; }
    switch ( spec.kind ) {
      case "teleport": return this.#teleport(item, spec, context);
      default:
        globalThis.ui?.notifications?.info(`${spec.label}: no interactive handler; see the item description.`);
        return null;
    }
  }

  async #teleport(item, spec, context) {
    const token = context.token ?? item.actor?.getActiveTokens?.()?.[0] ?? null;
    if ( !token ) { globalThis.ui?.notifications?.warn("No token to teleport."); return null; }
    if ( !token.document?.isOwner ) { globalThis.ui?.notifications?.error("You do not control this token."); return null; }
    const range = Number(spec.effect?.range) || null;
    const canvasRef = globalThis.canvas;
    if ( !canvasRef?.ready ) return null;
    globalThis.ui?.notifications?.info(`Click the destination${range ? ` (within ${range} ft.)` : ""}.`);
    const destination = await new Promise(resolve => {
      const handler = (event) => {
        canvasRef.stage.off("pointerdown", handler);
        const pos = event.getLocalPosition(canvasRef.stage);
        resolve({ x: pos.x, y: pos.y });
      };
      canvasRef.stage.on("pointerdown", handler);
    });
    if ( range ) {
      const dist = canvasRef.grid.measurePath([token.center, destination]).distance;
      if ( dist > range ) { globalThis.ui?.notifications?.warn(`Destination is ${dist} ft. away; limit is ${range} ft.`); return null; }
    }
    const snapped = canvasRef.grid.getSnappedPoint(destination, { mode: 1 });
    await token.document.update({ x: snapped.x - token.w / 2, y: snapped.y - token.h / 2 }, { animate: false, teleport: true });
    return { x: snapped.x, y: snapped.y };
  }

  /* -------------------------------------------- */
  /*  Verification                                */
  /* -------------------------------------------- */

  /**
   * Verify that a created Item carries its mechanics in a way the runtime can execute. Used by the
   * importer's verification stage and the report. Pure given document data.
   * @param {object} itemData  Created item data (or document).
   * @returns {{ok: boolean, results: object[]}}
   */
  verifyItem(itemData) {
    const results = [];
    const specs = this.mechanicsOf(itemData);
    const activities = itemData.system?.activities ?? {};
    const acts = Object.values(activities);
    const effectIds = new Set((itemData.effects ?? []).map(e => e._id ?? e.id));
    for ( const spec of specs ) {
      const r = { id: spec.id, kind: spec.kind, label: spec.label, owner: spec.implementation?.owner, ok: false, reason: "" };
      if ( spec.enabled === false ) { r.ok = true; r.reason = "disabled/manual"; results.push(r); continue; }
      switch ( spec.implementation?.owner ) {
        case "native":
          if ( spec.kind === "damage.bonus-on-hit" ) r.ok = acts.some(a => a.type === "attack" && a.damage?.parts?.some(p => p.types?.includes(spec.effect.damageType)));
          else if ( spec.kind.startsWith("resource.") ) r.ok = Boolean(itemData.system?.uses?.max);
          else if ( spec.kind === "condition.on-failed-save" ) r.ok = acts.some(a => a.type === "save" && a.effects?.some(e => effectIds.has(e._id)));
          else if ( spec.kind === "damage.save" ) r.ok = acts.some(a => a.type === "save");
          else if ( spec.kind.startsWith("healing.") ) r.ok = acts.some(a => a.type === "heal");
          else if ( spec.kind === "bonus.attack-damage" ) r.ok = Boolean(itemData.system?.magicalBonus);
          else if ( spec.kind === "bonus.ac" ) r.ok = Boolean(itemData.system?.armor?.magicalBonus);
          else if ( spec.kind === "spell.cast-from-item" ) r.ok = acts.some(a => a.type === "cast" && a.spell?.uuid);
          else r.ok = true;
          break;
        case "native-alt-activity": r.ok = acts.some(a => a._id === spec.effect?.activityId || (a.type === "attack" && a.name)); break;
        case "effect": r.ok = (itemData.effects ?? []).some(e => e.transfer && (e.system?.changes?.length || e.statuses?.length)); break;
        case "midi-qol": r.ok = this.midiOwnsWorkflow && Boolean(spec.target?.filter); if ( !r.ok ) r.reason = "Midi-QOL not active"; break;
        case "module": r.ok = Boolean(spec.target?.filter) || spec.kind === "resource.destroy-on-last-charge"; break;
        case "macro": r.ok = true; r.reason = "requires generated macro"; break;
        default: r.ok = false; r.reason = "no implementation owner";
      }
      results.push(r);
    }
    return { ok: results.every(r => r.ok), results };
  }
}

export const runtime = new Runtime();
export default runtime;
