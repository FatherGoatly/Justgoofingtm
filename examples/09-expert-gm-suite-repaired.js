/**
 * Project: repair a broken automation suite
 * Level: Expert. Lesson: t8-repair-suite (The Game Master's Macro Academy, Tier 8).
 * Exercise: t8-repair-suite-build (build-project). Tested in: the Foundry emulator with the "practice" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: dnd5e 6.0.0+ (verified 6.0.6).
 * Access: reads=true writes=true creates=true mechanics=true.
 *
 * Repair the suite so that, on the practice snapshot with the scripted answer 5: both characters are healed through awaited updates (Reginald 29, Mirabel 14), `isBloodied` is a pure predicate (value > 0 and ≤ half max) and only creatures that satisfy it are marked (`toggleStatusEffect("bloodied", { active: true })`), the turn announcer is registered through a named registry so running `registerAnnou…
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
// GM Suite 2.0.0. Verified: Foundry 14.369, dnd5e 6.0.6. Requires GM.
const esc = foundry.utils.escapeHTML;
function isBloodied(hp) { return hp.value > 0 && hp.value <= hp.max / 2; }
function healedValue(hp, amount) { return Math.min(hp.max, hp.value + amount); }
const party = game.actors.contents.filter(a => a.type === "character");
async function healParty(amount) {
  const healed = [], failed = [];
  for (const a of party) {
    try {
      const hp = a.system.attributes.hp;
      await a.update({ "system.attributes.hp.value": healedValue(hp, amount) });
      healed.push(`${a.name} ${a.system.attributes.hp.value}`);
    } catch (err) { console.warn("heal failed", a.name, err.message); failed.push(a.name); }
  }
  return { healed, failed };
}
async function markBloodied() {
  const marked = [];
  for (const t of canvas.tokens.placeables) {
    if (!t.actor) continue;
    if (isBloodied(t.actor.system.attributes.hp)) { await t.actor.toggleStatusEffect("bloodied", { active: true }); marked.push(t.name); }
  }
  return marked;
}
const reg = globalThis.gmSuite ??= { hooks: {} };
function registerAnnouncer() {
  if (reg.hooks.turn) Hooks.off("combatTurn", reg.hooks.turn);
  reg.hooks.turn = Hooks.on("combatTurn", (combat, data) => ChatMessage.create({ content: `<b>${esc(combat.turns[data.turn]?.name ?? "?")}</b> is up!` }));
}
registerAnnouncer();
registerAnnouncer();
const results = [];
function test(name, fn) { try { fn(); results.push("PASS " + name); } catch (err) { results.push("FAIL " + name + ": " + err.message); } }
const equal = (a, b) => { if (a !== b) throw new Error(`expected ${b}, got ${a}`); };
test("regression: half is bloodied", () => equal(isBloodied({ value: 15, max: 30 }), true));
test("regression: zero is not bloodied", () => equal(isBloodied({ value: 0, max: 30 }), false));
test("regression: heal caps at max", () => equal(healedValue({ value: 28, max: 30 }, 5), 30));
console.log(results.join("\n"));
const data = await foundry.applications.api.DialogV2.input({ window: { title: "Heal party" }, content: '<input name="amount" type="number" value="5" min="1">' });
if (!data) return;
const amount = Number(data.amount);
if (!Number.isInteger(amount) || amount < 1) return ui.notifications.error("Enter a whole number of at least 1.");
const { healed, failed } = await healParty(amount);
const marked = await markBloodied();
await ChatMessage.create({ content: `<p>Suite: healed ${esc(healed.join(", ") || "nobody")}${failed.length ? "; failed: " + esc(failed.join(", ")) : ""}; bloodied: ${esc(marked.join(", ") || "nobody")}</p>`, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
console.log("handlers:", Hooks.events.combatTurn.length);
