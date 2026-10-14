# Troubleshooting

## The Academy does not open

- **No button, no shortcut**: the module is not enabled in this world, or you are a player and the world setting **Who may use the academy** is *GM only*. Ask the GM to change it.
- **"Unsupported Foundry generation" warning**: the module was built for V14. It may partly work on other generations but is not supported; see COMPATIBILITY.md.
- **Console error during `ready` mentioning the curriculum**: a curriculum pack from another module failed validation; the Academy logs the issues and loads the core curriculum only. Disable the pack's module to confirm.

## A lesson says it is unavailable

- **"Requires the dnd5e game system"**: the lesson is system-specific and your world runs another system. Core lessons still work. The GM can hide system lessons with **Show system-specific lessons**.
- **"Locked by …"**: complete the listed prerequisite lessons (their checkpoints count unless **Require assessment** is off).

## The workshop

- **"Web Workers are unavailable"**: your browser blocks workers (very old browser or an extension). The sandbox and preview cannot run; live execution still can. Try another browser.
- **"Program timed out"**: your code ran longer than four seconds, usually an infinite loop (check `while` conditions and loop counters) or an `await` on a promise that never resolves.
- **A dialog "was treated as cancelled"**: in preview, dialogs answer themselves from the exercise's scripted inputs. Your own macros in preview have no scripted answers, so dialogs return `null`; the results panel says so. Test dialog flows live, or set inputs in the exercise.
- **Preview says "not emulated"**: the API you called is outside the emulator's subset (templates, compendia, ApplicationV2 subclasses, audio, sockets). The message names it. Verify such code live on the practice fixtures.
- **Live run is disabled**: you lack Foundry's *Use Script Macros* permission, or you are a player and the GM has not enabled **Allow players to run code live**.
- **The error line number does not match the editor**: the line reported is the line in your code; if you pasted code with a leading blank line, count from the first line of the editor.
- **Draft could not be saved**: you hit a limit (60 drafts, 64 KB per draft, 1.5 MB total). Delete old drafts or export large programs as files.

## Progress

- **"Stored progress is unreadable; starting fresh"** in the console: the saved record failed validation (it is left untouched until you next save). Export it from the Progress view first if you want to inspect it, then reset or import a backup.
- **Import refused**: the file is not JSON, is from a newer schema version, or is missing `schemaVersion`. The dialog lists the reasons.
- **Progress differs between devices**: progress is stored per user on the server, so it should follow you; if it does not, you are logged in as a different user.
- **A completed lesson shows "needs review"**: recent attempts on its concepts mostly failed; the dashboard explains which concept. Pass an exercise about it and the flag clears.

## Practice fixtures

- **Button disabled**: GM only.
- **"Incomplete"**: some fixture documents were deleted manually. Use **Reset** to recreate the missing ones or **Clean up** then **Create**.
- **Actor type error on creation**: your system has no `character`/`npc` actor types; the Academy picks the first available type and says so. Fixture data is minimal (name, image, flag) on non-dnd5e systems.

## Modules and integrations

- **Diagnostics says Midi-QOL is active but its API is missing**: the module is enabled but its global was not present yet, or the installed version does not expose a taught function. Reload once; if it persists, check the module version against COMPATIBILITY.md.
- **A Tier 7 exercise chooses the core path on a world with Midi-QOL**: exercises run in preview against the Academy's fixtures, not your world; the `practice-midi` fixture is the one with Midi-QOL present.

## Reporting a bug

Copy the diagnostics report (Diagnostics view), note the steps and the smallest macro that reproduces the problem, and open an issue. Include the Foundry build, system version, browser and the module version. Never include world data or settings values.
