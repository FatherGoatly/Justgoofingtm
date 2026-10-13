import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, identify, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t3-collections", tier: 3, topic: "Understanding Foundry VTT", title: "Collections: finding documents in game.actors, game.items and beyond",
  summary: "World documents live in Collections: Map-like containers with get, getName, contents and the array helpers you already know. Learn to retrieve documents reliably by id, by name, and by filtering.",
  minutes: 30, difficulty: "beginner", category: "core-foundry", prerequisites: ["t3-documents"], access: ACCESS.read,
  objectives: ["Use get, getName, contents, size, filter, find and map on a Collection", "Explain why game.actors[0] is undefined", "Retrieve documents by id, uuid and name and know which is reliable", "Iterate embedded collections such as actor.items"],
  sections: [
    section("plain", "plain", "Map-like, array-friendly", [
      p("`game.actors`, `game.items`, `game.scenes`, `game.users`, `game.macros`, `actor.items`, `actor.effects`, `scene.tokens`, `combat.combatants`: all **Collections**. A Collection is a `Map` from id to document with extra conveniences: `get(id)`, `getName(name)`, `contents` (an array of the documents), `size`, and the array helpers `filter`, `find`, `map`, `some`, `reduce`. You can `for...of` over it directly."),
      p("What it is not is an array. `game.actors[0]` is undefined, `game.actors.length` is undefined (use `size`), and `game.actors.sort(...)` does not exist (sort `contents`). Once you remember 'Map with helpers', everything fits.")
    ]),
    section("analogy", "analogy", "The index at the back of the binder", [
      p("The actor directory is a filing cabinet indexed by id: ask for id `abc` and you get that folder instantly (`get`). Asking by name (`getName`) means flipping through labels, and two folders can carry the same label. Asking 'all the goblins' (`filter`) means a full pass. Each is fine; just know which one you are doing and what happens when the label is missing or duplicated.")
    ]),
    section("technical", "technical", "The Collection API", [
      table(["Member", "Returns", "Notes"], [["`get(id, { strict })`", "document or undefined", "strict throws instead of undefined"], ["`getName(name, { strict })`", "first document with that name", "names are not unique"], ["`contents`", "array", "a fresh array each call"], ["`size`", "number", "not length"], ["`has(id)`", "boolean", ""], ["`filter/find/map/some/every/reduce`", "as on arrays", "callback receives the document"], ["`for...of`", "documents", "iterates values"], ["`keys()`, `values()`, `entries()`", "iterators", "Map methods"]]),
      p("World collections also have `documentName` and `folders` helpers and, for Actors, `tokens` (synthetic token actors). Embedded collections (`actor.items`) hold the parent's embedded documents and are refreshed when the parent updates. Compendium packs (`game.packs`) are different: their contents must be loaded with `pack.getDocuments()`; the index is available without loading.")
    ]),
    section("syntax", "syntax", "Retrieval patterns", [
      fvtt(`const byId = game.actors.get("acaReginald01");\nconst byName = game.actors.getName("Goblin Scout");\nconst byUuid = await fromUuid("Actor.acaMirabel0002");\nconst npcs = game.actors.filter(a => a.type === "npc");\nconst names = game.actors.map(a => a.name);\nconsole.log(byId?.name, byName?.name, byUuid?.name);\nconsole.log(npcs.length, "npcs;", game.actors.size, "actors;", names);`)
    ]),
    section("example-minimal", "example-minimal", "Iterating a collection", [
      fvtt(`for (const actor of game.actors) {\n  console.log(actor.name, actor.type);\n}\nconsole.log("Characters:", game.actors.filter(a => a.type === "character").map(a => a.name));`)
    ]),
    section("example-annotated", "example-annotated", "Embedded collections and safe lookup", [
      fvtt(`const actor = game.actors.getName("Sir Reginald");\nconsole.log("Items:", actor.items.size);\nconst weapons = actor.items.filter(i => i.type === "weapon");\nconsole.log("Weapons:", weapons.map(w => w.name));\nconst potion = actor.items.find(i => i.name.startsWith("Potion"));\nconsole.log("Potion:", potion ? \`\${potion.name} x\${potion.system.quantity}\` : "none");\nconst ghost = game.actors.getName("Nobody");\nconsole.log("Missing actor:", ghost);\nconst strict = () => game.actors.getName("Nobody", { strict: true });\ntry { strict(); } catch (err) { console.log("Strict lookup threw:", err.message); }`, { annotations: [{ line: 3, note: "`filter` on the embedded collection returns an array of Item documents." }, { line: 5, note: "`find` returns the first match or undefined; the ternary on the next line guards it." }, { line: 7, note: "Non-strict lookups return undefined quietly." }, { line: 9, note: "`strict: true` turns a missing document into an exception, which is sometimes exactly what you want (fail loudly early)." }] })
    ]),
    section("incorrect", "incorrect", "Array habits on a Collection", [
      fvtt(`const first = game.actors[0];\nconsole.log(first.name);`, { expectError: true, caption: "`TypeError: Cannot read properties of undefined (reading 'name')`." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("A Collection is a Map keyed by id; `[0]` asks for a property named \"0\", which does not exist, so `first` is undefined and reading `.name` throws. The array view is `game.actors.contents`, so `game.actors.contents[0]` works (though 'first actor' rarely means anything useful; prefer `get`, `getName` or `find`)."),
      p("Likewise `game.actors.length` is undefined; the count is `size`.")
    ]),
    section("corrected", "corrected", "contents, size, get", [
      fvtt(`const first = game.actors.contents[0];\nconsole.log(first?.name, "of", game.actors.size);\nconst reginald = game.actors.get("acaReginald01");\nconsole.log(reginald?.name);`, { highlight: [1, 2] })
    ]),
    section("use-case", "use-case", "Name lookups that fail gracefully", [
      fvtt(`function findActorByName(name) {\n  const matches = game.actors.filter(a => a.name === name);\n  if (!matches.length) return { ok: false, reason: \`No actor named "\${name}".\` };\n  if (matches.length > 1) return { ok: false, reason: \`\${matches.length} actors are named "\${name}"; use the id or uuid instead.\` };\n  return { ok: true, actor: matches[0] };\n}\nconsole.log(findActorByName("Mirabel the Wise"));\nconsole.log(findActorByName("Nobody").reason);`, { caption: "Treating duplicates as an error is safer than silently taking the first one." })
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Indexing a Collection with `[0]` or reading `.length`.", "Trusting `getName` in worlds with duplicate names.", "Calling `.sort` on a Collection (use `.contents.sort(...)`).", "Expecting compendium documents to be in `game.actors` (they are in packs until imported).", "Mutating `contents` and expecting the collection to change (it is a copy)."])
    ]),
    section("debugging", "debugging", "Lookup returned undefined", [
      steps(["Log the exact name or id you searched for, in quotes, to catch trailing spaces or case.", "Log `game.actors.map(a => a.name)` to see what exists.", "If it is an unlinked token's actor, it is not in `game.actors`; use `token.actor`.", "If it lives in a compendium, load it from the pack first."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Collections are Maps with array helpers: get, getName, contents, size, filter, find, map.", "No `[0]`, no `length`.", "Names collide; ids and uuids do not.", "Embedded collections (`actor.items`) work the same way."])
    ])
  ],
  exercises: [
    identify({ id: "t3-collections-fault", title: "Spot the array habit", prompt: "This throws. Select the faulty line.", code: `const spells = game.actors.getName("Mirabel the Wise").items;\nconst count = spells.length;\nconst first = spells.contents[0];\nconsole.log(count, first.name);`, answer: [2], explanation: "A Collection has `size`, not `length`; `count` is undefined (and the program would print undefined rather than throw here, but the first.name line works). The faulty line is 2.", concepts: ["collections"], hints: ["Which property does an array have that a Collection does not?"] }),
    predict({ id: "t3-collections-predict", title: "Which lookup finds what?", prompt: "In the practice snapshot the actors are Sir Reginald, Mirabel the Wise, Goblin Scout, Orc War Chief and Wolf. Predict the output.", code: `console.log(game.actors.getName("Goblin Scout")?.type);\nconsole.log(game.actors.get("Goblin Scout")?.name);\nconsole.log(game.actors.filter(a => a.type === "npc").length);\nconsole.log(game.actors.size);`, answer: "npc\nundefined\n3\n5", explanation: "getName matches the name; get expects an id, so a name returns undefined; three npcs; five actors.", concepts: ["collections"], hints: ["get takes an id, getName takes a name."] }),
    mc({ id: "t3-collections-reliable", title: "Most reliable", prompt: "A macro must find one specific actor every session. Which lookup is most reliable?", options: [["a", "`game.actors.getName(\"Bob\")`"], ["b", "`game.actors.contents[2]`"], ["c", "`await fromUuid(\"Actor.abc123\")`"]], answer: "c", explanation: "uuids are stable and unique; names can be duplicated or changed, and positions shift.", concepts: ["collections", "uuid"], hints: ["Which identifier never changes and never collides?"] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t3-collections-q1", "How do you count the actors in the world?", [["a", "`game.actors.length`"], ["b", "`game.actors.size`"], ["c", "`game.actors.count()`"]], "b", "Collections are Maps."),
    q("t3-collections-q2", "`game.actors.getName(\"X\")` when two actors are named X:", [["a", "Throws"], ["b", "Returns the first match"], ["c", "Returns an array"]], "b", "First match wins silently; check for duplicates yourself."),
    q("t3-collections-q3", "Which gives an array of all scenes?", [["a", "`game.scenes.contents`"], ["b", "`game.scenes.list`"], ["c", "`Array(game.scenes)`"]], "a", "contents is the array view.")
  ] },
  challenge: codeEx({ id: "t3-collections-inventory", type: "complete-macro", title: "Inventory lookup", prompt: "For the first controlled token's actor, build and print (console.log, one per line): the number of items (`Items: N`), a comma-separated list of weapon names sorted alphabetically (`Weapons: A, B`), and the quantity of the first item whose name starts with `Potion` (`Potions: N`, or `Potions: 0` if none). Use the Collection helpers rather than hand-written loops.", runtime: "preview", starter: `const actor = canvas.tokens.controlled[0].actor;\n`,
    tests: [{ name: "Runs without errors", expectNoError: true }, { name: "Prints the three lines", expectOutput: ["Items: 4", "Weapons: Longsword", "Potions: 2"] }, { name: "Uses collection helpers", codeIncludes: "\\.(filter|find|map)\\(", message: "Use filter/find/map on actor.items." }],
    hints: ["`actor.items.size` for the count.", "`actor.items.filter(i => i.type === \"weapon\").map(i => i.name).sort().join(\", \")`.", "`actor.items.find(i => i.name.startsWith(\"Potion\"))?.system.quantity ?? 0`."],
    reveal: [{ title: "Count and weapons", code: `const actor = canvas.tokens.controlled[0].actor;\nconsole.log("Items: " + actor.items.size);\nconsole.log("Weapons: " + actor.items.filter(i => i.type === "weapon").map(i => i.name).sort().join(", "));` }, { title: "Potions", code: `const actor = canvas.tokens.controlled[0].actor;\nconsole.log("Items: " + actor.items.size);\nconsole.log("Weapons: " + actor.items.filter(i => i.type === "weapon").map(i => i.name).sort().join(", "));\nconst potion = actor.items.find(i => i.name.startsWith("Potion"));\nconsole.log("Potions: " + (potion?.system.quantity ?? 0));` }],
    solution: { code: `const actor = canvas.tokens.controlled[0].actor;\nconsole.log("Items: " + actor.items.size);\nconsole.log("Weapons: " + actor.items.filter(i => i.type === "weapon").map(i => i.name).sort().join(", "));\nconst potion = actor.items.find(i => i.name.startsWith("Potion"));\nconsole.log("Potions: " + (potion?.system.quantity ?? 0));`, explanation: "size, filter/map/sort/join, and a guarded find: the Collection toolkit in three lines." },
    concepts: ["collections", "array-methods", "documents"], criteria: ["The three lines match.", "Collection helpers are used."] }),
  reinforces: ["t2-array-methods", "t3-documents"], documentation: [doc3()],
  completion: { required: ["t3-collections-fault", "t3-collections-predict", "t3-collections-reliable"], checkpoint: true, criterion: "Spot array habits, predict lookups, choose reliable identifiers, and pass the checkpoint." }
});

function doc3() { return { title: "Collection (API)", url: "https://foundryvtt.com/api/classes/foundry.utils.Collection.html", verified: "2026-10 (V14 API docs)" }; }
