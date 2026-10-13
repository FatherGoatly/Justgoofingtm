import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, identify, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t1-functions", tier: 1, topic: "JavaScript foundations", title: "Functions: naming a procedure so you can reuse it",
  summary: "A function packages steps under a name, takes inputs (parameters) and hands back a result (return value). It is how you stop copying the same five lines into every macro.",
  minutes: 35, difficulty: "beginner", category: "core-js", prerequisites: ["t1-arrays-objects"], access: ACCESS.none,
  objectives: ["Define functions with parameters and call them with arguments", "Return values and use them; distinguish return from console.log", "Write arrow functions for short helpers", "Refactor repeated code into a function"],
  sections: [
    section("plain", "plain", "A named recipe", [
      p("You have already used functions: `console.log`, `Math.floor`, `ChatMessage.create`. Someone wrote those steps once, gave them a name, and now you run them by name with parentheses. Writing your own is the same idea: `function abilityModifier(score) { return Math.floor((score - 10) / 2); }` names a procedure, declares what it needs (`score`), and says what it hands back (`return`)."),
      p("Two words to keep straight. **Parameters** are the names in the definition (`score`). **Arguments** are the actual values you pass when calling (`abilityModifier(16)`). Inside the call, `score` is 16."),
      p("And the distinction that confuses everyone at first: `return` sends a value back to the caller, so the caller can store or use it. `console.log` merely prints. A function that prints the modifier is useless to a macro that needs to add it to a roll.")
    ]),
    section("analogy", "analogy", "House rules", [
      p("'To resolve a fall: 1d6 per 10 feet, max 20d6, half on a successful Dexterity save.' Once written on the house-rules sheet, nobody re-explains it; you say 'resolve the fall from 30 feet' and get a number back. The rule is the function, '30 feet' is the argument, the number is the return value. If the rule only *said* the number aloud and did not write it on the sheet (console.log instead of return), you could not subtract it from hit points.")
    ]),
    section("technical", "technical", "Declarations, expressions, arrows", [
      p("A function declaration `function name(a, b) { ... }` is hoisted: it can be called from code above it. A function expression or arrow function assigned to a const (`const name = (a, b) => { ... }`) exists only after that line runs. Arrow functions with a single expression body return it implicitly: `const double = x => x * 2;`."),
      p("Calling with fewer arguments leaves the rest `undefined`; default values fill gaps: `function heal(actor, amount = 1) {}`. Extra arguments are ignored. A function with no `return` returns `undefined`. Execution of the function stops at the first `return` reached, which is why early returns make guard clauses tidy."),
      p("Functions can call other functions, including themselves. Keep each one doing a single, nameable job: `abilityModifier`, `isBloodied`, `describeHit`. If you struggle to name it, it is doing too much.")
    ]),
    section("syntax", "syntax", "Forms", [
      js(`function greet(name) {            // declaration\n  return "Hail, " + name + "!";\n}\nconst shout = text => text.toUpperCase();   // arrow, implicit return\nconst describe = (name, hp = 10) => {       // arrow with block body and a default\n  return \`\${name} (\${hp} HP)\`;\n};\nconsole.log(greet("Mirabel"));\nconsole.log(shout(greet("Tobias")));\nconsole.log(describe("Wolf"), describe("Orc", 42));`, { expectOutput: ["Hail, Mirabel!", "HAIL, TOBIAS!", "Wolf (10 HP) Orc (42 HP)"] })
    ]),
    section("example-minimal", "example-minimal", "Return versus print", [
      js(`function modifierPrinted(score) {\n  console.log(Math.floor((score - 10) / 2));\n}\nfunction modifierReturned(score) {\n  return Math.floor((score - 10) / 2);\n}\nconst a = modifierPrinted(16);\nconst b = modifierReturned(16);\nconsole.log("a =", a, "b =", b);`, { expectOutput: ["3", "a = undefined b = 3"], caption: "The printing version shows 3 but hands back nothing; `a` is undefined." })
    ]),
    section("example-annotated", "example-annotated", "Refactoring repetition", [
      js(`function healthStatus(hp, max) {\n  if (hp <= 0) return "down";\n  if (hp <= max / 2) return "bloodied";\n  return "healthy";\n}\nfunction report(name, hp, max) {\n  return \`\${name}: \${hp}/\${max} (\${healthStatus(hp, max)})\`;\n}\nconsole.log(report("Sir Reginald", 24, 30));\nconsole.log(report("Orc War Chief", 15, 42));\nconsole.log(report("Wolf", 0, 11));`, { annotations: [{ line: 1, note: "One job: classify health. Two parameters." }, { line: 2, note: "Early return: the function ends here when hp is 0 or less. No else needed." }, { line: 6, note: "A second function that *uses* the first. Composition." }, { line: 9, note: "Three calls, three different arguments, no repeated logic." }], expectOutput: ["Sir Reginald: 24/30 (healthy)", "Orc War Chief: 15/42 (bloodied)", "Wolf: 0/11 (down)"] })
    ]),
    section("incorrect", "incorrect", "Forgetting to return", [
      js(`function attackBonus(score, prof) {\n  const mod = Math.floor((score - 10) / 2);\n  mod + prof;\n}\nconst bonus = attackBonus(16, 2);\nconsole.log("Bonus:", bonus, "Total with roll 12:", 12 + bonus);`, { expectOutput: ["Bonus: undefined Total with roll 12: NaN"], caption: "No error. The attack total is NaN." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("Line 3 computes `mod + prof` and throws the result away: nothing stores or returns it. The function reaches its end and returns `undefined`. Then `12 + undefined` is `NaN`, which propagates into everything downstream. A single missing word (`return`) produced a silent, spreading corruption."),
      p("NaN in your output is a strong hint that something upstream returned undefined or that a string failed conversion.")
    ]),
    section("corrected", "corrected", "Return the value", [
      js(`function attackBonus(score, prof) {\n  const mod = Math.floor((score - 10) / 2);\n  return mod + prof;\n}\nconst bonus = attackBonus(16, 2);\nconsole.log("Bonus:", bonus, "Total with roll 12:", 12 + bonus);`, { highlight: [3], expectOutput: ["Bonus: 5 Total with roll 12: 17"] })
    ]),
    section("use-case", "use-case", "A helper inside a macro", [
      fvtt(`function describeToken(token) {\n  const hp = token.actor?.system?.attributes?.hp;\n  if (!hp) return \`\${token.name}: no hit point data\`;\n  const status = hp.value <= hp.max / 2 ? "bloodied" : "healthy";\n  return \`\${token.name}: \${hp.value}/\${hp.max} (\${status})\`;\n}\nfor (const token of canvas.tokens.controlled) {\n  console.log(describeToken(token));\n}`, { caption: "A function makes the loop body one readable line. `?.` is optional chaining: it stops with undefined instead of throwing when a piece is missing (Tier 6 covers it; here it is a safety belt)." })
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Forgetting `return`, or writing `return` on a line by itself followed by the value on the next line (returns undefined).", "Calling a function without parentheses: `const x = attackBonus;` stores the function itself, not a result.", "Reusing a parameter name for something else inside the function, which shadows it.", "Making one function do five jobs. Split it; name each part."])
    ]),
    section("debugging", "debugging", "Tracing a function", [
      steps(["Print at the top of the function: `console.log(\"attackBonus called with\", score, prof)`. If it never prints, the call never happened (missing parentheses?).", "Print just before `return`. If you see the value there but the caller gets undefined, the return is missing or on the wrong line.", "If the caller gets NaN, check each argument's type with `typeof`."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Define once, call many times; parameters in, return value out.", "`return` ends the function and hands back a value; `console.log` only prints.", "Arrow functions are compact for short helpers.", "Small, single-purpose, well-named functions are the unit of readable code."])
    ])
  ],
  exercises: [
    predict({ id: "t1-functions-predict", title: "Calls and returns", prompt: "Predict the output.", code: `function twice(n) {\n  return n * 2;\n}\nfunction announce(n) {\n  console.log("Got", n);\n}\nconst a = twice(4);\nconst b = announce(a);\nconsole.log(a, b);`, answer: "Got 8\n8 undefined", explanation: "twice returns 8. announce prints 'Got 8' and returns undefined, so b is undefined.", concepts: ["functions", "return-values"], hints: ["Which function has a return statement?"] }),
    identify({ id: "t1-functions-missing-return", title: "Where did the value go?", prompt: "`total` is undefined after this runs. Select the line responsible.", code: `function damageTotal(dice, bonus) {\n  const rolled = dice * 3;\n  const total = rolled + bonus;\n  console.log(total);\n}\nconst total = damageTotal(2, 4);`, answer: [4], explanation: "The function prints the total instead of returning it. Line 4 should be `return total;`.", concepts: ["functions", "return-values"], hints: ["Printing is not returning."] }),
    mc({ id: "t1-functions-arrow", title: "Equivalent arrow", prompt: "Which arrow function is equivalent to `function half(x) { return x / 2; }`?", options: [["a", "`const half = x => { x / 2; };`"], ["b", "`const half = x => x / 2;`"], ["c", "`const half = (x) => return x / 2;`"]], answer: "b", explanation: "An expression body returns implicitly. (a) has a block body with no return; (c) is a syntax error.", concepts: ["functions"], hints: ["A block body `{}` needs an explicit return."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t1-functions-q1", "In `function heal(actor, amount) {}` called as `heal(bob, 5)`, what is `amount`?", [["a", "A parameter, with value 5"], ["b", "An argument, with value bob"], ["c", "Undefined until returned"]], "a", "amount is the parameter name; 5 is the argument bound to it."),
    q("t1-functions-q2", "What does a function return if it has no return statement?", [["a", "null"], ["b", "undefined"], ["c", "The last computed value"]], "b", "No return means undefined."),
    q("t1-functions-q3", "`const f = describe;` versus `const f = describe();`", [["a", "Both call describe"], ["b", "The first stores the function; the second stores its result"], ["c", "The first is a syntax error"]], "b", "Parentheses call; without them you reference the function itself."),
    q("t1-functions-q4", "After `return`, the lines below it in the same function:", [["a", "Still run"], ["b", "Never run"], ["c", "Run only if the return value is falsy"]], "b", "return ends the function immediately.")
  ] },
  challenge: codeEx({ id: "t1-functions-helpers", type: "write-function", title: "Three small helpers", prompt: "Write `isBloodied(hp, max)` returning true when hp is at or below half of max; `clampHP(hp, max)` returning hp limited to the range 0..max; and `healthLine(name, hp, max)` returning `NAME: HP/MAX` followed by ` (bloodied)` when bloodied, using the other two helpers (clamp first, then test).", runtime: "sandbox", starter: `function isBloodied(hp, max) {\n\n}\n\nfunction clampHP(hp, max) {\n\n}\n\nfunction healthLine(name, hp, max) {\n\n}\n`,
    tests: [{ name: "isBloodied at exactly half", call: "isBloodied", args: [15, 30], expect: true }, { name: "isBloodied above half", call: "isBloodied", args: [16, 30], expect: false }, { name: "clampHP below zero", call: "clampHP", args: [-5, 30], expect: 0 }, { name: "clampHP above max", call: "clampHP", args: [40, 30], expect: 30 }, { name: "healthLine healthy", call: "healthLine", args: ["Mirabel", 20, 22], expect: "Mirabel: 20/22" }, { name: "healthLine bloodied and clamped", call: "healthLine", args: ["Wolf", -3, 11], expect: "Wolf: 0/11 (bloodied)" }],
    hints: ["`isBloodied` is one comparison: `hp <= max / 2`.", "`clampHP` is `Math.max(0, Math.min(max, hp))`.", "In `healthLine`, call clampHP first, store the result, then build the string with a conditional suffix."],
    reveal: [{ title: "The two numeric helpers", code: `function isBloodied(hp, max) {\n  return hp <= max / 2;\n}\n\nfunction clampHP(hp, max) {\n  return Math.max(0, Math.min(max, hp));\n}` }, { title: "Compose them", code: `function isBloodied(hp, max) {\n  return hp <= max / 2;\n}\n\nfunction clampHP(hp, max) {\n  return Math.max(0, Math.min(max, hp));\n}\n\nfunction healthLine(name, hp, max) {\n  const safe = clampHP(hp, max);\n  const suffix = isBloodied(safe, max) ? " (bloodied)" : "";\n  return \`\${name}: \${safe}/\${max}\${suffix}\`;\n}` }],
    solution: { code: `function isBloodied(hp, max) {\n  return hp <= max / 2;\n}\n\nfunction clampHP(hp, max) {\n  return Math.max(0, Math.min(max, hp));\n}\n\nfunction healthLine(name, hp, max) {\n  const safe = clampHP(hp, max);\n  const suffix = isBloodied(safe, max) ? " (bloodied)" : "";\n  return \`\${name}: \${safe}/\${max}\${suffix}\`;\n}`, explanation: "Each helper does one job and returns a value; the third composes the first two. This is the structure every later macro follows." },
    concepts: ["functions", "conditions", "arithmetic"], criteria: ["All six calls return the expected values.", "healthLine uses the other helpers (not re-checked, but the point of the exercise)."] }),
  reinforces: ["t1-numbers-operators", "t1-conditions"], documentation: [DOCS.mdnJs],
  completion: { required: ["t1-functions-predict", "t1-functions-missing-return", "t1-functions-arrow"], checkpoint: true, criterion: "Predict return values, find a missing return, recognise arrow syntax, and pass the checkpoint." }
});
