import { IR_VERSION, MECHANIC_CATEGORY, MECHANIC_SPEC_VERSION } from "../core/constants.js";
import {
  ABILITIES, ACTIVATION_TYPES, ACTIVITY_TYPES, AREA_TARGET_TYPES, CONDITIONS, DAMAGE_TYPES, HEALING_TYPES,
  INDIVIDUAL_TARGET_TYPES, ITEM_TYPES, LIMITED_USE_PERIODS, RECOVERY_TYPES, SPECIAL_TIME_PERIODS, TIME_UNITS
} from "../core/dnd5e-reference.js";
import { validateFormula } from "../rules/formula-validator.js";

/**
 * Intermediate representation (IR) used by every parser and consumed by the builders.
 *
 * The IR is a plain, JSON-serialisable structure. Factories below produce fully defaulted objects
 * and `validateEntry` enforces the schema. Confidence and provenance are first-class fields.
 */

export const IR_KINDS = Object.freeze({ ACTOR: "actor", ITEM: "item" });

let counter = 0;
/** Generate a stable-ish local id for IR objects (not a Foundry document id). */
export function irId(prefix="ir") {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/* -------------------------------------------- */
/*  Factories                                   */
/* -------------------------------------------- */

export function createSource({ format="text", reference=null, text="", title=null }={}) {
  return { format, reference, text, title };
}

export function createDescription(original="", html=null) {
  return { original: original ?? "", html: html ?? null };
}

export function createUses({ max=null, spent=0, recovery=[], autoDestroy=false }={}) {
  return { max: max === null || max === undefined ? null : String(max), spent, recovery: recovery.map(createRecovery), autoDestroy };
}

export function createRecovery({ period="lr", type="recoverAll", formula="" }={}) {
  return { period, type, formula };
}

export function createActivation({ type="action", value=null, condition="" }={}) {
  return { type, value, condition };
}

export function createDuration({ value="", units="inst", concentration=false, special="", expiry=null }={}) {
  return { value: value === null ? "" : String(value), units, concentration, special, expiry };
}

export function createRange({ value=null, long=null, units="self", reach=null, special="" }={}) {
  return { value, long, units, reach, special };
}

export function createTarget({ affects={}, template={} }={}) {
  return {
    affects: { count: affects.count ?? "", type: affects.type ?? "", choice: Boolean(affects.choice), special: affects.special ?? "" },
    template: { type: template.type ?? "", size: template.size ?? "", width: template.width ?? "", height: template.height ?? "", units: template.units ?? "ft", count: template.count ?? "" }
  };
}

export function createDamagePart({ formula="", number=null, denomination=null, bonus="", types=[], scaling=null, custom=false }={}) {
  return { formula, number, denomination, bonus, types: [...types], scaling: scaling ? { ...scaling } : null, custom };
}

export function createConsumption({ type="itemUses", target="", value="1", scaling=null }={}) {
  return { type, target, value: String(value), scaling };
}

export function createActivity(data={}) {
  return {
    id: data.id ?? irId("act"),
    type: data.type ?? "utility",
    name: data.name ?? "",
    activation: createActivation(data.activation ?? {}),
    duration: createDuration(data.duration ?? {}),
    range: createRange(data.range ?? {}),
    target: createTarget(data.target ?? {}),
    consumption: (data.consumption ?? []).map(createConsumption),
    attack: data.attack ? { type: data.attack.type ?? "melee", classification: data.attack.classification ?? "weapon", ability: data.attack.ability ?? "", bonus: data.attack.bonus ?? "", flat: Boolean(data.attack.flat), critical: data.attack.critical ?? null } : null,
    damage: (data.damage ?? []).map(createDamagePart),
    includeBase: data.includeBase ?? true,
    save: data.save ? { ability: [...(data.save.ability ?? [])], dc: { calculation: data.save.dc?.calculation ?? "", formula: data.save.dc?.formula ?? "" }, onSave: data.save.onSave ?? "half" } : null,
    healing: data.healing ? createDamagePart(data.healing) : null,
    roll: data.roll ?? null,
    spell: data.spell ?? null,
    summon: data.summon ?? null,
    effects: [...(data.effects ?? [])],
    uses: data.uses ? createUses(data.uses) : null,
    attackFlat: data.attackFlat ?? null,
    conditionOnFail: data.conditionOnFail ?? null,
    description: data.description ?? "",
    sourceText: data.sourceText ?? "",
    confidence: data.confidence ?? 1
  };
}

export function createEffect(data={}) {
  return {
    id: data.id ?? irId("eff"),
    name: data.name ?? "",
    img: data.img ?? null,
    statuses: [...(data.statuses ?? [])],
    changes: (data.changes ?? []).map(c => ({ key: c.key, value: c.value, type: c.type ?? "add", priority: c.priority ?? null })),
    duration: createDuration(data.duration ?? {}),
    transfer: Boolean(data.transfer),
    disabled: Boolean(data.disabled),
    description: data.description ?? "",
    magical: data.magical ?? false,
    onSave: data.onSave ?? false,
    sourceText: data.sourceText ?? "",
    confidence: data.confidence ?? 1
  };
}

/**
 * Mechanic specification: a structured, validated description of a behavior found in text.
 */
export function createMechanic(data={}) {
  return {
    id: data.id ?? irId("mech"),
    version: MECHANIC_SPEC_VERSION,
    kind: data.kind ?? "unknown",
    label: data.label ?? "",
    category: data.category ?? MECHANIC_CATEGORY.UNRESOLVED,
    confidence: data.confidence ?? 0,
    reviewRequired: data.reviewRequired ?? true,
    enabled: data.enabled ?? true,
    trigger: data.trigger ?? { event: null, condition: null },
    target: data.target ?? { scope: null, filter: null },
    effect: data.effect ?? {},
    resource: data.resource ?? null,
    duration: data.duration ?? null,
    implementation: data.implementation ?? { owner: null, method: null, requires: [], limitations: [] },
    assumptions: [...(data.assumptions ?? [])],
    sourceText: data.sourceText ?? "",
    notes: [...(data.notes ?? [])]
  };
}

export function createItem(data={}) {
  return {
    kind: IR_KINDS.ITEM,
    irVersion: IR_VERSION,
    id: data.id ?? irId("item"),
    itemType: data.itemType ?? "loot",
    name: data.name ?? "Unnamed Item",
    img: data.img ?? null,
    source: createSource(data.source ?? {}),
    description: createDescription(data.description?.original ?? data.description ?? "", data.description?.html ?? null),
    identifier: data.identifier ?? null,
    properties: [...new Set(data.properties ?? [])],
    rarity: data.rarity ?? "",
    attunement: data.attunement ?? "",
    attunementNote: data.attunementNote ?? "",
    price: data.price ?? null,
    weight: data.weight ?? null,
    quantity: data.quantity ?? 1,
    equipped: data.equipped ?? null,
    uses: data.uses ? createUses(data.uses) : null,
    activation: data.activation ? createActivation(data.activation) : null,
    weapon: data.weapon ?? null,
    armor: data.armor ?? null,
    equipmentType: data.equipmentType ?? null,
    consumableType: data.consumableType ?? null,
    featType: data.featType ?? null,
    lootType: data.lootType ?? null,
    toolType: data.toolType ?? null,
    containerType: data.containerType ?? null,
    spell: data.spell ?? null,
    classData: data.classData ?? null,
    subclassData: data.subclassData ?? null,
    raceData: data.raceData ?? null,
    activities: (data.activities ?? []).map(createActivity),
    effects: (data.effects ?? []).map(createEffect),
    mechanics: (data.mechanics ?? []).map(createMechanic),
    contents: (data.contents ?? []).map(createItem),
    requirements: data.requirements ?? "",
    confidence: data.confidence ?? 1,
    warnings: [...(data.warnings ?? [])],
    fingerprint: data.fingerprint ?? null
  };
}

export function createActor(data={}) {
  return {
    kind: IR_KINDS.ACTOR,
    irVersion: IR_VERSION,
    id: data.id ?? irId("actor"),
    actorType: data.actorType ?? "npc",
    name: data.name ?? "Unnamed Creature",
    img: data.img ?? null,
    source: createSource(data.source ?? {}),
    description: createDescription(data.description?.original ?? data.description ?? "", data.description?.html ?? null),
    size: data.size ?? "med",
    creatureType: { value: data.creatureType?.value ?? "", subtype: data.creatureType?.subtype ?? "", swarm: data.creatureType?.swarm ?? "", custom: data.creatureType?.custom ?? "" },
    alignment: data.alignment ?? "",
    ac: { value: data.ac?.value ?? null, calc: data.ac?.calc ?? "", formula: data.ac?.formula ?? "", description: data.ac?.description ?? "" },
    hp: { value: data.hp?.value ?? null, max: data.hp?.max ?? null, formula: data.hp?.formula ?? "", temp: data.hp?.temp ?? 0 },
    hitDice: data.hitDice ?? null,
    movement: { ...(data.movement ?? {}) },
    abilities: Object.fromEntries(Object.keys(ABILITIES).map(k => [k, { value: data.abilities?.[k]?.value ?? 10, proficient: data.abilities?.[k]?.proficient ?? 0, saveBonus: data.abilities?.[k]?.saveBonus ?? null }])),
    skills: { ...(data.skills ?? {}) },
    senses: { ...(data.senses ?? {}) },
    languages: { value: [...(data.languages?.value ?? [])], custom: data.languages?.custom ?? "" },
    traits: {
      di: [...(data.traits?.di ?? [])], dr: [...(data.traits?.dr ?? [])], dv: [...(data.traits?.dv ?? [])], ci: [...(data.traits?.ci ?? [])],
      diCustom: data.traits?.diCustom ?? "", drCustom: data.traits?.drCustom ?? "", dvCustom: data.traits?.dvCustom ?? "", ciCustom: data.traits?.ciCustom ?? "",
      diBypasses: [...(data.traits?.diBypasses ?? [])], drBypasses: [...(data.traits?.drBypasses ?? [])], dvBypasses: [...(data.traits?.dvBypasses ?? [])]
    },
    cr: data.cr ?? null,
    proficiencyBonus: data.proficiencyBonus ?? null,
    xp: data.xp ?? null,
    initiative: data.initiative ?? null,
    legendary: { actions: data.legendary?.actions ?? 0, resistances: data.legendary?.resistances ?? 0, description: data.legendary?.description ?? "" },
    lair: { value: Boolean(data.lair?.value), initiative: data.lair?.initiative ?? null, description: data.lair?.description ?? "" },
    spellcasting: data.spellcasting ?? null,
    character: data.character ?? null,
    currency: { ...(data.currency ?? {}) },
    items: (data.items ?? []).map(createItem),
    token: data.token ?? null,
    biography: data.biography ?? "",
    confidence: data.confidence ?? 1,
    warnings: [...(data.warnings ?? [])],
    fingerprint: data.fingerprint ?? null
  };
}

/* -------------------------------------------- */
/*  Validation                                  */
/* -------------------------------------------- */

const ABILITY_KEYS = new Set(Object.keys(ABILITIES));

/**
 * Validate an IR entry (actor or item). Returns a list of problems; empty means valid.
 * @param {object} entry
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateEntry(entry) {
  const errors = [];
  const warnings = [];
  if ( !entry || typeof entry !== "object" ) return { errors: ["Entry is not an object"], warnings };
  if ( entry.kind === IR_KINDS.ITEM ) validateItem(entry, errors, warnings, "");
  else if ( entry.kind === IR_KINDS.ACTOR ) validateActor(entry, errors, warnings);
  else errors.push(`Unknown entry kind "${entry.kind}"`);
  return { errors, warnings };
}

function validateActor(a, errors, warnings) {
  if ( !a.name || typeof a.name !== "string" ) errors.push("Actor name is required");
  if ( !["npc", "character"].includes(a.actorType) ) errors.push(`Unsupported actor type "${a.actorType}"`);
  for ( const [k, v] of Object.entries(a.abilities ?? {}) ) {
    if ( !ABILITY_KEYS.has(k) ) { errors.push(`Unknown ability "${k}"`); continue; }
    if ( !Number.isInteger(v.value) || v.value < 0 || v.value > 50 ) errors.push(`Ability ${k} has invalid score ${v.value}`);
  }
  if ( a.hp?.formula ) {
    const v = validateFormula(a.hp.formula);
    if ( !v.valid ) errors.push(`HP formula invalid: ${v.errors.join("; ")}`);
  }
  if ( a.ac?.value !== null && a.ac?.value !== undefined && (!Number.isInteger(a.ac.value) || a.ac.value < 0) ) errors.push("AC must be a non-negative integer");
  for ( const t of ["di", "dr", "dv"] ) {
    for ( const type of a.traits?.[t] ?? [] ) if ( !DAMAGE_TYPES.includes(type) ) errors.push(`Unknown damage type "${type}" in ${t}`);
  }
  for ( const c of a.traits?.ci ?? [] ) if ( !CONDITIONS.includes(c) ) errors.push(`Unknown condition "${c}" in ci`);
  (a.items ?? []).forEach((item, i) => validateItem(item, errors, warnings, `items[${i}] `));
  if ( a.actorType === "character" && !a.character?.classes?.length ) warnings.push("Character has no class information");
}

function validateItem(item, errors, warnings, prefix) {
  if ( !item.name || typeof item.name !== "string" ) errors.push(`${prefix}Item name is required`);
  if ( !ITEM_TYPES.includes(item.itemType) ) errors.push(`${prefix}Unsupported item type "${item.itemType}"`);
  if ( item.uses ) {
    if ( item.uses.max !== null && item.uses.max !== "" ) {
      const v = validateFormula(item.uses.max, { deterministic: true });
      if ( !v.valid ) errors.push(`${prefix}Uses max invalid: ${v.errors.join("; ")}`);
    }
    for ( const r of item.uses.recovery ?? [] ) {
      if ( !LIMITED_USE_PERIODS.includes(r.period) && r.period !== "recharge" ) errors.push(`${prefix}Unknown recovery period "${r.period}"`);
      if ( !RECOVERY_TYPES.includes(r.type) ) errors.push(`${prefix}Unknown recovery type "${r.type}"`);
      if ( r.type === "formula" && !validateFormula(r.formula, { allowEmpty: false }).valid ) errors.push(`${prefix}Recovery formula "${r.formula}" is invalid`);
    }
  }
  if ( item.weapon?.damage?.formula && !validateFormula(item.weapon.damage.formula).valid ) errors.push(`${prefix}Weapon damage formula "${item.weapon.damage.formula}" is invalid`);
  (item.activities ?? []).forEach((act, i) => validateActivity(act, errors, warnings, `${prefix}activities[${i}] `));
  (item.effects ?? []).forEach((eff, i) => validateEffect(eff, errors, warnings, `${prefix}effects[${i}] `));
  (item.contents ?? []).forEach((c, i) => validateItem(c, errors, warnings, `${prefix}contents[${i}] `));
}

function validateActivity(act, errors, warnings, prefix) {
  if ( !ACTIVITY_TYPES.includes(act.type) ) errors.push(`${prefix}Unknown activity type "${act.type}"`);
  if ( act.activation?.type && !ACTIVATION_TYPES.includes(act.activation.type) ) errors.push(`${prefix}Unknown activation type "${act.activation.type}"`);
  if ( act.duration?.units && !TIME_UNITS.includes(act.duration.units) && !SPECIAL_TIME_PERIODS.includes(act.duration.units) ) errors.push(`${prefix}Unknown duration unit "${act.duration.units}"`);
  if ( act.target?.affects?.type && !INDIVIDUAL_TARGET_TYPES.includes(act.target.affects.type) ) errors.push(`${prefix}Unknown target type "${act.target.affects.type}"`);
  if ( act.target?.template?.type && !AREA_TARGET_TYPES.includes(act.target.template.type) ) errors.push(`${prefix}Unknown template type "${act.target.template.type}"`);
  for ( const part of act.damage ?? [] ) {
    if ( part.formula && !validateFormula(part.formula).valid ) errors.push(`${prefix}damage formula "${part.formula}" is invalid`);
    for ( const t of part.types ?? [] ) if ( !DAMAGE_TYPES.includes(t) && !HEALING_TYPES.includes(t) ) errors.push(`${prefix}unknown damage type "${t}"`);
  }
  if ( act.save ) {
    for ( const ab of act.save.ability ?? [] ) if ( !ABILITY_KEYS.has(ab) ) errors.push(`${prefix}unknown save ability "${ab}"`);
    if ( act.save.dc?.formula && !validateFormula(act.save.dc.formula, { deterministic: true }).valid ) errors.push(`${prefix}save DC formula invalid`);
    if ( !act.save.ability?.length ) errors.push(`${prefix}save activity has no ability`);
  }
  if ( act.attack?.bonus && !validateFormula(act.attack.bonus).valid ) errors.push(`${prefix}attack bonus formula invalid`);
  if ( act.healing?.formula && !validateFormula(act.healing.formula).valid ) errors.push(`${prefix}healing formula invalid`);
}

function validateEffect(eff, errors, warnings, prefix) {
  for ( const s of eff.statuses ?? [] ) if ( !CONDITIONS.includes(s) ) warnings.push(`${prefix}status "${s}" is not a dnd5e condition`);
  for ( const c of eff.changes ?? [] ) {
    if ( !c.key || typeof c.key !== "string" ) errors.push(`${prefix}change without key`);
    if ( /__proto__|constructor|prototype/.test(c.key ?? "") ) errors.push(`${prefix}unsafe change key "${c.key}"`);
  }
  if ( eff.duration?.units && !TIME_UNITS.includes(eff.duration.units) && !SPECIAL_TIME_PERIODS.includes(eff.duration.units) ) errors.push(`${prefix}unknown duration unit "${eff.duration.units}"`);
}

/**
 * A bundle is the unit of an import: several entries from one source.
 */
export function createBundle({ format="text", reference=null, text="", entries=[], diagnostics=[] }={}) {
  return { id: irId("bundle"), irVersion: IR_VERSION, source: createSource({ format, reference, text }), entries, diagnostics };
}
