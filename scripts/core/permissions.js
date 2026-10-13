import { DESTINATION, MODULE_ID } from "./constants.js";
import { getSetting, MACRO_POLICIES, playerDestinations, SETTINGS } from "./settings.js";

/**
 * Permission checks. These are advisory: the authoritative enforcement happens when Foundry's
 * server validates the document operations we issue (create/update on Actors, Items, Macros),
 * which we never bypass with sockets or GM relays.
 */

const OWNER = () => globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;

export function currentUser() { return globalThis.game?.user ?? null; }

export function isGM(user = currentUser()) { return Boolean(user?.isGM); }

/** Can the user open the importer at all? */
export function canUseImporter(user = currentUser()) {
  if ( !user ) return false;
  if ( isGM(user) ) return true;
  return Boolean(getSetting(SETTINGS.ALLOW_PLAYER_IMPORT));
}

/** Can the user create world Actors? */
export function canCreateActor(user = currentUser()) {
  if ( !user ) return false;
  return isGM(user) || Boolean(user.can?.("ACTOR_CREATE"));
}

/** Can the user create world Items? */
export function canCreateItem(user = currentUser()) {
  if ( !user ) return false;
  return isGM(user) || Boolean(user.can?.("ITEM_CREATE"));
}

/** Does the user own the document? */
export function ownsDocument(doc, user = currentUser()) {
  if ( !doc || !user ) return false;
  if ( typeof doc.testUserPermission === "function" ) return doc.testUserPermission(user, OWNER());
  return Boolean(doc.isOwner);
}

/** Can the user embed Items into the given Actor? */
export function canModifyActor(actor, user = currentUser()) {
  return ownsDocument(actor, user);
}

/**
 * Determine which destinations are available to the user.
 * @param {object} [user]
 * @returns {Set<string>}
 */
export function availableDestinations(user = currentUser()) {
  if ( !user ) return new Set();
  if ( isGM(user) ) return new Set([DESTINATION.WORLD, DESTINATION.ACTOR, DESTINATION.STAGING, DESTINATION.COMPENDIUM]);
  const dests = new Set();
  for ( const d of playerDestinations() ) dests.add(d);
  if ( canCreateActor(user) || canCreateItem(user) ) dests.add(DESTINATION.WORLD);
  return dests;
}

/**
 * Validate a requested destination for the user and return a normalized decision.
 * @param {object} request        { type: DESTINATION, actor?: Actor }
 * @param {object} [user]
 * @returns {{allowed: boolean, reason?: string, redirect?: object}}
 */
export function authorizeDestination(request, user = currentUser()) {
  if ( !user ) return { allowed: false, reason: "SBI.Permission.NoUser" };
  if ( !canUseImporter(user) ) return { allowed: false, reason: "SBI.Permission.PlayersDisabled" };
  const dests = availableDestinations(user);
  const type = request?.type ?? DESTINATION.WORLD;
  if ( type === DESTINATION.ACTOR ) {
    if ( !request.actor ) return { allowed: false, reason: "SBI.Permission.NoActor" };
    if ( !canModifyActor(request.actor, user) ) {
      const redirect = dests.has(DESTINATION.STAGING) ? { type: DESTINATION.STAGING } : null;
      return { allowed: false, reason: "SBI.Permission.NotActorOwner", redirect };
    }
    return { allowed: true };
  }
  if ( type === DESTINATION.WORLD ) {
    if ( isGM(user) ) return { allowed: true };
    if ( !dests.has(DESTINATION.WORLD) ) {
      const redirect = dests.has(DESTINATION.STAGING) ? { type: DESTINATION.STAGING } : null;
      return { allowed: false, reason: "SBI.Permission.NoWorldCreate", redirect };
    }
    return { allowed: true };
  }
  if ( type === DESTINATION.STAGING ) {
    if ( !dests.has(DESTINATION.STAGING) ) return { allowed: false, reason: "SBI.Permission.NoStaging" };
    return { allowed: true };
  }
  if ( type === DESTINATION.COMPENDIUM ) {
    if ( !isGM(user) ) return { allowed: false, reason: "SBI.Permission.GMOnly" };
    return { allowed: true };
  }
  return { allowed: false, reason: "SBI.Permission.UnknownDestination" };
}

/** Can the user create script macros under the configured policy? */
export function canGenerateMacros(user = currentUser()) {
  if ( !user ) return false;
  const policy = getSetting(SETTINGS.MACRO_POLICY);
  if ( policy === MACRO_POLICIES.never ) return false;
  if ( policy === MACRO_POLICIES.gmOnly ) return isGM(user);
  // owners: still requires the core permission to author script macros
  return isGM(user) || Boolean(user.can?.("MACRO_SCRIPT"));
}

/** Maximum batch size for the user. */
export function maxBatchFor(user = currentUser()) {
  const max = Number(getSetting(SETTINGS.MAX_BATCH_SIZE)) || 50;
  return isGM(user) ? Math.max(max, 1) : Math.min(max, 50);
}

/**
 * Strip ownership and permission escalation from imported document data. Imported content must
 * never grant itself ownership, change folders it cannot see, or carry foreign flags that elevate.
 * @param {object} data
 * @param {object} [user]
 * @returns {object}
 */
export function sanitizeOwnership(data, user = currentUser(), { nested=false }={}) {
  if ( !data || typeof data !== "object" ) return data;
  const out = { ...data };
  delete out.ownership;
  delete out.permission;
  // Top-level documents never carry an id from the source; embedded effects keep theirs because
  // activities reference them by `_id`.
  if ( !nested ) delete out._id;
  if ( out.flags ) {
    const flags = { ...out.flags };
    // Only keep our own flags and the core/dnd5e flags known to be harmless data.
    for ( const key of Object.keys(flags) ) {
      if ( ![MODULE_ID, "dnd5e", "core"].includes(key) ) delete flags[key];
    }
    if ( flags.core ) {
      const core = { ...flags.core };
      delete core.sourceId;
      flags.core = core;
    }
    out.flags = flags;
  }
  // Folders are always assigned by the importer, never taken from imported data.
  delete out.folder;
  delete out.sort;
  if ( Array.isArray(out.items) ) out.items = out.items.map(i => sanitizeOwnership(i, user));
  if ( Array.isArray(out.effects) ) out.effects = out.effects.map(e => sanitizeOwnership(e, user, { nested: true }));
  return out;
}
