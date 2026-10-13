import { createItem } from "../schema.js";
import { parseCSV } from "./markup.js";
import { parseItemBlock } from "./item-parser.js";

/**
 * CSV collections of simple items. Recognized headers (case-insensitive):
 * name, type, description, damage, damage type, cost/price, weight, properties, ac, rarity, quantity, attunement.
 * Each row is rendered into an item text block and parsed by the item parser so one code path handles
 * the field semantics.
 */
export function parseCSVItems(text) {
  const { headers, rows } = parseCSV(text);
  const warnings = [];
  if ( !headers.includes("name") ) return { entries: [], warnings: ["CSV must have a \"name\" column."] };
  const entries = [];
  for ( const [i, row] of rows.entries() ) {
    if ( !row.name ) { warnings.push(`Row ${i + 2} has no name; skipped.`); continue; }
    const type = (row.type ?? row.category ?? "").trim();
    const rarity = (row.rarity ?? "").trim();
    const attune = /yes|true|required/i.test(row.attunement ?? "") ? " (requires attunement)" : "";
    const typeLine = type ? `${type}${rarity ? `, ${rarity}` : ""}${attune}` : "";
    const details = [];
    if ( row.damage ) details.push(`${row.damage} ${row["damage type"] ?? row.damagetype ?? ""} damage`.trim());
    if ( row.ac ) details.push(`AC ${row.ac}`);
    if ( row.cost ?? row.price ) details.push(`${row.cost ?? row.price}`);
    if ( row.weight ) details.push(`${row.weight} lb.`);
    if ( row.properties ) details.push(row.properties);
    const body = [details.join(", "), row.description ?? ""].filter(Boolean).join("\n");
    const block = [row.name, typeLine, body].filter(Boolean).join("\n");
    try {
      const item = parseItemBlock(block);
      if ( row.quantity ) item.quantity = Math.max(1, parseInt(row.quantity, 10) || 1);
      item.source = { format: "csv", text: JSON.stringify(row), reference: `row ${i + 2}` };
      entries.push(item);
    } catch (err) {
      warnings.push(`Row ${i + 2}: ${err.message}`);
    }
  }
  if ( !entries.length ) warnings.push("No rows could be converted. See docs/supported-formats.md for the CSV layout.");
  return { entries, warnings, note: createItem ? undefined : undefined };
}
