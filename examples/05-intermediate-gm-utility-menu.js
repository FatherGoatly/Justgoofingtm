/**
 * Project: a personal GM utility menu
 * Level: Intermediate. Lesson: t4-gm-utility-menu (The Game Master's Macro Academy, Tier 4).
 * Exercise: t4-gm-utility-menu-build (build-project). Tested in: the Foundry emulator with the "practice" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: any (core Foundry APIs only).
 * Access: reads=true writes=true creates=true mechanics=true.
 *
 * Build the menu with at least five tools in a `tools` object (keys of your choice), each `{ label, run }`: (1) token info (whispered chat list of controlled tokens with HP), (2) heal selected (DialogV2.input amount, validated, owned tokens only, update hp capped at max), (3) toggle a condition (DialogV2.input select of `prone`/`blind`, validated, `toggleStatusEffect` on owned actors), (4) jump to s…
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
const esc = foundry.utils.escapeHTML;
const D = foundry.applications.api.DialogV2;
const gm = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id);
const tools = {
  info: { label: "Token info", run: async () => {
    const rows = canvas.tokens.controlled.map(t => { const hp = t.actor?.system?.attributes?.hp; return `<li>${esc(t.name)}: ${hp ? hp.value + "/" + hp.max : "-"}</li>`; });
    if (!rows.length) return ui.notifications.warn("Select tokens.");
    await ChatMessage.create({ content: `<ul>${rows.join("")}</ul>`, whisper: gm() });
  } },
  heal: { label: "Heal selected", run: async () => {
    const tokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
    if (!tokens.length) return ui.notifications.warn("Select tokens you own.");
    const data = await D.input({ window: { title: "Heal" }, content: '<input name="amount" type="number" value="5" min="1">' });
    if (!data) return;
    const amount = Number(data.amount);
    if (!Number.isInteger(amount) || amount < 1) return ui.notifications.warn("Enter a positive whole number.");
    for (const t of tokens) { const hp = t.actor.system.attributes.hp; await t.actor.update({ "system.attributes.hp.value": Math.min(hp.max, hp.value + amount) }); }
    ui.notifications.info(`Healed ${tokens.length} token(s) by ${amount}.`);
  } },
  condition: { label: "Toggle condition", run: async () => {
    const STATUSES = ["prone", "blind"];
    const tokens = canvas.tokens.controlled.filter(t => t.actor?.isOwner);
    if (!tokens.length) return ui.notifications.warn("Select tokens you own.");
    const data = await D.input({ window: { title: "Condition" }, content: `<select name="status">${STATUSES.map(s => `<option value="${s}">${s}</option>`).join("")}</select>` });
    if (!data || !STATUSES.includes(data.status)) return;
    for (const t of tokens) await t.actor.toggleStatusEffect(data.status, { active: true });
    ui.notifications.info(`Applied ${data.status}.`);
  } },
  scene: { label: "Jump to scene", run: async () => {
    const options = game.scenes.contents.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
    const data = await D.input({ window: { title: "Scene" }, content: `<select name="sceneId">${options}</select>` });
    const scene = data && game.scenes.get(data.sceneId);
    if (!scene) return;
    await scene.view();
  } },
  announce: { label: "Announce", run: async () => {
    const data = await D.input({ window: { title: "Announce" }, content: '<input name="text" type="text">' });
    const text = String(data?.text ?? "").trim();
    if (!text) return;
    await ChatMessage.create({ content: `<h3>${esc(text)}</h3>`, speaker: { alias: "GM" } });
  } }
};
const buttons = Object.entries(tools).map(([action, t]) => ({ action, label: t.label }));
buttons.push({ action: "cancel", label: "Cancel", default: true });
const choice = await D.wait({ window: { title: "GM tools" }, content: "<p>Pick a tool.</p>", buttons, rejectClose: false });
if (!choice || choice === "cancel" || !tools[choice]) return;
try {
  await tools[choice].run();
} catch (err) {
  console.error(`GM tool "${choice}" failed`, err);
  ui.notifications.error(`${tools[choice].label} failed: ${err.message}`);
}
