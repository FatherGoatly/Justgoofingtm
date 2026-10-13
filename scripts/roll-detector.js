/**
 * Roll detection: wires dnd5e 6.x roll hooks and chat message creation into the award pipeline.
 *
 * Verified hook flow (dnd5e 6.0.6, `module/dice/basic-roll.mjs`):
 *  - `dnd5e.postRollConfiguration` fires with the constructed-but-unevaluated rolls → we tag each roll with a stable
 *    id stored in `roll.options`, which is serialized into the chat message with the roll.
 *  - `dnd5e.rollAttack`, `dnd5e.rollAbilityCheck`, `dnd5e.rollSavingThrow`, `dnd5e.rollSkill`, `dnd5e.rollToolCheck`,
 *    `dnd5e.rollDeathSave`, `dnd5e.rollConcentration` fire on the rolling client after evaluation and posting.
 *    Death saves and concentration fire both the generic saving-throw hook and their own hook for the same rolls.
 *  - `createChatMessage` fires on every client; only the message author processes it, so one logical roll has one
 *    processing client and one dedupe registry.
 */

import { MODULE_ID } from "./constants.js";
import { setRollTag, getRollTag } from "./roll-registry.js";
import { processRoll, processMessageRolls } from "./roll-processor.js";
import { diagnostics } from "./diagnostics.js";

const POST_ROLL_HOOKS = Object.freeze([
  "rollAttack",
  "rollAbilityCheck",
  "rollSavingThrow",
  "rollSkill",
  "rollToolCheck",
  "rollDeathSave",
  "rollConcentration"
]);

let registered = false;
const hookIds = [];

function on(name, fn) {
  hookIds.push({ name, id: Hooks.on(name, fn) });
}

/** Assign stable ids to rolls before they are evaluated and serialized. */
function onPostRollConfiguration(rolls) {
  for ( const roll of rolls ?? [] ) {
    if ( !roll || (typeof roll !== "object") ) continue;
    if ( !getRollTag(roll) ) setRollTag(roll, foundry.utils.randomID(16));
  }
}

function makePostRollHandler(hookName) {
  return (rolls, data) => {
    if ( !Array.isArray(rolls) ) return;
    for ( const roll of rolls ) {
      const message = roll?.parent?.documentName === "ChatMessage" ? roll.parent : null;
      const index = message ? Math.max(0, message.rolls?.indexOf(roll) ?? 0) : 0;
      processRoll({ roll, hookName, subject: data?.subject, message, index }).catch(err => {
        diagnostics.error(`Error processing ${hookName}`, err);
      });
    }
  };
}

/** Process rolls carried by messages this client authored (rolls that bypassed the dnd5e hooks, initiative, etc.). */
function onCreateChatMessage(message, _options, userId) {
  if ( userId !== game.user.id ) return;
  if ( !message?.rolls?.length ) return;
  processMessageRolls(message).catch(err => diagnostics.error("Error processing chat message rolls", err));
}

/**
 * Register detection hooks. Idempotent.
 */
export function registerRollDetection() {
  if ( registered ) return;
  registered = true;
  on("dnd5e.postRollConfiguration", onPostRollConfiguration);
  for ( const name of POST_ROLL_HOOKS ) on(`dnd5e.${name}`, makePostRollHandler(name));
  on("createChatMessage", onCreateChatMessage);
  diagnostics.log("Roll detection registered");
}

/** Remove detection hooks (used by tests and hot reload). */
export function unregisterRollDetection() {
  for ( const { name, id } of hookIds ) Hooks.off(name, id);
  hookIds.length = 0;
  registered = false;
}

export { MODULE_ID as detectorModuleId };
