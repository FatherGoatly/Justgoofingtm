# Supported sources and compatibility

Verified against the public Foundry VTT **V14 API documentation (14.368 Stable)**. No live Foundry
instance was available in the build environment, so "verified" below means the API signatures and data
shapes were checked against the documentation and the module's logic was exercised with mocks that
reproduce those shapes. A live run in a V14 world remains part of the manual release checklist.

| Source | API used | Status | Limits |
| --- | --- | --- | --- |
| User data files | `foundry.applications.apps.FilePicker.implementation.browse(source, target, {bucket})` | Verified by docs, mock-tested | Only what the File Picker can list. Requires the FILES_BROWSE permission. `modules` and `systems` folders are excluded by default. |
| Core "public" files | same, source `public` | Verified by docs | Off by default (`public:icons` is a useful root). |
| S3 | same, source `s3` with `bucket` | Verified by docs, **untested** | Listed only when the server is configured for S3. Thumbnails are not generated for cross-origin files (CORS), sizes are not probed. |
| The Forge / other hosting | — | Not tested | Hosts that replace the FilePicker may list files differently. |
| World documents | `game.actors/items/scenes/journal/playlists/tables/cards/macros` | Verified by docs, mock-tested | Only documents the user can observe. Playlist sounds are cataloged as audio records; journal pages as children of the journal entry. |
| Compendium entries | `pack.getIndex({fields})`, `pack.visible`, `pack.getUuid(id)` | Verified by docs, mock-tested | Only the index is loaded. Index fields per type: Actor `img,type,prototypeToken.texture.src`; Item `img,type`; Scene `thumb,background.src`; RollTable/Macro/Cards/Adventure `img`. |
| External URLs | — | Not supported | Not cataloged. |

## File types

| Type | Extensions | Preview |
| --- | --- | --- |
| Image | apng avif bmp gif jpeg jpg png svg tiff webp | Zoom/pan viewer, checkerboard, optional grid overlay. SVG shown via `<img>` (scripts never run). Browser decides which formats decode (tiff/avif may not). |
| Audio | aac flac m4a mid mp3 ogg opus wav webm | HTML audio element, local playback only, single-player policy, loop toggle. |
| Video | m4v mp4 ogv webm | HTML video element, muted, never autoplays. `webm` in audio-named folders (music/sfx/ambience…) is treated as audio. |
| PDF | pdf | Browser PDF viewer in an iframe. |
| Text | txt md markdown json yml yaml csv xml html | Fetched and shown as plain text (never rendered as HTML). Capped at 200 KB. |
| Font | ttf otf woff woff2 | Icon and metadata only. |
| Other | anything else | Icon and metadata only. |

## Foundry APIs relied upon (V14)

* `foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin` (`_onFirstRender`, `_onRender`, `_preClose`, `DEFAULT_OPTIONS.actions`, `window.controls`).
* `foundry.applications.api.DialogV2.confirm / prompt` with `callback(event, button)`.
* `foundry.applications.ux.ContextMenu` with V14 entry shape `{ label, icon, onClick(target), visible(target), group, classes }` and options `{ fixed: true, jQuery: false }`.
* `getSceneControlButtons` hook with the record-based `controls.tokens.tools[name] = { name, title, icon, button, order, onChange, visible }` structure.
* `game.settings.register` with scopes `world`, `user` and `client`.
* `game.keybindings.register`.
* `game.clipboard.copyPlainText`, `foundry.utils.getRoute`, `foundry.utils.escapeHTML`, `foundry.utils.getDocumentClass`, `fromUuid`.
* Document APIs: `Actor#update({img})`, `Actor#update({"prototypeToken.texture.src"})`, `Scene.create`, `Scene#update({"background.src"})`, `Scene#view`, `Scene#activate`, `Scene#createEmbeddedDocuments("Tile")`, `Scene#updateEmbeddedDocuments("Token")`, `Playlist#createEmbeddedDocuments("PlaylistSound")`, `WorldCollection#importFromCompendium(pack, id)`.
* Hooks `create/update/delete<Document>` for live catalog updates and `updateSetting` for shared-store reloads.

Nothing from V11–V13 was copied blindly: the context-menu entry shape and scene-control structure
both changed in V13/V14 and the module uses the V14 forms.
