/**
 * Build a release archive: dist/gm-macro-academy.zip plus a copy of module.json for the release assets.
 * Only runtime files are included (no tests, tooling or node_modules).
 */
import { mkdirSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "module.json"), "utf8"));
const dist = resolve(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const include = ["module.json", "README.md", "CHANGELOG.md", "LICENSE", "COMPATIBILITY.md", "lang", "styles", "templates", "scripts", "curriculum", "examples", "docs"];
const zip = resolve(dist, `${manifest.id}.zip`);
execFileSync("zip", ["-r", "-q", zip, ...include, "-x", "*.test.js"], { cwd: root, stdio: "inherit" });
copyFileSync(resolve(root, "module.json"), resolve(dist, "module.json"));
console.log(`Packaged ${zip}`);
