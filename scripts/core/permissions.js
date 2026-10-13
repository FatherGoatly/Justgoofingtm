import { MODULE_ID, SETTINGS, ACCESS_MODES } from "./constants.js";

/**
 * Permission checks. The academy never elevates a user's privileges: every check here asks Foundry what the
 * current user may already do, and the UI hides or disables anything beyond that.
 */

function getSetting(key, fallback) {
  try { return globalThis.game?.settings?.get(MODULE_ID, key) ?? fallback; }
  catch(_err) { return fallback; }
}

/**
 * May this user open the academy at all?
 * @param {User} [user=game.user]
 * @returns {boolean}
 */
export function canUseAcademy(user=globalThis.game?.user) {
  if ( !user ) return false;
  if ( user.isGM ) return true;
  return getSetting(SETTINGS.ACCESS, ACCESS_MODES.GM) === ACCESS_MODES.ALL;
}

/**
 * May this user execute script code against the live game? Mirrors Foundry's own rule for script macros
 * (the MACRO_SCRIPT permission) and adds the GM's world setting for players.
 * @param {User} [user=game.user]
 * @returns {{allowed:boolean, reason:string|null}}
 */
export function canExecuteLive(user=globalThis.game?.user) {
  if ( !user ) return { allowed: false, reason: "No user is connected." };
  if ( !user.can?.("MACRO_SCRIPT") ) return { allowed: false, reason: "Your user role does not have the 'Use Script Macros' permission. A Gamemaster can grant it in User Management > Permission Configuration." };
  if ( !user.isGM && !getSetting(SETTINGS.PLAYER_LIVE_EXECUTION, false) ) return { allowed: false, reason: "The Gamemaster has not enabled live execution for players in the academy's world settings." };
  return { allowed: true, reason: null };
}

/**
 * May this user create Macro documents?
 * @param {User} [user=game.user]
 * @returns {{allowed:boolean, reason:string|null}}
 */
export function canCreateMacro(user=globalThis.game?.user) {
  if ( !user ) return { allowed: false, reason: "No user is connected." };
  const Cls = globalThis.Macro ?? globalThis.foundry?.documents?.Macro;
  const canCreate = Cls?.canUserCreate ? Cls.canUserCreate(user) : Boolean(user.isGM || user.hasRole?.("PLAYER"));
  if ( !canCreate ) return { allowed: false, reason: "Your user cannot create Macro documents." };
  if ( !user.can?.("MACRO_SCRIPT") ) return { allowed: false, reason: "Your user cannot create script macros (missing 'Use Script Macros' permission)." };
  return { allowed: true, reason: null };
}

/**
 * May this user create or reset academy fixture documents (demo scene, actors)?
 * @param {User} [user=game.user]
 * @returns {{allowed:boolean, reason:string|null}}
 */
export function canManageFixtures(user=globalThis.game?.user) {
  if ( !user ) return { allowed: false, reason: "No user is connected." };
  if ( !user.isGM ) return { allowed: false, reason: "Only a Gamemaster can create or reset the practice scene and its actors, because they are world documents." };
  return { allowed: true, reason: null };
}

/**
 * Describe the current user's role and the permissions relevant to the academy, for diagnostics and the
 * live-execution warning.
 * @param {User} [user=game.user]
 * @returns {object}
 */
export function describeUserPermissions(user=globalThis.game?.user) {
  if ( !user ) return { role: "none", isGM: false, permissions: {} };
  const roleNames = globalThis.CONST?.USER_ROLE_NAMES ?? { 0: "NONE", 1: "PLAYER", 2: "TRUSTED", 3: "ASSISTANT", 4: "GAMEMASTER" };
  const perms = {};
  for ( const key of ["MACRO_SCRIPT", "ACTOR_CREATE", "ITEM_CREATE", "TOKEN_CREATE", "TOKEN_DELETE", "TOKEN_CONFIGURE", "JOURNAL_CREATE", "SETTINGS_MODIFY", "FILES_UPLOAD"] ) {
    try { perms[key] = Boolean(user.can?.(key)); } catch(_err) { perms[key] = null; }
  }
  return { role: roleNames[user.role] ?? String(user.role), isGM: Boolean(user.isGM), permissions: perms, name: user.name, id: user.id };
}
