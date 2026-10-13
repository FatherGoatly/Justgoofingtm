import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseStatBlock, scoreStatBlock, splitStatBlocks } from "../../scripts/import/parsers/statblock-parser.js";
import { parseAttack, parseSave, parseNameSuffix } from "../../scripts/import/parsers/action-parser.js";
import { validateEntry } from "../../scripts/import/schema.js";

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("stat block parser (2014 layout)", () => {
  const actor = parseStatBlock(fixture("goblin-2014.txt"));

  it("parses identity and header", () => {
    expect(actor.name).toBe("Goblin");
    expect(actor.actorType).toBe("npc");
    expect(actor.size).toBe("sm");
    expect(actor.creatureType).toMatchObject({ value: "humanoid", subtype: "goblinoid" });
    expect(actor.alignment).toBe("Neutral Evil");
    expect(actor.ac.value).toBe(15);
    expect(actor.ac.calc).toBe("armored");
    expect(actor.hp).toMatchObject({ max: 7, formula: "2d6" });
    expect(actor.movement.walk).toBe(30);
    expect(actor.cr).toBe(0.25);
    expect(actor.xp).toBe(50);
    expect(actor.proficiencyBonus).toBe(2);
  });

  it("parses abilities with unicode minus", () => {
    expect(actor.abilities.str.value).toBe(8);
    expect(actor.abilities.dex.value).toBe(14);
    expect(actor.abilities.cha.value).toBe(8);
  });

  it("parses skills, senses and languages", () => {
    expect(actor.skills.ste).toEqual({ bonus: 6 });
    expect(actor.senses.darkvision).toBe(60);
    expect(actor.senses.passivePerception).toBe(9);
    expect(actor.languages.value).toEqual(["common", "goblin"]);
  });

  it("parses traits and attacks preserving action categories", () => {
    const names = actor.items.map(i => i.name);
    expect(names).toEqual(["Nimble Escape", "Scimitar", "Shortbow"]);
    const trait = actor.items[0];
    expect(trait.itemType).toBe("feat");
    expect(trait.section).toBe("trait");
    const scimitar = actor.items[1];
    expect(scimitar.itemType).toBe("weapon");
    expect(scimitar.section).toBe("action");
    expect(scimitar.weapon.damage).toEqual({ formula: "1d6 + 2", type: "slashing" });
    expect(scimitar.activities[0].type).toBe("attack");
    expect(scimitar.activities[0].attack.type).toBe("melee");
    expect(scimitar.activities[0].attackFlat).toBe(4);
    const bow = actor.items[2];
    expect(bow.weapon.range).toEqual({ value: 80, long: 320 });
    expect(bow.activities[0].attack.type).toBe("ranged");
  });

  it("produces a valid IR entry", () => {
    const { errors } = validateEntry(actor);
    expect(errors).toEqual([]);
  });

  it("preserves the original source text", () => {
    expect(actor.source.text).toContain("Nimble Escape");
  });
});

describe("stat block parser (2024 layout)", () => {
  const actor = parseStatBlock(fixture("adult-red-dragon-2024.txt"));

  it("parses header with combined AC/initiative and PB", () => {
    expect(actor.name).toBe("Adult Red Dragon");
    expect(actor.size).toBe("huge");
    expect(actor.creatureType.value).toBe("dragon");
    expect(actor.creatureType.subtype).toBe("Chromatic");
    expect(actor.ac.value).toBe(19);
    expect(actor.initiative).toBe(12);
    expect(actor.hp).toMatchObject({ max: 256, formula: "19d12 + 133" });
    expect(actor.movement).toMatchObject({ walk: 40, climb: 40, fly: 80 });
    expect(actor.cr).toBe(17);
    expect(actor.xp).toBe(18000);
    expect(actor.proficiencyBonus).toBe(6);
  });

  it("parses the 2024 ability table including save proficiencies", () => {
    expect(actor.abilities.str.value).toBe(27);
    expect(actor.abilities.dex).toMatchObject({ value: 10, proficient: 1, saveBonus: 6 });
    expect(actor.abilities.con).toMatchObject({ value: 25, proficient: 0 });
    expect(actor.abilities.wis).toMatchObject({ value: 13, proficient: 1 });
  });

  it("parses immunities, senses and skills", () => {
    expect(actor.traits.di).toEqual(["fire"]);
    expect(actor.senses).toMatchObject({ blindsight: 60, darkvision: 120, passivePerception: 23 });
    expect(actor.skills.prc.bonus).toBe(13);
  });

  it("parses legendary resistances, legendary actions and recharge", () => {
    expect(actor.legendary.resistances).toBe(3);
    expect(actor.legendary.actions).toBe(3);
    const breath = actor.items.find(i => i.name === "Fire Breath");
    expect(breath.uses.max).toBe("1");
    expect(breath.uses.recovery[0]).toEqual({ period: "recharge", type: "recoverAll", formula: "5" });
    const save = breath.activities[0];
    expect(save.type).toBe("save");
    expect(save.save.ability).toEqual(["dex"]);
    expect(save.save.dc.formula).toBe("21");
    expect(save.save.onSave).toBe("half");
    expect(save.damage[0]).toMatchObject({ formula: "17d6", types: ["fire"] });
    expect(save.target.template).toMatchObject({ type: "cone", size: "60" });
    expect(save.consumption[0]).toMatchObject({ type: "itemUses", value: "1" });
    const legendary = actor.items.filter(i => i.section === "legendary");
    expect(legendary.map(i => i.name)).toEqual(["Commanding Presence", "Fiery Rays", "Pounce"]);
    expect(legendary[0].activities[0].activation).toMatchObject({ type: "legendary", value: 1 });
  });

  it("parses 2024 attack lines with multiple damage parts", () => {
    const rend = actor.items.find(i => i.name === "Rend");
    expect(rend.itemType).toBe("weapon");
    expect(rend.weapon.damage).toEqual({ formula: "1d10 + 8", type: "slashing" });
    expect(rend.weapon.reach).toBe(10);
    expect(rend.activities[0].damage[0]).toMatchObject({ formula: "2d4", types: ["fire"] });
    expect(rend.activities[0].attackFlat).toBe(14);
  });

  it("parses 2024 spellcasting groups", () => {
    expect(actor.spellcasting.ability).toBe("cha");
    expect(actor.spellcasting.dc).toBe(18);
    expect(actor.spellcasting.attack).toBe(12);
    const names = actor.spellcasting.spells.map(s => s.name);
    expect(names).toEqual(["Command", "Detect Magic", "Scorching Ray", "Fireball", "Scrying"]);
    expect(actor.spellcasting.spells[0]).toMatchObject({ method: "atwill", castLevel: 2 });
    expect(actor.spellcasting.spells[3]).toMatchObject({ method: "innate", usesPerDay: 1, castLevel: 5 });
  });

  it("is valid IR", () => {
    expect(validateEntry(actor).errors).toEqual([]);
  });
});

describe("stat block parser (2014 spellcaster)", () => {
  const actor = parseStatBlock(fixture("mage-2014.txt"));

  it("parses leveled spellcasting with slots", () => {
    expect(actor.spellcasting.level).toBe(9);
    expect(actor.spellcasting.ability).toBe("int");
    expect(actor.spellcasting.dc).toBe(14);
    expect(actor.spellcasting.slots).toEqual({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 });
    const fireball = actor.spellcasting.spells.find(s => s.name === "fireball");
    expect(fireball).toMatchObject({ level: 3, method: "spell" });
    const cantrip = actor.spellcasting.spells.find(s => s.name === "fire bolt");
    expect(cantrip).toMatchObject({ level: 0, method: "atwill" });
  });

  it("parses saving throw proficiencies and melee-or-ranged attacks", () => {
    expect(actor.abilities.int).toMatchObject({ proficient: 1, saveBonus: 6 });
    const dagger = actor.items.find(i => i.name === "Dagger");
    expect(dagger.weapon.properties).toContain("thr");
    expect(dagger.weapon.range).toEqual({ value: 20, long: 60 });
  });
});

describe("attack + save combos", () => {
  const actor = parseStatBlock(fixture("poisoner-2014.txt"));

  it("creates attack and a linked save activity with poison damage", () => {
    const bite = actor.items.find(i => i.name === "Bite");
    expect(bite.activities.map(a => a.type)).toEqual(["attack", "save"]);
    const save = bite.activities[1];
    expect(save.save.ability).toEqual(["con"]);
    expect(save.save.dc.formula).toBe("11");
    expect(save.damage[0]).toMatchObject({ formula: "2d8", types: ["poison"] });
    expect(save.save.onSave).toBe("half");
  });

  it("parses recharge from the name and keeps restrain text for review", () => {
    const web = actor.items.find(i => i.name === "Web");
    expect(web.uses.recovery[0].period).toBe("recharge");
    expect(web.activities[0].type).toBe("attack");
    expect(web.description.original).toContain("restrained");
  });

  it("parses traits without activation as passive", () => {
    const climb = actor.items.find(i => i.name === "Spider Climb");
    expect(climb.passive).toBe(true);
    expect(climb.activities).toEqual([]);
  });

  it("handles em-dash languages", () => {
    expect(actor.languages.value).toEqual([]);
  });
});

describe("helpers", () => {
  it("scores stat blocks", () => {
    expect(scoreStatBlock(fixture("goblin-2014.txt"))).toBeGreaterThan(0.8);
    expect(scoreStatBlock("Hello world")).toBe(0);
  });

  it("splits multiple stat blocks", () => {
    const text = `${fixture("goblin-2014.txt")}\n\n${fixture("mage-2014.txt")}`;
    const blocks = splitStatBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].startsWith("Mage")).toBe(true);
  });

  it("parses name suffixes", () => {
    expect(parseNameSuffix("Fire Breath (Recharge 5–6)")).toMatchObject({ name: "Fire Breath" });
    expect(parseNameSuffix("Wing Attack (Costs 2 Actions)")).toMatchObject({ name: "Wing Attack", legendaryCost: 2 });
    expect(parseNameSuffix("Leadership (Recharges after a Short or Long Rest)").uses.recovery[0].period).toBe("sr");
    expect(parseNameSuffix("Spellcasting (2/Day)").uses.max).toBe("2");
  });

  it("parses attack lines in both styles", () => {
    const a = parseAttack("Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) slashing damage plus 3 (1d6) fire damage.");
    expect(a.bonus).toBe(5);
    expect(a.damage).toHaveLength(2);
    expect(a.damage[1]).toMatchObject({ formula: "1d6", type: "fire" });
    const b = parseAttack("Ranged Attack Roll: +7, range 80/320 ft. Hit: 9 (2d4 + 4) Piercing damage.");
    expect(b.type).toBe("ranged");
    expect(b.range).toEqual({ value: 80, long: 320 });
  });

  it("parses saves with conditions", () => {
    const s = parseSave("The target must succeed on a DC 13 Constitution saving throw or be poisoned for 1 minute.");
    expect(s).toMatchObject({ ability: "con", dc: 13, condition: "poisoned" });
    const s2 = parseSave("Wisdom Saving Throw: DC 15, one creature the dragon can see within 60 feet. Failure: The target has the Frightened condition until the end of its next turn.");
    expect(s2).toMatchObject({ ability: "wis", dc: 15, condition: "frightened" });
  });
});
