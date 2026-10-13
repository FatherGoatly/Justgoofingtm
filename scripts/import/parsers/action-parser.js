import { createActivity, createDamagePart, createItem, createUses } from "../schema.js";
import {
  abilityKey, cleanDice, findDamageType, parseAverageAndFormula, parseCount, parseFeet, parseNumberWord
} from "../text-utils.js";
import { AREA_TARGET_TYPES } from "../../core/dnd5e-reference.js";
import { validateFormula } from "../../rules/formula-validator.js";

/**
 * Parse a single stat block feature paragraph (trait, action, bonus action, reaction, legendary
 * action, lair action) into an Item IR with native activities. Supports both the 2014 and the 2024
 * stat block phrasing.
 */

const SECTION_ACTIVATION = Object.freeze({
  trait: null,
  action: "action",
  bonus: "bonus",
  reaction: "reaction",
  legendary: "legendary",
  mythic: "mythic",
  lair: "lair",
  villain: "action"
});

/**
 * Parse the parenthetical usage suffix from a feature name.
 * "Fire Breath (Recharge 5–6)", "Spellcasting (1/Day)", "Wing Attack (Costs 2 Actions)", "Leadership (Recharges after a Short or Long Rest)"
 * @param {string} rawName
 * @returns {{name: string, uses: object|null, legendaryCost: number|null, note: string|null}}
 */
export function parseNameSuffix(rawName) {
  let name = String(rawName ?? "").trim().replace(/\.$/, "");
  let uses = null;
  let legendaryCost = null;
  let note = null;
  const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if ( m ) {
    const inner = m[2].trim();
    const lower = inner.toLowerCase();
    let handled = false;
    let r;
    if ( (r = lower.match(/recharge\s*(\d)(?:\s*[-–]\s*6)?/)) ) {
      uses = createUses({ max: 1, recovery: [{ period: "recharge", type: "recoverAll", formula: r[1] }] });
      handled = true;
    } else if ( /recharges? after a (short|long) rest|recharges? after a short or long rest/.test(lower) ) {
      const period = /short/.test(lower) ? "sr" : "lr";
      uses = createUses({ max: 1, recovery: [{ period, type: "recoverAll" }] });
      handled = true;
    } else if ( (r = lower.match(/^(\d+|[a-z]+)\s*\/\s*(day|long rest|short rest|rest)/)) ) {
      const n = parseNumberWord(r[1]);
      const period = r[2] === "day" ? "day" : r[2].startsWith("short") ? "sr" : "lr";
      uses = createUses({ max: n ?? 1, recovery: [{ period, type: "recoverAll" }] });
      handled = true;
    } else if ( (r = lower.match(/costs?\s*(\d+)\s*actions?/)) ) {
      legendaryCost = Number(r[1]);
      handled = true;
    } else if ( /^(\d+)\s*\/\s*(round|turn)$/.test(lower) ) {
      note = inner;
      handled = true;
    }
    if ( handled ) name = m[1].trim();
    else note = inner;
  }
  return { name, uses, legendaryCost, note };
}

/**
 * Parse an attack sentence. Returns null when the text has no attack line.
 * @param {string} text
 * @returns {object|null}
 */
export function parseAttack(text) {
  const t = String(text ?? "").replace(/[−–]/g, "-");
  // 2014: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target."
  // 2024: "Melee Attack Roll: +5, reach 5 ft." / "Ranged Attack Roll: +7, range 80/320 ft."
  const re = /(Melee or Ranged|Melee|Ranged)\s+(Weapon|Spell)?\s*(?:Attack Roll|Attack)\s*:\s*([+-]\s*\d+)(?:\s*to hit)?[,.]?\s*(.*?)(?=\s*Hit:|$)/is;
  const m = t.match(re);
  if ( !m ) return null;
  const modeWord = m[1].toLowerCase();
  const classification = m[2] ? m[2].toLowerCase() : "weapon";
  const bonus = Number(m[3].replace(/\s+/g, ""));
  const rest = m[4] ?? "";
  const reach = (rest.match(/reach\s*(\d+)\s*ft/i) ?? [])[1];
  const range = rest.match(/range\s*(\d+)(?:\s*\/\s*(\d+))?\s*ft/i);
  const targetMatch = rest.match(/\b(one|two|three|up to \w+|each)\s+(target|creature|creatures|targets|object)/i);
  const result = {
    type: modeWord === "ranged" ? "ranged" : "melee",
    both: modeWord === "melee or ranged",
    classification,
    bonus,
    reach: reach ? Number(reach) : null,
    range: range ? { value: Number(range[1]), long: range[2] ? Number(range[2]) : null } : null,
    targetCount: targetMatch ? parseCount(targetMatch[1].replace(/up to /i, "")) : 1
  };
  // Hit damage
  const hitMatch = t.match(/\bHit:\s*(.*)/i);
  result.damage = [];
  result.hitText = hitMatch ? hitMatch[1] : "";
  if ( hitMatch ) {
    const hit = hitMatch[1];
    const firstSentence = hit.split(/(?<=\.)\s+(?=[A-Z])/)[0];
    const dmgRe = /(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+)\s+damage|(\d*d\d+(?:\s*[+-]\s*\d+)?)\s*([A-Za-z]+)\s+damage|(\d+)\s+([A-Za-z]+)\s+damage/gi;
    let d;
    while ( (d = dmgRe.exec(firstSentence)) ) {
      const formula = cleanDice(d[2] ?? d[4] ?? d[6]);
      const type = findDamageType(d[3] ?? d[5] ?? d[7] ?? "");
      if ( validateFormula(formula).valid ) result.damage.push({ formula, type, average: d[1] ? Number(d[1]) : null });
    }
    // Versatile: "or 10 (1d10 + 4) slashing damage if used with two hands"
    const vers = firstSentence.match(/or\s+(\d+)\s*\(([^)]+)\)\s*([A-Za-z]+)\s+damage\s+if used with two hands/i);
    if ( vers ) {
      result.versatile = { formula: cleanDice(vers[2]), type: findDamageType(vers[3]) };
      result.damage = result.damage.filter(x => x.formula !== result.versatile.formula);
    }
  }
  return result;
}

/**
 * Parse a saving-throw clause (2014 or 2024 phrasing).
 * @param {string} text
 * @returns {object|null}
 */
export function parseSave(text) {
  const t = String(text ?? "").replace(/[−–]/g, "-");
  let ability = null, dc = null;
  // 2024: "Dexterity Saving Throw: DC 15, each creature in a 60-foot Cone."
  let m = t.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw\s*:\s*DC\s*(\d+)/i);
  if ( m ) { ability = abilityKey(m[1]); dc = Number(m[2]); }
  // 2014: "must succeed on a DC 15 Dexterity saving throw" / "must make a DC 15 Dexterity saving throw"
  if ( !ability ) {
    m = t.match(/DC\s*(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i);
    if ( m ) { ability = abilityKey(m[2]); dc = Number(m[1]); }
  }
  if ( !ability ) {
    m = t.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\s*\(DC\s*(\d+)\)/i);
    if ( m ) { ability = abilityKey(m[1]); dc = Number(m[2]); }
  }
  if ( !ability ) return null;
  const result = { ability, dc, damage: [], onSave: "none", successText: null, failureText: null };
  // Area
  const area = parseArea(t);
  if ( area ) result.area = area;
  const targetMatch = t.match(/\b(each|one|every)\s+(creature|target|enemy|ally|humanoid)s?\b/i);
  if ( targetMatch ) result.target = { count: targetMatch[1].toLowerCase() === "one" ? 1 : null, type: ["enemy", "ally"].includes(targetMatch[2].toLowerCase()) ? targetMatch[2].toLowerCase() : "creature" };
  // Damage on failure
  // 2024: "Failure: 56 (16d6) Fire damage. Success: Half damage."
  let f = t.match(/Failure:\s*([^]*?)(?=\s*Success:|\s*Failure or Success:|$)/i);
  const s = t.match(/Success:\s*([^.]*)\./i);
  if ( f ) {
    result.failureText = f[1].trim();
    result.damage = parseDamageList(f[1]);
  } else {
    // 2014: "taking 56 (16d6) fire damage on a failed save, or half as much damage on a successful one"
    f = t.match(/taking\s+([^.]*?)\s+on a failed save/i);
    if ( f ) {
      result.failureText = f[1].trim();
      result.damage = parseDamageList(f[1]);
    } else {
      f = t.match(/On a failed save,?\s*(?:the (?:target|creature) )?(?:takes\s+)?([^.]*?)(?:\.|$)/i);
      if ( f ) { result.failureText = f[1].trim(); result.damage = parseDamageList(f[1]); }
    }
  }
  if ( s ) result.successText = s[1].trim();
  if ( /half as much damage on a successful|Success:\s*Half damage|half damage on a success/i.test(t) ) result.onSave = "half";
  else if ( result.damage.length ) result.onSave = "none";
  // Condition on failure
  const cond = t.match(/\b(?:or (?:be|become|is|have the)|Failure:[^.]*?(?:has the|is|becomes?))\s+([a-z]+)\s+(?:condition|for|until)/i)
    ?? t.match(/\bor (?:be|become)\s+([a-z]+)\b/i);
  if ( cond ) {
    const word = cond[1].toLowerCase();
    if ( /^(blinded|charmed|deafened|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious|exhausted)$/.test(word) ) {
      result.condition = word === "exhausted" ? "exhaustion" : word;
    }
  }
  if ( !result.condition ) {
    const cond2 = t.match(/has the\s+([A-Za-z]+)\s+condition/i);
    if ( cond2 ) result.condition = cond2[1].toLowerCase();
  }
  return result;
}

/** Parse "60-foot cone", "20-foot-radius sphere", "30-foot line that is 5 feet wide". */
export function parseArea(text) {
  const t = String(text ?? "");
  let m = t.match(/(\d+)-foot(?:-radius)?\s+(cone|cube|line|sphere|cylinder|circle|square|emanation|radius|wall)/i);
  if ( !m ) m = t.match(/(cone|cube|line|sphere|cylinder|circle|square)\s+(?:that is\s+)?(\d+)\s*(?:feet|ft)\b/i);
  if ( !m ) return null;
  const isTypeFirst = isNaN(Number(m[1]));
  const size = Number(isTypeFirst ? m[2] : m[1]);
  let type = (isTypeFirst ? m[1] : m[2]).toLowerCase();
  if ( type === "emanation" ) type = "radius";
  if ( !AREA_TARGET_TYPES.includes(type) ) return null;
  const width = t.match(/(\d+)\s*(?:feet|ft\.?)\s*wide/i);
  return { type, size, width: width ? Number(width[1]) : null };
}

function parseDamageList(text) {
  const out = [];
  const re = /(?:(\d+)\s*\()?(\d*d\d+(?:\s*[+-]\s*\d+)?|\d+)\)?\s*([A-Za-z]+)\s+damage/gi;
  let m;
  while ( (m = re.exec(String(text ?? "").replace(/[−–]/g, "-"))) ) {
    const formula = cleanDice(m[2]);
    const type = findDamageType(m[3]);
    if ( !type && !/^\d*d\d+/.test(formula) ) continue;
    if ( validateFormula(formula).valid ) out.push({ formula, type, average: m[1] ? Number(m[1]) : null });
  }
  return out;
}

/**
 * Parse a trait/action paragraph into an Item IR.
 * @param {object} options
 * @param {string} options.name       Feature name (may include suffix in parentheses).
 * @param {string} options.text       Full feature text, excluding the name.
 * @param {string} options.section    One of trait, action, bonus, reaction, legendary, mythic, lair, villain.
 * @param {object} [options.context]  { abilities, proficiency, spellDC } for derived data.
 * @returns {object} Item IR
 */
export function parseFeature({ name: rawName, text, section="trait", context={} }) {
  const { name, uses, legendaryCost, note } = parseNameSuffix(rawName);
  const body = String(text ?? "").trim();
  const activationType = SECTION_ACTIVATION[section] ?? null;
  const attack = parseAttack(body);
  const save = parseSave(body);
  const activities = [];
  const warnings = [];
  let itemType = "feat";
  let weapon = null;

  const baseActivation = { type: activationType ?? "special", value: null, condition: "" };
  if ( section === "legendary" ) baseActivation.value = legendaryCost ?? 1;
  if ( section === "mythic" ) baseActivation.value = legendaryCost ?? 1;
  if ( section === "trait" ) {
    const trig = body.match(/^(?:When|Whenever|If|While|After|At the start of|At the end of)\b[^,.]*/i);
    baseActivation.condition = trig ? trig[0].slice(0, 120) : "";
  }

  if ( attack ) {
    itemType = "weapon";
    const damageParts = attack.damage.map(d => createDamagePart({ formula: d.formula, types: d.type ? [d.type] : [] }));
    const base = damageParts[0] ?? null;
    weapon = {
      category: "natural",
      baseItem: "",
      damage: base ? { formula: base.formula, type: base.types[0] ?? "" } : null,
      versatile: attack.versatile ?? null,
      range: attack.range ? { value: attack.range.value, long: attack.range.long } : null,
      reach: attack.reach ?? (attack.type === "melee" ? 5 : null),
      properties: attack.both ? ["thr"] : [],
      attackBonus: attack.bonus
    };
    const act = createActivity({
      type: "attack",
      name: "",
      activation: baseActivation,
      attack: { type: attack.type, classification: attack.classification === "spell" ? "spell" : "weapon", ability: "", bonus: "", flat: false },
      damage: damageParts.slice(1),
      includeBase: true,
      range: attack.type === "ranged" && attack.range ? { value: attack.range.value, long: attack.range.long, units: "ft" } : { value: null, units: "self", reach: attack.reach ?? 5 },
      target: { affects: { count: attack.targetCount ? String(attack.targetCount) : "1", type: "creature" } },
      sourceText: body
    });
    act.attackFlat = attack.bonus;
    activities.push(act);
    if ( attack.both ) {
      weapon.properties = ["thr"];
    }
  }

  if ( save ) {
    const act = createActivity({
      type: "save",
      name: attack ? "Saving Throw" : "",
      activation: attack ? { type: "special", value: null, condition: "On a hit" } : baseActivation,
      save: { ability: [save.ability], dc: { calculation: "", formula: save.dc !== null ? String(save.dc) : "" }, onSave: save.onSave },
      damage: save.damage.map(d => createDamagePart({ formula: d.formula, types: d.type ? [d.type] : [] })),
      range: save.area ? { value: null, units: "self" } : { value: null, units: "self" },
      target: save.area
        ? { template: { type: save.area.type, size: String(save.area.size), width: save.area.width ? String(save.area.width) : "", units: "ft" }, affects: { type: save.target?.type ?? "creature", count: "" } }
        : { affects: { type: save.target?.type ?? "creature", count: save.target?.count ? String(save.target.count) : "1" } },
      sourceText: body
    });
    if ( save.condition ) act.conditionOnFail = save.condition;
    activities.push(act);
  }

  // Generic healing e.g. "regains 10 (3d6) hit points"
  const heal = body.match(/regains?\s+(\d+)\s*\(([^)]+)\)\s*hit points|regains?\s+(\d*d\d+(?:\s*[+-]\s*\d+)?)\s*hit points/i);
  if ( heal && !attack && !save ) {
    const formula = cleanDice(heal[2] ?? heal[3]);
    activities.push(createActivity({ type: "heal", activation: baseActivation, healing: createDamagePart({ formula, types: ["healing"] }), target: { affects: { type: "creature", count: "1" } }, sourceText: body }));
  }

  if ( !activities.length && activationType ) {
    // An action without a recognized roll still gets a utility activity so it can be used from the sheet.
    activities.push(createActivity({ type: "utility", activation: baseActivation, range: { units: "self" }, sourceText: body }));
  }
  if ( !activities.length && section === "trait" && uses ) {
    activities.push(createActivity({ type: "utility", activation: { type: "special", condition: baseActivation.condition }, range: { units: "self" }, sourceText: body }));
  }

  // Attach uses consumption to the first activity
  if ( uses && activities.length ) {
    activities[0].consumption.push({ type: "itemUses", target: "", value: "1", scaling: null });
  }

  const multiattack = /^multiattack$/i.test(name);
  const item = createItem({
    itemType,
    name,
    description: { original: body },
    featType: itemType === "feat" ? { value: "monster", subtype: multiattack ? "multiattack" : "" } : null,
    weapon,
    uses,
    activities,
    requirements: "",
    properties: itemType === "feat" && section === "trait" ? ["trait"] : [],
    warnings
  });
  item.section = section;
  item.legendaryCost = legendaryCost;
  if ( note ) item.nameNote = note;
  if ( section === "trait" && !activationType ) item.passive = true;
  // Attach raw parse results for the interpreter
  item.parsed = { attack, save, note };
  return item;
}

/**
 * Parse a "Multiattack" description into a count hint.
 * @param {string} text
 * @returns {number|null}
 */
export function parseMultiattackCount(text) {
  const m = String(text ?? "").match(/makes\s+(\w+)\s+(?:attacks|melee attacks|ranged attacks|weapon attacks)/i);
  return m ? parseNumberWord(m[1]) : null;
}

export { parseFeet, parseAverageAndFormula };
