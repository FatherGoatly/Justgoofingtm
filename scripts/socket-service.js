/**
 * Socket relay for operations that need a GM client: awards for actors the roller cannot update, GM approval of
 * activations under the GM-controlled policy, and applying automated effects to targets the player does not own.
 * Every inbound request is re-validated on the GM side; nothing in the payload is trusted.
 */

import { MODULE_ID, SOCKET_ACTIONS, SOCKET_NAME } from "./constants.js";
import { processMessageRolls } from "./roll-processor.js";
import { applyLocally } from "./ability-executor.js";
import { diagnostics } from "./diagnostics.js";

const APPROVAL_TIMEOUT = 120 * 1000;
const pendingApprovals = new Map();
let registered = false;

const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

function isActiveGM() {
  return game.users.activeGM === game.user;
}

function validApplyPayload(payload) {
  if ( !payload || (typeof payload !== "object") ) return false;
  const amount = Number(payload.amount);
  switch ( payload.kind ) {
    case "heal":
    case "tempHp":
      return Number.isFinite(amount) && (amount >= 0) && (amount <= 999);
    case "applyCondition":
    case "removeCondition":
      return (typeof payload.status === "string") && !!CONFIG.statusEffects.find(s => s.id === payload.status);
    default:
      return false;
  }
}

async function handleAwardRequest({ messageId, index, userId }) {
  if ( !isActiveGM() ) return;
  const message = game.messages.get(messageId);
  if ( !message ) return;
  if ( message.author?.id !== userId ) {
    diagnostics.warn("Rejected award request: message author mismatch", { messageId, userId });
    return;
  }
  await processMessageRolls(message, { only: Number(index) || 0, allowDelegate: false });
}

async function handleApprovalRequest({ requestId, actorUuid, pool, abilityName, userId }) {
  if ( !isActiveGM() ) return;
  const actor = await fromUuid(actorUuid);
  const user = game.users.get(userId);
  if ( !actor || !user ) return;
  const { DialogV2 } = foundry.applications.api;
  const approved = await DialogV2.confirm({
    window: { title: loc("HVA.Approval.Title") },
    content: `<p>${loc("HVA.Approval.Content", {
      user: foundry.utils.escapeHTML(user.name), actor: foundry.utils.escapeHTML(actor.name),
      ability: foundry.utils.escapeHTML(String(abilityName ?? "")), pool: loc(`HVA.Pool.${pool === "heroic" ? "Heroic" : "Villainous"}`)
    })}</p>`,
    rejectClose: false
  });
  game.socket.emit(SOCKET_NAME, {
    action: SOCKET_ACTIONS.ACTIVATION_APPROVAL_RESPONSE, requestId, approved: approved === true, targetUserId: userId
  });
}

function handleApprovalResponse({ requestId, approved, targetUserId }) {
  if ( targetUserId !== game.user.id ) return;
  const pending = pendingApprovals.get(requestId);
  if ( !pending ) return;
  pendingApprovals.delete(requestId);
  clearTimeout(pending.timer);
  pending.resolve(approved === true);
}

async function handleApplyToTarget({ actorUuid, payload, userId }) {
  if ( !isActiveGM() ) return;
  if ( !validApplyPayload(payload) ) {
    diagnostics.warn("Rejected apply-to-target request: invalid payload", payload);
    return;
  }
  const actor = await fromUuid(actorUuid);
  const user = game.users.get(userId);
  if ( !actor || !user ) return;
  const target = actor.documentName === "Token" ? actor.actor : actor;
  await applyLocally(target, payload);
  diagnostics.record({ status: "appliedForUser", user: user.name, actor: target.name, payload });
  ui.notifications.info(loc("HVA.Notifications.AppliedForUser", { user: user.name, actor: target.name }));
}

async function onSocket(data) {
  try {
    switch ( data?.action ) {
      case SOCKET_ACTIONS.AWARD_REQUEST: return await handleAwardRequest(data);
      case SOCKET_ACTIONS.ACTIVATION_APPROVAL_REQUEST: return await handleApprovalRequest(data);
      case SOCKET_ACTIONS.ACTIVATION_APPROVAL_RESPONSE: return handleApprovalResponse(data);
      case SOCKET_ACTIONS.APPLY_TO_TARGET: return await handleApplyToTarget(data);
    }
  } catch(err) {
    diagnostics.error("Socket handler failed", err);
  }
}

/** Register the socket listener. Idempotent. */
export function registerSocket() {
  if ( registered ) return;
  registered = true;
  game.socket.on(SOCKET_NAME, onSocket);
}

/**
 * Ask the active GM to approve an activation. Resolves false on denial, timeout, or when no GM is connected.
 * @param {object} params
 * @param {Actor} params.actor
 * @param {string} params.pool
 * @param {object} params.ability
 * @returns {Promise<boolean>}
 */
export function requestActivationApproval({ actor, pool, ability }) {
  if ( game.user.isGM ) return Promise.resolve(true);
  if ( !game.users.activeGM ) return Promise.resolve(false);
  const requestId = foundry.utils.randomID(12);
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      pendingApprovals.delete(requestId);
      resolve(false);
    }, APPROVAL_TIMEOUT);
    pendingApprovals.set(requestId, { resolve, timer });
    game.socket.emit(SOCKET_NAME, {
      action: SOCKET_ACTIONS.ACTIVATION_APPROVAL_REQUEST,
      requestId, actorUuid: actor.uuid, pool, abilityName: ability.name, userId: game.user.id
    });
  });
}

export { MODULE_ID as socketModuleId };
