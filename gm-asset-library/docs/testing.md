# Testing

## Automated tests

`npm test` runs vitest with a jsdom environment and a small Foundry shim (`tests/setup/foundry-shim.js`)
that provides `game`, `foundry.utils`, `Hooks`, `CONST`, a settings store with scope semantics, fake
documents, an in-memory `FilePicker.browse` over a directory tree and a synthetic file generator. The
shim reads `lang/en.json`, so tests assert on real English strings.

| Suite | File | Covers |
| --- | --- | --- |
| Records | `tests/catalog/asset-record.test.js` | Path normalization, type/role inference, world vs compendium identity, validation |
| File adapter | `tests/catalog/file-adapter.test.js` | Recursive walk, dedupe, exclusions, multiple roots/storages, directory failures, file limit, cancellation, permission availability, verify |
| Document adapters | `tests/catalog/document-adapters.test.js` | Per-type representations (Actor, Scene, Journal, Playlist + sounds, Macro), visibility filtering, per-document failure isolation, compendium index fields, hidden/failed packs |
| Catalog | `tests/catalog/catalog-service.test.js` | Incremental merge and events, re-scan removal with metadata preservation, adapter failure isolation, interrupted scans, cache round-trip, live upsert/remove |
| Query parser | `tests/search/query-parser.test.js` | Words, phrases, negation, operators, unknown operators, comparisons |
| Search | `tests/search/search-service.test.js` | Any-order case-insensitive matching across fields, aliases/tags/notes, every operator, category/filter/scope combination, stable sorting with unknown group, facets, aspect matching |
| Persistence | `tests/persistence/organization.test.js` | Favorites/recents/saved searches (user), collections CRUD/reorder/duplicate/delete, tags/aliases/notes/roles, orphans and forget, player permission blocking, change events, corrupt-data reset, migration, serialized writes |
| Health | `tests/unit/health.test.js` | Duplicate signals and labels, reference map with scope and encoded paths, missing vs unchecked classification |
| Metadata | `tests/unit/metadata.test.js` | Path/format helpers, folder-only classification, memory cache fallback, probe caching and inaccessible marking, cross-origin skip, thumbnail fallbacks, generation, caching and reference counting |
| Actions | `tests/unit/actions.test.js` | Availability per record type and selection size, clipboard payloads, actor portrait/token with scripted pick+confirm (cancel leaves data untouched), scene background replace, scene creation form, open/view/activate, organization actions, failure reporting, player permission handling |
| UI | `tests/unit/ui.test.js` | Virtual grid windowing/recycling/scrolling/layout, card renderer escaping and states, renderer selection, image preview toolbar, document/fallback/error renderers, HTML stripping, single-playback preview service |
| Integration | `tests/integration/services.test.js` | Full service graph with the real adapters over a mocked FilePicker/world/pack: indexing, API search, extension registration, settings-driven roots and includes, player without file permission |
| Benchmark | `tests/integration/benchmark.test.js` | 50,000 synthetic records (see below) |

Result on 2026-10-14: **13 files, 79 tests, all passing** (`npm test`, ~4 s).

## Benchmark (synthetic, 50,000 records)

Environment: Node 22, vitest 5 with jsdom, Linux container (shared CPU). Numbers are from a single run
of `tests/integration/benchmark.test.js` and vary with hardware; thresholds in the test are generous.

| Operation | Time |
| --- | --- |
| Create 50,000 normalized records | 763 ms |
| Insert into catalog | 77 ms |
| First search `goblin dragon` (builds search text) | 247 ms |
| Repeated search (cached search text) | 26 ms |
| Search with operators `type:image role:map -tokens width:>2000` | 18 ms |
| Filter by type + min width, sort by size | 23 ms |
| Sort 50,000 records by name | 41 ms |
| Facet counts | 39 ms |
| Duplicate candidate detection | 213 ms |
| Select all 50,000 | 21 ms |
| Virtual grid: set items | 49 ms |
| Virtual grid: 50 scroll jumps across the list | 202 ms, fewer than 120 live cards at any time |
| Save file catalog to cache (memory fallback) | 112 ms |

Searching is debounced in the browser (180 ms), so with these figures the interface stays responsive
on catalogs of this size. The file limit setting defaults to 50,000 for that reason; larger libraries
were not measured and the module does not claim a higher ceiling.

Not measured here: real thumbnail decoding and network listing speed, which depend on the server and
browser. Thumbnails are generated once per client and cached in IndexedDB.

## What could not be tested in this environment

There was no Foundry V14 server available, so the following were verified against the V14 API
documentation and exercised only through mocks:

- `ApplicationV2`/`HandlebarsApplicationMixin` rendering of the browser, viewer and diagnostics windows.
- `FilePicker.browse` against a real data directory and S3.
- `ContextMenu` (V14 `label`/`onClick`/`visible` entries), `DialogV2`, the scene-control button, keybinding registration and the `user` settings scope.
- Live document hooks and `updateSetting` reloads.
- Drag-and-drop into sheet image fields and onto the canvas.
- Actual browser decoding of each media format and IndexedDB persistence.

## Manual release checklist (run in a real Foundry V14 world)

- [ ] Install from the manifest, enable the module, reload; no console errors on `init`/`ready`.
- [ ] Scene-control button, Ctrl+Shift+L and `api.open()` open one browser window; reopening focuses it.
- [ ] First open scans; status bar shows progress; *Stop scan* keeps results and reports "stopped early".
- [ ] Files from `data:` roots, world documents and compendium entries appear with correct source badges.
- [ ] Thumbnails load; broken image shows the fallback icon and *Missing*; SVG icons display.
- [ ] Global search: multi-word, phrase, negation, `type:`, `tag:`, unknown operator warning.
- [ ] Filters and sorts change results; unknown-size assets group at the end when sorting by size.
- [ ] Grid ↔ list toggle, thumbnail slider, sidebar/details toggles persist after reload (user settings).
- [ ] Preview viewer: zoom/pan/fit/actual size, grid overlay toggle, prev/next, audio plays locally only (confirm a second client hears nothing), video is muted, PDF renders, text shows as text.
- [ ] Closing the viewer stops audio; closing the browser releases everything (reopen: no duplicate sounds, no duplicate context menus).
- [ ] Favorites, collections (create, rename, reorder, duplicate, delete), tags, alias, note, role survive a reload and are visible to a second GM.
- [ ] Set Actor portrait: pick dialog lists only modifiable actors; cancel leaves the actor unchanged; confirm updates it.
- [ ] Create scene from image creates a scene with the chosen size and opens its config; set scene background shows old → new and replaces only on confirm.
- [ ] Create tile adds a tile to the current scene; add to playlist adds a stopped sound.
- [ ] Import compendium entry creates a world document.
- [ ] Drag an image card into an Actor sheet image field (path lands in the input); drag an Actor card onto the canvas (token is created).
- [ ] As a player without *Browse File Explorer*: files unavailable, only visible documents listed, shared organization edits refused with a notice; with access policy "GM only" the button is hidden and `api.open()` warns.
- [ ] Diagnostics window shows versions, sources, failures; *Copy report* works; *Clear caches* empties thumbnails and the file list.
- [ ] No campaign document changed without an explicit confirmation during the whole checklist.
