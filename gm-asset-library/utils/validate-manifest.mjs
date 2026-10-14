import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const problems = [];
for ( const key of ["id", "title", "version", "compatibility", "esmodules", "languages", "styles"] ) if ( !(key in manifest) ) problems.push(`Missing "${key}"`);
if ( !/^[a-z0-9-]+$/.test(manifest.id ?? "") ) problems.push("id must be lowercase letters, digits and dashes");
if ( !manifest.compatibility?.minimum ) problems.push("compatibility.minimum required");
for ( const f of [...(manifest.esmodules ?? []), ...(manifest.styles ?? []), ...(manifest.languages ?? []).map(l => l.path)] ) {
  if ( !fs.existsSync(path.join(root, f)) ) problems.push(`Referenced file missing: ${f}`);
}
const lang = JSON.parse(fs.readFileSync(path.join(root, "lang/en.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if ( pkg.version !== manifest.version ) problems.push(`package.json version ${pkg.version} != module.json version ${manifest.version}`);
const constants = fs.readFileSync(path.join(root, "scripts/core/constants.js"), "utf8");
const cv = constants.match(/MODULE_VERSION = "([^"]+)"/)?.[1];
if ( cv !== manifest.version ) problems.push(`constants.js MODULE_VERSION ${cv} != module.json version ${manifest.version}`);
for ( const tpl of fs.readdirSync(path.join(root, "templates")) ) if ( !tpl.endsWith(".hbs") ) problems.push(`Unexpected file in templates: ${tpl}`);

// Every GMAL.* key referenced in scripts/templates must exist in lang/en.json (dynamic keys are checked by prefix).
const used = new Set();
const walk = dir => { for ( const e of fs.readdirSync(dir, { withFileTypes: true }) ) { const p = path.join(dir, e.name); if ( e.isDirectory() ) walk(p); else if ( /\.(js|hbs)$/.test(e.name) ) for ( const m of fs.readFileSync(p, "utf8").matchAll(/GMAL\.[A-Za-z0-9_.]+/g) ) used.add(m[0]); } };
walk(path.join(root, "scripts")); walk(path.join(root, "templates"));
const lookup = key => key.split(".").reduce((o, k) => (o != null ? o[k] : undefined), lang);
for ( const key of used ) {
  const clean = key.replace(/\.$/, "");
  if ( lookup(clean) === undefined ) problems.push(`Missing localization key: ${clean}`);
}
if ( problems.length ) { console.error("Manifest validation failed:\n - " + problems.join("\n - ")); process.exit(1); }
console.log(`module.json OK (${manifest.id} v${manifest.version}, Foundry ${manifest.compatibility.minimum}–${manifest.compatibility.maximum}); ${used.size} localization keys referenced, all present.`);
