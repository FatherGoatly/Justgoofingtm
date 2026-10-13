import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const problems = [];
for ( const key of ["id", "title", "version", "compatibility", "esmodules", "languages"] ) if ( !(key in manifest) ) problems.push(`Missing "${key}"`);
if ( !/^[a-z0-9-]+$/.test(manifest.id ?? "") ) problems.push("id must be lowercase letters, digits and dashes");
if ( !manifest.compatibility?.minimum ) problems.push("compatibility.minimum required");
for ( const f of [...(manifest.esmodules ?? []), ...(manifest.styles ?? []), ...(manifest.languages ?? []).map(l => l.path)] ) {
  if ( !fs.existsSync(path.join(root, f)) ) problems.push(`Referenced file missing: ${f}`);
}
for ( const lang of manifest.languages ?? [] ) {
  try { JSON.parse(fs.readFileSync(path.join(root, lang.path), "utf8")); } catch (err) { problems.push(`Invalid JSON in ${lang.path}: ${err.message}`); }
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if ( pkg.version !== manifest.version ) problems.push(`package.json version ${pkg.version} != module.json version ${manifest.version}`);
const constants = fs.readFileSync(path.join(root, "scripts/core/constants.js"), "utf8");
const cv = constants.match(/MODULE_VERSION = "([^"]+)"/)?.[1];
if ( cv !== manifest.version ) problems.push(`constants.js MODULE_VERSION ${cv} != module.json version ${manifest.version}`);
for ( const tpl of fs.readdirSync(path.join(root, "templates")) ) if ( !tpl.endsWith(".hbs") ) problems.push(`Unexpected file in templates: ${tpl}`);
if ( problems.length ) { console.error("Manifest validation failed:\n - " + problems.join("\n - ")); process.exit(1); }
console.log(`module.json OK (${manifest.id} v${manifest.version}, Foundry ${manifest.compatibility.minimum}–${manifest.compatibility.maximum}, dnd5e ${manifest.relationships.systems[0].compatibility.minimum}+)`);
