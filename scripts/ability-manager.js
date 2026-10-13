/**
 * AbilityManager: definition, editing, approval and activation workflows. UI dialogs are injected so the workflow
 * can be unit tested with fakes.
 */

import { ABILITY_MODES, ACTIVATION_POLICIES, APPROVAL_STATES, MODULE_ID } from "./constants.js";
import { isDefined, mechanicsChanged, validateAbilityDefinition } from "./ability-schema.js";
import { ACTIVATION_REASONS, evaluateActivation, nextLegendaryUsage } from "./activation-policy.js";
import { assertPermission, canActivate, canApprove, canDefineAbility, canEditAbility } from "./permission-service.js";
import { getActivationSettings, getSetting, SETTINGS } from "./settings.js";
import { resourceManager } from "./resource-manager.js";
import { executeAbility } from "./ability-executor.js";
import { notifyActivation, notifyError } from "./notification-service.js";
import { requestActivationApproval } from "./socket-service.js";
import { diagnostics } from "./diagnostics.js";

export const ACTIVATION_STATUS = Object.freeze({
  ACTIVATED: "activated",
  CANCELLED: "cancelled",
  DEFINED_ONLY: "definedOnly",
  BLOCKED: "blocked",
  DENIED: "denied",
  FAILED: "failed"
});

const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

/** Runtime validators for structured mechanics, derived from the live dnd5e configuration. */
export function getRuntimeValidators() {
  return {
    validateFormula: formula => Roll.validate(formula),
    damageTypes: Object.keys(CONFIG.DND5E?.damageTypes ?? {}),
    skills: Object.keys(CONFIG.DND5E?.skills ?? {}),
    statuses: (CONFIG.statusEffects ?? []).map(s => s.id)
  };
}

/** Current combat state relevant to an actor. */
export function getCombatState(actor) {
  const combat = game.combat;
  if ( !combat?.started ) return { active: false, isActorTurn: false, round: null, combatId: null };
  const current = combat.combatant;
  const isActorTurn = !!current && (current.actor?.uuid === actor.uuid || current.actorId === actor.id);
  return { active: true, isActorTurn, round: combat.round, combatId: combat.id };
}

/**
 * Dialog providers. Replaced by the UI layer at startup; replaced by fakes in tests.
 * @type {{define: Function, confirm: Function}}
 */
export const dialogs = {
  async define() { throw new Error("Definition dialog not installed"); },
  async confirm() { throw new Error("Confirmation dialog not installed"); }
};

/**
 * Define (or redefine) an ability through the dialog. Returns the stored definition or null when cancelled.
 * @param {Actor} actor
 * @param {string} pool
 * @param {object} [options]
 * @param {User} [options.user]
 */
export async function defineAbility(actor, pool, { user=game.user }={}) {
  const existing = resourceManager.getAbility(actor, pool);
  assertPermission(existing ? canEditAbility(user, actor) : canDefineAbility(user, actor), "CannotEditAbility");
  const raw = await dialogs.define({ actor, pool, existing, runtime: getRuntimeValidators() });
  if ( !raw ) return null;
  const validated = validateAbilityDefinition(raw, {
    runtime: getRuntimeValidators(), defaultCost: Number(getSetting(SETTINGS.DEFAULT_COST) ?? 1)
  });
  if ( !validated.valid ) throw new Error(loc("HVA.Errors.InvalidDefinition", { errors: validated.errors.join(", ") }));
  const definition = validated.value;

  // Approval: automated mechanics need GM approval when required; mechanics changes reset prior approval.
  const requireApproval = getSetting(SETTINGS.REQUIRE_GM_APPROVAL_AUTOMATION) === true;
  if ( user.isGM ) {
    definition.approval = { status: APPROVAL_STATES.APPROVED, by: user.id, at: Date.now() };
  } else if ( definition.mode === ABILITY_MODES.AUTOMATED ) {
    const changed = mechanicsChanged(existing, definition);
    const keep = !changed && (existing?.approval?.status === APPROVAL_STATES.APPROVED);
    definition.approval = keep ? existing.approval : {
      status: requireApproval ? APPROVAL_STATES.PENDING : APPROVAL_STATES.NOT_REQUIRED, by: null, at: null
    };
  } else {
    definition.approval = { status: APPROVAL_STATES.NOT_REQUIRED, by: null, at: null };
  }
  return resourceManager.setAbility(actor, pool, definition, { user, isNew: !existing });
}

/** GM approval or rejection of an ability's automation. */
export async function setApproval(actor, pool, approved, { user=game.user }={}) {
  assertPermission(canApprove(user), "GMOnly");
  const ability = resourceManager.getAbility(actor, pool);
  if ( !isDefined(ability) ) return null;
  const updated = foundry.utils.deepClone(ability);
  updated.approval = {
    status: approved ? APPROVAL_STATES.APPROVED : APPROVAL_STATES.REJECTED, by: user.id, at: Date.now()
  };
  return resourceManager.setAbility(actor, pool, updated, { user });
}

/**
 * Activate an ability, defining it first if needed. Resources are spent only after confirmation and are refunded if
 * automated execution fails.
 * @param {Actor} actor
 * @param {string} pool
 * @param {object} [options]
 * @param {User} [options.user]
 * @returns {Promise<{status: string, reason?: string, ability?: object}>}
 */
export async function activateAbility(actor, pool, { user=game.user }={}) {
  assertPermission(canActivate(user, actor), "CannotActivate");

  // 1. Resource check before anything else.
  let available = resourceManager.getCount(actor, pool);
  if ( available < 1 ) {
    notifyError(loc("HVA.Errors.NoResource", { pool: loc(`HVA.Pool.${pool === "heroic" ? "Heroic" : "Villainous"}`) }));
    return { status: ACTIVATION_STATUS.BLOCKED, reason: ACTIVATION_REASONS.NO_RESOURCE };
  }

  // 2. First use: define the ability. Cancelling never spends a resource.
  let ability = resourceManager.getAbility(actor, pool);
  if ( !isDefined(ability) ) {
    ability = await defineAbility(actor, pool, { user });
    if ( !ability ) return { status: ACTIVATION_STATUS.CANCELLED };
  }

  // 3. Activation economy.
  available = resourceManager.getCount(actor, pool);
  const settings = getActivationSettings();
  const combat = getCombatState(actor);
  const usage = resourceManager.getData(actor).usage.legendary;
  const evaluation = evaluateActivation({ ability, available, settings, combat, usage, isGM: user.isGM });
  if ( !evaluation.allowed ) {
    notifyError(loc(`HVA.ActivationReason.${evaluation.reason}`));
    return { status: ACTIVATION_STATUS.BLOCKED, reason: evaluation.reason, ability };
  }

  // 4. Player review and confirmation (never auto-execute a newly defined ability).
  const cost = Math.max(1, Math.trunc(Number(ability.cost ?? 1)));
  const confirmed = await dialogs.confirm({ actor, pool, ability, cost, remaining: available - cost });
  if ( !confirmed ) return { status: ACTIVATION_STATUS.CANCELLED, ability };

  // 5. GM approval under the GM-controlled policy.
  if ( evaluation.requiresApproval ) {
    const approved = await requestActivationApproval({ actor, pool, ability });
    if ( !approved ) {
      notifyError(loc("HVA.ActivationReason.gmDenied"));
      return { status: ACTIVATION_STATUS.DENIED, ability };
    }
  }

  // 6. Spend, then execute; refund on failure.
  const spend = await resourceManager.spend(actor, pool, cost, { user, source: { ability: ability.name } });
  if ( !spend.ok ) {
    notifyError(loc("HVA.ActivationReason.noResource"));
    return { status: ACTIVATION_STATUS.BLOCKED, reason: spend.reason, ability };
  }

  let results = [];
  if ( ability.mode === ABILITY_MODES.AUTOMATED ) {
    try {
      results = await executeAbility({ actor, ability });
    } catch(err) {
      diagnostics.error("Ability execution failed; refunding", err);
      await resourceManager.refund(actor, pool, cost, { user, source: { ability: ability.name, refund: true } });
      await notifyActivation({ actor, pool, ability, cost, remaining: spend.before, failed: true, error: err.message });
      notifyError(loc("HVA.Errors.ExecutionFailed", { error: err.message }));
      return { status: ACTIVATION_STATUS.FAILED, ability, error: err.message };
    }
  }

  if ( (settings.activationPolicy === ACTIVATION_POLICIES.LEGENDARY) && combat.active && !combat.isActorTurn ) {
    await resourceManager.setLegendaryUsage(actor, nextLegendaryUsage(usage, combat), { user });
  }

  await notifyActivation({ actor, pool, ability, cost, remaining: spend.after, results });
  Hooks.callAll(`${MODULE_ID}.abilityActivated`, actor, { pool, ability, cost, results });
  return { status: ACTIVATION_STATUS.ACTIVATED, ability, results };
}

/** Clear a definition (owner with edit rights, or GM). */
export async function clearAbility(actor, pool, { user=game.user }={}) {
  return resourceManager.clearAbility(actor, pool, { user });
}
