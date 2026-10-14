import { BaseAdapter } from "./base-adapter.js";
import { createDocumentRecord } from "../catalog/asset-record.js";
import { ASSET_TYPE, DOCUMENT_TYPES } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { canObserveDocument } from "../core/permissions.js";
import { htmlToText } from "../utilities/dom.js";
import { nextTick } from "../utilities/async.js";

/**
 * Catalogs documents of the current world. Each document type keeps its own representation:
 * an Actor shows its portrait, a Scene its thumbnail or background, a Playlist its tracks (which are
 * also cataloged as audio records), a Macro only its name and type.
 */
export class WorldDocumentAdapter extends BaseAdapter {
  id = "world";

  label = "World documents";

  constructor({ game: g=null }={}) {
    super();
    this._game = g;
  }

  get game() { return this._game ?? globalThis.game; }

  availability() {
    if ( !this.game?.ready && !this._game ) return { available: false, reason: "GMAL.Availability.NotReady" };
    return { available: true, reason: null };
  }

  async* scan({ documentTypes=Object.keys(DOCUMENT_TYPES), token, batchSize=250 }={}) {
    const status = { documents: 0, failed: 0, failures: [], byType: {} };
    let buffer = [];
    const discoveredAt = Date.now();
    for ( const documentName of documentTypes ) {
      if ( token?.cancelled ) break;
      const def = DOCUMENT_TYPES[documentName];
      if ( !def?.collection ) continue;
      const collection = this.game?.[def.collection];
      if ( !collection ) continue;
      let count = 0;
      let i = 0;
      for ( const doc of collection.contents ?? collection ) {
        if ( token?.cancelled ) break;
        if ( ++i % 200 === 0 ) await nextTick();
        try {
          if ( !canObserveDocument(doc) ) continue;
          for ( const rec of describeDocument(doc, documentName, discoveredAt) ) { buffer.push(rec); count++; }
        } catch (err) {
          status.failed++;
          if ( status.failures.length < 50 ) status.failures.push({ documentName, id: doc?.id, message: err?.message ?? String(err) });
          diagnostics.warn(`Could not catalog ${documentName} ${doc?.id}`, err);
        }
        if ( buffer.length >= batchSize ) { yield { records: buffer, status: { ...status } }; buffer = []; }
      }
      status.byType[documentName] = count;
      status.documents += count;
    }
    if ( buffer.length ) yield { records: buffer, status: { ...status } };
    yield { records: [], done: true, status };
  }

  async verify(record) {
    try {
      const doc = globalThis.fromUuidSync?.(record.uuid) ?? null;
      return doc ? true : false;
    } catch { return null; }
  }
}

/** Produce one or more records for a world document. Exported for tests. */
export function describeDocument(doc, documentName, discoveredAt=Date.now()) {
  const folder = doc.folder?.name ?? "";
  const base = { uuid: doc.uuid, documentName, documentType: doc.type ?? null, name: doc.name, folder, discoveredAt };
  const modifiedAt = doc._stats?.modifiedTime ?? null;
  switch ( documentName ) {
    case "Actor": {
      const tokenSrc = doc.prototypeToken?.texture?.src ?? null;
      return [createDocumentRecord({ ...base, img: doc.img ?? null, extra: { modifiedAt, references: compact({ portrait: doc.img ?? null, token: tokenSrc }) } })];
    }
    case "Scene": {
      const bg = doc.background?.src ?? null;
      const rec = createDocumentRecord({ ...base, img: doc.thumb || bg || null, path: bg, extra: { modifiedAt, references: compact({ background: bg, foreground: doc.foreground ?? null, thumb: doc.thumb ?? null }) } });
      rec.meta.width = Number.isFinite(doc.width) ? doc.width : null;
      rec.meta.height = Number.isFinite(doc.height) ? doc.height : null;
      rec.sceneBackground = bg;
      return [rec];
    }
    case "JournalEntry": {
      const pages = Array.from(doc.pages?.contents ?? doc.pages ?? []);
      const imagePage = pages.find(p => p.type === "image" && p.src);
      const textPage = pages.find(p => p.type === "text" && p.text?.content);
      const children = pages.map(p => ({ name: p.name, type: p.type, src: p.src ?? null, uuid: p.uuid }));
      return [createDocumentRecord({ ...base, img: imagePage?.src ?? null, extra: { modifiedAt, children, summary: textPage ? htmlToText(textPage.text.content, 400) : null } })];
    }
    case "Playlist": {
      const sounds = Array.from(doc.sounds?.contents ?? doc.sounds ?? []);
      const children = sounds.map(s => ({ name: s.name, path: s.path, uuid: s.uuid, duration: null }));
      const out = [createDocumentRecord({ ...base, img: null, extra: { modifiedAt, children } })];
      for ( const s of sounds ) {
        if ( !s.path ) continue;
        const rec = createDocumentRecord({ uuid: s.uuid, documentName: "PlaylistSound", name: s.name, folder: doc.name, path: s.path, discoveredAt, extra: { type: ASSET_TYPE.AUDIO, parentUuid: doc.uuid } });
        rec.icon = "fa-solid fa-music";
        rec.previewable = true;
        out.push(rec);
      }
      return out;
    }
    case "Macro":
      return [createDocumentRecord({ ...base, img: doc.img ?? null, extra: { modifiedAt, summary: doc.type ? `${doc.type} macro` : null } })];
    default:
      return [createDocumentRecord({ ...base, img: doc.img ?? null, extra: { modifiedAt } })];
  }
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}
