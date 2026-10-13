import { MidiQolAdapter } from "./midi-qol.js";
import { DaeAdapter } from "./dae.js";
import { DfredsAdapter } from "./dfreds.js";
import { TimesUpAdapter } from "./times-up.js";
import { Tidy5eAdapter } from "./tidy5e.js";

export const ADAPTER_CLASSES = [MidiQolAdapter, DaeAdapter, DfredsAdapter, TimesUpAdapter, Tidy5eAdapter];

/**
 * Register all integration adapters with the compatibility registry.
 * @param {import("../../core/compatibility.js").compatibility} compatibility
 */
export function registerIntegrations(compatibility) {
  for ( const Cls of ADAPTER_CLASSES ) compatibility.registerAdapter(new Cls());
}

export { MidiQolAdapter, DaeAdapter, DfredsAdapter, TimesUpAdapter, Tidy5eAdapter };
