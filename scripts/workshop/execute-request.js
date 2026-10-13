/**
 * Shared request handler used by the Web Worker (browser) and the Node worker (tests). Keeping it separate
 * lets the test suite run exactly the code path the browser uses.
 */
import { seededRandom } from "./dice.js";

/**
 * @param {object} request
 * @param {string} request.code
 * @param {"sandbox"|"preview"} request.mode
 * @param {object[]} [request.tests]
 * @param {object} [request.snapshot]          Required for preview mode
 * @param {unknown[]} [request.inputs]         Scripted dialog answers
 * @param {number} [request.seed]              Deterministic dice when provided
 * @param {{runProgram:Function, PreviewRuntime:Function}} deps
 * @returns {Promise<object>} RunResult
 */
export async function executeRequest(request, { runProgram, PreviewRuntime }) {
  const mode = request.mode ?? "sandbox";
  const started = Date.now();
  try {
    if ( mode === "sandbox" ) {
      const globals = sandboxGlobals();
      const r = await runProgram({ code: request.code ?? "", globals, tests: request.tests ?? [] });
      return { mode, ...r, chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], warnings: [], timedOut: false };
    }
    if ( mode === "preview" ) {
      if ( !request.snapshot ) throw new Error("Preview mode requires a snapshot.");
      const rt = new PreviewRuntime(request.snapshot, { inputs: request.inputs ?? [], random: request.seed !== undefined ? seededRandom(request.seed) : Math.random, enforcePermissions: request.enforcePermissions !== false });
      const globals = { ...sandboxGlobals(), ...rt.globals };
      const r = await runProgram({ code: request.code ?? "", globals, tests: request.tests ?? [] });
      return { mode, ...r, ...rt.results, timedOut: false };
    }
    throw new Error(`Unknown execution mode "${mode}"`);
  } catch(err) {
    return { mode, ok: false, error: { name: err.name, message: err.message, line: null }, output: [], returnValue: undefined, callResults: [], chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], warnings: [], timedOut: false, durationMs: Date.now() - started };
  }
}

/** Globals every program gets: a frozen Math, JSON, etc. are already real globals in the worker. */
function sandboxGlobals() {
  return {
    // Learner-facing helpers used in early lessons before console is introduced.
    print: () => { throw new Error("print() is not a JavaScript function. Use console.log(...) to display a value."); },
    // Explicitly block a few things that would confuse beginners inside a worker.
    alert: () => { throw new Error("alert() is a browser pop-up and is not available in Foundry macros. Use ui.notifications.info(...) or ChatMessage.create(...) instead."); },
    document: undefined, window: undefined, localStorage: undefined, fetch: undefined, XMLHttpRequest: undefined, importScripts: undefined, WebSocket: undefined, Worker: undefined, self: undefined, globalThis: undefined
  };
}
