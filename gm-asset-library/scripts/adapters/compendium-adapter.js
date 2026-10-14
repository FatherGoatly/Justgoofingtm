import { BaseAdapter } from "./base-adapter.js";
import { createCompendiumRecord } from "../catalog/asset-record.js";
import { DOCUMENT_TYPES } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { isPackVisible } from "../core/permissions.js";
import { nextTick } from "../utilities/async.js";

/** Index fields requested per document type, on top of the default index (_id, name, img, type, uuid). */
const INDEX_FIELDS = {
  Actor: ["img", "type", "prototypeToken.texture.src"],
  Item: ["img", "type"],
  Scene: ["thumb", "background.src"],
  JournalEntry: [],
  RollTable: ["img"],
  Playlist: [],
  Macro: ["img", "type"],
  Cards: ["img", "type"],
  Adventure: ["img"]
};

/**
 * Catalogs compendium index entries. Only the index is loaded (never the full documents), so this is
 * cheap even for large packs. Entries remain clearly marked as compendium content and are never
 * confused with world documents.
 */
export class CompendiumAdapter extends BaseAdapter {
  id = "compendiums";

  label = "Compendiums";

  constructor({ packs=null }={}) {
    super();
    this._packs = packs;
  }

  get packs() { return this._packs ?? globalThis.game?.packs; }

  availability() {
    if ( !this.packs ) return { available: false, reason: "GMAL.Availability.NotReady" };
    return { available: true, reason: null };
  }

  async* scan({ documentTypes=Object.keys(DOCUMENT_TYPES), token, batchSize=500 }={}) {
    const status = { packs: 0, entries: 0, failed: 0, failures: [], skipped: 0 };
    const discoveredAt = Date.now();
    const packs = Array.from(this.packs?.contents ?? this.packs ?? []);
    for ( const pack of packs ) {
      if ( token?.cancelled ) break;
      const documentName = pack.documentName ?? pack.metadata?.type;
      if ( !documentTypes.includes(documentName) ) { status.skipped++; continue; }
      if ( !isPackVisible(pack) ) { status.skipped++; continue; }
      let index;
      try {
        index = await pack.getIndex({ fields: INDEX_FIELDS[documentName] ?? [] });
      } catch (err) {
        status.failed++;
        diagnostics.count("failedSources");
        if ( status.failures.length < 50 ) status.failures.push({ pack: pack.collection, message: err?.message ?? String(err) });
        diagnostics.warn(`Could not index compendium ${pack.collection}`, err);
        continue;
      }
      status.packs++;
      const packLabel = pack.title ?? pack.metadata?.label ?? pack.collection;
      const packageName = pack.metadata?.packageName ?? pack.metadata?.package ?? null;
      const folders = new Map();
      try { for ( const f of pack.folders ?? [] ) folders.set(f.id, f.name); } catch {}
      let buffer = [];
      let i = 0;
      for ( const entry of index.values?.() ?? index ) {
        if ( token?.cancelled ) break;
        if ( ++i % 500 === 0 ) await nextTick();
        try {
          const uuid = entry.uuid ?? (typeof pack.getUuid === "function" ? pack.getUuid(entry._id) : `Compendium.${pack.collection}.${documentName}.${entry._id}`);
          const img = documentName === "Scene" ? (entry.thumb || entry.background?.src || null) : (entry.img ?? null);
          const rec = createCompendiumRecord({ uuid, pack: pack.collection, packLabel, packageName, documentName, documentType: entry.type ?? null, name: entry.name, img, folder: folders.get(entry.folder) ?? "", discoveredAt });
          if ( documentName === "Scene" && entry.background?.src ) rec.sceneBackground = entry.background.src;
          if ( documentName === "Actor" && entry.prototypeToken?.texture?.src ) rec.references = { portrait: entry.img ?? null, token: entry.prototypeToken.texture.src };
          buffer.push(rec);
          status.entries++;
        } catch (err) {
          status.failed++;
        }
        if ( buffer.length >= batchSize ) { yield { records: buffer, status: { ...status } }; buffer = []; }
      }
      if ( buffer.length ) yield { records: buffer, status: { ...status } };
    }
    yield { records: [], done: true, status };
  }

  async verify(record) {
    try {
      const parsed = globalThis.foundry?.utils?.parseUuid?.(record.uuid);
      const pack = parsed?.collection ?? this.packs?.get?.(record.source.pack);
      if ( !pack ) return null;
      return pack.index?.has?.(parsed?.id ?? record.uuid.split(".").pop()) ?? null;
    } catch { return null; }
  }
}
