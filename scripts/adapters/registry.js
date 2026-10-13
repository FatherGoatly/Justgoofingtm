import { CoreAdapter } from "./foundry/core-adapter.js";
import { Dnd5eAdapter } from "./dnd5e/dnd5e-adapter.js";
import { describeEnvironment } from "../core/compatibility.js";
import { detectMidiQOL, MIDI_QOL } from "./integrations/midi-qol.js";

const ADAPTERS = [Dnd5eAdapter, CoreAdapter];

/**
 * Pick the adapter for the current environment.
 * @param {object} [env]
 * @returns {import("./base-adapter.js").SystemAdapter}
 */
export function getActiveAdapter(env=describeEnvironment()) {
  const Cls = ADAPTERS.find(a => a.matches(env)) ?? CoreAdapter;
  return new Cls(env);
}

/** All adapters with their declared compatibility. */
export function listAdapters() { return ADAPTERS.map(a => ({ id: a.id, title: a.title, verified: a.verified })); }

/** Integration detectors keyed by module id. */
export const INTEGRATIONS = Object.freeze({ [MIDI_QOL.id]: { info: MIDI_QOL, detect: detectMidiQOL } });

/** Register an additional adapter (for other systems). */
export function registerAdapter(Cls) { if ( !ADAPTERS.includes(Cls) ) ADAPTERS.unshift(Cls); }
