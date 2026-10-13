/**
 * Single authority for permission decisions. Every state-changing operation consults this service.
 * Functions accept explicit user/actor objects so they can be unit tested with mocks.
 */

import { getSetting, SETTINGS } from "./settings.js";

const OWNER_LEVEL = () => globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;

/**
 * Whether the user owns the actor (or is a GM).
 * @param {User} user
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isOwner(user, actor) {
  if ( !user || !actor ) return false;
  if ( user.isGM ) return true;
  if ( typeof actor.testUserPermission === "function" ) return actor.testUserPermission(user, OWNER_LEVEL());
  return false;
}

/** Can the user view resources and definitions of the actor? */
export function canView(user, actor) {
  if ( !user || !actor ) return false;
  if ( user.isGM ) return true;
  if ( typeof actor.testUserPermission === "function" ) {
    const limited = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 1;
    return actor.testUserPermission(user, limited);
  }
  return false;
}

/** Can the user spend resources and activate abilities of the actor? */
export function canActivate(user, actor) {
  return isOwner(user, actor);
}

/** Can the user define an ability for the actor when none exists? */
export function canDefineAbility(user, actor) {
  return isOwner(user, actor);
}

/** Can the user edit an existing ability definition? */
export function canEditAbility(user, actor) {
  if ( !user || !actor ) return false;
  if ( user.isGM ) return true;
  if ( getSetting(SETTINGS.PLAYERS_CAN_EDIT) !== true ) return false;
  return isOwner(user, actor);
}

/** Can the user receive automatic awards on behalf of this actor (i.e. write the actor document)? */
export function canUpdateActor(user, actor) {
  return isOwner(user, actor);
}

/** Can the user perform administrative resource changes (set, reset, clear, override)? */
export function canAdminister(user) {
  return user?.isGM === true;
}

/** Can the user approve automated abilities? */
export function canApprove(user) {
  return user?.isGM === true;
}

/** Whether an actor type participates in resource generation. */
export function actorParticipates(actor) {
  if ( !actor ) return false;
  if ( actor.type === "character" ) return true;
  if ( actor.type === "npc" ) return getSetting(SETTINGS.NPC_GENERATION) === true;
  return false;
}

/** Whether an actor type can hold resources at all (the GM may grant to NPCs manually). */
export function actorSupported(actor) {
  return ["character", "npc"].includes(actor?.type);
}

/**
 * Throw a descriptive error when a permission check fails.
 * @param {boolean} allowed
 * @param {string} key  Localization key suffix under HVA.Errors.
 */
export function assertPermission(allowed, key) {
  if ( allowed ) return;
  const message = globalThis.game?.i18n?.localize?.(`HVA.Errors.${key}`) ?? key;
  const err = new Error(message);
  err.permissionKey = key;
  throw err;
}
