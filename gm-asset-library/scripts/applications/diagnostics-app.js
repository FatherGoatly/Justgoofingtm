import { MODULE_ID } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { permissionSummary } from "../core/permissions.js";
import { copyText } from "../actions/foundry-actions.js";
import { localize } from "../utilities/dom.js";
import { formatRelativeTime } from "../utilities/format.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Diagnostics: versions, indexed sources, failures, caches, registered extensions. */
export class DiagnosticsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options={}) {
    super(options);
    this.services = options.services ?? {};
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-diagnostics`,
    classes: [MODULE_ID, "gmal-diagnostics"],
    window: { title: "GMAL.Diagnostics.Title", icon: "fa-solid fa-stethoscope", resizable: true },
    position: { width: 720, height: 640 },
    actions: {
      copyReport: DiagnosticsApplication.#onCopy,
      clearCaches: DiagnosticsApplication.#onClearCaches,
      refresh: DiagnosticsApplication.#onRefresh
    }
  };

  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/diagnostics.hbs`, scrollable: [".scrollable"] } };

  buildReport() {
    const { catalog, thumbnails, metadata, extensions, health } = this.services;
    const catalogSummary = catalog?.summary() ?? null;
    const adapters = catalogSummary ? Object.entries(catalogSummary.adapters).map(([id, a]) => ({
      id, label: a.label, status: a.status, count: a.count, availability: a.availability?.reason ? localize(a.availability.reason) : null,
      failed: a.detail?.failed ?? 0, skipped: a.detail?.skipped ?? 0, truncated: Boolean(a.detail?.truncated), failures: a.detail?.failures ?? [], error: a.error ?? null
    })) : [];
    const unsupported = new Map();
    for ( const r of catalog?.all() ?? [] ) if ( r.type === "other" && r.extension ) unsupported.set(r.extension, (unsupported.get(r.extension) ?? 0) + 1);
    return diagnostics.report({
      permissions: permissionSummary(),
      catalog: catalogSummary ? { status: catalogSummary.status, size: catalogSummary.size, fromCache: catalogSummary.fromCache, startedAt: catalogSummary.startedAt, finishedAt: catalogSummary.finishedAt, finishedAgo: catalogSummary.finishedAt ? formatRelativeTime(catalogSummary.finishedAt) : null } : null,
      adapters,
      unsupported: [...unsupported.entries()].map(([ext, count]) => ({ ext, count })).sort((a, b) => b.count - a.count),
      caches: { persistent: thumbnails?.cache?.persistent ?? false, thumbnailUrls: thumbnails?.objectUrls?.size ?? 0, pendingMetadata: metadata?.queue?.size ?? 0 },
      extensions: extensions?.list?.() ?? [],
      duplicates: health?.duplicateGroups?.length ?? 0
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.report = this.buildReport();
    context.recent = context.report.recent.slice(0, 60).map(e => ({ ...e, time: new Date(e.time).toLocaleTimeString(), data: e.data === undefined ? "" : typeof e.data === "string" ? e.data : JSON.stringify(e.data) }));
    return context;
  }

  static async #onCopy() {
    const report = this.buildReport();
    await copyText(JSON.stringify(report, null, 2), localize("GMAL.Diagnostics.Report"));
  }

  static async #onClearCaches() {
    await this.services.thumbnails?.clearCache?.();
    await this.services.catalog?.clearCache?.();
    await this.services.metadata?.cache?.clear?.("media");
    ui.notifications?.info(localize("GMAL.Diagnostics.CachesCleared"));
    this.render();
  }

  static #onRefresh() { this.render(); }
}
