import { ASSET_TYPE, CATEGORIES, MODULE_ID, SOURCE_KIND, THUMBNAIL_SIZES, VIEW_MODE } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { canUseBrowser } from "../core/permissions.js";
import { getSetting, setSetting, SETTINGS, settingDefinitions } from "../core/settings.js";
import { dialogs } from "../actions/dialogs.js";
import { localize } from "../utilities/dom.js";
import { debounce } from "../utilities/async.js";
import { VirtualGrid } from "./virtual-grid.js";
import { CardRenderer } from "./card-renderer.js";
import { DetailsPanel } from "./details-panel.js";
import { FilterPanel, MEDIA_TYPES } from "./filter-panel.js";
import { Sidebar } from "./sidebar.js";
import { PreviewViewerApplication } from "./preview-viewer-app.js";
import { DiagnosticsApplication } from "./diagnostics-app.js";
import { previewService } from "../previews/preview-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The asset browser window.
 *
 * The Handlebars part renders the static shell once; everything dynamic (grid, sidebar, filters,
 * details, status) is managed in plain DOM so thousands of results never cause a full re-render.
 */
export class AssetBrowserApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.services = options.services;
    const s = this.services;
    this.state = {
      text: "", view: "category", category: "all", collectionId: null, savedSearchId: null,
      filters: {}, sort: getSetting(SETTINGS.SORT) ?? "name:asc", viewMode: getSetting(SETTINGS.VIEW_MODE) ?? VIEW_MODE.GRID,
      thumbSize: getSetting(SETTINGS.THUMBNAIL_SIZE) ?? 160, showSidebar: getSetting(SETTINGS.SHOW_SIDEBAR) !== false, showDetails: getSetting(SETTINGS.SHOW_DETAILS) !== false,
      showFilters: false, selection: new Set(), anchorId: null, activeId: null, scope: getSetting(SETTINGS.SEARCH_SCOPE) ?? "all"
    };
    this.results = [];
    this.warnings = [];
    this.grid = null;
    this.viewer = null;
    this.#unsubscribe = [];
    this.recompute = debounce(() => this.#recompute(), 120);
    this.scheduleSidebar = debounce(() => this.#renderSidebar(), 250);
    this.cardRenderer = new CardRenderer(s, {
      showMeta: getSetting(SETTINGS.SHOW_CARD_META) === true,
      isSelected: id => this.state.selection.has(id),
      isActive: id => this.state.activeId === id,
      onNeedsRefresh: id => { this.grid?.refresh(id); if ( this.state.selection.size === 1 && this.state.selection.has(id) ) this.#renderDetails(); }
    });
    this.actionContext = () => ({
      organization: s.organization, catalog: s.catalog, health: s.health, metadata: s.metadata,
      openPreview: (record, set) => this.openPreview(record, set), resultSet: this.results,
      collectionId: this.state.view === "collection" ? this.state.collectionId : null,
      showUsages: (record, result) => this.details?.showUsages(record, result),
      refresh: (opts={}) => { if ( opts.roles ) this.#applyRoles(); this.recompute(); this.grid?.refreshAll(); this.#renderDetails(); },
      lastActorId: this._lastActorId ?? null
    });
  }

  #unsubscribe;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-browser`,
    classes: [MODULE_ID, "gmal-browser"],
    window: {
      title: "GMAL.Title", icon: "fa-solid fa-images", resizable: true,
      controls: [
        { icon: "fa-solid fa-stethoscope", label: "GMAL.Diagnostics.Title", action: "openDiagnostics" },
        { icon: "fa-solid fa-gear", label: "GMAL.OpenSettings", action: "openSettings" }
      ]
    },
    position: { width: 1240, height: 820 },
    actions: {
      toggleSidebar: AssetBrowserApplication.#onToggleSidebar,
      toggleDetails: AssetBrowserApplication.#onToggleDetails,
      toggleFilters: AssetBrowserApplication.#onToggleFilters,
      refresh: AssetBrowserApplication.#onRefresh,
      cancelIndex: AssetBrowserApplication.#onCancelIndex,
      saveSearch: AssetBrowserApplication.#onSaveSearch,
      selectAll: AssetBrowserApplication.#onSelectAll,
      selectVisible: AssetBrowserApplication.#onSelectVisible,
      clearSelection: AssetBrowserApplication.#onClearSelection,
      setViewMode: AssetBrowserApplication.#onSetViewMode,
      openDiagnostics: AssetBrowserApplication.#onOpenDiagnostics,
      openSettings: AssetBrowserApplication.#onOpenSettings,
      clearFilters: AssetBrowserApplication.#onClearFilters
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/browser.hbs` } };

  /* -------------------------------------------- */
  /*  Rendering lifecycle                          */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sortDef = settingDefinitions().find(d => d.key === SETTINGS.SORT);
    context.sorts = Object.entries(sortDef.choices).map(([value, label]) => ({ value, label, selected: value === this.state.sort }));
    context.state = this.state;
    context.thumbSizes = THUMBNAIL_SIZES;
    context.isGrid = this.state.viewMode === VIEW_MODE.GRID;
    context.canUse = canUseBrowser();
    return context;
  }

  _canRender(options) {
    if ( !canUseBrowser() ) { ui.notifications?.warn(localize("GMAL.NoAccess")); return false; }
    return super._canRender(options);
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const { catalog, organization } = this.services;
    this.#unsubscribe.push(catalog.on("updated", () => { this.#applyRoles(); this.recompute(); this.scheduleSidebar(); }));
    this.#unsubscribe.push(catalog.on("state", () => this.#renderStatus()));
    this.#unsubscribe.push(catalog.on("done", () => { this.#renderStatus(); this.services.health?.computeDuplicates(); this.scheduleSidebar(); }));
    this.#unsubscribe.push(organization.on("changed", ev => { if ( ev.kind === "roles" || ev.kind === "all" ) this.#applyRoles(); this.services.search.invalidate(ev.ids?.map(id => catalog.get(id)).filter(Boolean) ?? catalog.all()); this.recompute(); this.grid?.refreshAll(); this.#renderDetails(); this.scheduleSidebar(); }));
    this.services.ensureIndexed?.();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;
    this.#destroyGrid();
    const viewport = root.querySelector(".gmal-grid-viewport");
    this.grid = new VirtualGrid(viewport, {
      renderCard: (r, elm, o) => this.cardRenderer.render(r, elm, o),
      recycleCard: elm => this.cardRenderer.recycle(elm),
      ...this.#layoutFor(this.state.viewMode, this.state.thumbSize)
    });
    this.details = new DetailsPanel(root.querySelector(".gmal-details-body"), this.services, { runAction: (id, records) => this.runAction(id, records), actionContext: this.actionContext });
    this.filterPanel = new FilterPanel(root.querySelector(".gmal-filter-body"), { onChange: filters => { this.state.filters = filters; this.#recompute(); this.#renderToolbarState(); } });
    this.sidebar = new Sidebar(root.querySelector(".gmal-sidebar-body"), {
      organization: this.services.organization,
      onSelect: sel => this.setView(sel),
      onNewCollection: () => this.#newCollection()
    });
    this.#bindToolbar(root);
    this.#bindGrid(viewport);
    this.#bindContextMenus(root);
    this.#applyLayoutClasses();
    this.#applyRoles();
    this.#renderSidebar();
    this.#recompute();
    this.#renderStatus();
    this.#renderDetails();
  }

  async _preClose(options) {
    await super._preClose(options);
    for ( const off of this.#unsubscribe ) { try { off(); } catch {} }
    this.#unsubscribe = [];
    this.recompute.cancel();
    this.scheduleSidebar.cancel();
    this.#destroyGrid();
    for ( const m of this._contextMenus ?? [] ) { try { m.close?.({ animate: false }); } catch {} }
    this._contextMenus = [];
    previewService.stopAll();
    this.services.thumbnails?.releaseAll();
    this.services.metadata?.cancelPending?.();
    if ( this.viewer?.rendered ) this.viewer.close();
  }

  #destroyGrid() { this.grid?.destroy(); this.grid = null; }

  #layoutFor(mode, size) {
    if ( mode === VIEW_MODE.LIST ) return { mode: "list", itemWidth: 0, itemHeight: 44, gap: 4 };
    return { mode: "grid", itemWidth: size, itemHeight: size + 48, gap: 10 };
  }

  #applyLayoutClasses() {
    const root = this.element;
    root.classList.toggle("hide-sidebar", !this.state.showSidebar);
    root.classList.toggle("hide-details", !this.state.showDetails);
    root.classList.toggle("show-filters", this.state.showFilters);
    root.classList.toggle("list-mode", this.state.viewMode === VIEW_MODE.LIST);
  }

  /* -------------------------------------------- */
  /*  Toolbar / grid wiring                        */
  /* -------------------------------------------- */

  #bindToolbar(root) {
    const search = root.querySelector(".gmal-search");
    search.value = this.state.text;
    const onInput = debounce(() => { this.state.text = search.value; this.#recompute(); }, 180);
    search.addEventListener("input", onInput);
    search.addEventListener("keydown", e => { if ( e.key === "Escape" ) { search.value = ""; this.state.text = ""; this.#recompute(); } if ( e.key === "Enter" ) { onInput.flush(); this.#focusGrid(); } });
    root.querySelector(".gmal-sort").addEventListener("change", e => { this.state.sort = e.target.value; setSetting(SETTINGS.SORT, this.state.sort).catch(() => {}); this.#recompute(); });
    const slider = root.querySelector(".gmal-thumb-size");
    slider.value = String(this.state.thumbSize);
    slider.addEventListener("input", () => { this.state.thumbSize = Number(slider.value); this.grid?.setLayout(this.#layoutFor(this.state.viewMode, this.state.thumbSize)); });
    slider.addEventListener("change", () => setSetting(SETTINGS.THUMBNAIL_SIZE, this.state.thumbSize).catch(() => {}));
    const scope = root.querySelector(".gmal-scope");
    if ( scope ) { scope.value = this.state.scope; scope.addEventListener("change", () => { this.state.scope = scope.value; setSetting(SETTINGS.SEARCH_SCOPE, scope.value).catch(() => {}); this.#recompute(); }); }
    this.#renderToolbarState();
  }

  #renderToolbarState() {
    const root = this.element;
    if ( !root ) return;
    const n = this.filterPanel?.activeCount(this.state.filters) ?? 0;
    const badge = root.querySelector(".gmal-filter-count");
    if ( badge ) { badge.textContent = n ? String(n) : ""; badge.hidden = !n; }
    root.querySelector("[data-action=toggleFilters]")?.setAttribute("aria-expanded", this.state.showFilters ? "true" : "false");
    for ( const b of root.querySelectorAll("[data-action=setViewMode]") ) b.classList.toggle("active", b.dataset.mode === this.state.viewMode);
    const slider = root.querySelector(".gmal-thumb-size");
    if ( slider ) slider.disabled = this.state.viewMode === VIEW_MODE.LIST;
  }

  #bindGrid(viewport) {
    viewport.addEventListener("click", e => {
      const favBtn = e.target.closest("[data-card-action=favorite]");
      const card = e.target.closest(".gmal-card");
      if ( !card ) { if ( e.target === viewport || e.target.classList.contains("gmal-virtual-layer") ) this.clearSelection(); return; }
      const id = card.dataset.id;
      if ( favBtn ) { e.stopPropagation(); this.services.organization.toggleFavorite(id).catch(err => this.#permissionNotice(err)); return; }
      this.#select(id, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
    });
    viewport.addEventListener("dblclick", e => {
      const card = e.target.closest(".gmal-card");
      if ( !card ) return;
      const record = this.services.catalog.get(card.dataset.id) ?? this.results.find(r => r.id === card.dataset.id);
      if ( record ) this.openPreview(record, this.results);
    });
    viewport.addEventListener("keydown", e => this.#onGridKey(e));
    viewport.addEventListener("dragstart", e => {
      const card = e.target.closest(".gmal-card");
      if ( !card ) return;
      const record = this.results.find(r => r.id === card.dataset.id);
      if ( !record ) return;
      this.#setDragData(e.dataTransfer, record);
    });
    viewport.addEventListener("focusin", e => {
      const card = e.target.closest(".gmal-card");
      if ( card && this.state.activeId !== card.dataset.id ) { const prev = this.state.activeId; this.state.activeId = card.dataset.id; if ( prev ) this.grid?.refresh(prev); this.grid?.refresh(card.dataset.id); }
    });
  }

  /**
   * Drag payloads: a file path as plain text (any text or file-picker input accepts it, including the
   * image fields of Actor/Item/Scene sheets); documents use Foundry's own {type, uuid} drop data so the
   * canvas and sidebars accept them.
   */
  #setDragData(dt, record) {
    if ( !dt ) return;
    if ( record.kind === "document" && record.uuid ) {
      dt.setData("text/plain", JSON.stringify({ type: record.documentName, uuid: record.uuid }));
    } else if ( record.url ) {
      dt.setData("text/plain", record.url);
      try { dt.setData("text/uri-list", new URL(foundry.utils.getRoute?.(record.url) ?? record.url, location.origin).href); } catch {}
    }
    dt.effectAllowed = "copy";
    const card = this.grid?.cardFor(record.id);
    const img = card?.querySelector("img.gmal-thumb");
    if ( img?.complete && img.naturalWidth ) dt.setDragImage(img, 32, 32);
  }

  #onGridKey(e) {
    const grid = this.grid;
    if ( !grid || !this.results.length ) return;
    const cols = grid.columns;
    const idx = this.state.activeId ? grid.indexOf(this.state.activeId) : -1;
    const max = this.results.length - 1;
    const move = (to, extend=false) => {
      const target = Math.max(0, Math.min(max, to));
      const id = this.results[target].id;
      grid.scrollToIndex(target);
      this.#select(id, { range: extend, keyboard: true });
      grid.cardFor(id)?.focus({ preventScroll: true });
    };
    switch ( e.key ) {
      case "ArrowRight": e.preventDefault(); move(idx + 1, e.shiftKey); break;
      case "ArrowLeft": e.preventDefault(); move(idx - 1, e.shiftKey); break;
      case "ArrowDown": e.preventDefault(); move(idx < 0 ? 0 : idx + cols, e.shiftKey); break;
      case "ArrowUp": e.preventDefault(); move(idx - cols, e.shiftKey); break;
      case "Home": e.preventDefault(); move(0, e.shiftKey); break;
      case "End": e.preventDefault(); move(max, e.shiftKey); break;
      case "PageDown": e.preventDefault(); move(idx + cols * 4, e.shiftKey); break;
      case "PageUp": e.preventDefault(); move(idx - cols * 4, e.shiftKey); break;
      case "Enter": { e.preventDefault(); const r = this.results[idx]; if ( r ) this.openPreview(r, this.results); break; }
      case " ": { e.preventDefault(); const r = this.results[idx]; if ( r ) this.#select(r.id, { toggle: true }); break; }
      case "f": case "F": { if ( e.ctrlKey || e.metaKey ) return; const r = this.results[idx]; if ( r ) this.services.organization.toggleFavorite(r.id).catch(err => this.#permissionNotice(err)); break; }
      case "a": case "A": if ( e.ctrlKey || e.metaKey ) { e.preventDefault(); this.selectAll(); } break;
      case "Escape": this.clearSelection(); break;
      default:
    }
  }

  #focusGrid() {
    const first = this.results[0];
    if ( !first ) return;
    if ( !this.state.activeId || this.grid.indexOf(this.state.activeId) < 0 ) this.state.activeId = first.id;
    this.grid.scrollToIndex(this.grid.indexOf(this.state.activeId));
    this.grid.cardFor(this.state.activeId)?.focus({ preventScroll: true });
  }

  /* -------------------------------------------- */
  /*  Context menus                                */
  /* -------------------------------------------- */

  #bindContextMenus(root) {
    const CM = foundry.applications.ux?.ContextMenu?.implementation ?? foundry.applications.ux?.ContextMenu;
    this._contextMenus = [];
    if ( !CM ) return;
    const targetRecords = target => {
      const id = target?.dataset?.id;
      if ( id && !this.state.selection.has(id) ) this.#select(id, {});
      return this.selectedRecords();
    };
    const entries = this.services.actions.all().map(a => ({
      label: localize(a.label),
      icon: a.icon,
      classes: a.mutates ? "gmal-menu-mutates" : "",
      group: a.group,
      visible: target => { const recs = targetRecords(target); return recs.length > 0 && (recs.length === 1 || a.multi) && safe(() => a.available(recs, this.actionContext())); },
      onClick: target => this.runAction(a.id, targetRecords(target))
    }));
    try {
      this._contextMenus.push(new CM(root.querySelector(".gmal-grid-viewport"), ".gmal-card", entries, { fixed: true, jQuery: false }));
    } catch (err) { diagnostics.warn("Could not create card context menu", err); }

    const org = this.services.organization;
    const colEntries = [
      { label: localize("GMAL.Collections.Rename"), icon: "fa-solid fa-pen", visible: () => org.canEditShared, onClick: async t => { const col = org.getCollection(t.dataset.collectionId); const name = await dialogs.promptText({ title: localize("GMAL.Collections.Rename"), label: localize("GMAL.Collections.Name"), value: col?.name ?? "" }); if ( name ) await org.renameCollection(col.id, name).catch(err => this.#permissionNotice(err)); } },
      { label: localize("GMAL.Collections.Duplicate"), icon: "fa-solid fa-clone", visible: () => org.canEditShared, onClick: t => org.duplicateCollection(t.dataset.collectionId).catch(err => this.#permissionNotice(err)) },
      { label: localize("GMAL.Collections.MoveUp"), icon: "fa-solid fa-arrow-up", visible: () => org.canEditShared, onClick: t => this.#moveCollection(t.dataset.collectionId, -1) },
      { label: localize("GMAL.Collections.MoveDown"), icon: "fa-solid fa-arrow-down", visible: () => org.canEditShared, onClick: t => this.#moveCollection(t.dataset.collectionId, 1) },
      { label: localize("GMAL.Collections.Delete"), icon: "fa-solid fa-trash", classes: "gmal-menu-mutates", visible: () => org.canEditShared, onClick: async t => {
        const col = org.getCollection(t.dataset.collectionId);
        if ( !col ) return;
        const ok = await dialogs.confirm({ title: localize("GMAL.Collections.Delete"), danger: true, yesLabel: localize("GMAL.Collections.Delete"), content: `<p>${foundry.utils.escapeHTML(localize("GMAL.Collections.DeleteConfirm", { name: col.name, count: col.assetIds.length }))}</p>` });
        if ( ok ) { await org.deleteCollection(col.id).catch(err => this.#permissionNotice(err)); if ( this.state.collectionId === col.id ) this.setView({ view: "category", category: "all" }); }
      } }
    ];
    const savedEntries = [
      { label: localize("GMAL.SavedSearches.Rename"), icon: "fa-solid fa-pen", onClick: async t => { const s = org.savedSearches().find(x => x.id === t.dataset.savedSearchId); const name = await dialogs.promptText({ title: localize("GMAL.SavedSearches.Rename"), label: localize("GMAL.Details.Name"), value: s?.name ?? "" }); if ( name ) await org.updateSavedSearch(s.id, { name }); } },
      { label: localize("GMAL.SavedSearches.Update"), icon: "fa-solid fa-floppy-disk", onClick: t => org.updateSavedSearch(t.dataset.savedSearchId, { text: this.state.text, category: this.state.category, filters: this.state.filters, sort: this.state.sort }) },
      { label: localize("GMAL.SavedSearches.Duplicate"), icon: "fa-solid fa-clone", onClick: t => org.duplicateSavedSearch(t.dataset.savedSearchId) },
      { label: localize("GMAL.SavedSearches.Delete"), icon: "fa-solid fa-trash", classes: "gmal-menu-mutates", onClick: async t => { await org.deleteSavedSearch(t.dataset.savedSearchId); if ( this.state.savedSearchId === t.dataset.savedSearchId ) this.setView({ view: "category", category: "all" }); } }
    ];
    try {
      this._contextMenus.push(new CM(root.querySelector(".gmal-sidebar-body"), ".gmal-nav-collection", colEntries, { fixed: true, jQuery: false }));
      this._contextMenus.push(new CM(root.querySelector(".gmal-sidebar-body"), ".gmal-nav-saved-search", savedEntries, { fixed: true, jQuery: false }));
    } catch (err) { diagnostics.warn("Could not create sidebar context menus", err); }
  }

  async #moveCollection(id, delta) {
    const org = this.services.organization;
    const ids = org.collections().map(c => c.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if ( i < 0 || j < 0 || j >= ids.length ) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await org.reorderCollections(ids).catch(err => this.#permissionNotice(err));
  }

  async #newCollection() {
    const name = await dialogs.promptText({ title: localize("GMAL.Collections.New"), label: localize("GMAL.Collections.Name") });
    if ( !name?.trim() ) return;
    try {
      const col = await this.services.organization.createCollection(name);
      if ( this.state.selection.size ) {
        const ok = await dialogs.confirm({ title: localize("GMAL.Collections.New"), content: `<p>${foundry.utils.escapeHTML(localize("GMAL.Collections.AddSelectedPrompt", { count: this.state.selection.size, name: col.name }))}</p>` });
        if ( ok ) await this.services.organization.addToCollection(col.id, [...this.state.selection]);
      }
      this.setView({ view: "collection", collectionId: col.id });
    } catch (err) { this.#permissionNotice(err); }
  }

  #permissionNotice(err) {
    if ( err?.name === "PermissionError" ) ui.notifications?.warn(localize("GMAL.NoSharedEdit"));
    else { diagnostics.error("Organization update failed", err); ui.notifications?.error(err?.message ?? String(err)); }
  }

  /* -------------------------------------------- */
  /*  State                                        */
  /* -------------------------------------------- */

  setView({ view, category=null, collectionId=null, savedSearchId=null }) {
    const s = this.state;
    s.view = view;
    if ( view === "category" ) s.category = category ?? "all";
    s.collectionId = collectionId;
    s.savedSearchId = savedSearchId;
    if ( view === "saved" ) {
      const saved = this.services.organization.savedSearches().find(x => x.id === savedSearchId);
      if ( saved ) {
        s.text = saved.text; s.category = saved.category; s.filters = { ...saved.filters }; s.sort = saved.sort;
        const input = this.element?.querySelector(".gmal-search"); if ( input ) input.value = s.text;
        const sort = this.element?.querySelector(".gmal-sort"); if ( sort ) sort.value = s.sort;
      }
    } else if ( view !== "category" ) s.category = "all";
    if ( view === "duplicates" ) this.services.health?.computeDuplicates();
    if ( view === "missing" ) this.#loadMissing();
    this.clearSelection({ silent: true });
    this.#recompute();
    this.#renderSidebar();
    this.#renderToolbarState();
  }

  async #loadMissing() {
    this.missingReport = null;
    this.#renderStatus();
    try {
      const health = this.services.health;
      const roots = this.services.fileRoots?.() ?? [];
      this.missingReport = await health.missingReferences({ roots });
    } catch (err) { diagnostics.error("Missing reference scan failed", err); this.missingReport = { results: [], error: err?.message }; }
    if ( this.state.view === "missing" ) { this.#recompute(); this.#renderStatus(); }
  }

  #applyRoles() {
    const { organization, catalog, search } = this.services;
    organization.applyRoles(catalog.all());
    search.invalidate(catalog.all());
  }

  /** Records to feed the search for the current view. */
  #baseRecords() {
    const { catalog, organization, health } = this.services;
    const s = this.state;
    const placeholder = id => organization.getAlias(id) ? { ...placeholderRecord(id), name: organization.getAlias(id) } : placeholderRecord(id);
    switch ( s.view ) {
      case "favorites": return organization.favoriteIds().map(id => catalog.get(id) ?? placeholder(id));
      case "recent": return organization.recentIds().map(id => catalog.get(id)).filter(Boolean);
      case "collection": { const col = organization.getCollection(s.collectionId); return (col?.assetIds ?? []).map(id => catalog.get(id) ?? placeholder(id)); }
      case "duplicates": { const ids = health?.duplicateIds ?? new Set(); return [...ids].map(id => catalog.get(id)).filter(Boolean); }
      case "missing": {
        const out = [];
        for ( const r of health?.staleEntries() ?? [] ) out.push(r);
        for ( const m of this.missingReport?.results ?? [] ) if ( m.status !== "ok" ) out.push(missingRecord(m));
        return out;
      }
      default: return [...catalog.all()];
    }
  }

  #recompute() {
    if ( !this.grid ) return;
    const { search } = this.services;
    const s = this.state;
    const base = this.#baseRecords();
    const sort = s.view === "recent" && s.sort === "name:asc" ? "recent:desc" : s.sort;
    const { results, warnings } = search.query(base, { text: s.text, category: s.view === "category" ? s.category : "all", filters: s.filters, sort, scope: s.view === "category" ? s.scope : "all" });
    this.results = results;
    this.warnings = warnings;
    const keep = new Set(results.map(r => r.id));
    let changed = false;
    for ( const id of [...s.selection] ) if ( !keep.has(id) ) { s.selection.delete(id); changed = true; }
    if ( s.activeId && !keep.has(s.activeId) ) s.activeId = null;
    this.grid.setItems(results, { keepScroll: true });
    const facets = search.facets(base);
    this.filterPanel?.render(facets, s.filters, { hasImages: facets.types.some(t => t.key === ASSET_TYPE.IMAGE || t.key === ASSET_TYPE.SCENE), hasMedia: facets.types.some(t => MEDIA_TYPES.includes(t.key)) });
    this.#renderEmptyState(base.length);
    this.#renderStatus();
    if ( changed ) this.#renderDetails();
  }

  #renderEmptyState(baseCount) {
    const empty = this.element.querySelector(".gmal-empty");
    const catalog = this.services.catalog;
    const s = this.state;
    if ( this.results.length ) { empty.hidden = true; return; }
    empty.hidden = false;
    const title = empty.querySelector(".gmal-empty-title");
    const hint = empty.querySelector(".gmal-empty-hint");
    if ( catalog.indexing && catalog.size === 0 ) { title.textContent = localize("GMAL.Empty.Indexing"); hint.textContent = localize("GMAL.Empty.IndexingHint"); }
    else if ( catalog.size === 0 ) { title.textContent = localize("GMAL.Empty.NoCatalog"); hint.textContent = localize("GMAL.Empty.NoCatalogHint"); }
    else if ( s.view === "favorites" ) { title.textContent = localize("GMAL.Empty.NoFavorites"); hint.textContent = localize("GMAL.Empty.NoFavoritesHint"); }
    else if ( s.view === "collection" ) { title.textContent = localize("GMAL.Empty.EmptyCollection"); hint.textContent = localize("GMAL.Empty.EmptyCollectionHint"); }
    else if ( s.view === "duplicates" ) { title.textContent = localize("GMAL.Empty.NoDuplicates"); hint.textContent = localize("GMAL.Empty.NoDuplicatesHint"); }
    else if ( s.view === "missing" ) { title.textContent = this.missingReport ? localize("GMAL.Empty.NoMissing") : localize("GMAL.Empty.CheckingMissing"); hint.textContent = this.missingReport ? localize("GMAL.Empty.NoMissingHint") : ""; }
    else if ( baseCount && (s.text || this.filterPanel?.activeCount(s.filters)) ) { title.textContent = localize("GMAL.Empty.NoMatches"); hint.textContent = localize("GMAL.Empty.NoMatchesHint"); }
    else { title.textContent = localize("GMAL.Empty.Nothing"); hint.textContent = localize("GMAL.Empty.NothingHint"); }
  }

  #renderStatus() {
    const root = this.element;
    if ( !root ) return;
    const catalog = this.services.catalog;
    const status = root.querySelector(".gmal-status-text");
    const parts = [localize("GMAL.Status.Results", { count: this.results.length })];
    if ( this.state.selection.size ) parts.push(localize("GMAL.Status.Selected", { count: this.state.selection.size }));
    const st = catalog.state;
    if ( st.status === "indexing" ) {
      const running = Object.entries(st.adapters).find(([, a]) => a.status === "scanning");
      parts.push(running ? localize("GMAL.Status.Indexing", { source: running[1].label, count: running[1].count }) : localize("GMAL.Status.IndexingGeneric"));
    } else if ( st.status === "interrupted" ) parts.push(localize("GMAL.Status.Interrupted"));
    else if ( st.fromCache ) parts.push(localize("GMAL.Status.FromCache"));
    if ( this.state.view === "missing" && !this.missingReport ) parts.push(localize("GMAL.Status.CheckingReferences"));
    const truncated = Object.values(st.adapters).some(a => a.detail?.truncated);
    if ( truncated ) parts.push(localize("GMAL.Status.Truncated"));
    const unavailable = Object.values(st.adapters).filter(a => a.status === "unavailable").map(a => a.label);
    if ( unavailable.length ) parts.push(localize("GMAL.Status.Unavailable", { sources: unavailable.join(", ") }));
    status.textContent = parts.join(" · ");
    const warn = root.querySelector(".gmal-status-warnings");
    warn.textContent = this.warnings.join(" ");
    warn.hidden = !this.warnings.length;
    root.querySelector("[data-action=cancelIndex]").hidden = st.status !== "indexing";
    root.querySelector("[data-action=refresh]").disabled = st.status === "indexing";
    const progress = root.querySelector(".gmal-progress");
    progress.hidden = st.status !== "indexing";
  }

  #renderSidebar() {
    if ( !this.sidebar ) return;
    const { catalog, organization, health } = this.services;
    const counts = { categories: {}, favorites: organization.favoriteIds().length, recent: organization.recentIds().filter(id => catalog.get(id)).length, duplicates: health?.duplicateGroups?.length ?? 0, missing: (health?.staleEntries().length ?? 0) + (this.missingReport?.results.filter(m => m.status !== "ok").length ?? 0) };
    for ( const c of CATEGORIES ) counts.categories[c.id] = 0;
    for ( const r of catalog.all() ) for ( const c of CATEGORIES ) if ( c.match(r) ) counts.categories[c.id]++;
    this.sidebar.render(this.state, counts);
  }

  #renderDetails() {
    if ( !this.details ) return;
    this.details.render(this.selectedRecords());
    const count = this.element.querySelector(".gmal-details-count");
    if ( count ) count.textContent = this.state.selection.size > 1 ? `(${this.state.selection.size})` : "";
  }

  /* -------------------------------------------- */
  /*  Selection                                    */
  /* -------------------------------------------- */

  selectedRecords() {
    const out = [];
    for ( const id of this.state.selection ) { const r = this.results.find(x => x.id === id) ?? this.services.catalog.get(id); if ( r ) out.push(r); }
    return out;
  }

  #select(id, { toggle=false, range=false, keyboard=false }={}) {
    const s = this.state;
    const prevActive = s.activeId;
    const touched = new Set([id]);
    if ( range && s.anchorId ) {
      const a = this.grid.indexOf(s.anchorId);
      const b = this.grid.indexOf(id);
      if ( a >= 0 && b >= 0 ) {
        if ( !toggle ) for ( const old of s.selection ) touched.add(old);
        if ( !toggle ) s.selection.clear();
        for ( let i = Math.min(a, b); i <= Math.max(a, b); i++ ) { s.selection.add(this.results[i].id); touched.add(this.results[i].id); }
      }
    } else if ( toggle ) {
      if ( s.selection.has(id) ) s.selection.delete(id); else s.selection.add(id);
      s.anchorId = id;
    } else {
      for ( const old of s.selection ) touched.add(old);
      s.selection.clear();
      s.selection.add(id);
      s.anchorId = id;
    }
    s.activeId = id;
    if ( prevActive ) touched.add(prevActive);
    for ( const t of touched ) this.grid.refresh(t);
    const rec = this.services.catalog.get(id);
    if ( rec && !keyboard && s.selection.size === 1 ) this.services.metadata?.enrich(rec, { priority: true }).then(() => { if ( s.selection.has(id) ) { this.grid?.refresh(id); this.#renderDetails(); } }).catch(() => {});
    this.#renderDetails();
    this.#renderStatus();
  }

  selectAll() {
    for ( const r of this.results ) this.state.selection.add(r.id);
    this.grid?.refreshAll();
    this.#renderDetails();
    this.#renderStatus();
  }

  selectVisible() {
    const { start, end } = this.grid.visibleRange();
    for ( let i = start; i < end; i++ ) this.state.selection.add(this.results[i].id);
    this.grid?.refreshAll();
    this.#renderDetails();
    this.#renderStatus();
  }

  clearSelection({ silent=false }={}) {
    const had = [...this.state.selection];
    this.state.selection.clear();
    this.state.anchorId = null;
    for ( const id of had ) this.grid?.refresh(id);
    if ( !silent ) { this.#renderDetails(); this.#renderStatus(); }
  }

  /* -------------------------------------------- */
  /*  Actions & preview                            */
  /* -------------------------------------------- */

  async runAction(id, records) {
    const result = await this.services.actions.run(id, records, this.actionContext());
    this.#renderDetails();
    return result;
  }

  openPreview(record, set=this.results) {
    const records = set.length ? set : [record];
    const index = Math.max(0, records.indexOf(record));
    const services = { organization: this.services.organization, actions: this.services.actions, metadata: this.services.metadata, health: this.services.health, actionContext: this.actionContext() };
    if ( this.viewer?.rendered ) { this.viewer.records = records; this.viewer.services = services; this.viewer.show(index); this.viewer.bringToFront(); return this.viewer; }
    this.viewer = new PreviewViewerApplication({ records, index, services });
    this.viewer.render({ force: true });
    return this.viewer;
  }

  /* -------------------------------------------- */
  /*  Action handlers                              */
  /* -------------------------------------------- */

  static #onToggleSidebar() { this.state.showSidebar = !this.state.showSidebar; setSetting(SETTINGS.SHOW_SIDEBAR, this.state.showSidebar).catch(() => {}); this.#applyLayoutClasses(); this.grid?.setLayout({}); }

  static #onToggleDetails() { this.state.showDetails = !this.state.showDetails; setSetting(SETTINGS.SHOW_DETAILS, this.state.showDetails).catch(() => {}); this.#applyLayoutClasses(); this.grid?.setLayout({}); }

  static #onToggleFilters() { this.state.showFilters = !this.state.showFilters; this.#applyLayoutClasses(); this.#renderToolbarState(); this.grid?.setLayout({}); }

  static async #onRefresh() { await this.services.reindex?.({ full: true }); }

  static #onCancelIndex() { this.services.catalog.cancel(); }

  static async #onSaveSearch() {
    const name = await dialogs.promptText({ title: localize("GMAL.SavedSearches.Save"), label: localize("GMAL.Details.Name"), value: this.state.text || localize(CATEGORIES.find(c => c.id === this.state.category)?.label ?? "GMAL.Category.All") });
    if ( !name?.trim() ) return;
    const saved = await this.services.organization.saveSearch({ name, text: this.state.text, category: this.state.category, filters: this.state.filters, sort: this.state.sort });
    this.setView({ view: "saved", savedSearchId: saved.id });
  }

  static #onSelectAll() { this.selectAll(); }

  static #onSelectVisible() { this.selectVisible(); }

  static #onClearSelection() { this.clearSelection(); }

  static #onSetViewMode(event, target) {
    const mode = target.dataset.mode === VIEW_MODE.LIST ? VIEW_MODE.LIST : VIEW_MODE.GRID;
    this.state.viewMode = mode;
    setSetting(SETTINGS.VIEW_MODE, mode).catch(() => {});
    this.#applyLayoutClasses();
    this.grid?.setLayout(this.#layoutFor(mode, this.state.thumbSize));
    this.#renderToolbarState();
  }

  static #onOpenDiagnostics() { new DiagnosticsApplication({ services: this.services }).render({ force: true }); }

  static #onOpenSettings() { game.settings.sheet?.render(true); }

  static #onClearFilters() { this.filterPanel?.reset(); }
}

function safe(fn) { try { return Boolean(fn()); } catch { return false; } }

/** A stand-in record for an organized asset that no longer exists in the catalog. */
export function placeholderRecord(id) {
  const [, , ...rest] = id.split(":");
  const tail = rest.join(":") || id;
  return {
    id, kind: id.startsWith("file:") ? "file" : "document", missing: true,
    source: { kind: id.startsWith("pack:") ? SOURCE_KIND.COMPENDIUM : id.startsWith("doc:") ? SOURCE_KIND.WORLD : SOURCE_KIND.FILE, storage: id.startsWith("file:") ? id.split(":")[1] : undefined },
    type: ASSET_TYPE.OTHER, role: null, roleSource: null, mapType: null,
    name: tail.split("/").pop(), fileName: null, path: id.startsWith("file:") ? tail : null, url: null, folder: "", extension: "",
    thumbnail: null, icon: "fa-solid fa-link-slash", documentName: null, documentType: null, uuid: id.startsWith("file:") ? null : tail,
    meta: { width: null, height: null, size: null, duration: null, discoveredAt: null, modifiedAt: null }, accessible: false, previewable: false
  };
}

function missingRecord(m) {
  const rec = placeholderRecord(`file:data:${m.path}`);
  rec.missing = m.status === "missing";
  rec.name = m.path.split("/").pop();
  rec.path = m.path;
  rec.summary = `${m.status === "missing" ? localize("GMAL.Missing.Missing") : localize("GMAL.Missing.Unchecked")} (${m.reason}). ${localize("GMAL.Missing.ReferencedBy", { count: m.refs.length })}: ${m.refs.slice(0, 5).map(r => `${r.documentName} "${r.name}"`).join(", ")}`;
  rec.references = Object.fromEntries(m.refs.slice(0, 6).map((r, i) => [`ref${i + 1}`, `${r.documentName}: ${r.name} (${r.field})`]));
  rec.icon = m.status === "missing" ? "fa-solid fa-link-slash" : "fa-solid fa-circle-question";
  return rec;
}

