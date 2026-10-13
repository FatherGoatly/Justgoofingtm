/**
 * Entry point for The Game Master's Macro Academy.
 */
import { MODULE_ID, MODULE_TITLE, SETTINGS } from "./core/constants.js";
import { Logger } from "./core/logger.js";
import { registerSettings } from "./core/settings.js";
import { Academy } from "./core/academy.js";
import { canUseAcademy } from "./core/permissions.js";
import { TEMPLATES } from "./applications/templates.js";
import { AcademyApplication } from "./applications/academy-app.js";
import { WorkshopApplication } from "./applications/workshop-app.js";
import { AcademyMenu } from "./applications/academy-menu.js";

Hooks.once("init", () => {
  registerSettings({
    MenuApplication: AcademyMenu,
    onPreferenceChange: (key, value) => {
      const academy = Academy.instance;
      if ( !academy ) return;
      if ( key === SETTINGS.REQUIRE_ASSESSMENT || key === SETTINGS.SHOW_SYSTEM_LESSONS ) academy.progress.recomputeAll();
      academy.apps.academy?.render();
      if ( key === SETTINGS.EDITOR_FONT_SIZE ) academy.apps.workshop?.applyFontSize?.(value);
    }
  });

  game.keybindings.register(MODULE_ID, "openAcademy", {
    name: "GMMA.Keybindings.Open.Name",
    hint: "GMMA.Keybindings.Open.Hint",
    editable: [{ key: "KeyA", modifiers: ["Alt", "Shift"] }],
    onDown: () => { Academy.instance?.toggle(); return true; },
    restricted: false
  });

  foundry.applications.handlebars.loadTemplates(Object.values(TEMPLATES)).catch(err => Logger.report("Template preload", err));
  Logger.info(`${MODULE_TITLE} initialising`);
});

Hooks.once("ready", async () => {
  let bundle;
  try {
    const mod = await import("../curriculum/index.js");
    bundle = await mod.loadCurriculum();
  } catch(err) {
    Logger.report("Curriculum failed to load", err, { notify: true });
    return;
  }
  const academy = new Academy({ bundle }).initialize({ AcademyApplication, WorkshopApplication });
  const module = game.modules.get(MODULE_ID);
  module.api = academy.api;
  Hooks.callAll(`${MODULE_ID}.ready`, academy.api);
  if ( !academy.env.foundrySupported ) ui.notifications.warn(game.i18n.format("GMMA.Errors.UnsupportedFoundry", { version: academy.env.foundryVersion }), { permanent: true });
  if ( game.user.isGM && !academy.progress.progress.lastLesson && !Object.keys(academy.progress.progress.lessons).length ) {
    ui.notifications.info(game.i18n.localize("GMMA.Notices.FirstRun"));
  }
  Logger.info(`${MODULE_TITLE} ready: ${academy.registry.lessons.size} lessons, ${academy.registry.glossary.size} glossary terms.`);
});

/* Entry point: scene controls (token layer tool). */
Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.tokens;
  if ( !tokens?.tools ) return;
  tokens.tools.gmMacroAcademy = {
    name: "gmMacroAcademy",
    title: "GMMA.Controls.Open",
    icon: "fa-solid fa-graduation-cap",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: canUseAcademy(),
    onChange: () => Academy.instance?.toggle()
  };
});

/* Entry point: Settings sidebar button. */
Hooks.on("renderSettings", (_app, element) => {
  const el = element instanceof HTMLElement ? element : element?.[0];
  if ( !el || !canUseAcademy() || el.querySelector(".gmma-launcher") ) return;
  const section = document.createElement("section");
  section.className = "gmma-launcher flexcol";
  const heading = document.createElement("h4");
  heading.className = "divider";
  heading.textContent = MODULE_TITLE;
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = `<i class="fa-solid fa-graduation-cap" aria-hidden="true"></i> ${game.i18n.localize("GMMA.Controls.Open")}`;
  button.addEventListener("click", () => Academy.instance?.open());
  section.append(heading, button);
  const anchor = el.querySelector("button[data-action='openSettings']")?.closest("section") ?? null;
  if ( anchor ) anchor.after(section); else el.append(section);
});

/* Chat command: /academy */
Hooks.on("chatMessage", (_log, message) => {
  if ( /^\/academy\b/i.test(message.trim()) ) { Academy.instance?.open(); return false; }
  return true;
});
