import { DOCUMENT_TYPES, MODULE_ID } from "./constants.js";
import diagnostics from "./diagnostics.js";
import { getSetting, parseFileRoots, parseList, SETTINGS } from "./settings.js";
import { CatalogService } from "../catalog/catalog-service.js";
import { FileAdapter } from "../adapters/file-adapter.js";
import { WorldDocumentAdapter, describeDocument } from "../adapters/world-document-adapter.js";
import { CompendiumAdapter } from "../adapters/compendium-adapter.js";
import { MetadataService } from "../metadata/metadata-service.js";
import { ThumbnailService } from "../metadata/thumbnail-service.js";
import { SearchService } from "../search/search-service.js";
import { OrganizationService } from "../collections/organization-service.js";
import { ActionService } from "../actions/action-service.js";
import { registerFoundryActions } from "../actions/foundry-actions.js";
import { HealthService } from "../health/health-service.js";
import { previewService } from "../previews/preview-service.js";

/**
 * Builds the service graph once per client. Extension points (`extensions`) let other modules add
 * source adapters and actions through the public API without touching module internals.
 */
export function buildServices() {
  const catalog = new CatalogService();
  const organization = new OrganizationService();
  const health = new HealthService({ catalog });
  const search = new SearchService({ organization, health });
  const metadata = new MetadataService({ probeSizes: getSetting(SETTINGS.PROBE_FILE_SIZES) !== false });
  const thumbnails = new ThumbnailService({ enabled: getSetting(SETTINGS.GENERATE_THUMBNAILS) !== false });
  const actions = registerFoundryActions(new ActionService());
  const registry = [];
  const extensions = {
    list: () => registry.map(e => ({ ...e })),
    registerAdapter(adapter, { module=null, options={} }={}) {
      catalog.registerAdapter(adapter, { options });
      registry.push({ kind: "adapter", id: adapter.id, module });
      diagnostics.info(`Extension adapter registered: ${adapter.id}${module ? ` (${module})` : ""}`);
    },
    registerAction(action, { module=null }={}) {
      actions.register(action);
      registry.push({ kind: "action", id: action.id, module });
      diagnostics.info(`Extension action registered: ${action.id}${module ? ` (${module})` : ""}`);
    }
  };

  catalog.registerAdapter(new FileAdapter());
  catalog.registerAdapter(new WorldDocumentAdapter());
  catalog.registerAdapter(new CompendiumAdapter());

  const fileRoots = () => parseFileRoots(getSetting(SETTINGS.FILE_ROOTS));
  const documentTypes = () => Object.keys(DOCUMENT_TYPES);
  const compendiumTypes = () => parseList(getSetting(SETTINGS.COMPENDIUM_TYPES)).filter(t => t in DOCUMENT_TYPES);

  const adapterOptions = () => ({
    files: { roots: fileRoots(), excluded: parseList(getSetting(SETTINGS.EXCLUDED_FOLDERS)), maxFiles: getSetting(SETTINGS.MAX_FILES), concurrency: getSetting(SETTINGS.SCAN_CONCURRENCY) },
    world: { documentTypes: documentTypes() },
    compendiums: { documentTypes: compendiumTypes() }
  });

  const enabledAdapters = () => {
    const ids = ["files"];
    if ( getSetting(SETTINGS.INCLUDE_WORLD_DOCUMENTS) !== false ) ids.push("world");
    if ( getSetting(SETTINGS.INCLUDE_COMPENDIUMS) !== false ) ids.push("compendiums");
    for ( const e of registry ) if ( e.kind === "adapter" ) ids.push(e.id);
    return ids;
  };

  let indexed = false;
  const services = {
    catalog, organization, health, search, metadata, thumbnails, actions, extensions, preview: previewService, fileRoots,
    /** Full (or document-only) re-index. */
    async reindex({ full=true }={}) {
      const only = full ? enabledAdapters() : enabledAdapters().filter(id => id !== "files");
      const result = await catalog.index({ only, adapterOptions: adapterOptions() });
      if ( full && !result.interrupted ) await catalog.saveCache("files");
      health.computeDuplicates();
      return result;
    },
    /** Called when the browser opens: load the cached file catalog, refresh documents, scan files if needed. */
    async ensureIndexed() {
      if ( indexed ) return;
      indexed = true;
      organization.load();
      let cached = 0;
      const filesAvailable = catalog.adapters.get("files")?.adapter.availability().available !== false;
      if ( filesAvailable ) {
        try { cached = await catalog.loadCache("files"); } catch (err) { diagnostics.warn("Catalog cache unavailable", err); }
      }
      const full = !cached || getSetting(SETTINGS.AUTO_INDEX) === true;
      await services.reindex({ full });
    },
    describeDocument
  };
  return services;
}

export function moduleApi(services, { openBrowser, openDiagnostics }) {
  return Object.freeze({
    id: MODULE_ID,
    open: openBrowser,
    openDiagnostics,
    reindex: opts => services.reindex(opts),
    get catalog() { return services.catalog; },
    search: (text, options={}) => services.search.query(services.catalog.all(), { text, ...options }).results,
    registerAdapter: (adapter, opts) => services.extensions.registerAdapter(adapter, opts),
    registerAction: (action, opts) => services.extensions.registerAction(action, opts),
    services
  });
}
