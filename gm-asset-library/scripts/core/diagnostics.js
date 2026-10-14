import { MODULE_ID, MODULE_VERSION } from "./constants.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Module logger and diagnostics collector. Entries are kept in memory (bounded) for the diagnostics
 * view; they never contain file contents, only names/paths and error messages.
 */
class Diagnostics {
  level = "info";

  entries = [];

  maxEntries = 500;

  /** Counters that the diagnostics view summarizes. */
  counters = { failedSources: 0, unsupportedFormats: 0, previewFailures: 0, actionFailures: 0 };

  #log(level, message, data) {
    const entry = { level, message, data: data === undefined ? undefined : summarize(data), time: Date.now() };
    this.entries.push(entry);
    if ( this.entries.length > this.maxEntries ) this.entries.splice(0, this.entries.length - this.maxEntries);
    if ( LEVELS[level] < LEVELS[this.level] ) return;
    const prefix = `${MODULE_ID} |`;
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.log;
    if ( data !== undefined ) fn(prefix, message, data); else fn(prefix, message);
  }

  debug(message, data) { this.#log("debug", message, data); }

  info(message, data) { this.#log("info", message, data); }

  warn(message, data) { this.#log("warn", message, data); }

  error(message, data) { this.#log("error", message, data); }

  count(counter, n=1) { if ( counter in this.counters ) this.counters[counter] += n; }

  reset() { this.entries = []; for ( const k of Object.keys(this.counters) ) this.counters[k] = 0; }

  /** Build the report used by the diagnostics view. Extra sections are supplied by the services. */
  report(extra={}) {
    return {
      module: { id: MODULE_ID, version: MODULE_VERSION },
      foundry: { version: globalThis.game?.version ?? null, system: globalThis.game?.system?.id ?? null, systemVersion: globalThis.game?.system?.version ?? null },
      counters: { ...this.counters },
      recent: this.entries.slice(-100).reverse(),
      ...extra
    };
  }
}

function summarize(data) {
  if ( data instanceof Error ) return { name: data.name, message: data.message };
  if ( typeof data === "string" ) return data.length > 500 ? `${data.slice(0, 500)}…` : data;
  try { const s = JSON.stringify(data); return s.length > 2000 ? `${s.slice(0, 2000)}…` : JSON.parse(s); } catch { return String(data); }
}

const diagnostics = new Diagnostics();
export default diagnostics;
