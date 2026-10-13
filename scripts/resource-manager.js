/**
 * ResourceManager: the single authoritative service for reading and writing persistent module data on Actors.
 *
 * Storage: `actor.flags["heroic-villainous-actions"]` with the structure
 * {
 *   schemaVersion, resources: { heroic: { value }, villainous: { value } },
 *   abilities: { heroic: AbilityDefinition|null, villainous: AbilityDefinition|null },
 *   history: HistoryEntry[], stats: { heroicEarned, ... }, usage: { legendary: { combatId, round, count } }
 * }
 *
 * All writes are serialized per actor through a promise queue and re-read the current flag state before computing
 * the new value, so repeated callbacks and concurrent qualifying rolls cannot clobber one another.
 */

import {
  FLAG_SCOPE, HISTORY_KINDS, HISTORY_LIMIT, MAX_PER_POOL, MODULE_ID, POOL_LIST, SCHEMA_VERSION
} from "./constants.js";
import { clampPool, computeAdjust, computeAward, computeSpend } from "./resource-math.js";
import { assertPermission, canAdminister, canDefineAbility, canEditAbility, canUpdateActor, actorSupported }
  from "./permission-service.js";
import { getSetting, SETTINGS } from "./settings.js";
import { diagnostics } from "./diagnostics.js";

export const HOOKS = Object.freeze({
  RESOURCE_CHANGED: `${MODULE_ID}.resourceChanged`,
  ABILITY_CHANGED: `${MODULE_ID}.abilityChanged`
});

function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    resources: { heroic: { value: 0 }, villainous: { value: 0 } },
    abilities: { heroic: null, villainous: null },
    history: [],
    stats: {},
    usage: { legendary: { combatId: null, round: null, count: 0 } }
  };
}

function assertPool(pool) {
  if ( !POOL_LIST.includes(pool) ) throw new Error(`Unknown resource pool "${pool}"`);
}

function callHook(name, ...args) {
  globalThis.Hooks?.callAll?.(name, ...args);
}

export class ResourceManager {
  constructor() {
    this.max = MAX_PER_POOL;
    this.queues = new Map();
  }

  /* -------------------------------------------- */
  /*  Reading                                     */
  /* -------------------------------------------- */

  /**
   * Read and normalize the module data of an actor. Never throws; returns defaults for missing data.
   * @param {Actor} actor
   * @returns {object}
   */
  getData(actor) {
    const raw = actor?.flags?.[FLAG_SCOPE] ?? {};
    const data = emptyData();
    for ( const pool of POOL_LIST ) {
      data.resources[pool].value = clampPool(raw.resources?.[pool]?.value, Number.MAX_SAFE_INTEGER);
      const ability = raw.abilities?.[pool];
      data.abilities[pool] = (ability && (typeof ability === "object")) ? ability : null;
    }
    data.schemaVersion = Number(raw.schemaVersion ?? 0);
    data.history = Array.isArray(raw.history) ? raw.history : [];
    data.stats = (raw.stats && (typeof raw.stats === "object")) ? raw.stats : {};
    if ( raw.usage?.legendary ) data.usage.legendary = { ...data.usage.legendary, ...raw.usage.legendary };
    return data;
  }

  getCount(actor, pool) {
    assertPool(pool);
    return this.getData(actor).resources[pool].value;
  }

  getAbility(actor, pool) {
    assertPool(pool);
    return this.getData(actor).abilities[pool];
  }

  getHistory(actor) {
    return this.getData(actor).history;
  }

  /* -------------------------------------------- */
  /*  Queueing                                    */
  /* -------------------------------------------- */

  /**
   * Run an operation for an actor after all previously queued operations for that actor complete.
   * @param {Actor} actor
   * @param {Function} fn
   * @returns {Promise<*>}
   */
  enqueue(actor, fn) {
    const key = actor.uuid ?? actor.id;
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous.then(fn);
    // Swallow rejections on the tracking chain only; callers still receive the rejection from `run`.
    const tracked = run.then(() => {}, () => {}).finally(() => {
      if ( this.queues.get(key) === tracked ) this.queues.delete(key);
    });
    this.queues.set(key, tracked);
    return run;
  }

  /* -------------------------------------------- */
  /*  Writing primitives                          */
  /* -------------------------------------------- */

  /**
   * Persist a changed pool value with a history entry. Must be called from inside the queue.
   * @private
   */
  async #write(actor, { pool, kind, before, after, user, source, statKey, extra={} }) {
    const data = this.getData(actor);
    const entry = {
      id: foundry.utils.randomID(8),
      kind, pool, before, after, delta: after - before,
      at: Date.now(),
      user: user?.id ?? null,
      source: source ?? null
    };
    const history = [entry, ...data.history].slice(0, HISTORY_LIMIT);
    const update = {
      [`flags.${FLAG_SCOPE}.schemaVersion`]: SCHEMA_VERSION,
      [`flags.${FLAG_SCOPE}.history`]: history,
      ...extra
    };
    if ( pool && (before !== after) ) update[`flags.${FLAG_SCOPE}.resources.${pool}.value`] = after;
    if ( statKey ) update[`flags.${FLAG_SCOPE}.stats.${statKey}`] = Number(data.stats[statKey] ?? 0) + 1;
    await actor.update(update);
    callHook(HOOKS.RESOURCE_CHANGED, actor, entry);
    return entry;
  }

  /* -------------------------------------------- */
  /*  Awards                                      */
  /* -------------------------------------------- */

  /**
   * Award one resource to the actor's pool if it has capacity.
   * @param {Actor} actor
   * @param {string} pool
   * @param {object} [options]
   * @param {User} [options.user]      Acting user (defaults to game.user).
   * @param {object} [options.source]  Provenance: { category, natural, messageId, rollKey, note }.
   * @returns {Promise<{applied: boolean, blocked: boolean, before: number, after: number, entry: object|null}>}
   */
  async award(actor, pool, { user=globalThis.game?.user, source=null }={}) {
    assertPool(pool);
    assertPermission(actorSupported(actor), "UnsupportedActor");
    assertPermission(canUpdateActor(user, actor), "CannotUpdateActor");
    return this.enqueue(actor, async () => {
      const current = this.getCount(actor, pool);
      const result = computeAward(current, this.max);
      const kind = result.applied ? HISTORY_KINDS.AWARD : HISTORY_KINDS.BLOCKED;
      const entry = await this.#write(actor, {
        pool, kind, before: result.before, after: result.after, user, source,
        statKey: `${pool}${result.applied ? "Earned" : "Blocked"}`
      });
      return { ...result, entry };
    });
  }

  /* -------------------------------------------- */
  /*  Spending                                    */
  /* -------------------------------------------- */

  /**
   * Spend resources. Never produces a negative balance.
   * @returns {Promise<{ok: boolean, reason: string|null, before: number, after: number, entry: object|null}>}
   */
  async spend(actor, pool, cost=1, { user=globalThis.game?.user, source=null }={}) {
    assertPool(pool);
    assertPermission(canUpdateActor(user, actor), "CannotUpdateActor");
    return this.enqueue(actor, async () => {
      const current = this.getCount(actor, pool);
      const result = computeSpend(current, cost);
      if ( !result.ok ) return { ...result, entry: null };
      const entry = await this.#write(actor, {
        pool, kind: HISTORY_KINDS.SPEND, before: result.before, after: result.after, user, source,
        statKey: `${pool}Spent`
      });
      return { ...result, entry };
    });
  }

  /**
   * Refund resources after a failed execution (never exceeds the maximum).
   */
  async refund(actor, pool, amount=1, { user=globalThis.game?.user, source=null }={}) {
    assertPool(pool);
    assertPermission(canUpdateActor(user, actor), "CannotUpdateActor");
    return this.enqueue(actor, async () => {
      const current = this.getCount(actor, pool);
      const result = computeAdjust(current, { delta: amount, max: this.max });
      const entry = await this.#write(actor, {
        pool, kind: HISTORY_KINDS.REFUND, before: result.before, after: result.after, user, source
      });
      return { ...result, entry };
    });
  }

  /* -------------------------------------------- */
  /*  Administration                              */
  /* -------------------------------------------- */

  /**
   * GM adjustment of a pool, respecting the maximum unless the administrative override setting is enabled.
   * @param {Actor} actor
   * @param {string} pool
   * @param {object} change  { delta, value, override, user, note }
   */
  async adjust(actor, pool, { delta=0, value, override=false, user=globalThis.game?.user, note="" }={}) {
    assertPool(pool);
    assertPermission(canAdminister(user), "GMOnly");
    const overrideAllowed = override && (getSetting(SETTINGS.ALLOW_ADMIN_OVERRIDE) === true);
    return this.enqueue(actor, async () => {
      const current = this.getCount(actor, pool);
      const result = computeAdjust(current, { delta, value, max: this.max, override: overrideAllowed });
      const kind = result.overridden ? HISTORY_KINDS.OVERRIDE : HISTORY_KINDS.ADJUST;
      if ( result.overridden ) diagnostics.warn(`Administrative override: ${actor.name} ${pool} set to ${result.after}`);
      const entry = await this.#write(actor, {
        pool, kind, before: result.before, after: result.after, user,
        source: { note: note || null, override: result.overridden }
      });
      return { ...result, entry };
    });
  }

  /** Reset both pools to zero. GM only. */
  async reset(actor, { user=globalThis.game?.user, note="" }={}) {
    assertPermission(canAdminister(user), "GMOnly");
    return this.enqueue(actor, async () => {
      const data = this.getData(actor);
      const extra = {};
      for ( const pool of POOL_LIST ) extra[`flags.${FLAG_SCOPE}.resources.${pool}.value`] = 0;
      const entry = await this.#write(actor, {
        pool: null, kind: HISTORY_KINDS.RESET,
        before: data.resources.heroic.value + data.resources.villainous.value, after: 0,
        user, source: { note: note || null }, extra
      });
      return { entry };
    });
  }

  /* -------------------------------------------- */
  /*  Abilities                                   */
  /* -------------------------------------------- */

  /**
   * Store an ability definition. Definition must already be validated by ability-schema.
   * @param {Actor} actor
   * @param {string} pool
   * @param {object} definition
   * @param {object} [options]
   * @param {User} [options.user]
   * @param {boolean} [options.isNew]
   */
  async setAbility(actor, pool, definition, { user=globalThis.game?.user, isNew=false }={}) {
    assertPool(pool);
    const existing = this.getAbility(actor, pool);
    const allowed = (isNew || !existing) ? canDefineAbility(user, actor) : canEditAbility(user, actor);
    assertPermission(allowed, "CannotEditAbility");
    return this.enqueue(actor, async () => {
      const now = Date.now();
      const stored = foundry.utils.deepClone(definition);
      stored.meta = {
        createdBy: existing?.meta?.createdBy ?? user?.id ?? null,
        createdAt: existing?.meta?.createdAt ?? now,
        updatedBy: user?.id ?? null,
        updatedAt: now
      };
      await actor.update({
        [`flags.${FLAG_SCOPE}.schemaVersion`]: SCHEMA_VERSION,
        [`flags.${FLAG_SCOPE}.abilities.${pool}`]: stored
      });
      callHook(HOOKS.ABILITY_CHANGED, actor, { pool, ability: stored, previous: existing ?? null });
      return stored;
    });
  }

  /** Clear an ability definition. Editors and GMs. */
  async clearAbility(actor, pool, { user=globalThis.game?.user }={}) {
    assertPool(pool);
    assertPermission(canEditAbility(user, actor), "CannotEditAbility");
    return this.enqueue(actor, async () => {
      const previous = this.getAbility(actor, pool);
      await actor.update({ [`flags.${FLAG_SCOPE}.abilities.-=${pool}`]: null });
      callHook(HOOKS.ABILITY_CHANGED, actor, { pool, ability: null, previous });
      return true;
    });
  }

  /** Persist the legendary off-turn usage tracker. */
  async setLegendaryUsage(actor, usage, { user=globalThis.game?.user }={}) {
    assertPermission(canUpdateActor(user, actor), "CannotUpdateActor");
    return this.enqueue(actor, () => actor.update({ [`flags.${FLAG_SCOPE}.usage.legendary`]: usage }));
  }
}

export const resourceManager = new ResourceManager();
