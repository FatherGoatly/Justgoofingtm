/**
 * Project: a multi-target encounter report
 * Level: Intermediate. Lesson: t2-encounter-utility (The Game Master's Macro Academy, Tier 2).
 * Exercise: t2-encounter-utility-build (build-project). Tested in: the Foundry emulator with the "practice" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: any (core Foundry APIs only).
 * Access: reads=true writes=false creates=false mechanics=false.
 *
 * Write the report macro for Foundry Preview. It must: warn (`ui.notifications.warn`) and stop when there are no tokens; otherwise group every token on the scene by disposition using `token.actor?.system?.attributes?.hp` (skip tokens without HP data), mark tokens at or below half HP with the word `bloodied`, and post ONE chat message whispered to the GM whose text contains `Hostile`, `Friendly`, the…
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
const tokens = canvas.tokens.placeables;
if (!tokens.length) { ui.notifications.warn("No tokens on this scene."); return; }
const names = { [CONST.TOKEN_DISPOSITIONS.FRIENDLY]: "Friendly", [CONST.TOKEN_DISPOSITIONS.NEUTRAL]: "Neutral", [CONST.TOKEN_DISPOSITIONS.HOSTILE]: "Hostile", [CONST.TOKEN_DISPOSITIONS.SECRET]: "Secret" };
const groups = {};
for (const token of tokens) {
  const hp = token.actor?.system?.attributes?.hp;
  if (!hp) continue;
  const key = names[token.document.disposition] ?? "Other";
  groups[key] ??= [];
  groups[key].push(`${token.name} ${hp.value}/${hp.max}${hp.value <= hp.max / 2 ? " (bloodied)" : ""}`);
}
const lines = Object.entries(groups).map(([name, labels]) => `<p><strong>${name}</strong> (${labels.length}): ${labels.join("; ")}</p>`);
await ChatMessage.create({ content: "<h3>Encounter report</h3>" + lines.join(""), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
