import { KNOWN_MODULES, satisfiesMinimum } from "../../core/compatibility.js";

/**
 * Detection for Midi-QOL (dnd6 branch, 14.6.x). API names were read from src/midi-qol.ts and src/module/Workflow.ts
 * at tag 14.6.2. Only the surfaces listed in `surfaces` are taught; everything else is treated as private.
 */
export const MIDI_QOL = Object.freeze({
  id: "midi-qol",
  title: "Midi-QOL",
  verified: KNOWN_MODULES["midi-qol"].verified,
  minimum: KNOWN_MODULES["midi-qol"].minimum,
  surfaces: Object.freeze({
    globals: ["MidiQOL.applyTokenDamage", "MidiQOL.completeItemUse", "MidiQOL.completeActivityUse", "MidiQOL.findNearby", "MidiQOL.getDistance", "MidiQOL.hasCondition"],
    hooks: ["midi-qol.ready", "midi-qol.AttackRollComplete", "midi-qol.DamageRollComplete", "midi-qol.RollComplete", "midi-qol.preCheckHits", "midi-qol.postActiveEffects", "midi-qol.targetingComplete"]
  })
});

/**
 * Detect Midi-QOL and verify the API surface we rely on is present.
 * @returns {{active:boolean, version:string|null, versionOk:boolean, apiPresent:boolean, missing:string[]}}
 */
export function detectMidiQOL() {
  const mod = globalThis.game?.modules?.get?.(MIDI_QOL.id);
  const active = Boolean(mod?.active);
  const version = mod?.version ?? null;
  const api = globalThis.MidiQOL;
  const missing = active ? MIDI_QOL.surfaces.globals.filter(path => typeof path.split(".").slice(1).reduce((o, k) => o?.[k], api) !== "function") : [...MIDI_QOL.surfaces.globals];
  return { active, version, versionOk: active && satisfiesMinimum(version, MIDI_QOL.minimum), apiPresent: active && Boolean(api) && missing.length === 0, missing };
}
