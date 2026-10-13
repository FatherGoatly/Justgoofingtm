import { MODULE_ID } from "./constants.js";

/**
 * Structured diagnostics: a leveled logger plus an in-memory import log that the UI and
 * the final report can read. No Foundry dependency so tests can use it.
 */
export const LEVELS = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

class Diagnostics {
  #level = LEVELS.info;

  #entries = [];

  #maxEntries = 2000;

  get level() { return this.#level; }

  set level(value) {
    this.#level = typeof value === "string" ? (LEVELS[value] ?? LEVELS.info) : value;
  }

  /** @returns {object[]} A copy of the recorded entries. */
  get entries() { return [...this.#entries]; }

  clear() { this.#entries = []; }

  /**
   * Record an entry.
   * @param {"error"|"warn"|"info"|"debug"} level
   * @param {string} message
   * @param {object} [data]
   * @returns {object} The stored entry.
   */
  record(level, message, data) {
    const entry = { level, message, data, time: Date.now() };
    this.#entries.push(entry);
    if ( this.#entries.length > this.#maxEntries ) this.#entries.shift();
    if ( LEVELS[level] <= this.#level ) {
      const prefix = `${MODULE_ID} |`;
      const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      if ( data !== undefined ) fn(prefix, message, data);
      else fn(prefix, message);
    }
    return entry;
  }

  error(message, data) { return this.record("error", message, data); }

  warn(message, data) { return this.record("warn", message, data); }

  info(message, data) { return this.record("info", message, data); }

  debug(message, data) { return this.record("debug", message, data); }

  /**
   * Create a scoped collector used during a single import. Collected entries are also recorded
   * globally.
   * @param {string} scope
   */
  collector(scope) {
    const items = [];
    const push = (level, message, data) => {
      items.push({ level, message, data, scope });
      this.record(level, `[${scope}] ${message}`, data);
    };
    return {
      items,
      error: (m, d) => push("error", m, d),
      warn: (m, d) => push("warn", m, d),
      info: (m, d) => push("info", m, d),
      debug: (m, d) => push("debug", m, d),
      get hasErrors() { return items.some(i => i.level === "error"); },
      get warnings() { return items.filter(i => i.level === "warn"); },
      get errors() { return items.filter(i => i.level === "error"); }
    };
  }
}

export const diagnostics = new Diagnostics();
export default diagnostics;
