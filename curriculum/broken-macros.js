/**
 * The broken macro library: deliberately faulty practice macros for the debugging workbench. Each entry has a
 * symptom, the expected behaviour, a repair exercise with tests, progressive hints and the root-cause explanation
 * (revealed through the solution, not shown up front).
 */
import { codeEx } from "./_helpers.js";

const broken = ({ id, title, category, difficulty, summary, symptom, expected, exercise }) => ({ id, title, category, difficulty, summary, symptom, expected, exercise: codeEx({ type: "repair-code", ...exercise, id: `${id}-repair` }) });

export const BROKEN_MACROS = [
  broken({
    id: "broken-greeting-syntax", title: "The greeting that will not run", category: "Syntax error", difficulty: "beginner",
    summary: "A one-line welcome macro that refuses to run at all.",
    symptom: "Clicking the macro shows `SyntaxError: missing ) after argument list` in the console and nothing appears in chat.",
    expected: "A chat message saying `Welcome, adventurers!` should be posted.",
    exercise: { title: "Repair the greeting", prompt: "The macro has a typo that stops JavaScript from reading it. Fix it so the message is posted.", runtime: "preview",
      starter: `ChatMessage.create({ content: "Welcome, adventurers!" );`,
      tests: [{ name: "Runs without a syntax error", expectNoError: true }, { name: "Posts the welcome message", expectChat: { contains: "Welcome, adventurers!" } }],
      hints: ["The message itself is fine. Look at the punctuation after it.", "Every `{` needs a matching `}` before the call's closing `)`.", "The object passed to `create` opens with `{` but never closes."],
      reveal: [{ title: "Close the object before closing the call", code: `ChatMessage.create({ content: "Welcome, adventurers!" });` }],
      solution: { code: `ChatMessage.create({ content: "Welcome, adventurers!" });`, explanation: "Root cause: the object literal `{ content: ... }` was never closed with `}`, so the parser reached `)` while still inside the object. Syntax errors are reported where the parser gave up, which is often one character after the real mistake." },
      concepts: ["syntax", "chat"], criteria: ["The program parses.", "A chat message containing the welcome text is created."] }
  }),
  broken({
    id: "broken-scope-total", title: "The damage total that is always zero", category: "Incorrect variable scope", difficulty: "beginner",
    summary: "A loop adds up damage from a list but the report always says 0.",
    symptom: "The console prints `Total damage: 0` even though the list contains numbers.",
    expected: "`Total damage: 18` for the list [7, 4, 7].",
    exercise: { title: "Fix the scope of total", prompt: "The accumulator is declared in the wrong place, so a fresh one is created on every pass. Fix it so the total survives the loop.", runtime: "sandbox",
      starter: `const hits = [7, 4, 7];\nfor (const hit of hits) {\n  let total = 0;\n  total = total + hit;\n}\nlet total = 0;\nconsole.log("Total damage: " + total);`,
      tests: [{ name: "Prints the correct total", expectOutput: ["Total damage: 18"] }, { name: "Still uses a loop", codeIncludes: "for\\s*\\(", message: "Keep the loop; the point is to accumulate inside it." }],
      hints: ["Where is `total` declared, and how many times does that line run?", "A variable declared inside the loop body is created again on every iteration and thrown away at the end of the block.", "Declare `total` once, before the loop, with `let`, and add to it inside."],
      reveal: [{ title: "Declare once, outside the loop", code: `const hits = [7, 4, 7];\nlet total = 0;\nfor (const hit of hits) {\n  total = total + hit;\n}\nconsole.log("Total damage: " + total);` }],
      solution: { code: `const hits = [7, 4, 7];\nlet total = 0;\nfor (const hit of hits) {\n  total = total + hit;\n}\nconsole.log("Total damage: " + total);`, explanation: "Root cause: `let total = 0` inside the loop body is block-scoped, so each pass created a new `total`, added one hit, and discarded it. The second `let total = 0` after the loop then printed a brand-new zero. Declaring the accumulator once before the loop keeps a single variable alive across passes." },
      concepts: ["scope", "loops", "variables"], criteria: ["The printed total is 18.", "A loop is still used to accumulate."] }
  }),
  broken({
    id: "broken-undefined-name", title: "The token that is not defined", category: "Undefined variable", difficulty: "beginner",
    summary: "A macro reports the selected token's name but throws immediately.",
    symptom: "`ReferenceError: selectedToken is not defined`.",
    expected: "Prints `Selected: Sir Reginald` when Sir Reginald's token is selected.",
    exercise: { title: "Match the variable names", prompt: "The code declares one name and uses another. Make them agree.", runtime: "preview",
      starter: `const token = canvas.tokens.controlled[0];\nconsole.log("Selected: " + selectedToken.name);`,
      tests: [{ name: "No ReferenceError", expectNoError: true }, { name: "Prints the token name", expectOutput: ["Selected: Sir Reginald"] }],
      hints: ["Read the error: which name is 'not defined'? Search the code for where it is declared.", "JavaScript names must match exactly, including capitalisation.", "Either rename the declaration or rename the use; pick one name and use it twice."],
      reveal: [{ title: "Use the declared name", code: `const token = canvas.tokens.controlled[0];\nconsole.log("Selected: " + token.name);` }],
      solution: { code: `const token = canvas.tokens.controlled[0];\nconsole.log("Selected: " + token.name);`, explanation: "Root cause: the variable was declared as `token` but used as `selectedToken`. A ReferenceError means no binding with that exact name exists in scope; it is not a 'missing data' problem." },
      concepts: ["variables", "errors"], criteria: ["The program runs without a ReferenceError.", "The selected token's name is printed."] }
  }),
  broken({
    id: "broken-wrong-property", title: "The hit points that are undefined", category: "Invalid property assumption", difficulty: "intermediate",
    summary: "A health report prints `undefined / undefined` for a dnd5e actor.",
    symptom: "`TypeError: Cannot read properties of undefined (reading 'current')`: the guessed path `system.hp` does not exist, so `hp` is undefined.",
    expected: "`Sir Reginald: 24/30` using the dnd5e data paths.",
    exercise: { title: "Use the real data path", prompt: "The macro guesses where hit points live. Find the real path in dnd5e 6.x and fix it.", runtime: "preview",
      starter: `const actor = canvas.tokens.controlled[0].actor;\nconst hp = actor.system.hp;\nconsole.log(actor.name + ": " + hp.current + "/" + hp.maximum);`,
      tests: [{ name: "Prints current and maximum HP", expectOutput: ["Sir Reginald: 24/30"] }],
      hints: ["Log `actor.system` and read the real keys instead of guessing.", "In dnd5e, hit points live under `attributes`, and the fields are named `value` and `max`.", "The full path is `actor.system.attributes.hp` with `.value` and `.max`."],
      reveal: [{ title: "Correct path", code: `const actor = canvas.tokens.controlled[0].actor;\nconst hp = actor.system.attributes.hp;\nconsole.log(actor.name + ": " + hp.value + "/" + hp.max);` }],
      solution: { code: `const actor = canvas.tokens.controlled[0].actor;\nconst hp = actor.system.attributes.hp;\nconsole.log(actor.name + ": " + hp.value + "/" + hp.max);`, explanation: "Root cause: a guessed data path. `actor.system.hp` does not exist in dnd5e 6.x, so `hp` was `undefined` and reading `.current` threw. Wrong paths one level deeper fail silently instead (they just yield `undefined`), which is worse. Either way the cure is the same: inspect the real object (`console.log(actor.system)` or the academy's inspector) and copy the path you see, never the path you expect." },
      concepts: ["data-paths", "objects", "dnd5e"], criteria: ["The output shows 24/30 for Sir Reginald."] }
  }),
  broken({
    id: "broken-wrong-document", title: "The macro that heals the wrong goblin", category: "Wrong document reference", difficulty: "intermediate",
    summary: "A healing macro for an unlinked goblin token edits the directory actor instead of the token's own copy.",
    symptom: "After running, the goblin token on the map still shows 7/7 unchanged... but the Goblin Scout actor in the directory changed.",
    expected: "The selected unlinked token's own actor (`token.actor`) is updated, not `game.actors.getName(...)`.",
    exercise: { title: "Update the token's actor", prompt: "Goblin Scout A is an unlinked token. Change the code so the update goes to the token's synthetic actor, not the prototype in the directory.", runtime: "preview", snapshot: "practice",
      starter: `const token = canvas.tokens.get("tokGoblinA00001");\nconst actor = game.actors.getName("Goblin Scout");\nawait actor.update({ "system.attributes.hp.value": 3 });\nconsole.log(token.actor.system.attributes.hp.value);`,
      tests: [{ name: "The token's actor now has 3 HP", expectOutput: ["3"] }, { name: "The directory actor was not changed", expectNoUpdate: { name: "Goblin Scout" } }],
      hints: ["Which object did you update, and which object did you read back?", "For unlinked tokens, `token.actor` is a separate copy from `game.actors.getName(...)`.", "Update `token.actor` directly."],
      reveal: [{ title: "Use token.actor", code: `const token = canvas.tokens.get("tokGoblinA00001");\nconst actor = token.actor;\nawait actor.update({ "system.attributes.hp.value": 3 });\nconsole.log(token.actor.system.attributes.hp.value);` }],
      solution: { code: `const token = canvas.tokens.get("tokGoblinA00001");\nconst actor = token.actor;\nawait actor.update({ "system.attributes.hp.value": 3 });\nconsole.log(token.actor.system.attributes.hp.value);`, explanation: "Root cause: unlinked tokens carry their own synthetic actor. `game.actors.getName(\"Goblin Scout\")` is the prototype actor in the directory; updating it changes future tokens, not the one on the map. `token.actor` is the document the map token actually uses." },
      concepts: ["tokens", "documents", "linked-unlinked"], criteria: ["The selected token's actor is updated.", "The directory actor receives no update."] }
  }),
  broken({
    id: "broken-missing-permission", title: "The player macro that crashes on other people's tokens", category: "Missing permission check", difficulty: "intermediate",
    summary: "A 'rest' macro sets HP to max on every selected token. Run by a player, it throws on tokens they do not own.",
    symptom: "`Permission denied` error halfway through; some tokens were updated, others not, and the player sees a scary red error.",
    expected: "Only owned tokens are updated; a warning names the skipped ones; no error is thrown.",
    exercise: { title: "Check ownership first", prompt: "Make the macro skip tokens the current user does not own, warn about them with `ui.notifications.warn`, and finish without throwing. (The snapshot runs as a player who owns Sir Reginald only.)", runtime: "preview", snapshot: "practice-player",
      starter: `for (const token of canvas.tokens.controlled) {\n  const hp = token.actor.system.attributes.hp;\n  await token.actor.update({ "system.attributes.hp.value": hp.max });\n}\nui.notifications.info("Everyone rested.");`,
      tests: [{ name: "Finishes without an error", expectNoError: true }, { name: "Owned token is healed", expectUpdate: { name: "Sir Reginald", path: "system.attributes.hp.value", value: 30 } }, { name: "Unowned token is left alone", expectNoUpdate: { name: "Mirabel the Wise" } }, { name: "Warns about the skipped token", expectNotification: { type: "warn", contains: "Mirabel" } }],
      hints: ["The server refuses updates to documents you do not own. Check before you update, not after.", "`token.actor.isOwner` (or `testUserPermission(game.user, \"OWNER\")`) tells you whether this user may update it.", "Inside the loop: if not owner, warn with the token's name and `continue`."],
      reveal: [{ title: "Guard each token", code: `for (const token of canvas.tokens.controlled) {\n  if (!token.actor?.isOwner) {\n    ui.notifications.warn(\`You do not own \${token.name}; skipping.\`);\n    continue;\n  }\n  const hp = token.actor.system.attributes.hp;\n  await token.actor.update({ "system.attributes.hp.value": hp.max });\n}\nui.notifications.info("Rest applied to the tokens you own.");` }],
      solution: { code: `for (const token of canvas.tokens.controlled) {\n  if (!token.actor?.isOwner) {\n    ui.notifications.warn(\`You do not own \${token.name}; skipping.\`);\n    continue;\n  }\n  const hp = token.actor.system.attributes.hp;\n  await token.actor.update({ "system.attributes.hp.value": hp.max });\n}\nui.notifications.info("Rest applied to the tokens you own.");`, explanation: "Root cause: the macro assumed GM authority. Permission is decided per document by ownership and role, and the server enforces it. Checking `isOwner` before updating turns a crash into a clear message and keeps the rest of the loop working." },
      concepts: ["permissions", "loops", "validation"], criteria: ["No error is thrown.", "Only owned actors are updated.", "A warning names skipped tokens."] }
  }),
  broken({
    id: "broken-missing-await", title: "The update that reads stale data", category: "Incorrect asynchronous logic", difficulty: "intermediate",
    summary: "A macro damages an actor and then reports its hit points, but the report is from before the damage.",
    symptom: "Console prints `HP now: 24` even though 10 damage was applied (should be 14).",
    expected: "`HP now: 14`.",
    exercise: { title: "Wait for the update", prompt: "The update is started but not awaited, so the following line runs before it finishes. Fix the ordering.", runtime: "preview",
      starter: `const actor = canvas.tokens.controlled[0].actor;\nconst before = actor.system.attributes.hp.value;\nactor.update({ "system.attributes.hp.value": before - 10 });\nconsole.log("HP now: " + actor.system.attributes.hp.value);`,
      tests: [{ name: "Reports the updated HP", expectOutput: ["HP now: 14"] }, { name: "Awaits the update", codeIncludes: "await\\s+actor\\.update", message: "Use `await actor.update(...)` so the next line sees the result." }],
      hints: ["`update` returns a Promise: the change is sent to the server and completes later.", "Without `await`, the next line runs immediately with the old value.", "Add `await` before `actor.update(...)`."],
      reveal: [{ title: "Await the promise", code: `const actor = canvas.tokens.controlled[0].actor;\nconst before = actor.system.attributes.hp.value;\nawait actor.update({ "system.attributes.hp.value": before - 10 });\nconsole.log("HP now: " + actor.system.attributes.hp.value);` }],
      solution: { code: `const actor = canvas.tokens.controlled[0].actor;\nconst before = actor.system.attributes.hp.value;\nawait actor.update({ "system.attributes.hp.value": before - 10 });\nconsole.log("HP now: " + actor.system.attributes.hp.value);`, explanation: "Root cause: a missing `await`. Document updates are asynchronous; the function kept running while the update was still in flight, so it read the old value. This bug produces no error, which is exactly why it is dangerous." },
      concepts: ["async", "documents"], criteria: ["The reported HP reflects the update.", "The update is awaited."] }
  }),
  broken({
    id: "broken-cancelled-dialog", title: "The dialog that crashes when cancelled", category: "Unhandled cancellation", difficulty: "intermediate",
    summary: "A damage prompt works when you type a number but explodes when you close the dialog.",
    symptom: "`TypeError: Cannot read properties of null (reading 'amount')` when the dialog is dismissed.",
    expected: "Cancelling shows an info notification `Cancelled.` and nothing else happens; entering 5 applies 5 damage.",
    exercise: { title: "Handle the cancelled dialog", prompt: "`DialogV2.input` resolves to `null` when dismissed. Handle that case (notify and stop) before reading the result. The scripted inputs cancel the first dialog.", runtime: "preview", inputs: [null],
      starter: `const result = await foundry.applications.api.DialogV2.input({\n  window: { title: "Damage" },\n  content: '<input type="number" name="amount" value="5">'\n});\nconst amount = Number(result.amount);\nawait canvas.tokens.controlled[0].actor.applyDamage(amount);\nui.notifications.info("Applied " + amount);`,
      tests: [{ name: "No error when the dialog is cancelled", expectNoError: true }, { name: "Notifies the cancellation", expectNotification: { type: "info", contains: "Cancel" } }, { name: "Applies no damage when cancelled", expectNoUpdate: true }],
      hints: ["What does `DialogV2.input` return when the user closes the window?", "It returns `null`. Reading `.amount` of `null` throws.", "Right after the `await`, check `if (!result) { ui.notifications.info(\"Cancelled.\"); return; }`."],
      reveal: [{ title: "Check for null", code: `const result = await foundry.applications.api.DialogV2.input({\n  window: { title: "Damage" },\n  content: '<input type="number" name="amount" value="5">'\n});\nif (!result) {\n  ui.notifications.info("Cancelled.");\n  return;\n}\nconst amount = Number(result.amount);\nawait canvas.tokens.controlled[0].actor.applyDamage(amount);\nui.notifications.info("Applied " + amount);` }],
      solution: { code: `const result = await foundry.applications.api.DialogV2.input({\n  window: { title: "Damage" },\n  content: '<input type="number" name="amount" value="5">'\n});\nif (!result) {\n  ui.notifications.info("Cancelled.");\n  return;\n}\nconst amount = Number(result.amount);\nawait canvas.tokens.controlled[0].actor.applyDamage(amount);\nui.notifications.info("Applied " + amount);`, explanation: "Root cause: the code assumed the dialog always returns data. Dismissal is a normal outcome, not an error, and it resolves to `null`. Checking for it first makes cancellation a clean exit." },
      concepts: ["dialogs", "validation", "null-handling"], criteria: ["Cancelling produces an info message and no update.", "No error is thrown."] }
  }),
  broken({
    id: "broken-iteration", title: "The loop that skips every other token", category: "Incorrect iteration", difficulty: "beginner",
    summary: "A macro lists controlled tokens but only prints some of them.",
    symptom: "With two tokens selected, only `Sir Reginald` is printed.",
    expected: "Both `Sir Reginald` and `Mirabel` printed, one per line.",
    exercise: { title: "Fix the loop", prompt: "The counting loop has an off-by-one mistake in its step. Fix it so every token is printed.", runtime: "preview",
      starter: `const tokens = canvas.tokens.controlled;\nfor (let i = 0; i < tokens.length; i += 2) {\n  console.log(tokens[i].name);\n}`,
      tests: [{ name: "Prints every controlled token", expectOutput: ["Sir Reginald", "Mirabel"] }],
      hints: ["How much does `i` change on each pass?", "`i += 2` visits indexes 0, 2, 4…", "Use `i++` (or `for...of`) to visit every element."],
      reveal: [{ title: "Step by one", code: `const tokens = canvas.tokens.controlled;\nfor (let i = 0; i < tokens.length; i++) {\n  console.log(tokens[i].name);\n}` }],
      solution: { code: `const tokens = canvas.tokens.controlled;\nfor (const token of tokens) {\n  console.log(token.name);\n}`, explanation: "Root cause: the loop step was `i += 2`, so only even indexes were visited. `for...of` avoids index arithmetic entirely and is the idiomatic way to visit every element." },
      concepts: ["loops", "off-by-one"], criteria: ["Every controlled token is printed exactly once."] }
  }),
  broken({
    id: "broken-duplicate-hook", title: "The hook that fires twice, then three times", category: "Duplicate hook registration", difficulty: "advanced",
    summary: "A macro registers a hook each time it runs, so the announcement multiplies.",
    symptom: "After running the macro three times, every actor update produces three chat messages.",
    expected: "Running the macro again replaces the previous registration instead of adding another (exactly one hook registered after two runs).",
    exercise: { title: "Register once", prompt: "Make the registration idempotent: if a previous handler was registered (store its id somewhere that survives, such as a flag on `game.user` or a property on `globalThis`), remove it before registering the new one. The test runs your code twice in a row.", runtime: "preview",
      starter: `Hooks.on("updateActor", (actor) => {\n  ChatMessage.create({ content: actor.name + " changed." });\n});\n// The macro is run twice:\nHooks.on("updateActor", (actor) => {\n  ChatMessage.create({ content: actor.name + " changed." });\n});\nHooks.callAll("updateActor", game.actors.getName("Sir Reginald"));`,
      tests: [{ name: "Exactly one chat message after a single update", expectChat: { count: 1 } }, { name: "Uses Hooks.off to clean up", codeIncludes: "Hooks\\.off", message: "Remove the previous registration with Hooks.off before registering again." }],
      hints: ["Every `Hooks.on` adds another listener. Nothing removes the old one.", "`Hooks.on` returns an id; `Hooks.off(name, id)` removes that registration.", "Keep the id somewhere that persists between runs (for example `globalThis.myAnnouncerHook`) and call `Hooks.off` with it before registering."],
      reveal: [{ title: "Store the id and remove the old hook", code: `function register() {\n  if (globalThis.academyAnnouncerHook) Hooks.off("updateActor", globalThis.academyAnnouncerHook);\n  globalThis.academyAnnouncerHook = Hooks.on("updateActor", (actor) => {\n    ChatMessage.create({ content: actor.name + " changed." });\n  });\n}\nregister();\nregister(); // second run replaces the first\nHooks.callAll("updateActor", game.actors.getName("Sir Reginald"));` }],
      solution: { code: `function register() {\n  if (globalThis.academyAnnouncerHook) Hooks.off("updateActor", globalThis.academyAnnouncerHook);\n  globalThis.academyAnnouncerHook = Hooks.on("updateActor", (actor) => {\n    ChatMessage.create({ content: actor.name + " changed." });\n  });\n}\nregister();\nregister(); // second run replaces the first\nHooks.callAll("updateActor", game.actors.getName("Sir Reginald"));`, explanation: "Root cause: hooks accumulate. Each run of the macro added another listener and none was ever removed. Keeping the registration id in a persistent place and calling `Hooks.off` before `Hooks.on` makes the macro idempotent. In a real module you would register once in `init` instead." },
      concepts: ["hooks", "idempotent", "state"], criteria: ["After the macro runs twice, one update produces one message.", "Hooks.off is used."] }
  }),
  broken({
    id: "broken-outdated-api", title: "The V11 tutorial macro", category: "Outdated API pattern", difficulty: "intermediate",
    summary: "A confirmation macro copied from an old forum post uses the V1 Dialog class.",
    symptom: "In V14 it throws a deprecation error (and in the emulator it refuses to run).",
    expected: "The same confirmation using `foundry.applications.api.DialogV2.confirm`, posting `Confirmed!` to chat when accepted.",
    exercise: { title: "Modernise the dialog", prompt: "Replace the deprecated `Dialog.confirm` with `DialogV2.confirm`. The scripted input answers yes.", runtime: "preview", inputs: [true],
      starter: `const ok = await Dialog.confirm({\n  title: "Proceed?",\n  content: "<p>Post the message?</p>"\n});\nif (ok) ChatMessage.create({ content: "Confirmed!" });`,
      tests: [{ name: "No deprecated API used", codeExcludes: "\\bDialog\\.confirm", message: "The V1 `Dialog` class is deprecated; use DialogV2." }, { name: "Runs without error", expectNoError: true }, { name: "Posts the confirmation", expectChat: { contains: "Confirmed!" } }],
      hints: ["The error names the replacement. Read it.", "DialogV2 lives at `foundry.applications.api.DialogV2` and its `confirm` takes `{ window: { title }, content }`.", "`DialogV2.confirm` resolves to `true` for yes, `false` for no, and `null` if dismissed."],
      reveal: [{ title: "Use DialogV2", code: `const ok = await foundry.applications.api.DialogV2.confirm({\n  window: { title: "Proceed?" },\n  content: "<p>Post the message?</p>"\n});\nif (ok) ChatMessage.create({ content: "Confirmed!" });` }],
      solution: { code: `const ok = await foundry.applications.api.DialogV2.confirm({\n  window: { title: "Proceed?" },\n  content: "<p>Post the message?</p>"\n});\nif (ok) ChatMessage.create({ content: "Confirmed!" });`, explanation: "Root cause: the macro used an API deprecated in V13. Deprecation warnings tell you the replacement; the shape changed slightly (`window.title` instead of `title`). Copying old snippets without checking the version is one of the most common sources of broken macros." },
      concepts: ["deprecation", "dialogs", "versions"], criteria: ["DialogV2 is used instead of Dialog.", "The message is posted when confirmed."] }
  }),
  broken({
    id: "broken-missing-dependency", title: "The macro that needs a module nobody installed", category: "Unavailable dependency", difficulty: "advanced",
    summary: "An automation calls a third-party module's global unconditionally.",
    symptom: "`ReferenceError: MidiQOL is not defined` on worlds without Midi-QOL.",
    expected: "Detect the module; use it when present, otherwise fall back to the system's own `actor.applyDamage` with a notice.",
    exercise: { title: "Add a graceful fallback", prompt: "Check `game.modules.get(\"midi-qol\")?.active` and the global before using it; otherwise apply the damage with `actor.applyDamage(5)` and post an info notification mentioning the fallback.", runtime: "preview",
      starter: `const token = canvas.tokens.controlled[0];\nawait MidiQOL.applyTokenDamage([{ damage: 5, type: "fire" }], 5, new Set([token]), null, new Set());`,
      tests: [{ name: "Runs without a ReferenceError", expectNoError: true }, { name: "Falls back to the system workflow", expectUpdate: { name: "Sir Reginald", path: "system.attributes.hp.temp" } }, { name: "Explains the fallback", expectNotification: { type: "info" } }, { name: "Still detects the module", codeIncludes: "game\\.modules\\.get\\(\\s*[\"']midi-qol[\"']", message: "Detect the module with game.modules.get(\"midi-qol\")." }],
      hints: ["Never assume a global exists. Ask Foundry whether the module is active first.", "`game.modules.get(\"midi-qol\")?.active` is false/undefined here; `typeof MidiQOL !== \"undefined\"` guards the global.", "Branch: if available, call MidiQOL; else `await token.actor.applyDamage(5)` and `ui.notifications.info(...)`."],
      reveal: [{ title: "Detect and branch", code: `const token = canvas.tokens.controlled[0];\nconst midi = game.modules.get("midi-qol")?.active && typeof MidiQOL !== "undefined";\nif (midi) {\n  await MidiQOL.applyTokenDamage([{ damage: 5, type: "fire" }], 5, new Set([token]), null, new Set());\n} else {\n  await token.actor.applyDamage(5);\n  ui.notifications.info("Midi-QOL not active: applied damage with the system workflow.");\n}` }],
      solution: { code: `const token = canvas.tokens.controlled[0];\nconst midi = game.modules.get("midi-qol")?.active && typeof MidiQOL !== "undefined";\nif (midi) {\n  await MidiQOL.applyTokenDamage([{ damage: 5, type: "fire" }], 5, new Set([token]), null, new Set());\n} else {\n  await token.actor.applyDamage(5);\n  ui.notifications.info("Midi-QOL not active: applied damage with the system workflow.");\n}`, explanation: "Root cause: a hard dependency on an optional module. Detection via `game.modules.get(id)?.active` plus a guard on the global lets the macro degrade gracefully. The Midi-QOL call signature shown was read from the dnd6 branch source; always re-verify third-party signatures against the installed version." },
      concepts: ["integration", "dependencies", "fallback"], criteria: ["No ReferenceError.", "Damage applied via the system when Midi-QOL is absent.", "Module detection present."] }
  }),
  broken({
    id: "broken-empty-selection", title: "The macro that explodes with nothing selected", category: "Unexpected empty collection", difficulty: "beginner",
    summary: "A 'show HP' macro assumes a token is always selected.",
    symptom: "`TypeError: Cannot read properties of undefined (reading 'actor')` when nothing is selected.",
    expected: "With no selection, a warning `Select a token first.` and no error. (The scripted snapshot has nothing controlled: the code releases all tokens first.)",
    exercise: { title: "Handle the empty case", prompt: "Guard against an empty selection: warn and stop before touching `[0]`.", runtime: "preview",
      starter: `canvas.tokens.releaseAll(); // simulate: nothing selected\nconst token = canvas.tokens.controlled[0];\nconst hp = token.actor.system.attributes.hp;\nui.notifications.info(token.name + ": " + hp.value + "/" + hp.max);`,
      tests: [{ name: "No error with an empty selection", expectNoError: true }, { name: "Warns the user", expectNotification: { type: "warn", contains: "Select" } }],
      hints: ["`canvas.tokens.controlled` is an array; with nothing selected it is empty and `[0]` is `undefined`.", "Check `if (!token)` (or `controlled.length === 0`) before using it.", "Warn with `ui.notifications.warn(\"Select a token first.\")` and `return`."],
      reveal: [{ title: "Guard the empty selection", code: `canvas.tokens.releaseAll(); // simulate: nothing selected\nconst token = canvas.tokens.controlled[0];\nif (!token) {\n  ui.notifications.warn("Select a token first.");\n  return;\n}\nconst hp = token.actor.system.attributes.hp;\nui.notifications.info(token.name + ": " + hp.value + "/" + hp.max);` }],
      solution: { code: `canvas.tokens.releaseAll(); // simulate: nothing selected\nconst token = canvas.tokens.controlled[0];\nif (!token) {\n  ui.notifications.warn("Select a token first.");\n  return;\n}\nconst hp = token.actor.system.attributes.hp;\nui.notifications.info(token.name + ": " + hp.value + "/" + hp.max);`, explanation: "Root cause: an unguarded `[0]` on a possibly-empty array. Empty collections are a normal state, not an error; every macro that depends on a selection should check it and tell the user what to do." },
      concepts: ["validation", "empty-collections", "tokens"], criteria: ["No error with nothing selected.", "A warning tells the user to select a token."] }
  }),
  broken({
    id: "broken-html-injection", title: "The chat card that breaks on a name", category: "Improper HTML handling", difficulty: "advanced",
    summary: "A card builder inserts an actor name straight into HTML. A name containing `<` corrupts the card (and could inject markup).",
    symptom: "An actor named `Grik <the Bold>` produces a card with missing text; names with tags could inject elements into chat.",
    expected: "The name is escaped with `foundry.utils.escapeHTML` before being placed in the HTML.",
    exercise: { title: "Escape user-controlled text", prompt: "Escape the name before building the HTML. The test renames the actor to include angle brackets.", runtime: "preview",
      starter: `const actor = canvas.tokens.controlled[0].actor;\nawait actor.update({ name: "Grik <the Bold>" });\nconst html = "<div class=\\"card\\"><h3>" + actor.name + "</h3><p>Ready for battle.</p></div>";\nawait ChatMessage.create({ content: html });`,
      tests: [{ name: "The raw angle brackets are escaped in the message", expectChat: { html: "Grik &lt;the Bold&gt;" } }, { name: "Uses escapeHTML", codeIncludes: "escapeHTML", message: "Use foundry.utils.escapeHTML on the name." }],
      hints: ["Any text that a user can edit (names, bios, flags) is untrusted when placed into HTML.", "`foundry.utils.escapeHTML(text)` converts `<`, `>`, `&` and quotes into safe entities.", "Escape the name into a variable and use that variable in the template."],
      reveal: [{ title: "Escape before inserting", code: `const actor = canvas.tokens.controlled[0].actor;\nawait actor.update({ name: "Grik <the Bold>" });\nconst safeName = foundry.utils.escapeHTML(actor.name);\nconst html = "<div class=\\"card\\"><h3>" + safeName + "</h3><p>Ready for battle.</p></div>";\nawait ChatMessage.create({ content: html });` }],
      solution: { code: `const actor = canvas.tokens.controlled[0].actor;\nawait actor.update({ name: "Grik <the Bold>" });\nconst safeName = foundry.utils.escapeHTML(actor.name);\nconst html = "<div class=\\"card\\"><h3>" + safeName + "</h3><p>Ready for battle.</p></div>";\nawait ChatMessage.create({ content: html });`, explanation: "Root cause: string concatenation of untrusted text into HTML. Foundry sanitises chat content on creation, which blocks scripts, but corrupt or misleading markup still gets through and other contexts (your own windows) may not sanitise at all. Escape at the boundary where text meets HTML." },
      concepts: ["html", "security", "sanitise"], criteria: ["The name appears escaped in the chat content.", "escapeHTML is used."] }
  }),
  broken({
    id: "broken-error-recovery", title: "The catch block that hides the problem", category: "Faulty error recovery", difficulty: "advanced",
    summary: "A loop wraps each update in try/catch, but the catch swallows the error and reports success anyway.",
    symptom: "The final message says `All 3 tokens updated` even when an update failed; nobody finds out.",
    expected: "Failures are counted and reported: the summary says how many succeeded and names what failed, and the error is logged with `console.error`.",
    exercise: { title: "Report failures honestly", prompt: "Keep the try/catch but make it useful: count successes, record failures with the token name, log the error, and report both counts. The snapshot runs as a player, so Mirabel's token update fails.", runtime: "preview", snapshot: "practice-player",
      starter: `let updated = 0;\nconst tokens = canvas.tokens.controlled;\nfor (const token of tokens) {\n  try {\n    await token.actor.update({ "system.attributes.hp.temp": 5 });\n  } catch (err) {\n    // ignore\n  }\n  updated++;\n}\nui.notifications.info("All " + tokens.length + " tokens updated");`,
      tests: [{ name: "Finishes without throwing", expectNoError: true }, { name: "Reports one success and one failure", expectNotification: { contains: "1" } }, { name: "Names the failed token", expectNotification: { contains: "Mirabel" } }, { name: "Logs the error", outputIncludes: "Permission" }],
      hints: ["The counter increments whether or not the update succeeded. Move it inside the `try`.", "In `catch`, push the token name into a `failed` array and `console.error(err)`.", "Report both: `\\`\\${updated} updated, \\${failed.length} failed: \\${failed.join(\", \")}\\``."],
      reveal: [{ title: "Count inside try, record in catch", code: `let updated = 0;\nconst failed = [];\nconst tokens = canvas.tokens.controlled;\nfor (const token of tokens) {\n  try {\n    await token.actor.update({ "system.attributes.hp.temp": 5 });\n    updated++;\n  } catch (err) {\n    console.error("Update failed for " + token.name, err);\n    failed.push(token.name);\n  }\n}\nif (failed.length) ui.notifications.warn(\`\${updated} updated, \${failed.length} failed: \${failed.join(", ")}\`);\nelse ui.notifications.info(\`\${updated} tokens updated\`);` }],
      solution: { code: `let updated = 0;\nconst failed = [];\nconst tokens = canvas.tokens.controlled;\nfor (const token of tokens) {\n  try {\n    await token.actor.update({ "system.attributes.hp.temp": 5 });\n    updated++;\n  } catch (err) {\n    console.error("Update failed for " + token.name, err);\n    failed.push(token.name);\n  }\n}\nif (failed.length) ui.notifications.warn(\`\${updated} updated, \${failed.length} failed: \${failed.join(", ")}\`);\nelse ui.notifications.info(\`\${updated} tokens updated\`);`, explanation: "Root cause: an empty catch block. Catching an error is only recovery if you do something with it: record it, report it, and keep the success count honest. Silent catches turn loud failures into invisible data corruption." },
      concepts: ["error-handling", "loops", "reporting"], criteria: ["Failures are counted and named.", "Errors are logged.", "The summary reflects reality."] }
  })
];
