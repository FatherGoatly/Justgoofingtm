/**
 * Project: combat automation with an optional, verified integration
 * Level: Expert. Lesson: t7-integration-project (The Game Master's Macro Academy, Tier 7).
 * Exercise: t7-integration-project-midi (build-project). Tested in: the Foundry emulator with the "practice-midi" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: dnd5e 6.0.0+ (verified 6.0.6).
 * Access: reads=true writes=true creates=true mechanics=true.
 *
 * Run your Thunderous Rebuke macro (the same code as the core-path exercise) on the practice-midi snapshot. It must detect Midi-QOL 14.6.2, use `MidiQOL.findNearby` for the area and `MidiQOL.applyTokenDamage` for damage, roll the save through the system, hit only Goblin Scout A, and whisper the GM a report containing `Backend: Midi-QOL 14.6.2`.
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
// Thunderous Rebuke. Verified: Foundry 14.369, dnd5e 6.0.6. Optional: midi-qol >= 14.6.0 (verified 14.6.2).
const S = { range: 15, dc: 13, amount: 8, type: "thunder", ability: "con" };
function detectMidi(min = "14.6.0") {
  const mod = game.modules.get("midi-qol");
  if (!mod?.active) return { ok: false, reason: mod ? "disabled" : "not installed" };
  if (foundry.utils.isNewerVersion(min, mod.version)) return { ok: false, reason: `${mod.version} < ${min}` };
  const api = globalThis.MidiQOL;
  for (const fn of ["findNearby", "applyTokenDamage"]) if (typeof api?.[fn] !== "function") return { ok: false, reason: "missing " + fn };
  return { ok: true, version: mod.version };
}
const coreAdapter = {
  name: "core",
  area: (o, r) => canvas.tokens.placeables.filter(t => t !== o && t.document.disposition === -1 && (t.actor?.system?.attributes?.hp?.value ?? 0) > 0 && canvas.grid.measurePath([o.center, t.center]).distance <= r),
  damage: async (tokens, parts) => { for (const t of tokens) await t.actor.applyDamage(parts); }
};
const midiAdapter = {
  name: "Midi-QOL",
  area: (o, r) => MidiQOL.findNearby(-1, o, r),
  damage: (tokens, parts) => MidiQOL.applyTokenDamage(parts.map(p => ({ damage: p.value, type: p.type })), parts.reduce((s, p) => s + p.value, 0), new Set(tokens), null, new Set())
};
const d = detectMidi();
const A = d.ok ? { ...midiAdapter, name: "Midi-QOL " + d.version } : coreAdapter;
if (game.system.id !== "dnd5e") return ui.notifications.error("Requires dnd5e.");
const origin = canvas.tokens.controlled[0];
if (!origin) return ui.notifications.warn("Select the caster's token.");
const esc = foundry.utils.escapeHTML;
const lines = [];
for (const t of A.area(origin, S.range)) {
  const rolls = await t.actor.rollSavingThrow({ ability: S.ability, target: S.dc }, { configure: false }, { create: false });
  const total = rolls ? rolls[0].total : null;
  const saved = total !== null && total >= S.dc;
  const dmg = saved ? Math.floor(S.amount / 2) : S.amount;
  if (dmg > 0) await A.damage([t], [{ value: dmg, type: S.type }]);
  lines.push(`<li>${esc(t.name)}: ${saved ? "saved" : "failed"} (${total ?? "-"}), ${dmg} ${S.type}, HP ${t.actor.system.attributes.hp.value}</li>`);
}
await ChatMessage.create({ content: `<p>Thunderous Rebuke. Backend: ${esc(A.name)}${d.ok ? "" : " (" + esc(d.reason) + ")"}</p><ul>${lines.join("") || "<li>no creatures in range</li>"}</ul>`, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
