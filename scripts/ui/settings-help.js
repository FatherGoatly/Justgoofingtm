/**
 * In-app documentation of the configurable rules and their defaults.
 */

import { MODULE_ID } from "../constants.js";
import { getSetting, SETTINGS } from "../settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SettingsHelp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hva-settings-help",
    classes: ["hva", "hva-help"],
    window: { title: "HVA.Help.Title", icon: "fa-solid fa-circle-question", resizable: true },
    position: { width: 640, height: 600 }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/settings-help.hbs`, scrollable: [".hva-scroll"] }
  };

  async _prepareContext() {
    return {
      current: {
        advantagePolicy: getSetting(SETTINGS.ADVANTAGE_POLICY),
        rerollPolicy: getSetting(SETTINGS.REROLL_POLICY),
        activationPolicy: getSetting(SETTINGS.ACTIVATION_POLICY),
        legendaryUses: getSetting(SETTINGS.LEGENDARY_USES_PER_ROUND)
      }
    };
  }
}
