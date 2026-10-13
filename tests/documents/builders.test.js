import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runPipeline } from "../../scripts/import/pipeline.js";
import { buildItem, damageData } from "../../scripts/documents/item-builder.js";
import { buildActor } from "../../scripts/documents/actor-builder.js";
import { buildEffect, isAllowedChangeKey, effectDuration } from "../../scripts/documents/effect-builder.js";
import { createEffect } from "../../scripts/import/schema.js";

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const entry = name => runPipeline(fixture(name)).entries[0];

describe("effect builder", () => {
  it("builds a V14 effect with system.changes and statuses", () => {
    const eff = createEffect({ name: "Paralyzed", statuses: ["paralyzed"], duration: { value: "1", units: "minute" }, changes: [{ key: "system.attributes.ac.bonus", value: "1", type: "add" }] });
    const { data, warnings } = buildEffect(eff);
    expect(warnings).toEqual([]);
    expect(data.type).toBe("base");
    expect(data.statuses).toEqual(["paralyzed"]);
    expect(data.duration).toEqual({ value: 1, units: "minutes", expiry: "turnStart" });
    expect(data.system.changes[0]).toMatchObject({ key: "system.attributes.ac.bonus", value: "1", type: "add", phase: "initial" });
    expect(data._id).toHaveLength(16);
  });

  it("drops forbidden change keys", () => {
    const eff = createEffect({ changes: [{ key: "ownership.default", value: "3" }, { key: "flags.core.sheetClass", value: "x" }, { key: "name", value: "y" }, { key: "system.traits.dr.value", value: "fire" }] });
    const { data, warnings } = buildEffect(eff);
    expect(data.system.changes).toHaveLength(1);
    expect(warnings).toHaveLength(3);
    expect(isAllowedChangeKey("system.__proto__.x")).toBe(false);
  });

  it("maps durations", () => {
    expect(effectDuration({ value: "1", units: "turn", expiry: "turnEnd" })).toEqual({ value: 1, units: "turns", expiry: "turnEnd" });
    expect(effectDuration({ value: "", units: "inst" })).toEqual({});
  });
});

describe("item builder", () => {
  it("builds a magic weapon with native extra damage", () => {
    const ir = runPipeline("Frost Blade\nWeapon (longsword), rare\nWhen you hit a creature with this magic weapon, the target takes an extra 1d6 cold damage.").entries[0];
    const { data, warnings } = buildItem(ir);
    expect(data.type).toBe("weapon");
    expect(data.system.type).toEqual({ value: "martialM", baseItem: "longsword" });
    expect(data.system.damage.base).toMatchObject({ number: 1, denomination: 8, bonus: "", types: ["slashing"] });
    expect(data.system.damage.versatile).toMatchObject({ number: 1, denomination: 10 });
    expect(data.system.properties).toEqual(expect.arrayContaining(["ver", "mgc"]));
    expect(data.system.rarities).toEqual(["rare"]);
    const act = Object.values(data.system.activities)[0];
    expect(act.type).toBe("attack");
    expect(act.attack).toMatchObject({ type: { value: "melee", classification: "weapon" }, flat: false });
    expect(act.damage.includeBase).toBe(true);
    expect(act.damage.parts).toHaveLength(1);
    expect(act.damage.parts[0]).toMatchObject({ number: 1, denomination: 6, types: ["cold"] });
    expect(data.flags["stat-block-importer"].mechanics.length).toBeGreaterThan(0);
    expect(data.flags["stat-block-importer"].import.fingerprint).toBeTruthy();
    expect(warnings).toEqual([]);
  });

  it("builds Flame Tongue with two attack activities", () => {
    const { data } = buildItem(entry("flame-tongue.txt"));
    const acts = Object.values(data.system.activities);
    expect(acts).toHaveLength(2);
    expect(acts[1].name).toBe("Attack (Ablaze)");
    expect(acts[1].damage.parts[0]).toMatchObject({ number: 2, denomination: 6, types: ["fire"] });
    expect(acts[1].visibility.requireMagic).toBe(true);
    expect(data.system.attunement).toBe("required");
  });

  it("builds a wand with charges and a potion with a consuming heal activity", () => {
    const wand = buildItem(entry("wand-of-magic-missiles.txt")).data;
    expect(wand.type).toBe("equipment");
    expect(wand.system.type.value).toBe("wand");
    expect(wand.system.uses).toEqual({ spent: 0, max: "7", recovery: [{ period: "dawn", type: "formula", formula: "1d6 + 1" }] });
    const potion = buildItem(entry("potion-of-healing.txt")).data;
    expect(potion.type).toBe("consumable");
    expect(potion.system.type.value).toBe("potion");
    expect(potion.system.uses.max).toBe("1");
    const heal = Object.values(potion.system.activities)[0];
    expect(heal.type).toBe("heal");
    expect(heal.healing).toMatchObject({ number: 2, denomination: 4, bonus: "2", types: ["healing"] });
    expect(heal.consumption.targets[0]).toMatchObject({ type: "itemUses", value: "1" });
  });

  it("builds a spell with scaling and a save activity", () => {
    const { data } = buildItem(entry("fireball.txt"));
    expect(data.type).toBe("spell");
    expect(data.system.level).toBe(3);
    expect(data.system.school).toBe("evo");
    expect(data.system.activation).toEqual({ type: "action", value: 1, condition: "" });
    expect(data.system.range).toEqual({ value: 150, units: "ft", special: "" });
    expect(data.system.target.template).toMatchObject({ type: "sphere", size: "20" });
    expect(data.system.properties).toEqual(["vocal", "somatic", "material"]);
    const save = Object.values(data.system.activities)[0];
    expect(save.type).toBe("save");
    expect(save.save).toMatchObject({ ability: ["dex"], dc: { calculation: "spellcasting", formula: "" } });
    expect(save.damage.onSave).toBe("half");
    expect(save.damage.parts[0]).toMatchObject({ number: 8, denomination: 6, types: ["fire"], scaling: { mode: "whole", number: 1 } });
  });

  it("links applied condition effects to the save activity", () => {
    const ir = runPipeline("Horn of Fear\nWondrous item, rare\nYou can use an action to blow the horn. Each creature within 30 feet of you must succeed on a DC 15 Wisdom saving throw or be frightened for 1 minute.").entries[0];
    const { data } = buildItem(ir);
    const save = Object.values(data.system.activities).find(a => a.type === "save");
    expect(data.effects).toHaveLength(1);
    expect(data.effects[0].statuses).toEqual(["frightened"]);
    expect(data.effects[0].transfer).toBe(false);
    expect(save.effects).toEqual([{ _id: data.effects[0]._id, onSave: false }]);
    expect(save.save.dc).toEqual({ calculation: "", formula: "15" });
  });

  it("converts complex formulas to custom damage", () => {
    expect(damageData("1d8 + 1d4", "fire", [])).toMatchObject({ custom: { enabled: true, formula: "1d8 + 1d4" }, types: ["fire"] });
    expect(damageData("1d8 + @mod", "healing", [])).toMatchObject({ number: 1, denomination: 8, bonus: "@mod" });
    const w = [];
    expect(damageData("1d8 + eval(x)", "fire", w)).toBeNull();
    expect(w).toHaveLength(1);
  });
});

describe("actor builder", () => {
  it("builds an NPC with reconciled attacks, saves and skills", async () => {
    const ir = entry("adult-red-dragon-2024.txt");
    const { data, warnings } = await buildActor(ir);
    expect(data.type).toBe("npc");
    expect(data.system.abilities.str.value).toBe(27);
    expect(data.system.abilities.dex).toMatchObject({ proficient: 1 });
    expect(data.system.abilities.dex.save).toBeUndefined(); // +0 mod +6 prof = +6 matches
    expect(data.system.skills.prc.value).toBe(2); // +1 mod + 2*6 = 13
    expect(data.system.skills.ste.value).toBe(1); // +0 + 6
    expect(data.system.attributes.hp).toMatchObject({ value: 256, max: 256, formula: "19d12 + 133" });
    expect(data.system.attributes.ac).toEqual({ flat: 19, calc: "flat" });
    expect(data.system.attributes.movement.speeds).toEqual({ walk: "40", fly: "80", climb: "40" });
    expect(data.system.attributes.senses.ranges).toEqual({ darkvision: 120, blindsight: 60 });
    expect(data.system.details.type.value).toBe("dragon");
    expect(data.system.details.cr).toBe(17);
    expect(data.system.resources.legact.max).toBe(3);
    expect(data.system.resources.legres.max).toBe(3);
    expect(data.system.traits.di.value).toEqual(["fire"]);
    expect(data.system.traits.languages.value).toEqual(["common", "draconic"]);
    expect(data.prototypeToken).toMatchObject({ width: 3, height: 3, disposition: -1, actorLink: false });
    // Rend: +14 to hit = STR +8 + PB 6 → ability str, no flat bonus; damage 1d10 + 8 → base 1d10 with no extra bonus
    const rend = data.items.find(i => i.name === "Rend");
    const atk = Object.values(rend.system.activities)[0];
    expect(atk.attack).toMatchObject({ ability: "str", bonus: "", flat: false });
    expect(rend.system.damage.base).toMatchObject({ number: 1, denomination: 10, bonus: "" });
    expect(atk.damage.parts[0]).toMatchObject({ number: 2, denomination: 4, types: ["fire"] });
    expect(rend.system.type.value).toBe("natural");
    expect(rend.system.equipped).toBe(true);
    // Fire Breath: save activity, recharge, consumption
    const breath = data.items.find(i => i.name === "Fire Breath");
    expect(breath.system.uses).toEqual({ spent: 0, max: "1", recovery: [{ period: "recharge", type: "recoverAll", formula: "5" }] });
    const save = Object.values(breath.system.activities)[0];
    expect(save.save.dc).toEqual({ calculation: "", formula: "21" });
    expect(save.target.template).toMatchObject({ type: "cone", size: "60" });
    expect(save.consumption.targets[0].type).toBe("itemUses");
    // Legendary actions keep their activation
    const pounce = data.items.find(i => i.name === "Pounce");
    expect(Object.values(pounce.system.activities)[0].activation).toMatchObject({ type: "legendary", value: 1 });
    // Spellcasting without a resolver creates placeholder spells
    const placeholders = data.items.filter(i => i.type === "spell");
    expect(placeholders.map(p => p.name)).toContain("Fireball");
    expect(placeholders.find(p => p.name === "Fireball").system.uses).toMatchObject({ max: "1", recovery: [{ period: "day" }] });
    expect(warnings.some(w => /placeholder/.test(w))).toBe(true);
  });

  it("uses a spell resolver to create cast activities", async () => {
    const ir = entry("adult-red-dragon-2024.txt");
    const { data } = await buildActor(ir, { resolveSpell: async name => ({ uuid: `Compendium.dnd5e.spells24.Item.${name.replace(/\s/g, "")}`, level: 3 }) });
    const feat = data.items.find(i => i.name === "Spellcasting");
    const casts = Object.values(feat.system.activities);
    expect(casts.every(a => a.type === "cast")).toBe(true);
    expect(casts.find(a => a.name === "Fireball")).toMatchObject({ spell: { level: 5, spellbook: true }, uses: { max: "1" } });
    expect(casts.find(a => a.name === "Fireball").consumption.targets[0].type).toBe("activityUses");
    expect(data.items.filter(i => i.type === "spell")).toHaveLength(0);
  });

  it("handles goblins: armored AC flat, dex attacks, scimitar and bow damage", async () => {
    const { data } = await buildActor(entry("goblin-2014.txt"));
    const scim = data.items.find(i => i.name === "Scimitar");
    const atk = Object.values(scim.system.activities)[0];
    expect(atk.attack.ability).toBe("dex"); // +4 = dex +2 + pb 2
    expect(scim.system.damage.base).toMatchObject({ number: 1, denomination: 6, bonus: "" });
    expect(data.system.attributes.ac).toEqual({ flat: 15, calc: "flat" });
    expect(data.system.skills.ste.value).toBe(2); // +6 = +2 +2*2
    expect(data.system.details.cr).toBe(0.25);
  });

  it("builds a multiclass character with class, subclass, species and background items", async () => {
    const { data, placeholders } = await buildActor(entry("character-sheet.txt"));
    expect(data.type).toBe("character");
    const classes = data.items.filter(i => i.type === "class");
    expect(classes.map(c => [c.name, c.system.levels, c.system.hd.denomination])).toEqual([["Fighter", 5, "d10"], ["Wizard", 2, "d6"]]);
    expect(classes[1].system.spellcasting).toMatchObject({ progression: "full", ability: "int" });
    const sub = data.items.find(i => i.type === "subclass");
    expect(sub).toMatchObject({ name: "Battle Master", system: { classIdentifier: "fighter" } });
    expect(data.items.find(i => i.type === "race").name).toBe("Half-Elf");
    expect(data.items.find(i => i.type === "background").name).toBe("Soldier");
    expect(data.system.details.originalClass).toBe("fighter");
    expect(data.system.abilities.str.proficient).toBe(1);
    expect(data.system.skills.prc.value).toBe(2);
    expect(data.system.attributes.hp).toMatchObject({ value: 52, max: 60 });
    expect(data.system.traits.armorProf.value).toEqual(expect.arrayContaining(["lgt", "med", "hvy", "shl"]));
    expect(data.system.tools.smith).toBeTruthy();
    expect(data.system.currency).toMatchObject({ gp: 25, sp: 12 });
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it("resolves placeholders through the item resolver", async () => {
    const { data } = await buildActor(entry("character-sheet.txt"), { resolveItem: async (name) => name === "Longsword" ? { name: "Longsword", type: "weapon", _id: "zzz", ownership: { default: 3 }, system: { quantity: 1 } } : null });
    const sword = data.items.find(i => i.name === "Longsword");
    expect(sword.type).toBe("weapon");
    expect(sword._id).toBeUndefined();
    expect(sword.ownership).toBeUndefined();
    expect(sword.flags["stat-block-importer"]).toBeTruthy();
  });
});
