import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, identify, fill, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t2-for-loops", tier: 2, topic: "Control flow and problem solving", title: "Repeating with for loops: counting and totals",
  summary: "Count all selected tokens, add up a group's hit points, print a numbered list. The counting for loop repeats a block a known number of times, and the off-by-one error is its classic trap.",
  minutes: 30, difficulty: "beginner", category: "core-js", prerequisites: ["t1-combat-helper"], access: ACCESS.none,
  objectives: ["Write a counting for loop with initialiser, condition and step", "Accumulate a total across iterations", "Explain and avoid off-by-one errors", "Use the loop index to number output"],
  sections: [
    section("plain", "plain", "Do this, N times", [
      p("Programs become useful when they repeat. 'For each of the four goblins, roll initiative' is a loop. The classic counting loop reads: `for (let i = 0; i < 4; i++) { ... }`. Three parts in the parentheses: start a counter at 0; keep going while the counter is below 4; add one after each pass. The block runs for i = 0, 1, 2, 3: four times."),
      p("Counting from zero feels odd until you remember arrays start at index 0. `for (let i = 0; i < list.length; i++)` visits every index exactly once. Write `<=` instead of `<` and you visit one index too many, reading `undefined` off the end: the **off-by-one error**, the most common loop bug in existence."),
      p("A loop often **accumulates**: a `let total = 0` declared *before* the loop, with `total += something` inside. Declare it outside, or (as you saw in Tier 1 scope) it resets every pass.")
    ]),
    section("analogy", "analogy", "Rolling initiative for the goblin pack", [
      p("'Four goblins; for each, roll a d20 and write it down.' You keep a count on your fingers: first goblin, second, third, fourth, stop. If you absent-mindedly roll a fifth time, you have invented a goblin: that is `<=` where `<` belonged. If you add each roll to a running total on a scrap of paper, that paper is the accumulator, and it has to exist before the first roll.")
    ]),
    section("technical", "technical", "The for statement", [
      p("`for (init; condition; update) body`. `init` runs once. Before each pass the `condition` is evaluated; if falsy the loop ends. After each pass `update` runs. With `let i` in the init, each iteration gets its own `i` binding (which matters for closures later). `break` exits the loop immediately; `continue` skips to the next iteration."),
      p("Loops nest: a loop inside a loop runs the inner one completely for each outer pass (rows and columns, each attacker versus each target). Keep the index names distinct (`i`, `j`) and consider extracting the inner loop into a function for readability.")
    ]),
    section("syntax", "syntax", "The three clauses", [
      js(`for (let i = 1; i <= 3; i++) {\n  console.log("Round", i);\n}\nlet total = 0;\nfor (let i = 0; i < 4; i++) {\n  total += 5;\n}\nconsole.log("Total:", total);`, { expectOutput: ["Round 1", "Round 2", "Round 3", "Total: 20"] }),
      p("Counting from 1 with `<=` is fine when you want human numbering (rounds); counting from 0 with `<` is right when indexing arrays. Mixing the two conventions is how off-by-one errors are born.")
    ]),
    section("example-minimal", "example-minimal", "Summing hit points", [
      js(`const hitPoints = [24, 9, 7, 15];\nlet total = 0;\nfor (let i = 0; i < hitPoints.length; i++) {\n  total += hitPoints[i];\n}\nconsole.log("Group HP:", total);`, { expectOutput: ["Group HP: 55"] })
    ]),
    section("example-annotated", "example-annotated", "Numbered roster with a running total", [
      js(`const party = ["Reginald", "Mirabel", "Tobias"];\nconst hp = [24, 9, 18];\nlet total = 0;\nfor (let i = 0; i < party.length; i++) {\n  total += hp[i];\n  console.log(\`\${i + 1}. \${party[i]} (\${hp[i]} HP)\`);\n}\nconsole.log(\`Party total: \${total} across \${party.length} members\`);`, { annotations: [{ line: 3, note: "Accumulator declared once, outside the loop." }, { line: 4, note: "i runs 0, 1, 2. `party.length` is 3, and `i < 3` stops exactly after index 2." }, { line: 5, note: "Add this member's HP to the running total." }, { line: 6, note: "Humans count from 1, so print `i + 1` while still indexing with `i`." }], expectOutput: ["1. Reginald (24 HP)", "2. Mirabel (9 HP)", "3. Tobias (18 HP)", "Party total: 51 across 3 members"] })
    ]),
    section("incorrect", "incorrect", "One too many", [
      js(`const hp = [24, 9, 18];\nlet total = 0;\nfor (let i = 0; i <= hp.length; i++) {\n  total += hp[i];\n}\nconsole.log("Total:", total);`, { expectOutput: ["Total: NaN"], caption: "The total is NaN. Nothing threw." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("`i <= hp.length` lets i reach 3, and `hp[3]` is `undefined`. `total += undefined` makes `total` NaN, and NaN stays NaN no matter what you add afterwards. The loop ran four times for a three-item list: off by one."),
      p("Arrays make this silent; with a Foundry Collection or a document list the extra pass usually throws `Cannot read properties of undefined` instead, which is actually kinder.")
    ]),
    section("corrected", "corrected", "Strictly less than", [
      js(`const hp = [24, 9, 18];\nlet total = 0;\nfor (let i = 0; i < hp.length; i++) {\n  total += hp[i];\n}\nconsole.log("Total:", total);`, { highlight: [3], expectOutput: ["Total: 51"] })
    ]),
    section("use-case", "use-case", "Counting selected tokens", [
      fvtt(`const tokens = canvas.tokens.controlled;\nlet totalHP = 0;\nfor (let i = 0; i < tokens.length; i++) {\n  const hp = tokens[i].actor.system.attributes.hp.value;\n  totalHP += hp;\n  console.log(\`\${i + 1}. \${tokens[i].name}: \${hp} HP\`);\n}\nui.notifications.info(\`\${tokens.length} token(s) selected, \${totalHP} HP in total.\`);`, { caption: "Practice data: two controlled tokens, 24 + 9 = 33 HP." }),
      note("The next lesson shows `for...of`, which visits each item without an index and makes off-by-one errors impossible. Counting loops remain the right tool when you need the index or a fixed number of repetitions.")
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["`<=` with `.length`.", "Declaring the accumulator inside the loop.", "Changing the array's length inside a loop over it (removing items while iterating skips elements).", "Using `i` after the loop: with `let`, it no longer exists.", "Forgetting the update clause, which makes an infinite loop (next lesson)."])
    ]),
    section("debugging", "debugging", "Watching the counter", [
      steps(["Print `i` at the top of the body. The sequence should be 0, 1, ..., length-1.", "Print the accumulator at the end of each pass. The first NaN or wrong value tells you which pass went wrong.", "Check the three clauses separately: start value, stop condition, step."])
    ]),
    section("summary", "summary", "Summary", [
      list(["`for (let i = 0; i < n; i++)` runs n times with i from 0 to n-1.", "Declare accumulators before the loop.", "`<` versus `<=` is the off-by-one line.", "Print `i + 1` for humans, index with `i`."])
    ])
  ],
  exercises: [
    predict({ id: "t2-for-loops-predict", title: "How many passes?", prompt: "Predict the output.", code: `let count = 0;\nlet sum = 0;\nfor (let i = 2; i <= 6; i += 2) {\n  count++;\n  sum += i;\n}\nconsole.log(count, sum);`, answer: "3 12", explanation: "i takes 2, 4, 6 (three passes); their sum is 12.", concepts: ["loops"], hints: ["List each value of i."] }),
    identify({ id: "t2-for-loops-offbyone", title: "Find the off-by-one", prompt: "This prints `undefined` as the last name. Select the faulty line.", code: `const names = ["A", "B", "C"];\nfor (let i = 0; i <= names.length; i++) {\n  console.log(names[i]);\n}`, answer: [2], explanation: "`<=` lets i reach 3; names[3] is undefined. Use `<`.", concepts: ["loops", "off-by-one"], hints: ["How many times does the body run for three names?"] }),
    fill({ id: "t2-for-loops-fill", title: "Complete the total", prompt: "Fill the blanks so the program prints `Damage dealt: 21`.", code: `const hits = [7, 5, 9];\nlet total = ____;\nfor (let i = 0; i ____ hits.length; i++) {\n  total ____ hits[i];\n}\nconsole.log("Damage dealt: " + total);`, blanks: [["0"], ["<"], ["+="]], explanation: "Start at 0, stop before length, add each hit.", concepts: ["loops", "variables"], hints: ["The accumulator starts empty.", "Strictly less than the length."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t2-for-loops-q1", "How many times does `for (let i = 0; i < 5; i++)` run its body?", [["a", "4"], ["b", "5"], ["c", "6"]], "b", "i = 0,1,2,3,4: five passes."),
    q("t2-for-loops-q2", "Where should `let total = 0;` go?", [["a", "Inside the loop body"], ["b", "Before the loop"], ["c", "After the loop"]], "b", "An accumulator must outlive every iteration."),
    q("t2-for-loops-q3", "`arr[arr.length]` is:", [["a", "The last item"], ["b", "undefined"], ["c", "An error"]], "b", "Valid indexes end at length - 1.")
  ] },
  challenge: codeEx({ id: "t2-for-loops-stats", type: "write-function", title: "groupStats", prompt: "Write `groupStats(hitPoints)` that takes an array of numbers and returns `{ count, total, highest, lowest }`. For an empty array return `{ count: 0, total: 0, highest: null, lowest: null }`. Use a counting for loop (not reduce/Math.max on spread; those come next lesson).", runtime: "sandbox", starter: `function groupStats(hitPoints) {\n\n}\n`,
    tests: [{ name: "Four values", call: "groupStats", args: [[24, 9, 7, 15]], expect: { count: 4, total: 55, highest: 24, lowest: 7 } }, { name: "Empty", call: "groupStats", args: [[]], expect: { count: 0, total: 0, highest: null, lowest: null } }, { name: "Single", call: "groupStats", args: [[3]], expect: { count: 1, total: 3, highest: 3, lowest: 3 } }, { name: "Uses a for loop", codeIncludes: "for\\s*\\(", message: "Use a counting for loop." }],
    hints: ["Start highest and lowest at `null`; on each pass, if highest is null or the value is greater, replace it.", "total starts at 0 and gets `+= hitPoints[i]`.", "count is simply `hitPoints.length`."],
    reveal: [{ title: "Accumulators", code: `function groupStats(hitPoints) {\n  let total = 0;\n  let highest = null;\n  let lowest = null;\n  for (let i = 0; i < hitPoints.length; i++) {\n    const v = hitPoints[i];\n    total += v;\n    // highest / lowest ...\n  }\n  return { count: hitPoints.length, total, highest, lowest };\n}` }, { title: "Complete", code: `function groupStats(hitPoints) {\n  let total = 0;\n  let highest = null;\n  let lowest = null;\n  for (let i = 0; i < hitPoints.length; i++) {\n    const v = hitPoints[i];\n    total += v;\n    if (highest === null || v > highest) highest = v;\n    if (lowest === null || v < lowest) lowest = v;\n  }\n  return { count: hitPoints.length, total, highest, lowest };\n}` }],
    solution: { code: `function groupStats(hitPoints) {\n  let total = 0;\n  let highest = null;\n  let lowest = null;\n  for (let i = 0; i < hitPoints.length; i++) {\n    const v = hitPoints[i];\n    total += v;\n    if (highest === null || v > highest) highest = v;\n    if (lowest === null || v < lowest) lowest = v;\n  }\n  return { count: hitPoints.length, total, highest, lowest };\n}`, explanation: "Three accumulators, one loop, null sentinels for the empty case. The `null` checks let the first value initialise highest and lowest without special-casing index 0." },
    concepts: ["loops", "variables", "conditions", "empty-collections"], criteria: ["All three inputs return the expected objects.", "A for loop is used."] }),
  reinforces: ["t1-variables", "t1-arrays-objects", "t1-conditions"], documentation: [DOCS.mdnJs],
  completion: { required: ["t2-for-loops-predict", "t2-for-loops-offbyone", "t2-for-loops-fill"], checkpoint: true, criterion: "Predict loop passes, spot an off-by-one, complete an accumulator, and pass the checkpoint." }
});
