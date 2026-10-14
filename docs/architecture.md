# Architecture

The Game Master's Macro Academy is a Foundry VTT V14 module written as plain ES modules with no build step. It is organised as a set of pure engines (curriculum, assessment, progress, emulator) wrapped by thin Foundry-facing layers (settings, applications, live execution), so that everything that decides something can be tested in Node and everything that touches Foundry is small.

## Layers

```
scripts/
  main.js               entry point: init (settings, keybinding, templates), ready (curriculum, Academy, API, hooks)
  core/                 constants, logger, i18n, compatibility, permissions, settings, Academy singleton
  curriculum/           schema (validation), registry (lookup, search, prerequisites, packs), renderer (HTML from data)
  assessment/           evaluator (exercise + run checks), hints, mastery, review, achievements
  workshop/             harness (compile/run), execute-request, sandbox-worker, runner (Worker lifecycle),
                        preview-runtime (Foundry emulator), practice-snapshot, snapshot (live snapshots), dice,
                        live-executor, drafts, exporter, fixtures
  progress/             schema (record shape, validation, migrations, merge), service (persistence, recording)
  adapters/             base adapter, foundry core adapter, dnd5e adapter, integrations (Midi-QOL), registry
  diagnostics/          error explainer, hook monitor, object inspector, report
  applications/         ApplicationV2 windows: Academy (views), Workshop, settings menu, dialogs, exercise renderer
  utilities/            html (escaping, inline markup, code blocks), diff, text
curriculum/             content as data: tier-00 … tier-09, glossary, broken macros, helpers, index
templates/, styles/, lang/   Handlebars parts, CSS, localization
tests/                  vitest suites and the Node worker runner
tools/                  manifest/curriculum validation, per-tier checker, examples builder, packaging
```

Dependencies point downward: applications depend on engines; engines depend on utilities and constants; nothing in `curriculum/`, `assessment/`, `progress/` or `workshop/preview-runtime.js` imports Foundry globals (the live executor, exporter, fixtures, snapshot builder and applications do, by design).

## Execution model

| Mode | Where it runs | What it can see | Isolation |
|---|---|---|---|
| Concept Sandbox | Web Worker (`sandbox-worker.js`) | `console` and JavaScript built-ins; `globalThis` is a fresh object per run | No DOM, no Foundry page, no documents. Terminated on timeout (`LIMITS.SANDBOX_TIMEOUT_MS`). Same-origin network access is **not** blocked by the browser; see security.md |
| Foundry Preview | Web Worker | Emulated `game`, `canvas`, `ui`, `Hooks`, `CONST`, `CONFIG`, `foundry.utils` subset, `ChatMessage`, `Roll`, `Actor/Item/Macro` statics, `fromUuid`, `DialogV2` with scripted answers, optional `MidiQOL` stand-in | As above; the emulator works on a deep-cloned snapshot and records every side effect |
| Live Execution | Main thread (`live-executor.js`) | The real Foundry API with the user's privileges | None. Requires `MACRO_SCRIPT`, the world setting for players, and an explicit confirmation (always or once per session) |

Learner code is compiled with `foundry.utils.AsyncFunction` semantics exactly as `Macro#execute` does: wrapped in a block so top-level `const` cannot collide with the argument names, with `speaker`, `actor`, `token`, `character` and `scope` provided live. Lesson *text* is never executed; only code blocks explicitly declared runnable, starters, solutions and exercise test scripts are compiled, and only inside the worker (or live on explicit request).

## Curriculum as data

A lesson is a plain object validated by `scripts/curriculum/schema.js` (30 required items: identity, objectives, access declaration, 13 required section kinds with code blocks carrying `compat` declarations, at least one exercise, a challenge, a checkpoint, reinforcement links, documentation links with verification notes, completion criteria). Tiers list lessons and a capstone; the bundle must contain tiers 0–9 without prerequisite cycles. Text supports a small inline markup (`code`, **bold**, _italic_, `[[term]]`, `[[lesson:id|label]]`) rendered through escaping only.

Additional packs can be registered at runtime through `game.modules.get("gm-macro-academy").api.registerCurriculumPack(pack)`; a pack is validated against the merged curriculum and rejected as a whole on any issue.

## Assessment

`evaluateRun(exercise, run, code)` turns the worker's run result (output, error, chat, notifications, updates, creates, deletes, dialogs, rolls, hooks, mechanics, call and script results) into named checks. Test kinds: `call`, `script`, `expectOutput`, `outputIncludes`, `outputMatches`, `expectNoError`, `expectError`, `expectChat`, `expectNotification`, `expectUpdate`, `expectNoUpdate`, `expectReturn`, `returnMatches`, `expectTimeout`, `expectDialog`, `expectCreate`, `expectRoll`, `expectHook`, `expectMechanic`, `codeIncludes`, `codeExcludes`. Because checks describe behaviour, different correct programs pass the same exercise; `codeIncludes` is used only to enforce a taught practice (escaping, awaiting, using a system method) and is always accompanied by behavioural checks.

Non-code exercises (choice, prediction, blanks, identify, reorder, discovery, explanation, capstone) are evaluated in `evaluateSubmission`; explanations and capstones are rubric self-assessments with a minimum length and a model answer shown afterwards.

## Mastery states

States are recomputed from records (`assessment/mastery.js#computeLessonState`), never set directly:

| State | Rule |
|---|---|
| locked | A prerequisite is not completed (registry) |
| not-started | No record and no attempts |
| in-progress | Opened or attempted, but required exercises or the checkpoint are not passed |
| completed-guided | All required exercises passed and the checkpoint passed (when required), but at least one required exercise was passed after revealing the solution |
| completed-independent | As above with no solution reveals |
| mastered | completed-independent and the lesson's challenge passed without assistance |
| needs-review | A completed lesson whose concepts show a majority of recent failed attempts (see below) |

Tier mastery requires every lesson complete, every checkpoint passed, the capstone complete, and at least one passed exercise that exercises a failure case. The **Require assessment** user setting controls whether checkpoints gate completion.

## Adaptive review

`assessment/review.js` aggregates attempts per concept tag. A concept is recommended for review when at least `minFailedAttempts` (3) of the last `windowSize` (10) attempts failed and the failure ratio is at least `failureRatio` (0.5). Recommendations list the lessons teaching the concept and up to three unpassed practice exercises. The rules are constants, shown in the Progress view, and there is no hidden scoring.

## Persistence

Progress lives in a `user`-scoped setting (follows the user across devices), drafts in another, window state in a client setting, and the editor's unsaved text in `localStorage` for crash recovery. Records carry `schemaVersion`; `progress/schema.js` validates field by field (unknown keys dropped, bad values repaired and reported), applies ordered migrations, reconciles with the loaded curriculum (unknown lessons kept and reported), and merges imports (replace, merge, keep existing). Limits (`core/constants.js#LIMITS`) cap drafts, versions, activity and attempts.

## Compatibility matrix

| Layer | Supported | Verified | Source of truth |
|---|---|---|---|
| Foundry | V14 | 14.369 | API docs, release notes |
| dnd5e | 6.0.0+ | 6.0.6 | System source |
| Midi-QOL (optional) | 14.6.0+ | 14.6.2 | Module source |
| Node (tests) | 20+ | 22 | CI |

`core/compatibility.js#describeEnvironment` evaluates the live environment at startup and the Diagnostics view shows the result; `checkRequirements` gates lessons whose `requirements` name a system or module.

## Emulator subset

Implemented: Actor, Item, ActiveEffect, TokenDocument/Token, Scene, Combat/Combatant, User, Macro, JournalEntry (minimal), ChatMessage (create, whisper, roll modes), Roll (dice parser with kh/kl/d/r/min/max/x, `@` data paths, seeded for tests), Hooks (on/once/off/call/callAll/events, document pre/post hooks, create hooks), settings (register/get/set), flags (get/set/unset), `fromUuid`, permissions (ownership map, GM override, player fixture), grid measurement, dnd5e 6 roll and damage workflows (simplified: no resistances, dialog suppressed), Midi-QOL stand-in (`applyTokenDamage`, `completeItemUse`, `completeActivityUse`, `findNearby`, `getDistance`, `hasCondition`).

Not implemented (throws a clear `NOT_EMULATED` error): ApplicationV2 subclasses, `DialogV2.query`, templates, compendium packs, measured templates, lighting/walls, audio, sockets, file uploads. Lessons that depend on these mark the block `tested: "static"` and say so.

## Extension points

- Curriculum packs: `api.registerCurriculumPack(pack)`.
- System adapters: `adapters/registry.js#registerAdapter(Class)` (subclass `SystemAdapter`).
- Hooks fired: `gm-macro-academy.ready` (api), `gm-macro-academy.lessonCompleted` (lesson id, state), `gm-macro-academy.exercisePassed` (exercise id).
- Fixtures: `FIXTURE_SET` flag and the `createFixtures/resetFixtures/cleanupFixtures` functions.
