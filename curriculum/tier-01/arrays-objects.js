import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, fill, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t1-arrays-objects", tier: 1, topic: "JavaScript foundations", title: "Lists and records: arrays and objects",
  summary: "A list of targets is an array; a spell with a name, level and damage is an object. These two shapes hold almost all the data a macro touches, including every Foundry document.",
  minutes: 35, difficulty: "beginner", category: "core-js", prerequisites: ["t1-conditions"], access: ACCESS.none,
  objectives: ["Create arrays and read items by index and length", "Create objects with named properties and read nested paths", "Add to an array with push and change object properties", "Recognise document data as nested objects"],
  sections: [
    section("plain", "plain", "Two shapes for everything", [
      p("Single values run out fast. 'The targets' is several names. 'The spell' is a name, a level, a damage die and a school, together. JavaScript has two containers for this. An **array** is an ordered list: `[\"Goblin A\", \"Goblin B\"]`. An **object** is a bundle of named values: `{ name: \"Fire Bolt\", level: 0, damage: \"1d10\" }`."),
      p("Arrays are for 'many of the same kind, in order'. Objects are for 'one thing with several named parts'. Combine them freely: an array of spell objects; an object whose `targets` property is an array. Every Foundry document you will ever read is a big nested object: `actor.system.attributes.hp.value` is just following named parts inward.")
    ]),
    section("analogy", "analogy", "Initiative tracker and character sheet", [
      p("The initiative tracker is an array: an ordered list where position matters, and 'who is third' is a meaningful question. A character sheet is an object: nobody asks 'what is the third thing on the sheet'; they ask for Strength, or hit points, by name."),
      p("The sheet contains lists (the inventory) and the tracker contains sheets (each combatant). Nesting one shape in the other is normal, not advanced.")
    ]),
    section("technical", "technical", "Arrays and objects precisely", [
      p("Arrays are zero-indexed: the first item is `arr[0]`, the last is `arr[arr.length - 1]`. Reading past the end yields `undefined`, not an error. `arr.push(x)` appends; `arr.includes(x)` tests membership; `arr.indexOf(x)` finds a position (-1 if absent). Arrays are objects, so they are truthy even when empty, and two arrays are never `===` to each other even with the same contents."),
      p("Objects map string keys to values. `obj.key` and `obj[\"key\"]` read the same property; the bracket form allows computed keys (`obj[ability]`). Missing properties read as `undefined`. Assigning `obj.key = value` adds or changes a property. `Object.keys(obj)` lists the keys; `Object.entries(obj)` gives `[key, value]` pairs."),
      p("`const` on an array or object prevents re-pointing the variable, not changing the contents: `const list = []; list.push(1);` is fine, `list = [1]` is not.")
    ]),
    section("syntax", "syntax", "Literals and access", [
      js(`const targets = ["Goblin A", "Goblin B", "Orc War Chief"];\nconsole.log(targets.length, targets[0], targets[2], targets[3]);\ntargets.push("Wolf");\nconsole.log(targets.includes("Wolf"), targets.length);\n\nconst spell = { name: "Fire Bolt", level: 0, damage: { dice: "1d10", type: "fire" } };\nconsole.log(spell.name, spell.damage.dice, spell["level"], spell.school);\nspell.school = "evocation";\nconsole.log(Object.keys(spell));`, { expectOutput: ["3 Goblin A Orc War Chief undefined", "true 4", "Fire Bolt 1d10 0 undefined", "[\"name\", \"level\", \"damage\", \"school\"]"] })
    ]),
    section("example-minimal", "example-minimal", "A list of hit point values", [
      js(`const hitPoints = [24, 9, 7, 15];\nconst first = hitPoints[0];\nconst last = hitPoints[hitPoints.length - 1];\nconsole.log("First:", first, "Last:", last, "Count:", hitPoints.length);`, { expectOutput: ["First: 24 Last: 15 Count: 4"] })
    ]),
    section("example-annotated", "example-annotated", "A spell as an object", [
      js(`const fireBolt = {\n  name: "Fire Bolt",\n  level: 0,\n  school: "evocation",\n  damage: { dice: "1d10", type: "fire" },\n  tags: ["cantrip", "attack"]\n};\nconsole.log(\`\${fireBolt.name} (\${fireBolt.school})\`);\nconsole.log("Damage:", fireBolt.damage.dice, fireBolt.damage.type);\nconsole.log("First tag:", fireBolt.tags[0]);\nfireBolt.damage.dice = "2d10";\nconsole.log("At level 5:", fireBolt.damage.dice);`, { annotations: [{ line: 1, note: "An object literal spans several lines; each `key: value` pair ends with a comma." }, { line: 5, note: "A nested object: damage has its own named parts." }, { line: 6, note: "An array inside the object." }, { line: 9, note: "Follow the dots inward: object, then its damage object, then dice." }, { line: 10, note: "Dot into the object, then index into the array." }, { line: 11, note: "Changing a nested property. The const variable still points at the same object." }], expectOutput: ["Fire Bolt (evocation)", "Damage: 1d10 fire", "First tag: cantrip", "At level 5: 2d10"] })
    ]),
    section("incorrect", "incorrect", "Off the end, and the wrong name", [
      js(`const party = ["Reginald", "Mirabel", "Tobias"];\nconsole.log("Third member:", party[3]);\nconst spell = { name: "Shield", level: 1 };\nconsole.log("Spell:", spell.Name);`, { expectOutput: ["Third member: undefined", "Spell: undefined"], caption: "Two undefineds, no errors." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("The third member is at index 2, because counting starts at 0; index 3 is past the end, and JavaScript answers `undefined` rather than complaining. `spell.Name` with a capital N is a different (missing) property from `spell.name`. Both mistakes are silent; the error only appears later, when something tries to use the undefined value (`party[3].length` would throw)."),
      p("Silent `undefined` is why the Tier 0 advice matters: print the value you are about to use. And it is why wrong data paths in Foundry (`actor.system.hp` instead of `actor.system.attributes.hp`) are so common.")
    ]),
    section("corrected", "corrected", "Right index, right name", [
      js(`const party = ["Reginald", "Mirabel", "Tobias"];\nconsole.log("Third member:", party[2]);\nconst spell = { name: "Shield", level: 1 };\nconsole.log("Spell:", spell.name);`, { highlight: [2, 4], expectOutput: ["Third member: Tobias", "Spell: Shield"] })
    ]),
    section("use-case", "use-case", "Documents are objects, collections are lists", [
      fvtt(`const token = canvas.tokens.controlled[0];\nconst actor = token.actor;\nconsole.log("Abilities object keys:", Object.keys(actor.system.abilities));\nconsole.log("STR value:", actor.system.abilities.str.value);\nconst itemNames = actor.items.map(i => i.name);\nconsole.log("Items:", itemNames);\nconsole.log("First item:", actor.items.contents[0].name);`, { caption: "`actor.items` is a Foundry Collection, not a plain array; `.contents` gives the array and `.map` works directly. Tier 3 explains collections fully." })
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Starting to count at 1. The first item is `[0]`.", "Comparing arrays or objects with `===` (always false for different objects). Compare their contents or ids.", "Treating a Collection like an array (`game.actors[0]`). Use `.contents[0]` or `.get(id)`.", "Trailing property-name typos and capitalisation, which produce undefined silently.", "Forgetting commas between object properties (SyntaxError) or leaving a stray trailing comma in older environments (fine in modern JavaScript)."])
    ]),
    section("debugging", "debugging", "Inspecting a structure", [
      steps(["`console.log(obj)` shows the whole object in the console, expandable; in the academy it prints a compact summary.", "`console.log(Object.keys(obj))` lists exactly which names exist: copy the spelling from there.", "`console.log(arr.length)` before indexing; if it is 0 you have an empty list.", "Walk a long path one step at a time: `obj.a`, then `obj.a.b`, to find where undefined begins."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Arrays: ordered, zero-indexed, `.length`, `.push`, `.includes`.", "Objects: named properties, dot or bracket access, nestable.", "Missing indexes and properties are `undefined`, silently.", "Foundry documents are nested objects; collections hold them."])
    ])
  ],
  exercises: [
    predict({ id: "t1-arrays-predict", title: "Indexes and keys", prompt: "Predict the output.", code: `const list = ["a", "b", "c"];\nlist.push("d");\nconst rec = { hp: 10, max: 12 };\nrec.hp = rec.hp - 4;\nconsole.log(list[1], list.length, list[4]);\nconsole.log(rec.hp, rec.max, rec.temp);`, answer: "b 4 undefined\n6 12 undefined", explanation: "Index 1 is the second item; push makes the length 4; index 4 is past the end. rec.hp became 6; rec.temp was never set.", concepts: ["arrays", "objects"], hints: ["Count from zero.", "Unset properties read as undefined."] }),
    fill({ id: "t1-arrays-fill", title: "Build the record", prompt: "Fill the blanks so the program prints `Shortbow: 1d6 (2 arrows left)`.", code: `const weapon = { name: "Shortbow", damage: "1d6", ammo: ["arrow", "arrow"] };\nconsole.log(\`\${weapon.____}: \${weapon.damage} (\${weapon.ammo.____} arrows left)\`);`, blanks: [["name"], ["length"]], explanation: "Property access by name, and the array's length property.", concepts: ["arrays", "objects"], hints: ["The first blank is a property of weapon.", "How many items are in ammo?"] }),
    mc({ id: "t1-arrays-equality", title: "Equal lists?", prompt: "`const a = [1, 2]; const b = [1, 2];` What is `a === b`?", options: [["a", "true"], ["b", "false"], ["c", "An error"]], answer: "b", explanation: "They are two different array objects. === compares identity for objects, not contents.", concepts: ["arrays", "comparison"], hints: ["Two separate boxes with the same contents are still two boxes."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t1-arrays-q1", "`const names = [\"a\", \"b\"]; names.push(\"c\");` is:", [["a", "An error, because names is const"], ["b", "Fine; names now has three items"], ["c", "An error, because arrays cannot grow"]], "b", "const protects the variable binding, not the array's contents."),
    q("t1-arrays-q2", "What is `obj.missing.value` when obj has no `missing` property?", [["a", "undefined"], ["b", "A TypeError"], ["c", "null"]], "b", "obj.missing is undefined; reading .value of undefined throws."),
    q("t1-arrays-q3", "Which reads the hit point value of a dnd5e actor?", [["a", "`actor.system.hp`"], ["b", "`actor.system.attributes.hp.value`"], ["c", "`actor.hp.value`"]], "b", "The real path, verified against the dnd5e 6.x data model."),
    q("t1-arrays-q4", "How do you get the last item of an array `a`?", [["a", "`a[a.length]`"], ["b", "`a[a.length - 1]`"], ["c", "`a.last`"]], "b", "Zero-indexing: the last index is length - 1.")
  ] },
  challenge: codeEx({ id: "t1-arrays-encounter", type: "write-function", title: "buildEncounter", prompt: "Write `buildEncounter(names)` that takes an array of creature names and returns an object `{ count, first, last, roster }` where `count` is the number of names, `first` and `last` are the first and last names (or `null` when the array is empty), and `roster` is a copy of the array with `\"Boss\"` added at the end (the original array must not be changed).", runtime: "sandbox", starter: `function buildEncounter(names) {\n\n}\n`,
    tests: [{ name: "Three goblins", call: "buildEncounter", args: [["Goblin A", "Goblin B", "Goblin C"]], expect: { count: 3, first: "Goblin A", last: "Goblin C", roster: ["Goblin A", "Goblin B", "Goblin C", "Boss"] } }, { name: "Empty list", call: "buildEncounter", args: [[]], expect: { count: 0, first: null, last: null, roster: ["Boss"] } }, { name: "Single creature", call: "buildEncounter", args: [["Wolf"]], expect: { count: 1, first: "Wolf", last: "Wolf", roster: ["Wolf", "Boss"] } }],
    hints: ["`names.length` is the count; `names[0]` and `names[names.length - 1]` are first and last, but guard the empty case with a condition.", "Copy an array with `[...names]` or `names.slice()`, then push onto the copy.", "Return an object literal with the four keys."],
    reveal: [{ title: "Count, first, last", code: `function buildEncounter(names) {\n  const count = names.length;\n  const first = count ? names[0] : null;\n  const last = count ? names[count - 1] : null;\n  // roster...\n}` }, { title: "Copy, then push", code: `function buildEncounter(names) {\n  const count = names.length;\n  const first = count ? names[0] : null;\n  const last = count ? names[count - 1] : null;\n  const roster = [...names];\n  roster.push("Boss");\n  return { count, first, last, roster };\n}` }],
    solution: { code: `function buildEncounter(names) {\n  const count = names.length;\n  const first = count ? names[0] : null;\n  const last = count ? names[count - 1] : null;\n  const roster = [...names];\n  roster.push("Boss");\n  return { count, first, last, roster };\n}`, explanation: "Length, zero-based indexing with an empty-list guard, a copied array so the caller's list is untouched, and an object literal using shorthand property names (`{ count }` means `{ count: count }`)." },
    concepts: ["arrays", "objects", "functions", "empty-collections"], criteria: ["All three cases return the expected object.", "The original array is not modified."] }),
  reinforces: ["t1-conditions", "t1-variables"], documentation: [DOCS.mdnArray],
  completion: { required: ["t1-arrays-predict", "t1-arrays-fill", "t1-arrays-equality"], checkpoint: true, criterion: "Predict indexed access, complete a record, understand object equality, and pass the checkpoint." }
});
