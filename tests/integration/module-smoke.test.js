/**
 * Static integration smoke test: every script module imports under a Foundry mock (catching broken imports and
 * load-time errors in the UI layer), every template the module preloads exists, every localization key used in
 * templates and scripts exists in lang/en.json, and every data-action in a template has a handler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { installFoundryGlobals } from "../setup/foundry-mock.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const walk = (dir, ext, out=[]) => { for ( const f of readdirSync(dir) ) { const p = join(dir, f); if ( statSync(p).isDirectory() ) walk(p, ext, out); else if ( p.endsWith(ext) ) out.push(p); } return out; };

installFoundryGlobals();
class ApplicationV2 { static DEFAULT_OPTIONS = {}; static PARTS = {}; constructor(o={}) { this.options = o; } render() { return this; } close() {} get rendered() { return false; } }
globalThis.foundry.applications.api.ApplicationV2 = ApplicationV2;
globalThis.foundry.applications.api.HandlebarsApplicationMixin = Base => class extends Base {};
globalThis.foundry.applications.handlebars = { loadTemplates: async () => {}, renderTemplate: async () => "" };
globalThis.foundry.utils.mergeObject = (a, b) => ({ ...a, ...b });
globalThis.foundry.data = { fields: new Proxy({}, { get: () => class { constructor(o) { Object.assign(this, o); } } }) };
globalThis.CONFIG = { debug: {} };
globalThis.canvas = { ready: false, tokens: { controlled: [], placeables: [] } };

const scripts = walk(join(root, "scripts"), ".js").filter(f => !f.endsWith("sandbox-worker.js"));
const templates = walk(join(root, "templates"), ".hbs");
const lang = JSON.parse(readFileSync(join(root, "lang/en.json"), "utf8"));
const hasKey = key => key.split(".").reduce((o, k) => o?.[k], lang) !== undefined;

describe("module smoke", () => {
  it("imports every script module without load-time errors", async () => {
    const failures = [];
    for ( const f of scripts ) { try { await import(f); } catch(err) { failures.push(`${f.replace(root, "")}: ${err.message.split("\n")[0]}`); } }
    expect(failures, failures.join("\n")).toEqual([]);
    expect(scripts.length).toBeGreaterThan(40);
  });
  it("preloads only templates that exist", async () => {
    const { TEMPLATES } = await import(join(root, "scripts/applications/templates.js"));
    for ( const [key, path] of Object.entries(TEMPLATES) ) {
      const local = join(root, path.replace(/^modules\/gm-macro-academy\//, ""));
      expect(() => statSync(local), `${key} -> ${path}`).not.toThrow();
    }
  });
  it("uses only localization keys that exist", () => {
    const missing = new Set();
    for ( const f of templates ) for ( const m of readFileSync(f, "utf8").matchAll(/localize ["']([^"']+)["']/g) ) if ( !hasKey(m[1]) ) missing.add(`${f.replace(root, "")}: ${m[1]}`);
    for ( const f of scripts ) {
      const src = readFileSync(f, "utf8");
      for ( const m of src.matchAll(/\bt\("([A-Za-z0-9.]+)"/g) ) if ( !hasKey("GMMA." + m[1]) ) missing.add(`${f.replace(root, "")}: GMMA.${m[1]}`);
      for ( const m of src.matchAll(/(?:localize|format)\("(GMMA\.[A-Za-z0-9.]+)"/g) ) if ( !hasKey(m[1]) ) missing.add(`${f.replace(root, "")}: ${m[1]}`);
    }
    expect([...missing], [...missing].join("\n")).toEqual([]);
  });
  it("has a handler for every data-action in the templates", async () => {
    const { AcademyApplication } = await import(join(root, "scripts/applications/academy-app.js"));
    const { WorkshopApplication } = await import(join(root, "scripts/applications/workshop-app.js"));
    const { AcademyMenu } = await import(join(root, "scripts/applications/academy-menu.js"));
    const defined = new Set([AcademyApplication, WorkshopApplication, AcademyMenu].flatMap(C => Object.keys(C.DEFAULT_OPTIONS?.actions ?? {})));
    const used = new Set();
    for ( const f of templates ) for ( const m of readFileSync(f, "utf8").matchAll(/data-action="([^"]+)"/g) ) used.add(m[1]);
    const undefinedActions = [...used].filter(a => !defined.has(a));
    expect(undefinedActions, undefinedActions.join(", ")).toEqual([]);
    expect(used.size).toBeGreaterThan(20);
  });
  it("declares every manifest file reference", () => {
    const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
    for ( const p of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(l => l.path)] ) expect(() => statSync(join(root, p)), p).not.toThrow();
  });
});
