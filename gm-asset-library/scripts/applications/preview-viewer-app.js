import { MODULE_ID } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { getSetting, SETTINGS } from "../core/settings.js";
import { renderError, selectRenderer } from "../previews/renderers.js";
import { previewService } from "../previews/preview-service.js";
import { clear, el, icon, localize } from "../utilities/dom.js";
import { formatAspect, formatBytes, formatDimensions, formatDuration } from "../utilities/format.js";
import { sourceLabel } from "../catalog/asset-record.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The large preview window. Navigates through the result set the browser handed over, delegates
 * drawing to previews/renderers.js, and releases every media resource on close.
 */
export class PreviewViewerApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {object} options
   * @param {object[]} options.records   Result set to navigate
   * @param {number} options.index       Starting index
   * @param {object} options.services    { organization, actions, metadata, health, actionContext }
   */
  constructor(options={}) {
    super(options);
    this.records = options.records ?? [];
    this.index = Math.max(0, Math.min(options.index ?? 0, this.records.length - 1));
    this.services = options.services ?? {};
    this.renderer = null;
    this._onKey = this.#onKey.bind(this);
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-viewer`,
    classes: [MODULE_ID, "gmal-viewer"],
    window: { title: "GMAL.Viewer.Title", icon: "fa-solid fa-eye", resizable: true },
    position: { width: 1000, height: 760 },
    actions: {
      prev: PreviewViewerApplication.#onPrev,
      next: PreviewViewerApplication.#onNext,
      favorite: PreviewViewerApplication.#onFavorite,
      runAction: PreviewViewerApplication.#onRunAction,
      backToGrid: PreviewViewerApplication.#onBack
    }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/preview-viewer.hbs` }
  };

  get record() { return this.records[this.index] ?? null; }

  get title() { return this.record ? `${localize("GMAL.Viewer.Title")}: ${this.services.organization?.getAlias(this.record.id) ?? this.record.name}` : localize("GMAL.Viewer.Title"); }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const r = this.record;
    context.record = r;
    context.hasPrev = this.index > 0;
    context.hasNext = this.index < this.records.length - 1;
    context.position = `${this.index + 1} / ${this.records.length}`;
    context.isFavorite = r ? Boolean(this.services.organization?.isFavorite(r.id)) : false;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#mount();
    this.element.addEventListener("keydown", this._onKey);
  }

  async _preClose(options) {
    await super._preClose(options);
    this.#unmount();
    this.element?.removeEventListener("keydown", this._onKey);
  }

  /** Show a different record (same result set). */
  show(index) {
    if ( index < 0 || index >= this.records.length ) return;
    this.index = index;
    this.render({ force: false });
  }

  #mount() {
    this.#unmount();
    const r = this.record;
    const stage = this.element.querySelector(".gmal-viewer-stage");
    const meta = this.element.querySelector(".gmal-viewer-meta");
    const actionsBar = this.element.querySelector(".gmal-viewer-actions");
    if ( !stage || !r ) return;
    clear(stage);
    this.services.organization?.touch(r.id).catch(() => {});
    const opts = { previewService, mediaPreviews: getSetting(SETTINGS.MEDIA_PREVIEWS), onError: err => this.#showError(stage, r, err), onLoad: () => this.#fillMeta(meta, r) };
    try {
      const Renderer = selectRenderer(r, opts);
      this.renderer = Renderer(r, opts);
      stage.append(this.renderer.element);
    } catch (err) {
      diagnostics.error("Preview renderer failed", err);
      this.#showError(stage, r, err);
    }
    this.#fillMeta(meta, r);
    this.#fillActions(actionsBar, r);
    const focusTarget = stage.querySelector("[tabindex], audio, video") ?? stage;
    focusTarget.focus?.({ preventScroll: true });
  }

  #unmount() {
    try { this.renderer?.destroy?.(); } catch (err) { diagnostics.debug("Renderer destroy failed", err); }
    this.renderer = null;
    previewService.stopAll();
  }

  #showError(stage, record, err) {
    clear(stage);
    record.previewError = err?.message ?? String(err);
    stage.append(renderError(record, err, {
      onRetry: () => { delete record.previewError; this.#mount(); },
      onCopyPath: () => this.services.actions?.run("copyPath", [record], this.services.actionContext ?? {})
    }));
  }

  #fillMeta(container, r) {
    if ( !container ) return;
    clear(container);
    const rows = [
      [localize("GMAL.Details.Type"), `${r.type}${r.role ? ` · ${localize(`GMAL.Role.${r.role}`)}` : ""}${r.documentName ? ` · ${r.documentName}` : ""}`],
      [localize("GMAL.Details.Source"), sourceLabel(r)],
      [localize("GMAL.Details.Path"), r.url ?? r.path ?? r.uuid ?? ""],
      [localize("GMAL.Details.Dimensions"), r.meta.width ? `${formatDimensions(r.meta.width, r.meta.height)} (${formatAspect(r.meta.width, r.meta.height)})` : ""],
      [localize("GMAL.Details.Duration"), formatDuration(r.meta.duration)],
      [localize("GMAL.Details.Size"), formatBytes(r.meta.size)]
    ];
    const tags = this.services.organization?.getTags(r.id) ?? [];
    if ( tags.length ) rows.push([localize("GMAL.Details.Tags"), tags.join(", ")]);
    const note = this.services.organization?.getNote(r.id);
    if ( note ) rows.push([localize("GMAL.Details.Note"), note]);
    for ( const [k, v] of rows ) { if ( !v ) continue; container.append(el("dt", { text: k }), el("dd", { text: v, title: v })); }
  }

  #fillActions(bar, r) {
    if ( !bar || !this.services.actions ) return;
    clear(bar);
    const ctx = { ...(this.services.actionContext ?? {}), resultSet: this.records };
    for ( const a of this.services.actions.actionsFor([r], ctx) ) {
      if ( a.id === "preview" ) continue;
      const b = el("button", { className: `gmal-tool${a.mutates ? " mutates" : ""}`, attrs: { type: "button", "data-action": "runAction", "data-action-id": a.id, title: localize(a.label), "aria-label": localize(a.label) } }, [icon(a.icon)]);
      bar.append(b);
    }
  }

  #onKey(event) {
    if ( event.target?.closest?.(".gmal-image-viewport, input, textarea, select, audio, video") && !["PageUp", "PageDown"].includes(event.key) ) return;
    if ( event.key === "ArrowLeft" || event.key === "PageUp" ) { event.preventDefault(); this.show(this.index - 1); }
    else if ( event.key === "ArrowRight" || event.key === "PageDown" ) { event.preventDefault(); this.show(this.index + 1); }
  }

  static #onPrev() { this.show(this.index - 1); }

  static #onNext() { this.show(this.index + 1); }

  static async #onFavorite() {
    const r = this.record;
    if ( !r || !this.services.organization ) return;
    await this.services.organization.toggleFavorite(r.id);
    this.render({ force: false });
  }

  static async #onRunAction(event, target) {
    const id = target.dataset.actionId;
    const r = this.record;
    if ( !id || !r ) return;
    await this.services.actions?.run(id, [r], { ...(this.services.actionContext ?? {}), resultSet: this.records });
    this.render({ force: false });
  }

  static #onBack() { this.close(); }
}
