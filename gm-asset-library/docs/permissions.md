# Permissions and safety

## Who can open the browser

World setting **Who can open the library**: Game Masters only (default), Trusted players and GMs, or
Everyone. Non-GM users additionally need Foundry's **Browse File Explorer** permission to see files; the
file source is reported as "unavailable" otherwise, and documents/compendiums are filtered by Foundry's
own visibility rules (`document.visible` / `testUserPermission("OBSERVER")`, `pack.visible`).

The access policy is enforced in `_canRender` of the browser and in the scene-control button, and the
module API refuses to open the browser for users outside the policy.

## Browsing never modifies anything

Indexing, searching, previewing, favoriting and organizing never change campaign documents or files.
Previews use detached media elements; audio and video are local to the viewing client and never go
through playlists or the broadcast audio API.

## Editing is deliberate

| Action | Target chosen by | Confirmation shows |
| --- | --- | --- |
| Use as Actor portrait / token image | Select dialog listing only Actors the user can modify | Actor name, current image, new image |
| Apply to controlled tokens | Tokens controlled on the canvas the user can modify | Count and names with current images |
| Create scene from image | Form (name, size, grid) | Explicit note that the grid value is a guess |
| Use as scene background | Select dialog of modifiable Scenes | Scene name, current background, new background |
| Create tile | Current scene (user must be able to modify it) | Scene name, size, position |
| Add to playlist | Select dialog / new playlist | Playlist name; the sound is added stopped |
| Activate scene | Current record | Scene name |
| Import compendium entry | Current record | Name, pack, document type |
| Delete collection / remove organization data | Current record | Count; assets themselves are untouched |

Every mutation goes through the document's own permission-checked API (`update`, `create`,
`createEmbeddedDocuments`, …). `canUserModify` is checked first so impossible actions are hidden.
Failures are reported as notifications and logged in diagnostics; nothing is retried silently.

## Shared vs personal data

* Personal (`user` scope): favorites, recents, saved searches, view preferences. Any user can write their own.
* Shared (`world` scope): collections, tags, aliases, notes, role corrections. Writing requires the
  SETTINGS_MODIFY permission (GMs by default). The UI hides these controls for other users and shows a
  clear notice if a write is attempted anyway.

## Files

The module never renames, moves, uploads or deletes files. It uses `FilePicker.browse` exactly like the
core File Picker and therefore sees exactly the same locations. There is no way for a client module to
look outside those roots and the module does not try.

## Safe content handling

* All user-controlled strings (file names, aliases, notes, tags, document names) are rendered through
  `textContent` or escaped with `foundry.utils.escapeHTML` before going into dialog HTML.
* SVG is displayed via `<img>` only (no inline SVG, no script execution).
* Journal text is converted to plain text with `DOMParser` for summaries and never injected as HTML.
* Text files are shown in a `<pre>` via `textContent`. Macros are listed, never executed.
* No data leaves the Foundry server: there is no telemetry, no remote service and no AI backend.
