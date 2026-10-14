import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

/** Build dist/gm-asset-library.zip and dist/gm-asset-library.module.json with only the files Foundry needs. */
const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const dist = path.join(root, "dist");
const stage = path.join(dist, manifest.id);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for ( const entry of ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "lang", "styles", "templates", "scripts", "docs"] ) {
  const src = path.join(root, entry);
  if ( fs.existsSync(src) ) fs.cpSync(src, path.join(stage, entry), { recursive: true });
}
const zip = path.join(dist, `${manifest.id}.zip`);
execSync(`cd "${dist}" && zip -qr "${zip}" "${manifest.id}"`, { stdio: "inherit" });
fs.copyFileSync(path.join(root, "module.json"), path.join(dist, `${manifest.id}.module.json`));
fs.rmSync(stage, { recursive: true, force: true });
console.log(`Packaged ${zip} (${(fs.statSync(zip).size / 1024).toFixed(1)} KiB)`);
