import { ASSET_ROLE, ASSET_TYPE, DOCUMENT_TYPES, MAP_SUBTYPE_KEYWORDS, SOURCE_KIND } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { canCreateDocument, canModifyDocument } from "../core/permissions.js";
import { affectedList, dialogs, esc } from "./dialogs.js";
import { localize } from "../utilities/dom.js";
import { formatBytes, formatDimensions, formatDuration } from "../utilities/format.js";
import { PermissionError } from "../collections/storage.js";

/**
 * Concrete actions. Every action that changes campaign data names the exact document(s) it will
 * modify and waits for an explicit confirmation. Nothing here runs on selection or hover.
 *
 * The `ctx` object is supplied by the browser: { organization, catalog, health, metadata, openPreview,
 * resultSet, collectionId, showUsages, refresh }.
 */

const isFile = r => r.source.kind === SOURCE_KIND.FILE;
const isImageFile = r => isFile(r) && r.type === ASSET_TYPE.IMAGE;
const isAudioFile = r => r.type === ASSET_TYPE.AUDIO && Boolean(r.url ?? r.path);
const isDoc = r => r.kind === "document" && Boolean(r.uuid);
const isWorldDoc = r => isDoc(r) && r.source.kind === SOURCE_KIND.WORLD;
const isPackDoc = r => isDoc(r) && r.source.kind === SOURCE_KIND.COMPENDIUM;
const G = () => globalThis.game;

export async function copyText(text, label) {
  const t = String(text ?? "");
  try {
    if ( G()?.clipboard?.copyPlainText ) await G().clipboard.copyPlainText(t);
    else await navigator.clipboard.writeText(t);
    await dialogs.notify(localize("GMAL.Action.Copied", { label }), "info");
    return true;
  } catch (err) {
    await dialogs.notify(localize("GMAL.Action.CopyFailed"), "warn");
    return false;
  }
}

export function browserUrl(record) {
  const u = record.url ?? record.path;
  if ( !u ) return null;
  if ( /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ) return u;
  const route = globalThis.foundry?.utils?.getRoute?.(u) ?? `/${u}`;
  try { return new URL(route, globalThis.location?.origin ?? "http://localhost").href; } catch { return u; }
}

async function ensureDimensions(record, ctx) {
  if ( record.meta.width && record.meta.height ) return record.meta;
  if ( ctx.metadata ) await ctx.metadata.enrich(record, { priority: true });
  return record.meta;
}

function pickDocumentOptions(collection, { modifiable=true }={}) {
  const docs = [];
  for ( const d of collection?.contents ?? [] ) {
    if ( modifiable && !canModifyDocument(d) ) continue;
    docs.push({ value: d.id, label: `${d.name}${d.folder?.name ? ` (${d.folder.name})` : ""}` });
  }
  return docs.sort((a, b) => a.label.localeCompare(b.label));
}

function recordLabel(record, ctx) { return ctx?.organization?.getAlias(record.id) ?? record.name; }

async function resolve(uuid) {
  if ( typeof globalThis.fromUuid !== "function" ) return null;
  return fromUuid(uuid);
}

/** Register all built-in actions on an ActionService. */
export function registerFoundryActions(actions) {
  /* ---------------- Preview / open ---------------- */
  actions.register({
    id: "preview", label: "GMAL.Action.Preview", icon: "fa-solid fa-eye", group: "preview",
    available: ([r]) => Boolean(r.previewable || r.thumbnail || r.kind === "document"),
    run: ([r], ctx) => ctx.openPreview?.(r, ctx.resultSet ?? [r])
  });
  actions.register({
    id: "open", label: "GMAL.Action.Open", icon: "fa-solid fa-arrow-up-right-from-square", group: "document",
    available: ([r]) => isDoc(r) && r.documentName !== "PlaylistSound",
    run: async ([r], ctx) => {
      const doc = await resolve(r.uuid);
      if ( !doc ) throw new Error(localize("GMAL.Action.DocumentNotFound"));
      ctx.organization?.touch(r.id).catch(() => {});
      return doc.sheet?.render(true);
    }
  });
  actions.register({
    id: "openParent", label: "GMAL.Action.OpenPlaylist", icon: "fa-solid fa-arrow-up-right-from-square", group: "document",
    available: ([r]) => isDoc(r) && r.documentName === "PlaylistSound" && Boolean(r.parentUuid),
    run: async ([r]) => { const doc = await resolve(r.parentUuid); return doc?.sheet?.render(true); }
  });
  actions.register({
    id: "viewScene", label: "GMAL.Action.ViewScene", icon: "fa-solid fa-map", group: "document",
    available: ([r]) => isWorldDoc(r) && r.documentName === "Scene",
    run: async ([r], ctx) => { const scene = await resolve(r.uuid); ctx.organization?.touch(r.id).catch(() => {}); return scene?.view(); }
  });
  actions.register({
    id: "activateScene", label: "GMAL.Action.ActivateScene", icon: "fa-solid fa-bullseye", group: "document", mutates: true,
    available: ([r]) => isWorldDoc(r) && r.documentName === "Scene" && Boolean(G()?.user?.isGM),
    run: async ([r]) => {
      const scene = await resolve(r.uuid);
      if ( !scene ) throw new Error(localize("GMAL.Action.DocumentNotFound"));
      const ok = await dialogs.confirm({ title: localize("GMAL.Action.ActivateScene"), content: `<p>${esc(localize("GMAL.Confirm.ActivateScene", { name: scene.name }))}</p>` });
      if ( !ok ) return null;
      return scene.activate();
    }
  });

  /* ---------------- Copy ---------------- */
  actions.register({
    id: "copyPath", label: "GMAL.Action.CopyPath", icon: "fa-solid fa-copy", group: "copy",
    available: ([r]) => Boolean(r.url ?? r.path),
    run: ([r]) => copyText(r.url ?? r.path, localize("GMAL.Action.CopyPathLabel"))
  });
  actions.register({
    id: "copyUrl", label: "GMAL.Action.CopyUrl", icon: "fa-solid fa-link", group: "copy",
    available: ([r]) => isFile(r),
    run: ([r]) => copyText(browserUrl(r), localize("GMAL.Action.CopyUrlLabel"))
  });
  actions.register({
    id: "copyUuid", label: "GMAL.Action.CopyUuid", icon: "fa-solid fa-fingerprint", group: "copy",
    available: ([r]) => isDoc(r),
    run: ([r]) => copyText(r.uuid, "UUID")
  });
  actions.register({
    id: "copyLink", label: "GMAL.Action.CopyLink", icon: "fa-solid fa-at", group: "copy",
    available: ([r]) => isDoc(r),
    run: ([r], ctx) => copyText(`@UUID[${r.uuid}]{${recordLabel(r, ctx)}}`, localize("GMAL.Action.CopyLinkLabel"))
  });
  actions.register({
    id: "copyName", label: "GMAL.Action.CopyName", icon: "fa-solid fa-font", group: "copy",
    available: () => true,
    run: ([r], ctx) => copyText(recordLabel(r, ctx), localize("GMAL.Details.Name"))
  });
  actions.register({
    id: "copySummary", label: "GMAL.Action.CopySummary", icon: "fa-solid fa-clipboard-list", group: "copy", multi: true,
    available: () => true,
    run: (records, ctx) => copyText(records.map(r => summaryText(r, ctx)).join("\n\n"), localize("GMAL.Action.CopySummaryLabel"))
  });

  /* ---------------- Organize ---------------- */
  actions.register({
    id: "favorite", label: "GMAL.Action.ToggleFavorite", icon: "fa-solid fa-star", group: "organize", multi: true,
    available: (records, ctx) => Boolean(ctx.organization),
    run: async (records, ctx) => {
      const allFav = records.every(r => ctx.organization.isFavorite(r.id));
      await ctx.organization.setFavorite(records.map(r => r.id), !allFav);
      ctx.refresh?.();
    }
  });
  actions.register({
    id: "addToCollection", label: "GMAL.Action.AddToCollection", icon: "fa-solid fa-folder-plus", group: "organize", multi: true,
    available: (records, ctx) => Boolean(ctx.organization?.canEditShared),
    run: async (records, ctx) => {
      const org = ctx.organization;
      const options = org.collections().map(c => ({ value: c.id, label: `${c.name} (${c.assetIds.length})` }));
      options.push({ value: "__new__", label: localize("GMAL.Collections.NewEllipsis") });
      const choice = await dialogs.pickOption({ title: localize("GMAL.Action.AddToCollection"), label: localize("GMAL.Collections.Choose"), options, hint: localize("GMAL.Dialog.AffectsCount", { count: records.length }) });
      if ( !choice ) return null;
      let id = choice;
      if ( choice === "__new__" ) {
        const name = await dialogs.promptText({ title: localize("GMAL.Collections.New"), label: localize("GMAL.Collections.Name") });
        if ( !name?.trim() ) return null;
        id = (await org.createCollection(name)).id;
      }
      await org.addToCollection(id, records.map(r => r.id));
      await dialogs.notify(localize("GMAL.Collections.Added", { count: records.length, name: org.getCollection(id)?.name ?? "" }));
      ctx.refresh?.();
    }
  });
  actions.register({
    id: "removeFromCollection", label: "GMAL.Action.RemoveFromCollection", icon: "fa-solid fa-folder-minus", group: "organize", multi: true,
    available: (records, ctx) => Boolean(ctx.collectionId && ctx.organization?.canEditShared),
    run: async (records, ctx) => { await ctx.organization.removeFromCollection(ctx.collectionId, records.map(r => r.id)); ctx.refresh?.(); }
  });
  actions.register({
    id: "addTags", label: "GMAL.Action.AddTags", icon: "fa-solid fa-tags", group: "organize", multi: true,
    available: (records, ctx) => Boolean(ctx.organization?.canEditShared),
    run: async (records, ctx) => {
      const text = await dialogs.promptText({ title: localize("GMAL.Action.AddTags"), label: localize("GMAL.Tags.Prompt"), hint: localize("GMAL.Dialog.AffectsCount", { count: records.length }), placeholder: "undead, forest, session 12" });
      if ( text === null ) return null;
      const tags = text.split(",").map(t => t.trim()).filter(Boolean);
      if ( !tags.length ) return null;
      await ctx.organization.addTags(records.map(r => r.id), tags);
      ctx.refresh?.();
    }
  });
  actions.register({
    id: "removeTags", label: "GMAL.Action.RemoveTags", icon: "fa-solid fa-tag", group: "organize", multi: true,
    available: (records, ctx) => Boolean(ctx.organization?.canEditShared) && records.some(r => ctx.organization.getTags(r.id).length),
    run: async (records, ctx) => {
      const union = [...new Set(records.flatMap(r => ctx.organization.getTags(r.id)))].sort();
      const tag = await dialogs.pickOption({ title: localize("GMAL.Action.RemoveTags"), label: localize("GMAL.Tags.ChooseRemove"), options: union.map(t => ({ value: t, label: t })) });
      if ( !tag ) return null;
      await ctx.organization.removeTags(records.map(r => r.id), [tag]);
      ctx.refresh?.();
    }
  });
  actions.register({
    id: "setAlias", label: "GMAL.Action.SetAlias", icon: "fa-solid fa-signature", group: "organize",
    available: (records, ctx) => Boolean(ctx.organization?.canEditShared),
    run: async ([r], ctx) => {
      const alias = await dialogs.promptText({ title: localize("GMAL.Action.SetAlias"), label: localize("GMAL.Alias.Prompt"), value: ctx.organization.getAlias(r.id) ?? "", hint: localize("GMAL.Alias.Hint", { name: r.fileName ?? r.name }) });
      if ( alias === null ) return null;
      await ctx.organization.setAlias(r.id, alias);
      ctx.refresh?.();
    }
  });
  actions.register({
    id: "setNote", label: "GMAL.Action.SetNote", icon: "fa-solid fa-note-sticky", group: "organize",
    available: (records, ctx) => Boolean(ctx.organization?.canEditShared),
    run: async ([r], ctx) => {
      const note = await dialogs.promptText({ title: localize("GMAL.Action.SetNote"), label: localize("GMAL.Note.Prompt"), value: ctx.organization.getNote(r.id) ?? "", multiline: true });
      if ( note === null ) return null;
      await ctx.organization.setNote(r.id, note);
      ctx.refresh?.();
    }
  });
  actions.register({
    id: "setRole", label: "GMAL.Action.SetRole", icon: "fa-solid fa-shapes", group: "organize", multi: true,
    available: (records, ctx) => Boolean(ctx.organization?.canEditShared) && records.every(r => r.type === ASSET_TYPE.IMAGE),
    run: async (records, ctx) => {
      const options = Object.values(ASSET_ROLE).map(role => ({ value: role, label: localize(`GMAL.Role.${role}`) }));
      options.push({ value: "__none__", label: localize("GMAL.Role.none") }, { value: "__auto__", label: localize("GMAL.Role.auto") });
      const choice = await dialogs.pickOption({ title: localize("GMAL.Action.SetRole"), label: localize("GMAL.Role.Prompt"), options, selected: records[0].role ?? "__none__", hint: localize("GMAL.Dialog.AffectsCount", { count: records.length }) });
      if ( !choice ) return null;
      const ids = records.map(r => r.id);
      if ( choice === "__auto__" ) await ctx.organization.setRole(ids, undefined);
      else if ( choice === "__none__" ) await ctx.organization.setRole(ids, null);
      else {
        let mapType = null;
        if ( choice === ASSET_ROLE.MAP ) {
          const mt = await dialogs.pickOption({ title: localize("GMAL.Action.SetRole"), label: localize("GMAL.MapType.Prompt"), options: [{ value: "__unknown__", label: localize("GMAL.MapType.Unknown") }, ...MAP_SUBTYPE_KEYWORDS.map(m => ({ value: m.id, label: localize(m.label) }))] });
          if ( mt === null ) return null;
          mapType = mt === "__unknown__" ? null : mt;
        }
        await ctx.organization.setRole(ids, choice, mapType);
      }
      ctx.refresh?.({ roles: true });
    }
  });

  /* ---------------- Use: tokens & portraits ---------------- */
  actions.register({
    id: "setActorPortrait", label: "GMAL.Action.SetActorPortrait", icon: "fa-solid fa-portrait", group: "use", mutates: true,
    available: ([r]) => isImageFile(r) && pickDocumentOptions(G()?.actors).length > 0,
    run: ([r], ctx) => updateActorImage(r, ctx, "img", "GMAL.Action.SetActorPortrait", "GMAL.Confirm.SetPortrait")
  });
  actions.register({
    id: "setActorToken", label: "GMAL.Action.SetActorToken", icon: "fa-solid fa-circle-user", group: "use", mutates: true,
    available: ([r]) => isImageFile(r) && pickDocumentOptions(G()?.actors).length > 0,
    run: ([r], ctx) => updateActorImage(r, ctx, "prototypeToken.texture.src", "GMAL.Action.SetActorToken", "GMAL.Confirm.SetToken")
  });
  actions.register({
    id: "applyToControlledTokens", label: "GMAL.Action.ApplyToControlledTokens", icon: "fa-solid fa-users-viewfinder", group: "use", mutates: true,
    available: ([r]) => isImageFile(r) && (globalThis.canvas?.tokens?.controlled ?? []).some(t => canModifyDocument(t.document)),
    run: async ([r]) => {
      const tokens = (globalThis.canvas?.tokens?.controlled ?? []).filter(t => canModifyDocument(t.document));
      if ( !tokens.length ) throw new Error(localize("GMAL.Action.NoControlledTokens"));
      const names = tokens.map(t => `${t.document.name} (${t.document.texture?.src ?? "—"})`);
      const ok = await dialogs.confirm({ title: localize("GMAL.Action.ApplyToControlledTokens"), content: `<p>${esc(localize("GMAL.Confirm.ApplyTokens", { count: tokens.length, path: r.url }))}</p>${affectedList(names)}` });
      if ( !ok ) return null;
      const updates = tokens.map(t => ({ _id: t.id, "texture.src": r.url }));
      await globalThis.canvas.scene.updateEmbeddedDocuments("Token", updates);
      await dialogs.notify(localize("GMAL.Action.TokensUpdated", { count: tokens.length }));
    }
  });

  /* ---------------- Use: scenes & maps ---------------- */
  actions.register({
    id: "createScene", label: "GMAL.Action.CreateScene", icon: "fa-solid fa-map-location-dot", group: "use", mutates: true,
    available: ([r]) => isImageFile(r) && canCreateDocument("Scene"),
    run: async ([r], ctx) => {
      const meta = await ensureDimensions(r, ctx);
      const values = await dialogs.form({
        title: localize("GMAL.Action.CreateScene"),
        content: `<p>${esc(localize("GMAL.Confirm.CreateScene", { path: r.url }))}</p><p class="hint">${esc(localize("GMAL.Confirm.CreateSceneHint"))}</p>`,
        okLabel: localize("GMAL.Action.CreateScene"),
        fields: [
          { name: "name", label: localize("GMAL.Details.Name"), type: "text", value: recordLabel(r, ctx) },
          { name: "width", label: localize("GMAL.Scene.Width"), type: "number", value: meta.width ?? 4000, min: 100, step: 1 },
          { name: "height", label: localize("GMAL.Scene.Height"), type: "number", value: meta.height ?? 3000, min: 100, step: 1 },
          { name: "grid", label: localize("GMAL.Scene.GridSize"), type: "number", value: 100, min: 50, step: 1, hint: localize("GMAL.Scene.GridHint") },
          { name: "open", label: localize("GMAL.Scene.OpenConfig"), type: "checkbox", value: true }
        ]
      });
      if ( !values ) return null;
      const SceneCls = globalThis.foundry?.utils?.getDocumentClass?.("Scene") ?? globalThis.CONFIG?.Scene?.documentClass;
      if ( !SceneCls ) throw new Error("Scene document class unavailable");
      const data = { name: values.name || r.name, background: { src: r.url }, width: Math.max(100, values.width || meta.width || 4000), height: Math.max(100, values.height || meta.height || 3000), grid: { size: Math.max(50, values.grid || 100) }, padding: 0.25 };
      const scene = await SceneCls.create(data);
      diagnostics.info(`Created scene ${scene?.name} from ${r.url}`);
      await dialogs.notify(localize("GMAL.Action.SceneCreated", { name: scene?.name ?? data.name }));
      if ( values.open ) scene?.sheet?.render(true);
      return scene;
    }
  });
  actions.register({
    id: "setSceneBackground", label: "GMAL.Action.SetSceneBackground", icon: "fa-solid fa-image", group: "use", mutates: true,
    available: ([r]) => isImageFile(r) && pickDocumentOptions(G()?.scenes).length > 0,
    run: async ([r]) => {
      const options = pickDocumentOptions(G().scenes);
      const current = globalThis.canvas?.scene?.id;
      const id = await dialogs.pickOption({ title: localize("GMAL.Action.SetSceneBackground"), label: localize("GMAL.Scene.Choose"), options, selected: options.some(o => o.value === current) ? current : null });
      if ( !id ) return null;
      const scene = G().scenes.get(id);
      if ( !scene || !canModifyDocument(scene) ) throw new Error(localize("GMAL.Action.NoPermission"));
      const ok = await dialogs.confirm({ title: localize("GMAL.Action.SetSceneBackground"), danger: true, yesLabel: localize("GMAL.Dialog.Replace"), content: `<p>${esc(localize("GMAL.Confirm.SetBackground", { name: scene.name }))}</p><dl class="gmal-change"><dt>${esc(localize("GMAL.Dialog.Current"))}</dt><dd>${esc(scene.background?.src ?? "—")}</dd><dt>${esc(localize("GMAL.Dialog.New"))}</dt><dd>${esc(r.url)}</dd></dl>` });
      if ( !ok ) return null;
      await scene.update({ "background.src": r.url });
      await dialogs.notify(localize("GMAL.Action.BackgroundSet", { name: scene.name }));
    }
  });
  actions.register({
    id: "createTile", label: "GMAL.Action.CreateTile", icon: "fa-solid fa-cubes", group: "use", mutates: true,
    available: ([r]) => isFile(r) && (r.type === ASSET_TYPE.IMAGE || r.type === ASSET_TYPE.VIDEO) && Boolean(globalThis.canvas?.scene) && canModifyDocument(globalThis.canvas.scene),
    run: async ([r], ctx) => {
      const scene = globalThis.canvas.scene;
      const meta = await ensureDimensions(r, ctx);
      const rect = globalThis.canvas.dimensions?.sceneRect ?? { x: 0, y: 0, width: scene.width, height: scene.height };
      const w = meta.width ?? scene.grid?.size ?? 100;
      const h = meta.height ?? scene.grid?.size ?? 100;
      const values = await dialogs.form({
        title: localize("GMAL.Action.CreateTile"),
        content: `<p>${esc(localize("GMAL.Confirm.CreateTile", { scene: scene.name, path: r.url }))}</p>`,
        okLabel: localize("GMAL.Action.CreateTile"),
        fields: [
          { name: "width", label: localize("GMAL.Scene.Width"), type: "number", value: w, min: 1 },
          { name: "height", label: localize("GMAL.Scene.Height"), type: "number", value: h, min: 1 },
          { name: "x", label: "X", type: "number", value: Math.round(rect.x + rect.width / 2 - w / 2) },
          { name: "y", label: "Y", type: "number", value: Math.round(rect.y + rect.height / 2 - h / 2) }
        ]
      });
      if ( !values ) return null;
      const [tile] = await scene.createEmbeddedDocuments("Tile", [{ texture: { src: r.url }, width: values.width || w, height: values.height || h, x: values.x, y: values.y }]);
      await dialogs.notify(localize("GMAL.Action.TileCreated", { scene: scene.name }));
      return tile;
    }
  });

  /* ---------------- Use: audio ---------------- */
  actions.register({
    id: "addToPlaylist", label: "GMAL.Action.AddToPlaylist", icon: "fa-solid fa-list-music", group: "use", mutates: true,
    available: ([r]) => isAudioFile(r) && isFile(r) && (pickDocumentOptions(G()?.playlists).length > 0 || canCreateDocument("Playlist")),
    run: async ([r], ctx) => {
      const options = pickDocumentOptions(G().playlists);
      if ( canCreateDocument("Playlist") ) options.push({ value: "__new__", label: localize("GMAL.Playlist.NewEllipsis") });
      const choice = await dialogs.pickOption({ title: localize("GMAL.Action.AddToPlaylist"), label: localize("GMAL.Playlist.Choose"), options, hint: localize("GMAL.Playlist.NoAutoplay") });
      if ( !choice ) return null;
      let playlist;
      if ( choice === "__new__" ) {
        const name = await dialogs.promptText({ title: localize("GMAL.Playlist.New"), label: localize("GMAL.Details.Name"), value: recordLabel(r, ctx) });
        if ( !name ) return null;
        const PlaylistCls = globalThis.foundry?.utils?.getDocumentClass?.("Playlist") ?? globalThis.CONFIG?.Playlist?.documentClass;
        playlist = await PlaylistCls.create({ name });
      } else playlist = G().playlists.get(choice);
      if ( !playlist || !canModifyDocument(playlist) ) throw new Error(localize("GMAL.Action.NoPermission"));
      const ok = await dialogs.confirm({ title: localize("GMAL.Action.AddToPlaylist"), content: `<p>${esc(localize("GMAL.Confirm.AddSound", { name: playlist.name, path: r.url }))}</p>` });
      if ( !ok ) return null;
      await playlist.createEmbeddedDocuments("PlaylistSound", [{ name: recordLabel(r, ctx), path: r.url, volume: 0.5, playing: false }]);
      await dialogs.notify(localize("GMAL.Action.SoundAdded", { name: playlist.name }));
    }
  });

  /* ---------------- Documents & compendiums ---------------- */
  actions.register({
    id: "importToWorld", label: "GMAL.Action.ImportToWorld", icon: "fa-solid fa-download", group: "document", mutates: true,
    available: ([r]) => isPackDoc(r) && Boolean(DOCUMENT_TYPES[r.documentName]?.collection) && canCreateDocument(r.documentName),
    run: async ([r]) => {
      const pack = G().packs.get(r.source.pack);
      const collection = G()[DOCUMENT_TYPES[r.documentName].collection];
      if ( !pack || !collection?.importFromCompendium ) throw new Error(localize("GMAL.Action.ImportUnsupported"));
      const ok = await dialogs.confirm({ title: localize("GMAL.Action.ImportToWorld"), content: `<p>${esc(localize("GMAL.Confirm.Import", { name: r.name, pack: r.source.packLabel ?? r.source.pack, type: r.documentName }))}</p>` });
      if ( !ok ) return null;
      const id = r.uuid.split(".").pop();
      const doc = await collection.importFromCompendium(pack, id);
      await dialogs.notify(localize("GMAL.Action.Imported", { name: doc?.name ?? r.name }));
      return doc;
    }
  });

  /* ---------------- Health ---------------- */
  actions.register({
    id: "findUsages", label: "GMAL.Action.FindUsages", icon: "fa-solid fa-diagram-project", group: "health",
    available: ([r], ctx) => Boolean(ctx.health) && Boolean(r.url ?? r.path),
    run: async ([r], ctx) => {
      const result = await ctx.health.usagesOf(r);
      if ( ctx.showUsages ) return ctx.showUsages(r, result);
      const list = result.references.length ? affectedList(result.references.map(ref => `${ref.documentName}: ${ref.name}${ref.parent ? ` (${ref.parent})` : ""} — ${ref.field}`), 50) : `<p>${esc(localize("GMAL.Usages.None"))}</p>`;
      await dialogs.confirm({ title: localize("GMAL.Action.FindUsages"), content: `${list}<p class="hint">${esc(result.scope.note)}</p>`, yesLabel: localize("GMAL.Dialog.OK") });
      return result;
    }
  });
  actions.register({
    id: "verify", label: "GMAL.Action.Verify", icon: "fa-solid fa-rotate", group: "health", multi: true,
    available: (records, ctx) => Boolean(ctx.metadata) && records.every(isFile),
    run: async (records, ctx) => { await Promise.all(records.map(r => ctx.metadata.enrich(r, { force: true, priority: true }))); ctx.refresh?.(); }
  });
  actions.register({
    id: "revealInFilePicker", label: "GMAL.Action.Reveal", icon: "fa-solid fa-folder-open", group: "document",
    available: ([r]) => isFile(r) && Boolean(globalThis.foundry?.applications?.apps?.FilePicker?.implementation),
    run: async ([r]) => {
      const FP = globalThis.foundry.applications.apps.FilePicker.implementation;
      const fp = new FP({ current: r.folder || "", activeSource: r.source.storage ?? "data", type: "any" });
      return fp.render(true);
    }
  });
  actions.register({
    id: "forget", label: "GMAL.Action.Forget", icon: "fa-solid fa-eraser", group: "danger", multi: true,
    available: (records, ctx) => Boolean(ctx.organization) && records.every(r => r.missing === true),
    run: async (records, ctx) => {
      const ok = await dialogs.confirm({ title: localize("GMAL.Action.Forget"), danger: true, yesLabel: localize("GMAL.Action.Forget"), content: `<p>${esc(localize("GMAL.Confirm.Forget", { count: records.length }))}</p>${affectedList(records.map(r => r.name))}` });
      if ( !ok ) return null;
      await ctx.organization.forget(records.map(r => r.id));
      ctx.refresh?.();
    }
  });
  return actions;
}

async function updateActorImage(record, ctx, field, titleKey, confirmKey) {
  const options = pickDocumentOptions(G().actors);
  const id = await dialogs.pickOption({ title: localize(titleKey), label: localize("GMAL.Actor.Choose"), options, selected: ctx.lastActorId ?? null });
  if ( !id ) return null;
  const actor = G().actors.get(id);
  if ( !actor || !canModifyDocument(actor) ) throw new Error(localize("GMAL.Action.NoPermission"));
  const current = field === "img" ? actor.img : actor.prototypeToken?.texture?.src;
  const ok = await dialogs.confirm({ title: localize(titleKey), danger: true, yesLabel: localize("GMAL.Dialog.Replace"), content: `<p>${esc(localize(confirmKey, { name: actor.name }))}</p><dl class="gmal-change"><dt>${esc(localize("GMAL.Dialog.Current"))}</dt><dd>${esc(current ?? "—")}</dd><dt>${esc(localize("GMAL.Dialog.New"))}</dt><dd>${esc(record.url)}</dd></dl>` });
  if ( !ok ) return null;
  await actor.update({ [field]: record.url });
  ctx.lastActorId = actor.id;
  await dialogs.notify(localize("GMAL.Action.ActorUpdated", { name: actor.name }));
  return actor;
}

export function summaryText(r, ctx) {
  const lines = [`${localize("GMAL.Details.Name")}: ${recordLabel(r, ctx)}`, `${localize("GMAL.Details.Type")}: ${r.type}${r.role ? ` (${r.role})` : ""}`, `${localize("GMAL.Details.Source")}: ${r.source.kind}${r.source.storage ? ` / ${r.source.storage}` : ""}${r.source.packLabel ? ` / ${r.source.packLabel}` : ""}`];
  if ( r.path ) lines.push(`${localize("GMAL.Details.Path")}: ${r.url ?? r.path}`);
  if ( r.uuid ) lines.push(`UUID: ${r.uuid}`);
  if ( r.meta.width ) lines.push(`${localize("GMAL.Details.Dimensions")}: ${formatDimensions(r.meta.width, r.meta.height)}`);
  if ( r.meta.duration ) lines.push(`${localize("GMAL.Details.Duration")}: ${formatDuration(r.meta.duration)}`);
  if ( r.meta.size ) lines.push(`${localize("GMAL.Details.Size")}: ${formatBytes(r.meta.size)}`);
  const tags = ctx?.organization?.getTags(r.id) ?? [];
  if ( tags.length ) lines.push(`${localize("GMAL.Details.Tags")}: ${tags.join(", ")}`);
  const note = ctx?.organization?.getNote(r.id);
  if ( note ) lines.push(`${localize("GMAL.Details.Note")}: ${note}`);
  return lines.join("\n");
}

export { PermissionError };
