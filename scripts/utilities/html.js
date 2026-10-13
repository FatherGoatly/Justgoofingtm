/**
 * HTML helpers with no Foundry dependency. Everything rendered from lesson data or learner text passes through
 * escapeHTML before it reaches the DOM. See docs/security.md.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Escape a value for safe insertion into element content or a quoted attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHTML(value) {
  if ( value === null || value === undefined ) return "";
  return String(value).replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

/**
 * Render a small, safe inline markup subset used by lesson prose:
 *   `code`      -> <code>
 *   **bold**    -> <strong>
 *   _italic_    -> <em>
 *   [[term]]    -> glossary link (data-term attribute, no href)
 *   [[term|label]]
 *   [[lesson:id|label]] -> lesson link
 * The text is HTML-escaped first, so the markup can never introduce raw HTML.
 * @param {string} text
 * @returns {string}
 */
export function renderInline(text) {
  let html = escapeHTML(text);
  html = html.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, (_m, pre, i) => `${pre}<em>${i}</em>`);
  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, label) => {
    target = target.trim();
    if ( target.startsWith("lesson:") ) {
      const id = target.slice(7).trim();
      return `<a class="academy-link lesson-link" data-action="openLesson" data-lesson-id="${escapeHTML(id)}">${label ?? id}</a>`;
    }
    const slug = slugify(target);
    return `<a class="academy-link glossary-link" data-action="openTerm" data-term="${escapeHTML(slug)}">${label ?? target}</a>`;
  });
  return html;
}

/**
 * Convert a term or title into a stable slug.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Build a line-numbered, escaped code block. Optional annotations attach notes to specific lines.
 * @param {string} code
 * @param {object} [options]
 * @param {string} [options.language="javascript"]
 * @param {Array<{line:number, note:string}>} [options.annotations]
 * @param {number[]} [options.highlight]  1-based line numbers to highlight
 * @returns {string}
 */
export function renderCodeBlock(code, { language="javascript", annotations=[], highlight=[] }={}) {
  const notes = new Map();
  for ( const a of annotations ) if ( Number.isInteger(a?.line) ) notes.set(a.line, a.note);
  const hl = new Set(highlight);
  const lines = String(code).replace(/\r\n/g, "\n").split("\n");
  const rows = lines.map((line, i) => {
    const n = i + 1;
    const classes = ["code-line"];
    if ( hl.has(n) ) classes.push("highlight");
    if ( notes.has(n) ) classes.push("annotated");
    let row = `<div class="${classes.join(" ")}"><span class="line-number" aria-hidden="true">${n}</span><span class="line-text">${highlightSyntax(line, language)}</span></div>`;
    if ( notes.has(n) ) row += `<div class="code-annotation" role="note"><span class="annotation-marker" aria-hidden="true">↳</span>${renderInline(notes.get(n))}</div>`;
    return row;
  });
  return `<div class="academy-code" data-language="${escapeHTML(language)}"><pre class="code-lines" tabindex="0">${rows.join("")}</pre></div>`;
}

const JS_KEYWORDS = new Set(["const","let","var","function","return","if","else","for","of","in","while","do","break","continue","new","class","extends","super","this","async","await","try","catch","finally","throw","switch","case","default","typeof","instanceof","import","export","from","null","undefined","true","false","static","get","set","delete","void","yield"]);

/**
 * Lightweight syntax highlighting for display (not editing). Input is escaped first; tokens are wrapped in spans.
 * Supports JavaScript-ish tokens; other languages fall back to escaped text.
 * @param {string} line
 * @param {string} language
 * @returns {string}
 */
export function highlightSyntax(line, language="javascript") {
  if ( language !== "javascript" && language !== "js" ) return escapeHTML(line);
  const out = [];
  let i = 0;
  const src = line;
  while ( i < src.length ) {
    const rest = src.slice(i);
    let m;
    if ( (m = rest.match(/^\/\/.*$/)) ) { out.push(`<span class="tok-comment">${escapeHTML(m[0])}</span>`); i += m[0].length; continue; }
    if ( (m = rest.match(/^\/\*.*?\*\//)) ) { out.push(`<span class="tok-comment">${escapeHTML(m[0])}</span>`); i += m[0].length; continue; }
    if ( (m = rest.match(/^(["'`])(?:\\.|(?!\1)[^\\\n])*\1?/)) ) { out.push(`<span class="tok-string">${escapeHTML(m[0])}</span>`); i += m[0].length; continue; }
    if ( (m = rest.match(/^\d+(?:\.\d+)?/)) ) { out.push(`<span class="tok-number">${m[0]}</span>`); i += m[0].length; continue; }
    if ( (m = rest.match(/^[A-Za-z_$][\w$]*/)) ) {
      const cls = JS_KEYWORDS.has(m[0]) ? "tok-keyword" : (rest.slice(m[0].length).startsWith("(") ? "tok-call" : "tok-ident");
      out.push(`<span class="${cls}">${escapeHTML(m[0])}</span>`); i += m[0].length; continue;
    }
    if ( (m = rest.match(/^[{}()[\];,.]/)) ) { out.push(`<span class="tok-punct">${escapeHTML(m[0])}</span>`); i += 1; continue; }
    if ( (m = rest.match(/^[=+\-*/%<>!&|?:^~]+/)) ) { out.push(`<span class="tok-op">${escapeHTML(m[0])}</span>`); i += m[0].length; continue; }
    out.push(escapeHTML(src[i])); i += 1;
  }
  return out.join("");
}
