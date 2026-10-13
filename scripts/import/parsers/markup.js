/**
 * Markdown, HTML and CSV pre-processing. All functions are pure and conservative: HTML is reduced to a
 * small allow-list of tags with no attributes, scripts/styles/objects are removed, and Markdown is
 * reduced to plain lines that the text parsers understand.
 */

const BLOCK_TAGS = ["p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "blockquote", "hr", "table", "ul", "ol", "dt", "dd"];
const ALLOWED_TAGS = new Set(["p", "br", "em", "strong", "b", "i", "u", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tr", "td", "th", "blockquote", "hr", "span", "div", "section"]);

/**
 * Sanitize HTML into a safe subset: no attributes, no scripts, no unknown tags.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHTML(html) {
  let s = String(html ?? "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style|iframe|object|embed|svg|math|template|noscript|form|input|button|textarea|select|link|meta|base)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<(script|style|iframe|object|embed|svg|math|template|noscript|form|input|button|textarea|select|link|meta|base)\b[^>]*\/?>/gi, "");
  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag) => {
    const t = tag.toLowerCase();
    if ( !ALLOWED_TAGS.has(t) ) return "";
    const closing = match.startsWith("</");
    if ( t === "br" || t === "hr" ) return `<${t}>`;
    return closing ? `</${t}>` : `<${t}>`;
  });
  s = s.replace(/javascript:/gi, "");
  return s.trim();
}

/** Decode a few common HTML entities. */
export function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
}

/**
 * Convert HTML to plain text with line breaks at block boundaries.
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  let s = sanitizeHTML(html);
  s = s.replace(/<(td|th)>/gi, " | ");
  s = s.replace(new RegExp(`</?(${BLOCK_TAGS.join("|")})>`, "gi"), "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s.split("\n").map(l => l.replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "").replace(/\s+/g, " ").trim()).filter(l => l.length).join("\n");
}

/** Does the text contain HTML markup? */
export function looksLikeHTML(text) {
  return /<\/?(p|div|br|table|tr|td|h[1-6]|ul|li|strong|em|span|html|body)\b[^>]*>/i.test(String(text ?? ""));
}

/** Does the text look like Markdown? */
export function looksLikeMarkdown(text) {
  const t = String(text ?? "");
  let hits = 0;
  if ( /^#{1,6}\s+\S/m.test(t) ) hits++;
  if ( /\*\*[^*\n]+\*\*/.test(t) ) hits++;
  if ( /^\s*[-*]\s+\S/m.test(t) ) hits++;
  if ( /^\|.*\|\s*$/m.test(t) ) hits++;
  if ( /^>\s+\S/m.test(t) ) hits++;
  if ( /^___\s*$|^\*\*\*\s*$/m.test(t) ) hits++;
  return hits >= 1;
}

/**
 * Reduce Markdown to plain text lines. Handles headings, emphasis, lists, block quotes, tables
 * (cells joined with " | " for the first table of a stat block header or flattened into
 * "Key value" lines), and the homebrewery "___" stat block wrappers.
 * @param {string} md
 * @returns {string}
 */
export function markdownToText(md) {
  const lines = String(md ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let inTable = [];
  const flushTable = () => {
    if ( !inTable.length ) return;
    const rows = inTable.map(r => r.split("|").map(c => c.trim()).filter((c, i, arr) => !(i === 0 && c === "") && !(i === arr.length - 1 && c === "")));
    const header = rows[0];
    const body = rows.slice(1).filter(r => !r.every(c => /^:?-+:?$/.test(c)));
    const isAbilityTable = header.map(h => h.toUpperCase()).join(" ").includes("STR") && header.map(h => h.toUpperCase()).join(" ").includes("CHA");
    if ( isAbilityTable ) {
      out.push(header.map(h => h.toUpperCase()).join(" "));
      for ( const row of body ) out.push(row.join(" "));
    } else if ( header.length === 2 ) {
      for ( const row of body ) out.push(row.join(" "));
    } else {
      out.push(header.join(" | "));
      for ( const row of body ) out.push(row.join(" | "));
    }
    inTable = [];
  };
  for ( let line of lines ) {
    if ( /^\s*(?:>\s*)?\|.*\|\s*$/.test(line) ) { inTable.push(line.replace(/^\s*>\s?/, "")); continue; }
    flushTable();
    line = line.replace(/^\s*>\s?/, "");
    if ( /^\s*(___+|\*\*\*+|---+)\s*$/.test(line) ) continue;
    line = line.replace(/^\s{0,3}#{1,6}\s+/, "");
    line = line.replace(/^\s*[-*+]\s+/, "");
    line = line.replace(/^\s*\d+\.\s+/, "");
    line = line.replace(/\*\*\*([^*]+)\*\*\*/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1");
    line = line.replace(/`([^`]+)`/g, "$1");
    line = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    line = line.replace(/<br\s*\/?>/gi, "");
    line = line.replace(/\\\s*$/, "");
    out.push(line.trimEnd());
  }
  flushTable();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Parse CSV text into an array of row objects keyed by header. Supports quoted fields and escaped
 * quotes. Limited to simple tabular collections (see docs/supported-formats.md).
 * @param {string} text
 * @returns {{headers: string[], rows: object[]}}
 */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = String(text ?? "").replace(/\r\n?/g, "\n");
  for ( let i = 0; i < s.length; i++ ) {
    const ch = s[i];
    if ( inQuotes ) {
      if ( ch === "\"" ) { if ( s[i + 1] === "\"" ) { field += "\""; i++; } else inQuotes = false; }
      else field += ch;
      continue;
    }
    if ( ch === "\"" ) inQuotes = true;
    else if ( ch === "," ) { row.push(field); field = ""; }
    else if ( ch === "\n" ) { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if ( field.length || row.length ) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c.trim().length));
  if ( !nonEmpty.length ) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map(h => h.trim().toLowerCase());
  const objects = nonEmpty.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows: objects };
}

/** Does the text look like CSV with a header row? */
export function looksLikeCSV(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter(l => l.trim());
  if ( lines.length < 2 ) return false;
  const counts = lines.slice(0, 5).map(l => (l.match(/,/g) ?? []).length);
  return counts[0] >= 1 && counts.every(c => c === counts[0]) && /name/i.test(lines[0]);
}
