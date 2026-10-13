import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, fill, identify, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t1-variables", tier: 1, topic: "JavaScript foundations", title: "Remembering information with variables",
  summary: "A GM needs to remember how much damage a creature took. Variables are named boxes for values: const for things that never change, let for things that do.",
  minutes: 30, difficulty: "beginner", category: "core-js", prerequisites: ["t0-welcome-macro"], access: ACCESS.none,
  objectives: ["Create variables with const and let and explain the difference", "Name the five basic value types: string, number, boolean, null, undefined", "Choose names that make code readable", "Update a let variable and predict the result"],
  sections: [
    section("plain", "plain", "Boxes with labels", [
      p("A GM has to remember things: how much damage the ogre has taken, whose turn it is, whether the door is locked. A program remembers things with **variables**: a label attached to a value. `const damage = 7;` creates a label `damage` and attaches the number 7 to it. From then on, writing `damage` anywhere means 7."),
      p("There are two ways to create a variable. `const` (constant) means 'this label will never be pointed at a different value'. `let` means 'this label may be re-pointed later'. Use `const` by default; switch to `let` only when you actually need to change the value. That way, anyone reading your code knows which values can change."),
      p("Variables hold values, and values come in a few basic kinds: text (**strings**, in quotes), **numbers**, **booleans** (true or false), and two kinds of 'nothing': `undefined` (never given a value) and `null` (deliberately empty).")
    ]),
    section("analogy", "analogy", "Index cards on the GM screen", [
      p("Picture index cards taped to the inside of your GM screen. One says `ogreDamage: 7`. One says `doorLocked: true`. One says `currentTurn: \"Mirabel\"`. When the ogre takes 5 more damage you erase the 7 and write 12. That card is a `let`."),
      p("Another card says `partySize: 4`. You wrote it before the session and it will not change tonight. Laminate it: that is a `const`. If you try to erase a laminated card, the pen slides off. JavaScript does the same: assigning to a `const` is an error, which protects you from accidentally changing something that should stay fixed.")
    ]),
    section("technical", "technical", "Declaration, assignment and types", [
      p("`const name = value;` and `let name = value;` **declare** a variable and **initialise** it. `name = otherValue;` (no keyword) **assigns** a new value to an existing `let` variable. Assigning to a `const` throws `TypeError: Assignment to constant variable`. Declaring the same name twice in the same block throws a SyntaxError."),
      p("A `let` declared without a value holds `undefined` until assigned. `const` must be given a value immediately (`const x;` is a SyntaxError: 'Missing initializer')."),
      p("JavaScript is dynamically typed: a variable has no fixed type, its current value does. `typeof value` reports the type as a string: `\"string\"`, `\"number\"`, `\"boolean\"`, `\"undefined\"`, `\"object\"` (also for `null`, a historical quirk).")
    ]),
    section("syntax", "syntax", "Names and values", [
      table(["Value kind", "Looks like", "Use for"], [["string", "`\"Mirabel\"`, `'7th level'`, `` `Round ${n}` ``", "Names, descriptions, messages"], ["number", "`7`, `2.5`, `-3`", "Hit points, modifiers, distances"], ["boolean", "`true`, `false`", "Yes/no facts: hidden, locked, surprised"], ["undefined", "`undefined`", "'Not set yet' (JavaScript's default)"], ["null", "`null`", "'Deliberately nothing' (you set it)"]]),
      p("Names may contain letters, digits, `_` and `$`, and may not start with a digit. By convention use `camelCase`: `currentHitPoints`, `isHidden`, `targetName`. Pick names that say what the value *is*, not how it is stored: `ogreDamage` beats `x` and beats `number1`."),
      p("Names are case-sensitive: `damage`, `Damage` and `DAMAGE` are three different variables. Most ReferenceErrors in beginner code are capitalisation mismatches.")
    ]),
    section("example-minimal", "example-minimal", "Remembering damage", [
      js(`const creature = "Ogre";\nlet damage = 7;\ndamage = damage + 5;\nconsole.log(creature + " has taken " + damage + " damage");`, { expectOutput: ["Ogre has taken 12 damage"] })
    ]),
    section("example-annotated", "example-annotated", "Line by line", [
      js(`const creature = "Ogre";\nconst maxHP = 59;\nlet damage = 0;\ndamage = damage + 7;\ndamage = damage + 5;\nconst remaining = maxHP - damage;\nconsole.log(creature, "remaining:", remaining);`, { annotations: [{ line: 1, note: "A string in a const: the creature's name will not change." }, { line: 2, note: "A number in a const." }, { line: 3, note: "A let starting at 0: this one will change." }, { line: 4, note: "Read `damage` (0), add 7, store 7 back into `damage`. The right side is computed first, then assigned." }, { line: 5, note: "Now 12." }, { line: 6, note: "A new const computed from two other variables: 59 - 12 = 47. Computed once; it will not update if damage changes later." }, { line: 7, note: "console.log with three arguments prints them separated by spaces." }], expectOutput: ["Ogre remaining: 47"] })
    ]),
    section("incorrect", "incorrect", "Changing a constant", [
      p("The author declared `damage` with `const` and then tried to add to it."),
      js(`const damage = 7;\ndamage = damage + 5;\nconsole.log(damage);`, { expectError: true, caption: "`TypeError: Assignment to constant variable.`" })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("`const` is a promise that the label will never be re-pointed. Line 2 tries to re-point it, so JavaScript throws on that line. Line 1 ran; line 3 never did."),
      p("This error is a feature. It catches the far more dangerous case where you change something by accident. If a value should change, say so with `let`; then readers know to watch it.")
    ]),
    section("corrected", "corrected", "The fix", [
      js(`let damage = 7;\ndamage = damage + 5;\nconsole.log(damage);`, { highlight: [1], expectOutput: ["12"] })
    ]),
    section("use-case", "use-case", "The first step of a damage macro", [
      p("Every damage macro you will write starts by storing things in variables: the amount, the target, whether it was a critical. Here is the shape in Foundry, reading a real value into a variable. The number comes from the selected token's actor (practice data: Sir Reginald with 24 HP)."),
      fvtt(`const token = canvas.tokens.controlled[0];\nconst currentHP = token.actor.system.attributes.hp.value;\nlet damage = 10;\nconst remaining = currentHP - damage;\nconsole.log(token.name + " would have " + remaining + " HP left");`, { caption: "Reading only. The next lessons add input, checks and the actual update." }),
      tip("Store a value in a well-named variable even if you use it once. `const currentHP = ...` documents what the long path means.")
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Forgetting the keyword: `damage = 7;` without `let` or `const` creates a sloppy global (in strict code it is an error). Always declare.", "Using `=` when you meant 'equals' in a comparison (that is `===`, next lessons).", "Naming variables after their type (`string1`) or with abbreviations only you understand (`dmg2`).", "Expecting `remaining` to update automatically when `damage` changes later. A variable holds the value computed at that moment."])
    ]),
    section("debugging", "debugging", "Watching a variable", [
      steps(["Print the variable right after each change: `console.log(\"damage is now\", damage);`.", "If a value is `undefined`, the variable was declared but never assigned, or you misspelled its name (a different, empty variable).", "If you see `Assignment to constant variable`, change `const` to `let` only if the value really should change; otherwise fix the code that tries to change it."])
    ]),
    section("summary", "summary", "Summary", [
      list(["`const` for values that never change; `let` for values that do.", "Strings, numbers, booleans, undefined and null are the basic values.", "`x = x + 5` computes the right side first, then stores it in `x`.", "Good names make code readable; case matters."])
    ])
  ],
  exercises: [
    predict({ id: "t1-variables-predict", title: "Follow the value", prompt: "What does this print?", code: `let hp = 20;\nhp = hp - 8;\nhp = hp + 3;\nconsole.log(hp);`, answer: "15", explanation: "20 - 8 = 12, then 12 + 3 = 15. Each assignment stores the new value for the next line.", concepts: ["variables"], hints: ["Work line by line, writing the current value of hp after each."] }),
    mc({ id: "t1-variables-which-keyword", title: "const or let?", prompt: "A macro stores the selected token's name and then counts how many hits it takes during the macro. Which declarations fit?", options: [["a", "`const name`, `const hits`"], ["b", "`const name`, `let hits`"], ["c", "`let name`, `let hits`"]], answer: "b", explanation: "The name does not change during the macro (const); the hit count is incremented (let).", concepts: ["variables"], hints: ["Which value will be reassigned?"] }),
    identify({ id: "t1-variables-find-fault", title: "Spot the mistake", prompt: "This program throws. Select the line that causes the error.", code: `const target = "Goblin Scout";\nlet wounds = 0;\nwounds = wounds + 1;\ntarget = "Goblin Chief";\nconsole.log(target, wounds);`, answer: [4], explanation: "`target` was declared with const on line 1; line 4 tries to reassign it.", concepts: ["variables", "errors"], hints: ["Which variable is a const? Where is it assigned a second time?"] }),
    fill({ id: "t1-variables-fill", title: "Complete the declarations", prompt: "Fill in the keywords so that the creature name is fixed and the damage can change.", code: `____ creature = "Wolf";\n____ damage = 0;\ndamage = damage + 4;\nconsole.log(creature, damage);`, blanks: [["const"], ["let"]], explanation: "The name never changes (const); damage is reassigned (let).", concepts: ["variables"], hints: ["Which one is reassigned on line 3?"] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t1-variables-q1", "What is the value of `x` after `let x;`?", [["a", "0"], ["b", "null"], ["c", "undefined"]], "c", "A declared but unassigned let holds undefined."),
    q("t1-variables-q2", "`const hp = 10; hp = 5;` produces which error?", [["a", "SyntaxError"], ["b", "TypeError: Assignment to constant variable"], ["c", "No error; hp becomes 5"]], "b", "Reassigning a const throws a TypeError at run time."),
    q("t1-variables-q3", "Which is the best name for a variable holding the number of goblins remaining?", [["a", "`n`"], ["b", "`goblinsRemaining`"], ["c", "`number_of_goblins_that_are_still_alive_right_now`"]], "b", "Descriptive but not absurdly long, in camelCase."),
    q("t1-variables-q4", "`const total = a + b;` is computed. Later `a` changes. What happens to `total`?", [["a", "It updates automatically"], ["b", "Nothing; it keeps the value computed at the time"], ["c", "It becomes undefined"]], "b", "Variables hold values, not formulas.")
  ] },
  challenge: codeEx({ id: "t1-variables-damage-tracker", type: "write-function", title: "Track two hits", prompt: "Write a program that stores a creature name (any string) in a const, starts `damage` at 0 with `let`, applies two hits of 6 and 9, and prints exactly `Total damage: 15`. Use a variable for the total; do not just print the number.", runtime: "sandbox", starter: `// creature name, damage, two hits, then print\n`,
    tests: [{ name: "Prints the total", expectOutput: ["Total damage: 15"] }, { name: "Uses let for damage", codeIncludes: "let\\s+damage", message: "Declare damage with let so it can change." }, { name: "Uses const for the name", codeIncludes: "const\\s+\\w+\\s*=\\s*[\"'`]", message: "Store the creature name in a const string." }],
    hints: ["Start with `let damage = 0;`.", "Each hit is `damage = damage + amount;`.", "Print with `console.log(\"Total damage: \" + damage);`"],
    reveal: [{ title: "Declarations", code: `const creature = "Ogre";\nlet damage = 0;` }, { title: "Hits and output", code: `const creature = "Ogre";\nlet damage = 0;\ndamage = damage + 6;\ndamage = damage + 9;\nconsole.log("Total damage: " + damage);` }],
    solution: { code: `const creature = "Ogre";\nlet damage = 0;\ndamage = damage + 6;\ndamage = damage + 9;\nconsole.log("Total damage: " + damage);`, explanation: "A const for the fixed name, a let for the accumulating damage, two assignments, one print." },
    concepts: ["variables", "arithmetic"], criteria: ["The output is exactly `Total damage: 15`.", "Damage is a let; the name is a const string."] }),
  reinforces: ["t0-reading-code", "t0-reading-errors"], documentation: [DOCS.mdnJs],
  completion: { required: ["t1-variables-predict", "t1-variables-which-keyword", "t1-variables-find-fault"], checkpoint: true, criterion: "Predict a changing value, choose the right keyword, find a const reassignment, and pass the checkpoint." }
});
