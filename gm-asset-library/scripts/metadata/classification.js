import { ASSET_ROLE, ASSET_TYPE, MAP_SUBTYPE_KEYWORDS, ROLE_FOLDER_KEYWORDS } from "../core/constants.js";
import { folderSegments } from "../utilities/paths.js";

/**
 * Role classification from folder names only. We never infer a role from image dimensions or content:
 * a wide image is not "a dungeon map" unless its folder (or the GM) says so.
 */

/** @returns {{role: string|null, confidence: "folder"|null}} */
export function inferRoleFromPath(path) {
  const segments = folderSegments(path);
  if ( !segments.length ) return { role: null, mapType: null };
  // The deepest matching folder wins, so "assets/maps/tokens" classifies as token.
  for ( let i = segments.length - 1; i >= 0; i-- ) {
    const seg = segments[i];
    for ( const { role, keywords } of ROLE_FOLDER_KEYWORDS ) {
      if ( keywords.some(k => matchesKeyword(seg, k)) ) {
        return { role, mapType: role === ASSET_ROLE.MAP ? inferMapType(segments) : null };
      }
    }
  }
  return { role: null, mapType: null };
}

export function inferMapType(segments) {
  for ( let i = segments.length - 1; i >= 0; i-- ) {
    for ( const { id, keywords } of MAP_SUBTYPE_KEYWORDS ) {
      if ( keywords.some(k => matchesKeyword(segments[i], k)) ) return id;
    }
  }
  return null;
}

function matchesKeyword(segment, keyword) {
  if ( segment === keyword ) return true;
  // Split folder names on separators so "Battle Maps" / "battle_maps" / "fantasy-tokens" match.
  const words = segment.split(/[\s_\-.()[\]]+/).filter(Boolean);
  return words.includes(keyword);
}

/** Resolve a `webm` style ambiguity using folder hints. */
export function disambiguateType(candidates, path) {
  const segments = folderSegments(path);
  const audioHints = ["music", "audio", "sfx", "sound", "sounds", "ambience", "ambient", "soundscape", "soundscapes", "playlist", "playlists"];
  if ( candidates.includes(ASSET_TYPE.AUDIO) && segments.some(s => audioHints.some(h => matchesKeyword(s, h))) ) return ASSET_TYPE.AUDIO;
  return candidates[0];
}
