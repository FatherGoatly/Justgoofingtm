import { lesson, section, p, list, steps, tip, note, warn, danger, table, fvtt, fvttStatic, mc, reorder, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t0-what-macros-touch", tier: 0, topic: "The zero-code gateway", title: "What a macro can touch, and who is allowed to",
  summary: "Some macros only show information; others change the game. Foundry's roles and ownership decide what each user's macros may do, and the server enforces it.",
  minutes: 25, difficulty: "beginner", category: "core-foundry", prerequisites: ["t0-reading-errors"], access: ACCESS.read,
  objectives: ["Name the kinds of things a macro can affect: chat, tokens, actors, scenes, settings", "Tell a 'display' macro from a 'change' macro by reading it", "Explain user roles and ownership in one sentence each", "Explain why the academy separates sandbox, preview and live execution"],
  sections: [
    section("plain", "plain", "Showing versus changing", [
      p("Every macro does one of two things, and the difference matters more than anything else in this tier. A **display** macro reads information and shows it: a chat message, a notification, a line in the console. If it goes wrong, nothing in your world is different afterwards. A **change** macro writes: it edits an actor's hit points, moves a token, deletes a scene. If it goes wrong, your world is different, and there is no undo button."),
      p("You can usually tell by reading. Words like `create`, `update`, `delete`, `setFlag` change things. Words like `console.log`, `ui.notifications.info`, and reading a property (`token.name`) only look. `ChatMessage.create` is the one that blurs the line: it creates a document (a message), but it does not alter actors or scenes, so in practice it is a display operation."),
      p("The second big idea: a macro runs **as you**. If your user cannot edit the dragon's sheet by hand, your macro cannot either. Foundry's server checks every change against your **role** (Player, Trusted, Assistant, Gamemaster) and the document's **ownership**. A macro is not a way around that; it is just a faster way of doing what you could already do.")
    ]),
    section("analogy", "analogy", "Describing the room versus moving the furniture", [
      p("Reading a token's name is like glancing at the battle map: harmless, repeatable, nobody minds. Updating hit points is like reaching across the table and erasing a number on a player's sheet. Most groups are fine with the GM doing that and not fine with another player doing it. Foundry encodes exactly that social rule as ownership: you may erase numbers on sheets you own."),
      p("The three execution modes in the academy are the same idea applied to learning. The **Concept Sandbox** is a scrap of paper that has no map on it at all. The **Foundry Preview** is a photocopy of the map: scribble all you like. **Live** is the real table.")
    ]),
    section("technical", "technical", "Roles, permissions and ownership", [
      table(["Concept", "What it controls", "How code checks it"], [["Role", "What kind of user you are: PLAYER (1), TRUSTED (2), ASSISTANT (3), GAMEMASTER (4)", "`game.user.role`, `game.user.isGM`, `game.user.hasRole(\"TRUSTED\")`"], ["Permission", "World-wide switches per role, e.g. may create actors, may use script macros", "`game.user.can(\"ACTOR_CREATE\")`, `game.user.can(\"MACRO_SCRIPT\")`"], ["Ownership", "Per-document level for each user: NONE, LIMITED, OBSERVER, OWNER", "`document.isOwner`, `document.testUserPermission(game.user, \"OBSERVER\")`"]]),
      p("Gamemasters pass every check. Everyone else is limited by their role for creating documents and by ownership for changing existing ones. These checks happen on the server, so a cleverly written macro cannot skip them: the server simply refuses and the macro receives an error."),
      p("Script macros themselves require the `MACRO_SCRIPT` permission, which is granted to players by default in most worlds but can be removed by the GM. The academy's live mode checks it before running anything.")
    ]),
    section("syntax", "syntax", "Reading a macro for its effects", [
      p("Scan for the verbs. Here are the ones that write, grouped by what they touch:"),
      table(["Touches", "Writing verbs", "Reading examples"], [["Chat", "`ChatMessage.create`", "`game.messages.contents`"], ["Tokens", "`token.document.update`, `scene.createEmbeddedDocuments(\"Token\")`, `token.document.delete`", "`canvas.tokens.controlled`, `token.name`, `token.x`"], ["Actors and items", "`actor.update`, `actor.createEmbeddedDocuments`, `item.update`, `actor.applyDamage` (dnd5e)", "`actor.name`, `actor.system.attributes.hp.value`"], ["Scenes", "`scene.update`, `scene.activate`, `Scene.create`", "`canvas.scene.name`"], ["Settings and flags", "`game.settings.set`, `document.setFlag`", "`game.settings.get`, `document.getFlag`"], ["Game mechanics", "`item.use`, `actor.rollSavingThrow`, `combat.nextTurn`", "`game.combat.round`"]]),
      p("The academy marks every lesson with badges for exactly these categories (reads, writes, creates, mechanics), and the Foundry Preview lists every write a program *would* have made.")
    ]),
    section("example-minimal", "example-minimal", "A display macro", [
      fvtt(`const token = canvas.tokens.controlled[0];\nui.notifications.info("You selected: " + token.name);`, { caption: "Reads the first selected token's name and shows a notification. Nothing in the world changes. (In the practice snapshot, Sir Reginald is selected.)" })
    ]),
    section("example-annotated", "example-annotated", "A change macro, read carefully", [
      fvtt(`const token = canvas.tokens.controlled[0];\nconst actor = token.actor;\nconsole.log("Before:", actor.system.attributes.hp.value);\nawait actor.update({ "system.attributes.hp.value": 10 });\nconsole.log("After:", actor.system.attributes.hp.value);`, { annotations: [{ line: 1, note: "Read: which token is selected." }, { line: 2, note: "Read: the actor behind that token." }, { line: 3, note: "Read: print the current hit points (24 in the practice data)." }, { line: 4, note: "WRITE. `update` sends a change to the server. The server checks that you own this actor. `await` waits for the answer." }, { line: 5, note: "Read again: now 10. In Foundry Preview this change is recorded and shown, never applied to your real world." }], caption: "Run it in preview and look at the 'Game changes that would have happened' panel." })
    ]),
    section("incorrect", "incorrect", "A player's macro that assumes GM powers", [
      p("Run by a Gamemaster, this works. Run by a player who does not own the Orc War Chief, the server refuses the update. The practice snapshot for this block is set up as a player."),
      fvtt(`const chief = game.actors.getName("Orc War Chief");\nawait chief.update({ "system.attributes.hp.value": 0 });\nui.notifications.info("The chief falls!");`, { expectError: true, snapshot: "practice-player", caption: "Preview, as a player: the update throws a permission error and the notification never shows." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("The macro never asked whether the current user owns the chief. The server did, and said no. The error arrives as an exception on the `update` line, so the notification line never runs. The player sees a red error and nothing else."),
      p("Two lessons: first, check before you write (`chief.isOwner`), so your macro can explain instead of crash. Second, design for the user who will actually run the macro. A tool meant for players should only touch what players own; a tool that must edit NPCs is a GM tool and should say so.")
    ]),
    section("corrected", "corrected", "Check, then act", [
      fvtt(`const chief = game.actors.getName("Orc War Chief");\nif (!chief.isOwner) {\n  ui.notifications.warn("Only the chief's owner (usually the GM) can do this.");\n} else {\n  await chief.update({ "system.attributes.hp.value": 0 });\n  ui.notifications.info("The chief falls!");\n}`, { snapshot: "practice-player", highlight: [2, 3], caption: "As a player this now shows a clear warning. As the GM it applies the change." })
    ]),
    section("use-case", "use-case", "Choosing where to run code", [
      list(["**Concept Sandbox**: plain JavaScript only. Use it for every exercise about variables, logic and loops. No `game`, no `canvas`.", "**Foundry Preview**: an emulated Foundry built from a copy of your data. Use it to see what a macro *would* do, including the exact list of writes.", "**Live**: the real thing. Use it when you have read the code, understand every write it makes, and want it to happen."]),
      danger("Live execution has no sandbox and no undo. The academy will always ask you to confirm, and it will refuse if your user lacks the script-macro permission. Treat code from strangers like a stranger's macro: read it all first.")
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Believing a macro can 'bypass' ownership because it is code. It cannot; the server decides.", "Testing a player-facing macro only as the GM, so permission errors are never seen until game night.", "Treating `ChatMessage.create` as dangerous (it is just chat) and `actor.update` as harmless (it is not).", "Running pasted code live before reading it."])
    ]),
    section("debugging", "debugging", "If a change is refused", [
      steps(["Read the error: 'Permission denied' or 'User lacks permission' means the server said no. The code is not broken; the authority is missing.", "Check `game.user.isGM` and `document.isOwner` in the console for the document in question.", "Decide: should this user be able to do this? If yes, the GM grants ownership or a permission. If no, the macro should check and explain."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Display macros read and show; change macros write. Learn to spot the writing verbs.", "A macro runs with your role and your ownership; the server enforces both.", "Check `isOwner` before writing so failures become clear messages.", "Sandbox for pure JavaScript, Preview for dry runs, Live only when you understand every write."])
    ])
  ],
  exercises: [
    mc({ id: "t0-what-macros-touch-classify", title: "Display or change?", prompt: "Which of these macros changes the game world? (Select all that apply.)", options: [["a", "`ui.notifications.info(canvas.scene.name)`"], ["b", "`await token.document.update({ hidden: true })`"], ["c", "`console.log(game.user.name)`"], ["d", "`await Scene.create({ name: \"Cellar\" })`"]], answer: ["b", "d"], explanation: "`update` and `create` write to the world. Notifications and console output only display.", concepts: ["permissions", "reads-vs-writes"], hints: ["Look for the verbs create, update, delete."] }),
    reorder({ id: "t0-what-macros-touch-order", title: "What happens when a player clicks a macro that edits an actor", prompt: "Put these events in the order Foundry performs them.", steps: [["read", "The browser reads the macro text and starts executing it"], ["request", "The `update` line sends a change request to the server"], ["check", "The server checks the user's role and the actor's ownership"], ["apply", "The change is saved and every client sees the new value"], ["error", "If the check fails, the update line throws an error instead"]], answer: ["read", "request", "check", "apply", "error"], explanation: "Execution happens in the browser; changes are requests; the server checks before applying. The error step is the alternative outcome of the check, listed last.", concepts: ["permissions", "sequencing"], hints: ["Nothing can be checked before it is requested.", "The error is what happens instead of applying."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t0-what-macros-touch-q1", "A player writes a macro that updates the dragon's hit points. The player does not own the dragon. What happens?", [["a", "The macro works because macros run with GM authority"], ["b", "The server refuses and the update line throws an error"], ["c", "The dragon is updated but only on the player's screen"]], "b", "Macros run with the user's own permissions; the server enforces ownership."),
    q("t0-what-macros-touch-q2", "Which execution mode records writes without applying them?", [["a", "Concept Sandbox"], ["b", "Foundry Preview"], ["c", "Live"]], "b", "Preview emulates Foundry from a snapshot and lists what would have changed."),
    q("t0-what-macros-touch-q3", "`actor.isOwner` is false for the current user. What should a well-written macro do?", [["a", "Try the update anyway and hope"], ["b", "Explain that the user cannot change this actor and stop"], ["c", "Switch the user to GM"]], "b", "Check first, explain clearly. A macro cannot change a user's role.")
  ] },
  challenge: codeEx({ id: "t0-what-macros-touch-guard", type: "complete-macro", title: "A polite hide macro", prompt: "Complete the macro so that it hides the selected token (`token.document.update({ hidden: true })`) only if `token.isOwner` is true; otherwise it shows a warning containing the word `own`. The snapshot runs as a player who owns Sir Reginald (selected first).", runtime: "preview", snapshot: "practice-player",
    starter: `const token = canvas.tokens.controlled[0];\n// If the user owns the token, hide it. Otherwise warn them.\n`,
    tests: [{ name: "Runs without errors", expectNoError: true }, { name: "Hides the owned token", expectUpdate: { name: "Sir Reginald", path: "hidden", value: true } }, { name: "Uses an ownership check", codeIncludes: "isOwner", message: "Check token.isOwner before updating." }],
    hints: ["`if (token.isOwner) { ... } else { ... }` is the shape you need.", "Inside the if: `await token.document.update({ hidden: true });`", "Inside the else: `ui.notifications.warn(\"You do not own this token.\");`"],
    reveal: [{ title: "Check, then act", code: `const token = canvas.tokens.controlled[0];\nif (token.isOwner) {\n  await token.document.update({ hidden: true });\n} else {\n  ui.notifications.warn("You do not own this token.");\n}` }],
    solution: { code: `const token = canvas.tokens.controlled[0];\nif (token.isOwner) {\n  await token.document.update({ hidden: true });\n} else {\n  ui.notifications.warn("You do not own this token.");\n}`, explanation: "An ownership check turns a server refusal into a friendly message. You will meet `if`/`else` properly in Tier 1; here it reads as English." },
    concepts: ["permissions", "conditions", "tokens"], criteria: ["The owned token is hidden.", "An ownership check is present."] }),
  reinforces: ["t0-what-is-code"], documentation: [DOCS.usersArticle, DOCS.user],
  completion: { required: ["t0-what-macros-touch-classify", "t0-what-macros-touch-order"], checkpoint: true, criterion: "Classify macros as display or change, order the permission flow, and pass the checkpoint." }
});
