# Compatibility statement

This file states exactly what The Game Master's Macro Academy 1.0.0 was written against, how each claim was verified, and what remains untested. Lessons that reference an API carry their own `compat` declaration (target and tested level) which the automated tests enforce.

## Foundry VTT

| Claim | Status | How verified |
|---|---|---|
| Loads on Foundry V14 (`compatibility.minimum: 14`, `verified: 14.369`, `maximum: 14`) | Declared; **not executed in a live instance by the release authors** | Manifest validated by `tools/validate-manifest.mjs`; APIs read from the 14.369 API documentation and the 14.349/14.369 release notes |
| ApplicationV2 + HandlebarsApplicationMixin windows, `DialogV2`, `code-mirror` element, settings `user` scope, `getSceneControlButtons`, `renderSettings`, keybindings, `foundry.utils.escapeHTML/cleanHTML/saveDataToFile`, `Macro#execute` semantics | Written against documentation | https://foundryvtt.com/api/ (V14) |
| V12 compatibility shims (`Dialog`, global `renderTemplate`, `TextEditor`, `actor.data.data`) are not used; the emulator throws explanatory errors for them | Enforced | Lint rules and curriculum tests |

## Game systems

| System | Support | Verified against |
|---|---|---|
| dnd5e 6.0.0+ | Full: Tier 5 and the system-dependent parts of Tiers 7–9; adapter with verified data paths and workflows | dnd5e 6.0.6 source (`actor.mjs`, `item.mjs`, data templates, `config.mjs`) |
| Any other system | Core JavaScript and core Foundry lessons (Tiers 0–4, 6, 8, most of 9); system lessons are labelled and marked unavailable with a reason | Core adapter |

## Optional modules

| Module | Support | Verified against |
|---|---|---|
| Midi-QOL 14.6.0+ (dnd6 branch) | Detected by activity, version floor and API surface; six functions and seven hooks taught (see docs/api-compatibility.md); core fallback always present | Midi-QOL 14.6.2 source (`src/midi-qol.ts`, `src/module/Workflow.ts`) |
| Dynamic Active Effects, Times Up, convenient-effects modules | Not taught; mentioned only as examples of modules whose APIs must be verified before use | — |

## Browsers and runtime

- The sandbox and preview require Web Workers and ES2022 (private class fields, optional chaining, `structuredClone`). Every browser that runs Foundry V14 provides them.
- The automated tests run in Node 22 using `worker_threads` to execute the same worker code.

## Untested areas (to be covered by the manual checklist in docs/testing.md)

1. Rendering of the Academy and Workshop windows in a live Foundry V14 client (layout, theming, keyboard navigation, `code-mirror` behaviour).
2. Live Execution against a real world, including the consent dialog and permission errors coming from the server.
3. Practice fixture creation, reset and cleanup on dnd5e and on a non-dnd5e system.
4. Macro document export (create/replace/cancel) and file download.
5. Multi-user behaviour (hooks firing on every client, player access setting).
6. Real dnd5e roll dialogs, resistances and Midi-QOL workflows, which the emulator simplifies.
