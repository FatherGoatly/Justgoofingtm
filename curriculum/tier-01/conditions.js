import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, identify, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t1-conditions", tier: 1, topic: "JavaScript foundations", title: "Making decisions: if, else and boolean logic",
  summary: "Is the creature below half health? Is a token selected AND owned? Conditions let a macro react to the situation instead of doing the same thing every time.",
  minutes: 35, difficulty: "beginner", category: "core-js", prerequisites: ["t1-numbers-operators"], access: ACCESS.none,
  objectives: ["Write if / else if / else chains", "Combine conditions with && (and), || (or) and ! (not)", "Explain truthy and falsy and why `if (array)` is a trap", "Choose a message based on a dice result"],
  sections: [
    section("plain", "plain", "Code that reacts", [
      p("So far every program did the same thing every run. Real GM tasks branch: if the creature is bloodied, say so; otherwise say it is unhurt. If no token is selected, complain instead of crashing. `if (condition) { ... } else { ... }` is how code asks a yes/no question and takes one path or the other."),
      p("Questions combine. 'Selected **and** owned' is `selected && owned`. 'Critical **or** fumble' is `roll === 20 || roll === 1`. '**Not** hidden' is `!hidden`. Each piece is a **boolean**: true or false."),
      p("JavaScript also lets you put non-booleans in a condition. Most values count as true (**truthy**); a short list count as false (**falsy**): `false`, `0`, `\"\"` (empty string), `null`, `undefined`, `NaN`. This is convenient (`if (!token)` reads as 'if there is no token') and dangerous (an empty array is truthy, so `if (tokens)` is true even with nothing selected).")
    ]),
    section("analogy", "analogy", "The flowchart in your head", [
      p("Resolving an attack is a flowchart. Natural 20? Critical hit. Otherwise, total meets AC? Hit. Otherwise, miss. You never consider 'miss' once you have found 'critical'. That is an `if / else if / else` chain: the first true branch wins and the rest are skipped."),
      p("'Does the rogue get sneak attack?' needs two things to be true at once (advantage, or an ally adjacent) and one thing false (not incapacitated). That is `&&`, `||` and `!` doing what the rules text does with 'and', 'or' and 'unless'.")
    ]),
    section("technical", "technical", "Branches and logical operators", [
      p("`if (c) A` runs A when `c` is truthy. `if (c) A else B` runs exactly one of A or B. `if (c1) A else if (c2) B else C` evaluates conditions in order and runs the first match only. Braces `{}` group multiple statements; use them even for one statement, to avoid dangling-else mistakes."),
      p("`a && b` is `a` if `a` is falsy, otherwise `b` (so with booleans it is 'and'). `a || b` is `a` if `a` is truthy, otherwise `b` ('or'). Both short-circuit: `token && token.name` never reads `.name` if `token` is undefined. `!a` flips truthiness to a real boolean. `a ?? b` is `b` only when `a` is `null` or `undefined` (not when it is 0 or \"\"), which Tier 6 uses heavily."),
      p("The ternary `c ? x : y` is an expression form of if/else: `const label = hp > 0 ? \"alive\" : \"down\";`. Fine for simple choices; do not nest them.")
    ]),
    section("syntax", "syntax", "Shapes", [
      js(`const roll = 20;\nif (roll === 20) {\n  console.log("Critical hit!");\n} else if (roll === 1) {\n  console.log("Fumble...");\n} else {\n  console.log("Roll:", roll);\n}\nconst adjacent = true, hasAdvantage = false, incapacitated = false;\nconst sneakAttack = (adjacent || hasAdvantage) && !incapacitated;\nconsole.log("Sneak attack?", sneakAttack);`, { expectOutput: ["Critical hit!", "Sneak attack? true"] }),
      table(["Falsy values", "Everything else is truthy, including"], [["`false`, `0`, `-0`, `\"\"`, `null`, `undefined`, `NaN`", "`[]`, `{}`, `\"0\"`, `\"false\"`, any object, any non-empty string"]])
    ]),
    section("example-minimal", "example-minimal", "Bloodied or not", [
      js(`const hp = 15, max = 42;\nif (hp <= max / 2) {\n  console.log("Bloodied");\n} else {\n  console.log("Unhurt-ish");\n}`, { expectOutput: ["Bloodied"] })
    ]),
    section("example-annotated", "example-annotated", "Three-way health report", [
      js(`const hp = 0, max = 30;\nlet status;\nif (hp <= 0) {\n  status = "down";\n} else if (hp <= max / 2) {\n  status = "bloodied";\n} else {\n  status = "healthy";\n}\nconsole.log(\`HP \${hp}/\${max}: \${status}\`);`, { annotations: [{ line: 2, note: "Declared with let and no value; each branch assigns it. (You could also use a const inside each branch and print there.)" }, { line: 3, note: "Checked first. 0 <= 0 is true, so this branch runs and the others are skipped, even though `0 <= 15` is also true." }, { line: 5, note: "Only reached when the first condition was false." }, { line: 7, note: "The catch-all. No condition: runs if nothing above matched." }], expectOutput: ["HP 0/30: down"] }),
      tip("Order matters in a chain. Put the most specific condition first (`hp <= 0` before `hp <= half`), or the general one swallows it.")
    ]),
    section("incorrect", "incorrect", "The empty selection that passes", [
      js(`const selected = [];   // nothing selected\nif (selected) {\n  console.log("Working on", selected.length, "tokens");\n} else {\n  console.log("Select a token first.");\n}`, { expectOutput: ["Working on 0 tokens"], caption: "The author expected the else branch." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("An array is an object, and every object is truthy, even an empty one. `if (selected)` asks 'does this array exist?' (yes), not 'does it contain anything?'. The right question is `if (selected.length > 0)` or, idiomatically, `if (selected.length)` (0 is falsy)."),
      p("The same trap bites with strings of whitespace (`\" \"` is truthy) and with the number 0 in `||` defaults: `const dmg = input || 10` turns a legitimate 0 into 10. Use `??` for 'only when missing'.")
    ]),
    section("corrected", "corrected", "Ask about the count", [
      js(`const selected = [];\nif (selected.length) {\n  console.log("Working on", selected.length, "tokens");\n} else {\n  console.log("Select a token first.");\n}`, { highlight: [2], expectOutput: ["Select a token first."] })
    ]),
    section("use-case", "use-case", "Guarding a Foundry macro", [
      fvtt(`const token = canvas.tokens.controlled[0];\nif (!token) {\n  ui.notifications.warn("Select a token first.");\n} else if (!token.actor) {\n  ui.notifications.warn(\`\${token.name} has no actor.\`);\n} else {\n  const hp = token.actor.system.attributes.hp;\n  const bloodied = hp.value <= hp.max / 2;\n  ui.notifications.info(\`\${token.name}: \${hp.value}/\${hp.max}\${bloodied ? " (bloodied)" : ""}\`);\n}`, { caption: "`!token` is the idiomatic 'no token' check: undefined is falsy. This exact shape opens almost every macro you will write." })
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["`if (hp = 0)` assigns instead of comparing. Use `===`.", "`if (tokens)` to test for an empty selection. Test `.length`.", "Writing `if (roll === 20 || 1)`: `1` is truthy, so this is always true. Each side of `||` must be a full comparison: `roll === 20 || roll === 1`.", "Forgetting the catch-all `else` when every case must produce a value, leaving a variable undefined.", "Chains in the wrong order, so a broad condition hides a narrow one."])
    ]),
    section("debugging", "debugging", "Which branch ran?", [
      steps(["Put a `console.log(\"branch A\")` at the top of each branch to see which one executed.", "Print the condition's pieces: `console.log(hp, max / 2, hp <= max / 2)`.", "If a condition is 'always true', check for `=` instead of `===` and for `|| 1`-style mistakes.", "If an `||` default swallowed a 0, replace it with `??`."])
    ]),
    section("summary", "summary", "Summary", [
      list(["`if / else if / else`: the first true condition wins.", "`&&`, `||`, `!` combine booleans and short-circuit.", "Falsy: false, 0, \"\", null, undefined, NaN. Arrays and objects are always truthy.", "Guard macros with `if (!token)` and `if (!list.length)`."])
    ])
  ],
  exercises: [
    predict({ id: "t1-conditions-predict", title: "Which branch?", prompt: "Predict the output.", code: `const roll = 20;\nconst modifier = 5;\nif (roll + modifier >= 25) {\n  console.log("Hit");\n} else if (roll === 20) {\n  console.log("Critical");\n} else {\n  console.log("Miss");\n}`, answer: "Hit", explanation: "The first condition (25 >= 25) is true, so its branch runs and the critical check is never reached. Order matters.", concepts: ["conditions"], hints: ["Evaluate the first condition first.", "Once a branch runs, the rest are skipped."] }),
    identify({ id: "t1-conditions-always-true", title: "Always true", prompt: "This program prints `Special!` for every roll. Select the faulty line.", code: `const roll = 7;\nif (roll === 20 || 1) {\n  console.log("Special!");\n} else {\n  console.log("Normal roll");\n}`, answer: [2], explanation: "`roll === 20 || 1` is `false || 1`, which is 1, which is truthy. Both sides of || need a comparison: `roll === 20 || roll === 1`.", concepts: ["conditions", "boolean-logic"], hints: ["What is the value of `1` as a condition?"] }),
    mc({ id: "t1-conditions-falsy", title: "Truthy or falsy?", prompt: "Which of these values are falsy? (Select all that apply.)", options: [["a", "`0`"], ["b", "`[]`"], ["c", "`\"\"`"], ["d", "`\"0\"`"], ["e", "`undefined`"]], answer: ["a", "c", "e"], explanation: "0, the empty string and undefined are falsy. An empty array and the string \"0\" are truthy.", concepts: ["conditions", "truthy-falsy"], hints: ["Only seven values are falsy; objects are never among them."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t1-conditions-q1", "In an if / else if / else chain, how many branches run?", [["a", "Every branch whose condition is true"], ["b", "Exactly one: the first true condition, or else"], ["c", "All of them"]], "b", "The chain stops at the first match."),
    q("t1-conditions-q2", "`const x = 0 || 10;` gives x = ?", [["a", "0"], ["b", "10"], ["c", "false"]], "b", "0 is falsy so || falls through to 10. Use ?? to keep a legitimate 0."),
    q("t1-conditions-q3", "What does `token && token.name` do when token is undefined?", [["a", "Throws a TypeError"], ["b", "Evaluates to undefined without reading .name"], ["c", "Evaluates to \"\""]], "b", "&& short-circuits on the falsy left side."),
    q("t1-conditions-q4", "Best test for 'nothing selected' given `const t = canvas.tokens.controlled;`?", [["a", "`if (!t)`"], ["b", "`if (!t.length)`"], ["c", "`if (t === [])`"]], "b", "Arrays are truthy; compare lengths. `t === []` is always false (different objects).")
  ] },
  challenge: codeEx({ id: "t1-conditions-describe-roll", type: "write-function", title: "describeRoll", prompt: "Write `describeRoll(roll, modifier, ac)` returning: `\"Critical hit!\"` when roll is 20; `\"Fumble!\"` when roll is 1; otherwise `\"Hit\"` when roll + modifier >= ac, else `\"Miss\"`. A natural 20 is a critical even if the total would miss, and a natural 1 is a fumble even if the total would hit.", runtime: "sandbox", starter: `function describeRoll(roll, modifier, ac) {\n\n}\n`,
    tests: [{ name: "Natural 20 is a critical", call: "describeRoll", args: [20, -5, 30], expect: "Critical hit!" }, { name: "Natural 1 is a fumble", call: "describeRoll", args: [1, 20, 5], expect: "Fumble!" }, { name: "Meets AC exactly", call: "describeRoll", args: [10, 5, 15], expect: "Hit" }, { name: "Below AC", call: "describeRoll", args: [10, 4, 15], expect: "Miss" }],
    hints: ["Check the natural 20 and natural 1 first, before the arithmetic.", "`roll + modifier >= ac` decides hit versus miss.", "Four branches: if, else if, else if, else."],
    reveal: [{ title: "Specific cases first", code: `function describeRoll(roll, modifier, ac) {\n  if (roll === 20) return "Critical hit!";\n  if (roll === 1) return "Fumble!";\n  // ...\n}` }, { title: "Then the arithmetic", code: `function describeRoll(roll, modifier, ac) {\n  if (roll === 20) return "Critical hit!";\n  if (roll === 1) return "Fumble!";\n  if (roll + modifier >= ac) return "Hit";\n  return "Miss";\n}` }],
    solution: { code: `function describeRoll(roll, modifier, ac) {\n  if (roll === 20) return "Critical hit!";\n  if (roll === 1) return "Fumble!";\n  if (roll + modifier >= ac) return "Hit";\n  return "Miss";\n}`, explanation: "Early returns make a chain without else: once a return happens, nothing after it runs. The specific natural-roll cases come before the general arithmetic." },
    concepts: ["conditions", "functions", "arithmetic"], criteria: ["All four cases return the expected text."] }),
  reinforces: ["t1-numbers-operators", "t1-variables"], documentation: [DOCS.mdnJs],
  completion: { required: ["t1-conditions-predict", "t1-conditions-always-true", "t1-conditions-falsy"], checkpoint: true, criterion: "Predict a branch, find an always-true condition, classify falsy values, and pass the checkpoint." }
});
