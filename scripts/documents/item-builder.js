import { FLAG_SCOPE, FLAGS, MODULE_VERSION, IR_VERSION } from "../core/constants.js";
import {
  ARMOR_IDS, BASE_WEAPONS, CONSUMABLE_TYPES, DAMAGE_TYPES, FEATURE_TYPES, HEALING_TYPES, LOOT_TYPES, MISC_EQUIPMENT_TYPES,
  SPELL_SCHOOLS, WEAPON_IDS, WEAPON_TYPES, configKeys
} from "../core/dnd5e-reference.js";
import { splitSimpleDice, validateFormula } from "../rules/formula-validator.js";
import { paragraphsToHTML } from "../import/text-utils.js";
import { buildEffect, randomID } from "./effect-builder.js";

/**
 * Build dnd5e 6.0.6 Item document data from an Item IR.
 *
 * The builder is deterministic and side-effect free. It returns the data for `Item.create` /
 * `createEmbeddedDocuments`, the effects embedded in it, and the mechanics that must be stored in
 * module flags for the runtime.
 *
 * @param {object} item                     Item IR
 * @param {object} [context]
 * @param {object} [context.actor]          Actor IR when embedded (used for attack/damage fidelity).
 * @param {object} [context.provenance]     Import provenance flags.
 * @param {Map<string,string>} [context.spellUuids]  Spell name (lowercase) → compendium uuid.
 * @returns {{data: object, warnings: string[], mechanics: object[]}}
 */
export function buildItem(item, context={}) {
  const warnings = [...(item.warnings ?? [])];
  const type = item.itemType === "backpack" ? "container" : item.itemType;
  const html = item.description?.html ?? paragraphsToHTML(item.description?.original ?? "");
  const data = {
    name: item.name,
    type,
    img: item.img ?? defaultImage(type, item),
    system: {
      description: { value: html, chat: "" },
      identifier: item.identifier ?? undefined,
      source: { custom: item.source?.title ?? "", book: "", page: "" }
    },
    effects: [],
    flags: {}
  };
  if ( item.rawDocument ) return buildFromRaw(item, data, context, warnings);
  const sys = data.system;
  switch ( type ) {
    case "weapon": buildWeapon(item, sys, context, warnings); break;
    case "equipment": buildEquipment(item, sys, warnings); break;
    case "consumable": buildConsumable(item, sys, warnings); break;
    case "spell": buildSpell(item, sys, warnings); break;
    case "feat": buildFeat(item, sys, warnings); break;
    case "loot": buildLoot(item, sys); break;
    case "tool": buildTool(item, sys); break;
    case "container": buildContainer(item, sys); break;
    case "class": buildClass(item, sys); break;
    case "subclass": buildSubclass(item, sys); break;
    case "race": buildRace(item, sys); break;
    case "background": break;
    default: warnings.push(`Unsupported item type "${type}"`);
  }
  if ( PHYSICAL.has(type) ) buildPhysical(item, sys);
  if ( ACTIVATED.has(type) ) {
    sys.uses = buildUses(item.uses);
    sys.activities = buildActivities(item, context, warnings, data);
  }
  if ( item.properties?.length ) sys.properties = [...new Set([...(sys.properties ?? []), ...item.properties])];
  // Effects
  for ( const eff of item.effects ?? [] ) {
    const built = buildEffect(eff, { itemName: item.name, img: data.img, provenance: context.provenance });
    warnings.push(...built.warnings);
    data.effects.push(built.data);
  }
  // Re-link activity effects now that ids exist
  for ( const act of Object.values(sys.activities ?? {}) ) {
    if ( !act.__effectRefs ) continue;
    act.effects = act.__effectRefs.map(ref => {
      const eff = (item.effects ?? []).find(e => e.id === ref.effectId);
      return eff?.foundryId ? { _id: eff.foundryId, onSave: Boolean(ref.onSave) } : null;
    }).filter(Boolean);
    delete act.__effectRefs;
  }
  const mechanics = (item.mechanics ?? []).map(m => ({ ...m }));
  data.flags[FLAG_SCOPE] = {
    [FLAGS.IMPORT]: { moduleVersion: MODULE_VERSION, irVersion: IR_VERSION, irId: item.id, fingerprint: item.fingerprint ?? null, format: item.source?.format ?? null, importedAt: null, sourceText: item.source?.text?.slice(0, 20000) ?? "", ...(context.provenance ?? {}) },
    [FLAGS.MECHANICS]: mechanics
  };
  if ( item.placeholder ) data.flags[FLAG_SCOPE].placeholder = item.placeholder;
  return { data, warnings, mechanics };
}

const PHYSICAL = new Set(["weapon", "equipment", "consumable", "loot", "tool", "container"]);
const ACTIVATED = new Set(["weapon", "equipment", "consumable", "spell", "feat", "tool"]);

/* -------------------------------------------- */

function buildPhysical(item, sys) {
  sys.quantity = Math.max(0, Number(item.quantity ?? 1) || 1);
  sys.weight = { value: Number(item.weight ?? 0) || 0, units: "lb" };
  sys.price = { value: Number(item.price?.value ?? 0) || 0, denomination: item.price?.denomination ?? "gp" };
  sys.rarities = item.rarity ? [item.rarity] : [];
  sys.identified = true;
  sys.unidentified = { description: "" };
  sys.container = null;
  if ( ["weapon", "equipment", "tool"].includes(item.itemType) || (item.itemType === "consumable") ) {
    sys.attunement = item.attunement === "required" ? "required" : item.attunement === "optional" ? "optional" : "";
    sys.attuned = false;
    if ( item.equipped !== null && item.equipped !== undefined ) sys.equipped = Boolean(item.equipped);
  }
}

function buildUses(uses) {
  if ( !uses ) return { spent: 0, max: "", recovery: [] };
  const recovery = (uses.recovery ?? []).map(r => ({ period: r.period, type: r.type ?? "recoverAll", formula: r.formula ?? "" }));
  return { spent: Number(uses.spent ?? 0) || 0, max: uses.max === null || uses.max === undefined ? "" : String(uses.max), recovery };
}

/* -------------------------------------------- */
/*  Types                                       */
/* -------------------------------------------- */

function buildWeapon(item, sys, context, warnings) {
  const w = item.weapon ?? {};
  const category = WEAPON_TYPES.includes(w.category) ? w.category : "simpleM";
  const baseItem = WEAPON_IDS.includes(w.baseItem) ? w.baseItem : "";
  sys.type = { value: category, baseItem };
  const base = damageData(w.damage?.formula, w.damage?.type, warnings, "weapon damage");
  sys.damage = { base: base ?? emptyDamage(), versatile: w.versatile ? (damageData(w.versatile.formula, w.versatile.type ?? w.damage?.type, warnings, "versatile damage") ?? emptyDamage()) : emptyDamage() };
  sys.magicalBonus = w.magicalBonus ? String(w.magicalBonus) : null;
  sys.properties = [...new Set([...(w.properties ?? []), ...(item.properties ?? [])])].filter(p => p !== "mgc" || true);
  sys.proficient = null;
  sys.range = { value: w.range?.value ?? null, long: w.range?.long ?? null, reach: w.reach ?? null, units: "ft" };
  sys.mastery = "";
  sys.ammunition = { type: w.ammunition ?? "" };
  sys.armor = { value: null };
  if ( category === "natural" ) sys.equipped = true;
}

function buildEquipment(item, sys, warnings) {
  const eqType = item.equipmentType ?? "";
  const valid = new Set([...configKeys("armorTypes"), ...MISC_EQUIPMENT_TYPES, ...configKeys("miscEquipmentTypes")]);
  sys.type = { value: valid.has(eqType) ? eqType : "", baseItem: item.armor?.baseItem && (item.armor.baseItem in ARMOR_IDS) ? item.armor.baseItem : "" };
  if ( !valid.has(eqType) && eqType ) warnings.push(`Unknown equipment type "${eqType}"`);
  const a = item.armor ?? {};
  sys.armor = { value: Number.isFinite(a.value) ? a.value : null, dex: a.dex === null || a.dex === undefined ? null : a.dex, magicalBonus: a.magicalBonus ? String(a.magicalBonus) : null };
  sys.strength = Number.isFinite(a.strength) ? a.strength : null;
  sys.properties = [...(item.properties ?? [])];
  if ( a.stealthDisadvantage && !sys.properties.includes("stealthDisadvantage") ) sys.properties.push("stealthDisadvantage");
  sys.proficient = null;
}

function buildConsumable(item, sys, warnings) {
  const ctype = CONSUMABLE_TYPES.includes(item.consumableType) ? item.consumableType : "trinket";
  sys.type = { value: ctype, subtype: item.consumableSubtype ?? "" };
  const heal = item.activities?.find(a => a.type === "heal")?.healing;
  sys.damage = { base: heal ? (damageData(heal.formula, heal.types?.[0] ?? "healing", warnings, "consumable damage") ?? emptyDamage()) : emptyDamage(), replace: false };
  sys.magicalBonus = null;
  sys.properties = [...(item.properties ?? [])];
}

function buildSpell(item, sys, warnings) {
  const sp = item.spell ?? {};
  sys.level = Number.isInteger(sp.level) ? sp.level : 0;
  sys.school = (sp.school in SPELL_SCHOOLS) ? sp.school : "";
  sys.activation = activationData(item.activation ?? { type: "action", value: null, condition: "" });
  sys.duration = { value: sp.duration?.value ?? "", units: sp.duration?.units ?? "inst", special: sp.duration?.special ?? "" };
  sys.range = { value: sp.range?.value ?? null, units: sp.range?.units ?? "self", special: sp.range?.special ?? "" };
  const first = item.activities?.[0];
  sys.target = first ? targetData(first.target) : targetData(null);
  sys.materials = { value: sp.materials?.value ?? "", consumed: Boolean(sp.materials?.consumed), cost: Number(sp.materials?.cost ?? 0) || 0, supply: 0 };
  sys.properties = [...(item.properties ?? [])];
  sys.method = sp.method ?? "spell";
  sys.prepared = Number.isInteger(sp.prepared) ? sp.prepared : 0;
  sys.ability = sp.ability ?? "";
  sys.sourceItem = sp.sourceItem ?? "";
}

function buildFeat(item, sys, warnings) {
  const ft = item.featType ?? { value: "", subtype: "" };
  sys.type = { value: FEATURE_TYPES.includes(ft.value) ? ft.value : "", subtype: ft.subtype ?? "" };
  sys.requirements = item.requirements ?? "";
  sys.prerequisites = { level: null, repeatable: false, items: [] };
  sys.properties = [...(item.properties ?? [])];
  sys.enchant = {};
}

function buildLoot(item, sys) {
  sys.type = { value: LOOT_TYPES.includes(item.lootType) ? item.lootType : "", subtype: "" };
  sys.properties = [...(item.properties ?? [])];
}

function buildTool(item, sys) {
  sys.type = { value: configKeys("toolTypes").has(item.toolCategory) ? item.toolCategory : "", baseItem: item.toolType ?? "" };
  sys.ability = item.toolAbility ?? "int";
  sys.bonus = "";
  sys.chatFlavor = "";
  sys.proficient = null;
  sys.properties = [...(item.properties ?? [])];
}

function buildContainer(item, sys) {
  sys.capacity = { count: null, volume: { value: null, units: "cubicFoot" }, weight: { value: item.capacity ?? null, units: "lb" } };
  sys.properties = [...(item.properties ?? [])];
  sys.quantity = 1;
}

function buildClass(item, sys) {
  const c = item.classData ?? {};
  sys.levels = Math.max(1, Number(c.levels ?? 1) || 1);
  sys.hd = { denomination: /^d\d+$/.test(c.hitDie ?? "") ? c.hitDie : "d8", spent: 0, additional: "" };
  sys.identifier = c.identifier ?? item.identifier;
  sys.primaryAbility = { value: [], all: true };
  sys.spellcasting = { progression: c.progression ?? "none", ability: c.spellcastingAbility ?? "", preparation: { formula: "" } };
  sys.properties = [];
}

function buildSubclass(item, sys) {
  const s = item.subclassData ?? {};
  sys.classIdentifier = s.classIdentifier ?? "";
  sys.identifier = s.identifier ?? item.identifier;
  sys.spellcasting = { progression: s.progression ?? "none", ability: s.spellcastingAbility ?? "", preparation: { formula: "" } };
}

function buildRace(item, sys) {
  const r = item.raceData ?? {};
  sys.movement = { speeds: Object.fromEntries(Object.entries(r.movement ?? { walk: 30 }).map(([k, v]) => [k, String(v)])), units: null, hover: false };
  sys.senses = { ranges: r.senses ?? {}, units: null, special: "" };
  sys.type = { value: r.type ?? "humanoid", subtype: "", custom: "" };
}

/* -------------------------------------------- */
/*  Activities                                  */
/* -------------------------------------------- */

function buildActivities(item, context, warnings, data) {
  const out = {};
  for ( const [index, act] of (item.activities ?? []).entries() ) {
    const id = act.foundryId ?? randomID();
    act.foundryId = id;
    const base = {
      _id: id,
      type: act.type,
      name: act.name ?? "",
      img: "",
      sort: index * 100000,
      activation: { ...activationData(act.activation), override: Boolean(act.activation?.override) },
      consumption: {
        scaling: { allowed: Boolean(act.consumptionScaling?.allowed), max: act.consumptionScaling?.max ?? "" },
        spellSlot: true,
        targets: (act.consumption ?? []).map(c => ({ type: c.type, target: c.target ?? "", value: String(c.value ?? "1"), scaling: c.scaling ?? {} }))
      },
      description: { chatFlavor: "", value: act.description ?? "" },
      duration: { value: act.duration?.value ?? "", units: act.duration?.units ?? (item.itemType === "spell" ? "" : "inst"), special: act.duration?.special ?? "", concentration: Boolean(act.duration?.concentration), override: Boolean(act.duration?.override) },
      effects: [],
      range: { value: act.range?.value === null || act.range?.value === undefined ? "" : String(act.range.value), units: act.range?.units ?? "self", special: act.range?.special ?? "", override: Boolean(act.range?.override) },
      target: { ...targetData(act.target), prompt: true, override: Boolean(act.target?.override) },
      uses: buildUses(act.uses),
      visibility: { requireMagic: Boolean(act.visibilityRequireMagic), level: { min: null, max: null }, identifier: "", requireAttunement: false, requireIdentification: Boolean(act.visibilityRequireMagic) },
      flags: {}
    };
    if ( item.itemType === "spell" ) {
      // Spells inherit activation/range/duration/target from the item unless overridden.
      base.activation = { type: "", value: null, condition: "", override: false };
      base.range = { value: "", units: "", special: "", override: false };
      base.duration = { value: "", units: "", special: "", concentration: false, override: false };
    }
    if ( act.effects?.length ) base.__effectRefs = act.effects;
    switch ( act.type ) {
      case "attack": buildAttackActivity(act, base, item, context, warnings); break;
      case "save": buildSaveActivity(act, base, item, context, warnings); break;
      case "damage": base.damage = { critical: { allow: false, bonus: "" }, parts: damageParts(act.damage, warnings) }; break;
      case "heal": base.healing = act.healing ? (damageData(act.healing.formula, act.healing.types?.[0] ?? "healing", warnings, "healing", act.healing.scaling) ?? emptyDamage()) : emptyDamage(); break;
      case "utility": base.roll = { formula: act.roll?.formula ?? "", name: act.roll?.name ?? "", prompt: Boolean(act.roll?.prompt), visible: Boolean(act.roll?.visible) }; break;
      case "cast": {
        base.spell = { uuid: act.spell?.uuid ?? "", level: act.spell?.level ?? null, properties: act.spell?.properties ?? ["vocal", "somatic", "material"], spellbook: act.spell?.spellbook ?? true, ability: act.spell?.ability ?? "", challenge: { attack: act.spell?.challenge?.attack ?? null, save: act.spell?.challenge?.save ?? null, override: Boolean(act.spell?.challenge?.override) } };
        delete base.effects;
        break;
      }
      case "summon": base.profiles = act.summon?.profiles ?? []; base.summon = { mode: "", prompt: true }; base.creatureSizes = []; base.creatureTypes = []; base.match = { ability: "", attacks: false, disposition: true, proficiency: false, saves: false }; base.bonuses = { ac: "", hd: "", hp: "", attackDamage: "", saveDamage: "", healing: "" }; base.tempHP = ""; break;
      case "check": base.check = { ability: act.check?.ability ?? "", associated: [], bonus: "", dc: { calculation: "", formula: act.check?.dc ? String(act.check.dc) : "" }, visible: true }; break;
      default: warnings.push(`Activity type "${act.type}" not supported; converted to utility`); base.type = "utility"; base.roll = { formula: "", name: "", prompt: false, visible: false };
    }
    out[id] = base;
  }
  return out;
}

function buildAttackActivity(act, base, item, context, warnings) {
  const atk = act.attack ?? {};
  const classification = ["weapon", "spell", "unarmed"].includes(atk.classification) ? atk.classification : "weapon";
  const typeValue = ["melee", "ranged"].includes(atk.type) ? atk.type : "";
  let ability = atk.ability ?? "";
  let bonus = atk.bonus ?? "";
  let flat = Boolean(atk.flat);
  const includeBase = act.includeBase !== false;
  const parts = damageParts(act.damage, warnings);
  // Fidelity for stat-block attacks: reconcile the stated attack bonus and damage with ability mod + proficiency.
  if ( Number.isFinite(act.attackFlat) && context.actor ) {
    const rec = reconcileAttack(act, item, context.actor, typeValue);
    ability = rec.ability;
    bonus = rec.attackBonus;
    flat = rec.flat;
    if ( rec.damageBonusAdjust !== null && item.weapon && base.type === "attack" ) {
      // adjust the weapon's base damage bonus so the roll equals the stated formula
      const baseDamage = context.__weaponDamage ?? null;
      if ( baseDamage ) baseDamage.bonus = rec.damageBonusAdjust ? String(rec.damageBonusAdjust) : "";
    }
    if ( rec.note ) warnings.push(rec.note);
  } else if ( Number.isFinite(act.attackFlat) ) {
    flat = true;
    bonus = String(act.attackFlat);
  }
  if ( bonus && !validateFormula(String(bonus)).valid ) { warnings.push(`Attack bonus "${bonus}" invalid; dropped`); bonus = ""; }
  base.attack = { ability, bonus: String(bonus ?? ""), critical: { threshold: atk.critical?.threshold ?? null }, flat, type: { value: typeValue, classification } };
  base.damage = { critical: { bonus: "" }, includeBase, parts };
}

/**
 * Reconcile a stat block's stated "+X to hit" and "1d8 + 4" with the creature's abilities so the
 * system rolls exactly the printed numbers while remaining dynamic.
 */
function reconcileAttack(act, item, actor, typeValue) {
  const prof = actor.proficiencyBonus ?? 2;
  const mods = Object.fromEntries(Object.entries(actor.abilities ?? {}).map(([k, v]) => [k, Math.floor(((v.value ?? 10) - 10) / 2)]));
  const stated = act.attackFlat;
  const statedDamage = item.weapon?.damage?.formula ? splitSimpleDice(item.weapon.damage.formula) : null;
  const statedDamageBonus = statedDamage ? Number(statedDamage.bonus || 0) : null;
  const candidates = act.attack?.classification === "spell" ? ["cha", "int", "wis"] : (typeValue === "ranged" ? ["dex", "str"] : ["str", "dex"]);
  // Prefer an ability whose mod + prof matches the stated attack bonus AND whose mod matches the damage bonus.
  let ability = candidates[0];
  for ( const k of candidates ) {
    if ( mods[k] + prof === stated && (statedDamageBonus === null || mods[k] === statedDamageBonus) ) { ability = k; break; }
  }
  if ( !(mods[ability] + prof === stated) ) {
    for ( const k of candidates ) if ( mods[k] + prof === stated ) { ability = k; break; }
  }
  const expectedAttack = mods[ability] + prof;
  const diff = stated - expectedAttack;
  const attackBonus = diff ? String(diff) : "";
  let damageBonusAdjust = null;
  let note = null;
  if ( statedDamageBonus !== null ) {
    const d = statedDamageBonus - mods[ability];
    damageBonusAdjust = d;
    if ( d && !diff ) note = `${item.name}: stated damage bonus (+${statedDamageBonus}) differs from the ${ability.toUpperCase()} modifier; a +${d} damage bonus was added to match the stat block.`;
  }
  return { ability, attackBonus, flat: false, damageBonusAdjust, note };
}

function buildSaveActivity(act, base, item, context, warnings) {
  const s = act.save ?? {};
  const abilities = (s.ability ?? []).filter(a => ["str", "dex", "con", "int", "wis", "cha"].includes(a));
  if ( !abilities.length ) warnings.push(`${item.name}: save activity without ability`);
  let calculation = s.dc?.calculation ?? "";
  let formula = s.dc?.formula ?? "";
  if ( calculation === "" && formula === "" ) {
    // Stat blocks: a flat DC is always stated; if missing, the mechanic was flagged by the interpreter.
    calculation = "spellcasting";
  }
  if ( formula && !validateFormula(formula, { deterministic: true }).valid ) { warnings.push(`Save DC formula "${formula}" invalid`); formula = ""; }
  base.save = { ability: abilities, bonus: "", dc: { calculation: calculation === "" && formula ? "" : calculation, formula }, visible: true };
  base.damage = { onSave: ["half", "none", "full"].includes(s.onSave) ? s.onSave : "half", parts: damageParts(act.damage, warnings) };
}

/* -------------------------------------------- */
/*  Shared data shapes                          */
/* -------------------------------------------- */

export function activationData(activation) {
  const a = activation ?? {};
  return { type: a.type ?? "action", value: a.value ?? null, condition: a.condition ?? "" };
}

export function targetData(target) {
  const t = target ?? {};
  const tpl = t.template ?? {};
  const aff = t.affects ?? {};
  return {
    template: { count: tpl.count ?? "", contiguous: false, type: tpl.type ?? "", size: tpl.size ?? "", width: tpl.width ?? "", height: tpl.height ?? "", units: tpl.units ?? "ft" },
    affects: { count: aff.count ?? "", type: aff.type ?? "", choice: Boolean(aff.choice), special: aff.special ?? "" }
  };
}

export function emptyDamage() {
  return { number: null, denomination: null, bonus: "", types: [], custom: { enabled: false, formula: "" }, scaling: { mode: "", number: null, formula: "" } };
}

/**
 * Build a dnd5e DamageData object from a formula and type.
 * Simple "NdX + B" formulas become structured; anything else becomes a custom formula.
 */
export function damageData(formula, type, warnings, label="damage", scaling=null) {
  if ( !formula ) return null;
  const v = validateFormula(formula);
  if ( !v.valid ) { warnings?.push(`Invalid ${label} formula "${formula}": ${v.errors.join("; ")}`); return null; }
  const types = type && (DAMAGE_TYPES.includes(type) || HEALING_TYPES.includes(type)) ? [type] : [];
  if ( type && !types.length ) warnings?.push(`Unknown damage type "${type}" for ${label}`);
  const simple = splitSimpleDice(v.formula);
  const scalingData = scaling ? { mode: scaling.mode === "half" ? "half" : "whole", number: Number(scaling.number ?? 1) || 1, formula: scaling.formula ?? "" } : { mode: "", number: null, formula: "" };
  if ( simple ) {
    return { number: simple.number, denomination: simple.denomination, bonus: simple.bonus, types, custom: { enabled: false, formula: "" }, scaling: scalingData };
  }
  if ( /^\d+$/.test(v.formula) ) return { number: null, denomination: null, bonus: v.formula, types, custom: { enabled: false, formula: "" }, scaling: scalingData };
  return { number: null, denomination: null, bonus: "", types, custom: { enabled: true, formula: v.formula }, scaling: scalingData };
}

function damageParts(parts, warnings) {
  return (parts ?? []).map(p => damageData(p.formula ?? (p.number ? `${p.number}d${p.denomination}${p.bonus ? ` + ${p.bonus}` : ""}` : p.bonus), p.types?.[0] ?? "", warnings, "damage part", p.scaling)).filter(Boolean);
}

function defaultImage(type, item) {
  const map = { weapon: "icons/svg/sword.svg", equipment: "icons/svg/shield.svg", consumable: "icons/svg/item-bag.svg", spell: "icons/svg/book.svg", feat: "icons/svg/upgrade.svg", loot: "icons/svg/chest.svg", tool: "icons/svg/hammer.svg", container: "icons/svg/chest.svg", class: "icons/svg/book.svg", subclass: "icons/svg/book.svg", race: "icons/svg/mystery-man.svg", background: "icons/svg/book.svg" };
  if ( item.featType?.value === "monster" ) return "systems/dnd5e/icons/svg/monster.svg";
  return map[type] ?? "icons/svg/item-bag.svg";
}

/** Items from Foundry exports: validate the raw system data lightly and pass it through. */
function buildFromRaw(item, data, context, warnings) {
  const raw = item.rawDocument;
  data.system = raw.system ?? {};
  data.img = raw.img ?? data.img;
  data.effects = (raw.effects ?? []).map(e => { const c = { ...e }; delete c.ownership; return c; });
  // Validate every formula we can find in known locations.
  const check = (f, label) => { if ( f && typeof f === "string" && !validateFormula(f).valid ) { warnings.push(`${item.name}: ${label} formula "${f}" is invalid and was cleared`); return ""; } return f; };
  if ( data.system.uses ) data.system.uses.max = check(data.system.uses.max, "uses");
  for ( const act of Object.values(data.system.activities ?? {}) ) {
    for ( const part of act.damage?.parts ?? [] ) { if ( part.custom?.formula ) part.custom.formula = check(part.custom.formula, "damage"); if ( part.bonus ) part.bonus = check(part.bonus, "damage bonus"); }
    if ( act.attack?.bonus ) act.attack.bonus = check(act.attack.bonus, "attack bonus");
    if ( act.save?.dc?.formula ) act.save.dc.formula = check(act.save.dc.formula, "save DC");
  }
  data.flags = { [FLAG_SCOPE]: { [FLAGS.IMPORT]: { moduleVersion: MODULE_VERSION, irVersion: IR_VERSION, irId: item.id, fingerprint: item.fingerprint ?? null, format: "foundry-export", importedAt: null, ...(context.provenance ?? {}) }, [FLAGS.MECHANICS]: [] }, dnd5e: raw.flags?.dnd5e ?? {} };
  return { data, warnings, mechanics: [] };
}

export { BASE_WEAPONS };
