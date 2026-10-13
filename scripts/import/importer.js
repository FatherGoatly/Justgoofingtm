import diagnostics from "../core/diagnostics.js";
import { DESTINATION, DUPLICATE_POLICY, FLAG_SCOPE, FLAGS, MECHANIC_CATEGORY } from "../core/constants.js";
import { getSetting, REVIEW_POLICIES, SETTINGS } from "../core/settings.js";
import * as permissions from "../core/permissions.js";
import { compatibility } from "../core/compatibility.js";
import { buildActor } from "../documents/actor-builder.js";
import { buildItem } from "../documents/item-builder.js";
import { planBundle } from "../automation/planner.js";
import { runtime } from "../automation/runtime.js";
import { macroGenerator } from "../automation/macro-generator.js";
import { MidiQolAdapter } from "../automation/integrations/midi-qol.js";
import { findDuplicates, mergeUpdate, hash } from "./duplicates.js";
import { ImportTransaction, chunk } from "./recovery.js";

/**
 * Import executor (pipeline stages 9–14): review gate, document build, duplicate handling,
 * staged creation, automation installation, verification and reporting.
 *
 * All document operations go through the normal client API so Foundry's server-side permission
 * checks remain authoritative. Nothing here uses sockets or GM relays.
 */

/**
 * @typedef {object} ImportOptions
 * @property {{type: string, actor?: Actor, folderName?: string}} destination
 * @property {string} [duplicatePolicy]
 * @property {Object<string,string>} [resolutions]   entry id → duplicate policy chosen by the user
 * @property {boolean} [automation]
 * @property {boolean} [macros]
 * @property {boolean} [acknowledgeReview]
 * @property {boolean} [dryRun]
 * @property {object} [user]
 * @property {function} [progress]  (step, detail) → void
 */

/**
 * Prepare an import: plan automation and build document data without touching the world.
 * @param {object} bundle
 * @param {ImportOptions} options
 * @returns {Promise<object>} prepared { entries: [{entry, data, warnings, mechanics}], plan, review }
 */
export async function prepareImport(bundle, options={}) {
  const user = options.user ?? permissions.currentUser();
  const report = compatibility.report;
  const capabilities = new Set(report?.capabilities ?? []);
  const macrosAllowed = Boolean(options.macros) && permissions.canGenerateMacros(user);
  const automationEnabled = options.automation !== false && getSetting(SETTINGS.AUTOMATION_ENABLED) !== false;
  const reviewPolicy = getSetting(SETTINGS.REVIEW_POLICY) ?? REVIEW_POLICIES.ambiguous;
  const resolvers = buildResolvers();
  const plan = planBundle(bundle, { capabilities, macrosAllowed, automationEnabled, preferNative: getSetting(SETTINGS.USE_NATIVE_MECHANICS) !== false, reviewPolicy, context: (m) => contextFor(m, resolvers) });
  const prepared = [];
  for ( const entry of bundle.entries ) {
    if ( entry.validation && !entry.validation.valid ) { prepared.push({ entry, data: null, warnings: entry.validation.errors, mechanics: [], skipped: "invalid" }); continue; }
    const provenance = { sourceId: bundle.id, importedAt: Date.now(), importedBy: user?.id ?? null, descriptionHash: null };
    let built;
    if ( entry.kind === "actor" ) built = await buildActor(entry, { provenance, resolveSpell: resolvers.resolveSpell, resolveItem: resolvers.resolveItem });
    else built = buildItem(entry, { provenance });
    stampDescriptionHash(built.data);
    for ( const item of built.data.items ?? [] ) stampDescriptionHash(item);
    if ( capabilities.has("midi.damageBonus") ) { MidiQolAdapter.prepareItemData(built.data); for ( const item of built.data.items ?? [] ) MidiQolAdapter.prepareItemData(item); }
    prepared.push({ entry, data: built.data, warnings: built.warnings, mechanics: built.mechanics, placeholders: built.placeholders ?? [] });
  }
  const review = collectReview(bundle);
  return { entries: prepared, plan, review, capabilities: [...capabilities], macrosAllowed, automationEnabled };
}

function stampDescriptionHash(data) {
  const flags = data?.flags?.[FLAG_SCOPE]?.[FLAGS.IMPORT];
  if ( flags ) flags.descriptionHash = hash(data.system?.description?.value ?? "");
}

function contextFor(mechanic, resolvers) {
  const ctx = {};
  if ( mechanic.kind === "spell.cast-from-item" ) {
    const found = resolvers.spellIndexHas(mechanic.effect?.spellName);
    ctx.spellFound = found; ctx["compendium.spell"] = found;
  }
  if ( mechanic.kind === "summon" ) { const found = resolvers.actorIndexHas(mechanic.effect?.creatureName); ctx.actorFound = found; ctx["compendium.actor"] = found; }
  if ( mechanic.kind === "bonus.ac" ) ctx.isArmor = Boolean(mechanic.implementation?.owner === "native");
  return ctx;
}

/** Mechanics that require a review decision (ambiguous or unresolved with material impact). */
export function collectReview(bundle) {
  const items = [];
  const visit = (item, owner) => { for ( const m of item.mechanics ?? [] ) if ( m.reviewRequired && !m.reviewed ) items.push({ owner, item: item.name, mechanic: m }); for ( const c of item.contents ?? [] ) visit(c, owner); };
  for ( const e of bundle.entries ?? [] ) { if ( e.kind === "actor" ) (e.items ?? []).forEach(i => visit(i, e.name)); else visit(e, e.name); }
  return items;
}

/* -------------------------------------------- */
/*  Compendium resolution                       */
/* -------------------------------------------- */

function buildResolvers() {
  const packs = [...(globalThis.game?.packs ?? [])].filter(p => p.documentName === "Item" || p.metadata?.type === "Item");
  const actorPacks = [...(globalThis.game?.packs ?? [])].filter(p => p.documentName === "Actor" || p.metadata?.type === "Actor");
  const order = p => (p.collection?.startsWith("dnd5e.") ? 0 : 1) + (p.collection?.includes("24") ? 0 : 0.5);
  packs.sort((a, b) => order(a) - order(b));
  const indexFind = (list, name, type) => {
    const n = String(name ?? "").trim().toLowerCase();
    if ( !n ) return null;
    for ( const pack of list ) {
      const index = pack.index ?? [];
      const hit = [...index].find(e => (!type || e.type === type) && String(e.name).toLowerCase() === n);
      if ( hit ) return { pack, entry: hit, uuid: hit.uuid ?? `Compendium.${pack.collection}.Item.${hit._id}` };
    }
    // World documents
    const world = type === "spell" || !type ? [...(globalThis.game?.items ?? [])] : [];
    const w = world.find(i => (!type || i.type === type) && i.name.toLowerCase() === n);
    if ( w ) return { pack: null, entry: w, uuid: w.uuid };
    return null;
  };
  return {
    spellIndexHas: (name) => Boolean(indexFind(packs, name, "spell")),
    actorIndexHas: (name) => Boolean(indexFind(actorPacks, name, null)),
    resolveSpell: async (name) => {
      const hit = indexFind(packs, name, "spell");
      if ( !hit ) return null;
      const doc = hit.pack ? await hit.pack.getDocument(hit.entry._id) : hit.entry;
      return { uuid: hit.uuid, level: doc?.system?.level ?? null };
    },
    resolveItem: async (name, hint) => {
      const type = hint === "spell" ? "spell" : hint === "feat" ? "feat" : null;
      const hit = indexFind(packs, name, type);
      if ( !hit ) return null;
      const doc = hit.pack ? await hit.pack.getDocument(hit.entry._id) : hit.entry;
      if ( !doc ) return null;
      const data = doc.toObject();
      data._stats = { ...(data._stats ?? {}), compendiumSource: hit.uuid };
      return data;
    }
  };
}

/* -------------------------------------------- */
/*  Execution                                   */
/* -------------------------------------------- */

/**
 * Execute an import.
 * @param {object} bundle
 * @param {ImportOptions} options
 * @returns {Promise<object>} report
 */
export async function importBundle(bundle, options={}) {
  const user = options.user ?? permissions.currentUser();
  const progress = options.progress ?? (() => {});
  const log = diagnostics.collector(`import:${bundle.id}`);
  const report = { status: "pending", actors: [], items: [], embedded: [], effects: 0, macros: [], mechanics: { implemented: [], review: [], unsupported: [] }, verification: [], skipped: [], updated: [], errors: [], warnings: [], placeholders: [] };

  // Permissions and limits
  const auth = permissions.authorizeDestination(options.destination ?? { type: DESTINATION.WORLD }, user);
  if ( !auth.allowed ) {
    if ( auth.redirect ) { log.warn(`Destination not allowed (${auth.reason}); redirected to ${auth.redirect.type}`); options = { ...options, destination: auth.redirect }; report.warnings.push(`Redirected to ${auth.redirect.type}: ${auth.reason}`); }
    else { report.status = "rejected"; report.errors.push(auth.reason); return report; }
  }
  const max = permissions.maxBatchFor(user);
  const count = bundle.entries.reduce((n, e) => n + 1 + (e.items?.length ?? 0), 0);
  if ( count > max ) { report.status = "rejected"; report.errors.push(`Batch of ${count} documents exceeds the maximum of ${max}.`); return report; }

  progress("prepare");
  const prepared = await prepareImport(bundle, { ...options, user });
  if ( prepared.review.length && !options.acknowledgeReview && getSetting(SETTINGS.REVIEW_POLICY) !== REVIEW_POLICIES.never ) {
    report.status = "review-required";
    report.review = prepared.review;
    return report;
  }
  if ( options.dryRun ) { report.status = "dry-run"; report.prepared = prepared; return report; }

  const destination = options.destination ?? { type: DESTINATION.WORLD };
  const policy = options.duplicatePolicy ?? getSetting(SETTINGS.DUPLICATE_POLICY) ?? DUPLICATE_POLICY.ASK;
  const tx = new ImportTransaction(bundle.id);
  const folder = await resolveFolder(destination, user, log);

  try {
    // Duplicate analysis first so "ask" can return before any writes.
    const conflicts = [];
    for ( const p of prepared.entries ) {
      if ( !p.data ) continue;
      const collection = existingCollection(p.data, destination);
      const dup = findDuplicates(p.data, collection);
      if ( dup.matches.length ) {
        const chosen = options.resolutions?.[p.entry.id] ?? (policy === DUPLICATE_POLICY.ASK ? null : policy);
        p.duplicate = { matches: dup.matches, exact: dup.exact, policy: chosen };
        if ( !chosen ) conflicts.push({ entryId: p.entry.id, name: p.data.name, type: p.data.type, matches: dup.matches.map(m => ({ id: m.doc.id ?? m.doc._id, name: m.doc.name, reason: m.reason, uuid: m.doc.uuid })) });
      }
    }
    if ( conflicts.length ) { report.status = "duplicates"; report.conflicts = conflicts; return report; }

    progress("create");
    for ( const p of prepared.entries ) {
      if ( !p.data ) { report.skipped.push({ name: p.entry.name, reason: p.skipped ?? "invalid", details: p.warnings }); continue; }
      report.warnings.push(...p.warnings.map(w => `${p.data.name}: ${w}`));
      report.placeholders.push(...(p.placeholders ?? []));
      const data = permissions.sanitizeOwnership(p.data, user);
      if ( folder && destination.type !== DESTINATION.ACTOR ) { const fid = folder.get(p.entry.kind === "actor" ? "Actor" : "Item"); if ( fid ) data.folder = fid; }
      if ( destination.type === DESTINATION.STAGING ) foundry.utils.setProperty(data, `flags.${FLAG_SCOPE}.${FLAGS.STAGING}`, true);
      const dupPolicy = p.duplicate?.policy;
      if ( dupPolicy === DUPLICATE_POLICY.SKIP ) { report.skipped.push({ name: data.name, reason: "duplicate" }); continue; }
      if ( (dupPolicy === DUPLICATE_POLICY.UPDATE || dupPolicy === DUPLICATE_POLICY.MERGE) && p.duplicate?.matches?.[0] ) {
        const existing = p.duplicate.matches[0].doc;
        const update = dupPolicy === DUPLICATE_POLICY.MERGE ? mergeUpdate(existing, data) : { _id: existing.id, name: data.name, img: data.img, system: data.system, effects: data.effects, flags: data.flags };
        const previous = existing.toObject?.() ?? null;
        await existing.update(update, { diff: false, recursive: false });
        if ( data.items?.length && existing.createEmbeddedDocuments ) {
          const existingItems = [...(existing.items ?? [])];
          const toCreate = data.items.filter(i => !existingItems.some(e => e.name === i.name && e.type === i.type));
          for ( const batch of chunk(toCreate, 20) ) { const made = await existing.createEmbeddedDocuments("Item", batch); made.forEach(d => tx.trackCreated("Item", d, existing)); }
        }
        tx.trackUpdated(existing.documentName ?? data.type, existing, previous);
        report.updated.push({ name: data.name, uuid: existing.uuid, policy: dupPolicy });
        afterCreate(existing, p, report);
        continue;
      }
      if ( p.entry.kind === "actor" ) {
        if ( destination.type === DESTINATION.ACTOR && destination.actor ) {
          // Importing a stat block "into" an existing actor attaches its items instead of making a new actor.
          const made = await createEmbedded(destination.actor, data.items ?? [], tx);
          report.embedded.push(...made.map(d => ({ name: d.name, uuid: d.uuid, actor: destination.actor.name })));
          made.forEach(d => afterCreate(d, { entry: p.entry, data: d.toObject?.() ?? d }, report));
          continue;
        }
        const ActorCls = globalThis.Actor;
        const [actor] = await ActorCls.createDocuments([data]);
        tx.trackCreated("Actor", actor);
        report.actors.push({ name: actor.name, uuid: actor.uuid, id: actor.id });
        for ( const item of actor.items ?? [] ) afterCreate(item, { entry: p.entry, data: item.toObject?.() ?? item }, report);
        report.effects += (actor.items ?? []).reduce((n, i) => n + (i.effects?.size ?? i.effects?.length ?? 0), 0);
      } else {
        if ( destination.type === DESTINATION.ACTOR && destination.actor ) {
          const [made] = await createEmbedded(destination.actor, [data], tx);
          report.embedded.push({ name: made.name, uuid: made.uuid, actor: destination.actor.name });
          afterCreate(made, p, report);
        } else {
          const ItemCls = globalThis.Item;
          const [item] = await ItemCls.createDocuments([data]);
          tx.trackCreated("Item", item);
          report.items.push({ name: item.name, uuid: item.uuid, id: item.id });
          afterCreate(item, p, report);
        }
      }
    }

    // Macros (only for mechanics planned for the macro owner)
    progress("macros");
    if ( prepared.macrosAllowed ) {
      for ( const created of [...tx.created] ) {
        const doc = created.doc;
        const specs = runtime.mechanicsOf(doc);
        for ( const spec of specs ) {
          if ( spec.implementation?.owner !== "macro" || spec.enabled === false ) continue;
          const existed = Boolean(macroGenerator.findExisting(spec.id));
          const macro = await macroGenerator.ensureMacro(spec, { itemUuid: doc.uuid, itemName: doc.name }, { user, img: doc.img });
          if ( macro ) { if ( !existed ) tx.trackCreated("Macro", macro); report.macros.push({ name: macro.name, uuid: macro.uuid, mechanic: spec.label }); }
        }
      }
    }

    progress("verify");
    report.status = report.errors.length ? "partial" : "complete";
    report.transaction = tx.summary();
  } catch (err) {
    log.error(`Import failed: ${err.message}`, err);
    report.errors.push(err.message);
    const rollbackErrors = await tx.rollback();
    report.errors.push(...rollbackErrors);
    report.status = "failed";
    report.rolledBack = true;
  }
  report.diagnostics = log.items;
  if ( getSetting(SETTINGS.LOG_IMPORTS) ) diagnostics.info("Import report", report);
  return report;
}

function afterCreate(doc, p, report) {
  runtime.indexItem(doc);
  const data = doc.toObject?.() ?? p.data;
  const v = runtime.verifyItem(data);
  report.verification.push({ name: doc.name, uuid: doc.uuid, ok: v.ok, results: v.results });
  for ( const r of v.results ) {
    const row = { item: doc.name, label: r.label, kind: r.kind, owner: r.owner, uuid: doc.uuid };
    const spec = runtime.mechanicsOf(data).find(m => m.id === r.id);
    if ( spec?.category === MECHANIC_CATEGORY.UNRESOLVED || spec?.enabled === false ) report.mechanics.unsupported.push({ ...row, reason: spec?.implementation?.notes ?? r.reason });
    else if ( spec?.reviewRequired ) report.mechanics.review.push(row);
    else if ( r.ok ) report.mechanics.implemented.push({ ...row, verified: true });
    else report.mechanics.review.push({ ...row, reason: r.reason });
  }
}

async function createEmbedded(actor, items, tx) {
  const out = [];
  for ( const batch of chunk(items, 20) ) {
    const made = await actor.createEmbeddedDocuments("Item", batch);
    made.forEach(d => tx.trackCreated("Item", d, actor));
    out.push(...made);
  }
  return out;
}

function existingCollection(data, destination) {
  if ( destination.type === DESTINATION.ACTOR && destination.actor ) return [...(destination.actor.items ?? [])];
  if ( data.type === "npc" || data.type === "character" ) return [...(globalThis.game?.actors ?? [])];
  return [...(globalThis.game?.items ?? [])];
}

async function resolveFolder(destination, user, log) {
  if ( destination.type === DESTINATION.ACTOR ) return null;
  const name = destination.type === DESTINATION.STAGING ? (getSetting(SETTINGS.STAGING_FOLDER) || "Imported (Staging)") : destination.folderName;
  if ( !name ) return null;
  const FolderCls = globalThis.Folder;
  if ( !FolderCls || !globalThis.game?.folders ) return null;
  const type = destination.documentType ?? "Item";
  const findFolder = t => globalThis.game.folders.find(f => f.name === name && f.type === t);
  const folders = {};
  for ( const t of ["Actor", "Item"] ) {
    let f = findFolder(t);
    if ( !f && permissions.isGM(user) ) { try { f = await FolderCls.create({ name, type: t }); } catch (err) { log.warn(`Could not create folder ${name}: ${err.message}`); } }
    folders[t] = f ?? null;
  }
  return { byType: folders, get(t) { return folders[t]?.id ?? null; }, type };
}

export { prepareImport as prepare };
