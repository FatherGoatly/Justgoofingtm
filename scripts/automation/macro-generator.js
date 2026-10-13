import { FLAG_SCOPE, FLAGS, MECHANIC_SPEC_VERSION, MODULE_ID, MODULE_VERSION } from "../core/constants.js";
import { fingerprint } from "../import/text-utils.js";
import diagnostics from "../core/diagnostics.js";

/**
 * Macro generator. Generated macros are tiny trusted wrappers produced from a fixed template; they
 * never contain imported text and only call the module runtime with a mechanic id. The runtime
 * re-validates everything at execution time.
 */

/**
 * Render the macro command for a mechanic. Pure function (tests).
 * @param {object} spec        Mechanic specification
 * @param {object} refs        { itemUuid, itemName }
 * @returns {string}
 */
export function renderMacroCommand(spec, refs) {
  const id = JSON.stringify(String(spec.id));
  const uuid = JSON.stringify(String(refs.itemUuid ?? ""));
  return [
    `// ${MODULE_ID} v${MODULE_VERSION} — generated wrapper (spec v${spec.version ?? MECHANIC_SPEC_VERSION}).`,
    `// Mechanic: ${sanitizeComment(spec.label ?? spec.kind)} for "${sanitizeComment(refs.itemName ?? "item")}".`,
    "// Safe to delete or regenerate from the importer; all logic lives in the module runtime.",
    `const api = game.modules.get(${JSON.stringify(MODULE_ID)})?.api;`,
    "if ( !api ) return ui.notifications.error(\"Stat Block Importer is not active.\");",
    `return api.execute(${id}, { itemUuid: ${uuid}, actor, token, speaker, event: typeof event !== "undefined" ? event : null });`
  ].join("\n");
}

function sanitizeComment(text) { return String(text ?? "").replace(/[\r\n*/\\]/g, " ").slice(0, 120); }

/**
 * Build Macro document data.
 */
export function buildMacroData(spec, refs, { img }={}) {
  const command = renderMacroCommand(spec, refs);
  return {
    name: `${refs.itemName ?? "Item"}: ${spec.label ?? spec.kind}`.slice(0, 100),
    type: "script",
    scope: "actor",
    img: img ?? "icons/svg/dice-target.svg",
    command,
    flags: { [FLAG_SCOPE]: { [FLAGS.MACRO]: { mechanicId: spec.id, itemUuid: refs.itemUuid ?? null, specVersion: spec.version ?? MECHANIC_SPEC_VERSION, moduleVersion: MODULE_VERSION, hash: fingerprint(command) } } }
  };
}

export const macroGenerator = {
  renderMacroCommand,
  buildMacroData,

  /** Find an existing generated macro for a mechanic. */
  findExisting(mechanicId) {
    return globalThis.game?.macros?.find?.(m => m.getFlag?.(FLAG_SCOPE, FLAGS.MACRO)?.mechanicId === mechanicId) ?? null;
  },

  /**
   * Create or update the wrapper macro for a mechanic. Idempotent: the same mechanic id always maps
   * to one macro; regeneration updates the command when the template changed.
   * @returns {Promise<Macro|null>}
   */
  async ensureMacro(spec, refs, { user=globalThis.game?.user, img }={}) {
    const data = buildMacroData(spec, refs, { img });
    const existing = this.findExisting(spec.id);
    if ( existing ) {
      const hash = existing.getFlag(FLAG_SCOPE, FLAGS.MACRO)?.hash;
      if ( hash !== data.flags[FLAG_SCOPE][FLAGS.MACRO].hash && existing.isOwner ) await existing.update({ command: data.command, flags: data.flags, name: data.name });
      return existing;
    }
    if ( user && !user.isGM && !user.can?.("MACRO_SCRIPT") ) { diagnostics.warn("User may not create script macros"); return null; }
    const MacroCls = globalThis.Macro ?? globalThis.getDocumentClass?.("Macro");
    const macro = await MacroCls.create(data);
    return macro;
  },

  /** Delete generated macros for an item uuid. */
  async cleanup(itemUuid) {
    const macros = (globalThis.game?.macros?.filter?.(m => m.getFlag?.(FLAG_SCOPE, FLAGS.MACRO)?.itemUuid === itemUuid) ?? []);
    for ( const m of macros ) { if ( m.isOwner ) await m.delete(); }
    return macros.length;
  }
};

export default macroGenerator;
