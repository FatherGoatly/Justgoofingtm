/**
 * Expert capstone: the independent engineer
 * Level: Expert. Lesson: t9-capstone (The Game Master's Macro Academy, Tier 9).
 * Exercise: t9-capstone-core (build-project). Tested in: the Foundry emulator with the "practice" practice fixture.
 * Verified against: Foundry VTT 14.369 API documentation. System: any (core Foundry APIs only).
 * Access: reads=true writes=true creates=true mechanics=true.
 *
 * Build the configuration service every challenge needs, as a reusable object `ConfigService` created by `createConfigService({ schema, migrations, version, load, save })` where `load()` returns the stored object (or undefined) and `save(obj)` persists it. It must expose `async get()` → `{ config, errors, migrated }` (load, migrate with the chain bounded by `version`, validate against the schema col…
 *
 * Before running live: read it, run it in the Academy workshop against the practice fixtures, then run it on the
 * practice scene the Academy creates (Diagnostics → Practice fixtures). Never run it on real campaign data first.
 */
function createConfigService({ schema, migrations, version, load, save }) {
  const newer = foundry.utils.isNewerVersion;
  function migrate(stored) {
    const from = stored.schemaVersion ?? "1.0.0";
    let data = { ...stored };
    const applied = [];
    for (const m of [...migrations].sort((a, b) => (newer(a.version, b.version) ? 1 : newer(b.version, a.version) ? -1 : 0))) {
      if (!newer(m.version, from) || newer(m.version, version)) continue;
      data = m.up(data); applied.push(m.version);
    }
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    return { data, applied };
  }
  function validate(input) {
    const config = {}, errors = [];
    for (const [k, r] of Object.entries(schema)) {
      const v = input[k] === undefined ? r.default : input[k];
      if (typeof v !== r.type) { errors.push(`${k}: expected ${r.type}`); config[k] = r.default; } else config[k] = v;
    }
    return { config, errors };
  }
  return {
    async get() {
      const stored = await load();
      const had = stored !== undefined;
      const { data, applied } = migrate(stored ?? {});
      const { config, errors } = validate(data);
      if (applied.length || !had) await save({ ...config, schemaVersion: version });
      return { config, errors, migrated: applied.length > 0 };
    },
    async set(partial) {
      const { config } = await this.get();
      const { config: next } = validate({ ...config, ...partial });
      await save({ ...next, schemaVersion: version });
      return next;
    }
  };
}
const store = game.journal.getName("Campaign Notes");
await store.setFlag("world", "capstone", { range: 15, dc: "13", amount: 8, damageType: "cold" });   // legacy 1.0.0 data
const svc = createConfigService({
  schema: { range: { type: "number", default: 15 }, dc: { type: "number", default: 13 }, amount: { type: "number", default: 8 }, type: { type: "string", default: "thunder" } },
  migrations: [{ version: "1.1.0", up: d => ({ ...d, type: d.damageType ?? d.type, damageType: undefined }) }],
  version: "1.1.0",
  load: () => store.getFlag("world", "capstone"),
  save: async obj => { await store.unsetFlag("world", "capstone"); return store.setFlag("world", "capstone", obj); }   // flags merge on write; clear first so removed keys disappear
});
const result = await svc.get();
console.log(JSON.stringify(result));
await svc.set({ dc: 15 });
const flag = store.getFlag("world", "capstone");
console.log(flag.dc, flag.schemaVersion);
