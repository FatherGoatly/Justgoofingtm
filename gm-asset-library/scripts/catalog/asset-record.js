import { AMBIGUOUS_EXTENSIONS, ASSET_TYPE, DOCUMENT_TYPES, EXTENSIONS, SOURCE_KIND, TYPE_ICONS } from "../core/constants.js";
import { disambiguateType, inferRoleFromPath } from "../metadata/classification.js";
import { basename, dirname, displayName, extension, normalizePath } from "../utilities/paths.js";

/**
 * The normalized catalog record shared by every source adapter.
 *
 * @typedef {object} AssetRecord
 * @property {string} id                 Stable identity: "file:<storage>:<path>", "doc:<uuid>", "pack:<uuid>"
 * @property {"file"|"document"} kind
 * @property {object} source             { kind, storage?, bucket?, root?, pack?, packLabel?, packageName? }
 * @property {string} type               One of ASSET_TYPE
 * @property {string|null} role          One of ASSET_ROLE or null
 * @property {"inferred"|"user"|null} roleSource
 * @property {string|null} mapType
 * @property {string} name               Display name (filename stem or document name)
 * @property {string|null} path          Decoded path for files, null for documents
 * @property {string|null} url           Browser-loadable URL for files (as returned by FilePicker)
 * @property {string} folder             Directory path (files) or Foundry folder name (documents)
 * @property {string} extension
 * @property {string|null} thumbnail     Image URL to use as thumbnail, or null
 * @property {string} icon               Fallback icon classes
 * @property {string|null} documentName  e.g. "Actor"
 * @property {string|null} documentType  e.g. "npc"
 * @property {string|null} uuid
 * @property {object} meta               { width, height, size, duration, discoveredAt, modifiedAt }
 * @property {boolean|null} accessible   null = not checked
 * @property {boolean} previewable
 */

const EXT_TO_TYPE = new Map();
for ( const [type, exts] of Object.entries(EXTENSIONS) ) for ( const e of exts ) if ( !EXT_TO_TYPE.has(e) ) EXT_TO_TYPE.set(e, type);

export function typeForExtension(ext, path="") {
  const e = String(ext ?? "").toLowerCase();
  if ( AMBIGUOUS_EXTENSIONS[e] ) return disambiguateType(AMBIGUOUS_EXTENSIONS[e], path);
  return EXT_TO_TYPE.get(e) ?? ASSET_TYPE.OTHER;
}

export function fileRecordId(storage, path) { return `file:${storage}:${normalizePath(path)}`; }

export function documentRecordId(uuid) { return `doc:${uuid}`; }

export function compendiumRecordId(uuid) { return `pack:${uuid}`; }

/**
 * Build a record for a file discovered through FilePicker.browse.
 * @param {object} data   { url, storage, bucket, root, discoveredAt }
 */
export function createFileRecord({ url, storage="data", bucket=null, root="", discoveredAt=Date.now() }) {
  const path = normalizePath(url);
  const ext = extension(path);
  const type = typeForExtension(ext, path);
  const { role, mapType } = type === ASSET_TYPE.IMAGE ? inferRoleFromPath(path) : { role: null, mapType: null };
  return {
    id: fileRecordId(storage, path),
    kind: "file",
    source: { kind: SOURCE_KIND.FILE, storage, bucket, root },
    type,
    role,
    roleSource: role ? "inferred" : null,
    mapType,
    name: displayName(path),
    fileName: basename(path),
    path,
    url,
    folder: dirname(path),
    extension: ext,
    thumbnail: type === ASSET_TYPE.IMAGE ? url : null,
    icon: TYPE_ICONS[type] ?? TYPE_ICONS.other,
    documentName: null,
    documentType: null,
    uuid: null,
    meta: { width: null, height: null, size: null, duration: null, discoveredAt, modifiedAt: null },
    accessible: null,
    previewable: [ASSET_TYPE.IMAGE, ASSET_TYPE.AUDIO, ASSET_TYPE.VIDEO, ASSET_TYPE.PDF, ASSET_TYPE.TEXT].includes(type)
  };
}

/**
 * Build a record for a world document.
 * @param {object} data   { uuid, documentName, documentType, name, img, folder, discoveredAt, extra }
 */
export function createDocumentRecord({ uuid, documentName, documentType=null, name, img=null, folder="", path=null, discoveredAt=Date.now(), extra={} }) {
  const def = DOCUMENT_TYPES[documentName] ?? null;
  const type = extra.type ?? def?.type ?? ASSET_TYPE.OTHER;
  const thumb = img && typeof img === "string" ? img : null;
  return {
    id: documentRecordId(uuid),
    kind: "document",
    source: { kind: SOURCE_KIND.WORLD },
    type,
    role: null,
    roleSource: null,
    mapType: null,
    name: name ?? "",
    fileName: null,
    path,
    url: path,
    folder: folder ?? "",
    extension: path ? extension(path) : "",
    thumbnail: thumb,
    icon: def?.icon ?? TYPE_ICONS[type] ?? TYPE_ICONS.other,
    documentName,
    documentType,
    uuid,
    meta: { width: null, height: null, size: null, duration: null, discoveredAt, modifiedAt: extra.modifiedAt ?? null },
    accessible: true,
    previewable: Boolean(thumb) || type === ASSET_TYPE.AUDIO,
    ...pickExtra(extra)
  };
}

/**
 * Build a record for a compendium index entry.
 * @param {object} data   { uuid, pack, packLabel, packageName, documentName, documentType, name, img, discoveredAt }
 */
export function createCompendiumRecord({ uuid, pack, packLabel, packageName=null, documentName, documentType=null, name, img=null, folder="", discoveredAt=Date.now(), extra={} }) {
  const def = DOCUMENT_TYPES[documentName] ?? null;
  const type = def?.type ?? ASSET_TYPE.OTHER;
  const thumb = img && typeof img === "string" ? img : null;
  return {
    id: compendiumRecordId(uuid),
    kind: "document",
    source: { kind: SOURCE_KIND.COMPENDIUM, pack, packLabel, packageName },
    type,
    role: null,
    roleSource: null,
    mapType: null,
    name: name ?? "",
    fileName: null,
    path: null,
    url: null,
    folder: folder ?? "",
    extension: "",
    thumbnail: thumb,
    icon: def?.icon ?? TYPE_ICONS[type] ?? TYPE_ICONS.other,
    documentName,
    documentType,
    uuid,
    meta: { width: null, height: null, size: null, duration: null, discoveredAt, modifiedAt: null },
    accessible: true,
    previewable: Boolean(thumb),
    ...pickExtra(extra)
  };
}

function pickExtra(extra) {
  const out = {};
  if ( extra.children ) out.children = extra.children;
  if ( extra.references ) out.references = extra.references;
  if ( extra.summary ) out.summary = extra.summary;
  if ( extra.parentUuid ) out.parentUuid = extra.parentUuid;
  return out;
}

/** Validate the shape of a record (used by tests and when loading cached catalogs). */
export function isValidRecord(r) {
  return Boolean(r && typeof r.id === "string" && r.id.length && r.source && typeof r.source.kind === "string" && typeof r.type === "string" && typeof r.name === "string" && r.meta && typeof r.meta === "object");
}

/** A short human label describing the source of a record. */
export function sourceLabel(r) {
  if ( !r ) return "";
  switch ( r.source.kind ) {
    case SOURCE_KIND.FILE: return r.source.storage === "public" ? "Core data" : r.source.storage === "s3" ? `S3${r.source.bucket ? ` (${r.source.bucket})` : ""}` : "User data";
    case SOURCE_KIND.WORLD: return "World";
    case SOURCE_KIND.COMPENDIUM: return r.source.packLabel ? `Compendium: ${r.source.packLabel}` : "Compendium";
    default: return r.source.kind;
  }
}
