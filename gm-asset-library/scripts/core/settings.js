import { DEFAULT_THUMBNAIL_SIZE, MODULE_ID, SCAN_LIMITS, STORAGE_SCHEMA_VERSION, VIEW_MODE } from "./constants.js";
import diagnostics from "./diagnostics.js";

/**
 * Setting definitions.
 *
 * Scopes (all documented in the settings UI hints):
 *  - "world":  GM-controlled module configuration shared by everyone (access policy, scan roots, limits).
 *  - "user":   personal preferences and personal organization data (favorites, recents, saved searches, view).
 *              Stored per User in the world database, so they follow the user between devices.
 *  - "client": nothing at the moment; thumbnail/metadata caches live in IndexedDB instead.
 *
 * Organization data stores (collections, tags, aliases, notes, roles) are registered here too but are
 * hidden from the config UI; see collections/storage.js.
 */
export const SETTINGS = Object.freeze({
  // World (GM) configuration
  ACCESS_POLICY: "accessPolicy",
  FILE_ROOTS: "fileRoots",
  EXCLUDED_FOLDERS: "excludedFolders",
  INCLUDE_WORLD_DOCUMENTS: "includeWorldDocuments",
  INCLUDE_COMPENDIUMS: "includeCompendiums",
  COMPENDIUM_TYPES: "compendiumTypes",
  MAX_FILES: "maxFiles",
  SCAN_CONCURRENCY: "scanConcurrency",
  AUTO_INDEX: "autoIndex",
  MEDIA_PREVIEWS: "mediaPreviews",
  GENERATE_THUMBNAILS: "generateThumbnails",
  PROBE_FILE_SIZES: "probeFileSizes",
  DEBUG: "debug",
  // User preferences
  VIEW_MODE: "viewMode",
  THUMBNAIL_SIZE: "thumbnailSize",
  SHOW_SIDEBAR: "showSidebar",
  SHOW_DETAILS: "showDetails",
  SORT: "sort",
  SEARCH_SCOPE: "searchScope",
  SHOW_CARD_META: "showCardMeta",
  // Data stores (hidden)
  STORE_FAVORITES: "storeFavorites",
  STORE_RECENTS: "storeRecents",
  STORE_SAVED_SEARCHES: "storeSavedSearches",
  STORE_COLLECTIONS: "storeCollections",
  STORE_TAGS: "storeTags",
  STORE_ALIASES: "storeAliases",
  STORE_NOTES: "storeNotes",
  STORE_ROLES: "storeRoles"
});

export const ACCESS_POLICIES = Object.freeze({ gm: "gm", trusted: "trusted", all: "all" });

const DEFINITIONS = [
  { key: SETTINGS.ACCESS_POLICY, scope: "world", config: true, type: String, default: ACCESS_POLICIES.gm, choices: { gm: "GMAL.Settings.AccessPolicy.GM", trusted: "GMAL.Settings.AccessPolicy.Trusted", all: "GMAL.Settings.AccessPolicy.All" } },
  { key: SETTINGS.FILE_ROOTS, scope: "world", config: true, type: String, default: "data:" },
  { key: SETTINGS.EXCLUDED_FOLDERS, scope: "world", config: true, type: String, default: "modules, systems" },
  { key: SETTINGS.INCLUDE_WORLD_DOCUMENTS, scope: "world", config: true, type: Boolean, default: true },
  { key: SETTINGS.INCLUDE_COMPENDIUMS, scope: "world", config: true, type: Boolean, default: true },
  { key: SETTINGS.COMPENDIUM_TYPES, scope: "world", config: true, type: String, default: "Actor, Item, Scene, JournalEntry, RollTable, Playlist, Macro, Cards, Adventure" },
  { key: SETTINGS.MAX_FILES, scope: "world", config: true, type: Number, default: 50_000, range: { min: 1000, max: SCAN_LIMITS.MAX_FILES, step: 1000 } },
  { key: SETTINGS.SCAN_CONCURRENCY, scope: "world", config: true, type: Number, default: SCAN_LIMITS.CONCURRENCY, range: { min: 1, max: 8, step: 1 } },
  { key: SETTINGS.AUTO_INDEX, scope: "world", config: true, type: Boolean, default: false },
  { key: SETTINGS.MEDIA_PREVIEWS, scope: "world", config: true, type: Boolean, default: true },
  { key: SETTINGS.GENERATE_THUMBNAILS, scope: "world", config: true, type: Boolean, default: true },
  { key: SETTINGS.PROBE_FILE_SIZES, scope: "world", config: true, type: Boolean, default: true },
  { key: SETTINGS.DEBUG, scope: "world", config: true, type: Boolean, default: false, onChange: v => { diagnostics.level = v ? "debug" : "info"; } },

  { key: SETTINGS.VIEW_MODE, scope: "user", config: true, type: String, default: VIEW_MODE.GRID, choices: { grid: "GMAL.Settings.ViewMode.Grid", list: "GMAL.Settings.ViewMode.List" } },
  { key: SETTINGS.THUMBNAIL_SIZE, scope: "user", config: true, type: Number, default: DEFAULT_THUMBNAIL_SIZE, range: { min: 96, max: 340, step: 4 } },
  { key: SETTINGS.SHOW_SIDEBAR, scope: "user", config: true, type: Boolean, default: true },
  { key: SETTINGS.SHOW_DETAILS, scope: "user", config: true, type: Boolean, default: true },
  { key: SETTINGS.SORT, scope: "user", config: true, type: String, default: "name:asc", choices: { "name:asc": "GMAL.Sort.NameAsc", "name:desc": "GMAL.Sort.NameDesc", "recent:desc": "GMAL.Sort.Recent", "discovered:desc": "GMAL.Sort.Discovered", "type:asc": "GMAL.Sort.Type", "source:asc": "GMAL.Sort.Source", "folder:asc": "GMAL.Sort.Folder", "size:desc": "GMAL.Sort.SizeDesc", "dimensions:desc": "GMAL.Sort.DimensionsDesc", "duration:desc": "GMAL.Sort.DurationDesc", "favorite:desc": "GMAL.Sort.Favorite" } },
  { key: SETTINGS.SEARCH_SCOPE, scope: "user", config: true, type: String, default: "all", choices: { all: "GMAL.Settings.SearchScope.All", files: "GMAL.Settings.SearchScope.Files", world: "GMAL.Settings.SearchScope.World", noCompendium: "GMAL.Settings.SearchScope.NoCompendium" } },
  { key: SETTINGS.SHOW_CARD_META, scope: "user", config: true, type: Boolean, default: false },

  // Data stores: versioned { version, data } payloads (see collections/storage.js). Defaults are complete payloads so the
  // Object setting type never has to coerce null.
  { key: SETTINGS.STORE_FAVORITES, scope: "user", config: false, type: Object, default: { version: STORAGE_SCHEMA_VERSION, data: [] } },
  { key: SETTINGS.STORE_RECENTS, scope: "user", config: false, type: Object, default: { version: STORAGE_SCHEMA_VERSION, data: [] } },
  { key: SETTINGS.STORE_SAVED_SEARCHES, scope: "user", config: false, type: Object, default: { version: STORAGE_SCHEMA_VERSION, data: [] } },
  { key: SETTINGS.STORE_COLLECTIONS, scope: "world", config: false, type: Object, default: { version: STORAGE_SCHEMA_VERSION, data: [] } },
  { key: SETTINGS.STORE_TAGS, scope: "world", config: false, type: Object, default: { version: STORAGE_SCHEMA_VERSION, data: {} } },
  { key: SETTINGS.STORE_ALIASES, scope: "world", config: false, type: Object, default: { version: STORAGE_SCHEMA_VERSION, data: {} } },
  { key: SETTINGS.STORE_NOTES, scope: "world", config: false, type: Object, default: { version: STORAGE_SCHEMA_VERSION, data: {} } },
  { key: SETTINGS.STORE_ROLES, scope: "world", config: false, type: Object, default: { version: STORAGE_SCHEMA_VERSION, data: {} } }
];

export function settingDefinitions() { return DEFINITIONS; }

/** Register every setting with Foundry. Must run during `init`. */
export function registerSettings() {
  for ( const def of DEFINITIONS ) {
    const cap = def.key.charAt(0).toUpperCase() + def.key.slice(1);
    const data = {
      name: `GMAL.Settings.${cap}.Name`,
      hint: `GMAL.Settings.${cap}.Hint`,
      scope: def.scope,
      config: def.config,
      type: def.type,
      default: def.default
    };
    if ( def.choices ) data.choices = def.choices;
    if ( def.range ) data.range = def.range;
    if ( def.onChange ) data.onChange = def.onChange;
    game.settings.register(MODULE_ID, def.key, data);
  }
}

export function getSetting(key) {
  try { return game.settings.get(MODULE_ID, key); } catch (err) {
    const def = DEFINITIONS.find(d => d.key === key);
    return def?.default;
  }
}

export async function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

export function settingScope(key) {
  return DEFINITIONS.find(d => d.key === key)?.scope ?? null;
}

/** Parse the comma/newline separated root list: "data:assets, public:icons" → [{source, target}]. */
export function parseFileRoots(value) {
  const roots = [];
  for ( const raw of String(value ?? "").split(/[\n,]+/) ) {
    const entry = raw.trim();
    if ( !entry ) continue;
    const m = entry.match(/^(data|public|s3)\s*:\s*(.*)$/i);
    const source = m ? m[1].toLowerCase() : "data";
    const target = (m ? m[2] : entry).trim().replace(/^\/+|\/+$/g, "");
    if ( !roots.some(r => r.source === source && r.target === target) ) roots.push({ source, target });
  }
  return roots;
}

export function parseList(value) {
  return String(value ?? "").split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
}
