import { MODULE_ID } from "../core/constants.js";
import { canUseImporter } from "../core/permissions.js";
import { ImporterApplication } from "./importer-app.js";

/**
 * UI registration: an "Import Stat Block" button in the Actors and Items sidebar directories and a
 * settings-menu entry. Hooks receive HTMLElement in Foundry V13+.
 */
export function registerUI() {
  for ( const hook of ["renderActorDirectory", "renderItemDirectory"] ) {
    Hooks.on(hook, (app, html) => injectButton(html, hook === "renderActorDirectory" ? "Actor" : "Item"));
  }
  Hooks.on("getSceneControlButtons", () => {});
}

function injectButton(html, documentType) {
  if ( !canUseImporter() ) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if ( !root ) return;
  const header = root.querySelector(".directory-header .header-actions, .directory-header .action-buttons, .header-actions");
  if ( !header || header.querySelector(`.${MODULE_ID}-open`) ) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${MODULE_ID}-open`;
  button.innerHTML = `<i class="fa-solid fa-file-import"></i> ${game.i18n.localize("SBI.Open")}`;
  button.addEventListener("click", () => new ImporterApplication({ defaultDocumentType: documentType }).render({ force: true }));
  header.appendChild(button);
}
