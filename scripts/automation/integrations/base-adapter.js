import { compareVersions, moduleStatus } from "../../core/compatibility.js";

/**
 * Base class for integration adapters. Subclasses declare the module id, version range and the
 * capabilities they provide, and implement `detect()` using only documented, verified APIs.
 */
export class BaseAdapter {
  /** @type {string} */
  id = "";

  name = "";

  minVersion = "0.0.0";

  verifiedVersion = null;

  /** Capabilities exposed when active: [{ id, priority, description }] */
  capabilities = [];

  /** Documented API facts used by the adapter, for the compatibility report. */
  apiNotes = [];

  /**
   * Detect installation and compatibility. Must not throw for missing modules.
   * @returns {{installed: boolean, active: boolean, version: string|null, compatible: boolean, notes: string[]}}
   */
  detect() {
    const status = moduleStatus(this.id);
    const notes = [];
    let compatible = false;
    if ( status.installed && status.active ) {
      compatible = compareVersions(status.version, this.minVersion) >= 0;
      if ( !compatible ) notes.push(`Version ${status.version} is older than the minimum ${this.minVersion}.`);
      else if ( this.verifiedVersion && compareVersions(status.version, this.verifiedVersion) > 0 ) notes.push(`Version ${status.version} is newer than the verified ${this.verifiedVersion}; treated as theoretically compatible.`);
      const api = this.verifyApi();
      if ( !api.ok ) { compatible = false; notes.push(...api.problems); }
    }
    return { ...status, compatible, notes };
  }

  /** Verify the expected API surface exists. @returns {{ok: boolean, problems: string[]}} */
  verifyApi() { return { ok: true, problems: [] }; }

  /** Called on ready when the adapter is active. */
  initialize() {}
}
