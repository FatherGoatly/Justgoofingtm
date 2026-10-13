/**
 * Pure arithmetic for resource pools. All persistence goes through ResourceManager; this file only computes.
 */

import { MAX_PER_POOL } from "./constants.js";

/**
 * Coerce a stored value into a valid pool count.
 * @param {*} value
 * @param {number} [max]
 * @returns {number}
 */
export function clampPool(value, max=MAX_PER_POOL) {
  const n = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  return Math.min(Math.max(n, 0), Math.max(max, 0));
}

/**
 * Compute the result of awarding one resource.
 * @param {number} current
 * @param {number} [max]
 * @returns {{before: number, after: number, applied: boolean, blocked: boolean}}
 */
export function computeAward(current, max=MAX_PER_POOL) {
  const before = clampPool(current, Number.MAX_SAFE_INTEGER);
  if ( before >= max ) return { before, after: before, applied: false, blocked: true };
  return { before, after: before + 1, applied: true, blocked: false };
}

/**
 * Compute the result of spending resources.
 * @param {number} current
 * @param {number} [cost=1]
 * @returns {{before: number, after: number, ok: boolean, reason: string|null}}
 */
export function computeSpend(current, cost=1) {
  const before = clampPool(current, Number.MAX_SAFE_INTEGER);
  const amount = Math.trunc(Number(cost));
  if ( !Number.isFinite(amount) || (amount < 1) ) return { before, after: before, ok: false, reason: "invalidCost" };
  if ( before < amount ) return { before, after: before, ok: false, reason: "insufficient" };
  return { before, after: before - amount, ok: true, reason: null };
}

/**
 * Compute an administrative adjustment or set.
 * @param {number} current
 * @param {object} change
 * @param {number} [change.delta]        Relative change.
 * @param {number} [change.value]        Absolute value (takes precedence over delta).
 * @param {number} [change.max]          Pool maximum.
 * @param {boolean} [change.override]    Permit exceeding the maximum (administrative override).
 * @returns {{before: number, after: number, changed: boolean, clamped: boolean, overridden: boolean}}
 */
export function computeAdjust(current, { delta=0, value, max=MAX_PER_POOL, override=false }={}) {
  const before = clampPool(current, Number.MAX_SAFE_INTEGER);
  let target = (value !== undefined) && (value !== null) ? Number(value) : before + Number(delta);
  if ( !Number.isFinite(target) ) target = before;
  target = Math.trunc(target);
  let clamped = false;
  if ( target < 0 ) { target = 0; clamped = true; }
  if ( !override && (target > max) ) { target = max; clamped = true; }
  const overridden = override && (target > max);
  return { before, after: target, changed: target !== before, clamped, overridden };
}
