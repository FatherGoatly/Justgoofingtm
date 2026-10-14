import { BaseAdapter } from "./base-adapter.js";
import { createFileRecord } from "../catalog/asset-record.js";
import { SCAN_LIMITS } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { canBrowseFiles } from "../core/permissions.js";
import { basename, isUnder, normalizePath } from "../utilities/paths.js";
import { CancelledError, TaskQueue } from "../utilities/async.js";

/**
 * Discovers files through Foundry's FilePicker API (`FilePicker.implementation.browse`). This is the only
 * supported way for a client module to list files: it sees exactly what the FilePicker itself can see
 * (user data, core "public" data and a configured S3 bucket) and nothing else on the host.
 */
export class FileAdapter extends BaseAdapter {
  id = "files";

  label = "Files";

  /** Allow tests to inject a browse function. */
  constructor({ browse=null }={}) {
    super();
    this.browse = browse ?? defaultBrowse;
  }

  availability() {
    if ( !canBrowseFiles() ) return { available: false, reason: "GMAL.Availability.NoFilePermission" };
    if ( !this.browse ) return { available: false, reason: "GMAL.Availability.NoFilePicker" };
    return { available: true, reason: null };
  }

  /**
   * @param {object} context
   * @param {Array<{source: string, target: string, bucket?: string}>} context.roots
   * @param {string[]} context.excluded     Folder names/paths (relative to the source) to skip
   * @param {number} context.maxFiles
   * @param {number} context.concurrency
   * @param {import("../utilities/async.js").CancellationToken} context.token
   */
  async* scan({ roots=[], excluded=[], maxFiles=SCAN_LIMITS.MAX_FILES, concurrency=SCAN_LIMITS.CONCURRENCY, token, batchSize=200 }={}) {
    const status = { files: 0, dirs: 0, failed: 0, skipped: 0, truncated: false, failures: [] };
    const excludedSet = new Set(excluded.map(e => normalizePath(e).toLowerCase()).filter(Boolean));
    const seen = new Set();
    let buffer = [];
    const discoveredAt = Date.now();

    for ( const root of roots ) {
      if ( token?.cancelled ) break;
      const storage = root.source ?? "data";
      const queue = new TaskQueue(concurrency);
      const pendingDirs = [{ target: normalizePath(root.target ?? ""), depth: 0 }];
      const visited = new Set();

      // Breadth-first walk with a bounded concurrency queue. Results are drained as they arrive.
      const results = [];
      const schedule = dir => queue.push(async () => {
        if ( token?.cancelled ) return;
        try {
          const res = await this.browse(storage, dir.target, root.bucket ? { bucket: root.bucket } : {});
          results.push({ dir, res });
        } catch (err) {
          status.failed++;
          diagnostics.count("failedSources");
          if ( status.failures.length < 50 ) status.failures.push({ storage, target: dir.target, message: err?.message ?? String(err) });
          diagnostics.warn(`Could not browse ${storage}:${dir.target || "/"}`, err);
        }
      });

      while ( pendingDirs.length || queue.size || results.length ) {
        if ( token?.cancelled ) { queue.clear(); throw new CancelledError("scan cancelled"); }
        while ( pendingDirs.length ) {
          const dir = pendingDirs.shift();
          const key = dir.target.toLowerCase();
          if ( visited.has(key) ) continue;
          visited.add(key);
          if ( visited.size > SCAN_LIMITS.MAX_DIRS ) { status.truncated = true; break; }
          schedule(dir);
        }
        if ( !results.length ) {
          // Wait for at least one browse to finish.
          await Promise.race([queue.onIdle(), new Promise(r => setTimeout(r, 25))]);
          if ( !results.length && queue.size === 0 ) break;
          continue;
        }
        const { dir, res } = results.shift();
        status.dirs++;
        for ( const sub of res?.dirs ?? [] ) {
          const subPath = normalizePath(sub);
          if ( dir.depth + 1 > SCAN_LIMITS.MAX_DEPTH ) { status.skipped++; continue; }
          if ( isExcluded(subPath, excludedSet, root.target) ) { status.skipped++; continue; }
          pendingDirs.push({ target: subPath, depth: dir.depth + 1 });
        }
        for ( const file of res?.files ?? [] ) {
          const rec = createFileRecord({ url: file, storage, bucket: root.bucket ?? null, root: root.target ?? "", discoveredAt });
          if ( seen.has(rec.id) ) continue;
          seen.add(rec.id);
          buffer.push(rec);
          status.files++;
          if ( status.files >= maxFiles ) { status.truncated = true; break; }
        }
        if ( buffer.length >= batchSize ) { yield { records: buffer, status: { ...status } }; buffer = []; }
        if ( status.truncated ) { queue.clear(); pendingDirs.length = 0; results.length = 0; break; }
      }
      if ( token?.cancelled ) { queue.clear(); throw new CancelledError("scan cancelled"); }
      if ( status.truncated ) break;
    }
    if ( buffer.length ) yield { records: buffer, status: { ...status } };
    yield { records: [], done: true, status };
  }

  /** Verify that a file still exists by browsing its parent directory. */
  async verify(record) {
    if ( !record?.url || !this.browse ) return null;
    try {
      const dir = record.folder ?? "";
      const res = await this.browse(record.source.storage ?? "data", dir, record.source.bucket ? { bucket: record.source.bucket } : {});
      const names = new Set((res?.files ?? []).map(f => basename(f).toLowerCase()));
      return names.has(basename(record.path).toLowerCase());
    } catch (err) {
      // A permission or network failure is not proof the file is missing.
      return null;
    }
  }

  /** The storages that can be browsed by this client, read from the FilePicker implementation. */
  static availableStorages() {
    try {
      const FP = globalThis.foundry?.applications?.apps?.FilePicker?.implementation;
      if ( !FP ) return ["data", "public"];
      const sources = new FP({}).sources ?? {};
      const list = Object.entries(sources).filter(([k, v]) => v).map(([k]) => k);
      return list.length ? list : ["data", "public"];
    } catch {
      return ["data", "public"];
    }
  }
}

function isExcluded(dirPath, excludedSet, rootTarget) {
  if ( !excludedSet.size ) return false;
  const lower = dirPath.toLowerCase();
  const base = basename(lower);
  if ( excludedSet.has(base) ) return true;
  if ( excludedSet.has(lower) ) return true;
  // Entries given relative to the root ("assets/private") are also honoured.
  for ( const e of excludedSet ) if ( isUnder(lower, e) || (rootTarget && isUnder(lower, normalizePath(`${rootTarget}/${e}`).toLowerCase())) ) return true;
  return false;
}

async function defaultBrowse(source, target, options={}) {
  const FP = globalThis.foundry?.applications?.apps?.FilePicker?.implementation;
  if ( !FP ) throw new Error("FilePicker is not available");
  return FP.browse(source, target, options);
}
