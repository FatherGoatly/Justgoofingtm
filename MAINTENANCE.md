# Maintenance: keeping the modules evergreen

Both modules in this repository (Stat Block Importer at the root, GM Asset Library in `gm-asset-library/`)
are kept current by four pieces of automation under `.github/`. Nothing is ever changed on the default
branch without a pull request; the automation prepares and verifies the change, a human merges it.

## What runs, and when

| Automation | Trigger | What it does |
| --- | --- | --- |
| `workflows/ci.yml` | every push and pull request | Lint, tests, manifest validation and a packaging dry run for both modules on Node 22 and Node 24, plus the pinned-version consistency check. |
| `workflows/evergreen.yml` | Mondays 06:17 UTC, or **Run workflow** | Finds the newest **stable** Foundry build on <https://foundryvtt.com/releases/> and the newest release of each related system (dnd5e, read from the manifest URL in `module.json`). Bumps `compatibility.verified` within each module's `maximum`, re-runs the suites, and opens the `evergreen/compatibility` pull request. A newer major generation beyond `maximum` is reported as an issue instead. |
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
- **Across a generation, never silently.** Foundry 15 or dnd5e 7 raises an issue. Raising `maximum`
  is a human decision that comes with the manual checklist in each module's `docs/testing.md`.
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
