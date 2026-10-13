import { createActivity, createDamagePart, createItem, createUses } from "../schema.js";
import {
  cleanDice, findDamageType, normalizeText, parseNumberWord, splitSentences, titleCase
} from "../text-utils.js";
import {
  ARMOR_IDS, ARMOR_NAME_ALIASES, BASE_WEAPONS, ITEM_RARITIES, MISC_EQUIPMENT_TYPES, TOOL_NAME_ALIASES,
  WEAPON_PROPERTY_WORDS
} from "../../core/dnd5e-reference.js";
import { validateFormula } from "../../rules/formula-validator.js";

/**
 * Parser for weapons, armor, equipment, consumables and magic items written as text:
 *
 *   Flame Tongue
 *   Weapon (any sword), rare (requires attunement)
 *   You can use a bonus action to speak this magic sword's command word, ...
 *
 * Mundane equipment lines ("Longsword. Martial melee weapon, 15 gp, 3 lb. 1d8 slashing, versatile (1d10)")
 * are also supported. The parser extracts declarative data only; behaviors in the description are
 * interpreted later by the rules interpreter.
 */

const RARITY_WORDS = Object.fromEntries(Object.entries(ITEM_RARITIES).map(([k, v]) => [v, k]));

const TYPE_LINE_RE = /^(Weapon|Armor|Wondrous item|Potion|Scroll|Spell scroll|Ring|Rod|Staff|Wand|Ammunition|Adventuring gear|Tool|Gear|Shield|Consumable|Poison|Food|Trinket|Clothing|Container|Vehicle)s?\s*(?:\(([^)]*)\))?\s*,?\s*(common|uncommon|rare|very rare|legendary|artifact|varies|rarity varies)?\s*(?:\((requires attunement[^)]*)\))?\s*\.?$/i;

/**
 * Score how likely the text is an item stat block.
 * @param {string} text
 * @returns {number}
 */
export function scoreItemBlock(text) {
  const lines = normalizeText(text).split("\n").map(l => l.trim()).filter(Boolean);
  if ( lines.length < 2 ) return 0;
  let score = 0;
  if ( TYPE_LINE_RE.test(lines[1]) ) score += 0.7;
  if ( /requires attunement|charges|\b(uncommon|rare|legendary)\b/i.test(text) ) score += 0.2;
  if ( /\b\d+\s*gp\b/i.test(text) && /\b\d+\s*lb\b/i.test(text) ) score += 0.3;
  if ( /\b\d*d\d+\s+(slashing|piercing|bludgeoning)\b/i.test(text) ) score += 0.2;
  return Math.min(1, score);
}

/**
 * Split text that contains several item blocks (each starts with a name line followed by a type line).
 * @param {string} text
 * @returns {string[]}
 */
export function splitItemBlocks(text) {
  const lines = normalizeText(text).split("\n");
  const starts = [];
  for ( let i = 0; i < lines.length - 1; i++ ) {
    if ( lines[i].trim() && TYPE_LINE_RE.test(lines[i + 1].trim()) ) starts.push(i);
  }
  if ( starts.length <= 1 ) return [lines.join("\n").trim()];
  return starts.map((s, i) => lines.slice(s, starts[i + 1] ?? lines.length).join("\n").trim()).filter(Boolean);
}

/**
 * Parse a single item block.
 * @param {string} text
 * @returns {object} Item IR
 */
export function parseItemBlock(text) {
  const raw = normalizeText(text);
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  if ( !lines.length ) throw new Error("Empty item block");
  const warnings = [];
  const name = lines[0].replace(/\*+/g, "").trim();
  let typeLine = null;
  let bodyStart = 1;
  if ( lines[1] && TYPE_LINE_RE.test(lines[1]) ) { typeLine = lines[1].match(TYPE_LINE_RE); bodyStart = 2; }
  const body = lines.slice(bodyStart).join("\n").trim();
  const lowerBody = body.toLowerCase();

  const info = typeLine ? {
    kind: typeLine[1].toLowerCase(),
    detail: (typeLine[2] ?? "").trim(),
    rarity: typeLine[3] ? (RARITY_WORDS[typeLine[3].toLowerCase()] ?? "") : "",
    attunement: typeLine[4] ?? ""
  } : inferTypeFromBody(name, body);

  const magicalBonus = parseMagicalBonus(name, body);
  const item = createItem({ name, description: { original: body }, source: { format: "text", text: raw }, warnings });
  item.rarity = info.rarity ?? "";
  if ( info.attunement ) {
    item.attunement = "required";
    const note = info.attunement.replace(/^requires attunement\s*/i, "").trim();
    if ( note ) item.attunementNote = note;
  }
  if ( info.rarity || info.attunement || /\bmagic\b|magical/.test(lowerBody) || magicalBonus ) item.properties.push("mgc");

  switch ( info.kind ) {
    case "weapon": case "staff": applyWeapon(item, info, magicalBonus, warnings); break;
    case "armor": case "shield": applyArmor(item, info, magicalBonus, warnings); break;
    case "potion": applyConsumable(item, "potion"); break;
    case "scroll": case "spell scroll": applyConsumable(item, "scroll"); break;
    case "ammunition": applyConsumable(item, "ammo"); break;
    case "poison": applyConsumable(item, "poison"); break;
    case "food": applyConsumable(item, "food"); break;
    case "consumable": applyConsumable(item, "trinket"); break;
    case "wondrous item": item.itemType = "equipment"; item.equipmentType = "wondrous"; break;
    case "ring": item.itemType = "equipment"; item.equipmentType = "ring"; break;
    case "rod": item.itemType = "equipment"; item.equipmentType = "rod"; break;
    case "wand": item.itemType = "equipment"; item.equipmentType = "wand"; item.properties.push("foc"); break;
    case "clothing": item.itemType = "equipment"; item.equipmentType = "clothing"; break;
    case "trinket": item.itemType = "equipment"; item.equipmentType = "trinket"; break;
    case "vehicle": item.itemType = "equipment"; item.equipmentType = "vehicle"; break;
    case "tool": applyTool(item, name); break;
    case "container": item.itemType = "container"; break;
    case "adventuring gear": case "gear": item.itemType = "loot"; item.lootType = "gear"; break;
    default: item.itemType = item.itemType ?? "loot";
  }
  if ( item.itemType === "equipment" && !item.equipmentType ) item.equipmentType = "wondrous";

  // Price / weight (mundane equipment formats)
  const price = body.match(/\b(\d+(?:,\d+)?)\s*(pp|gp|ep|sp|cp)\b/i);
  if ( price ) item.price = { value: Number(price[1].replace(/,/g, "")), denomination: price[2].toLowerCase() };
  const weight = body.match(/\b(\d+(?:\.\d+)?|1\/\d)\s*(lb|lbs|pounds?)\b/i);
  if ( weight ) item.weight = parseWeight(weight[1]);

  // Charges (declarative native data)
  applyCharges(item, body, warnings);
  // Consumable single use
  if ( item.itemType === "consumable" && !item.uses ) item.uses = createUses({ max: 1, autoDestroy: true });

  item.identifier = null;
  item.warnings = warnings;
  item.confidence = typeLine ? 0.95 : 0.7;
  if ( !typeLine ) warnings.push("No type line found; item type was inferred from the name and description.");
  return item;
}

/* -------------------------------------------- */

function inferTypeFromBody(name, body) {
  const n = name.toLowerCase();
  const b = body.toLowerCase();
  if ( /\bpotion\b/.test(n) ) return { kind: "potion", detail: "", rarity: "", attunement: "" };
  if ( /\bscroll\b/.test(n) ) return { kind: "scroll", detail: "", rarity: "", attunement: "" };
  if ( /\bwand\b/.test(n) ) return { kind: "wand", detail: "", rarity: "", attunement: "" };
  if ( /\bring\b/.test(n) ) return { kind: "ring", detail: "", rarity: "", attunement: "" };
  if ( /\brod\b/.test(n) ) return { kind: "rod", detail: "", rarity: "", attunement: "" };
  if ( /\bstaff\b/.test(n) ) return { kind: "staff", detail: "", rarity: "", attunement: "" };
  for ( const alias of Object.keys(ARMOR_NAME_ALIASES) ) if ( n.includes(alias) ) return { kind: "armor", detail: alias, rarity: "", attunement: "" };
  if ( /\bshield\b/.test(n) ) return { kind: "shield", detail: "", rarity: "", attunement: "" };
  for ( const id of Object.keys(BASE_WEAPONS) ) if ( n.includes(weaponLabel(id)) ) return { kind: "weapon", detail: weaponLabel(id), rarity: "", attunement: "" };
  if ( /(melee|ranged) weapon/.test(b) || /\b\d*d\d+\s+(slashing|piercing|bludgeoning)/.test(b) ) return { kind: "weapon", detail: "", rarity: "", attunement: "" };
  if ( /\b(light|medium|heavy) armor\b/.test(b) ) return { kind: "armor", detail: "", rarity: "", attunement: "" };
  for ( const alias of Object.keys(TOOL_NAME_ALIASES) ) if ( n.includes(alias) ) return { kind: "tool", detail: "", rarity: "", attunement: "" };
  const att = b.match(/\(requires attunement[^)]*\)/);
  return { kind: /\bwondrous\b/.test(b) ? "wondrous item" : "gear", detail: "", rarity: "", attunement: att ? att[0].slice(1, -1) : "" };
}

function weaponLabel(id) {
  return { handcrossbow: "hand crossbow", heavycrossbow: "heavy crossbow", lightcrossbow: "light crossbow", lighthammer: "light hammer", warpick: "war pick", greatclub: "greatclub" }[id] ?? id;
}

export function parseMagicalBonus(name, body) {
  let m = name.match(/\+\s*(\d)\b/);
  if ( m ) return Number(m[1]);
  m = body.match(/\+\s*(\d)\s+bonus to (?:attack and damage rolls|AC|armor class|saving throws|spell attack rolls)/i);
  if ( m ) return Number(m[1]);
  return 0;
}

function applyWeapon(item, info, magicalBonus, warnings) {
  item.itemType = "weapon";
  const detail = (info.detail || item.name).toLowerCase();
  let baseItem = "";
  for ( const id of Object.keys(BASE_WEAPONS) ) {
    const label = weaponLabel(id);
    if ( detail === label || detail.includes(label) || detail === `any ${label}` ) { baseItem = id; break; }
  }
  if ( info.kind === "staff" ) baseItem = "quarterstaff";
  const base = baseItem ? BASE_WEAPONS[baseItem] : null;
  const body = item.description.original;
  // Base damage is only read from the leading (mundane) line and never from "extra/additional" damage clauses.
  const firstLine = body.split(/\n|(?<=\.)\s+/)[0] ?? "";
  const damageText = /extra|additional/i.test(firstLine) ? null : firstLine.match(/\b(\d*d\d+(?:\s*[+-]\s*\d+)?)\s+(slashing|piercing|bludgeoning|fire|cold|acid|lightning|thunder|poison|necrotic|radiant|force|psychic)\b/i);
  const versatileText = body.match(/versatile\s*\((\d*d\d+)\)/i);
  const rangeText = body.match(/range\s*\(?(\d+)\s*\/\s*(\d+)\)?/i);
  const props = new Set(base?.properties ?? []);
  for ( const [word, key] of Object.entries(WEAPON_PROPERTY_WORDS) ) {
    if ( new RegExp(`\\b${word}\\b`, "i").test(body.split("\n")[0] ?? "") && !/magical/i.test(word) ) props.add(key);
  }
  if ( /\bany sword\b/.test(detail) || /\bany (melee |ranged )?weapon\b/.test(detail) || /\bany\b/.test(detail) && !baseItem ) {
    warnings.push(`Weapon type "${info.detail}" is a family; choose the base weapon after import (defaults to a longsword for swords, otherwise unspecified).`);
    if ( /sword/.test(detail) ) { baseItem = "longsword"; }
    else if ( /axe/.test(detail) ) { baseItem = "battleaxe"; }
    else if ( /bow/.test(detail) ) { baseItem = "longbow"; }
  }
  const resolvedBase = baseItem ? BASE_WEAPONS[baseItem] : null;
  if ( resolvedBase ) for ( const p of resolvedBase.properties ) props.add(p);
  if ( info.kind === "staff" ) props.add("foc");
  item.weapon = {
    category: resolvedBase?.type ?? (/(ranged)/.test(body.toLowerCase()) ? "simpleR" : "simpleM"),
    baseItem,
    damage: damageText ? { formula: cleanDice(damageText[1]), type: damageText[2].toLowerCase() } : (resolvedBase ? { formula: resolvedBase.damage, type: resolvedBase.type2 } : null),
    versatile: versatileText ? { formula: versatileText[1], type: damageText?.[2]?.toLowerCase() ?? resolvedBase?.type2 ?? "" } : (resolvedBase?.versatile ? { formula: resolvedBase.versatile, type: resolvedBase.type2 } : null),
    range: rangeText ? { value: Number(rangeText[1]), long: Number(rangeText[2]) } : (resolvedBase?.range ? { value: resolvedBase.range[0], long: resolvedBase.range[1] } : null),
    reach: resolvedBase?.reach ?? null,
    properties: [...props].filter(p => p !== "mgc"),
    magicalBonus: magicalBonus || null,
    attackBonus: null
  };
  if ( item.weapon.damage?.formula && !validateFormula(item.weapon.damage.formula).valid ) {
    warnings.push(`Weapon damage "${item.weapon.damage.formula}" could not be validated.`);
    item.weapon.damage = null;
  }
  if ( !item.weapon.damage ) warnings.push("Weapon has no recognizable base damage.");
  const isRanged = ["simpleR", "martialR"].includes(item.weapon.category);
  item.activities.push(createActivity({
    type: "attack",
    activation: { type: "action" },
    attack: { type: isRanged ? "ranged" : "melee", classification: "weapon", ability: "", bonus: "", flat: false },
    includeBase: true,
    range: isRanged && item.weapon.range ? { value: item.weapon.range.value, long: item.weapon.range.long, units: "ft" } : { units: "self", reach: item.weapon.reach ?? 5 },
    target: { affects: { count: "1", type: "creature" } },
    sourceText: ""
  }));
}

function applyArmor(item, info, magicalBonus, warnings) {
  item.itemType = "equipment";
  const detail = (info.detail || item.name).toLowerCase();
  let armorId = ARMOR_NAME_ALIASES[detail] ?? null;
  if ( !armorId ) for ( const [alias, id] of Object.entries(ARMOR_NAME_ALIASES) ) if ( detail.includes(alias) || item.name.toLowerCase().includes(alias) ) { armorId = id; break; }
  if ( !armorId && (info.kind === "shield" || /\bshield\b/.test(detail)) ) armorId = "shield";
  const body = item.description.original;
  const explicit = body.match(/\bAC\s*(\d+)\b|armor class\s*(\d+)/i);
  const typeWord = (body + " " + detail).match(/\b(light|medium|heavy) armor\b/i);
  const stats = armorId ? ARMOR_IDS[armorId] : null;
  item.equipmentType = stats?.type ?? (typeWord ? typeWord[1].toLowerCase() : (info.kind === "shield" ? "shield" : ""));
  if ( !item.equipmentType ) {
    item.equipmentType = "";
    warnings.push(`Armor type for "${info.detail || item.name}" could not be determined (e.g. "medium or heavy"); select it after import.`);
  }
  item.armor = {
    baseItem: armorId ?? "",
    value: explicit ? Number(explicit[1] ?? explicit[2]) : (stats?.ac ?? null),
    dex: stats?.dex ?? (item.equipmentType === "light" ? null : item.equipmentType === "medium" ? 2 : item.equipmentType === "heavy" ? 0 : null),
    strength: stats?.strength ?? null,
    stealthDisadvantage: Boolean(stats?.stealth) || /disadvantage on (?:Dexterity \()?stealth/i.test(body),
    magicalBonus: magicalBonus || null
  };
  const str = body.match(/Str(?:ength)?\s*(\d+)/i);
  if ( str ) item.armor.strength = Number(str[1]);
  if ( item.armor.stealthDisadvantage ) item.properties.push("stealthDisadvantage");
}

function applyConsumable(item, type) {
  item.itemType = "consumable";
  item.consumableType = type;
  const body = item.description.original;
  const heal = body.match(/regain(?:s)?\s+(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+)\s+hit points/i);
  if ( heal && type === "potion" ) {
    const formula = cleanDice(heal[1]);
    item.activities.push(createActivity({
      type: "heal", name: "Drink", activation: { type: "action" }, range: { units: "touch" },
      target: { affects: { count: "1", type: "creature" } },
      healing: createDamagePart({ formula, types: ["healing"] }),
      consumption: [{ type: "itemUses", value: "1" }],
      sourceText: heal[0]
    }));
  }
}

function applyTool(item, name) {
  item.itemType = "tool";
  const n = name.toLowerCase();
  for ( const [alias, id] of Object.entries(TOOL_NAME_ALIASES) ) if ( n.includes(alias) ) { item.toolType = id; break; }
}

/**
 * Extract charge information into native uses data.
 * "This wand has 7 charges" / "regains 1d6 + 1 expended charges daily at dawn" / "regains all expended charges at dawn"
 * / "If you expend the last charge, roll a d20. On a 1, ..." (destruction stays a reviewed mechanic).
 */
export function applyCharges(item, body, warnings) {
  const text = String(body ?? "");
  const m = text.match(/\bhas\s+(\d+|[a-z]+)\s+charges\b/i) ?? text.match(/\b(\d+)\s+charges\b/i);
  if ( !m ) return null;
  const max = parseNumberWord(m[1]);
  if ( max === null ) return null;
  const recovery = [];
  let r;
  if ( (r = text.match(/regains?\s+(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+|all)\s+(?:of its\s+)?expended charges\s+(?:daily|each day|every day)?\s*at\s+(dawn|dusk|midnight|sunset|sunrise)/i)) ) {
    const period = /dawn|sunrise/i.test(r[2]) ? "dawn" : /dusk|sunset/i.test(r[2]) ? "dusk" : "day";
    recovery.push(/all/i.test(r[1]) ? { period, type: "recoverAll", formula: "" } : { period, type: "formula", formula: cleanDice(r[1]) });
  } else if ( (r = text.match(/regains?\s+(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+|all)\s+(?:of its\s+)?expended charges\s+(?:daily|each day)/i)) ) {
    recovery.push(/all/i.test(r[1]) ? { period: "day", type: "recoverAll", formula: "" } : { period: "day", type: "formula", formula: cleanDice(r[1]) });
  } else if ( (r = text.match(/regains?\s+(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+|all)\s+(?:of its\s+)?expended charges\s+(?:after|when you finish|at the end of) a (long|short) rest/i)) ) {
    recovery.push(/all/i.test(r[1]) ? { period: r[2] === "long" ? "lr" : "sr", type: "recoverAll", formula: "" } : { period: r[2] === "long" ? "lr" : "sr", type: "formula", formula: cleanDice(r[1]) });
  } else if ( /can't be recharged|cannot be recharged|never regains/i.test(text) ) {
    // no recovery
  } else {
    warnings?.push("Charges found but no recharge rule was recognized; charges will not recover automatically.");
  }
  for ( const rec of recovery ) if ( rec.type === "formula" && !validateFormula(rec.formula).valid ) { warnings?.push(`Recharge formula "${rec.formula}" is invalid`); rec.type = "recoverAll"; rec.formula = ""; }
  item.uses = createUses({ max, recovery });
  return item.uses;
}

function parseWeight(text) {
  if ( /^\d+\/\d+$/.test(text) ) { const [a, b] = text.split("/").map(Number); return a / b; }
  return Number(text);
}

export { titleCase, splitSentences, findDamageType, MISC_EQUIPMENT_TYPES };
