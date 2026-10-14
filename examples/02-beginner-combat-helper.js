/**
 * Project: a basic combat helper
 * Level: Beginner. Lesson: t1-combat-helper (The Game Master's Macro Academy, Tier 1).
 * Exercise: t1-combat-helper-build (build-project). Tested in: the JavaScript sandbox (no Foundry APIs).
 * Verified against: Foundry VTT 14.369 API documentation. System: any (core Foundry APIs only).
 * Access: reads=false writes=false creates=false mechanics=false.
 *
 * Implement `resolveHit(roll, attackBonus, ac)` (returns "critical" | "fumble" | "hit" | "miss"), `applyDamage(target, amount)` (returns a NEW target object with hp clamped to 0..maxHP, original untouched), and `resolveAttack(attacker, target, roll)` returning `{ ok, outcome, target, message }`. Rules: natural 20 = critical with double damage; natural 1 = fumble; roll + attackBonus >= ac hits; inval…
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
function resolveHit(roll, attackBonus, ac) {
  if (roll === 20) return "critical";
  if (roll === 1) return "fumble";
  return roll + attackBonus >= ac ? "hit" : "miss";
}

function applyDamage(target, amount) {
  const hp = Math.max(0, Math.min(target.maxHP, target.hp - amount));
  return { ...target, hp };
}

function resolveAttack(attacker, target, roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) return { ok: false, message: `Invalid roll: ${roll}` };
  const outcome = resolveHit(roll, attacker.attackBonus, target.ac);
  if (outcome === "miss" || outcome === "fumble") {
    return { ok: true, outcome, target, message: `${attacker.name} misses ${target.name} (${outcome}).` };
  }
  const damage = outcome === "critical" ? attacker.damage * 2 : attacker.damage;
  const after = applyDamage(target, damage);
  const status = after.hp === 0 ? " and drops!" : ` (${after.hp}/${after.maxHP} HP left)`;
  return { ok: true, outcome, target: after, message: `${attacker.name} hits ${target.name} for ${damage}${status}` };
}
