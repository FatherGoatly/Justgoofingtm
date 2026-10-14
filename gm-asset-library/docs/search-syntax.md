# Search syntax

Search matches **verified metadata only**: names, file names, paths, folder names, aliases, tags, notes,
asset/document types, source labels and compendium names. It does not look at pixels. A search for
`red dragon` finds files, aliases, tags or documents that contain those words; it cannot find a dragon in
an image named `IMG_8492.webp` unless you tag or alias it.

* Words are AND-ed and matched case-insensitively, in any order, as substrings: `forest battle map`.
* `"quoted phrase"` must appear contiguously.
* `-word` excludes matches. `-tag:undead` excludes a tag.
* `key:value` applies an operator; `key:a,b` accepts any of several values; values may be quoted.
* Unknown operators are **not** dropped silently: they are searched as plain text and a warning is shown in the status bar.

| Operator | Values | Example |
| --- | --- | --- |
| `type:` | image, audio, video, pdf, text, font, actor, item, scene, journal, playlist, table, cards, macro, adventure, other | `type:audio` |
| `source:` | file, world, compendium | `source:compendium` |
| `storage:` | data, public, s3 | `storage:public` |
| `folder:` | text contained in the folder path | `folder:maps/dungeon` |
| `ext:` | file extension | `ext:webp,png` |
| `tag:` | tag name (any of) | `tag:undead` |
| `collection:` | collection name | `collection:"Session 01"` |
| `pack:` | compendium label or id contains | `pack:srd` |
| `role:` | map, token, portrait, tile, effect, handout, none | `role:token` |
| `map:` | battle, dungeon, city, interior, exterior, regional, unknown | `map:battle` |
| `doc:` | Foundry document type | `doc:Scene` |
| `favorite:` | true / false | `favorite:true` |
| `is:` | favorite, missing, unchecked, nopreview, duplicate, tagged, untagged, animated, file, document | `is:untagged type:image` |
| `width:` / `height:` | comparison in px | `width:>=4000` |
| `size:` | comparison with optional unit (kb, mb, gb) | `size:>5mb` |
| `duration:` | comparison in seconds or m:ss | `duration:>2:00` |
| `aspect:` | landscape, portrait, square, or a ratio | `aspect:16:9` |
| `in:` | category id: all, images, maps, tokens, portraits, tiles, audio, video, documents, foundry, compendiums | `in:maps` |

Dimension, size and duration operators only match assets whose metadata has been measured (shown or
selected at least once, or read from the metadata cache). Unmeasured assets never match them.

Saved searches store the text, category, filters and sort order and can be renamed, updated with the
current search, duplicated and deleted from their context menu in the sidebar.
