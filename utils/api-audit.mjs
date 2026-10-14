import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Foundry API drift audit for every module in this repository.
 *
 *   node utils/api-audit.mjs [--docs <url>] [--json <file>] [--body <md>]
 *
 * Inventories every Foundry API path the modules' scripts touch (`foundry.*` namespaces and the global
 * roots such as game, Hooks, ui, canvas, CONFIG, CONST and the document classes), resolves each one against
 * the public API documentation for the current stable Foundry release, and fails when a symbol no longer
 * exists or is marked deprecated. A deprecated symbol is removed in a later generation, so it is the
 * earliest warning available that an update will break the module. Documentation for an older generation
 * can be audited with e.g. --docs https://foundryvtt.com/api/v13/.
 *
 * Limits: this is a static scan. A member reached through an instance (game.settings.get → the `get`
 * on ClientSettings) is only checked one level deep, and a local variable that shadows a global root is
 * skipped only when it is declared in the same file.
 */

const root = path.resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const DOCS = (option("--docs") ?? "https://foundryvtt.com/api/").replace(/\/?$/, "/");

/** Module directories whose scripts/ folders are scanned. */
const MODULES = [".", "gm-asset-library"];

/** Global roots and where the documentation describes them. */
const GLOBALS = {
  game: "foundry.Game",
  Hooks: "foundry.helpers.Hooks",
  "ui.notifications": "foundry.applications.ui.Notifications",
  canvas: "foundry.canvas.Canvas",
  CONFIG: "CONFIG",
  CONST: "CONST",
  fromUuid: "foundry.utils.fromUuid",
  fromUuidSync: "foundry.utils.fromUuidSync",
  getDocumentClass: "foundry.utils.getDocumentClass",
  Roll: "foundry.dice.Roll",
  ...Object.fromEntries(["Actor", "Item", "Macro", "Folder", "ChatMessage", "ActiveEffect", "Scene", "JournalEntry", "Playlist", "RollTable", "Cards", "User"].map(d => [d, `foundry.documents.${d}`]))
};

/** Paths that belong to other packages and are not Foundry's to document. */
const IGNORE = [
  /^game\.dfreds\b/,          // DFreds Convenient Effects API
  /^CONFIG\.DND5E\b/          // dnd5e system configuration
];

const ROOTS = ["foundry", ...Object.keys(GLOBALS).map(k => k.split(".")[0])];
const USAGE = new RegExp(`(?<![\\w$.])(?:globalThis\\??\\.)?(${[...new Set(ROOTS)].join("|")})((?:\\?\\.|\\.)[A-Za-z_$][\\w$]*)*`, "g");

/* -------------------------------------------- */
/*  1. Inventory                                 */
/* -------------------------------------------- */

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[\s;{(,])\/\/[^\n]*/g, "$1");
}

function shadowed(src, name) {
  return new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b|\\b${name}\\s*=(?!=)`).test(src);
}

function inventory() {
  const uses = new Map();   // path → Set of "module:file"
  for ( const dir of MODULES ) {
    const base = path.join(root, dir, "scripts");
    const walk = d => {
      for ( const e of fs.readdirSync(d, { withFileTypes: true }) ) {
        const p = path.join(d, e.name);
        if ( e.isDirectory() ) walk(p);
        else if ( e.name.endsWith(".js") ) scan(p);
      }
    };
    const scan = file => {
      const src = stripComments(fs.readFileSync(file, "utf8"));
      const rel = path.relative(root, file);
      for ( const m of src.matchAll(USAGE) ) {
        const rootName = m[1];
        if ( rootName !== "foundry" && shadowed(src, rootName) ) continue;
        const p = m[0].replace(/^globalThis\??\./, "").replace(/\?\./g, ".");
        if ( !p.includes(".") && !(rootName in GLOBALS) ) continue;   // bare `foundry`
        if ( IGNORE.some(re => re.test(p)) ) continue;
        if ( !uses.has(p) ) uses.set(p, new Set());
        uses.get(p).add(rel);
      }
    };
    walk(base);
  }
  return uses;
}

/* -------------------------------------------- */
/*  2. Resolve against the documentation index   */
/* -------------------------------------------- */

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "justgoofingtm-api-audit" } });
  if ( !res.ok ) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** TypeDoc search index: every documented symbol with its page url. */
async function loadIndex() {
  const js = await fetchText(`${DOCS}assets/search.js`);
  const b64 = js.match(/window\.searchData\s*=\s*"([^"]+)"/)?.[1];
  if ( !b64 ) throw new Error("Unrecognised search index format; has the documentation site changed?");
  const { rows } = JSON.parse(zlib.inflateSync(Buffer.from(b64, "base64")).toString("utf8"));
  const index = new Map();
  for ( const r of rows ) {
    const full = r.parent ? `${r.parent}.${r.name}` : r.name;
    if ( !index.has(full) ) index.set(full, r);
  }
  return index;
}

/** Translate a global usage such as `game.settings.get` into its documented path. */
function canonical(p) {
  if ( p.startsWith("foundry.") ) return p;
  const key = Object.keys(GLOBALS).filter(k => p === k || p.startsWith(`${k}.`)).sort((a, b) => b.length - a.length)[0];
  return key ? GLOBALS[key] + p.slice(key.length) : p;
}

const CONTAINER_KINDS = new Set([2, 4]);   // project/module, namespace: every member is indexed
const CLASS_KIND = 128;                     // class: static and instance members are indexed

/**
 * Find the longest documented prefix of a path. A member missing from a namespace or a class is a
 * finding; a member reached through a property or accessor (game.settings.get → ClientSettings#get)
 * lives on that property's type and is left unchecked rather than guessed.
 */
function resolve(p, index) {
  const segments = canonical(p).split(".");
  for ( let n = segments.length; n > 0; n-- ) {
    const prefix = segments.slice(0, n).join(".");
    const row = index.get(prefix);
    if ( !row ) continue;
    const rest = segments.slice(n);
    if ( rest.length === 0 ) return { status: "documented", symbol: prefix, row };
    if ( CONTAINER_KINDS.has(row.kind) ) return { status: "missing", symbol: `${prefix}.${rest[0]}`, row: null };
    if ( row.kind === CLASS_KIND && rest.length === 1 ) return { status: "undocumented-member", symbol: prefix, member: rest[0], row };
    return { status: "documented", symbol: prefix, row, unchecked: rest.join(".") };
  }
  return { status: "missing", symbol: canonical(p), row: null };
}

/* -------------------------------------------- */
/*  3. Deprecation markers on the pages          */
/* -------------------------------------------- */

async function deprecations(results) {
  const pages = new Map();
  for ( const r of results ) if ( r.row ) {
    const [page] = r.row.url.split("#");
    if ( !pages.has(page) ) pages.set(page, null);
  }
  const urls = [...pages.keys()];
  let next = 0;
  const worker = async () => {
    while ( next < urls.length ) {
      const url = urls[next++];
      pages.set(url, await fetchText(DOCS + url));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
  for ( const r of results ) {
    if ( !r.row ) continue;
    const [page, anchor] = r.row.url.split("#");
    const html = pages.get(page);
    if ( /<h1[^>]*class="[^"]*\bdeprecated\b/.test(html) ) r.deprecated = `page ${page}`;
    else if ( anchor && new RegExp(`href="#${anchor}" class="[^"]*\\bdeprecated\\b`).test(html) ) r.deprecated = `member #${anchor}`;
  }
}

/* -------------------------------------------- */
/*  4. Report                                   */
/* -------------------------------------------- */

async function main() {
  const uses = inventory();
  console.log(`Scanning ${MODULES.length} modules: ${uses.size} distinct Foundry API paths.`);
  const index = await loadIndex();
  console.log(`Documentation index loaded from ${DOCS} (${index.size} symbols).`);
  const results = [...uses.entries()].map(([p, files]) => ({ path: p, files: [...files].sort(), ...resolve(p, index) }));
  await deprecations(results);

  const errors = results.filter(r => r.status === "missing" || r.deprecated);
  const warnings = results.filter(r => r.status === "undocumented-member");
  const ok = results.filter(r => !errors.includes(r) && !warnings.includes(r));

  for ( const r of errors ) console.log(`ERROR    ${r.path} → ${r.deprecated ? `deprecated (${r.deprecated})` : `${r.symbol} is not documented`}  [${r.files.join(", ")}]`);
  for ( const r of warnings ) console.log(`warning  ${r.path} → ${r.symbol} is documented but member "${r.member}" is not  [${r.files.join(", ")}]`);
  console.log(`${ok.length} paths resolve to documented, non-deprecated symbols; ${warnings.length} undocumented members; ${errors.length} errors.`);

  const report = { docs: DOCS, checked: results.length, errors: errors.map(strip), warnings: warnings.map(strip), ok: ok.map(strip) };
  if ( option("--json") ) fs.writeFileSync(option("--json"), JSON.stringify(report, null, 2));
  if ( option("--body") ) fs.writeFileSync(option("--body"), markdown(report));
  if ( process.env.GITHUB_STEP_SUMMARY ) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(report));
  if ( errors.length ) process.exit(1);
}

const strip = r => ({ path: r.path, symbol: r.symbol, member: r.member, unchecked: r.unchecked, deprecated: r.deprecated, url: r.row ? DOCS + r.row.url : null, files: r.files });

function markdown(report) {
  const row = r => `| \`${r.path}\` | ${r.url ? `[${r.symbol}](${r.url})` : r.symbol} | ${r.deprecated ? `deprecated (${r.deprecated})` : r.member ? `member \`${r.member}\` undocumented` : "missing"} | ${r.files.map(f => `\`${f}\``).join(", ")} |`;
  const lines = [`## Foundry API audit against ${report.docs}`, "", `${report.checked} API paths checked: ${report.ok.length} documented, ${report.warnings.length} undocumented members, **${report.errors.length} errors**.`, ""];
  if ( report.errors.length ) lines.push("### Errors — these will break on a Foundry update", "", "| Used as | Symbol | Problem | Files |", "| --- | --- | --- | --- |", ...report.errors.map(row), "");
  if ( report.warnings.length ) lines.push("### Undocumented members (verify by hand)", "", "| Used as | Symbol | Problem | Files |", "| --- | --- | --- | --- |", ...report.warnings.map(row), "");
  return lines.join("\n");
}

main().catch(err => { console.error(err.message); process.exit(1); });
