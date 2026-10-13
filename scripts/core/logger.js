import { MODULE_ID } from "./constants.js";

/**
 * Structured logging. Learners also meet this helper in Tier 6 (logging strategies), so it stays small and readable.
 */
export class Logger {
  static #prefix = `${MODULE_ID} |`;
  static #debugEnabled = false;

  static set debug(value) { Logger.#debugEnabled = Boolean(value); }
  static get debug() { return Logger.#debugEnabled; }

  static info(message, ...data) { console.info(Logger.#prefix, message, ...data); }
  static warn(message, ...data) { console.warn(Logger.#prefix, message, ...data); }
  static error(message, ...data) { console.error(Logger.#prefix, message, ...data); }
  static trace(message, ...data) { if ( Logger.#debugEnabled ) console.debug(Logger.#prefix, message, ...data); }

  /**
   * Log an error and optionally notify the user. Never throws.
   * @param {string} context      Where the error happened
   * @param {Error|unknown} error
   * @param {object} [options]
   * @param {boolean} [options.notify=false]
   */
  static report(context, error, { notify=false }={}) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(Logger.#prefix, `${context}:`, err);
    if ( notify && globalThis.ui?.notifications ) {
      ui.notifications.error(`${context}: ${err.message}`, { console: false });
    }
  }
}
