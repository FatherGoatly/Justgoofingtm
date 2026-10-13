/**
 * Optional Midi-QOL adapter.
 *
 * Verified against the Midi-QOL `dnd6` branch (14.6.2, dnd5e 6.0.6): Midi rolls attacks through dnd5e's own roll
 * builder (so `dnd5e.postRollConfiguration` tags the roll and `dnd5e.rollAttack` fires), then merges the roll into
 * its item card. Midi then calls `midi-qol.AttackRollComplete` with the workflow, whose `attackRoll` may be a
 * replacement Roll (bonus flags). The adapter feeds the workflow's attack roll to the pipeline keyed by the
 * workflow id, so a replaced roll object still resolves to the same logical roll.
 *
 * The core detection works without Midi-QOL; this adapter only closes the gap for rolls Midi re-creates.
 */

import { processRoll } from "../roll-processor.js";
import { diagnostics } from "../diagnostics.js";

let registered = false;

export function midiActive() {
  return game.modules.get("midi-qol")?.active === true;
}

function onAttackRollComplete(workflow) {
  try {
    const roll = workflow?.attackRoll;
    const actor = workflow?.actor;
    if ( !roll || !actor ) return;
    const workflowKey = `midi:${workflow.uuid ?? workflow.id ?? workflow.itemCardId ?? ""}:attack`;
    const message = workflow.itemCardId ? game.messages.get(workflow.itemCardId) : null;
    processRoll({ roll, hookName: "rollAttack", subject: actor, message, workflowKey })
      .catch(err => diagnostics.error("Midi-QOL adapter failed", err));
  } catch(err) {
    diagnostics.error("Midi-QOL adapter failed", err);
  }
}

/** Register the adapter if Midi-QOL is active. Idempotent. */
export function registerMidiIntegration() {
  if ( registered || !midiActive() ) return;
  registered = true;
  Hooks.on("midi-qol.AttackRollComplete", onAttackRollComplete);
  diagnostics.log("Midi-QOL adapter registered");
}
