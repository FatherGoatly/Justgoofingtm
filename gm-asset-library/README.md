# GM Asset Library

A Foundry VTT **V14** module that gives Game Masters one visual-first window for every creative asset in
their environment: image, map, token, portrait, tile, audio, video and document **files**, the **world's
documents** (Actors, Items, Scenes, Journals, Playlists, Roll Tables, Cards, Macros) and **compendium**
content — searchable, previewable, organizable and usable in Foundry's own workflows.

Find the right asset by *seeing* it, searching it or filtering it — not by remembering a filename.

## Features

- **Unified catalog** — files reachable through the File Picker (user data, core data, S3 when configured), world documents and compendium indexes, each clearly labelled with its source. A world Actor, a compendium Actor and a token image are never confused.
- **Visual browser** — virtualized thumbnail grid (tested with 50,000 entries) or list view, adjustable thumbnail size, navigation with live counts, details inspector, filter panel with facets, full keyboard navigation and multi-selection.
- **Search** — words in any order, phrases, negation and operators such as `type:image tag:undead role:token -folder:old width:>2000`. Unknown operators are warned about, never silently dropped. Saved searches. Search covers names, paths, aliases, tags, notes and verified metadata; it does not pretend to recognise image contents.
- **Previews** — image viewer with zoom, pan, fit, actual size, checkerboard and an optional grid overlay that is labelled as an overlay (the module does not guess your map's grid). Local-only audio and muted video previews with a single-playback policy, PDF and text previews, document previews, clear error states with retry.
- **Organization** — personal favorites, recents and saved searches; shared collections, tags, aliases and notes; correctable image roles (map, token, portrait, tile, effect, handout) and map types. Files are never renamed or moved.
- **Foundry workflows** — set an Actor's portrait or token image, apply an image to controlled tokens, create a scene from a map, replace a scene background, create a tile, add a sound to a playlist (stopped), import a compendium entry, open/view/activate documents, copy path, browser URL, UUID or `@UUID` link, drag paths into image fields and documents onto the canvas. Every change names its target and asks for confirmation.
- **Asset health** — duplicate candidates labelled by signal (same path, same size and dimensions, same filename), "where is this used" with an explicit scope, missing-vs-unchecked reference report, file verification.
- **Diagnostics** — versions, permissions, per-source status and failures, caches, counters, unsupported formats, registered extensions, recent log.
- **Safe by design** — browsing never modifies anything; GM-only by default; respects Foundry's document visibility, compendium visibility and file permissions; no telemetry, no remote service, no third-party dependency.

## Installation

Manifest URL (releases): `https://github.com/FatherGoatly/Justgoofingtm/releases/latest/download/gm-asset-library.module.json`

Or build the zip yourself from this directory:

```bash
npm install
npm test
npm run validate:manifest
npm run package      # dist/gm-asset-library.zip + dist/gm-asset-library.module.json
```

Requirements: Foundry VTT 14.368 or later. No game system dependency.

The verified Foundry build, dev dependencies and releases are maintained automatically for both modules in this repository; see [MAINTENANCE.md](../MAINTENANCE.md).

## Usage

Open the library with the **images button in the Tokens scene controls**, the keybinding
**Ctrl+Shift+L**, or `game.modules.get("gm-asset-library").api.open()`.

1. The first open scans the configured file roots (default: all user data except `modules` and `systems`), world documents and compendiums. Results appear while the scan runs; you can stop it and keep what was found. Later opens show the cached file list instantly and refresh documents; press **Refresh** to rescan files.
2. Pick a category or type a search. Use the filter panel for facets, dimensions, duration and size.
3. Select an asset to inspect it. Double-click or press Enter for the large preview; use ←/→ to step through results.
4. Use the actions in the details panel or the context menu. Actions that change campaign data (portraits, tokens, scenes, tiles, playlists) always show the target and ask for confirmation.
5. Organize with favorites (star), collections (sidebar “+” or *Add to collection*), tags, aliases and notes. Save a search with the bookmark button.

See `docs/search-syntax.md` for operators, `docs/permissions.md` for the access model and
`docs/troubleshooting.md` for common questions.

## Settings

World (GM): access policy, file roots, excluded folders, include world documents/compendiums, compendium
document types, maximum files, scan concurrency, rescan on open, media previews, thumbnail generation,
file size probing, debug logging.

Personal (per user): view mode, thumbnail size, sidebar and details visibility, sort order, search scope,
metadata on cards. Favorites, recents and saved searches are personal too; collections, tags, aliases,
notes and roles are shared with the world and need the *Modify Configuration Settings* permission.

## Status and honesty notes

- Version 0.1.0. All milestones have working code and automated tests: 79 tests passing (vitest + jsdom), including a 50,000-record benchmark (`docs/testing.md`).
- APIs were verified against the public **Foundry V14 (14.368) API documentation**; no live V14 instance was available in the build environment. The manual checklist in `docs/testing.md` must be run in a real world before a release is tagged.
- Not implemented on purpose: content-aware image recognition, file renaming/moving/deleting, remote AI services. See `CHANGELOG.md` for the full list of known limitations.

## Documentation

`docs/architecture.md`, `docs/supported-sources.md`, `docs/permissions.md`, `docs/search-syntax.md`,
`docs/testing.md`, `docs/troubleshooting.md`.

## License

MIT — see `LICENSE`.
