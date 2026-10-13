/**
 * Executes ability definitions with trusted, module-owned code only. Player-defined data never becomes code:
 * each mechanic is a validated record interpreted by a fixed handler.
 */

import { MECHANIC_TYPES, MODULE_ID, SOCKET_ACTIONS, TEMPLATE_TYPES } from "./constants.js";
import { diagnostics } from "./diagnostics.js";

const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

/**
 * Describe targets currently selected by the user (for display and for targeted mechanics).
 * @returns {{token: TokenDocument, actor: Actor, name: string}[]}
 */
export function currentTargets() {
  const out = [];
  for ( const token of game.user?.targets ?? [] ) {
    const doc = token.document ?? token;
    if ( !doc?.actor ) continue;
    out.push({ token: doc, actor: doc.actor, name: doc.name });
  }
  return out;
}

async function evaluateFormula(formula, actor) {
  const roll = new Roll(String(formula), actor?.getRollData?.() ?? {});
  await roll.evaluate();
  return roll;
}

/** Apply a change to a target, locally when permitted, otherwise via the GM socket. */
async function applyToTarget(target, payload) {
  if ( target.actor.isOwner ) return applyLocally(target.actor, payload);
  if ( game.users.activeGM && (game.users.activeGM !== game.user) ) {
    game.socket.emit(`module.${MODULE_ID}`, {
      action: SOCKET_ACTIONS.APPLY_TO_TARGET, actorUuid: target.actor.uuid, payload, userId: game.user.id
    });
    return { delegated: true };
  }
  return { delegated: false, skipped: true };
}

/**
 * Apply a validated payload to an actor. Also used by the GM socket handler.
 * @param {Actor} actor
 * @param {object} payload  { kind: "heal"|"tempHp"|"applyCondition"|"removeCondition", amount?, status?, rounds? }
 */
export async function applyLocally(actor, payload) {
  switch ( payload.kind ) {
    case "heal":
      await actor.applyDamage([{ value: Number(payload.amount), type: "healing" }]);
      return { applied: true };
    case "tempHp":
      await actor.applyTempHP(Number(payload.amount));
      return { applied: true };
    case "applyCondition": {
      if ( !CONFIG.statusEffects.find(s => s.id === payload.status) ) return { applied: false };
      const effect = await actor.toggleStatusEffect(payload.status, { active: true });
      if ( payload.rounds && effect?.update ) await effect.update({ "duration.rounds": payload.rounds });
      return { applied: true };
    }
    case "removeCondition":
      if ( !CONFIG.statusEffects.find(s => s.id === payload.status) ) return { applied: false };
      await actor.toggleStatusEffect(payload.status, { active: false });
      return { applied: true };
    default:
      return { applied: false };
  }
}

/* -------------------------------------------- */
/*  Mechanic handlers                           */
/* -------------------------------------------- */

const HANDLERS = {
  async [MECHANIC_TYPES.DAMAGE](mechanic) {
    const type = mechanic.damageType ? ` type=${mechanic.damageType}` : "";
    return { summary: mechanic.label || loc("HVA.Mechanic.damage"), enricher: `[[/damage ${mechanic.formula}${type}]]` };
  },

  async [MECHANIC_TYPES.HEAL](mechanic, ctx) {
    const roll = await evaluateFormula(mechanic.formula, ctx.actor);
    const applied = [];
    for ( const target of ctx.targets ) {
      const res = await applyToTarget(target, { kind: "heal", amount: roll.total });
      applied.push({ name: target.name, ...res });
    }
    return {
      summary: mechanic.label || loc("HVA.Mechanic.heal"), roll, total: roll.total, applied,
      enricher: ctx.targets.length ? null : `[[/heal ${mechanic.formula}]]`
    };
  },

  async [MECHANIC_TYPES.TEMP_HP](mechanic, ctx) {
    const roll = await evaluateFormula(mechanic.formula, ctx.actor);
    const targets = ctx.targets.length ? ctx.targets : [{ actor: ctx.actor, name: ctx.actor.name }];
    const applied = [];
    for ( const target of targets ) {
      const res = await applyToTarget(target, { kind: "tempHp", amount: roll.total });
      applied.push({ name: target.name, ...res });
    }
    return { summary: mechanic.label || loc("HVA.Mechanic.tempHp"), roll, total: roll.total, applied };
  },

  async [MECHANIC_TYPES.SAVE](mechanic) {
    const dc = mechanic.dc ? ` dc=${mechanic.dc}` : "";
    return { summary: mechanic.label || loc("HVA.Mechanic.save"), enricher: `[[/save ability=${mechanic.ability}${dc}]]` };
  },

  async [MECHANIC_TYPES.CHECK](mechanic) {
    const skill = mechanic.skill ? ` skill=${mechanic.skill}` : "";
    const dc = mechanic.dc ? ` dc=${mechanic.dc}` : "";
    return {
      summary: mechanic.label || loc("HVA.Mechanic.check"),
      enricher: `[[/check ability=${mechanic.ability}${skill}${dc}]]`
    };
  },

  async [MECHANIC_TYPES.APPLY_CONDITION](mechanic, ctx) {
    const targets = ctx.targets.length ? ctx.targets : [{ actor: ctx.actor, name: ctx.actor.name }];
    const applied = [];
    for ( const target of targets ) {
      const res = await applyToTarget(target, { kind: "applyCondition", status: mechanic.status, rounds: mechanic.rounds });
      applied.push({ name: target.name, ...res });
    }
    const status = CONFIG.statusEffects.find(s => s.id === mechanic.status);
    return { summary: mechanic.label || loc("HVA.Mechanic.applyCondition", { status: loc(status?.name ?? mechanic.status) }), applied };
  },

  async [MECHANIC_TYPES.REMOVE_CONDITION](mechanic, ctx) {
    const targets = ctx.targets.length ? ctx.targets : [{ actor: ctx.actor, name: ctx.actor.name }];
    const applied = [];
    for ( const target of targets ) {
      const res = await applyToTarget(target, { kind: "removeCondition", status: mechanic.status });
      applied.push({ name: target.name, ...res });
    }
    const status = CONFIG.statusEffects.find(s => s.id === mechanic.status);
    return { summary: mechanic.label || loc("HVA.Mechanic.removeCondition", { status: loc(status?.name ?? mechanic.status) }), applied };
  },

  async [MECHANIC_TYPES.TEMPLATE](mechanic, ctx) {
    if ( !canvas?.scene || !TEMPLATE_TYPES.includes(mechanic.shape) ) return { summary: loc("HVA.Mechanic.template"), skipped: true };
    const token = ctx.actor.getActiveTokens?.(true, true)?.[0] ?? null;
    const grid = canvas.scene.grid;
    const x = token ? token.x + (token.width * grid.size) / 2 : canvas.dimensions.width / 2;
    const y = token ? token.y + (token.height * grid.size) / 2 : canvas.dimensions.height / 2;
    const data = {
      t: mechanic.shape, x, y, distance: mechanic.distance, direction: 0,
      angle: mechanic.shape === "cone" ? (CONFIG.MeasuredTemplate?.defaults?.angle ?? 53.13) : 0,
      width: mechanic.shape === "ray" ? Math.max(grid.distance, 5) : 0,
      author: game.user.id,
      flags: { [MODULE_ID]: { ability: true } }
    };
    const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
    return { summary: mechanic.label || loc("HVA.Mechanic.template"), templateId: doc?.id ?? null };
  },

  async [MECHANIC_TYPES.PROMPT](mechanic) {
    const { DialogV2 } = foundry.applications.api;
    const buttons = mechanic.options.map((option, i) => ({ action: `opt${i}`, label: option, callback: () => option }));
    const choice = await DialogV2.wait({
      window: { title: mechanic.title || mechanic.label || loc("HVA.Mechanic.prompt") },
      content: `<p>${foundry.utils.escapeHTML(mechanic.title || "")}</p>`,
      buttons, rejectClose: false
    });
    if ( !choice ) throw new Error(loc("HVA.Errors.PromptCancelled"));
    return { summary: mechanic.label || loc("HVA.Mechanic.prompt"), choice };
  },

  async [MECHANIC_TYPES.NOTE](mechanic) {
    return { summary: mechanic.label || loc("HVA.Mechanic.note"), text: mechanic.text };
  }
};

/**
 * Execute an automated ability. Throws if any mechanic fails, so the caller can refund.
 * @param {object} params
 * @param {Actor} params.actor
 * @param {object} params.ability
 * @returns {Promise<object[]>}  One result per mechanic.
 */
export async function executeAbility({ actor, ability }) {
  const ctx = { actor, ability, targets: currentTargets() };
  const results = [];
  for ( const mechanic of ability.mechanics ?? [] ) {
    const handler = HANDLERS[mechanic.type];
    if ( !handler ) throw new Error(loc("HVA.Errors.UnsupportedMechanic", { type: mechanic.type }));
    const result = await handler(mechanic, ctx);
    results.push({ type: mechanic.type, ...result });
  }
  diagnostics.log("Executed ability", ability.name, results);
  return results;
}

/**
 * Build a human-readable preview of an ability's mechanics (for review dialogs). Pure formatting.
 * @param {object} ability
 * @returns {string[]}
 */
export function describeMechanics(ability) {
  return (ability?.mechanics ?? []).map(m => {
    switch ( m.type ) {
      case MECHANIC_TYPES.DAMAGE: return loc("HVA.MechanicPreview.damage", { formula: m.formula, type: m.damageType || "—" });
      case MECHANIC_TYPES.HEAL: return loc("HVA.MechanicPreview.heal", { formula: m.formula });
      case MECHANIC_TYPES.TEMP_HP: return loc("HVA.MechanicPreview.tempHp", { formula: m.formula });
      case MECHANIC_TYPES.SAVE: return loc("HVA.MechanicPreview.save", { ability: m.ability, dc: m.dc ?? "—" });
      case MECHANIC_TYPES.CHECK: return loc("HVA.MechanicPreview.check", { ability: m.ability, skill: m.skill || "—", dc: m.dc ?? "—" });
      case MECHANIC_TYPES.APPLY_CONDITION: return loc("HVA.MechanicPreview.applyCondition", { status: m.status, rounds: m.rounds ?? "—" });
      case MECHANIC_TYPES.REMOVE_CONDITION: return loc("HVA.MechanicPreview.removeCondition", { status: m.status });
      case MECHANIC_TYPES.TEMPLATE: return loc("HVA.MechanicPreview.template", { shape: m.shape, distance: m.distance });
      case MECHANIC_TYPES.PROMPT: return loc("HVA.MechanicPreview.prompt", { options: m.options.join(" / ") });
      case MECHANIC_TYPES.NOTE: return loc("HVA.MechanicPreview.note", { text: m.text });
      default: return m.type;
    }
  });
}
