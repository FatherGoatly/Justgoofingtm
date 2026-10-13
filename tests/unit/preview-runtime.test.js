import { describe, it, expect } from "vitest";
import { PreviewRuntime, mergeObject, expandObject } from "../../scripts/workshop/preview-runtime.js";
import { createPracticeSnapshot } from "../../scripts/workshop/practice-snapshot.js";
import { runProgram } from "../../scripts/workshop/harness.js";
import { seededRandom } from "../../scripts/workshop/dice.js";

async function run(code, { inputs=[], gm=true, system="dnd5e", tests=[] }={}) {
  const rt = new PreviewRuntime(createPracticeSnapshot({ gm, system }), { inputs, random: seededRandom(3) });
  const r = await runProgram({ code, globals: rt.globals, tests });
  return { ...r, ...rt.results };
}

describe("Foundry preview emulator", () => {
  it("exposes controlled tokens with actors and system data", async () => {
    const r = await run(`const names = canvas.tokens.controlled.map(t => t.name); const hp = canvas.tokens.controlled[0].actor.system.attributes.hp.value; return { names, hp };`);
    expect(r.ok).toBe(true);
    expect(r.returnValue).toEqual({ names: ["Sir Reginald", "Mirabel"], hp: 24 });
  });
  it("records chat messages and notifications", async () => {
    const r = await run(`await ChatMessage.create({ content: "Hello <b>world</b>", speaker: ChatMessage.getSpeaker() }); ui.notifications.warn("careful");`);
    expect(r.chat[0].content).toBe("Hello <b>world</b>");
    expect(r.chat[0].speaker.alias).toBe("Sir Reginald");
    expect(r.notifications).toEqual([{ type: "warn", message: "careful", options: {} }]);
  });
  it("applies and records updates", async () => {
    const r = await run(`const a = game.actors.getName("Orc War Chief"); await a.update({ "system.attributes.hp.value": 10 }); return a.system.attributes.hp.value;`);
    expect(r.returnValue).toBe(10);
    expect(r.updates[0]).toMatchObject({ name: "Orc War Chief", data: { "system.attributes.hp.value": 10 } });
  });
  it("enforces ownership for players", async () => {
    const r = await run(`const a = game.actors.getName("Orc War Chief"); await a.update({ name: "x" });`, { gm: false });
    expect(r.ok).toBe(false);
    expect(r.error.message).toMatch(/Permission denied/);
    const own = await run(`const a = game.actors.getName("Sir Reginald"); await a.update({ name: "Reg" }); return a.name;`, { gm: false });
    expect(own.returnValue).toBe("Reg");
  });
  it("rolls dice and posts roll messages", async () => {
    const r = await run(`const roll = new Roll("1d20 + @prof", { prof: 2 }); await roll.evaluate(); await roll.toMessage({ flavor: "Test" }); return roll.total;`);
    expect(r.rolls.length).toBe(1);
    expect(r.returnValue).toBeGreaterThanOrEqual(3);
    expect(r.chat[0].flavor).toBe("Test");
  });
  it("answers dialogs from scripted inputs and treats missing input as cancel", async () => {
    const r = await run(`const d = await foundry.applications.api.DialogV2.input({ window: { title: "Damage" }, content: '<input name="amount" type="number">' }); const ok = await foundry.applications.api.DialogV2.confirm({ content: "Sure?" }); const c = await foundry.applications.api.DialogV2.confirm({ content: "Again?" }); return { d, ok, c };`, { inputs: [12, true] });
    expect(r.returnValue).toEqual({ d: { amount: 12 }, ok: true, c: null });
    expect(r.dialogs.length).toBe(3);
    expect(r.warnings.length).toBe(1);
  });
  it("emulates dnd5e workflows and refuses them for other systems", async () => {
    const r = await run(`const a = game.actors.getName("Sir Reginald"); await a.applyDamage(8); const [roll] = await a.rollSavingThrow({ ability: "dex" }); return [a.system.attributes.hp.temp, a.system.attributes.hp.value, roll.total > 0];`);
    expect(r.returnValue).toEqual([0, 21, true]);
    expect(r.mechanics.map(m => m.type)).toEqual(["applyDamage", "rollSavingThrow"]);
    const g = await run(`await game.actors.getName("Sir Reginald").applyDamage(1);`, { system: "generic" });
    expect(g.ok).toBe(false);
    expect(g.error.message).toMatch(/dnd5e/);
  });
  it("supports combat, hooks, fromUuid and settings", async () => {
    const r = await run(`Hooks.on("updateActor", () => {}); game.settings.register("x", "y", { default: 1 }); await game.settings.set("x", "y", 2); const c = game.combat; await c.nextTurn(); const doc = await fromUuid("Actor.acaReginald01"); return [c.combatant.name, doc.name, game.settings.get("x", "y"), c.round];`);
    expect(r.returnValue).toEqual(["Goblin Scout A", "Sir Reginald", 2, 2]);
    expect(r.hooks[0].name).toBe("updateActor");
  });
  it("explains deprecated and unsupported APIs", async () => {
    const r = await run(`new Dialog({});`);
    expect(r.error.message).toMatch(/DialogV2/);
    const n = await run(`await foundry.applications.handlebars.renderTemplate("x");`);
    expect(n.error.message).toMatch(/not part of the Foundry Preview emulation/);
  });
  it("toggles status effects", async () => {
    const r = await run(`const a = canvas.tokens.controlled[0].actor; await a.toggleStatusEffect("prone"); return [a.statuses.has("prone"), a.effects.size];`);
    expect(r.returnValue).toEqual([true, 1]);
  });
  it("utility helpers behave like foundry.utils", () => {
    expect(expandObject({ "a.b": 1, c: 2 })).toEqual({ a: { b: 1 }, c: 2 });
    expect(mergeObject({ a: { b: 1 } }, { "a.c": 2 }, { inplace: false })).toEqual({ a: { b: 1, c: 2 } });
  });
});
