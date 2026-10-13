import { SystemAdapter } from "../base-adapter.js";

/** Generic adapter used when no system-specific adapter matches. Works with core Foundry concepts only. */
export class CoreAdapter extends SystemAdapter {
  static id = "*";
  static title = "Generic (core Foundry only)";
  static verified = { minimum: "14", verified: "14.369" };
  static matches() { return true; }
  get capabilities() { return new Set(["actor-name", "actor-type", "hp-guess"]); }
}
