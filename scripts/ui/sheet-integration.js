/**
 * Character / NPC sheet integration for the dnd5e 6.x ApplicationV2 sheets.
 *
 * Verified against dnd5e 6.0.6: `CharacterActorSheet` and `NPCActorSheet` extend `BaseActorSheet`; the character
 * sidebar template renders `.sidebar > .card > .stats` with `.meter-group` blocks. ApplicationV2 fires
 * `render<ClassName>` for every class in the inheritance chain, so hooking `renderBaseActorSheet` covers both sheets
 * without depending on Tidy 5e or any other sheet module. A header control is also added for every actor sheet.
 */

import { MODULE_ID, POOL_LIST, POOLS, MAX_PER_POOL } from "../constants.js";
import { resourceManager } from "../resource-manager.js";
import { activateAbility, defineAbility } from "../ability-manager.js";
import { canActivate, canDefineAbility, canView, actorSupported } from "../permission-service.js";
import { isDefined } from "../ability-schema.js";
import { getSetting, SETTINGS } from "../settings.js";
import { notifyError } from "../notification-service.js";
import { ActionPanel } from "./action-panel.js";

const loc = (key, data) => data ? game.i18n.format(key, data) : game.i18n.localize(key);
let registered = false;

async function renderCard(actor) {
  const data = resourceManager.getData(actor);
  const user = game.user;
  const pools = POOL_LIST.map(pool => {
    const ability = data.abilities[pool];
    const count = data.resources[pool].value;
    return {
      pool, count, max: MAX_PER_POOL,
      label: loc(pool === POOLS.HEROIC ? "HVA.Pool.Heroic" : "HVA.Pool.Villainous"),
      icon: pool === POOLS.HEROIC ? "fa-solid fa-sun" : "fa-solid fa-skull",
      pips: Array.from({ length: MAX_PER_POOL }, (_v, i) => ({ filled: i < count })),
      abilityName: isDefined(ability) ? ability.name : loc("HVA.Sheet.Undefined"),
      canUse: canActivate(user, actor) && (count >= 1),
      canDefine: !isDefined(ability) && canDefineAbility(user, actor)
    };
  });
  return foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/sheet-card.hbs`, { pools });
}

async function onRenderActorSheet(app, element) {
  const actor = app.document ?? app.actor;
  if ( !actor || !actorSupported(actor) || !canView(game.user, actor) ) return;
  if ( getSetting(SETTINGS.SHOW_SHEET_CARD) !== true ) return;
  const root = element ?? app.element;
  if ( !root ) return;
  root.querySelector(".hva-sheet-card")?.remove();

  const anchor = root.querySelector(".sidebar .card .stats")
    ?? root.querySelector(".sidebar")
    ?? root.querySelector(".main-content")
    ?? root.querySelector(".window-content");
  if ( !anchor ) return;

  const html = await renderCard(actor);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  const card = wrapper.firstElementChild;
  if ( !card ) return;
  anchor.append(card);

  card.querySelectorAll("[data-hva-action]").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.hvaAction;
      const pool = button.dataset.pool;
      try {
        if ( action === "use" ) await activateAbility(actor, pool);
        else if ( action === "define" ) await defineAbility(actor, pool);
        else if ( action === "open" ) ActionPanel.open(actor);
      } catch(err) {
        notifyError(err.message);
      }
    });
  });
}

function onHeaderControls(app, controls) {
  const actor = app.document ?? app.actor;
  if ( !actor || !actorSupported(actor) || !canView(game.user, actor) ) return;
  controls.push({
    icon: "fa-solid fa-dice-d20",
    label: "HVA.Sheet.OpenPanel",
    action: "hvaOpenPanel",
    onClick: () => ActionPanel.open(actor)
  });
}

/** Register sheet hooks. Idempotent. */
export function registerSheetIntegration() {
  if ( registered ) return;
  registered = true;
  Hooks.on("renderBaseActorSheet", onRenderActorSheet);
  Hooks.on("getHeaderControlsBaseActorSheet", onHeaderControls);
}
