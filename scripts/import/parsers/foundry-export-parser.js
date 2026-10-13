import { createActor, createItem } from "../schema.js";
import { ACTOR_TYPES, ITEM_TYPES } from "../../core/dnd5e-reference.js";
import { sanitizeOwnership } from "../../core/permissions.js";

/**
 * Parser for Foundry VTT Actor / Item JSON exports (dnd5e). The raw document data is preserved on
 * the IR entry (`rawDocument`) after ownership/permission fields are stripped so the builder can
 * pass validated system data through instead of re-deriving it.
 */

export function isFoundryExport(data) {
  if ( !data || typeof data !== "object" ) return false;
  const candidates = Array.isArray(data) ? data : [data];
  return candidates.every(d => d && typeof d === "object" && typeof d.name === "string" && typeof d.type === "string" && typeof d.system === "object"
    && (ACTOR_TYPES.includes(d.type) || ITEM_TYPES.includes(d.type)));
}

/**
 * @param {object|object[]} data
 * @returns {{entries: object[], warnings: string[]}}
 */
export function parseFoundryExport(data) {
  const warnings = [];
  const docs = Array.isArray(data) ? data : [data];
  const entries = [];
  for ( const doc of docs ) {
    const clean = sanitizeOwnership(doc, null);
    if ( ACTOR_TYPES.includes(clean.type) ) {
      if ( !["npc", "character"].includes(clean.type) ) { warnings.push(`Actor type "${clean.type}" is not supported; skipped ${clean.name}`); continue; }
      const sys = clean.system ?? {};
      const actor = createActor({
        actorType: clean.type,
        name: clean.name,
        img: clean.img ?? null,
        source: { format: "foundry-export", text: "" },
        size: sys.traits?.size ?? "med",
        creatureType: sys.details?.type ?? {},
        alignment: sys.details?.alignment ?? "",
        ac: { value: sys.attributes?.ac?.flat ?? null, calc: sys.attributes?.ac?.calc ?? "" },
        hp: { value: sys.attributes?.hp?.value ?? null, max: sys.attributes?.hp?.max ?? null, formula: sys.attributes?.hp?.formula ?? "" },
        cr: sys.details?.cr ?? null,
        abilities: Object.fromEntries(Object.entries(sys.abilities ?? {}).map(([k, v]) => [k, { value: v.value ?? 10, proficient: v.proficient ?? 0 }])),
        items: (clean.items ?? []).map(itemEntry).filter(Boolean)
      });
      actor.items = (clean.items ?? []).map(itemEntry).filter(Boolean);
      actor.rawDocument = clean;
      entries.push(actor);
    } else if ( ITEM_TYPES.includes(clean.type) ) {
      const item = itemEntry(clean);
      if ( item ) entries.push(item);
    } else warnings.push(`Unknown document type "${clean.type}"`);
  }
  return { entries, warnings };
}

function itemEntry(doc) {
  if ( !doc || !ITEM_TYPES.includes(doc.type) ) return null;
  const clean = sanitizeOwnership(doc, null);
  const item = createItem({
    itemType: clean.type === "backpack" ? "container" : clean.type,
    name: clean.name,
    img: clean.img ?? null,
    source: { format: "foundry-export", text: "" },
    description: { original: stripTags(clean.system?.description?.value ?? ""), html: clean.system?.description?.value ?? null }
  });
  item.rawDocument = clean;
  return item;
}

function stripTags(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
