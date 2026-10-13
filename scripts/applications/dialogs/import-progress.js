/**
 * Progress import: pick a file, inspect it, choose a merge strategy, confirm. Never overwrites silently.
 */
import { escapeHTML } from "../../utilities/html.js";

export class ImportProgressDialog {
  /**
   * @param {import("../../core/academy.js").Academy} academy
   * @returns {Promise<boolean>} Whether an import was applied
   */
  static async run(academy) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const file = await new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "application/json,.json";
      input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    });
    if ( !file ) return false;
    const text = await file.text();
    const inspection = academy.progress.inspectImport(text);
    if ( !inspection.ok ) {
      await DialogV2.prompt({ window: { title: game.i18n.localize("GMMA.Import.Title") }, content: `<p>${game.i18n.localize("GMMA.Import.Invalid")}</p><ul>${inspection.errors.map(e => `<li>${escapeHTML(e)}</li>`).join("")}</ul>`, rejectClose: false });
      return false;
    }
    const s = inspection.summary;
    const existing = academy.progress.progress;
    const existingCompleted = Object.values(existing.lessons).filter(l => String(l.state).startsWith("completed") || l.state === "mastered").length;
    const content = `
      <p>${game.i18n.localize("GMMA.Import.Summary")}</p>
      <table class="gmma-import-table"><tbody>
        <tr><th>${game.i18n.localize("GMMA.Import.File")}</th><td>${escapeHTML(file.name)} (${s.lessons} lesson records, ${s.completed} completed, ${s.exercises} exercise records, ${s.achievements} achievements, last updated ${new Date(s.updatedAt).toLocaleString()})</td></tr>
        <tr><th>${game.i18n.localize("GMMA.Import.Current")}</th><td>${Object.keys(existing.lessons).length} lesson records, ${existingCompleted} completed, ${Object.keys(existing.exercises).length} exercise records</td></tr>
      </tbody></table>
      ${inspection.warnings.length ? `<ul class="gmma-import-warnings">${inspection.warnings.map(w => `<li>${escapeHTML(w)}</li>`).join("")}</ul>` : ""}
      <fieldset><legend>${game.i18n.localize("GMMA.Import.Strategy")}</legend>
        <label><input type="radio" name="strategy" value="merge" checked> ${game.i18n.localize("GMMA.Import.Merge")}</label><br>
        <label><input type="radio" name="strategy" value="keep-existing"> ${game.i18n.localize("GMMA.Import.KeepExisting")}</label><br>
        <label><input type="radio" name="strategy" value="replace"> ${game.i18n.localize("GMMA.Import.Replace")}</label>
      </fieldset>`;
    const data = await DialogV2.input({ window: { title: game.i18n.localize("GMMA.Import.Title") }, content, ok: { label: game.i18n.localize("GMMA.Import.Apply"), icon: "fa-solid fa-file-import" }, rejectClose: false });
    if ( !data ) return false;
    const strategy = ["merge", "keep-existing", "replace"].includes(data.strategy) ? data.strategy : "merge";
    if ( strategy === "replace" ) {
      const ok = await DialogV2.confirm({ window: { title: game.i18n.localize("GMMA.Import.ReplaceTitle") }, content: `<p>${game.i18n.localize("GMMA.Import.ReplaceWarning")}</p>`, rejectClose: false, no: { default: true } });
      if ( !ok ) return false;
    }
    await academy.progress.applyImport(inspection.record, strategy);
    ui.notifications.info(game.i18n.localize("GMMA.Import.Done"));
    return true;
  }
}
