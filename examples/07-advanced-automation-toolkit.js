/**
 * Project: a reusable automation toolkit
 * Level: Advanced. Lesson: t6-automation-toolkit (The Game Master's Macro Academy, Tier 6).
 * Exercise: t6-automation-toolkit-build (build-project). Tested in: the Foundry emulator with the "practice" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: any (core Foundry APIs only).
 * Access: reads=true writes=true creates=true mechanics=true.
 *
 * In one program: install `globalThis.gmToolkit` (with `??=`) carrying `version` '1.0.0', a `log` layer (prefix 'Toolkit |', debugEnabled flag, debug/info/warn/error), a `config` layer with `validate(input)` for schema `{ healAmount: number default 5 (positive integer), whisper: boolean default true }` returning `{ config, errors, ok }`, a `targets` layer (`controlled`, `living`, `owned`, `byId`, `n…
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
const T = globalThis.gmToolkit ??= {};
T.version = "1.0.0";
T.log = { prefix: "Toolkit |", debugEnabled: T.log?.debugEnabled ?? false,
  debug(...a) { if (this.debugEnabled) console.debug(this.prefix, ...a); }, info(...a) { console.info(this.prefix, ...a); }, warn(...a) { console.warn(this.prefix, ...a); }, error(...a) { console.error(this.prefix, ...a); } };
const schema = { healAmount: { type: "number", default: 5, validate: v => (Number.isInteger(v) && v > 0) || "must be a positive whole number" }, whisper: { type: "boolean", default: true } };
T.config = {
  schema,
  validate(input = {}) {
    const config = {}, errors = [];
    for (const [key, rule] of Object.entries(schema)) {
      const value = input[key] === undefined ? rule.default : input[key];
      if (typeof value !== rule.type) { errors.push(`${key}: expected ${rule.type}`); config[key] = rule.default; continue; }
      const check = rule.validate ? rule.validate(value) : true;
      if (check !== true) { errors.push(`${key}: ${check}`); config[key] = rule.default; continue; }
      config[key] = value;
    }
    for (const key of Object.keys(input)) if (!(key in schema)) errors.push(`${key}: unknown key`);
    return { config, errors, ok: errors.length === 0 };
  }
};
T.targets = { controlled: () => canvas.tokens.controlled, living: l => l.filter(t => (t.actor?.system?.attributes?.hp?.value ?? 0) > 0), owned: l => l.filter(t => t.actor?.isOwner), byId: id => canvas.scene?.tokens.get(id) ?? null, names: l => l.map(t => t.name) };
T.diagnostics = { requirements: ({ generation = 14, system = null, modules = [] } = {}) => { const p = []; if (game.release.generation !== generation) p.push(`Foundry generation ${generation} required`); if (system && game.system.id !== system) p.push(`system ${system} required`); for (const id of modules) if (!game.modules.get(id)?.active) p.push(`module ${id} not active`); return p; } };
T.hooks ??= { registry: {} };
T.hooks.register = (name, event, fn) => { const prev = T.hooks.registry[name]; if (prev) Hooks.off(prev.event, prev.id); T.hooks.registry[name] = { event, id: Hooks.on(event, fn) }; };
T.cancel = () => Object.assign(new Error("cancelled"), { cancelled: true });
T.guarded = async (label, fn) => {
  try { const result = await fn(); T.log.info(label + ":", result ?? "done"); return { ok: true, result }; }
  catch (err) { if (err?.cancelled) return { ok: false, cancelled: true }; T.log.error(label + " failed", err); ui.notifications.error(`${label} failed: ${err.message}`); return { ok: false, error: err }; }
};

const problems = T.diagnostics.requirements({ generation: 14, system: "dnd5e" });
if (problems.length) return ui.notifications.warn(problems.join("; "));
const store = game.journal.getName("Campaign Notes");
const { config } = T.config.validate(store.getFlag("world", "toolkit") ?? {});
T.hooks.register("downWatch", "updateActor", (a, changes) => { if (changes.system?.attributes?.hp?.value === 0) T.log.info(a.name, "is down"); });
T.hooks.register("downWatch", "updateActor", (a, changes) => { if (changes.system?.attributes?.hp?.value === 0) T.log.info(a.name, "is down"); });
const esc = foundry.utils.escapeHTML;
await T.guarded("Heal party", async () => {
  const ids = T.targets.owned(T.targets.living(T.targets.controlled())).map(t => t.id);
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Heal" }, content: `<p>Heal ${ids.length} tokens by ${config.healAmount}?</p>` });
  if (!ok) throw T.cancel();
  const lines = [];
  for (const id of ids) {
    const t = T.targets.byId(id);
    if (!t?.actor?.isOwner) continue;
    const hp = t.actor.system.attributes.hp;
    await t.actor.update({ "system.attributes.hp.value": Math.min(hp.max, hp.value + config.healAmount) });
    lines.push(`${esc(t.name)} (${t.actor.system.attributes.hp.value})`);
  }
  await ChatMessage.create({ content: `<p>Healed: ${lines.join(", ")}</p>`, whisper: config.whisper ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : [] });
  return lines.length + " healed";
});
console.log(Hooks.events.updateActor.length, globalThis.gmToolkit.version);
