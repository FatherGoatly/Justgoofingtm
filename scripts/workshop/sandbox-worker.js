/**
 * Web Worker entry point for the Concept Sandbox and Foundry Preview execution modes.
 * It has no access to the Foundry page, DOM or real documents. See docs/security.md for the guarantees and
 * their limits (same-origin network access is still available to worker code).
 */
import { runProgram } from "./harness.js";
import { PreviewRuntime } from "./preview-runtime.js";
import { executeRequest } from "./execute-request.js";

self.onmessage = async event => {
  const request = event.data ?? {};
  const result = await executeRequest(request, { runProgram, PreviewRuntime });
  self.postMessage({ id: request.id, result });
};
