/**
 * Project: a personalised welcome macro
 * Level: Beginner. Lesson: t0-welcome-macro (The Game Master's Macro Academy, Tier 0).
 * Exercise: t0-welcome-macro-build (build-project). Tested in: the Foundry emulator with the "practice" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: any (core Foundry APIs only).
 * Access: reads=true writes=false creates=false mechanics=false.
 *
 * Write the full welcome macro: (1) a public banner containing the word `Welcome`, (2) a public session line containing `Session`, (3) a GM-only whisper containing `GM note`, in that order. Use your own campaign names.
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
await ChatMessage.create({ content: "<h2>Welcome back to Greyhollow</h2>" });
await ChatMessage.create({ content: "<p>Session 7: the siege begins.</p>" });
const gms = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
await ChatMessage.create({ content: "<p><em>GM note: the mayor has the key.</em></p>", whisper: gms });
