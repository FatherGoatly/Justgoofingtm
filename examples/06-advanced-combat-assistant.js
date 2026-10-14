/**
 * Project: a configurable combat assistant
 * Level: Advanced. Lesson: t5-combat-assistant (The Game Master's Macro Academy, Tier 5).
 * Exercise: t5-combat-assistant-build (build-project). Tested in: the Foundry emulator with the "practice" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: dnd5e 6.0.0+ (verified 6.0.6).
 * Access: reads=true writes=true creates=true mechanics=true.
 *
 * Build the full assistant: a `DEFAULTS` object (ability, dc, amount, type, halfOnSave); a guard that stops with a warning unless `game.user.isGM` and `game.system.id === "dnd5e"`; `askSettings` (DialogV2.input, validated, null on cancel); `selectTargets` returning `{ tokens, source }` (living targeted tokens, else living hostile combatants from `game.combat`, else none, with a warning); `resolve` p…
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
const D = foundry.applications.api.DialogV2;
const esc = foundry.utils.escapeHTML;
const DEFAULTS = { ability: "dex", dc: 13, amount: 10, type: "fire", halfOnSave: true };
if (!game.user.isGM) return ui.notifications.warn("GM only.");
if (game.system.id !== "dnd5e") return ui.notifications.warn("Requires dnd5e.");

async function askSettings(d) {
  const data = await D.input({ window: { title: "Area effect" }, content: `<label>Save DC <input name="dc" type="number" value="${d.dc}" min="1"></label><label>Damage <input name="amount" type="number" value="${d.amount}" min="0"></label><label>Type <input name="type" type="text" value="${d.type}"></label><label><input name="halfOnSave" type="checkbox" ${d.halfOnSave ? "checked" : ""}> Half on save</label>` });
  if (!data) return null;
  const dc = Number(data.dc), amount = Number(data.amount);
  if (!Number.isInteger(dc) || dc < 1 || !Number.isInteger(amount) || amount < 0) { ui.notifications.error("DC and damage must be whole numbers."); return null; }
  return { ...d, dc, amount, type: String(data.type || d.type).trim().toLowerCase(), halfOnSave: Boolean(data.halfOnSave) };
}

function selectTargets() {
  const living = t => t.actor && (t.actor.system?.attributes?.hp?.value ?? 1) > 0;
  const targeted = [...game.user.targets].filter(living);
  if (targeted.length) return { tokens: targeted, source: "targets" };
  const combat = game.combat;
  if (!combat) return { tokens: [], source: "none" };
  const hostile = combat.combatants.filter(c => !c.isDefeated && c.token && c.token.disposition === -1).map(c => c.token.object).filter(living);
  return { tokens: hostile, source: "hostile combatants" };
}

async function resolve(token, s) {
  const actor = token.actor;
  const rolls = await actor.rollSavingThrow({ ability: s.ability, target: s.dc }, { configure: false }, { create: false });
  const total = rolls ? rolls[0].total : null;
  const saved = total !== null && total >= s.dc;
  const dmg = saved ? (s.halfOnSave ? Math.floor(s.amount / 2) : 0) : s.amount;
  if (dmg > 0) await actor.applyDamage([{ value: dmg, type: s.type }]);
  const hp = actor.system.attributes.hp;
  return { name: token.name, total, saved, dmg, hp: `${hp.value}/${hp.max}`, down: hp.value === 0 };
}

async function report(results, s, source) {
  const rows = results.map(r => `<li>${esc(r.name)}: ${r.saved ? "saved" : "failed"} (${r.total ?? "-"}), ${r.dmg} ${esc(s.type)}, HP ${r.hp}${r.down ? " (down)" : ""}</li>`);
  await ChatMessage.create({ content: `<p>Area effect, DC ${s.dc} ${esc(s.ability)} save, source: ${esc(source)}</p><ul>${rows.join("")}</ul>`, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
}

const settings = await askSettings(DEFAULTS);
if (!settings) return;
const { tokens, source } = selectTargets();
if (!tokens.length) return ui.notifications.warn("No eligible targets (target tokens or start a combat with hostile creatures).");
const results = [];
for (const t of tokens) results.push(await resolve(t, settings));
await report(results, settings, source);
