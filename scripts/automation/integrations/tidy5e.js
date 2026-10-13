import { BaseAdapter } from "./base-adapter.js";

/**
 * Tidy 5e Sheets adapter (V14 branch, dnd5e 6.0.x).
 *
 * Presentation only: imported data stays valid in the base dnd5e sheets. When the Tidy API is
 * present (`Hooks.once("tidy5e-sheet.ready", api)`), the adapter registers nothing that would alter
 * data; it only records availability so the report can mention that sheets are Tidy.
 */
export class Tidy5eAdapter extends BaseAdapter {
  id = "tidy5e-sheet";

  name = "Tidy 5e Sheets";

  minVersion = "0.0";

  verifiedVersion = null;

  capabilities = [{ id: "sheet.tidy5e", priority: 1, description: "Tidy 5e sheet presentation" }];

  verifyApi() { return { ok: true, problems: [] }; }
}

export default Tidy5eAdapter;
