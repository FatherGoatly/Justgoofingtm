/**
 * Award pipeline: validate → attribute → classify → dedupe → award → notify → diagnose.
 * Every roll observation (dnd5e hooks, chat messages, automation adapters) flows through `processRoll`.
 */

import { MODULE_ID, ROLL_CATEGORIES, SOCKET_ACTIONS } from "./constants.js";
import { classifyRoll, determineCategory, isD20TestRoll } from "./roll-classifier.js";
import { buildRollKey, RollRegistry } from "./roll-registry.js";
import { getClassifierPolicy, getSetting, isCategoryEnabled, SETTINGS } from "./settings.js";
import { actorParticipates, canUpdateActor } from "./permission-service.js";
import { resourceManager } from "./resource-manager.js";
import { notifyAward } from "./notification-service.js";
import { diagnostics } from "./diagnostics.js";

export const registry = new RollRegistry();

export const PROCESS_RESULTS = Object.freeze({
  NOT_D20_TEST: "notD20Test",
  NO_ACTOR: "noActor",
  ACTOR_EXCLUDED: "actorExcluded",
  CATEGORY_DISABLED: "categoryDisabled",
  OUTSIDE_COMBAT: "outsideCombat",
  NOT_QUALIFYING: "notQualifying",
  DUPLICATE: "duplicate",
  NO_PERMISSION: "noPermission",
  DELEGATED: "delegated",
  AWARDED: "awarded",
  BLOCKED: "blocked",
  ERROR: "error"
});

/**
 * Resolve the Actor responsible for a roll from the richest provenance available.
 * @param {object} params
 * @param {object} [params.subject]   Hook subject: an Actor or an Activity (`subject.actor`).
 * @param {ChatMessage} [params.message]
 * @returns {Actor|null}
 */
export function resolveActor({ subject, message }={}) {
  if ( subject ) {
    if ( subject.documentName === "Actor" ) return subject;
    if ( subject.actor?.documentName === "Actor" ) return subject.actor;
  }
  if ( message ) {
    if ( typeof message.getAssociatedActor === "function" ) {
      const actor = message.getAssociatedActor();
      if ( actor ) return actor;
    }
    const speaker = message.speaker ?? {};
    if ( speaker.scene && speaker.token ) {
      const scene = game.scenes?.get(speaker.scene);
      const token = scene?.tokens?.get(speaker.token);
      if ( token?.actor ) return token.actor;
    }
    if ( speaker.actor ) return game.actors?.get(speaker.actor) ?? null;
  }
  return null;
}

function inCombatNow() {
  return !!game.combat?.started || !!game.combat?.active;
}

/**
 * Process a single observed roll.
 * @param {object} params
 * @param {object} params.roll                 Roll instance or serialized roll data.
 * @param {string} [params.hookName]           dnd5e hook name (without prefix) that delivered the roll.
 * @param {object} [params.subject]            Hook subject (Actor or Activity).
 * @param {ChatMessage} [params.message]       Chat message carrying the roll, if any.
 * @param {number} [params.index=0]            Index of the roll in the message.
 * @param {string} [params.workflowKey]        Automation workflow identifier for dedupe.
 * @param {boolean} [params.allowDelegate=true] Ask the GM over the socket when this client cannot update the actor.
 * @returns {Promise<{status: string, category: string, classification: object|null, awards: object[]}>}
 */
export async function processRoll({
  roll, hookName, subject, message, index=0, workflowKey, allowDelegate=true
}={}) {
  const record = { hookName, messageId: message?.id ?? null, index, status: null, category: null };

  if ( !isD20TestRoll(roll) ) {
    record.status = PROCESS_RESULTS.NOT_D20_TEST;
    diagnostics.record(record);
    return { ...record, classification: null, awards: [] };
  }

  const actor = resolveActor({ subject, message });
  record.actor = actor ? { name: actor.name, uuid: actor.uuid, type: actor.type } : null;
  if ( !actor ) {
    record.status = PROCESS_RESULTS.NO_ACTOR;
    diagnostics.record(record);
    return { ...record, classification: null, awards: [] };
  }

  const category = determineCategory({
    hookName, rollOptions: roll.options ?? {},
    messageType: message?.type, messageSystem: message?.system ?? {}
  });
  record.category = category;

  const classification = classifyRoll(roll, getClassifierPolicy());
  record.classification = {
    qualifies: classification.qualifies, reason: classification.reason,
    naturals: classification.naturals, selectedNatural: classification.selectedNatural,
    advantageMode: classification.advantageMode, rerolled: classification.rerolled,
    outcomes: classification.outcomes
  };

  if ( !actorParticipates(actor) ) {
    record.status = PROCESS_RESULTS.ACTOR_EXCLUDED;
    diagnostics.record(record);
    return { ...record, classification, awards: [] };
  }
  if ( (category === ROLL_CATEGORIES.UNKNOWN) || !isCategoryEnabled(category) ) {
    record.status = PROCESS_RESULTS.CATEGORY_DISABLED;
    diagnostics.record(record);
    return { ...record, classification, awards: [] };
  }
  if ( !getSetting(SETTINGS.COUNT_OUTSIDE_COMBAT) && !inCombatNow() ) {
    record.status = PROCESS_RESULTS.OUTSIDE_COMBAT;
    diagnostics.record(record);
    return { ...record, classification, awards: [] };
  }
  if ( !classification.qualifies ) {
    record.status = PROCESS_RESULTS.NOT_QUALIFYING;
    diagnostics.record(record);
    return { ...record, classification, awards: [] };
  }

  const { key, source } = buildRollKey({ roll, messageId: message?.id, index, workflowKey });
  record.rollKey = key;
  record.keySource = source;
  if ( !registry.claim(key, roll) ) {
    record.status = PROCESS_RESULTS.DUPLICATE;
    diagnostics.record(record);
    return { ...record, classification, awards: [] };
  }

  // Permission: award locally when possible, otherwise delegate to the active GM through the socket.
  if ( !canUpdateActor(game.user, actor) ) {
    if ( allowDelegate && message?.id && game.users?.activeGM && (game.users.activeGM !== game.user) ) {
      game.socket.emit(`module.${MODULE_ID}`, {
        action: SOCKET_ACTIONS.AWARD_REQUEST,
        messageId: message.id, index, userId: game.user.id
      });
      record.status = PROCESS_RESULTS.DELEGATED;
    } else {
      record.status = PROCESS_RESULTS.NO_PERMISSION;
    }
    diagnostics.record(record);
    return { ...record, classification, awards: [] };
  }

  const awards = [];
  try {
    for ( const outcome of classification.outcomes ) {
      const result = await resourceManager.award(actor, outcome.pool, {
        source: { category, natural: outcome.natural, messageId: message?.id ?? null, rollKey: key, hookName }
      });
      awards.push({ pool: outcome.pool, ...result });
      await notifyAward({
        actor, pool: outcome.pool, result, category, natural: outcome.natural, messageId: message?.id
      });
    }
    record.status = awards.every(a => a.blocked) ? PROCESS_RESULTS.BLOCKED : PROCESS_RESULTS.AWARDED;
  } catch(err) {
    registry.release(key, roll);
    record.status = PROCESS_RESULTS.ERROR;
    record.error = err?.message ?? String(err);
    diagnostics.error("Award failed", err);
  }
  record.awards = awards.map(a => ({ pool: a.pool, applied: a.applied, blocked: a.blocked, after: a.after }));
  diagnostics.record(record);
  return { ...record, classification, awards };
}

/**
 * Process every D20Roll carried by a chat message. Used by the `createChatMessage` path and by the GM socket handler.
 * @param {ChatMessage} message
 * @param {object} [options]
 * @param {number} [options.only]   Restrict to a single roll index.
 * @param {boolean} [options.allowDelegate]
 */
export async function processMessageRolls(message, { only, allowDelegate=true }={}) {
  const rolls = message?.rolls ?? [];
  const results = [];
  for ( let index = 0; index < rolls.length; index++ ) {
    if ( (only !== undefined) && (index !== only) ) continue;
    const roll = rolls[index];
    results.push(await processRoll({ roll, message, index, allowDelegate }));
  }
  return results;
}
