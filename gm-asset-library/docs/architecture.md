# Architecture

GM Asset Library is a client-side Foundry VTT V14 module. It has no build step, no bundled third-party
libraries and no server component. Everything is plain ES modules loaded through `module.json`.

## Service graph

`scripts/core/services.js` builds one service graph per client on the `ready` hook:

| Service | File | Responsibility |
| --- | --- | --- |
| CatalogService | `catalog/catalog-service.js` | Holds every normalized record, runs adapters incrementally, tracks index state, caches the file list in IndexedDB |
| Source adapters | `adapters/*.js` | `FileAdapter` (FilePicker.browse), `WorldDocumentAdapter` (world collections), `CompendiumAdapter` (pack indexes) |
| MetadataService | `metadata/metadata-service.js` | Probes dimensions, durations and (optionally) file sizes; caches per URL |
| ThumbnailService | `metadata/thumbnail-service.js` | Generates downscaled thumbnails once per client, caches blobs, hands out reference-counted object URLs |
| SearchService | `search/search-service.js` + `query-parser.js` | Text search, operators, filters, stable sorting, facets |
| OrganizationService | `collections/organization-service.js` + `storage.js` | Favorites, recents, saved searches (user scope); collections, tags, aliases, notes, roles (world scope) |
| ActionService | `actions/action-service.js` + `foundry-actions.js` | Context-sensitive actions with permission checks and confirmation dialogs |
| HealthService | `health/health-service.js` | Duplicate candidates, world references, missing-reference report |
| PreviewService + renderers | `previews/*.js` | Single-playback media management, per-type preview renderers, error states |
| Applications | `applications/*.js` | `AssetBrowserApplication`, `PreviewViewerApplication`, `DiagnosticsApplication`, plus the virtual grid, card renderer, details panel, filter panel and sidebar |

## Asset record

Every adapter produces the same shape (`catalog/asset-record.js`):

```js
{
  id,                 // "file:<storage>:<decoded path>" | "doc:<uuid>" | "pack:<uuid>"
  kind,               // "file" | "document"
  source: { kind: "file"|"world"|"compendium", storage?, bucket?, root?, pack?, packLabel?, packageName? },
  type,               // image, audio, video, pdf, text, font, actor, item, scene, journal, playlist, table, cards, macro, adventure, other
  role, roleSource, mapType,   // image role inferred from folder names or set by the GM
  name, fileName, path, url, folder, extension,
  thumbnail, icon,
  documentName, documentType, uuid,
  meta: { width, height, size, duration, discoveredAt, modifiedAt },
  accessible,         // true | false | null (not checked)
  previewable
}
```

Source kinds are never collapsed: a world Actor, a compendium Actor and a token image file with the
same name are three records with three ids, three source labels and three different action sets.

## Rendering strategy

The browser renders its Handlebars shell once. Everything dynamic is plain DOM:

* `VirtualGrid` renders only the visible rows plus a buffer and pools card elements by record id, so a
  50,000-entry result set keeps about a hundred DOM nodes alive.
* `CardRenderer` fills a pooled card, requests a thumbnail from `ThumbnailService` (releasing it when the
  card is recycled) and lazily asks `MetadataService` for dimensions/duration.
* Selection state lives in the application; the grid only toggles classes.
* The details panel, filter panel and sidebar re-render themselves into fixed containers.

A full `render()` of the application rebuilds everything from state, so it stays safe, but the module
never relies on it for updates.

## Persistence

| Data | Where | Scope |
| --- | --- | --- |
| Favorites, recents, saved searches, view preferences | Foundry settings | `user` (per user, synced across devices) |
| Collections, tags, aliases, notes, role corrections | Foundry settings (one setting per kind) | `world` (shared, writable by users with SETTINGS_MODIFY) |
| Module configuration (roots, limits, policy) | Foundry settings | `world` |
| Probed metadata, generated thumbnails, last file list | IndexedDB (`gm-asset-library-cache`) | per browser; falls back to memory |

Each store is a versioned `{ version, data }` record validated on load (`collections/storage.js`).
Invalid data is reset, logged to diagnostics and kept in memory as `corrupt` for inspection instead
of crashing the browser.

## Extension points

`game.modules.get("gm-asset-library").api` exposes `open()`, `openDiagnostics()`, `reindex()`,
`search(text, options)`, `registerAdapter(adapter, { module })` and `registerAction(action, { module })`.
Adapters extend `adapters/base-adapter.js`; actions follow the shape documented in
`actions/action-service.js`. Registered extensions are listed in the diagnostics view. No third-party
integration is bundled; the core never references another module's API.
