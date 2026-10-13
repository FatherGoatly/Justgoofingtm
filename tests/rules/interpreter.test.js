import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseItemBlock } from "../../scripts/import/parsers/item-parser.js";
import { parseStatBlock } from "../../scripts/import/parsers/statblock-parser.js";
import { interpretItem, interpretActor } from "../../scripts/rules/interpreter.js";
import { runPipeline } from "../../scripts/import/pipeline.js";
import { mechanicRegistry } from "../../scripts/rules/mechanic-registry.js";

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const interp = text => interpretItem(parseItemBlock(text));
const find = (item, kind) => item.mechanics.filter(m => m.kind === kind);

describe("interpreter: on-hit damage", () => {
  it("adds unconditional extra damage as a native damage part (applied once)", () => {
    const item = interp("Frost Blade\nWeapon (longsword), rare\nWhen you hit a creature with this magic weapon, the target takes an extra 1d6 cold damage.");
    const attack = item.activities.find(a => a.type === "attack");
    expect(attack.damage).toHaveLength(1);
    expect(attack.damage[0]).toMatchObject({ formula: "1d6", types: ["cold"] });
    const m = find(item, "damage.bonus-on-hit")[0];
    expect(m).toMatchObject({ category: "native", confidence: 1, reviewRequired: false, trigger: { event: "hit" } });
    expect(m.implementation.owner).toBe("native");
    expect(m.sourceText).toContain("extra 1d6 cold damage");
    // the base weapon damage is untouched
    expect(item.weapon.damage.formula).toBe("1d8");
  });

  it("creates an alternate attack activity for toggled extra damage (Flame Tongue)", () => {
    const item = interp(fixture("flame-tongue.txt"));
    const attacks = item.activities.filter(a => a.type === "attack");
    expect(attacks).toHaveLength(2);
    expect(attacks[0].damage).toHaveLength(0);
    expect(attacks[1].name).toBe("Attack (Ablaze)");
    expect(attacks[1].damage[0]).toMatchObject({ formula: "2d6", types: ["fire"] });
    const m = find(item, "damage.bonus-on-hit")[0];
    expect(m.category).toBe("native");
    expect(m.implementation.owner).toBe("native-alt-activity");
    const light = find(item, "light.emit")[0];
    expect(light).toMatchObject({ category: "unresolved", enabled: false, effect: { bright: 40, dim: 80 } });
  });

  it("marks creature-type conditional extra damage for conditional implementation", () => {
    const item = interp("Dragon Slayer\nWeapon (any sword), rare\nWhen you hit a dragon with this weapon, the dragon takes an extra 3d6 damage of the weapon's type. For the purpose of this weapon, \"dragon\" refers to any creature with the dragon type.");
    const m = find(item, "damage.bonus-on-hit");
    // "3d6 damage of the weapon's type" has no explicit type → unresolved trigger text should be preserved rather than guessed
    expect(item.activities.find(a => a.type === "attack").damage).toHaveLength(0);
    expect(m.length === 0 || m[0].category !== "native").toBe(true);
    const item2 = interp("Undead Bane\nWeapon (longsword), rare\nWhen you hit an undead with this weapon, the target takes an extra 2d6 radiant damage.");
    const m2 = find(item2, "damage.bonus-on-hit")[0];
    expect(m2).toMatchObject({ category: "module", trigger: { event: "hit", condition: "target.type:undead" }, target: { filter: { creatureType: "undead" } } });
    expect(item2.activities.find(a => a.type === "attack").damage).toHaveLength(0);
  });

  it("does not invent a trigger for ambiguous extra damage", () => {
    const item = interp("Odd Blade\nWeapon (longsword), rare\nThe blade deals an extra 1d8 fire damage.");
    const m = find(item, "damage.bonus-on-hit")[0];
    expect(m.category).toBe("unresolved");
    expect(m.reviewRequired).toBe(true);
    expect(item.activities.find(a => a.type === "attack").damage).toHaveLength(0);
  });
});

describe("interpreter: saves and conditions", () => {
  it("creates a save activity with a condition effect and duration", () => {
    const item = interp("Horn of Fear\nWondrous item, rare\nYou can use an action to blow the horn. Each creature within 30 feet of you must succeed on a DC 15 Wisdom saving throw or be frightened for 1 minute.");
    const save = item.activities.find(a => a.type === "save");
    expect(save.save).toMatchObject({ ability: ["wis"], dc: { formula: "15" } });
    expect(save.conditionOnFail).toBe("frightened");
    expect(item.effects).toHaveLength(1);
    expect(item.effects[0]).toMatchObject({ statuses: ["frightened"], duration: { value: "1", units: "minute" }, transfer: false });
    expect(save.effects[0]).toMatchObject({ effectId: item.effects[0].id, onSave: false });
    const m = find(item, "condition.on-failed-save")[0];
    expect(m).toMatchObject({ category: "native", reviewRequired: false });
  });

  it("flags a missing DC instead of inventing one", () => {
    const item = interp("Shriek Stone\nWondrous item, rare\nA creature that hears it must succeed on a Constitution saving throw or be deafened for 1 minute.");
    const m = item.mechanics.find(x => x.kind === "condition.on-failed-save");
    expect(m.category).toBe("unresolved");
    expect(m.reviewRequired).toBe(true);
    expect(item.activities.some(a => a.type === "save")).toBe(false);
  });

  it("uses the spell save DC when referenced", () => {
    const item = interp("Dread Mask\nWondrous item, rare (requires attunement)\nAs an action, one creature you can see must succeed on a Wisdom saving throw against your spell save DC or be frightened of you until the end of your next turn.");
    const save = item.activities.find(a => a.type === "save");
    expect(save.save.dc.calculation).toBe("spellcasting");
    expect(item.effects[0].duration).toMatchObject({ value: "1", units: "turn", expiry: "turnEnd" });
  });
});

describe("interpreter: resources and spells", () => {
  it("handles charges, charge cost, destruction roll and cast-from-item", () => {
    const item = interp(fixture("wand-of-magic-missiles.txt"));
    expect(find(item, "resource.charges")[0]).toMatchObject({ category: "native", resource: { max: "7" } });
    const destroy = find(item, "resource.destroy-on-last-charge")[0];
    expect(destroy).toMatchObject({ category: "module", effect: { die: 20, min: 1, max: 1 } });
    const cast = find(item, "spell.cast-from-item")[0];
    expect(cast).toMatchObject({ effect: { spellName: "magic missile", level: 1, scalingPerCharge: true }, resource: { cost: 1 } });
  });

  it("recognises once-per-dawn uses in text", () => {
    const item = interp("Boots of Springing\nWondrous item, uncommon\nAs an action you can jump. Once you use this property, you can't use it again until the next dawn.");
    expect(item.uses).toMatchObject({ max: "1", recovery: [{ period: "dawn", type: "recoverAll" }] });
    expect(find(item, "resource.limited-use")[0].category).toBe("native");
  });
});

describe("interpreter: passive effects", () => {
  it("creates transfer effects for resistance, AC bonus, saves and senses", () => {
    const item = interp("Cloak of Many Things\nWondrous item, rare (requires attunement)\nWhile wearing this cloak, you have resistance to fire and cold damage. You have a +1 bonus to AC and a +1 bonus to saving throws while you wear it. You have darkvision out to a range of 60 feet.");
    const keys = item.effects.flatMap(e => e.changes.map(c => c.key));
    expect(keys).toContain("system.traits.dr.value");
    expect(keys).toContain("system.attributes.ac.bonus");
    expect(keys).toContain("system.rolls.ability.save.bonus");
    expect(keys).toContain("system.attributes.senses.ranges.darkvision");
    expect(item.effects.every(e => e.transfer)).toBe(true);
    const resist = find(item, "trait.resistance")[0];
    expect(resist.effect.types).toEqual(["fire", "cold"]);
    expect(find(item, "bonus.ac")[0].category).toBe("declarative");
  });

  it("treats situational advantage as manual and flavour text as nothing", () => {
    const item = interp("Lucky Charm\nWondrous item, uncommon\nThe charm is carved from bone and smells faintly of the sea. You have advantage on saving throws against being frightened.");
    const adv = find(item, "trait.advantage")[0];
    expect(adv).toMatchObject({ category: "unresolved", enabled: false });
    expect(item.effects).toHaveLength(0);
  });

  it("sets magical bonus on +1 weapons and armor", () => {
    const sword = interp(fixture("longsword-plus-one.txt"));
    expect(sword.weapon.magicalBonus).toBe(1);
    expect(find(sword, "bonus.attack-damage")[0].category).toBe("native");
    const armor = interp("Chain Mail +1\nArmor (chain mail), rare\nYou have a +1 bonus to AC while wearing this armor.");
    expect(armor.armor.magicalBonus).toBe(1);
    expect(find(armor, "bonus.ac")[0].implementation.owner).toBe("native");
  });
});

describe("interpreter: creatures", () => {
  it("interprets a creature's items without duplicating native parts", () => {
    const actor = interpretActor(parseStatBlock(fixture("adult-red-dragon-2024.txt")));
    const rend = actor.items.find(i => i.name === "Rend");
    expect(rend.activities[0].damage).toHaveLength(1);
    const breath = actor.items.find(i => i.name === "Fire Breath");
    expect(breath.mechanics.map(m => m.kind)).toContain("resource.recharge");
    const multi = actor.items.find(i => i.name === "Multiattack");
    expect(multi.mechanics.find(m => m.kind === "multiattack").effect.count).toBe(3);
  });
});

describe("pipeline", () => {
  it("runs end to end on a stat block", () => {
    const bundle = runPipeline(fixture("goblin-2014.txt"));
    expect(bundle.detection.contentKind).toBe("statblock");
    expect(bundle.entries).toHaveLength(1);
    expect(bundle.entries[0].validation.valid).toBe(true);
    expect(bundle.summary.actors).toBe(1);
    expect(bundle.summary.embeddedItems).toBe(3);
    expect(bundle.entries[0].fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("reports errors for unknown content", () => {
    const bundle = runPipeline("Just some prose with nothing in it.");
    expect(bundle.entries).toHaveLength(0);
    expect(bundle.summary.errors).toBeGreaterThan(0);
  });

  it("is deterministic for duplicate detection", () => {
    const a = runPipeline(fixture("flame-tongue.txt")).entries[0].fingerprint;
    const b = runPipeline(fixture("flame-tongue.txt")).entries[0].fingerprint;
    expect(a).toBe(b);
  });
});

describe("mechanic registry implementation selection", () => {
  it("prefers native and falls back by capability", () => {
    const spec = { kind: "damage.bonus-on-hit", trigger: { event: "hit", condition: "target.type:undead" }, implementation: { when: "conditional" } };
    expect(mechanicRegistry.selectImplementation(spec, { capabilities: new Set(["midi.damageBonus", "dnd5e.preRollDamageV2"]) }).owner).toBe("midi-qol");
    expect(mechanicRegistry.selectImplementation(spec, { capabilities: new Set(["dnd5e.preRollDamageV2"]) }).owner).toBe("module");
    expect(mechanicRegistry.selectImplementation(spec, { capabilities: new Set() }).owner).toBe("manual");
    const tele = { kind: "teleport", trigger: { event: "use" }, implementation: {} };
    expect(mechanicRegistry.selectImplementation(tele, { macrosAllowed: true }).owner).toBe("macro");
    expect(mechanicRegistry.selectImplementation(tele, { macrosAllowed: false }).owner).toBe("manual");
    const cast = { kind: "spell.cast-from-item", trigger: { event: "use" }, implementation: {} };
    expect(mechanicRegistry.selectImplementation(cast, { context: { spellFound: true, "compendium.spell": true } }).owner).toBe("native");
    expect(mechanicRegistry.selectImplementation(cast, { context: { spellFound: false } }).owner).toBe("manual");
  });
});
