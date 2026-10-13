/**
 * Diagnostics: a ring buffer of recent classification decisions plus console logging when enabled.
 */

import { MODULE_ID } from "./constants.js";
import { getSetting, SETTINGS } from "./settings.js";

const MAX_ENTRIES = 100;

export class Diagnostics {
  constructor({ max=MAX_ENTRIES }={}) {
    this.max = max;
    this.entries = [];
  }

  get enabled() {
    return getSetting(SETTINGS.DIAGNOSTICS) === true;
  }

  /**
   * Record a decision about a roll.
   * @param {object} entry
   * @returns {object}
   */
  record(entry) {
    const record = { timestamp: Date.now(), ...entry };
    this.entries.unshift(record);
    if ( this.entries.length > this.max ) this.entries.length = this.max;
    if ( this.enabled ) console.debug(`${MODULE_ID} |`, record);
    return record;
  }

  /** Recent entries, newest first. */
  recent(limit=25) {
    return this.entries.slice(0, limit);
  }

  clear() {
    this.entries.length = 0;
  }

  log(...args) {
    if ( this.enabled ) console.log(`${MODULE_ID} |`, ...args);
  }

  warn(...args) {
    console.warn(`${MODULE_ID} |`, ...args);
  }

  error(...args) {
    console.error(`${MODULE_ID} |`, ...args);
  }
}

export const diagnostics = new Diagnostics();
