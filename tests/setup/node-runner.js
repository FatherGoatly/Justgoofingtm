/**
 * Runs workshop execution requests in a Node worker_threads Worker with a timeout, mirroring the browser
 * runner (scripts/workshop/runner.js) so timeouts and infinite loops can be tested.
 */
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = resolve(here, "node-worker.js");

export function runInNodeWorker(request, { timeoutMs=3000 }={}) {
  return new Promise(resolvePromise => {
    const worker = new Worker(workerPath, { type: "module" });
    const started = Date.now();
    const timer = setTimeout(() => {
      worker.terminate();
      resolvePromise({ mode: request.mode ?? "sandbox", ok: false, timedOut: true, error: { name: "TimeoutError", message: `Execution exceeded ${timeoutMs} ms`, line: null }, output: [], returnValue: undefined, callResults: [], chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], warnings: [], durationMs: Date.now() - started });
    }, timeoutMs);
    worker.on("message", msg => { clearTimeout(timer); worker.terminate(); resolvePromise(msg.result); });
    worker.on("error", err => { clearTimeout(timer); resolvePromise({ ok: false, timedOut: false, error: { name: err.name, message: err.message, line: null }, output: [], callResults: [], chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], warnings: [], durationMs: Date.now() - started }); });
    worker.postMessage(request);
  });
}
