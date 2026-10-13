import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, identify, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t1-scope", tier: 1, topic: "JavaScript foundations", title: "Scope, naming and readable formatting",
  summary: "Where does a variable exist? Inside the braces that declared it. Scope explains a whole family of 'is not defined' errors, and consistent naming and formatting keep code readable when it grows.",
  minutes: 25, difficulty: "beginner", category: "core-js", prerequisites: ["t1-functions"], access: ACCESS.none,
  objectives: ["Explain block scope for let and const", "Predict which variable a name refers to when names are shadowed", "Recognise ReferenceErrors caused by scope", "Apply naming conventions and indentation consistently"],
  sections: [
    section("plain", "plain", "Variables live inside braces", [
      p("A variable declared with `let` or `const` exists only inside the nearest pair of braces around it: the function, the `if` block, the loop body. Step outside those braces and the name is gone, as if it never existed. That is **scope**. It is why a `total` declared inside a loop is reset every pass, and why a variable declared inside an `if` cannot be printed after the `if`."),
      p("Scopes nest. Code inside braces can see variables from the surrounding code, but not the other way round. A function can read a variable declared outside it (the macro's `token`, say), but the macro cannot read a variable declared inside the function."),
      p("Finally, readability. The computer does not care about indentation or names, but the next reader does, and the next reader is usually you, in two weeks, at 11pm before a session. Consistent indentation shows scope at a glance; consistent names say what things are.")
    ]),
    section("analogy", "analogy", "Table talk versus private notes", [
      p("What a player says at the table (the outer scope) everyone can use. What a player writes in their private notes during their turn (an inner scope) exists only during that turn; when it ends, the notes are gone. If the player wants a number to survive past their turn, they have to announce it at the table: declare it in the outer scope."),
      p("Shadowing is when a player's private note uses the same word as a table-wide fact ('AC' meaning their shield bonus, not the real Armour Class). Inside their notes the private meaning wins. Confusing for everyone: avoid reusing names.")
    ]),
    section("technical", "technical", "Block scope, function scope and the temporal dead zone", [
      p("`let` and `const` are block-scoped: visible from their declaration to the end of the enclosing `{}`. Function parameters are scoped to the function body. Each loop iteration of `for (let i ...)` gets a fresh `i`. Inner scopes may declare a name that exists in an outer scope (shadowing); the inner one wins inside its block."),
      p("Using a `let`/`const` before its declaration line, even inside its scope, throws `ReferenceError: Cannot access 'x' before initialization` (the temporal dead zone). Function declarations are hoisted and usable anywhere in their scope; function expressions assigned to `const` are not."),
      p("Macros run inside a function Foundry creates, so top-level variables in a macro are local to that run and vanish afterwards. To keep state between runs you need flags, settings or a module (Tier 6).")
    ]),
    section("syntax", "syntax", "Conventions worth adopting", [
      table(["Thing", "Convention", "Example"], [["Variables, functions", "camelCase, descriptive", "`remainingHitPoints`, `applyDamage`"], ["Booleans", "is/has/can prefix", "`isHidden`, `hasAdvantage`"], ["Constants that never change", "UPPER_SNAKE (optional)", "`const MAX_TARGETS = 8;`"], ["Classes", "PascalCase", "`EncounterTracker`"], ["Indentation", "2 spaces per block level", "see examples"], ["Braces", "always, even for one statement", "`if (x) { ... }`"]]),
      p("Pick a style and keep it. Foundry's own code uses 2-space indentation and camelCase; matching it makes reading core code easier.")
    ]),
    section("example-minimal", "example-minimal", "Inside and outside", [
      js(`const outer = "visible everywhere below";\nif (true) {\n  const inner = "visible only in this block";\n  console.log(outer, "/", inner);\n}\nconsole.log(typeof inner);   // "undefined": the name does not exist here`, { expectOutput: ["visible everywhere below / visible only in this block", "undefined"] })
    ]),
    section("example-annotated", "example-annotated", "Shadowing and loop scope", [
      js(`let damage = 10;\nfunction halve(damage) {\n  damage = damage / 2;\n  return damage;\n}\nconsole.log(halve(damage), damage);\nfor (let i = 0; i < 2; i++) {\n  const label = "pass " + i;\n  console.log(label);\n}\nconsole.log(typeof label, typeof i);`, { annotations: [{ line: 2, note: "The parameter `damage` shadows the outer `damage` inside the function." }, { line: 3, note: "Changes the parameter only. The outer variable is untouched." }, { line: 6, note: "halve returns 5; the outer damage is still 10." }, { line: 8, note: "`label` is created fresh each pass and dies at the closing brace." }, { line: 11, note: "Neither name exists out here." }], expectOutput: ["5 10", "pass 0", "pass 1", "undefined undefined"] })
    ]),
    section("incorrect", "incorrect", "Declared in the wrong block", [
      js(`const token = { name: "Goblin", hp: 7 };\nif (token.hp > 0) {\n  const status = "alive";\n}\nconsole.log(token.name, "is", status);`, { expectError: true, caption: "`ReferenceError: status is not defined`." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("`status` was declared inside the `if` block, so it exists only there. Line 5 is outside the block; to that line, `status` was never declared. The fix is to declare the variable where every line that needs it can see it: before the `if`, with `let`, and assign inside."),
      p("The same shape explains the Tier 0 broken macro about scope: a `let total` inside a loop body never survives to the line after the loop.")
    ]),
    section("corrected", "corrected", "Declare in the outer scope", [
      js(`const token = { name: "Goblin", hp: 7 };\nlet status = "down";\nif (token.hp > 0) {\n  status = "alive";\n}\nconsole.log(token.name, "is", status);`, { highlight: [2, 4], expectOutput: ["Goblin is alive"] })
    ]),
    section("use-case", "use-case", "Why macro variables vanish", [
      fvtt(`let runCount = 0;        // a new runCount every time the macro runs\nrunCount += 1;\nconsole.log("This macro has run", runCount, "time(s) this run... always 1");\n// To remember across runs you need persistent storage, e.g. a flag:\nconst previous = game.user.getFlag("gm-macro-academy", "runCount") ?? 0;\nawait game.user.setFlag("gm-macro-academy", "runCount", previous + 1);\nconsole.log("Stored count is now", previous + 1);`, { caption: "The first count is always 1 because each run is a fresh scope. The flag persists on the User document. (In preview the flag write is recorded, not saved.)" })
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Declaring an accumulator inside the loop it is supposed to accumulate across.", "Expecting a variable from one macro run to exist in the next.", "Shadowing an outer name accidentally and then wondering why the outer value did not change.", "Inconsistent indentation that hides which brace closes which block."])
    ]),
    section("debugging", "debugging", "Scope errors", [
      steps(["`is not defined`: find the declaration. Is it inside braces that have already closed? Move it outward.", "`Cannot access before initialization`: the declaration is below the use. Move it up.", "A value 'did not change': are there two variables with the same name (parameter and outer)? Rename one.", "Re-indent the code. Mismatched braces often become obvious."])
    ]),
    section("summary", "summary", "Summary", [
      list(["let/const live inside the nearest braces; inner scopes see outer ones, not vice versa.", "Shadowing makes an inner name hide an outer one; avoid it.", "Macro runs are fresh scopes; persistence needs flags or settings.", "camelCase names, 2-space indentation, braces always."])
    ])
  ],
  exercises: [
    predict({ id: "t1-scope-predict", title: "Which value?", prompt: "Predict the output.", code: `let x = 1;\nfunction f() {\n  let x = 2;\n  return x;\n}\nconsole.log(f(), x);\nif (true) {\n  x = 3;\n}\nconsole.log(x);`, answer: "2 1\n3", explanation: "The inner `let x` shadows the outer one inside f (returns 2; outer still 1). The if block assigns to the outer x without redeclaring it, so it becomes 3.", concepts: ["scope"], hints: ["A `let` inside a function creates a new variable.", "Assignment without let/const changes the existing outer variable."] }),
    identify({ id: "t1-scope-find", title: "Out of reach", prompt: "This throws `ReferenceError: bonus is not defined`. Select the line where `bonus` is declared in the wrong scope.", code: `function computeBonus(level) {\n  const bonus = Math.ceil(level / 4) + 1;\n  return bonus;\n}\ncomputeBonus(5);\nconsole.log("Proficiency:", bonus);`, answer: [2], explanation: "`bonus` is local to computeBonus. The caller must store the returned value: `const bonus = computeBonus(5);`.", concepts: ["scope", "functions"], hints: ["Where would the caller get the value from?"] }),
    mc({ id: "t1-scope-persist", title: "Remembering between runs", prompt: "A GM wants a macro to count how many times it has been clicked tonight. Which approach works?", options: [["a", "`let clicks = 0; clicks++;` at the top of the macro"], ["b", "Store the count in a flag or setting and read it back each run"], ["c", "Declare `clicks` with `const` so it cannot reset"]], answer: "b", explanation: "Each run is a fresh scope; only persistent storage (flags, settings, documents) survives.", concepts: ["scope", "persistence"], hints: ["What happens to macro variables when the macro finishes?"] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t1-scope-q1", "A `const` declared inside a for loop body:", [["a", "Exists for the whole program"], ["b", "Is created fresh on each pass and gone after the loop"], ["c", "Causes an error on the second pass"]], "b", "Block scope per iteration."),
    q("t1-scope-q2", "A function parameter named the same as an outer variable:", [["a", "Shadows the outer one inside the function"], ["b", "Changes the outer one"], ["c", "Is a syntax error"]], "a", "Shadowing: the inner name wins inside its scope."),
    q("t1-scope-q3", "Which naming follows the conventions used by Foundry's code?", [["a", "`Remaining_hit_points`"], ["b", "`remainingHitPoints`"], ["c", "`REMAININGHITPOINTS`"]], "b", "camelCase for variables.")
  ] },
  challenge: codeEx({ id: "t1-scope-repair", type: "repair-code", title: "Fix the scoping", prompt: "This program should print `Mirabel: 3 spells prepared` and then `Total prepared: 5`. It has two scope mistakes. Repair them without changing the output format.", runtime: "sandbox",
    starter: `const casters = [["Mirabel", 3], ["Tobias", 2]];\nfor (const caster of casters) {\n  let total = 0;\n  const name = caster[0];\n  const prepared = caster[1];\n  total = total + prepared;\n}\nconsole.log(name + ": " + 3 + " spells prepared");\nconsole.log("Total prepared: " + total);`,
    tests: [{ name: "Prints Mirabel's line", outputIncludes: "Mirabel: 3 spells prepared" }, { name: "Prints the correct total", outputIncludes: "Total prepared: 5" }, { name: "Runs without errors", expectNoError: true }],
    hints: ["`total` must be declared before the loop so it survives it.", "`name` only exists inside the loop; print Mirabel's line inside the loop (or capture the first caster before the loop).", "Keep the two output lines exactly as specified."],
    reveal: [{ title: "Move total out", code: `const casters = [["Mirabel", 3], ["Tobias", 2]];\nlet total = 0;\nfor (const caster of casters) {\n  const name = caster[0];\n  const prepared = caster[1];\n  total = total + prepared;\n}\nconsole.log("Total prepared: " + total);` }, { title: "Print inside the scope where name exists", code: `const casters = [["Mirabel", 3], ["Tobias", 2]];\nlet total = 0;\nfor (const caster of casters) {\n  const name = caster[0];\n  const prepared = caster[1];\n  total = total + prepared;\n  if (name === "Mirabel") console.log(name + ": " + prepared + " spells prepared");\n}\nconsole.log("Total prepared: " + total);` }],
    solution: { code: `const casters = [["Mirabel", 3], ["Tobias", 2]];\nlet total = 0;\nfor (const caster of casters) {\n  const name = caster[0];\n  const prepared = caster[1];\n  total = total + prepared;\n  if (name === "Mirabel") console.log(name + ": " + prepared + " spells prepared");\n}\nconsole.log("Total prepared: " + total);`, explanation: "The accumulator moves to the outer scope; the per-caster line is printed where `name` exists. Variables belong in the narrowest scope that every user of them can see." },
    concepts: ["scope", "loops", "variables"], criteria: ["Both lines are printed.", "No ReferenceError."] }),
  reinforces: ["t1-functions", "t1-variables"], documentation: [DOCS.mdnJs],
  completion: { required: ["t1-scope-predict", "t1-scope-find", "t1-scope-persist"], checkpoint: true, criterion: "Predict shadowed values, find an out-of-scope use, know how to persist state, and pass the checkpoint." }
});
