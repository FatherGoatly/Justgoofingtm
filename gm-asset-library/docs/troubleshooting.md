# Troubleshooting

**The library button is missing.** Only users allowed by the *Who can open the library* world setting see
it. The button lives in the Tokens control group; the keybinding (default Ctrl+Shift+L) and
`game.modules.get("gm-asset-library").api.open()` also open the browser.

**"Not available: Files".** You lack the *Browse File Explorer* permission, or the FilePicker API could
not be reached. Documents and compendiums still work.

**Scan stops with "File limit reached".** Raise *Maximum files per scan* or narrow *File roots to scan*
(for example `data:assets, data:worlds/my-world`). The `modules` and `systems` folders are excluded by
default because they contain thousands of package files.

**A folder is missing from the catalog.** Check the excluded folders setting and the diagnostics view
(header control of the browser): it lists every directory that failed to list and why. Files visible
through the File Picker but not here are a bug — copy the diagnostics report when filing one.

**Thumbnails are slow the first time.** Thumbnails are generated once per browser and cached in
IndexedDB. If IndexedDB is unavailable (private window, storage disabled) the diagnostics view shows
"memory only" and thumbnails are regenerated on each session. You can turn generation off in settings.

**An image shows as "Missing".** The browser could not load it. Use *Verify file* to re-check. Causes:
the file was moved or deleted, a permission issue, or a remote host blocking the request. A file that
*cannot be checked* (remote, outside the scanned roots) is reported as "unchecked", not "missing".

**Changes to tags or collections are refused.** Shared organization data is stored in world settings
and needs the *Modify Configuration Settings* permission.

**The browser reopened with duplicated behaviour or sounds kept playing.** This should not happen: the
browser releases its listeners, thumbnails and media on close. If it does, please copy the diagnostics
report and file an issue.

**Resetting.** *Clear caches* in the diagnostics view removes thumbnails, probed metadata and the cached
file list. Organization data lives in settings (`gm-asset-library.store*`) and is not affected.
