/**
 * Validate module.json: required fields, referenced files exist, compatibility and language entries are sane.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "module.json"), "utf8"));
const errors = [];

for ( const key of ["id", "title", "description", "version", "compatibility", "esmodules", "styles", "languages"] ) {
  if ( !(key in manifest) ) errors.push(`missing field: ${key}`);
}
if ( !/^[a-z0-9-]+$/.test(manifest.id ?? "") ) errors.push("id must be lowercase letters, digits and dashes");
if ( !/^\d+\.\d+\.\d+$/.test(manifest.version ?? "") ) errors.push("version must be semver");
if ( String(manifest.compatibility?.minimum ?? "") !== "14" ) errors.push("compatibility.minimum must be 14");
const system = manifest.relationships?.systems?.find(s => s.id === "dnd5e");
if ( !system ) errors.push("relationships.systems must declare dnd5e");

for ( const list of ["esmodules", "styles"] ) {
  for ( const file of manifest[list] ?? [] ) if ( !existsSync(resolve(root, file)) ) errors.push(`${list}: ${file} not found`);
}
for ( const lang of manifest.languages ?? [] ) {
  if ( !existsSync(resolve(root, lang.path)) ) errors.push(`language file ${lang.path} not found`);
  else JSON.parse(readFileSync(resolve(root, lang.path), "utf8"));
}
if ( manifest.socket !== true ) errors.push("socket must be true (GM relay)");

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if ( pkg.version !== manifest.version ) errors.push(`package.json version ${pkg.version} != module.json ${manifest.version}`);

if ( errors.length ) {
  console.error("module.json validation failed:\n - " + errors.join("\n - "));
  process.exit(1);
}
console.log(`module.json OK (${manifest.id} v${manifest.version}, Foundry ${manifest.compatibility.minimum}+, dnd5e ${system.compatibility.minimum}+)`);
