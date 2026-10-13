/**
 * Activation confirmation dialog. Shows the ability, cost, mode and target summary before any resource is spent.
 */

import { ABILITY_MODES, MODULE_ID, POOLS } from "../constants.js";
import { currentTargets, describeMechanics } from "../ability-executor.js";

const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);

/**
 * @param {object} params
 * @param {Actor} params.actor
 * @param {string} params.pool
 * @param {object} params.ability
 * @param {number} params.cost
 * @param {number} params.remaining
 * @returns {Promise<boolean>}
 */
export async function confirmActivation({ actor, pool, ability, cost, remaining }) {
  const isHeroic = pool === POOLS.HEROIC;
  const content = await foundry.applications.handlebars.renderTemplate(
    `modules/${MODULE_ID}/templates/activation-confirm.hbs`, {
      actor, ability, cost, remaining, pool, isHeroic,
      poolLabel: loc(isHeroic ? "HVA.Pool.Heroic" : "HVA.Pool.Villainous"),
      isManual: ability.mode !== ABILITY_MODES.AUTOMATED,
      activationLabel: loc(`HVA.Activation.${ability.activation?.type ?? "action"}`),
      descriptionLines: String(ability.description ?? "").split("\n"),
      mechanics: describeMechanics(ability),
      targets: currentTargets().map(t => t.name)
    }
  );
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title: loc("HVA.Activate.Title", { ability: ability.name }) },
    classes: ["hva", "hva-activate"],
    position: { width: 480 },
    content,
    yes: { label: loc("HVA.Activate.Confirm"), icon: isHeroic ? "fa-solid fa-sun" : "fa-solid fa-skull" },
    no: { label: loc("Cancel"), icon: "fa-solid fa-xmark" },
    rejectClose: false
  });
  return result === true;
}
