/**
 * Activation economy rules. Pure functions: the caller gathers combat state and settings.
 */

import { ACTIVATION_POLICIES, APPROVAL_STATES, ABILITY_MODES, OFF_TURN_ACTIVATION_TYPES } from "./constants.js";

export const ACTIVATION_REASONS = Object.freeze({
  OK: "ok",
  NO_RESOURCE: "noResource",
  OUTSIDE_COMBAT: "outsideCombat",
  NOT_YOUR_TURN: "notYourTurn",
  LEGENDARY_LIMIT: "legendaryLimit",
  NEEDS_GM_APPROVAL: "needsGmApproval",
  AUTOMATION_NOT_APPROVED: "automationNotApproved",
  MANUAL_NOT_APPROVED: "manualNotApproved"
});

/**
 * Evaluate whether an ability can be activated right now.
 * @param {object} params
 * @param {object} params.ability
 * @param {number} params.available             Resources currently held in the relevant pool.
 * @param {object} params.settings
 * @param {string} params.settings.activationPolicy
 * @param {boolean} params.settings.allowOutsideCombat
 * @param {boolean} params.settings.requireGMApprovalForAutomation
 * @param {boolean} params.settings.playersCanUseManualWithoutApproval
 * @param {number} params.settings.legendaryUsesPerRound
 * @param {object} [params.combat]             { active, isActorTurn, round, combatId }
 * @param {object} [params.usage]              { combatId, round, count } legendary usage tracker from flags
 * @param {boolean} [params.isGM=false]
 * @returns {{allowed: boolean, reason: string, requiresApproval: boolean}}
 */
export function evaluateActivation({ ability, available, settings, combat={}, usage={}, isGM=false }) {
  const cost = Math.max(1, Math.trunc(Number(ability?.cost ?? 1)));
  if ( !Number.isFinite(available) || (available < cost) ) {
    return { allowed: false, reason: ACTIVATION_REASONS.NO_RESOURCE, requiresApproval: false };
  }

  const inCombat = combat.active === true;
  if ( !inCombat && !settings.allowOutsideCombat && !isGM ) {
    return { allowed: false, reason: ACTIVATION_REASONS.OUTSIDE_COMBAT, requiresApproval: false };
  }

  // Approval of definitions.
  if ( !isGM ) {
    if ( (ability.mode === ABILITY_MODES.AUTOMATED) && settings.requireGMApprovalForAutomation
      && (ability.approval?.status !== APPROVAL_STATES.APPROVED) ) {
      return { allowed: false, reason: ACTIVATION_REASONS.AUTOMATION_NOT_APPROVED, requiresApproval: false };
    }
    if ( (ability.mode === ABILITY_MODES.MANUAL) && !settings.playersCanUseManualWithoutApproval
      && (ability.approval?.status !== APPROVAL_STATES.APPROVED) ) {
      return { allowed: false, reason: ACTIVATION_REASONS.MANUAL_NOT_APPROVED, requiresApproval: false };
    }
  }

  const policy = settings.activationPolicy ?? ACTIVATION_POLICIES.FLEXIBLE;
  const offTurnAllowed = OFF_TURN_ACTIVATION_TYPES.includes(ability.activation?.type);

  if ( inCombat && !combat.isActorTurn && !isGM ) {
    if ( policy === ACTIVATION_POLICIES.TURN_BOUND && !offTurnAllowed ) {
      return { allowed: false, reason: ACTIVATION_REASONS.NOT_YOUR_TURN, requiresApproval: false };
    }
    if ( policy === ACTIVATION_POLICIES.LEGENDARY ) {
      if ( !offTurnAllowed ) {
        return { allowed: false, reason: ACTIVATION_REASONS.NOT_YOUR_TURN, requiresApproval: false };
      }
      const limit = Math.max(0, Math.trunc(Number(settings.legendaryUsesPerRound ?? 1)));
      const sameRound = (usage.combatId === combat.combatId) && (usage.round === combat.round);
      const used = sameRound ? Number(usage.count ?? 0) : 0;
      if ( limit && (used >= limit) ) {
        return { allowed: false, reason: ACTIVATION_REASONS.LEGENDARY_LIMIT, requiresApproval: false };
      }
    }
  }

  if ( (policy === ACTIVATION_POLICIES.GM_CONTROLLED) && !isGM ) {
    return { allowed: true, reason: ACTIVATION_REASONS.NEEDS_GM_APPROVAL, requiresApproval: true };
  }
  return { allowed: true, reason: ACTIVATION_REASONS.OK, requiresApproval: false };
}

/**
 * Compute the updated legendary usage tracker after an off-turn activation.
 * @param {object} usage
 * @param {object} combat
 * @returns {object}
 */
export function nextLegendaryUsage(usage={}, combat={}) {
  const sameRound = (usage.combatId === combat.combatId) && (usage.round === combat.round);
  return {
    combatId: combat.combatId ?? null,
    round: combat.round ?? null,
    count: (sameRound ? Number(usage.count ?? 0) : 0) + 1
  };
}
