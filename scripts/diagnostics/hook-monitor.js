/**
 * Observes a chosen set of hooks and records when they fire. Starting and stopping are explicit; nothing is
 * monitored by default. Registered handlers never modify arguments or return false.
 */
import { Logger } from "../core/logger.js";

export const SUGGESTED_HOOKS = Object.freeze([
  "updateActor", "createActor", "deleteActor", "updateToken", "createToken", "deleteToken", "controlToken", "targetToken",
  "createChatMessage", "renderChatMessageHTML", "updateCombat", "combatTurn", "combatRound", "createCombatant", "deleteCombatant",
  "canvasReady", "updateScene", "createItem", "updateItem", "deleteItem", "createActiveEffect", "deleteActiveEffect", "updateUser"
]);

export class HookMonitor {
  constructor({ max=200 }={}) {
    this.max = max;
    this.events = [];
    this.registrations = new Map();
    this.listeners = new Set();
  }

  get active() { return this.registrations.size > 0; }
  get watched() { return [...this.registrations.keys()]; }

  onEvent(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /**
   * Start watching hooks.
   * @param {string[]} names
   */
  start(names) {
    for ( const name of names ) {
      if ( this.registrations.has(name) ) continue;
      const id = Hooks.on(name, (...args) => this.#record(name, args));
      this.registrations.set(name, id);
    }
  }

  stop(names=null) {
    for ( const [name, id] of [...this.registrations] ) {
      if ( names && !names.includes(name) ) continue;
      try { Hooks.off(name, id); } catch(err) { Logger.report(`Unregistering ${name}`, err); }
      this.registrations.delete(name);
    }
  }

  clear() { this.events = []; for ( const fn of this.listeners ) fn(null); }

  #record(name, args) {
    const entry = { at: Date.now(), name, summary: args.map(describeArg).join(", ") };
    this.events.push(entry);
    if ( this.events.length > this.max ) this.events.splice(0, this.events.length - this.max);
    for ( const fn of this.listeners ) { try { fn(entry); } catch(err) { Logger.report("Hook monitor listener", err); } }
  }
}

/** Describe a hook argument briefly and safely (no deep serialization of documents). */
export function describeArg(arg) {
  if ( arg === null || arg === undefined ) return String(arg);
  if ( typeof arg !== "object" ) return typeof arg === "string" ? JSON.stringify(arg.length > 40 ? `${arg.slice(0, 40)}…` : arg) : String(arg);
  if ( arg.documentName ) return `${arg.documentName}(${arg.name ?? arg.id})`;
  if ( arg.document?.documentName ) return `${arg.document.documentName}Object(${arg.document.name ?? arg.document.id})`;
  if ( Array.isArray(arg) ) return `Array(${arg.length})`;
  const keys = Object.keys(arg);
  return `{${keys.slice(0, 4).join(", ")}${keys.length > 4 ? ", …" : ""}}`;
}
