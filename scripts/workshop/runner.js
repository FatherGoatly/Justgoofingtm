/**
 * Main-thread client for the sandbox Web Worker. Each run gets a fresh worker so a runaway program can be
 * terminated without affecting later runs.
 */
import { LIMITS } from "../core/constants.js";
import { Logger } from "../core/logger.js";

export class SandboxRunner {
  /**
   * @param {object} [options]
   * @param {URL|string} [options.workerUrl]
   * @param {number} [options.timeoutMs]
   */
  constructor({ workerUrl=new URL("./sandbox-worker.js", import.meta.url), timeoutMs=LIMITS.SANDBOX_TIMEOUT_MS }={}) {
    this.workerUrl = workerUrl;
    this.timeoutMs = timeoutMs;
    this.active = null;
  }

  /** Is Web Worker execution available in this browser? */
  static get supported() { return typeof Worker === "function"; }

  /**
   * Execute a request in a fresh worker.
   * @param {object} request    See execute-request.js
   * @param {object} [options]
   * @param {number} [options.timeoutMs]
   * @returns {Promise<object>} RunResult
   */
  execute(request, { timeoutMs=this.timeoutMs }={}) {
    if ( !SandboxRunner.supported ) return Promise.resolve(failure(request, "Web Workers are not available in this browser, so sandboxed execution cannot run."));
    return new Promise(resolve => {
      let worker;
      const started = Date.now();
      try { worker = new Worker(this.workerUrl, { type: "module", name: "gm-macro-academy-sandbox" }); }
      catch(err) { Logger.report("Sandbox worker creation failed", err); return resolve(failure(request, `The sandbox worker could not be started: ${err.message}`)); }
      this.active = worker;
      const id = `${started}-${Math.random().toString(36).slice(2)}`;
      const finish = result => { clearTimeout(timer); try { worker.terminate(); } catch(_err) { /* ignore */ } if ( this.active === worker ) this.active = null; resolve(result); };
      const timer = setTimeout(() => finish({ ...failure(request, `Execution exceeded ${timeoutMs} ms and was stopped. If your program has a loop, check that its stopping condition can ever become true.`), timedOut: true, error: { name: "TimeoutError", message: `Execution exceeded ${timeoutMs} ms`, line: null } }), timeoutMs);
      worker.onmessage = event => { if ( event.data?.id === id ) finish(event.data.result); };
      worker.onerror = event => { Logger.report("Sandbox worker error", event.error ?? event.message); finish(failure(request, `The sandbox worker failed: ${event.message ?? "unknown error"}`)); };
      worker.postMessage({ ...request, id });
    });
  }

  /** Stop the currently running program, if any. */
  cancel() {
    if ( this.active ) { try { this.active.terminate(); } catch(_err) { /* ignore */ } this.active = null; }
  }
}

function failure(request, message) {
  return { mode: request?.mode ?? "sandbox", ok: false, error: { name: "ExecutionError", message, line: null }, output: [], returnValue: undefined, callResults: [], chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], warnings: [], timedOut: false, durationMs: 0 };
}
