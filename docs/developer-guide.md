# Developer guide

For contributors to the Academy and for module developers who want to extend it or reuse its engines.

## Setup

```
git clone <repository>
cd gm-macro-academy
npm install
npm run check
```

Node 20 or newer (CI uses 22). There is no build step: the module runs from source. To test in Foundry, symlink or copy the repository into `Data/modules/gm-macro-academy/` (the folder name must match the manifest id).

Scripts:

| Command | What it does |
|---|---|
| `npm run lint` | ESLint 9 flat config over scripts, curriculum, tests and tools; `no-eval`, `no-new-func` and `no-implied-eval` are errors (the harness and worker are the only exemptions) |
| `npm run validate` | Validates `module.json` (ids, versions, compatibility, file references, `socket: false`) and the whole curriculum bundle |
| `npm test` | vitest: unit suites, the curriculum suite (validates every lesson, renders it, syntax-checks and executes every runnable block, runs every solution and starter, checks every declared answer and checkpoint, repairs every broken macro) |
| `node tools/check-tier.mjs 5 6` | The same checks for selected tiers, with readable output; use while writing content |
| `node tools/build-examples.mjs` | Regenerates `examples/` from tested capstone solutions |
| `npm run package` | Builds `dist/gm-macro-academy.zip` and `dist/module.json` |

## Code map

See [architecture.md](architecture.md) for the layer diagram. The rule that keeps the code testable: `curriculum/`, `assessment/`, `progress/`, `workshop/harness.js`, `workshop/preview-runtime.js`, `workshop/practice-snapshot.js`, `workshop/dice.js`, `diagnostics/error-explainer.js`, `diagnostics/inspector.js` and `utilities/` never touch Foundry globals. Everything that does (applications, live executor, exporter, fixtures, live snapshot builder, settings, compatibility probes) is thin and covered by the manual checklist.

## Conventions

- Plain ES modules, two-space indentation, double quotes, semicolons, `foundry`-style spacing inside `if ( ... )`.
- Every user-facing string lives in `lang/en.json` under `GMMA.*` and is read through `scripts/core/i18n.js#t` (fallback: the key itself) or `{{localize}}` in templates.
- HTML is built from data through `utilities/html.js`: `escapeHTML` for every interpolated string; `renderInline` for the lesson markup; `sanitizePreviewHTML` for chat previews in the results panel. Never assign unescaped text to `innerHTML`.
- Errors that the user should see go through `Logger.report(context, err, { notify })`; the console gets the stack, the user gets one line.
- Settings keys, limits, states and modes are constants in `core/constants.js`.

## The public API

Available after `ready` as `game.modules.get("gm-macro-academy").api` and passed to the `gm-macro-academy.ready` hook:

| Member | Description |
|---|---|
| `open(view?)` | Open the Academy window at a view (`dashboard`, `curriculum`, `lesson`, `glossary`, `progress`, `debug`, `diagnostics`, `help`) |
| `openLesson(id)` | Open a lesson |
| `openWorkshop({ exerciseId?, draftId?, brokenId?, code?, runtime?, lessonId? })` | Open the workshop pre-loaded |
| `registry` | The `CurriculumRegistry`: lessons, tiers, glossary, exercises, search, prerequisites |
| `registerCurriculumPack(pack)` | Add lessons, glossary terms and tier placements; validated as a whole and rejected on any issue (issues are logged) |
| `environment()` | The compatibility report |
| `adapter` | The active system adapter |
| `version` | Module version |

Hooks the Academy fires: `gm-macro-academy.ready` (api), `gm-macro-academy.lessonCompleted` (lessonId, state), `gm-macro-academy.exercisePassed` (exerciseId, { assisted }).

## Writing a curriculum pack

A pack is data: `{ id, lessons: [...], glossary: [...], tierLessons: { 3: ["my-lesson-id"] } }`. Lessons follow the schema in [curriculum-authoring.md](curriculum-authoring.md); exercise ids must start with the tier prefix of their lesson (`t3-`), be globally unique, and a lesson must be placed in exactly one tier. Packs can be registered from another module's `ready` hook (after `gm-macro-academy.ready`). Validate packs with the same tooling: place lesson files under `curriculum/` in a fork and run `node tools/check-tier.mjs <n>`.

## Adding a system adapter

Subclass `SystemAdapter` (`scripts/adapters/base-adapter.js`): declare `static id`, `title`, `verified`, implement `matches(env)`, `describeActor(actor)`, `hpPath`, `capabilities` and `workflows`, and register it with `registerAdapter(Class)` before `ready`. Lessons gate on `requirements.system.id`; the emulator's practice snapshot is dnd5e-shaped, so a new system needs its own snapshot shape in `practice-snapshot.js` to run system lessons in preview.

## Extending the emulator

`workshop/preview-runtime.js` builds the globals from a snapshot. Add APIs where learners will actually call them, record side effects with `rt.record(kind, data)` so tests can assert on them, and throw `NOT_EMULATED("name")` for anything you do not implement rather than returning a plausible fake. Add a corresponding test in `tests/unit/preview-runtime.test.js` and, if a lesson depends on it, a runnable example in that lesson.

## Tests

- `tests/unit/*`: engines and helpers.
- `tests/curriculum/curriculum.test.js`: the content contract. It fails the build if any lesson violates the schema, any runnable block fails, any solution fails its tests, any starter passes them, any declared answer is rejected, or any broken macro does not reproduce and repair.
- `tests/setup/foundry-mock.js`: a minimal `game`/`ui`/`Hooks`/`foundry` mock for code that reads settings or permissions.
- `tests/setup/node-runner.js`: runs the worker code in a Node `worker_threads` worker with the same timeout handling as the browser.

Run a single file with `npx vitest run tests/unit/assessment.test.js`.

## Release

1. Bump `version` in `module.json` and `package.json`; write the CHANGELOG entry; update `COMPATIBILITY.md` with the builds you verified on.
2. `npm run check` and `npm run package`.
3. Walk the manual checklist in [testing.md](testing.md) on a live Foundry V14 instance; record the results in the release notes.
4. Tag `vX.Y.Z`; the release workflow builds the zip and attaches `module.json` and `gm-macro-academy.zip`. The manifest URL points at the latest release's `module.json`; the download URL at that version's zip.
