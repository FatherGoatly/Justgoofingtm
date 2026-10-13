import { mechanicRegistry } from "../rules/mechanic-registry.js";
import { MECHANIC_CATEGORY } from "../core/constants.js";
import { REVIEW_POLICIES } from "../core/settings.js";

/**
 * Compatibility analysis (pipeline stage 7): decide, for every mechanic in a bundle, which
 * implementation owner will realise it given the capability registry, the GM's policies and the
 * context (e.g. whether referenced spells were found). Mutates mechanic.implementation.
 *
 * @param {object} bundle
 * @param {object} options
 * @param {Set<string>|function} options.capabilities
 * @param {boolean} [options.macrosAllowed=false]
 * @param {boolean} [options.automationEnabled=true]
 * @param {boolean} [options.preferNative=true]
 * @param {string} [options.reviewPolicy="ambiguous"]
 * @param {function} [options.context]   (mechanic, item) → extra context
 * @returns {object} summary
 */
export function planBundle(bundle, options={}) {
  const summary = { total: 0, byOwner: {}, byCategory: {}, review: 0, disabled: 0 };
  const visit = (item) => {
    for ( const m of item.mechanics ?? [] ) {
      planMechanic(m, item, options);
      summary.total++;
      summary.byOwner[m.implementation.owner] = (summary.byOwner[m.implementation.owner] ?? 0) + 1;
      summary.byCategory[m.category] = (summary.byCategory[m.category] ?? 0) + 1;
      if ( m.reviewRequired ) summary.review++;
      if ( !m.enabled ) summary.disabled++;
    }
    for ( const c of item.contents ?? [] ) visit(c);
  };
  for ( const entry of bundle.entries ?? [] ) {
    if ( entry.kind === "actor" ) (entry.items ?? []).forEach(visit);
    else visit(entry);
  }
  bundle.plan = summary;
  return summary;
}

/**
 * Plan a single mechanic.
 */
export function planMechanic(m, item, options={}) {
  const automationEnabled = options.automationEnabled !== false;
  const reviewPolicy = options.reviewPolicy ?? REVIEW_POLICIES.ambiguous;
  m.implementation ??= {};
  if ( !automationEnabled ) {
    m.implementation = { ...m.implementation, owner: "manual", notes: "Automation disabled by the GM.", requires: [] };
    m.category = m.category === MECHANIC_CATEGORY.NATIVE ? MECHANIC_CATEGORY.NATIVE : MECHANIC_CATEGORY.UNRESOLVED;
    m.enabled = m.category === MECHANIC_CATEGORY.NATIVE;
    return m;
  }
  // Mechanics already realised natively by the interpreter keep their owner.
  if ( m.implementation.owner && ["native", "native-alt-activity", "effect"].includes(m.implementation.owner) ) {
    m.enabled = m.enabled !== false;
  } else if ( m.category === MECHANIC_CATEGORY.UNRESOLVED && m.implementation.owner === "manual" ) {
    m.enabled = false;
  } else {
    const context = { ...(options.context?.(m, item) ?? {}) };
    const sel = mechanicRegistry.selectImplementation(m, { capabilities: options.capabilities ?? new Set(), preferNative: options.preferNative !== false, macrosAllowed: Boolean(options.macrosAllowed), context });
    m.implementation = { ...m.implementation, owner: sel.owner, category: sel.category, notes: sel.notes, requires: sel.requires };
    if ( sel.owner === "manual" ) { m.category = MECHANIC_CATEGORY.UNRESOLVED; m.enabled = false; }
    else { m.category = sel.category; m.enabled = m.enabled !== false; }
  }
  // Review policy
  if ( reviewPolicy === REVIEW_POLICIES.always ) m.reviewRequired = m.category !== MECHANIC_CATEGORY.NATIVE || m.confidence < 0.9;
  else if ( reviewPolicy === REVIEW_POLICIES.never ) { if ( m.reviewRequired ) m.enabled = false; m.reviewRequired = false; }
  return m;
}
