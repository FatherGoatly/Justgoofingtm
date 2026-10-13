import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseItemBlock, splitItemBlocks, applyCharges } from "../../scripts/import/parsers/item-parser.js";
import { parseSpellBlock } from "../../scripts/import/parsers/spell-parser.js";
import { parseCharacterSheet } from "../../scripts/import/parsers/character-parser.js";
import { parseSchemaJSON, safeParseJSON, isModuleSchema } from "../../scripts/import/parsers/json-parser.js";
import { parseFoundryExport, isFoundryExport } from "../../scripts/import/parsers/foundry-export-parser.js";
import { markdownToText, sanitizeHTML, htmlToText, parseCSV } from "../../scripts/import/parsers/markup.js";
import { parseCSVItems } from "../../scripts/import/parsers/csv-parser.js";
import { parseStatBlock } from "../../scripts/import/parsers/statblock-parser.js";
import { detectFormat } from "../../scripts/import/format-detector.js";
import { validateEntry, createItem } from "../../scripts/import/schema.js";

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("item parser", () => {
  it("parses a magic weapon family with attunement", () => {
    const item = parseItemBlock(fixture("flame-tongue.txt"));
    expect(item.itemType).toBe("weapon");
    expect(item.rarity).toBe("rare");
    expect(item.attunement).toBe("required");
    expect(item.properties).toContain("mgc");
    expect(item.weapon.baseItem).toBe("longsword");
    expect(item.weapon.damage).toEqual({ formula: "1d8", type: "slashing" });
    expect(item.weapon.versatile).toEqual({ formula: "1d10", type: "slashing" });
    expect(item.activities[0].type).toBe("attack");
    expect(item.warnings.some(w => /family/.test(w))).toBe(true);
    expect(validateEntry(item).errors).toEqual([]);
  });

  it("parses +1 weapons", () => {
    const item = parseItemBlock(fixture("longsword-plus-one.txt"));
    expect(item.weapon.magicalBonus).toBe(1);
    expect(item.weapon.baseItem).toBe("longsword");
    expect(item.rarity).toBe("uncommon");
    expect(item.attunement).toBe("");
  });

  it("parses wand charges and recharge", () => {
    const item = parseItemBlock(fixture("wand-of-magic-missiles.txt"));
    expect(item.itemType).toBe("equipment");
    expect(item.equipmentType).toBe("wand");
    expect(item.uses.max).toBe("7");
    expect(item.uses.recovery[0]).toEqual({ period: "dawn", type: "formula", formula: "1d6 + 1" });
  });

  it("parses potions into heal activities that consume the item", () => {
    const item = parseItemBlock(fixture("potion-of-healing.txt"));
    expect(item.itemType).toBe("consumable");
    expect(item.consumableType).toBe("potion");
    expect(item.uses).toMatchObject({ max: "1", autoDestroy: true });
    expect(item.activities[0].type).toBe("heal");
    expect(item.activities[0].healing.formula).toBe("2d4 + 2");
    expect(item.activities[0].consumption[0]).toMatchObject({ type: "itemUses", value: "1" });
  });

  it("parses armor from a mundane description", () => {
    const item = parseItemBlock("Chain Mail\nArmor (chain mail)\nHeavy armor. AC 16. Str 13. Stealth disadvantage. 75 gp, 55 lb.");
    expect(item.itemType).toBe("equipment");
    expect(item.equipmentType).toBe("heavy");
    expect(item.armor).toMatchObject({ baseItem: "chainmail", value: 16, dex: 0, strength: 13, stealthDisadvantage: true });
    expect(item.price).toEqual({ value: 75, denomination: "gp" });
    expect(item.weight).toBe(55);
  });

  it("recognises recharge variants", () => {
    const item = createItem({ name: "x" });
    applyCharges(item, "The staff has 10 charges and regains all expended charges at dawn.", []);
    expect(item.uses.recovery[0]).toEqual({ period: "dawn", type: "recoverAll", formula: "" });
    applyCharges(item, "It has 3 charges. It regains 1d3 expended charges when you finish a long rest.", []);
    expect(item.uses.recovery[0]).toEqual({ period: "lr", type: "formula", formula: "1d3" });
    const w = [];
    applyCharges(item, "It has 5 charges and can't be recharged.", w);
    expect(item.uses.recovery).toEqual([]);
    expect(w).toEqual([]);
  });

  it("splits several item blocks", () => {
    const blocks = splitItemBlocks(`${fixture("flame-tongue.txt")}\n\n${fixture("potion-of-healing.txt")}`);
    expect(blocks).toHaveLength(2);
  });
});

describe("spell parser", () => {
  it("parses Fireball as a save activity with scaling", () => {
    const spell = parseSpellBlock(fixture("fireball.txt"));
    expect(spell.itemType).toBe("spell");
    expect(spell.spell).toMatchObject({ level: 3, school: "evo", concentration: false, ritual: false });
    expect(spell.spell.range).toEqual({ value: 150, units: "ft" });
    expect(spell.spell.materials.value).toBe("a tiny ball of bat guano and sulfur");
    expect(spell.properties).toEqual(["vocal", "somatic", "material"]);
    const act = spell.activities[0];
    expect(act.type).toBe("save");
    expect(act.save.ability).toEqual(["dex"]);
    expect(act.save.dc.calculation).toBe("spellcasting");
    expect(act.save.onSave).toBe("half");
    expect(act.damage[0]).toMatchObject({ formula: "8d6", types: ["fire"], scaling: { mode: "whole", number: 1 } });
    expect(act.target.template).toMatchObject({ type: "sphere", size: "20" });
    expect(validateEntry(spell).errors).toEqual([]);
  });

  it("parses 2024 layout with concentration and condition", () => {
    const spell = parseSpellBlock(fixture("hold-person.txt"));
    expect(spell.spell).toMatchObject({ level: 2, school: "enc", concentration: true });
    expect(spell.spell.duration).toEqual({ value: "1", units: "minute" });
    expect(spell.properties).toContain("concentration");
    expect(spell.activities[0].type).toBe("save");
    expect(spell.activities[0].save.ability).toEqual(["wis"]);
    expect(spell.activities[0].target.affects.count).toContain("@item.level");
  });

  it("parses healing spells", () => {
    const spell = parseSpellBlock(fixture("cure-wounds.txt"));
    expect(spell.spell.range.units).toBe("touch");
    expect(spell.activities[0].type).toBe("heal");
    expect(spell.activities[0].healing).toMatchObject({ formula: "1d8 + @mod", types: ["healing"], scaling: { mode: "whole", number: 1 } });
  });
});

describe("character parser", () => {
  const actor = parseCharacterSheet(fixture("character-sheet.txt"));

  it("parses identity, multiclass levels and subclasses", () => {
    expect(actor.actorType).toBe("character");
    expect(actor.name).toBe("Thalia Brightwood");
    expect(actor.character.species).toBe("Half-Elf");
    expect(actor.character.background).toBe("Soldier");
    expect(actor.character.classes).toHaveLength(2);
    expect(actor.character.classes[0]).toMatchObject({ name: "Fighter", levels: 5, subclass: "Battle Master", hitDie: "d10", progression: "none" });
    expect(actor.character.classes[1]).toMatchObject({ name: "Wizard", levels: 2, hitDie: "d6", progression: "full", spellcastingAbility: "int" });
    expect(actor.character.level).toBe(7);
    expect(actor.proficiencyBonus).toBe(3);
  });

  it("parses abilities, saves, skills, combat values", () => {
    expect(actor.abilities.str.value).toBe(16);
    expect(actor.abilities.str.proficient).toBe(1);
    expect(actor.abilities.con.proficient).toBe(1);
    expect(actor.abilities.dex.proficient).toBe(0);
    expect(actor.skills.ath).toEqual({ value: 1 });
    expect(actor.skills.prc).toEqual({ value: 2 });
    expect(actor.ac.value).toBe(18);
    expect(actor.hp).toMatchObject({ value: 52, max: 60 });
    expect(actor.hitDice).toEqual(["5d10", "2d6"]);
    expect(actor.senses.darkvision).toBe(60);
    expect(actor.languages.value).toEqual(["common", "elvish", "dwarvish"]);
    expect(actor.currency).toEqual({ gp: 25, sp: 12 });
  });

  it("creates placeholder items for equipment, spells, features and feats", () => {
    const names = actor.items.map(i => i.name);
    expect(names).toContain("Longsword");
    expect(names).toContain("Flame Tongue Longsword");
    expect(actor.items.find(i => i.name === "Potion of Healing").quantity).toBe(2);
    expect(actor.items.find(i => i.name === "Shield" && i.itemType === "spell")).toBeTruthy();
    expect(actor.items.find(i => i.name === "Action Surge").featType.value).toBe("class");
    expect(actor.items.find(i => i.name === "Sentinel").featType.value).toBe("feat");
  });
});

describe("json parsers", () => {
  it("parses the module schema", () => {
    const data = safeParseJSON(JSON.stringify({ $schema: "stat-block-importer/v1", entries: [{ kind: "item", itemType: "weapon", name: "Test Sword", description: "A sword.", weapon: { damage: { formula: "1d8", type: "slashing" } } }] }));
    expect(isModuleSchema(data)).toBe(true);
    const { entries, warnings } = parseSchemaJSON(data);
    expect(warnings).toEqual([]);
    expect(entries[0].itemType).toBe("weapon");
    expect(entries[0].description.original).toBe("A sword.");
  });

  it("rejects prototype pollution and deep nesting", () => {
    const data = safeParseJSON('{"__proto__": {"polluted": true}, "kind": "item", "name": "x"}');
    expect(({}).polluted).toBeUndefined();
    expect(data.__proto__?.polluted).toBeUndefined();
    expect(() => safeParseJSON("[".repeat(40) + "]".repeat(40))).toThrow(/nesting/);
  });

  it("parses Foundry exports with sanitized ownership", () => {
    const doc = { name: "Exported Goblin", type: "npc", _id: "abc", ownership: { default: 3 }, folder: "f1", system: { abilities: { str: { value: 8 } }, attributes: { hp: { value: 7, max: 7, formula: "2d6" }, ac: { flat: 15, calc: "flat" } }, details: { cr: 0.25, type: { value: "humanoid" } }, traits: { size: "sm" } }, items: [{ name: "Scimitar", type: "weapon", ownership: { default: 3 }, system: { description: { value: "<p>Sharp</p>" } } }] };
    expect(isFoundryExport(doc)).toBe(true);
    const { entries } = parseFoundryExport(doc);
    expect(entries[0].actorType).toBe("npc");
    expect(entries[0].hp.max).toBe(7);
    expect(entries[0].rawDocument.ownership).toBeUndefined();
    expect(entries[0].rawDocument._id).toBeUndefined();
    expect(entries[0].rawDocument.folder).toBeUndefined();
    expect(entries[0].items[0].rawDocument.ownership).toBeUndefined();
  });
});

describe("markup", () => {
  it("converts homebrewery markdown to a parsable stat block", () => {
    const text = markdownToText(fixture("goblin.md"));
    const actor = parseStatBlock(text);
    expect(actor.name).toBe("Goblin");
    expect(actor.ac.value).toBe(15);
    expect(actor.abilities.dex.value).toBe(14);
    expect(actor.items.map(i => i.name)).toEqual(["Nimble Escape", "Scimitar"]);
  });

  it("sanitizes HTML", () => {
    const html = "<p onclick=\"evil()\">Hello <script>alert(1)</script><b>bold</b><a href=\"javascript:x\">link</a><img src=x onerror=y></p>";
    const out = sanitizeHTML(html);
    expect(out).toBe("<p>Hello <b>bold</b>link</p>");
    expect(htmlToText("<h1>Goblin</h1><p>Small humanoid</p><table><tr><td>STR</td><td>DEX</td></tr></table>")).toBe("Goblin\nSmall humanoid\nSTR | DEX");
  });

  it("parses CSV with quotes", () => {
    const { headers, rows } = parseCSV(fixture("items.csv"));
    expect(headers[0]).toBe("name");
    expect(rows[1].description).toContain("Heavy armor");
    const { entries } = parseCSVItems(fixture("items.csv"));
    expect(entries).toHaveLength(3);
    expect(entries[0].itemType).toBe("weapon");
    expect(entries[1].armor.value).toBe(16);
    expect(entries[2].quantity).toBe(2);
  });
});

describe("format detection", () => {
  it("detects stat blocks, spells, items, characters, json, csv, markdown, html", () => {
    expect(detectFormat(fixture("goblin-2014.txt"))).toMatchObject({ format: "text", contentKind: "statblock" });
    expect(detectFormat(fixture("fireball.txt"))).toMatchObject({ format: "text", contentKind: "spell" });
    expect(detectFormat(fixture("flame-tongue.txt"))).toMatchObject({ format: "text", contentKind: "item" });
    expect(detectFormat(fixture("character-sheet.txt"))).toMatchObject({ format: "text", contentKind: "character" });
    expect(detectFormat(fixture("goblin.md"))).toMatchObject({ format: "markdown", contentKind: "statblock" });
    expect(detectFormat(fixture("items.csv"), { filename: "items.csv" })).toMatchObject({ format: "csv" });
    expect(detectFormat("<p>Goblin</p><p>Small humanoid (goblinoid), neutral evil</p><p>Armor Class 15</p><p>Hit Points 7 (2d6)</p>")).toMatchObject({ format: "html", contentKind: "statblock" });
    expect(detectFormat(JSON.stringify({ kind: "item", name: "x" }))).toMatchObject({ format: "json-schema" });
    expect(detectFormat("{ not json", { filename: "a.json" }).format).toBe("unknown");
  });
});
