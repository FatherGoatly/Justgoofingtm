# Changelog

All notable changes to The Game Master's Macro Academy are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses semantic versioning.

## [1.0.0] — 2026-10-14

First release.

### Added

- Ten curriculum tiers (0–9) with 57 lessons, 234 interactive exercises across 12 of the 13 supported exercise types, 10 capstone projects, 57 knowledge checkpoints (206 questions), a 72-term glossary and a 15-entry broken macro library.
- Three learning modes (Guided, Workshop, Independent Challenge), a dashboard, a filterable curriculum browser, a lesson viewer with section navigation and bookmarks, and a searchable glossary.
- The code workshop: Concept Sandbox and Foundry Preview in a Web Worker with a time limit; Live Execution with an explicit warning and consent (per run or per session); drafts with version history and autosave recovery; export to file, clipboard or Macro document with replace/create/cancel; comparison against the lesson reference.
- The Foundry emulator: documents, collections, tokens, combat, chat, dice, dialogs with scripted answers, hooks (including document pre/post hooks), settings and flags, permissions, dnd5e 6 workflows (`rollAbilityCheck`, `rollSavingThrow`, `rollSkill`, `applyDamage`, `applyTempHP`, `toggleStatusEffect`, item use), and a recorded stand-in for six Midi-QOL functions on the `practice-midi` fixture.
- The assessment engine: behaviour-based checks (output, chat, notifications, updates, creates, dialogs, rolls, hooks, mechanics, code patterns, function calls and test scripts), five hint levels, progressive solution reveals recorded as assisted, checkpoints, transparent mastery states, adaptive review from attempt history, and 12 achievements.
- Progress persistence in a per-user setting with validation, migrations, reconciliation against the curriculum, export and validated import (replace, merge, keep existing).
- The debugging workbench: error explainer, hook monitor, object inspector, diagnostics report, practice fixtures (create, reset, clean up: flagged documents only).
- Module settings for access, player live execution, system lessons, default mode, editor font size, assessment requirement, assisted recording, notifications, open behaviour, export scope and live warning mode; keybinding, scene control, settings sidebar launcher, `/academy` chat command and a public API (`game.modules.get("gm-macro-academy").api`) with a curriculum pack registration point.
- Documentation: user, beginner, developer, curriculum authoring, API compatibility, security, testing (with the manual release checklist), troubleshooting and architecture guides; ten tested example macros.
- Automated tests: 540 tests across unit, curriculum, assessment and integration suites, run in CI with lint, manifest validation and packaging.

### Known limitations

- Not yet verified on a running Foundry V14 instance by the release authors; see docs/testing.md for the manual checklist.
- The sandbox and preview run in a Web Worker, which has no access to the Foundry page or documents but can still make same-origin network requests; see docs/security.md.
- The emulator implements a documented subset of Foundry and dnd5e; resistances, templates, ApplicationV2 subclasses and compendium access are not emulated. Lessons state when live verification is required.
- The curriculum is available in English only; all strings are in `lang/en.json` for translation.
