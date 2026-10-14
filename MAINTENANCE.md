# Maintenance: keeping the modules evergreen

Both modules in this repository (Stat Block Importer at the root, GM Asset Library in `gm-asset-library/`)
are kept current by the automation under `.github/`. Nothing is ever changed on the default branch
without a pull request; the automation prepares and verifies the change, a human merges it.

## What breaks a module when Foundry updates, and what catches it

| Kind of update | Risk | What catches it |
| --- | --- | --- |
| New stable build in the same generation (14.368 → 14.369) | Low: Foundry does not make breaking API changes inside a generation. | The weekly evergreen job bumps `verified`, re-runs both test suites and opens a PR. |
| New dnd5e release inside `maximum` (6.0.6 → 6.1.0) | Medium for minor versions: data models can change. | Same PR, marked **minor** so the release notes get read. The test suite exercises the document builders against the static reference tables. |
| New Foundry generation (V15) | High: deprecated APIs are removed. | Three layers, below. |

Both modules already avoid legacy globals and reach every Foundry API through the namespaced
`foundry.*` paths or guarded `globalThis.foundry?.…` lookups, which is the single most effective
protection: generation upgrades remove the old aliases first.

1. **Weekly API audit** (`npm run audit:api`, `utils/api-audit.mjs`). Inventories every Foundry API path
   the modules' scripts use (namespaced symbols plus the global roots `game`, `Hooks`, `ui`, `canvas`,
   `CONFIG`, `CONST` and the document classes), resolves each one against the public API documentation
   for the current stable release, and fails when a symbol is missing or carries the documentation's
   deprecation marker. Deprecation is announced a generation before removal, so this fires months before
   an update would break anything. The evergreen workflow opens an issue when it fails and closes it when
   it passes again; CI runs it as an advisory job. Pass `--docs https://foundryvtt.com/api/v13/` style
   URLs to audit against another generation's documentation.
2. **Early warning on a new generation.** The evergreen job watches every release channel. The first
   V15 prototype or testing build opens an issue, long before V15 becomes stable, with the steps to
   test against it.
3. **`compatibility.maximum` as the safety net.** Each `module.json` declares `maximum: "14"`. When V15
   ships, Foundry refuses to activate the module in a V15 world instead of running untested code
   against it. Users keep a disabled module rather than a broken one, and the next release (after the
   audit and the manual checklist pass on V15) raises `maximum` and `verified`. Removing `maximum`
   would trade that for "keeps loading, may break"; this repository deliberately keeps it.

Nothing here replaces running the modules in a real Foundry world. A Foundry licence is needed for
that and it cannot happen in CI, so each module's `docs/testing.md` keeps a manual checklist for the
release that first supports a new generation.

## What runs, and when

| Automation | Trigger | What it does |
| --- | --- | --- |
| `workflows/ci.yml` | every push and pull request | Lint, tests, manifest validation and a packaging dry run for both modules on Node 22 and Node 24, the pinned-version consistency check, and the API audit as an advisory job. |
| `workflows/evergreen.yml` | Mondays 06:17 UTC, or **Run workflow** | Two jobs. **bump** finds the newest **stable** Foundry build on <https://foundryvtt.com/releases/> and the newest release of each related system (dnd5e, read from the manifest URL in `module.json`), bumps `compatibility.verified` within each module's `maximum`, re-runs the suites, and opens the `evergreen/compatibility` pull request; a newer generation on any channel is reported as an issue instead. **audit** runs the Foundry API audit and opens or closes its issue. |
| `dependabot.yml` | weekly | Updates the npm dev dependencies of both modules (grouped minor/patch, separate majors) and the GitHub Actions the workflows use. CI runs on every Dependabot PR. |
| `workflows/release.yml` | tag `v<version>` or `gmal-v<version>` | Verifies and packages **both** modules, pins the `download` URL in the published manifests to the tag, creates the GitHub release with the changelog section as notes, and optionally publishes to the Foundry package registry. |

## The single source of truth

`module.json` → `compatibility.verified` (and, for Stat Block Importer, the dnd5e entry under
`relationships.systems`) is the only place a verified version is *decided*. Everything else that repeats
it is a mirror listed in `utils/evergreen.mjs`:

- `scripts/core/compatibility.js` → `COMPATIBILITY_MATRIX` (core and dnd5e rows)
- `README.md` → the "Requirements" line

`npm run evergreen:check` fails when any mirror disagrees, when `verified` is older than `minimum`, or
when it is beyond `maximum`. CI runs it on every push, so a manual bump that misses a file cannot land.

Run `npm run evergreen:update -- --dry-run` locally to see what the weekly job would change.

## Policy

- **Within a generation, bump automatically.** New Foundry builds and dnd5e releases that stay inside
  `maximum` are applied and verified by the automated suite. The PR body marks a dnd5e *minor* bump so
  its release notes get read before merging.
- **Across a generation, never silently.** Foundry 15 or dnd5e 7 raises an issue as soon as a build
  appears on any channel. Raising `maximum` is a human decision that comes with a passing API audit
  against the new documentation and the manual checklist in each module's `docs/testing.md`.
- **`verified` means the automated suite passed.** It is not a substitute for the live-world checklist
  before a tagged release.

## Releasing

1. Update `version` in `module.json`, `package.json` and `scripts/core/constants.js` of the module you
   are releasing (`npm run validate:manifest` checks they agree) and add a `## <version>` section to its
   `CHANGELOG.md` (the release workflow refuses a tag without one).
2. Tag and push: `git tag v0.2.0` for Stat Block Importer, `git tag gmal-v0.2.0` for GM Asset Library.
3. The workflow attaches `module.json`, `stat-block-importer.zip`, `gm-asset-library.module.json` and
   `gm-asset-library.zip` to the release. Every release carries both modules because both install URLs
   use `releases/latest/download/`; a release with only one module would break the other's manifest URL.

To also publish to the Foundry package registry, add a repository secret holding that package's
release token: `FOUNDRY_RELEASE_TOKEN_STAT_BLOCK_IMPORTER` or `FOUNDRY_RELEASE_TOKEN_GM_ASSET_LIBRARY`.
Without the secret the step is skipped.

## One-time repository settings

- **Settings → Actions → General → Workflow permissions**: enable *Allow GitHub Actions to create and
  approve pull requests*, or the evergreen workflow cannot open its PR.
- Optional: a fine-grained personal access token (contents and pull requests, read/write) stored as the
  `EVERGREEN_TOKEN` secret. Pull requests opened with the default `GITHUB_TOKEN` do not trigger the CI
  workflow; the evergreen job runs the same checks itself before opening the PR, so this only matters if
  you want the green check mark on the PR too.
- Optional: branch protection on the default branch requiring the CI jobs, so neither Dependabot nor the
  evergreen PR can be merged red.
