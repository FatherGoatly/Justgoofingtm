/**
 * Idempotent roll registry. Each logical roll receives a stable key; the registry remembers processed keys so that
 * several hooks observing one roll (`dnd5e.rollSavingThrow` + `dnd5e.rollDeathSave` + `createChatMessage`, or a
 * Midi-QOL workflow re-reporting the same attack) produce at most one award.
 *
 * Free of Foundry globals for unit testing.
 */

import { MODULE_ID } from "./constants.js";

export const KEY_SOURCES = Object.freeze({
  TAG: "tag",
  WORKFLOW: "workflow",
  MESSAGE: "message",
  OBJECT: "object",
  NONE: "none"
});

/**
 * Read the module tag stored on a roll's options (assigned at roll configuration time).
 * @param {object} roll
 * @returns {string|null}
 */
export function getRollTag(roll) {
  const tag = roll?.options?.[MODULE_ID]?.rollId;
  return ((typeof tag === "string") && tag.length) ? tag : null;
}

/**
 * Store a module tag on a roll's options. Options are serialized with the roll into chat messages.
 * @param {object} roll
 * @param {string} id
 * @returns {string}
 */
export function setRollTag(roll, id) {
  roll.options ??= {};
  roll.options[MODULE_ID] ??= {};
  roll.options[MODULE_ID].rollId = id;
  return id;
}

/**
 * Build the most reliable dedupe key available for a roll.
 * @param {object} params
 * @param {object} params.roll            Roll instance or data.
 * @param {string} [params.messageId]     ID of the chat message carrying the roll.
 * @param {number} [params.index]         Index of the roll within the message.
 * @param {string} [params.workflowKey]   Identifier of an automation workflow (e.g. a Midi-QOL workflow uuid).
 * @returns {{key: string|null, source: string}}
 */
export function buildRollKey({ roll, messageId, index, workflowKey }={}) {
  const tag = getRollTag(roll);
  if ( tag ) return { key: `tag:${tag}`, source: KEY_SOURCES.TAG };
  if ( workflowKey ) return { key: `workflow:${workflowKey}`, source: KEY_SOURCES.WORKFLOW };
  if ( messageId ) return { key: `message:${messageId}:${index ?? 0}`, source: KEY_SOURCES.MESSAGE };
  return { key: null, source: KEY_SOURCES.NONE };
}

/**
 * Registry of processed rolls with time-based expiry and object-identity tracking.
 */
export class RollRegistry {
  /**
   * @param {object} [options]
   * @param {number} [options.ttl=900000]   Milliseconds a key is remembered.
   * @param {number} [options.max=5000]     Maximum number of keys retained.
   * @param {Function} [options.now]        Clock function (for tests).
   */
  constructor({ ttl=15 * 60 * 1000, max=5000, now=() => Date.now() }={}) {
    this.ttl = ttl;
    this.max = max;
    this.now = now;
    this.keys = new Map();
    this.objects = new WeakSet();
  }

  /**
   * Whether a roll (by key or by object identity) has already been processed.
   * @param {string|null} key
   * @param {object} [roll]
   * @returns {boolean}
   */
  has(key, roll) {
    this.prune();
    if ( key && this.keys.has(key) ) return true;
    if ( roll && (typeof roll === "object") && this.objects.has(roll) ) return true;
    return false;
  }

  /**
   * Mark a roll as processed.
   * @param {string|null} key
   * @param {object} [roll]
   * @returns {boolean}  False if it was already present.
   */
  add(key, roll) {
    if ( this.has(key, roll) ) return false;
    if ( key ) this.keys.set(key, this.now());
    if ( roll && (typeof roll === "object") ) this.objects.add(roll);
    this.prune();
    return true;
  }

  /**
   * Atomically claim a roll: returns true the first time, false afterwards.
   * @param {string|null} key
   * @param {object} [roll]
   * @returns {boolean}
   */
  claim(key, roll) {
    return this.add(key, roll);
  }

  /**
   * Forget a key (used when an award fails so a retry can happen).
   * @param {string|null} key
   * @param {object} [roll]
   */
  release(key, roll) {
    if ( key ) this.keys.delete(key);
    if ( roll && (typeof roll === "object") ) this.objects.delete(roll);
  }

  /** Remove expired keys and enforce the size limit. */
  prune() {
    const cutoff = this.now() - this.ttl;
    for ( const [key, time] of this.keys ) {
      if ( time < cutoff ) this.keys.delete(key);
    }
    while ( this.keys.size > this.max ) {
      const oldest = this.keys.keys().next().value;
      this.keys.delete(oldest);
    }
  }

  get size() {
    return this.keys.size;
  }
}
