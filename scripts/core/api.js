import { MODULE_ID, MODULE_VERSION, MECHANIC_SPEC_VERSION, IR_VERSION } from "./constants.js";
import diagnostics from "./diagnostics.js";
import { compatibility, COMPATIBILITY_MATRIX } from "./compatibility.js";
import * as permissions from "./permissions.js";
import { pipeline } from "../import/pipeline.js";
import { importBundle } from "../import/importer.js";
import { runtime } from "../automation/runtime.js";
import { triggerRegistry } from "../automation/trigger-registry.js";
import { macroGenerator } from "../automation/macro-generator.js";
import { interpret } from "../rules/interpreter.js";
import { mechanicRegistry } from "../rules/mechanic-registry.js";
import { validateFormula } from "../rules/formula-validator.js";
import { detectFormat } from "../import/format-detector.js";
import { ImporterApplication } from "../ui/importer-app.js";

/**
 * Public API exposed on `game.modules.get("stat-block-importer").api` and `globalThis.StatBlockImporter`.
 */
export function buildApi() {
  return Object.freeze({
    id: MODULE_ID,
    version: MODULE_VERSION,
    versions: { mechanicSpec: MECHANIC_SPEC_VERSION, ir: IR_VERSION },
    diagnostics,
    compatibility,
    compatibilityMatrix: COMPATIBILITY_MATRIX,
    permissions,
    pipeline,
    detectFormat,
    interpret,
    mechanicRegistry,
    validateFormula,
    runtime,
    triggerRegistry,
    macroGenerator,
    importBundle,
    /** Open the importer application. */
    open: (options={}) => new ImporterApplication(options).render({ force: true }),
    /**
     * Entry point used by generated macro wrappers. Validates the mechanic id and delegates to the
     * runtime; never evaluates imported text.
     */
    execute: (mechanicId, context={}) => runtime.executeInteractive(mechanicId, context),
    /** Entry point used by Midi-QOL `function.` on-use macros. */
    midi: {
      damageBonus: (args) => runtime.integrations.midiDamageBonus(args),
      onUse: (args) => runtime.integrations.midiOnUse(args)
    }
  });
}
