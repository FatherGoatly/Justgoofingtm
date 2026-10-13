import diagnostics from "../core/diagnostics.js";

/**
 * Resource service: the single authority for reading and spending item uses / charges from module
 * code. Native activity consumption is owned by dnd5e; this service is only used by module-managed
 * mechanics (e.g. the "destroyed on last charge" roll) and by the runtime's validation step.
 */
export const resourceService = {
  /** Current uses of an item: { value, max, spent } or null. */
  uses(item) {
    const u = item?.system?.uses;
    if ( !u || !u.max ) return null;
    const max = Number(u.max) || 0;
    const spent = Number(u.spent) || 0;
    return { value: Math.max(0, max - spent), max, spent };
  },

  /** Does the item have at least `amount` uses available? */
  canSpend(item, amount=1) {
    const u = this.uses(item);
    return Boolean(u && u.value >= amount);
  },

  /**
   * Spend uses. Only used for module-managed mechanics; dnd5e activities consume on their own and
   * the runtime never calls this for a mechanic whose consumption is owned by an activity.
   */
  async spend(item, amount=1, { reason="" }={}) {
    const u = this.uses(item);
    if ( !u ) throw new Error(`${item?.name ?? "Item"} has no limited uses`);
    if ( u.value < amount ) throw new Error(`${item.name} has only ${u.value} of ${amount} required uses`);
    await item.update({ "system.uses.spent": u.spent + amount });
    diagnostics.debug(`Spent ${amount} use(s) of ${item.name}`, { reason });
    return this.uses(item);
  },

  /** Restore uses (module-managed recovery). */
  async restore(item, amount) {
    const u = this.uses(item);
    if ( !u ) return null;
    const spent = amount === undefined ? 0 : Math.max(0, u.spent - amount);
    await item.update({ "system.uses.spent": spent });
    return this.uses(item);
  },

  /** Resource attribute on an actor (e.g. resources.legres). */
  actorResource(actor, path) {
    const base = path.replace(/\.value$/, "");
    const r = foundry.utils.getProperty(actor?.system ?? {}, base);
    if ( !r ) return null;
    const max = Number(r.max) || 0;
    const spent = Number(r.spent) || 0;
    return { value: "value" in r ? Number(r.value) : max - spent, max };
  }
};

export default resourceService;
