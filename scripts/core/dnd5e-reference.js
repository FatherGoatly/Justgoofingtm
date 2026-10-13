/**
 * Static reference of D&D 5e system (v6.0.6) configuration keys used for mapping and validation.
 * At runtime the live `CONFIG.DND5E` is preferred (see getConfig); the static tables keep the
 * parsers and builders testable outside Foundry and act as a compatibility baseline.
 *
 * Every table here was extracted from dnd5e 6.0.6 `module/config.mjs`.
 */

export const ABILITIES = Object.freeze({
  str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma"
});

export const SKILLS = Object.freeze({
  acr: { label: "Acrobatics", ability: "dex" },
  ani: { label: "Animal Handling", ability: "wis" },
  arc: { label: "Arcana", ability: "int" },
  ath: { label: "Athletics", ability: "str" },
  dec: { label: "Deception", ability: "cha" },
  his: { label: "History", ability: "int" },
  ins: { label: "Insight", ability: "wis" },
  itm: { label: "Intimidation", ability: "cha" },
  inv: { label: "Investigation", ability: "int" },
  med: { label: "Medicine", ability: "wis" },
  nat: { label: "Nature", ability: "int" },
  prc: { label: "Perception", ability: "wis" },
  prf: { label: "Performance", ability: "cha" },
  per: { label: "Persuasion", ability: "cha" },
  rel: { label: "Religion", ability: "int" },
  slt: { label: "Sleight of Hand", ability: "dex" },
  ste: { label: "Stealth", ability: "dex" },
  sur: { label: "Survival", ability: "wis" }
});

export const DAMAGE_TYPES = Object.freeze([
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic",
  "radiant", "slashing", "thunder"
]);

export const HEALING_TYPES = Object.freeze(["healing", "temphp", "maximum"]);

export const CONDITIONS = Object.freeze([
  "bleeding", "blinded", "burning", "charmed", "cursed", "dehydration", "deafened", "diseased", "exhaustion",
  "falling", "frightened", "grappled", "incapacitated", "invisible", "malnutrition", "paralyzed", "petrified",
  "poisoned", "prone", "restrained", "silenced", "stunned", "suffocation", "surprised", "transformed",
  "unconscious"
]);

export const STATUS_EFFECTS = Object.freeze([
  "burrowing", "concentrating", "coverHalf", "coverThreeQuarters", "coverTotal", "dead", "dodging", "ethereal",
  "flying", "hiding", "hovering", "marked", "sleeping", "stable"
]);

export const ACTOR_SIZES = Object.freeze({
  tiny: "tiny", sm: "small", med: "medium", lg: "large", huge: "huge", grg: "gargantuan"
});

export const CREATURE_TYPES = Object.freeze([
  "aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid",
  "monstrosity", "ooze", "plant", "undead"
]);

export const ALIGNMENTS = Object.freeze({
  lg: "lawful good", ng: "neutral good", cg: "chaotic good", ln: "lawful neutral", tn: "neutral",
  cn: "chaotic neutral", le: "lawful evil", ne: "neutral evil", ce: "chaotic evil"
});

export const MOVEMENT_TYPES = Object.freeze(["walk", "burrow", "climb", "fly", "jump", "swim"]);
export const SENSES = Object.freeze(["blindsight", "darkvision", "tremorsense", "truesight"]);

export const WEAPON_TYPES = Object.freeze(["simpleM", "simpleR", "martialM", "martialR", "natural", "improv", "siege"]);

export const WEAPON_IDS = Object.freeze([
  "battleaxe", "blowgun", "club", "dagger", "dart", "flail", "glaive", "greataxe", "greatclub", "greatsword",
  "halberd", "handaxe", "handcrossbow", "heavycrossbow", "javelin", "lance", "lightcrossbow", "lighthammer",
  "longbow", "longsword", "mace", "maul", "morningstar", "musket", "pike", "pistol", "quarterstaff", "rapier",
  "scimitar", "shortsword", "sickle", "spear", "shortbow", "sling", "trident", "warpick", "warhammer", "whip"
]);

/** Base weapon statistics (SRD): category, damage, properties, range. */
export const BASE_WEAPONS = Object.freeze({
  battleaxe: { type: "martialM", damage: "1d8", type2: "slashing", versatile: "1d10", properties: ["ver"] },
  blowgun: { type: "martialR", damage: "1", type2: "piercing", properties: ["amm", "lod"], range: [25, 100] },
  club: { type: "simpleM", damage: "1d4", type2: "bludgeoning", properties: ["lgt"] },
  dagger: { type: "simpleM", damage: "1d4", type2: "piercing", properties: ["fin", "lgt", "thr"], range: [20, 60] },
  dart: { type: "simpleR", damage: "1d4", type2: "piercing", properties: ["fin", "thr"], range: [20, 60] },
  flail: { type: "martialM", damage: "1d8", type2: "bludgeoning", properties: [] },
  glaive: { type: "martialM", damage: "1d10", type2: "slashing", properties: ["hvy", "rch", "two"], reach: 10 },
  greataxe: { type: "martialM", damage: "1d12", type2: "slashing", properties: ["hvy", "two"] },
  greatclub: { type: "simpleM", damage: "1d8", type2: "bludgeoning", properties: ["two"] },
  greatsword: { type: "martialM", damage: "2d6", type2: "slashing", properties: ["hvy", "two"] },
  halberd: { type: "martialM", damage: "1d10", type2: "slashing", properties: ["hvy", "rch", "two"], reach: 10 },
  handaxe: { type: "simpleM", damage: "1d6", type2: "slashing", properties: ["lgt", "thr"], range: [20, 60] },
  handcrossbow: { type: "martialR", damage: "1d6", type2: "piercing", properties: ["amm", "lgt", "lod"], range: [30, 120] },
  heavycrossbow: { type: "martialR", damage: "1d10", type2: "piercing", properties: ["amm", "hvy", "lod", "two"], range: [100, 400] },
  javelin: { type: "simpleM", damage: "1d6", type2: "piercing", properties: ["thr"], range: [30, 120] },
  lance: { type: "martialM", damage: "1d12", type2: "piercing", properties: ["rch", "spc"], reach: 10 },
  lightcrossbow: { type: "simpleR", damage: "1d8", type2: "piercing", properties: ["amm", "lod", "two"], range: [80, 320] },
  lighthammer: { type: "simpleM", damage: "1d4", type2: "bludgeoning", properties: ["lgt", "thr"], range: [20, 60] },
  longbow: { type: "martialR", damage: "1d8", type2: "piercing", properties: ["amm", "hvy", "two"], range: [150, 600] },
  longsword: { type: "martialM", damage: "1d8", type2: "slashing", versatile: "1d10", properties: ["ver"] },
  mace: { type: "simpleM", damage: "1d6", type2: "bludgeoning", properties: [] },
  maul: { type: "martialM", damage: "2d6", type2: "bludgeoning", properties: ["hvy", "two"] },
  morningstar: { type: "martialM", damage: "1d8", type2: "piercing", properties: [] },
  musket: { type: "martialR", damage: "1d12", type2: "piercing", properties: ["amm", "fir", "lod", "two"], range: [40, 120] },
  pike: { type: "martialM", damage: "1d10", type2: "piercing", properties: ["hvy", "rch", "two"], reach: 10 },
  pistol: { type: "martialR", damage: "1d10", type2: "piercing", properties: ["amm", "fir", "lod"], range: [30, 90] },
  quarterstaff: { type: "simpleM", damage: "1d6", type2: "bludgeoning", versatile: "1d8", properties: ["ver"] },
  rapier: { type: "martialM", damage: "1d8", type2: "piercing", properties: ["fin"] },
  scimitar: { type: "martialM", damage: "1d6", type2: "slashing", properties: ["fin", "lgt"] },
  shortsword: { type: "martialM", damage: "1d6", type2: "piercing", properties: ["fin", "lgt"] },
  sickle: { type: "simpleM", damage: "1d4", type2: "slashing", properties: ["lgt"] },
  spear: { type: "simpleM", damage: "1d6", type2: "piercing", versatile: "1d8", properties: ["thr", "ver"], range: [20, 60] },
  shortbow: { type: "simpleR", damage: "1d6", type2: "piercing", properties: ["amm", "two"], range: [80, 320] },
  sling: { type: "simpleR", damage: "1d4", type2: "bludgeoning", properties: ["amm"], range: [30, 120] },
  trident: { type: "martialM", damage: "1d6", type2: "piercing", versatile: "1d8", properties: ["thr", "ver"], range: [20, 60] },
  warpick: { type: "martialM", damage: "1d8", type2: "piercing", properties: [] },
  warhammer: { type: "martialM", damage: "1d8", type2: "bludgeoning", versatile: "1d10", properties: ["ver"] },
  whip: { type: "martialM", damage: "1d4", type2: "slashing", properties: ["fin", "rch"], reach: 10 }
});

export const WEAPON_PROPERTY_WORDS = Object.freeze({
  adamantine: "ada", ammunition: "amm", finesse: "fin", firearm: "fir", focus: "foc", heavy: "hvy", light: "lgt",
  loading: "lod", magical: "mgc", reach: "rch", reload: "rel", returning: "ret", silvered: "sil", special: "spc",
  thrown: "thr", "two-handed": "two", versatile: "ver"
});

export const WEAPON_MASTERIES = Object.freeze(["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"]);

export const ARMOR_TYPES = Object.freeze(["light", "medium", "heavy", "natural", "shield"]);

export const ARMOR_IDS = Object.freeze({
  breastplate: { type: "medium", ac: 14, dex: 2 },
  chainmail: { type: "heavy", ac: 16, dex: 0, strength: 13, stealth: true },
  chainshirt: { type: "medium", ac: 13, dex: 2 },
  halfplate: { type: "medium", ac: 15, dex: 2, stealth: true },
  hide: { type: "medium", ac: 12, dex: 2 },
  leather: { type: "light", ac: 11 },
  padded: { type: "light", ac: 11, stealth: true },
  plate: { type: "heavy", ac: 18, dex: 0, strength: 15, stealth: true },
  ringmail: { type: "heavy", ac: 14, dex: 0, stealth: true },
  scalemail: { type: "medium", ac: 14, dex: 2, stealth: true },
  splint: { type: "heavy", ac: 17, dex: 0, strength: 15, stealth: true },
  studded: { type: "light", ac: 12 },
  shield: { type: "shield", ac: 2 }
});

export const ARMOR_NAME_ALIASES = Object.freeze({
  "chain mail": "chainmail", "chain shirt": "chainshirt", "half plate": "halfplate", "ring mail": "ringmail",
  "scale mail": "scalemail", "studded leather": "studded", "leather armor": "leather", "hide armor": "hide",
  "splint armor": "splint", "plate armor": "plate", "padded armor": "padded", "breastplate": "breastplate"
});

export const MISC_EQUIPMENT_TYPES = Object.freeze(["clothing", "ring", "rod", "trinket", "vehicle", "wand", "wondrous"]);
export const CONSUMABLE_TYPES = Object.freeze(["ammo", "potion", "poison", "food", "scroll", "wand", "rod", "trinket", "wondrous"]);
export const FEATURE_TYPES = Object.freeze(["background", "class", "monster", "race", "enchantment", "feat", "pietyTrait", "supernaturalGift", "vehicle"]);
export const LOOT_TYPES = Object.freeze(["art", "gear", "gem", "junk", "material", "resource", "trade", "treasure"]);
export const CONTAINER_TYPES = Object.freeze([
  "backpack", "barrel", "basket", "boltcase", "bottle", "bucket", "case", "chest", "flask", "jug", "pot", "pitcher",
  "pouch", "quiver", "sack", "saddlebags", "tankard", "vial"
]);

export const ITEM_RARITIES = Object.freeze({
  common: "common", uncommon: "uncommon", rare: "rare", veryRare: "very rare", legendary: "legendary", artifact: "artifact"
});

export const CURRENCIES = Object.freeze(["pp", "gp", "ep", "sp", "cp"]);

export const ACTIVATION_TYPES = Object.freeze([
  "action", "bonus", "reaction", "minute", "hour", "day", "longRest", "shortRest", "encounter", "turnStart",
  "turnEnd", "legendary", "mythic", "lair", "crew", "special"
]);

export const LIMITED_USE_PERIODS = Object.freeze(["lr", "sr", "day", "dawn", "dusk", "initiative", "turnStart", "turnEnd", "turn"]);
export const RECOVERY_TYPES = Object.freeze(["recoverAll", "loseAll", "formula"]);

export const TIME_UNITS = Object.freeze(["turn", "round", "second", "minute", "hour", "day", "week", "month", "year"]);
export const SPECIAL_TIME_PERIODS = Object.freeze(["inst", "spec", "disp", "dstr", "perm"]);

export const RANGE_UNITS = Object.freeze(["ft", "mi", "m", "km", "self", "touch", "spec", "any"]);

export const AREA_TARGET_TYPES = Object.freeze(["circle", "cone", "cube", "cylinder", "line", "radius", "ring", "sphere", "square", "wall"]);
export const INDIVIDUAL_TARGET_TYPES = Object.freeze(["self", "ally", "enemy", "creature", "object", "space", "creatureOrObject", "any", "willing"]);

export const SPELL_SCHOOLS = Object.freeze({
  abj: "abjuration", con: "conjuration", div: "divination", enc: "enchantment", evo: "evocation", ill: "illusion",
  nec: "necromancy", trs: "transmutation"
});

export const SPELLCASTING_METHODS = Object.freeze(["atwill", "innate", "ritual", "pact", "spell"]);
export const SPELL_PROGRESSIONS = Object.freeze(["none", "full", "half", "third", "artificer", "pact"]);

export const LANGUAGES = Object.freeze({
  common: "Common", draconic: "Draconic", dwarvish: "Dwarvish", elvish: "Elvish", giant: "Giant", gnomish: "Gnomish",
  goblin: "Goblin", halfling: "Halfling", orc: "Orc", sign: "Common Sign Language",
  aarakocra: "Aarakocra", abyssal: "Abyssal", cant: "Thieves' Cant", celestial: "Celestial", deep: "Deep Speech",
  druidic: "Druidic", gith: "Gith", gnoll: "Gnoll", infernal: "Infernal", primordial: "Primordial", aquan: "Aquan",
  auran: "Auran", ignan: "Ignan", terran: "Terran", sylvan: "Sylvan", undercommon: "Undercommon"
});

export const TOOLS = Object.freeze([
  "alchemist", "bagpipes", "brewer", "calligrapher", "card", "carpenter", "cartographer", "chess", "cobbler", "cook",
  "dice", "disg", "drum", "dulcimer", "flute", "forg", "glassblower", "herb", "horn", "jeweler", "leatherworker",
  "lute", "lyre", "mason", "navg", "painter", "panflute", "pois", "potter", "shawm", "smith", "thief", "tinker",
  "viol", "weaver", "woodcarver"
]);

export const TOOL_NAME_ALIASES = Object.freeze({
  "alchemist's supplies": "alchemist", "brewer's supplies": "brewer", "calligrapher's supplies": "calligrapher",
  "carpenter's tools": "carpenter", "cartographer's tools": "cartographer", "cobbler's tools": "cobbler",
  "cook's utensils": "cook", "disguise kit": "disg", "forgery kit": "forg", "glassblower's tools": "glassblower",
  "herbalism kit": "herb", "jeweler's tools": "jeweler", "leatherworker's tools": "leatherworker",
  "mason's tools": "mason", "navigator's tools": "navg", "painter's supplies": "painter", "poisoner's kit": "pois",
  "potter's tools": "potter", "smith's tools": "smith", "thieves' tools": "thief", "tinker's tools": "tinker",
  "weaver's tools": "weaver", "woodcarver's tools": "woodcarver", "playing card set": "card", "dice set": "dice",
  "dragonchess set": "chess"
});

export const ACTIVITY_TYPES = Object.freeze(["attack", "cast", "check", "damage", "enchant", "forward", "heal", "order", "save", "summon", "teleport", "transform", "utility"]);

export const ITEM_TYPES = Object.freeze(["weapon", "equipment", "consumable", "tool", "loot", "race", "background", "class", "subclass", "spell", "feat", "container", "facility"]);
export const ACTOR_TYPES = Object.freeze(["character", "npc", "vehicle", "group", "encounter"]);

/** Effect change types accepted by Foundry V14 / dnd5e 6. */
export const EFFECT_CHANGE_TYPES = Object.freeze(["add", "override", "upgrade", "downgrade", "multiply", "subtract"]);
export const EFFECT_PHASES = Object.freeze(["initial", "final"]);
export const EFFECT_EXPIRIES = Object.freeze(["turnStart", "turnEnd", "sourceStart", "sourceEnd", "targetStart", "targetEnd", "longRest", "shortRest"]);

/** Challenge rating → proficiency bonus and XP (DMG/MM). */
export const CR_TABLE = Object.freeze({
  0: { prof: 2, xp: 10 }, 0.125: { prof: 2, xp: 25 }, 0.25: { prof: 2, xp: 50 }, 0.5: { prof: 2, xp: 100 },
  1: { prof: 2, xp: 200 }, 2: { prof: 2, xp: 450 }, 3: { prof: 2, xp: 700 }, 4: { prof: 2, xp: 1100 },
  5: { prof: 3, xp: 1800 }, 6: { prof: 3, xp: 2300 }, 7: { prof: 3, xp: 2900 }, 8: { prof: 3, xp: 3900 },
  9: { prof: 4, xp: 5000 }, 10: { prof: 4, xp: 5900 }, 11: { prof: 4, xp: 7200 }, 12: { prof: 4, xp: 8400 },
  13: { prof: 5, xp: 10000 }, 14: { prof: 5, xp: 11500 }, 15: { prof: 5, xp: 13000 }, 16: { prof: 5, xp: 15000 },
  17: { prof: 6, xp: 18000 }, 18: { prof: 6, xp: 20000 }, 19: { prof: 6, xp: 22000 }, 20: { prof: 6, xp: 25000 },
  21: { prof: 7, xp: 33000 }, 22: { prof: 7, xp: 41000 }, 23: { prof: 7, xp: 50000 }, 24: { prof: 7, xp: 62000 },
  25: { prof: 8, xp: 75000 }, 26: { prof: 8, xp: 90000 }, 27: { prof: 8, xp: 105000 }, 28: { prof: 8, xp: 120000 },
  29: { prof: 9, xp: 135000 }, 30: { prof: 9, xp: 155000 }
});

export const SIZE_HIT_DIE = Object.freeze({ tiny: 4, sm: 6, med: 8, lg: 10, huge: 12, grg: 20 });

/** Class identifiers with hit die and spellcasting progression (PHB 2014/2024). */
export const CLASSES = Object.freeze({
  artificer: { hd: "d8", progression: "artificer", ability: "int" },
  barbarian: { hd: "d12", progression: "none" },
  bard: { hd: "d8", progression: "full", ability: "cha" },
  cleric: { hd: "d8", progression: "full", ability: "wis" },
  druid: { hd: "d8", progression: "full", ability: "wis" },
  fighter: { hd: "d10", progression: "none" },
  monk: { hd: "d8", progression: "none" },
  paladin: { hd: "d10", progression: "half", ability: "cha" },
  ranger: { hd: "d10", progression: "half", ability: "wis" },
  rogue: { hd: "d8", progression: "none" },
  sorcerer: { hd: "d6", progression: "full", ability: "cha" },
  warlock: { hd: "d8", progression: "pact", ability: "cha" },
  wizard: { hd: "d6", progression: "full", ability: "int" }
});

export const SUBCLASS_PROGRESSION = Object.freeze({
  "eldritch knight": { progression: "third", ability: "int" },
  "arcane trickster": { progression: "third", ability: "int" }
});

/** Level → proficiency bonus for characters. */
export function proficiencyForLevel(level) {
  return Math.max(2, Math.ceil(Math.max(1, level) / 4) + 1);
}

/* -------------------------------------------- */
/*  Live configuration access                   */
/* -------------------------------------------- */

/**
 * Return the live dnd5e configuration if available, otherwise a static approximation built from the
 * reference tables above. Builders only read key sets from this object.
 * @returns {object}
 */
export function getConfig() {
  const live = globalThis.CONFIG?.DND5E;
  if ( live ) return live;
  return STATIC_CONFIG;
}

const STATIC_CONFIG = Object.freeze({
  abilities: Object.fromEntries(Object.entries(ABILITIES).map(([k, v]) => [k, { label: v, fullKey: v }])),
  skills: SKILLS,
  damageTypes: Object.fromEntries(DAMAGE_TYPES.map(k => [k, { label: k }])),
  healingTypes: Object.fromEntries(HEALING_TYPES.map(k => [k, { label: k }])),
  conditionTypes: Object.fromEntries(CONDITIONS.map(k => [k, { name: k }])),
  statusEffects: Object.fromEntries(STATUS_EFFECTS.map(k => [k, { name: k }])),
  actorSizes: Object.fromEntries(Object.entries(ACTOR_SIZES).map(([k, v]) => [k, { label: v }])),
  creatureTypes: Object.fromEntries(CREATURE_TYPES.map(k => [k, { label: k }])),
  alignments: ALIGNMENTS,
  movementTypes: Object.fromEntries(MOVEMENT_TYPES.map(k => [k, k])),
  senses: Object.fromEntries(SENSES.map(k => [k, k])),
  weaponTypes: Object.fromEntries(WEAPON_TYPES.map(k => [k, k])),
  weaponIds: Object.fromEntries(WEAPON_IDS.map(k => [k, k])),
  armorTypes: Object.fromEntries(ARMOR_TYPES.map(k => [k, k])),
  armorIds: Object.fromEntries(Object.keys(ARMOR_IDS).filter(k => k !== "shield").map(k => [k, k])),
  shieldIds: { shield: "shield" },
  miscEquipmentTypes: Object.fromEntries(MISC_EQUIPMENT_TYPES.map(k => [k, k])),
  consumableTypes: Object.fromEntries(CONSUMABLE_TYPES.map(k => [k, { label: k }])),
  featureTypes: Object.fromEntries(FEATURE_TYPES.map(k => [k, { label: k }])),
  lootTypes: Object.fromEntries(LOOT_TYPES.map(k => [k, { label: k }])),
  containerTypes: Object.fromEntries(CONTAINER_TYPES.map(k => [k, k])),
  itemRarity: ITEM_RARITIES,
  currencies: Object.fromEntries(CURRENCIES.map(k => [k, { label: k }])),
  activityActivationTypes: Object.fromEntries(ACTIVATION_TYPES.map(k => [k, { label: k }])),
  limitedUsePeriods: Object.fromEntries(LIMITED_USE_PERIODS.map(k => [k, { label: k }])),
  timeUnits: Object.fromEntries(TIME_UNITS.map(k => [k, k])),
  specialTimePeriods: { inst: "Instantaneous", spec: "Special" },
  permanentTimePeriods: { disp: "Until Dispelled", dstr: "Until Dispelled or Triggered", perm: "Permanent" },
  areaTargetTypes: Object.fromEntries(AREA_TARGET_TYPES.map(k => [k, { label: k }])),
  individualTargetTypes: Object.fromEntries(INDIVIDUAL_TARGET_TYPES.map(k => [k, { label: k }])),
  spellSchools: Object.fromEntries(Object.entries(SPELL_SCHOOLS).map(([k, v]) => [k, { label: v }])),
  spellcasting: Object.fromEntries(SPELLCASTING_METHODS.map(k => [k, { label: k }])),
  languages: LANGUAGES,
  tools: Object.fromEntries(TOOLS.map(k => [k, k])),
  activityTypes: Object.fromEntries(ACTIVITY_TYPES.map(k => [k, {}])),
  weaponMasteries: Object.fromEntries(WEAPON_MASTERIES.map(k => [k, { label: k }])),
  itemProperties: Object.fromEntries([
    "ada", "amm", "concentration", "fin", "fir", "foc", "gear", "hvy", "lgt", "lod", "material", "mgc", "rch", "rel",
    "ret", "ritual", "sidekick", "sil", "somatic", "spc", "stealthDisadvantage", "thr", "trait", "two",
    "unidentifiedContents", "ver", "vocal", "weightlessContents"
  ].map(k => [k, { label: k }]))
});

/**
 * Keys of a config table (handles plain objects, nested language groups and Sets).
 * @param {string} table
 * @returns {Set<string>}
 */
export function configKeys(table) {
  const cfg = getConfig();
  const value = cfg?.[table];
  if ( !value ) return new Set();
  if ( value instanceof Set ) return new Set(value);
  if ( Array.isArray(value) ) return new Set(value.map(String));
  return new Set(Object.keys(value));
}

/**
 * All language keys, flattening the nested dnd5e language structure.
 * @returns {Map<string, string>} key → lowercased label
 */
export function languageKeys() {
  const cfg = getConfig();
  const out = new Map();
  const walk = (node) => {
    for ( const [key, value] of Object.entries(node ?? {}) ) {
      if ( typeof value === "string" ) out.set(key, value.toLowerCase().replace(/^dnd5e\.language\.language\./i, ""));
      else if ( value && typeof value === "object" ) {
        if ( value.children ) walk(value.children);
        else if ( value.label && !value.children ) out.set(key, String(value.label).toLowerCase());
      }
    }
  };
  if ( cfg.languages === LANGUAGES ) {
    for ( const [k, v] of Object.entries(LANGUAGES) ) out.set(k, v.toLowerCase());
  } else walk(cfg.languages);
  // Always ensure static labels are present for parsing purposes
  for ( const [k, v] of Object.entries(LANGUAGES) ) if ( !out.has(k) ) out.set(k, v.toLowerCase());
  return out;
}
