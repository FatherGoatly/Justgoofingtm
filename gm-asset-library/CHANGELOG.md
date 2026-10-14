# Changelog

## 0.1.0 — 2026-10-14

Initial release for Foundry VTT V14 (verified against the 14.368 API documentation).

### Added
- Unified catalog of files (FilePicker-visible user data, core data, S3), world documents (Actors, Items, Scenes, Journals, Playlists and their sounds, Roll Tables, Cards, Macros) and compendium indexes, with a normalized record that keeps the three source kinds distinct.
- Visual-first browser (ApplicationV2): virtualized thumbnail grid and list view, adjustable thumbnail size, navigation sidebar with live counts, details inspector, filter panel with facets, status bar, keyboard navigation and multi-selection (click, Ctrl/Cmd, Shift, select visible, select all matching).
- Incremental, cancellable indexing with per-source status, exclusion list, file limit, cached file list (IndexedDB) and live updates from document hooks.
- Search engine with word/phrase/negation matching over names, paths, folders, aliases, tags, notes, types and sources; operators (`type:`, `source:`, `folder:`, `tag:`, `role:`, `map:`, `doc:`, `pack:`, `ext:`, `favorite:`, `is:`, `width:`, `height:`, `size:`, `duration:`, `aspect:`, `in:`); unknown operators warned, never dropped. Stable sorting with unknown values grouped last. Saved searches.
- Preview viewer: image zoom/pan/fit/actual size, checkerboard, optional grid overlay clearly labelled as an overlay, prev/next through the result set; local-only audio and muted video previews with single-playback policy; PDF and text previews; document previews; explicit error states with retry and copy-path.
- Organization: personal favorites, recents and saved searches (user scope); shared collections, tags, aliases, notes and image role corrections (world scope), with validation and migration-ready versioned stores. Missing entries are shown, never silently removed.
- Foundry workflows with explicit targets and confirmations: Actor portrait/token image, controlled tokens, create scene from image, replace scene background, create tile, add to playlist (stopped), import compendium entry, open/view/activate documents, copy path/URL/UUID/link, drag-and-drop payloads.
- Asset health: duplicate candidates (exact same path; same size+dimensions; same filename) labelled by confidence, world reference map with an explicit scope, missing-vs-unchecked reference report, file verification.
- Diagnostics window: versions, permissions, per-source status and failures, caches, counters, unsupported formats, registered extensions, recent log; copy report, clear caches.
- Public API for other modules: `open`, `openDiagnostics`, `reindex`, `search`, `registerAdapter`, `registerAction`.
- Settings split into world (GM configuration), user (personal preferences) scopes with explanatory hints.
- Test suite (vitest + jsdom) covering records, adapters, catalog, search, persistence, health, metadata, thumbnails, actions, virtual grid, renderers, service integration and a 50,000-record benchmark.

### Known limitations
- No live Foundry V14 instance was available during development; APIs were verified against the published V14 documentation and exercised with mocks. The manual release checklist (docs/testing.md) must be run in a real world before tagging a release.
- Dimensions, durations and sizes are measured lazily (when shown or selected); dimension/duration/size filters and sorts only apply to measured assets.
- No content-aware recognition: search covers names, paths, tags, notes and verified metadata only.
- No file management (rename, move, delete, upload). Cleanup is limited to removing organization data for missing entries.
- S3 and third-party hosting (The Forge) are untested; cross-origin files get no generated thumbnails or size probes.
- Compendium content is not searched for file references in the usage report.
