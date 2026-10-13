/**
 * Chat and UI notifications for awards, blocked awards and activations.
 */

import { CAP_BEHAVIORS, MAX_PER_POOL, MODULE_ID, NOTIFICATION_MODES, POOLS } from "./constants.js";
import { getSetting, SETTINGS } from "./settings.js";
import { diagnostics } from "./diagnostics.js";

const TEMPLATES = Object.freeze({
  AWARD: `modules/${MODULE_ID}/templates/chat-award.hbs`,
  ACTIVATION: `modules/${MODULE_ID}/templates/chat-activation.hbs`
});

const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

export function poolLabel(pool) {
  return loc(pool === POOLS.HEROIC ? "HVA.Pool.Heroic" : "HVA.Pool.Villainous");
}

export function poolIcon(pool) {
  return pool === POOLS.HEROIC ? "fa-solid fa-sun" : "fa-solid fa-skull";
}

/**
 * Users that should receive a private notification about an actor: GMs and owners.
 * @param {Actor} actor
 * @returns {string[]}
 */
export function privateRecipients(actor) {
  const ids = new Set(game.users.filter(u => u.isGM).map(u => u.id));
  for ( const user of game.users ) {
    if ( actor?.testUserPermission?.(user, "OWNER") ) ids.add(user.id);
  }
  return Array.from(ids);
}

/**
 * Current message visibility mode. Foundry V14 stores it in `core.messageMode` (V13 and earlier: `core.rollMode`);
 * dnd5e 6 exposes the resolved value through `BasicRoll.getMessageMode()`.
 */
function currentMessageMode() {
  const basic = CONFIG.Dice?.BasicRoll;
  if ( typeof basic?.getMessageMode === "function" ) return basic.getMessageMode();
  try {
    return game.settings.get("core", "messageMode");
  } catch {
    return game.settings.get("core", "rollMode");
  }
}

/**
 * Create a chat message. Explicit whispers are kept as given; public messages clear whisper/blind explicitly;
 * otherwise the user's current message mode is applied through the V14 `messageMode` create option
 * (the same mechanism dnd5e 6 uses in `BasicRoll.toMessage`).
 */
async function createChat(data, { forcePublic=false }={}) {
  const cls = getDocumentClass("ChatMessage");
  const chatData = { ...data };
  if ( chatData.whisper?.length ) return cls.create(chatData);
  if ( forcePublic ) return cls.create({ ...chatData, whisper: [], blind: false });
  return cls.create(chatData, { messageMode: currentMessageMode() });
}

/**
 * Announce an award (or blocked award) in chat and as a toast.
 * @param {object} params
 * @param {Actor} params.actor
 * @param {string} params.pool
 * @param {object} params.result   { applied, blocked, before, after }
 * @param {string} params.category
 * @param {number} params.natural
 * @param {string} [params.messageId]
 */
export async function notifyAward({ actor, pool, result, category, natural, messageId }) {
  const blocked = result.blocked === true;
  if ( blocked && (getSetting(SETTINGS.CAP_BEHAVIOR) === CAP_BEHAVIORS.SILENT) ) return;
  const mode = getSetting(SETTINGS.NOTIFICATION_MODE);
  const label = poolLabel(pool);
  const text = blocked
    ? loc(`HVA.Chat.AtMaximum.${pool}`)
    : loc(`HVA.Chat.Earned.${pool}`);

  if ( getSetting(SETTINGS.SHOW_TOASTS) && actor?.isOwner ) {
    ui.notifications[blocked ? "warn" : "info"](`${actor.name}: ${text}`);
  }
  if ( mode === NOTIFICATION_MODES.NONE ) return;

  try {
    const content = await foundry.applications.handlebars.renderTemplate(TEMPLATES.AWARD, {
      actor, pool, label, icon: poolIcon(pool), blocked, text,
      count: result.after, max: MAX_PER_POOL,
      category: loc(`HVA.Category.${category}.Name`), natural, messageId
    });
    const data = {
      content,
      speaker: ChatMessage.getSpeaker({ actor }),
      flags: { [MODULE_ID]: { type: "award", pool, actorUuid: actor.uuid, blocked, messageId } }
    };
    if ( mode === NOTIFICATION_MODES.PRIVATE ) data.whisper = privateRecipients(actor);
    await createChat(data, { forcePublic: mode === NOTIFICATION_MODES.PUBLIC });
  } catch(err) {
    diagnostics.error("Failed to post award notification", err);
  }
}

/**
 * Post the activation card for an ability.
 * @param {object} params
 * @param {Actor} params.actor
 * @param {string} params.pool
 * @param {object} params.ability
 * @param {number} params.cost
 * @param {number} params.remaining
 * @param {object[]} [params.results]   Execution results for automated abilities.
 * @param {boolean} [params.failed]
 * @param {string} [params.error]
 */
export async function notifyActivation({ actor, pool, ability, cost, remaining, results=[], failed=false, error=null }) {
  const forcePublic = getSetting(SETTINGS.REQUIRE_PUBLIC_CHAT) === true;
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATES.ACTIVATION, {
    actor, pool, ability, cost, remaining, results, failed, error,
    label: poolLabel(pool), icon: poolIcon(pool),
    isManual: ability.mode !== "automated",
    activationLabel: loc(`HVA.Activation.${ability.activation?.type ?? "action"}`),
    descriptionLines: String(ability.description ?? "").split("\n")
  });
  const data = {
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [MODULE_ID]: { type: "activation", pool, actorUuid: actor.uuid, abilityName: ability.name } }
  };
  return createChat(data, { forcePublic });
}

/** Simple UI error surface. */
export function notifyError(message) {
  ui.notifications?.error(message, { console: false });
  diagnostics.error(message);
}
