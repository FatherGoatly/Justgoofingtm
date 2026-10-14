import { ASSET_TYPE, SOURCE_KIND, TYPE_ICONS } from "../core/constants.js";
import { clear, el, icon, localize } from "../utilities/dom.js";
import { formatBytes, formatDimensions, formatDuration } from "../utilities/format.js";
import { sourceLabel } from "../catalog/asset-record.js";

/**
 * Builds and updates the DOM of one asset card (grid or list mode). Cards are pooled by the virtual
 * grid, so the structure is created once per element and only its content is updated afterwards.
 */
export class CardRenderer {
  /**
   * @param {object} services    { organization, thumbnails, metadata }
   * @param {object} options     { showMeta, isSelected(id), isActive(id), onNeedsRefresh(id) }
   */
  constructor(services, options) {
    this.services = services;
    this.options = options;
  }

  #structure(elm) {
    if ( elm._gmal ) return elm._gmal;
    clear(elm);
    const img = document.createElement("img");
    img.className = "gmal-thumb";
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    const fallback = el("div", { className: "gmal-thumb-fallback" }, [icon("fa-solid fa-file")]);
    const typeBadge = el("span", { className: "gmal-badge gmal-type-badge" }, [icon("fa-solid fa-file")]);
    const sourceBadge = el("span", { className: "gmal-badge gmal-source-badge" });
    const favorite = el("button", { className: "gmal-card-favorite", attrs: { type: "button", tabindex: "-1", "data-card-action": "favorite", "aria-label": localize("GMAL.Action.ToggleFavorite") } }, [icon("fa-regular fa-star")]);
    const check = el("span", { className: "gmal-card-check", attrs: { "aria-hidden": "true" } }, [icon("fa-solid fa-check")]);
    const thumbWrap = el("div", { className: "gmal-thumb-wrap checker" }, [img, fallback, typeBadge, sourceBadge, favorite, check]);
    const name = el("div", { className: "gmal-card-name" });
    const meta = el("div", { className: "gmal-card-meta" });
    const body = el("div", { className: "gmal-card-body" }, [name, meta]);
    elm.append(thumbWrap, body);
    elm.setAttribute("role", "option");
    elm.draggable = true;
    elm._gmal = { img, fallback, typeBadge, sourceBadge, favorite, name, meta, thumbWrap, thumbKey: null, token: 0, recordId: null };
    return elm._gmal;
  }

  render(record, elm, { mode="grid", refresh=false }={}) {
    const s = this.#structure(elm);
    const { organization, metadata } = this.services;
    const alias = organization?.getAlias(record.id) ?? null;
    const displayName = alias ?? record.name;
    const changedRecord = s.recordId !== record.id;
    s.recordId = record.id;
    elm.classList.toggle("list", mode === "list");
    elm.classList.toggle("selected", Boolean(this.options.isSelected?.(record.id)));
    elm.classList.toggle("active", Boolean(this.options.isActive?.(record.id)));
    elm.classList.toggle("missing", record.accessible === false || record.missing === true);
    elm.classList.toggle("document", record.kind === "document");
    elm.setAttribute("aria-selected", this.options.isSelected?.(record.id) ? "true" : "false");
    elm.tabIndex = this.options.isActive?.(record.id) ? 0 : -1;
    elm.dataset.id = record.id;
    elm.title = `${displayName}${alias ? ` (${record.fileName ?? record.name})` : ""}\n${record.url ?? record.uuid ?? ""}`;
    s.name.textContent = displayName;
    s.name.classList.toggle("alias", Boolean(alias));
    s.typeBadge.firstChild.className = `${record.icon ?? TYPE_ICONS[record.type] ?? TYPE_ICONS.other}`;
    s.typeBadge.title = `${localize(`GMAL.Type.${record.type}`)}${record.role ? ` · ${localize(`GMAL.Role.${record.role}`)}` : ""}`;
    s.sourceBadge.textContent = record.source.kind === SOURCE_KIND.WORLD ? localize("GMAL.Source.WorldShort") : record.source.kind === SOURCE_KIND.COMPENDIUM ? localize("GMAL.Source.CompendiumShort") : record.source.storage === "public" ? localize("GMAL.Source.CoreShort") : record.source.storage === "s3" ? "S3" : "";
    s.sourceBadge.title = sourceLabel(record);
    s.sourceBadge.hidden = !s.sourceBadge.textContent;
    const fav = Boolean(organization?.isFavorite(record.id));
    s.favorite.firstChild.className = `${fav ? "fa-solid" : "fa-regular"} fa-star`;
    s.favorite.classList.toggle("active", fav);
    s.favorite.setAttribute("aria-pressed", fav ? "true" : "false");
    s.meta.textContent = this.#metaText(record, mode);
    s.meta.hidden = !s.meta.textContent;

    if ( changedRecord || refresh ) this.#loadThumb(record, elm, s, changedRecord);
    if ( metadata && record.kind === "file" && !record.meta.width && !record.meta.duration && record.accessible !== false && [ASSET_TYPE.IMAGE, ASSET_TYPE.AUDIO, ASSET_TYPE.VIDEO].includes(record.type) && !record._probed ) {
      record._probed = true;
      metadata.enrich(record).then(() => this.options.onNeedsRefresh?.(record.id)).catch(() => {});
    }
  }

  #metaText(record, mode) {
    const parts = [];
    if ( mode === "list" || this.options.showMeta ) {
      if ( record.meta.width ) parts.push(formatDimensions(record.meta.width, record.meta.height));
      if ( record.meta.duration ) parts.push(formatDuration(record.meta.duration));
      if ( record.meta.size ) parts.push(formatBytes(record.meta.size));
      if ( mode === "list" ) { parts.push(record.extension ? `.${record.extension}` : record.documentName ?? record.type); parts.push(record.folder || sourceLabel(record)); }
    }
    if ( record.accessible === false ) parts.unshift(localize("GMAL.Card.Missing"));
    return parts.join(" · ");
  }

  async #loadThumb(record, elm, s, changedRecord) {
    const { thumbnails } = this.services;
    if ( changedRecord && s.thumbKey ) { thumbnails?.release(s.thumbKey); s.thumbKey = null; }
    const token = ++s.token;
    s.fallback.firstChild.className = record.icon ?? TYPE_ICONS[record.type] ?? TYPE_ICONS.other;
    s.thumbWrap.classList.toggle("has-image", false);
    s.img.removeAttribute("src");
    if ( !record.thumbnail || record.accessible === false ) return;
    let url = record.thumbnail;
    let key = null;
    if ( thumbnails ) {
      try {
        const res = await thumbnails.resolve(record);
        if ( token !== s.token ) { thumbnails.release(res.key); return; }
        url = res.url;
        key = res.key ?? null;
      } catch { url = record.thumbnail; }
    }
    if ( !url ) return;
    s.thumbKey = key;
    s.img.onload = () => { if ( token === s.token ) s.thumbWrap.classList.add("has-image"); };
    s.img.onerror = () => {
      if ( token !== s.token ) return;
      s.thumbWrap.classList.remove("has-image");
      if ( key ) { thumbnails?.release(key); s.thumbKey = null; if ( record.thumbnail && url !== record.thumbnail ) { url = record.thumbnail; key = null; s.img.src = url; return; } }
      elm.classList.add("thumb-failed");
      if ( record.kind === "file" && record.accessible === null ) { record.accessible = false; record.previewError = localize("GMAL.Preview.ImageFailed"); elm.classList.add("missing"); this.options.onNeedsRefresh?.(record.id); }
    };
    s.img.src = url;
  }

  recycle(elm) {
    const s = elm._gmal;
    if ( !s ) return;
    s.token++;
    if ( s.thumbKey ) { this.services.thumbnails?.release(s.thumbKey); s.thumbKey = null; }
    s.img.onload = s.img.onerror = null;
    s.img.removeAttribute("src");
    s.thumbWrap.classList.remove("has-image");
    s.recordId = null;
    elm.classList.remove("selected", "active", "missing", "thumb-failed");
  }
}
