/**
 * Path helpers for file assets. Paths handed out by FilePicker.browse are URL-encoded relative
 * paths (or absolute URLs for S3/remote storage). We keep the original string as the browser-loadable
 * `url` and a decoded, normalized `path` for display and matching.
 */

export function decodePath(p) {
  if ( typeof p !== "string" ) return "";
  try { return decodeURIComponent(p); } catch { return p; }
}

export function isAbsoluteUrl(p) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(p ?? "") || /^(?:data|blob):/i.test(p ?? "");
}

/** Normalize a decoded path: forward slashes, no leading "./", no duplicate slashes, no trailing slash. */
export function normalizePath(p) {
  let s = decodePath(p).replace(/\\/g, "/");
  if ( isAbsoluteUrl(s) ) {
    const m = s.match(/^([a-z][a-z0-9+.-]*:\/\/[^/]+)(\/.*)?$/i);
    if ( m ) return m[1] + (m[2] ?? "").replace(/\/{2,}/g, "/").replace(/\/+$/, "");
    return s;
  }
  s = s.replace(/^\.\//, "").replace(/\/{2,}/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  return s;
}

export function basename(p) {
  const s = normalizePath(p);
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

export function dirname(p) {
  const s = normalizePath(p);
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(0, i) : "";
}

export function extension(p) {
  const name = basename(p).split("?")[0];
  const i = name.lastIndexOf(".");
  if ( i <= 0 ) return "";
  return name.slice(i + 1).toLowerCase();
}

/** The filename without its extension, with separators turned into spaces for display/search. */
export function displayName(p) {
  const name = basename(p).split("?")[0];
  const i = name.lastIndexOf(".");
  const stem = i > 0 ? name.slice(0, i) : name;
  return stem.replace(/[_\-.]+/g, " ").replace(/\s{2,}/g, " ").trim() || name;
}

/** Folder segments of a path (lower-cased) for keyword classification. */
export function folderSegments(p) {
  const dir = dirname(p);
  if ( !dir ) return [];
  const withoutOrigin = dir.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\/?/i, "");
  return withoutOrigin.split("/").filter(Boolean).map(s => s.toLowerCase());
}

/** Join path parts safely. */
export function joinPath(...parts) {
  return normalizePath(parts.filter(p => p !== undefined && p !== null && p !== "").join("/"));
}

/** Does `path` live under `root` (both normalized)? An empty root matches everything. */
export function isUnder(path, root) {
  const p = normalizePath(path);
  const r = normalizePath(root);
  if ( !r ) return true;
  return p === r || p.startsWith(`${r}/`);
}
