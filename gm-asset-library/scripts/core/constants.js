/**
 * Shared constants. Keep this file free of Foundry runtime references so it can be imported by tests.
 */
export const MODULE_ID = "gm-asset-library";
export const MODULE_VERSION = "0.1.0";
export const I18N_PREFIX = "GMAL";

/** Where a catalog entry comes from. These are deliberately distinct and never collapsed. */
export const SOURCE_KIND = Object.freeze({
  FILE: "file",            // A file reachable through FilePicker.browse (user data, public, S3)
  WORLD: "world",          // A document that lives in the current world
  COMPENDIUM: "compendium" // An index entry of a compendium pack
});

/** The media/document type of an asset. */
export const ASSET_TYPE = Object.freeze({
  IMAGE: "image",
  AUDIO: "audio",
  VIDEO: "video",
  PDF: "pdf",
  TEXT: "text",
  FONT: "font",
  ACTOR: "actor",
  ITEM: "item",
  SCENE: "scene",
  JOURNAL: "journal",
  PLAYLIST: "playlist",
  TABLE: "table",
  CARDS: "cards",
  MACRO: "macro",
  ADVENTURE: "adventure",
  OTHER: "other"
});

/** User-correctable role classification for image assets. */
export const ASSET_ROLE = Object.freeze({
  MAP: "map",
  TOKEN: "token",
  PORTRAIT: "portrait",
  TILE: "tile",
  EFFECT: "effect",
  HANDOUT: "handout"
});

export const ROLE_SOURCE = Object.freeze({ INFERRED: "inferred", USER: "user" });

/** Extensions by asset type. Previews are additionally gated by what the browser can actually decode. */
export const EXTENSIONS = Object.freeze({
  [ASSET_TYPE.IMAGE]: ["apng", "avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "tiff", "webp"],
  [ASSET_TYPE.AUDIO]: ["aac", "flac", "m4a", "mid", "mp3", "ogg", "opus", "wav", "webm"],
  [ASSET_TYPE.VIDEO]: ["m4v", "mp4", "ogv", "webm"],
  [ASSET_TYPE.PDF]: ["pdf"],
  [ASSET_TYPE.TEXT]: ["txt", "md", "markdown", "json", "yml", "yaml", "csv", "xml", "html"],
  [ASSET_TYPE.FONT]: ["ttf", "otf", "woff", "woff2"]
});

/** `webm` can be either audio or video; it is classified as video unless the folder says otherwise. */
export const AMBIGUOUS_EXTENSIONS = Object.freeze({ webm: [ASSET_TYPE.VIDEO, ASSET_TYPE.AUDIO] });

/** Foundry document names that the document adapters catalog, with their asset type and icon. */
export const DOCUMENT_TYPES = Object.freeze({
  Actor: { type: ASSET_TYPE.ACTOR, icon: "fa-solid fa-user", collection: "actors" },
  Item: { type: ASSET_TYPE.ITEM, icon: "fa-solid fa-suitcase", collection: "items" },
  Scene: { type: ASSET_TYPE.SCENE, icon: "fa-solid fa-map", collection: "scenes" },
  JournalEntry: { type: ASSET_TYPE.JOURNAL, icon: "fa-solid fa-book-open", collection: "journal" },
  Playlist: { type: ASSET_TYPE.PLAYLIST, icon: "fa-solid fa-music", collection: "playlists" },
  RollTable: { type: ASSET_TYPE.TABLE, icon: "fa-solid fa-table-list", collection: "tables" },
  Cards: { type: ASSET_TYPE.CARDS, icon: "fa-solid fa-cards", collection: "cards" },
  Macro: { type: ASSET_TYPE.MACRO, icon: "fa-solid fa-code", collection: "macros" },
  Adventure: { type: ASSET_TYPE.ADVENTURE, icon: "fa-solid fa-dungeon", collection: null }
});

export const TYPE_ICONS = Object.freeze({
  [ASSET_TYPE.IMAGE]: "fa-solid fa-image",
  [ASSET_TYPE.AUDIO]: "fa-solid fa-volume-high",
  [ASSET_TYPE.VIDEO]: "fa-solid fa-film",
  [ASSET_TYPE.PDF]: "fa-solid fa-file-pdf",
  [ASSET_TYPE.TEXT]: "fa-solid fa-file-lines",
  [ASSET_TYPE.FONT]: "fa-solid fa-font",
  [ASSET_TYPE.ACTOR]: "fa-solid fa-user",
  [ASSET_TYPE.ITEM]: "fa-solid fa-suitcase",
  [ASSET_TYPE.SCENE]: "fa-solid fa-map",
  [ASSET_TYPE.JOURNAL]: "fa-solid fa-book-open",
  [ASSET_TYPE.PLAYLIST]: "fa-solid fa-music",
  [ASSET_TYPE.TABLE]: "fa-solid fa-table-list",
  [ASSET_TYPE.CARDS]: "fa-solid fa-cards",
  [ASSET_TYPE.MACRO]: "fa-solid fa-code",
  [ASSET_TYPE.ADVENTURE]: "fa-solid fa-dungeon",
  [ASSET_TYPE.OTHER]: "fa-solid fa-file"
});

/** Navigation categories shown in the browser sidebar. `match` is evaluated against a record. */
export const CATEGORIES = Object.freeze([
  { id: "all", label: "GMAL.Category.All", icon: "fa-solid fa-layer-group", match: () => true },
  { id: "images", label: "GMAL.Category.Images", icon: TYPE_ICONS.image, match: r => r.type === ASSET_TYPE.IMAGE },
  { id: "maps", label: "GMAL.Category.Maps", icon: "fa-solid fa-map-location-dot", match: r => r.type === ASSET_TYPE.IMAGE && r.role === ASSET_ROLE.MAP },
  { id: "tokens", label: "GMAL.Category.Tokens", icon: "fa-solid fa-circle-user", match: r => r.type === ASSET_TYPE.IMAGE && r.role === ASSET_ROLE.TOKEN },
  { id: "portraits", label: "GMAL.Category.Portraits", icon: "fa-solid fa-portrait", match: r => r.type === ASSET_TYPE.IMAGE && r.role === ASSET_ROLE.PORTRAIT },
  { id: "tiles", label: "GMAL.Category.Tiles", icon: "fa-solid fa-cubes", match: r => r.type === ASSET_TYPE.IMAGE && (r.role === ASSET_ROLE.TILE || r.role === ASSET_ROLE.EFFECT) },
  { id: "audio", label: "GMAL.Category.Audio", icon: TYPE_ICONS.audio, match: r => r.type === ASSET_TYPE.AUDIO },
  { id: "video", label: "GMAL.Category.Video", icon: TYPE_ICONS.video, match: r => r.type === ASSET_TYPE.VIDEO },
  { id: "documents", label: "GMAL.Category.Documents", icon: TYPE_ICONS.pdf, match: r => r.source.kind === SOURCE_KIND.FILE && (r.type === ASSET_TYPE.PDF || r.type === ASSET_TYPE.TEXT) },
  { id: "foundry", label: "GMAL.Category.FoundryDocuments", icon: "fa-solid fa-dice-d20", match: r => r.source.kind === SOURCE_KIND.WORLD },
  { id: "compendiums", label: "GMAL.Category.Compendiums", icon: "fa-solid fa-atlas", match: r => r.source.kind === SOURCE_KIND.COMPENDIUM }
]);

/** Keyword → role inference from folder names. Only folder names are used, never image contents. */
export const ROLE_FOLDER_KEYWORDS = Object.freeze([
  { role: ASSET_ROLE.MAP, keywords: ["map", "maps", "battlemap", "battlemaps", "battle-maps", "battle_maps", "dungeon", "dungeons", "scenes", "backgrounds", "background"] },
  { role: ASSET_ROLE.TOKEN, keywords: ["token", "tokens"] },
  { role: ASSET_ROLE.PORTRAIT, keywords: ["portrait", "portraits", "avatar", "avatars", "faces", "headshots"] },
  { role: ASSET_ROLE.TILE, keywords: ["tile", "tiles", "props", "prop", "decals", "furniture", "terrain", "overlays", "overlay"] },
  { role: ASSET_ROLE.EFFECT, keywords: ["effect", "effects", "fx", "vfx", "spells", "spell-effects", "animated"] },
  { role: ASSET_ROLE.HANDOUT, keywords: ["handout", "handouts", "letters", "notes", "documents"] }
]);

/** Sub-classification of maps derived from folder names. */
export const MAP_SUBTYPE_KEYWORDS = Object.freeze([
  { id: "battle", label: "GMAL.MapType.Battle", keywords: ["battle", "battlemap", "battlemaps", "encounter", "tactical"] },
  { id: "dungeon", label: "GMAL.MapType.Dungeon", keywords: ["dungeon", "dungeons", "cave", "caves", "crypt", "ruins"] },
  { id: "city", label: "GMAL.MapType.City", keywords: ["city", "cities", "town", "towns", "village", "villages", "street", "streets"] },
  { id: "interior", label: "GMAL.MapType.Interior", keywords: ["interior", "interiors", "building", "buildings", "tavern", "inn", "house", "houses"] },
  { id: "exterior", label: "GMAL.MapType.Exterior", keywords: ["exterior", "exteriors", "forest", "forests", "wilderness", "outdoor", "outdoors", "road", "roads"] },
  { id: "regional", label: "GMAL.MapType.Regional", keywords: ["region", "regional", "world", "continent", "kingdom", "overland", "hex", "hexmap"] }
]);

export const DEFAULT_THUMBNAIL_SIZE = 160;
export const THUMBNAIL_SIZES = Object.freeze([96, 128, 160, 200, 260, 340]);
export const THUMBNAIL_PIXELS = 256;        // generated thumbnail long edge
export const MAX_TEXT_PREVIEW_BYTES = 200_000;
export const SCAN_LIMITS = Object.freeze({ MAX_FILES: 100_000, MAX_DIRS: 20_000, MAX_DEPTH: 24, CONCURRENCY: 3 });
export const RECENTS_LIMIT = 100;
export const STORAGE_SCHEMA_VERSION = 1;

export const VIEW_MODE = Object.freeze({ GRID: "grid", LIST: "list" });
export const SORT_KEYS = Object.freeze(["name", "type", "source", "folder", "size", "dimensions", "duration", "recent", "discovered", "favorite"]);
