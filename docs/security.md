# Security model

The Academy runs code that learners write. This document states what each execution mode guarantees, what it does not, and the rules the module itself follows.

## Execution modes

### Concept Sandbox and Foundry Preview (Web Worker)

Learner code for these modes is compiled and run inside a dedicated Web Worker (`scripts/workshop/sandbox-worker.js`), created fresh for every run and terminated when the run finishes or the time limit (4 seconds) expires.

Guaranteed by the browser's worker isolation:

- No access to the Foundry page: no `window`, no `document`, no DOM, no Foundry globals, no documents, no settings, no sockets.
- The main thread cannot be blocked: an infinite loop is terminated with a clear message.
- Memory and state do not persist between runs; `globalThis` is a fresh object per run (in preview it exposes only the emulated globals).

Added by the harness:

- Names that would confuse or mislead (`document`, `window`, `localStorage`, `fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`, `importScripts`, `self`) are shadowed as `undefined` in the program's scope. `alert` and `print` throw teaching errors.
- Preview runs operate on a deep-cloned snapshot. Every would-be side effect (updates, creates, deletes, chat, notifications, dialogs, rolls, hooks, settings, mechanics) is recorded and shown; nothing reaches the world.
- Permissions are enforced in the emulator as they would be live (ownership, GM-only documents, `MACRO_SCRIPT` for macro creation), so a player's macro fails in preview the way it would fail live.

**Not guaranteed**: worker code can still reach the network of the same origin through constructs the shadowing does not cover (for example `new Request` with `self.fetch` obtained before shadowing is impossible, but `import()` of a same-origin URL is not blocked by the module). Treat the sandbox as a teaching isolation layer, not as a security boundary against a hostile author. Learners run their own code; the Academy never runs code from other users or from the network.

### Live Execution (main thread)

Live mode compiles the code the same way Foundry compiles a script macro (`foundry.utils.AsyncFunction`, block-wrapped, with `speaker`, `actor`, `token`, `character`, `scope`) and runs it with the current user's privileges. There is no isolation, by definition.

Controls:

- Requires Foundry's `MACRO_SCRIPT` permission for the user, and for players additionally the world setting **Allow players to run code live** (off by default).
- Requires an explicit confirmation: a warning dialog describing the consequences, shown every run or once per session according to a user setting; the choice is reset when the world setting changes.
- The workshop header shows a persistent live banner and the run button is labelled differently.
- Console output is captured and shown; errors are reported with the learner's line number; the server's permission errors are surfaced as they are.

## Rules the module follows

1. **Lesson text is never executed.** Only code blocks that declare themselves runnable, exercise starters, solutions, reveal steps and exercise test scripts are compiled, and only inside the worker (or live on explicit request). Rendering uses escaping only (`foundry.utils.escapeHTML` or the module's equivalent); the lesson markup is a tiny whitelist (`code`, bold, italic, term and lesson links).
2. **No `eval`, no `new Function` on content.** ESLint forbids them everywhere except the harness and the worker, which compile learner code with the same constructor Foundry uses for macros.
3. **No network.** The module performs no fetches, uploads or telemetry. Progress and drafts are stored in Foundry settings; exports are files the user downloads; the diagnostics report is copied to the clipboard by the user.
4. **Permissions are respected, never bypassed.** The Academy checks `user.can`, document ownership and the GM role before offering an action; the server enforces them regardless. Fixtures, hook monitoring of world-changing hooks and live execution for players are GM-gated.
5. **Untrusted content is data.** Imported progress is validated field by field (unknown keys dropped, bad values repaired and listed) and never executed. Drafts are text. Chat previews in the results panel are sanitised. Error messages pasted into the explainer are matched against patterns, never interpreted.
6. **Fixtures are flagged.** Every document the Academy creates carries a module flag; reset and cleanup only touch flagged documents and the creation dialog lists exactly what will be made.
7. **Secrets stay out of reports.** The diagnostics report contains versions, module ids, permissions, capabilities and warnings; it never includes settings values, tokens, user emails or document contents.
8. **Dependencies.** None bundled. The editor is Foundry's own `code-mirror` element; the test runner (vitest) and linter (ESLint) are development-only.

## Reporting a problem

Open an issue with the diagnostics report, the steps, and the smallest macro that reproduces the behaviour. Do not include world data.
