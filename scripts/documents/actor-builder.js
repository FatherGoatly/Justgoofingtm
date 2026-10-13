import { FLAG_SCOPE, FLAGS, MODULE_VERSION, IR_VERSION } from "../core/constants.js";
import {
  ABILITIES, ACTOR_SIZES, ALIGNMENTS, CLASSES, CONDITIONS, CREATURE_TYPES, DAMAGE_TYPES, SKILLS, CR_TABLE,
  proficiencyForLevel, TOOL_NAME_ALIASES
} from "../core/dnd5e-reference.js";
import { validateFormula } from "../rules/formula-validator.js";
import { createActivity, createItem } from "../import/schema.js";
import { paragraphsToHTML, slugify } from "../import/text-utils.js";
import { buildItem } from "./item-builder.js";

/**
 * Build dnd5e 6.0.6 Actor document data (npc or character) from an Actor IR, including embedded
 * Items. Asynchronous because spell / item names may be resolved against compendia through the
 * optional resolver callbacks.
 *
 * @param {object} actor                     Actor IR
 * @param {object} [options]
 * @param {object} [options.provenance]
 * @param {function} [options.resolveSpell]  async (name) → { uuid, level, data? } | null
 * @param {function} [options.resolveItem]   async (name, hint) → item document data | null
 * @returns {Promise<{data: object, warnings: string[], mechanics: object[], placeholders: object[]}>}
 */
export async function buildActor(actor, options={}) {
  const warnings = [...(actor.warnings ?? [])];
  const mechanics = [];
  const placeholders = [];
  if ( actor.rawDocument ) return buildFromRaw(actor, options, warnings);
  const isNPC = actor.actorType !== "character";
  const data = {
    name: actor.name,
    type: isNPC ? "npc" : "character",
    img: actor.img ?? (isNPC ? "icons/svg/mystery-man.svg" : "icons/svg/mystery-man.svg"),
    system: {},
    items: [],
    effects: [],
    prototypeToken: buildToken(actor),
    flags: {}
  };
  const sys = data.system;
  const prof = actor.proficiencyBonus ?? (isNPC ? (CR_TABLE[actor.cr]?.prof ?? 2) : proficiencyForLevel(actor.character?.level ?? 1));
  const mods = Object.fromEntries(Object.keys(ABILITIES).map(k => [k, Math.floor(((actor.abilities?.[k]?.value ?? 10) - 10) / 2)]));

  // Abilities & saves
  sys.abilities = {};
  for ( const key of Object.keys(ABILITIES) ) {
    const ab = actor.abilities?.[key] ?? { value: 10, proficient: 0 };
    const entry = { value: Number(ab.value ?? 10), proficient: ab.proficient ? 1 : 0, max: null };
    if ( Number.isFinite(ab.saveBonus) ) {
      const expected = mods[key] + (entry.proficient ? prof : 0);
      const diff = ab.saveBonus - expected;
      if ( diff ) entry.save = { roll: { bonus: String(diff) } };
    }
    sys.abilities[key] = entry;
  }

  // Skills
  sys.skills = {};
  for ( const [key, def] of Object.entries(SKILLS) ) {
    const sk = actor.skills?.[key];
    if ( !sk ) continue;
    let value = Number.isFinite(sk.value) ? sk.value : 0;
    const entry = { ability: def.ability };
    if ( Number.isFinite(sk.bonus) ) {
      const mod = mods[def.ability];
      const delta = sk.bonus - mod;
      if ( delta === prof ) value = 1;
      else if ( delta === prof * 2 ) value = 2;
      else if ( delta === Math.floor(prof / 2) ) value = 0.5;
      else if ( delta === 0 ) value = 0;
      else { value = delta > prof ? 2 : delta > 0 ? 1 : 0; const rem = sk.bonus - mod - value * prof; if ( rem ) entry.roll = { bonus: String(rem) }; }
    }
    entry.value = value;
    sys.skills[key] = entry;
  }

  // Attributes
  sys.attributes = {
    hp: { value: actor.hp?.value ?? actor.hp?.max ?? null, max: actor.hp?.max ?? null, temp: actor.hp?.temp ?? 0, tempmax: 0 },
    ac: {},
    movement: { speeds: {}, units: null, hover: Boolean(actor.movement?.hover) },
    senses: { ranges: {}, units: null, special: actor.senses?.special ?? "" },
    init: { ability: "", roll: { bonus: "" } },
    spellcasting: actor.spellcasting?.ability ?? actor.character?.spellcastingAbility ?? "",
    exhaustion: 0
  };
  if ( isNPC ) {
    const formula = actor.hp?.formula ?? "";
    if ( formula && /d\d/.test(formula) ) sys.attributes.hp.formula = validateFormula(formula).valid ? validateFormula(formula).formula : "";
    else sys.attributes.hp.formula = "";
  }
  for ( const key of ["walk", "fly", "swim", "climb", "burrow"] ) {
    const v = actor.movement?.[key];
    if ( Number.isFinite(v) ) sys.attributes.movement.speeds[key] = String(v);
  }
  if ( actor.movement?.special ) sys.attributes.movement.special = actor.movement.special;
  for ( const key of ["darkvision", "blindsight", "tremorsense", "truesight"] ) {
    const v = actor.senses?.[key];
    if ( Number.isFinite(v) ) sys.attributes.senses.ranges[key] = v;
  }
  // AC
  if ( Number.isFinite(actor.ac?.value) ) {
    const calc = actor.ac.calc === "natural" ? "natural" : "flat";
    sys.attributes.ac = { flat: actor.ac.value, calc };
    if ( actor.ac.description && calc === "flat" ) warnings.push(`${actor.name}: AC ${actor.ac.value} (${actor.ac.description}) stored as a flat value; switch the calculation to "Default" after equipping armor items.`);
  } else sys.attributes.ac = { flat: null, calc: "default" };
  // Initiative
  if ( Number.isFinite(actor.initiative) ) {
    const diff = actor.initiative - mods.dex;
    if ( diff ) sys.attributes.init.roll.bonus = String(diff);
  }

  // Details & traits
  sys.details = {
    biography: { value: actor.biography ? paragraphsToHTML(actor.biography) : (actor.description?.html ?? paragraphsToHTML(actor.description?.original ?? "")), public: "" },
    alignment: actor.alignment ?? ""
  };
  sys.traits = {
    size: (actor.size in ACTOR_SIZES) ? actor.size : "med",
    di: damageTrait(actor.traits, "di"), dr: damageTrait(actor.traits, "dr"), dv: damageTrait(actor.traits, "dv"),
    ci: { value: (actor.traits?.ci ?? []).filter(c => CONDITIONS.includes(c)), custom: actor.traits?.ciCustom ?? "" },
    languages: { value: [...(actor.languages?.value ?? [])], custom: actor.languages?.custom ?? "" }
  };
  if ( actor.languages?.communication?.telepathy ) sys.traits.languages.communication = { telepathy: { value: actor.languages.communication.telepathy, units: "ft" } };
  sys.currency = Object.fromEntries(["pp", "gp", "ep", "sp", "cp"].map(k => [k, Number(actor.currency?.[k] ?? 0) || 0]));

  if ( isNPC ) await buildNPC(actor, sys, data, options, warnings, mechanics, placeholders, prof);
  else await buildCharacter(actor, sys, data, options, warnings, mechanics, placeholders, prof);

  data.flags[FLAG_SCOPE] = {
    [FLAGS.IMPORT]: { moduleVersion: MODULE_VERSION, irVersion: IR_VERSION, irId: actor.id, fingerprint: actor.fingerprint ?? null, format: actor.source?.format ?? null, importedAt: null, sourceText: actor.source?.text?.slice(0, 40000) ?? "", ...(options.provenance ?? {}) }
  };
  return { data, warnings, mechanics, placeholders };
}

function damageTrait(traits, key) {
  return { value: (traits?.[key] ?? []).filter(t => DAMAGE_TYPES.includes(t)), custom: traits?.[`${key}Custom`] ?? "", bypasses: [...(traits?.[`${key}Bypasses`] ?? [])] };
}

function buildToken(actor) {
  const sizeMap = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };
  const size = sizeMap[actor.size] ?? 1;
  const isNPC = actor.actorType !== "character";
  const token = {
    name: actor.name,
    displayName: isNPC ? 20 : 30,
    actorLink: !isNPC,
    width: size, height: size,
    disposition: isNPC ? (globalThis.CONST?.TOKEN_DISPOSITIONS?.HOSTILE ?? -1) : (globalThis.CONST?.TOKEN_DISPOSITIONS?.FRIENDLY ?? 1),
    displayBars: isNPC ? 20 : 40,
    bar1: { attribute: "attributes.hp" },
    texture: { src: actor.token?.img ?? actor.img ?? null }
  };
  if ( actor.token ) Object.assign(token, { ...actor.token, texture: { src: actor.token.img ?? token.texture.src } });
  if ( !token.texture.src ) delete token.texture;
  return token;
}

/* -------------------------------------------- */
/*  NPC                                         */
/* -------------------------------------------- */

async function buildNPC(actor, sys, data, options, warnings, mechanics, placeholders, prof) {
  sys.details.type = {
    value: CREATURE_TYPES.includes(actor.creatureType?.value) ? actor.creatureType.value : "",
    subtype: actor.creatureType?.subtype ?? "", swarm: actor.creatureType?.swarm ?? "", custom: actor.creatureType?.custom ?? ""
  };
  sys.details.cr = Number.isFinite(actor.cr) ? actor.cr : null;
  sys.resources = {
    legact: { max: actor.legendary?.actions ?? 0, spent: 0 },
    legres: { max: actor.legendary?.resistances ?? 0, spent: 0 },
    lair: { value: Boolean(actor.lair?.value), initiative: actor.lair?.initiative ?? null, inside: false }
  };
  sys.source = { custom: actor.source?.title ?? "" };
  if ( actor.spellcasting ) {
    sys.attributes.spell = { level: actor.spellcasting.level ?? 0 };
    sys.attributes.spellcasting = actor.spellcasting.ability ?? "";
    sys.spells = {};
    for ( const [lvl, slots] of Object.entries(actor.spellcasting.slots ?? {}) ) sys.spells[`spell${lvl}`] = { value: slots, override: slots };
    // Verify stated DC/attack against ability + proficiency; store differences as bonuses.
    const abilityMod = actor.spellcasting.ability ? Math.floor(((actor.abilities?.[actor.spellcasting.ability]?.value ?? 10) - 10) / 2) : 0;
    if ( Number.isFinite(actor.spellcasting.dc) ) {
      const diff = actor.spellcasting.dc - (8 + prof + abilityMod);
      if ( diff ) { sys.bonuses = { spell: { dc: String(diff) } }; warnings.push(`${actor.name}: stated spell save DC ${actor.spellcasting.dc} differs from the computed DC; a bonus of ${diff} was applied.`); }
    }
  }
  if ( actor.regionalEffects ) sys.details.biography.value += `<h3>Regional Effects</h3>${paragraphsToHTML(actor.regionalEffects)}`;
  if ( actor.lair?.description ) sys.details.biography.value += `<h3>Lair Actions</h3>${paragraphsToHTML(actor.lair.description)}`;

  const context = { actor, provenance: options.provenance };
  for ( const item of actor.items ?? [] ) {
    if ( item.spellcasting ) {
      const built = await buildSpellcastingFeature(item, actor, options, warnings, placeholders);
      data.items.push(...built);
      continue;
    }
    const result = buildItem(item, { ...context, __weaponDamage: null });
    // Apply the reconciled damage bonus adjustment (see item-builder reconcileAttack) to the weapon base damage.
    applyDamageReconciliation(item, result.data, actor, prof);
    warnings.push(...result.warnings);
    mechanics.push(...result.mechanics);
    data.items.push(result.data);
  }
}

/**
 * The item builder adjusts the attack bonus; here we adjust the weapon base damage bonus so that
 * "Hit: 13 (1d10 + 8)" rolls 1d10 + 8 given the chosen ability modifier.
 */
function applyDamageReconciliation(item, itemData, actor, prof) {
  if ( itemData.type !== "weapon" ) return;
  const attackAct = Object.values(itemData.system.activities ?? {}).find(a => a.type === "attack");
  if ( !attackAct ) return;
  const ability = attackAct.attack.ability;
  if ( !ability ) return;
  const mod = Math.floor(((actor.abilities?.[ability]?.value ?? 10) - 10) / 2);
  const base = itemData.system.damage.base;
  if ( !base || base.number === null ) return;
  const statedBonus = Number(base.bonus || 0);
  // base.bonus currently holds the full stated bonus (e.g. "+8"); the system adds the ability mod, so subtract it.
  const adjusted = statedBonus - mod;
  base.bonus = adjusted ? String(adjusted) : "";
  const versatile = itemData.system.damage.versatile;
  if ( versatile && versatile.number !== null ) {
    const vb = Number(versatile.bonus || 0) - mod;
    versatile.bonus = vb ? String(vb) : "";
  }
}

async function buildSpellcastingFeature(item, actor, options, warnings, placeholders) {
  const sc = item.spellcasting;
  const out = [];
  const feature = createItem({ ...item, activities: [], spellcasting: undefined });
  delete feature.spellcasting;
  const activities = [];
  const spellItems = [];
  for ( const spell of sc.spells ) {
    const resolved = options.resolveSpell ? await options.resolveSpell(spell.name) : null;
    const uses = spell.usesPerDay ? { max: String(spell.usesPerDay), spent: 0, recovery: [{ period: "day", type: "recoverAll", formula: "" }] } : null;
    if ( resolved?.uuid ) {
      activities.push(createActivity({
        type: "cast", name: spell.name, activation: { type: item.section === "legendary" ? "legendary" : "action", value: null },
        spell: { uuid: resolved.uuid, level: spell.castLevel ?? resolved.level ?? spell.level ?? null, properties: ["vocal", "somatic", "material"], spellbook: true, ability: sc.ability ?? "" },
        consumption: uses ? [{ type: "activityUses", value: "1" }] : [],
        uses,
        range: { units: "self" }
      }));
    } else {
      // Placeholder spell item on the actor; innate/at-will method with uses.
      const placeholder = createItem({
        itemType: "spell", name: spell.name, description: { original: `Imported from the stat block of ${actor.name}. This spell was not found in a compendium; replace it with the real spell.` },
        spell: { level: spell.level ?? spell.castLevel ?? 0, school: "", method: spell.method === "spell" ? "innate" : spell.method === "atwill" ? "atwill" : "innate", prepared: 1, range: { units: "self" }, duration: { units: "inst" } },
        uses, activities: [createActivity({ type: "utility", activation: { type: "action" }, consumption: uses ? [{ type: "itemUses", value: "1" }] : [], range: { units: "self" } })],
        properties: []
      });
      placeholder.placeholder = { lookup: spell.name, hint: "spell" };
      placeholder.confidence = 0.5;
      spellItems.push(placeholder);
      placeholders.push({ name: spell.name, hint: "spell", actor: actor.name });
      warnings.push(`${actor.name}: spell "${spell.name}" not found in a compendium; a placeholder spell was created.`);
    }
  }
  feature.activities = activities;
  feature.description.original = sc.description ?? item.description.original;
  const built = buildItem(feature, { actor, provenance: options.provenance });
  warnings.push(...built.warnings);
  out.push(built.data);
  for ( const s of spellItems ) {
    const b = buildItem(s, { actor, provenance: options.provenance });
    warnings.push(...b.warnings);
    out.push(b.data);
  }
  return out;
}

/* -------------------------------------------- */
/*  Character                                   */
/* -------------------------------------------- */

async function buildCharacter(actor, sys, data, options, warnings, mechanics, placeholders, prof) {
  const ch = actor.character ?? { classes: [] };
  sys.details.xp = { value: Number(ch.xp ?? 0) || 0 };
  sys.details.originalClass = "";
  sys.attributes.hp.max = actor.hp?.max ?? null;
  sys.attributes.hp.value = actor.hp?.value ?? actor.hp?.max ?? null;
  sys.attributes.attunement = { max: 3 };
  sys.attributes.inspiration = false;
  sys.traits.weaponProf = { value: [], custom: (ch.proficiencies?.weapons ?? []).join("; ") };
  sys.traits.armorProf = { value: [], custom: (ch.proficiencies?.armor ?? []).join("; ") };
  for ( const p of ch.proficiencies?.weapons ?? [] ) { if ( /simple weapons/.test(p) ) sys.traits.weaponProf.value.push("sim"); if ( /martial weapons/.test(p) ) sys.traits.weaponProf.value.push("mar"); }
  for ( const p of ch.proficiencies?.armor ?? [] ) { if ( /all armor|light armor/.test(p) ) sys.traits.armorProf.value.push("lgt"); if ( /all armor|medium armor/.test(p) ) sys.traits.armorProf.value.push("med"); if ( /all armor|heavy armor/.test(p) ) sys.traits.armorProf.value.push("hvy"); if ( /shield/.test(p) ) sys.traits.armorProf.value.push("shl"); }
  sys.tools = {};
  for ( const p of ch.proficiencies?.tools ?? [] ) { const key = TOOL_NAME_ALIASES[p] ?? Object.entries(TOOL_NAME_ALIASES).find(([alias]) => p.includes(alias))?.[1]; if ( key ) sys.tools[key] = { value: 1, ability: "int" }; }
  sys.resources = { primary: { value: null, max: null, sr: false, lr: false, label: "" }, secondary: { value: null, max: null, sr: false, lr: false, label: "" }, tertiary: { value: null, max: null, sr: false, lr: false, label: "" } };

  // Class / subclass / species / background items
  for ( const [i, cls] of (ch.classes ?? []).entries() ) {
    const classItem = createItem({ itemType: "class", name: cls.name, identifier: cls.identifier, classData: { levels: cls.levels, hitDie: cls.hitDie, identifier: cls.identifier, progression: cls.subclass ? "none" : cls.progression, spellcastingAbility: cls.subclass ? "" : cls.spellcastingAbility } });
    if ( !cls.subclass ) { classItem.classData.progression = cls.progression; classItem.classData.spellcastingAbility = cls.spellcastingAbility ?? ""; }
    else if ( CLASSES[cls.identifier]?.progression && CLASSES[cls.identifier].progression !== "none" ) { classItem.classData.progression = CLASSES[cls.identifier].progression; classItem.classData.spellcastingAbility = CLASSES[cls.identifier].ability ?? ""; }
    const built = buildItem(classItem, { provenance: options.provenance });
    data.items.push(built.data);
    if ( i === 0 ) sys.details.originalClass = cls.identifier;
    if ( cls.subclass ) {
      const subProgression = cls.progression !== (CLASSES[cls.identifier]?.progression ?? "none") ? cls.progression : "none";
      const sub = createItem({ itemType: "subclass", name: cls.subclass, identifier: slugify(cls.subclass), subclassData: { classIdentifier: cls.identifier, identifier: slugify(cls.subclass), progression: subProgression, spellcastingAbility: subProgression !== "none" ? cls.spellcastingAbility ?? "" : "" } });
      data.items.push(buildItem(sub, { provenance: options.provenance }).data);
    }
  }
  if ( ch.species ) data.items.push(buildItem(createItem({ itemType: "race", name: ch.species, raceData: { movement: { walk: actor.movement?.walk ?? 30 } } }), { provenance: options.provenance }).data);
  if ( ch.background ) data.items.push(buildItem(createItem({ itemType: "background", name: ch.background }), { provenance: options.provenance }).data);

  // Hit dice spent (not tracked) – class items carry hd denomination.
  for ( const item of actor.items ?? [] ) {
    if ( item.placeholder ) {
      const resolved = options.resolveItem ? await options.resolveItem(item.placeholder.lookup, item.placeholder.hint) : null;
      if ( resolved ) {
        const doc = { ...resolved };
        delete doc._id; delete doc.ownership; delete doc.folder; delete doc.sort;
        if ( item.quantity > 1 && doc.system?.quantity !== undefined ) doc.system = { ...doc.system, quantity: item.quantity };
        doc.flags = { ...(doc.flags ?? {}), [FLAG_SCOPE]: { [FLAGS.IMPORT]: { moduleVersion: MODULE_VERSION, resolvedFrom: resolved._stats?.compendiumSource ?? resolved.uuid ?? null, ...(options.provenance ?? {}) } } };
        data.items.push(doc);
        continue;
      }
      placeholders.push({ name: item.name, hint: item.placeholder.hint, actor: actor.name });
      warnings.push(`${actor.name}: "${item.name}" was not found in a compendium; a placeholder ${item.placeholder.hint} was created.`);
    }
    const result = buildItem(item, { provenance: options.provenance });
    warnings.push(...result.warnings);
    mechanics.push(...result.mechanics);
    data.items.push(result.data);
  }
}

/* -------------------------------------------- */

async function buildFromRaw(actor, options, warnings) {
  const raw = actor.rawDocument;
  const data = { name: raw.name, type: raw.type, img: raw.img, system: raw.system ?? {}, items: [], effects: (raw.effects ?? []).map(e => { const c = { ...e }; delete c.ownership; return c; }), prototypeToken: raw.prototypeToken ?? buildToken(actor), flags: {} };
  const mechanics = [];
  for ( const item of actor.items ?? [] ) {
    const result = buildItem(item, { actor, provenance: options.provenance });
    warnings.push(...result.warnings);
    mechanics.push(...result.mechanics);
    data.items.push(result.data);
  }
  if ( data.system.attributes?.hp?.formula && !validateFormula(data.system.attributes.hp.formula).valid ) { warnings.push(`${actor.name}: HP formula invalid and cleared`); data.system.attributes.hp.formula = ""; }
  data.flags[FLAG_SCOPE] = { [FLAGS.IMPORT]: { moduleVersion: MODULE_VERSION, irVersion: IR_VERSION, irId: actor.id, fingerprint: actor.fingerprint ?? null, format: "foundry-export", importedAt: null, ...(options.provenance ?? {}) } };
  data.flags.dnd5e = raw.flags?.dnd5e ?? {};
  return { data, warnings, mechanics, placeholders: [] };
}

export { ALIGNMENTS };
