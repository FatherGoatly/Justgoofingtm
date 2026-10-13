/**
 * Live Macro Execution: runs learner code on the main thread with the real Foundry API, exactly the way a
 * script Macro runs (same function signature as Macro#execute), after an explicit confirmation.
 */
import { MODULE_ID, SETTINGS, LIVE_WARNING_MODES } from "../core/constants.js";
import { canExecuteLive, describeUserPermissions } from "../core/permissions.js";
import { describeError, createConsole, sanitize } from "./harness.js";
import { escapeHTML } from "../utilities/html.js";
import { Logger } from "../core/logger.js";

let sessionConfirmed = false;

/** Forget the session-wide confirmation (used when settings change or for tests). */
export function resetLiveConfirmation() { sessionConfirmed = false; }

/**
 * Build the warning HTML shown before live execution.
 * @param {object} [info]
 * @returns {string}
 */
export function liveWarningContent(info=describeUserPermissions()) {
  const perms = Object.entries(info.permissions ?? {}).filter(([, v]) => v).map(([k]) => k.replace(/_/g, " ").toLowerCase());
  return `<div class="gmma-live-warning">
    <p><strong>You are about to run this code against the live game.</strong></p>
    <ul>
      <li>It runs with <em>your</em> privileges (${escapeHTML(info.role)}${info.isGM ? ", a Gamemaster" : ""}). Anything your user can do, this code can do: edit actors and items, move or delete tokens, change scenes, create or delete documents, read any data you can see, and contact other websites.</li>
      <li>There is no sandbox, no undo and no time limit. A mistake is applied to your world immediately.</li>
      <li>Only run code you have read and understood. If it came from someone else, treat it like a stranger's macro.</li>
    </ul>
    <p class="hint">Relevant permissions you hold: ${escapeHTML(perms.join(", ") || "none")}. Test in <strong>Foundry Preview</strong> first when in doubt.</p>
  </div>`;
}

/**
 * Ask the user to confirm live execution (respecting the "warn every time / once per session" preference).
 * @returns {Promise<boolean>}
 */
export async function confirmLiveExecution() {
  let mode = LIVE_WARNING_MODES.ALWAYS;
  try { mode = game.settings.get(MODULE_ID, SETTINGS.LIVE_WARNING_MODE); } catch(_err) { /* default */ }
  if ( mode === LIVE_WARNING_MODES.SESSION && sessionConfirmed ) return true;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Run against the live game?", icon: "fa-solid fa-triangle-exclamation" },
    content: liveWarningContent(),
    modal: true,
    rejectClose: false,
    yes: { label: "Run it", icon: "fa-solid fa-play" },
    no: { label: "Cancel", icon: "fa-solid fa-xmark", default: true }
  });
  if ( ok ) sessionConfirmed = true;
  return Boolean(ok);
}

/**
 * Execute code live. Resolves to a RunResult-shaped object so the workshop can show it like any other run.
 * @param {string} code
 * @param {object} [options]
 * @param {boolean} [options.confirm=true]   Show the warning dialog
 * @param {object} [options.scope]           Extra variables made available to the code
 * @returns {Promise<object>}
 */
export async function executeLive(code, { confirm=true, scope={} }={}) {
  const started = Date.now();
  const base = { mode: "live", output: [], returnValue: undefined, callResults: [], chat: [], notifications: [], updates: [], creates: [], deletes: [], dialogs: [], rolls: [], hooks: [], mechanics: [], warnings: [], timedOut: false };
  const permission = canExecuteLive();
  if ( !permission.allowed ) return { ...base, ok: false, cancelled: true, error: { name: "PermissionError", message: permission.reason, line: null }, durationMs: 0 };
  if ( confirm && !(await confirmLiveExecution()) ) return { ...base, ok: false, cancelled: true, error: { name: "Cancelled", message: "Live execution was cancelled.", line: null }, durationMs: 0 };

  // Mirror Macro#execute so the learner's code behaves exactly like a script macro.
  const output = [];
  const recorder = createConsole(output);
  const realConsole = globalThis.console;
  const console = Object.assign({}, recorder, {
    log: (...a) => { recorder.log(...a); realConsole.log(...a); },
    info: (...a) => { recorder.info(...a); realConsole.info(...a); },
    warn: (...a) => { recorder.warn(...a); realConsole.warn(...a); },
    error: (...a) => { recorder.error(...a); realConsole.error(...a); },
    debug: (...a) => { recorder.debug(...a); realConsole.debug(...a); },
    table: (...a) => { recorder.table(...a); realConsole.table(...a); }
  });
  const speaker = ChatMessage.implementation.getSpeaker();
  const character = game.user.character;
  const token = canvas?.ready ? (canvas.tokens.get(speaker.token) ?? null) : null;
  const actor = token?.actor ?? game.actors.get(speaker.actor) ?? null;
  const argNames = ["speaker", "actor", "token", "character", "scope", "console", ...Object.keys(scope)];
  const argValues = [speaker, actor, token, character, scope, console, ...Object.values(scope)];
  let fn;
  try { fn = new foundry.utils.AsyncFunction(...argNames, `{${code}\n}`); }
  catch(err) { return { ...base, ok: false, error: describeError(err), output, durationMs: Date.now() - started }; }
  try {
    const result = await fn.call(undefined, ...argValues);
    return { ...base, ok: true, error: null, output, returnValue: sanitize(result), durationMs: Date.now() - started };
  } catch(err) {
    Logger.report("Live execution error", err);
    return { ...base, ok: false, error: describeError(err), output, durationMs: Date.now() - started };
  }
}
