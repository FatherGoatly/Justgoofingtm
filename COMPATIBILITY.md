# Compatibility Report

Module version 1.0.0. Last updated 2026-10-13.

## What was verified, and how

| Target | Version | Verification method |
| --- | --- | --- |
| Foundry VTT | 14 (API docs for 14.368 Stable) | Public API documentation read for `Die` modifiers (`reroll`, `minimum`, `maximum`), `Roll.fromData/toJSON`, `DialogV2.confirm/wait/input/prompt`, `ApplicationV2` header controls and render hooks (`render<ClassName>` / `getHeaderControls<ClassName>` fire for each class in the inheritance chain), `renderChatMessageHTML`. |
| D&D 5e system | 6.0.6 (`release-6.0.6` tag; `system.json` minimum Foundry 14.367) | Source read: `module/dice/d20-roll.mjs`, `d20-die.mjs`, `basic-die.mjs`, `basic-roll.mjs`, `module/documents/actor/actor.mjs` (ability/skill/save/death/concentration/initiative rolls and their hooks), `module/documents/activity/attack.mjs`, `module/documents/chat-message.mjs` (`getAssociatedActor`), chat-message data models (`attack`, `check`, `save` types and their `system` fields), `module/applications/actor/character-sheet.mjs` and `templates/actors/character-sidebar.hbs`, `module/enrichers.mjs` (`/damage`, `/heal`, `/save`, `/check`), `Actor5e#applyDamage`, `#applyTempHP`, `#toggleStatusEffect`. |
| Midi-QOL | `dnd6` branch 14.6.2 (Foundry 14.369+, dnd5e 6.0.6) | Source read: `src/module/Workflow.ts` (attacks go through dnd5e's roll builder; rolls are linked to the item card; `midi-qol.AttackRollComplete` hook; replacement rolls from bonus flags). The `master` branch (13.0.x) targets Foundry 13 / dnd5e 5.x and is not supported. |

## What was NOT verified

- **No live Foundry V14 instance was available in the build environment.** The module was not launched in a real
  world; the UI (ApplicationV2 dialogs, sheet card injection, chat cards) and the end-to-end hook flow were
  validated by reading the dnd5e 6.0.6 and Foundry 14 sources/documentation and by unit tests with a runtime mock.
  Treat the real-world integration as **expected to work, pending a smoke test** (see `docs/TESTING.md` for the
  manual checklist).
- Midi-QOL, DAE, DFreds Convenient Effects, Times Up and Tidy 5e Sheets were not installed and exercised.
  - Midi-QOL: adapter implemented against the `dnd6` source; not run.
  - DAE / Times Up: no dedicated integration. Conditions applied by the module are standard Active Effects with an
    optional round duration, which these modules handle on their own.
  - DFreds Convenient Effects: no dedicated integration; conditions are applied through `Actor5e#toggleStatusEffect`.
  - Tidy 5e Sheets: the sheet card hooks `renderBaseActorSheet` (dnd5e's own sheets). Tidy sheets do not extend
    that class, so the card does not appear there; the header control, action panel, API and keybinding still work.

## Known behavioral notes

- dnd5e fires `dnd5e.rollSavingThrow` **and** `dnd5e.rollDeathSave` for one death save; the module awards once.
- Initiative rolls are only detected from the chat message (dnd5e converts the core initiative message into a
  `check` message with `system.type = "initiative"`); the category is off by default.
- Rolls made with the message creation suppressed (`message.create === false`) and without going through the
  dnd5e configuration stage can only be deduplicated by object identity on the rolling client.
- `Roll.validate` is used at runtime for formulas in addition to the structural check.
