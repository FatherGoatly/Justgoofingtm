import { parentPort } from "node:worker_threads";
import { runProgram } from "../../scripts/workshop/harness.js";
import { PreviewRuntime } from "../../scripts/workshop/preview-runtime.js";
import { executeRequest } from "../../scripts/workshop/execute-request.js";

parentPort.on("message", async request => {
  const result = await executeRequest(request, { runProgram, PreviewRuntime });
  parentPort.postMessage({ id: request.id, result });
});
