/**
 * Schema migrations for persistent actor data. Version 1 is the initial schema; the structure is in place so that
 * future releases can migrate safely.
 */

import { FLAG_SCOPE, SCHEMA_VERSION } from "./constants.js";
import { getSetting, setSetting, SETTINGS } from "./settings.js";
import { diagnostics } from "./diagnostics.js";

/**
 * Compute the migrated flag data for an actor, or null when no change is needed.
 * Pure: safe for unit tests.
 * @param {object|undefined} flags  The module's flag object on the actor.
 * @returns {object|null}
 */
export function migrateFlagData(flags) {
  if ( !flags || (typeof flags !== "object") ) return null;
  const version = Number(flags.schemaVersion ?? 0);
  if ( version >= SCHEMA_VERSION ) return null;
  const migrated = foundry.utils.deepClone(flags);
  // v0 -> v1: establish the canonical structure.
  migrated.schemaVersion = SCHEMA_VERSION;
  migrated.resources ??= {};
  migrated.resources.heroic ??= { value: 0 };
  migrated.resources.villainous ??= { value: 0 };
  migrated.abilities ??= {};
  migrated.abilities.heroic ??= null;
  migrated.abilities.villainous ??= null;
  migrated.history ??= [];
  migrated.stats ??= {};
  return migrated;
}

/**
 * Migrate all world actors if the stored world schema version is outdated. GM only.
 */
export async function migrateWorld() {
  if ( !game.user?.isGM ) return;
  const current = Number(getSetting(SETTINGS.SCHEMA_VERSION) ?? 0);
  if ( current >= SCHEMA_VERSION ) return;
  let count = 0;
  for ( const actor of game.actors ) {
    const flags = actor.flags?.[FLAG_SCOPE];
    const migrated = migrateFlagData(flags);
    if ( !migrated ) continue;
    try {
      await actor.update({ [`flags.${FLAG_SCOPE}`]: migrated });
      count++;
    } catch(err) {
      diagnostics.error(`Migration failed for actor ${actor.name}`, err);
    }
  }
  await setSetting(SETTINGS.SCHEMA_VERSION, SCHEMA_VERSION);
  diagnostics.log(`Migrated ${count} actor(s) to schema version ${SCHEMA_VERSION}.`);
}
