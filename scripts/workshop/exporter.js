/**
 * Exporting learner code: download as a file, copy to the clipboard, or create/update a Foundry Macro document
 * after permission checks and explicit confirmation. Existing macros are never silently overwritten.
 */
import { MODULE_ID, FLAGS } from "../core/constants.js";
import { canCreateMacro } from "../core/permissions.js";
import { slugify, escapeHTML } from "../utilities/html.js";

/**
 * Download code as a .js file.
 * @param {string} code
 * @param {string} name
 */
export function exportAsFile(code, name="macro") {
  const filename = `${slugify(name) || "macro"}.js`;
  const header = `// ${name}\n// Exported from The Game Master's Macro Academy on ${new Date().toISOString()}\n// Paste into a Foundry script macro (Macro Directory > Create Macro > Type: Script).\n\n`;
  foundry.utils.saveDataToFile(header + code, "text/javascript", filename);
  return filename;
}

/**
 * Copy text to the clipboard.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    if ( game.clipboard?.copyPlainText ) { game.clipboard.copyPlainText(text); return true; }
    await navigator.clipboard.writeText(text);
    return true;
  } catch(_err) {
    return false;
  }
}

/**
 * Find an existing macro created from a draft, or one with the same name that the user owns.
 * @param {string} name
 * @param {string|null} draftId
 * @returns {Macro|null}
 */
export function findExistingMacro(name, draftId=null) {
  const macros = game.macros?.contents ?? [];
  if ( draftId ) { const byDraft = macros.find(m => m.getFlag?.(MODULE_ID, FLAGS.DRAFT_ID) === draftId && m.isOwner); if ( byDraft ) return byDraft; }
  return macros.find(m => m.name === name && m.isOwner) ?? null;
}

/**
 * Create a new Macro or update an existing one, always with explicit confirmation.
 * @param {object} options
 * @param {string} options.name
 * @param {string} options.code
 * @param {string|null} [options.draftId]
 * @param {string} [options.img]
 * @returns {Promise<{status:"created"|"updated"|"cancelled"|"denied", macro?:Macro, reason?:string}>}
 */
export async function createOrUpdateMacro({ name, code, draftId=null, img="icons/svg/book.svg" }) {
  const permission = canCreateMacro();
  if ( !permission.allowed ) return { status: "denied", reason: permission.reason };
  name = String(name || "Academy macro").trim().slice(0, 100);
  const DialogV2 = foundry.applications.api.DialogV2;
  const existing = findExistingMacro(name, draftId);
  const flags = { [MODULE_ID]: { [FLAGS.DRAFT_ID]: draftId, [FLAGS.EXPORTED_AT]: Date.now() } };
  if ( existing ) {
    const choice = await DialogV2.wait({
      window: { title: "A macro with this name already exists" },
      content: `<p>The macro <strong>${escapeHTML(existing.name)}</strong> (ID <code>${escapeHTML(existing.id)}</code>${existing.folder ? `, folder "${escapeHTML(existing.folder.name)}"` : ""}) already exists and you own it.</p><p>Do you want to <strong>replace its command</strong> with your workshop code, or create a <strong>new macro</strong> alongside it?</p>`,
      buttons: [
        { action: "update", label: "Replace existing", icon: "fa-solid fa-pen" },
        { action: "create", label: "Create new copy", icon: "fa-solid fa-plus" },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", default: true }
      ],
      rejectClose: false
    });
    if ( !choice || choice === "cancel" ) return { status: "cancelled" };
    if ( choice === "update" ) {
      await existing.update({ command: code, type: "script", flags });
      return { status: "updated", macro: existing };
    }
    name = uniqueName(name);
  } else {
    const ok = await DialogV2.confirm({ window: { title: "Create macro" }, content: `<p>Create a new script macro named <strong>${escapeHTML(name)}</strong> in your Macro Directory?</p><p class="hint">You can drag it to the hotbar afterwards. The academy does not run it.</p>`, rejectClose: false });
    if ( !ok ) return { status: "cancelled" };
  }
  const MacroClass = globalThis.Macro?.implementation ?? globalThis.Macro ?? foundry.documents.Macro;
  const macro = await MacroClass.create({ name, type: "script", scope: "global", command: code, img, flags });
  return { status: "created", macro };
}

function uniqueName(name) {
  const names = new Set((game.macros?.contents ?? []).map(m => m.name));
  let n = 2;
  let candidate = `${name} (${n})`;
  while ( names.has(candidate) ) candidate = `${name} (${++n})`;
  return candidate;
}
