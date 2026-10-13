/**
 * Draft storage for the workshop. Drafts live in a user-scoped setting (server-side, per user, private to that
 * user and the GM who administers the world), with size limits so the setting never grows beyond a modest
 * budget. A client-side autosave (localStorage) protects against lost edits between saves.
 */
import { MODULE_ID, SETTINGS, LIMITS } from "../core/constants.js";
import { byteSize, shortId, clone } from "../utilities/text.js";
import { Logger } from "../core/logger.js";

export const DRAFTS_SCHEMA_VERSION = 1;

/** @returns {{version:number, drafts:Record<string, object>}} */
export function createEmptyDraftStore() { return { version: DRAFTS_SCHEMA_VERSION, drafts: {} }; }

/**
 * Validate and normalise a draft store object loaded from storage. Unknown fields are dropped; invalid drafts
 * are skipped (never thrown away silently: they are reported).
 * @param {unknown} raw
 * @returns {{store:object, dropped:string[]}}
 */
export function normalizeDraftStore(raw) {
  const store = createEmptyDraftStore();
  const dropped = [];
  if ( !raw || typeof raw !== "object" || typeof raw.drafts !== "object" || raw.drafts === null ) return { store, dropped };
  for ( const [id, d] of Object.entries(raw.drafts) ) {
    if ( !d || typeof d !== "object" || typeof d.code !== "string" || typeof d.name !== "string" ) { dropped.push(id); continue; }
    store.drafts[id] = {
      id: String(d.id ?? id),
      name: d.name.slice(0, 120),
      description: typeof d.description === "string" ? d.description.slice(0, 500) : "",
      code: d.code.slice(0, LIMITS.MAX_DRAFT_BYTES),
      runtime: ["sandbox", "preview", "live"].includes(d.runtime) ? d.runtime : "sandbox",
      exerciseId: typeof d.exerciseId === "string" ? d.exerciseId : null,
      lessonId: typeof d.lessonId === "string" ? d.lessonId : null,
      starter: typeof d.starter === "string" ? d.starter : null,
      createdAt: Number.isFinite(d.createdAt) ? d.createdAt : Date.now(),
      updatedAt: Number.isFinite(d.updatedAt) ? d.updatedAt : Date.now(),
      versions: Array.isArray(d.versions) ? d.versions.filter(v => v && typeof v.code === "string" && Number.isFinite(v.savedAt)).slice(-LIMITS.MAX_DRAFT_VERSIONS).map(v => ({ savedAt: v.savedAt, code: v.code })) : []
    };
  }
  return { store, dropped };
}

export class DraftService {
  /**
   * @param {object} [options]
   * @param {Function} [options.load]   Returns raw store (default: user setting)
   * @param {Function} [options.save]   Persists store (default: user setting)
   */
  constructor({ load=null, save=null }={}) {
    this._load = load ?? (() => { try { return game.settings.get(MODULE_ID, SETTINGS.DRAFTS); } catch(_err) { return null; } });
    this._save = save ?? (store => game.settings.set(MODULE_ID, SETTINGS.DRAFTS, store));
    this.store = null;
  }

  /** Load (and normalise) the store. */
  load() {
    const { store, dropped } = normalizeDraftStore(this._load());
    if ( dropped.length ) Logger.warn(`Dropped ${dropped.length} malformed draft record(s): ${dropped.join(", ")}`);
    this.store = store;
    return store;
  }

  get drafts() { if ( !this.store ) this.load(); return this.store.drafts; }

  /** @returns {object[]} Drafts sorted by most recently updated */
  list() { return Object.values(this.drafts).sort((a, b) => b.updatedAt - a.updatedAt); }

  get(id) { return this.drafts[id] ?? null; }

  /** Find the draft associated with an exercise, if any. */
  forExercise(exerciseId) { return this.list().find(d => d.exerciseId === exerciseId) ?? null; }

  /** Storage usage summary. */
  usage() {
    const count = Object.keys(this.drafts).length;
    const bytes = byteSize(this.store);
    return { count, maxCount: LIMITS.MAX_DRAFTS, bytes, maxBytes: LIMITS.MAX_TOTAL_DRAFT_BYTES, percent: Math.round(100 * bytes / LIMITS.MAX_TOTAL_DRAFT_BYTES) };
  }

  /**
   * Create a draft.
   * @param {object} data
   * @returns {Promise<object>}
   */
  async create({ name, code="", description="", runtime="sandbox", exerciseId=null, lessonId=null, starter=null }) {
    if ( Object.keys(this.drafts).length >= LIMITS.MAX_DRAFTS ) throw new Error(`You have reached the limit of ${LIMITS.MAX_DRAFTS} drafts. Delete or export some drafts first.`);
    assertCodeSize(code);
    const now = Date.now();
    const id = (globalThis.foundry?.utils?.randomID?.() ?? shortId());
    const draft = { id, name: String(name || "Untitled draft").slice(0, 120), description: String(description).slice(0, 500), code, runtime, exerciseId, lessonId, starter, createdAt: now, updatedAt: now, versions: [] };
    this.drafts[id] = draft;
    await this.#persist();
    return draft;
  }

  /**
   * Save new code into a draft, keeping a version history.
   * @param {string} id
   * @param {string} code
   * @param {object} [changes]  Optional name/description/runtime changes
   * @returns {Promise<object>}
   */
  async save(id, code, changes={}) {
    const draft = this.get(id);
    if ( !draft ) throw new Error("Draft not found.");
    assertCodeSize(code);
    if ( draft.code !== code ) {
      draft.versions.push({ savedAt: draft.updatedAt, code: draft.code });
      if ( draft.versions.length > LIMITS.MAX_DRAFT_VERSIONS ) draft.versions.splice(0, draft.versions.length - LIMITS.MAX_DRAFT_VERSIONS);
      draft.code = code;
    }
    if ( typeof changes.name === "string" && changes.name.trim() ) draft.name = changes.name.trim().slice(0, 120);
    if ( typeof changes.description === "string" ) draft.description = changes.description.slice(0, 500);
    if ( ["sandbox", "preview", "live"].includes(changes.runtime) ) draft.runtime = changes.runtime;
    draft.updatedAt = Date.now();
    await this.#persist();
    return draft;
  }

  async rename(id, name) { return this.save(id, this.get(id)?.code ?? "", { name }); }

  /** Duplicate a draft (before making risky edits, for example). */
  async duplicate(id) {
    const src = this.get(id);
    if ( !src ) throw new Error("Draft not found.");
    return this.create({ name: `${src.name} (copy)`, code: src.code, description: src.description, runtime: src.runtime, exerciseId: null, lessonId: src.lessonId, starter: src.starter });
  }

  async delete(id) {
    if ( !this.drafts[id] ) return false;
    delete this.drafts[id];
    await this.#persist();
    return true;
  }

  /** Restore an older version into the draft (the current code is kept as a version). */
  async restoreVersion(id, index) {
    const draft = this.get(id);
    const v = draft?.versions?.[index];
    if ( !v ) throw new Error("Version not found.");
    return this.save(id, v.code);
  }

  async #persist() {
    const bytes = byteSize(this.store);
    if ( bytes > LIMITS.MAX_TOTAL_DRAFT_BYTES ) throw new Error(`Draft storage would exceed its budget (${Math.round(bytes / 1024)} KB of ${Math.round(LIMITS.MAX_TOTAL_DRAFT_BYTES / 1024)} KB). Delete old drafts or versions first.`);
    await this._save(clone(this.store));
  }

  /* Client-side autosave for unsaved editor contents. Never a source of truth. */
  static autosaveKey(key) { return `${MODULE_ID}.autosave.${key}`; }
  static autosave(key, code) { try { globalThis.localStorage?.setItem(DraftService.autosaveKey(key), JSON.stringify({ code, at: Date.now() })); } catch(_err) { /* storage unavailable */ } }
  static recoverAutosave(key) { try { const raw = globalThis.localStorage?.getItem(DraftService.autosaveKey(key)); return raw ? JSON.parse(raw) : null; } catch(_err) { return null; } }
  static clearAutosave(key) { try { globalThis.localStorage?.removeItem(DraftService.autosaveKey(key)); } catch(_err) { /* ignore */ } }
}

function assertCodeSize(code) {
  if ( byteSize(code) > LIMITS.MAX_DRAFT_BYTES ) throw new Error(`A draft may hold at most ${Math.round(LIMITS.MAX_DRAFT_BYTES / 1024)} KB of code. Split the program up or export it as a file.`);
}
