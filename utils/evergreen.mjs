import fs from "node:fs";
import path from "node:path";

/**
 * Evergreen compatibility maintenance for every Foundry module in this repository.
 *
 *   node utils/evergreen.mjs --check
 *     Offline. Fails when a "verified" version pinned in module.json disagrees with any other place that
 *     repeats it (compatibility matrix, README), or when minimum / verified / maximum are inconsistent.
 *
 *   node utils/evergreen.mjs --update [--dry-run] [--summary <json>] [--body <md>] [--major-body <md>]
 *     Online. Looks up the newest *stable* Foundry build and the newest release of every related system,
 *     and bumps compatibility.verified (and every mirror of it) within each module's "maximum". A newer
 *     generation beyond "maximum" is never applied silently: it is reported so a human can review it.
 *     When GITHUB_OUTPUT is set the outputs changed, title, new_major and new_major_title are written.
 */

const root = path.resolve(new URL("..", import.meta.url).pathname);
const FOUNDRY_RELEASES = "https://foundryvtt.com/releases/";

/**
 * Every module in the repository and the files that repeat its verified versions.
 * `pattern` must capture (prefix)(version)(suffix); group 2 is replaced.
 */
const MODULES = [
  {
    dir: ".",
    mirrors: {
      core: [
        { file: "scripts/core/compatibility.js", pattern: /(id: "core",[^\n]*?verified: ")([^"]+)(")/ },
        { file: "README.md", pattern: /(Foundry VTT [\d.]+ or later \(verified )([\d.]+)(\))/ }
      ],
      dnd5e: [
        { file: "scripts/core/compatibility.js", pattern: /(id: "dnd5e",[^\n]*?verified: ")([^"]+)(")/ },
        { file: "README.md", pattern: /(dnd5e [\d.]+ or later \(verified against )([\d.]+)( sources\))/ }
      ]
    }
  },
  { dir: "gm-asset-library", mirrors: {} }
];

/* -------------------------------------------- */
/*  Helpers                                      */
/* -------------------------------------------- */

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const read = file => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, text) => fs.writeFileSync(path.join(root, file), text);

/** Compare dotted version strings numerically. Returns -1, 0 or 1. */
export function compareVersions(a, b) {
  const pa = String(a ?? "0").split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const pb = String(b ?? "0").split(/[.-]/).map(p => parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for ( let i = 0; i < n; i++ ) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if ( x !== y ) return x < y ? -1 : 1;
  }
  return 0;
}

const major = v => parseInt(String(v).split(".")[0], 10);

/** "build" for Foundry's generation.build numbers, otherwise "minor" or "patch" for semver-style versions. */
const bumpKind = (from, to) => {
  if ( String(to).split(".").length < 3 ) return "build";
  return String(to).split(".")[1] !== String(from).split(".")[1] ? "minor" : "patch";
};

/**
 * Replace the value of the first `"verified": "..."` found after `anchor` in a module.json text.
 * Editing the text (instead of JSON.stringify) keeps the hand-written formatting of the manifest.
 */
function setVerified(text, anchor, value) {
  const start = anchor ? text.search(anchor) : 0;
  if ( start < 0 ) throw new Error(`Anchor ${anchor} not found`);
  const re = /("verified":\s*")([^"]+)(")/g;
  re.lastIndex = start;
  const m = re.exec(text);
  if ( !m ) throw new Error(`No "verified" entry after ${anchor}`);
  return text.slice(0, m.index) + m[1] + value + m[3] + text.slice(m.index + m[0].length);
}

/** Describe one module: its manifest, its core compatibility and every related system with a manifest URL. */
function describe(mod) {
  const manifestPath = path.join(mod.dir, "module.json");
  const manifest = JSON.parse(read(manifestPath));
  const deps = [
    { id: "core", name: "Foundry VTT", anchor: /"compatibility"/, compatibility: manifest.compatibility }
  ];
  for ( const sys of manifest.relationships?.systems ?? [] ) {
    if ( !sys.manifest || !sys.compatibility ) continue;
    deps.push({ id: sys.id, name: sys.id, anchor: new RegExp(`"id":\\s*"${sys.id}"`), compatibility: sys.compatibility, manifestUrl: sys.manifest });
  }
  return { ...mod, id: manifest.id, title: manifest.title, manifestPath, manifest, deps };
}

/* -------------------------------------------- */
/*  --check                                      */
/* -------------------------------------------- */

function check() {
  const problems = [];
  for ( const mod of MODULES.map(describe) ) {
    for ( const dep of mod.deps ) {
      const { minimum, verified, maximum } = dep.compatibility;
      const label = `${mod.id} → ${dep.name}`;
      if ( !verified ) { problems.push(`${label}: compatibility.verified is missing`); continue; }
      if ( minimum && compareVersions(verified, minimum) < 0 ) problems.push(`${label}: verified ${verified} is older than minimum ${minimum}`);
      if ( maximum && major(verified) > major(maximum) ) problems.push(`${label}: verified ${verified} is beyond maximum ${maximum}`);
      for ( const mirror of mod.mirrors[dep.id] ?? [] ) {
        const text = read(path.join(mod.dir, mirror.file));
        const m = text.match(mirror.pattern);
        if ( !m ) problems.push(`${label}: pattern not found in ${mirror.file}`);
        else if ( m[2] !== verified ) problems.push(`${label}: ${mirror.file} says ${m[2]} but module.json says ${verified}`);
      }
    }
  }
  if ( problems.length ) {
    console.error("Evergreen check failed:\n - " + problems.join("\n - "));
    process.exit(1);
  }
  for ( const mod of MODULES.map(describe) ) {
    console.log(`${mod.id}: ` + mod.deps.map(d => `${d.name} ${d.compatibility.minimum}–${d.compatibility.maximum ?? "*"} (verified ${d.compatibility.verified})`).join(", "));
  }
  console.log("Evergreen check OK: every pinned version is consistent.");
}

/* -------------------------------------------- */
/*  --update                                     */
/* -------------------------------------------- */

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "justgoofingtm-evergreen" } });
  if ( !res.ok ) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/** Every Foundry build on the public release notes index with its channel (stable, testing, development, prototype), newest first. */
async function foundryBuilds() {
  const html = await fetchText(FOUNDRY_RELEASES);
  const builds = [];
  for ( const item of html.split("<li class=\"article release") ) {
    const version = item.match(/href="\/releases\/(\d+\.\d+)"/)?.[1];
    const channel = item.match(/class="release-tag (stable|testing|development|prototype)"/)?.[1];
    if ( version && channel ) builds.push({ version, channel });
  }
  if ( !builds.some(b => b.channel === "stable") ) throw new Error("No stable builds found on the Foundry release index; has the page layout changed?");
  return builds.sort((a, b) => compareVersions(b.version, a.version));
}

/** Newest version available for a dependency, and the newest version within the allowed generation. */
async function lookup(dep, cache) {
  if ( dep.id === "core" ) {
    cache.core ??= await foundryBuilds();
    const gen = major(dep.compatibility.maximum ?? dep.compatibility.verified);
    // Only stable builds are ever applied, but a newer generation on any channel (prototype, testing)
    // is reported early so there is time to test before it becomes stable.
    const stable = cache.core.filter(b => b.channel === "stable");
    const newest = cache.core[0];
    return { latest: newest.version, channel: newest.channel, latestInRange: stable.find(b => major(b.version) <= gen)?.version ?? null, notes: v => `${FOUNDRY_RELEASES}${v}` };
  }
  cache[dep.manifestUrl] ??= JSON.parse(await fetchText(dep.manifestUrl));
  const remote = cache[dep.manifestUrl];
  const gen = major(dep.compatibility.maximum ?? dep.compatibility.verified);
  const url = (remote.url ?? "").replace(/\/$/, "");
  return { latest: remote.version, channel: "release", latestInRange: major(remote.version) <= gen ? remote.version : null, notes: () => url ? `${url}/releases` : dep.manifestUrl };
}

async function update() {
  const dryRun = flag("--dry-run");
  const cache = {};
  const changes = [];
  const newMajors = [];
  for ( const mod of MODULES.map(describe) ) {
    let text = read(mod.manifestPath);
    for ( const dep of mod.deps ) {
      const current = dep.compatibility.verified;
      const { latest, channel, latestInRange, notes } = await lookup(dep, cache);
      if ( latestInRange && compareVersions(latestInRange, current) > 0 ) {
        changes.push({ module: mod.id, dependency: dep.name, from: current, to: latestInRange, kind: bumpKind(current, latestInRange), notes: notes(latestInRange) });
        text = setVerified(text, dep.anchor, latestInRange);
        for ( const mirror of mod.mirrors[dep.id] ?? [] ) {
          const file = path.join(mod.dir, mirror.file);
          const before = read(file);
          const after = before.replace(mirror.pattern, `$1${latestInRange}$3`);
          if ( before === after ) throw new Error(`Could not update ${file} for ${dep.name}`);
          if ( !dryRun ) write(file, after);
        }
      }
      if ( major(latest) > major(dep.compatibility.maximum ?? current) ) {
        newMajors.push({ module: mod.id, dependency: dep.name, maximum: dep.compatibility.maximum, available: latest, channel, notes: notes(latest) });
      }
    }
    if ( !dryRun ) write(mod.manifestPath, text);
  }

  // Human-readable report
  if ( changes.length ) {
    console.log(`${dryRun ? "Would update" : "Updated"} verified compatibility:`);
    for ( const c of changes ) console.log(` - ${c.module}: ${c.dependency} ${c.from} → ${c.to}${c.kind === "minor" ? " (new minor version, review release notes)" : ""}`);
  } else console.log("All modules already verified against the newest stable releases.");
  for ( const m of newMajors ) console.log(` ! ${m.module}: ${m.dependency} ${m.available} (${m.channel}) is available but the module declares maximum ${m.maximum}; manual review needed.`);

  // Machine-readable report for the workflow
  const title = changes.length ? `Verify ${[...new Set(changes.map(c => `${c.dependency} ${c.to}`))].join(", ")}` : "";
  const majorTitle = newMajors.length ? `New major version available: ${[...new Set(newMajors.map(m => `${m.dependency} ${m.available} (${m.channel})`))].join(", ")}` : "";
  if ( option("--summary") ) fs.writeFileSync(option("--summary"), JSON.stringify({ changes, newMajors }, null, 2));
  if ( option("--body") ) fs.writeFileSync(option("--body"), prBody(changes));
  if ( option("--major-body") ) fs.writeFileSync(option("--major-body"), issueBody(newMajors));
  if ( process.env.GITHUB_OUTPUT ) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, [
      `changed=${changes.length > 0}`,
      `title=${title}`,
      `new_major=${newMajors.length > 0}`,
      `new_major_title=${majorTitle}`,
      ""
    ].join("\n"));
  }
}

function prBody(changes) {
  const rows = changes.map(c => `| ${c.module} | ${c.dependency} | ${c.from} | [${c.to}](${c.notes}) | ${c.kind === "minor" ? "**minor** — read the release notes" : c.kind} |`);
  return [
    "Automated compatibility bump. The newest stable release of each dependency was found and `compatibility.verified` (and every file that mirrors it) was updated. Lint, tests and manifest validation passed on the updated tree before this PR was opened.",
    "",
    "| Module | Dependency | Was | Now | Kind |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "`verified` records the newest release the automated suite passed against. It does not replace the manual checklist in each module's `docs/testing.md`; run it in a live world before tagging a release.",
    "",
    "Merge to keep the modules evergreen; close to skip this release (the next run will open a fresh PR)."
  ].join("\n");
}

function issueBody(newMajors) {
  const rows = newMajors.map(m => `| ${m.module} | ${m.dependency} | ${m.maximum} | [${m.available}](${m.notes}) | ${m.channel} |`);
  return [
    "A dependency has a new major version beyond what a module declares as `compatibility.maximum`. Automated bumps stop at `maximum`, so this needs a human review of the breaking changes before `maximum` and `verified` are raised. Prototype and testing builds are reported as soon as they appear so there is time to test before the generation becomes stable.",
    "",
    "| Module | Dependency | Declared maximum | Available | Channel |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "Suggested steps: read the migration notes, run `npm run audit:api -- --docs <new generation docs>` once the API documentation for it is published, run the test suite and the manual checklist in `docs/testing.md` against the new version, then raise `maximum` and `verified` in `module.json` (the evergreen check reports any mirror that still needs updating). Until `maximum` is raised Foundry keeps the module disabled on the new generation rather than letting it break."
  ].join("\n");
}

/* -------------------------------------------- */

if ( flag("--check") ) check();
else if ( flag("--update") ) update().catch(err => { console.error(err.message); process.exit(1); });
else {
  console.error("Usage: node utils/evergreen.mjs --check | --update [--dry-run] [--summary <json>] [--body <md>] [--major-body <md>]");
  process.exit(2);
}
