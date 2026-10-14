import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * Build the release zip: only the files Foundry needs. Output: dist/stat-block-importer.zip and
 * dist/module.json (manifest copy for the release asset).
 */
const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const dist = path.join(root, "dist");
const stage = path.join(dist, manifest.id);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
// When packaging a tagged release, point "download" at that release instead of releases/latest so an
// installed version keeps downloading the exact zip it was published with.
let manifestText = fs.readFileSync(path.join(root, "module.json"), "utf8");
if ( process.env.RELEASE_TAG ) manifestText = manifestText.replace(/("download":\s*"[^"]*?)\/releases\/latest\/download\//, `$1/releases/download/${process.env.RELEASE_TAG}/`);
const include = ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "lang", "styles", "templates", "scripts", "docs"];
for ( const entry of include ) {
  const src = path.join(root, entry);
  if ( !fs.existsSync(src) ) continue;
  fs.cpSync(src, path.join(stage, entry), { recursive: true });
}
fs.writeFileSync(path.join(stage, "module.json"), manifestText);
const zip = path.join(dist, `${manifest.id}.zip`);
execSync(`cd "${dist}" && zip -qr "${zip}" "${manifest.id}"`, { stdio: "inherit" });
fs.writeFileSync(path.join(dist, "module.json"), manifestText);
fs.rmSync(stage, { recursive: true, force: true });
const size = fs.statSync(zip).size;
console.log(`Packaged ${zip} (${(size / 1024).toFixed(1)} KiB)`);
