# Testing

This document reports what was tested, how, with what results, and what could not be tested in the environment this release was built in. It also contains the manual release checklist that must be completed on a live Foundry V14 instance.

## Automated tests

Run with `npm run check` (lint, manifest validation, curriculum validation, then `vitest run`). CI runs the same on every push and builds the package.

| Suite | File(s) | What it covers |
|---|---|---|
| Unit: utilities | `tests/unit/html.test.js`, `diff.test.js`, `utilities.test.js` | Escaping and inline markup, line diff and explanation, text helpers, snapshot trimming, practice snapshot determinism, live warning content |
| Unit: dice and harness | `dice.test.js`, `harness.test.js` | Formula parser (kh/kl/d/r/min/max/x, data paths, seeding), compile/run, console capture, error line numbers, timeouts in a real worker |
| Unit: emulator | `preview-runtime.test.js` | Documents, collections, tokens, combat, chat and roll modes, dialogs with scripted answers, permissions as GM and player, dnd5e workflows, recorded side effects |
| Unit: assessment | `assessment.test.js` | Every submission type, every run test kind, hints and solution reveals (assisted semantics), mastery states, tier mastery and current tier, achievements, adaptive review rules |
| Unit: progress | `progress.test.js` | Empty record, validation with repair and warnings, migrations, merge strategies, summary, reconciliation, the service (recording, completion, achievements, export/import/inspect, corrupt store, reset) |
| Unit: registry and drafts | `registry.test.js`, `drafts.test.js` | Bundle validity, ordering, prerequisites, availability, search, glossary links, broken macros, pack registration and rejection; draft limits, versions, restore, autosave |
| Unit: diagnostics and compatibility | `diagnostics.test.js`, `compatibility.test.js` | Error explainer rules link to existing lessons and never invent, inspector safety, hook monitor cap, report formatting without secrets, version helpers, environment and requirement checks, adapters, Midi-QOL detection by surface, permissions |
| Integration: module smoke | `tests/integration/module-smoke.test.js` | Imports every script module under a Foundry mock (load-time errors in the UI layer), checks that preloaded templates and manifest file references exist, that every localization key used in templates and scripts exists, and that every `data-action` has a handler |
| Curriculum | `tests/curriculum/curriculum.test.js` | Validates the whole bundle (ten tiers, schema, cycles, ordering); renders every lesson and exercise; syntax-checks every code block; executes every runnable block (sandbox or emulator) and asserts declared outputs and errors; runs every code exercise's solution (must pass all tests) and starter (must fail); checks every declared answer of every non-code exercise and checkpoint; reproduces and repairs every broken macro |

### Results for this release (1.0.0)

Executed in the build container (Node 22, Linux) on 2026-10-14:

```
npm run lint        0 errors, 0 warnings
npm run validate    manifest OK; curriculum OK (0 issues)
npm test            14 files, 545 tests, 0 failures (about 30 s)
```

The curriculum suite executed 234 exercise solutions and starters, every runnable example in 57 lessons, 206 checkpoint questions and 15 broken macros. The sandbox and emulator code that ran under Node `worker_threads` is byte-for-byte the code the browser Web Worker runs.

### What the automated tests do not cover

- Rendering of the ApplicationV2 windows (Academy, Workshop, settings menu, dialogs) and their templates and styles.
- Foundry's `code-mirror` element behaviour (keyboard shortcuts, font size).
- Live Execution against a real world and the consent dialog.
- Macro export (create/replace/cancel) and file downloads.
- Practice fixture creation, reset and cleanup against a real database.
- The hook monitor against real hooks, the object inspector against real documents, the live snapshot builder.
- Real dnd5e roll dialogs, resistances, Midi-QOL workflows.
- Multi-user behaviour.

These are covered by the manual checklist below. **This release has not yet been walked through that checklist on a live Foundry V14 instance by its authors**; the checklist is the gate for calling it verified.

## Manual release checklist

Perform on a fresh Foundry V14 world (14.369 or later) with dnd5e 6.0.6, once with no other modules and once with Midi-QOL 14.6.2 enabled; repeat the player items from a second browser logged in as a player.

### Installation and interface

- [ ] Install from the zip; the module appears in Manage Modules with version 1.0.0 and no manifest warnings.
- [ ] Enabling the module produces the "ready" console line with lesson and glossary counts and no errors.
- [ ] The Academy opens from the token control, the settings sidebar button, Alt + Shift + A, `/academy` and the settings menu button.
- [ ] Dashboard, Curriculum, Lesson, Glossary, Progress, Debugging, Diagnostics and Help views render; navigation works with the keyboard; the window reopens at its last size and position.
- [ ] Switching modes re-renders the lesson (deep dives collapsed in Guided).
- [ ] On a world with a non-dnd5e system, system lessons show as unavailable with a reason and the Diagnostics view explains; on an unsupported Foundry generation a warning notification appears.

### Curriculum and assessment

- [ ] Open Tier 0 lesson 1; every section renders; code blocks show their compatibility footer; Copy and Open in workshop work.
- [ ] Complete Tier 0 lesson 1 (exercises and checkpoint); the state becomes completed, the next lesson unlocks, the dashboard updates, the "first-macro" achievement notification appears after a run.
- [ ] Reveal a solution on an exercise, pass it; the lesson shows completed (guided); re-pass without assistance; it shows completed (independent).
- [ ] Fail the same concept three times; the dashboard shows a review suggestion naming the concept.
- [ ] Glossary search, term links from lessons and lesson links from terms work.

### Workshop

- [ ] Sandbox run prints output; an infinite loop is terminated with the timeout message.
- [ ] Preview run against practice data shows recorded updates/chat; switching the snapshot source to the live world shows a read-only snapshot of real actors and nothing changes.
- [ ] Live run shows the warning; cancelling runs nothing; confirming runs the code and the chat/actor changes appear; "once per session" suppresses the second warning; changing the world setting resets it.
- [ ] As a player with live execution disabled, the live option is unavailable with a reason; with it enabled and `MACRO_SCRIPT` granted it works.
- [ ] Save a draft, reload the page, reopen it; version history and restore work; the unsaved-text recovery prompt appears after a forced reload.
- [ ] Export to file downloads a `.js`; copy to clipboard works; create Macro creates a document; exporting again with the same name asks replace/create/cancel and cancel changes nothing.
- [ ] Compare view shows the diff against the reference with an explanation.
- [ ] A thrown error shows the learner's line number matching the editor.

### Laboratory and debugging

- [ ] Create practice fixtures: the folder, five actors and the scene exist and are flagged; Reset restores HP after changes; Clean up removes exactly those documents and nothing else (verify with an unrelated actor and scene present).
- [ ] The broken macro library opens each entry in the workshop; the starter fails; the reference repair passes.
- [ ] The error explainer recognises a pasted `TypeError` and links the lesson; an unknown message yields the general method.
- [ ] The hook monitor shows `updateActor` events while editing a sheet; stopping it stops the log.
- [ ] The object inspector shows the selected token's actor tree without errors.
- [ ] Diagnostics report copies to the clipboard and contains no setting values.

### Persistence

- [ ] Close and reopen the Academy and reload the page: progress, bookmarks and drafts persist; the resume button opens the last lesson.
- [ ] Export progress; reset; import with merge; the state returns; importing a malformed file is refused with reasons.
- [ ] Log in as a different user: progress is separate.

### Integration

- [ ] With Midi-QOL enabled, Diagnostics shows it active with its API present; the Tier 7 capstone chooses the Midi-QOL backend live and the fallback with it disabled.

Record the Foundry build, system version, browser and date with the results in the release notes.
