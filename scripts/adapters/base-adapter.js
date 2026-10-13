/**
 * A system adapter tells the academy how to read common concepts (hit points, abilities) from a game system's
 * data and which workflows it can offer. Adapters declare their verified versions and report capabilities
 * instead of guessing.
 */
export class SystemAdapter {
  /** @type {string} System id this adapter serves ("*" for the generic fallback) */
  static id = "*";
  static title = "Generic";
  /** Versions whose source or documentation was read when writing the adapter. */
  static verified = { minimum: null, verified: null };

  /**
   * @param {object} env   Environment report from compatibility.describeEnvironment()
   */
  constructor(env) { this.env = env; }

  /** Does this adapter apply to the environment? */
  static matches(env) { return env?.system?.id === this.id; }

  /** Capabilities the adapter offers; lessons declare which ones they need. */
  get capabilities() { return new Set(["actor-name", "actor-type"]); }

  /** Dot path to a hit point object {value, max} or null when unknown. */
  get hpPath() { return null; }

  /**
   * Describe an actor in system-neutral terms. Works on real documents and on emulator/plain objects.
   * @param {object} actor
   * @returns {{name:string, type:string, hp:{value:number,max:number,temp:number}|null, ac:number|null, level:number|null, abilities:Record<string,{value:number,mod:number}>|null, notes:string[]}}
   */
  describeActor(actor) {
    const hp = this.readHP(actor);
    return { name: actor?.name ?? "?", type: actor?.type ?? "?", hp, ac: null, level: null, abilities: null, notes: hp ? [] : ["No hit point data recognised for this system; lessons that need hit points are marked as system-specific."] };
  }

  /**
   * Try a list of common hit point paths.
   * @param {object} actor
   * @returns {{value:number,max:number,temp:number}|null}
   */
  readHP(actor) {
    const sys = actor?.system ?? {};
    const candidates = [this.hpPath, "attributes.hp", "hp", "health", "attributes.health", "resources.hp"].filter(Boolean);
    for ( const path of candidates ) {
      const hp = path.split(".").reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), sys);
      if ( hp && typeof hp === "object" && Number.isFinite(Number(hp.value)) ) return { value: Number(hp.value), max: Number.isFinite(Number(hp.max)) ? Number(hp.max) : null, temp: Number.isFinite(Number(hp.temp)) ? Number(hp.temp) : 0, path: `system.${path}` };
    }
    return null;
  }

  /** Is this actor "below half health"? Returns null when unknown. */
  isBloodied(actor) { const hp = this.readHP(actor); if ( !hp || !hp.max ) return null; return hp.value <= hp.max / 2; }

  /** Update data that would set the actor's current hit points, or null when unsupported. */
  hpUpdate(actor, value) { const hp = this.readHP(actor); return hp ? { [`${hp.path}.value`]: value } : null; }

  /** Human-readable summary of what the adapter does and does not support. */
  describe() { return { id: this.constructor.id, title: this.constructor.title, verified: this.constructor.verified, capabilities: [...this.capabilities] }; }
}
