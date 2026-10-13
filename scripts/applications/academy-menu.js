/**
 * A tiny ApplicationV2 used as the settings-menu target: the settings UI instantiates and renders it, and all
 * it does is open the academy. It never shows a window of its own.
 */
import { Academy } from "../core/academy.js";

export class AcademyMenu extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "gmma-menu-launcher", window: { frame: false, positioned: false } };
  async _renderHTML() { return document.createElement("div"); }
  _replaceHTML() {}
  async render() { await Academy.instance?.open(); return this; }
}
