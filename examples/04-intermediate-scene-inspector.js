/**
 * Project: a scene inspector
 * Level: Intermediate. Lesson: t3-scene-inspector (The Game Master's Macro Academy, Tier 3).
 * Exercise: t3-scene-inspector-build (build-project). Tested in: the Foundry emulator with the "practice" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: any (core Foundry APIs only).
 * Access: reads=true writes=false creates=false mechanics=false.
 *
 * Write the inspector. It must post ONE message whispered to GMs containing: the scene name; for each controlled token, its name, its actor's name, the words `linked` or `unlinked`, `owned` or `not owned`, and `hp V/M`; the combat line `Round R, turn: NAME` or `No active combat`; and the user line with the role name from `CONST.USER_ROLE_NAMES`. With no tokens controlled it must contain `No tokens s…
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
const esc = foundry.utils.escapeHTML;
const lines = [`<h3>Scene: ${esc(canvas.scene?.name ?? "none")}</h3>`];
const tokens = canvas.tokens.controlled;
if (!tokens.length) lines.push("<p>No tokens selected</p>");
for (const t of tokens) {
  const hp = t.actor?.system?.attributes?.hp;
  lines.push(`<p><strong>${esc(t.name)}</strong>: actor ${t.actor ? esc(t.actor.name) : "none"}, ${t.document.actorLink ? "linked" : "unlinked"}, ${t.actor?.isOwner ? "owned" : "not owned"}, hp ${hp ? hp.value + "/" + hp.max : "no data"}</p>`);
}
lines.push(`<p>${game.combat ? `Round ${game.combat.round}, turn: ${esc(game.combat.combatant?.name ?? "nobody")}` : "No active combat"}</p>`);
lines.push(`<p>User: ${esc(game.user.name)} (${CONST.USER_ROLE_NAMES[game.user.role]})</p>`);
await ChatMessage.create({ content: lines.join(""), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
