import { describeCreation, fixtureStatus, FIXTURE_SCENE } from "../../workshop/fixtures.js";
import { escapeHTML } from "../../utilities/html.js";

/** Confirmation dialogs for creating, cleaning up and resetting practice fixtures. */
export class FixturesDialog {
  /**
   * @param {"create"|"cleanup"|"reset"} kind
   * @returns {Promise<boolean>}
   */
  static async confirm(kind) {
    const status = fixtureStatus();
    const steps = describeCreation();
    const existing = `${status.actors.length} academy actor(s)${status.scene ? ` and the scene "${escapeHTML(status.scene.name)}"` : ""}`;
    const content = {
      create: `<p>${game.i18n.localize("GMMA.Fixtures.CreateIntro")}</p><ol>${steps.map(s => `<li>${escapeHTML(s)}</li>`).join("")}</ol>`,
      cleanup: `<p>${game.i18n.format("GMMA.Fixtures.CleanupIntro", { existing })}</p><p>${game.i18n.localize("GMMA.Fixtures.OnlyFlagged")}</p>`,
      reset: `<p>${game.i18n.format("GMMA.Fixtures.ResetIntro", { existing, scene: FIXTURE_SCENE })}</p><p>${game.i18n.localize("GMMA.Fixtures.OnlyFlagged")}</p>`
    }[kind];
    return Boolean(await foundry.applications.api.DialogV2.confirm({ window: { title: game.i18n.localize(`GMMA.Fixtures.Title.${kind}`) }, content, rejectClose: false, yes: { label: game.i18n.localize(`GMMA.Fixtures.Confirm.${kind}`) }, no: { default: kind !== "create" } }));
  }
}
