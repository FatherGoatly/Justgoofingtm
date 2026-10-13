import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, identify, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t2-for-of", tier: 2, topic: "Control flow and problem solving", title: "for...of: visiting every item, and handling none",
  summary: "Find every creature below a health threshold. for...of walks a list item by item without an index, and the empty-collection case is where careful macros differ from careless ones.",
  minutes: 30, difficulty: "beginner", category: "core-js", prerequisites: ["t2-for-loops"], access: ACCESS.none,
  objectives: ["Iterate arrays (and Foundry collections) with for...of", "Build a filtered list inside a loop", "Use continue and break deliberately", "Handle empty collections explicitly and report them"],
  sections: [
    section("plain", "plain", "For each thing in the list", [
      p("Most loops do not care about the index. 'For each selected token, do X' wants the token, not its position. `for (const token of tokens) { ... }` gives you exactly that: one item per pass, no counter, no off-by-one possible. It works on arrays, on Foundry collections like `game.actors` and `actor.items`, on Sets, on strings."),
      p("Two keywords steer a loop from inside. `continue` skips the rest of this pass and moves to the next item ('this one does not qualify, next'). `break` stops the whole loop ('found it, stop looking')."),
      p("And the question every loop over a selection must answer: what if the list is empty? The loop simply does not run, which is correct, but then your macro says nothing, which is confusing. Check `if (!list.length)` first and tell the user what to do.")
    ]),
    section("analogy", "analogy", "Going round the table", [
      p("'Everyone below half health, raise your hand.' You go round the table, look at each sheet, and note the ones that qualify. You do not say 'player number three'; you look at each person in turn. If nobody is at the table, the sensible response is 'there is nobody here', not silence.")
    ]),
    section("technical", "technical", "Iterables", [
      p("`for...of` works on any iterable: arrays, strings, Sets, Maps (yielding `[key, value]` pairs), generators, and Foundry's `Collection` (which iterates values). Plain objects are not iterable; use `Object.entries(obj)` or `Object.keys(obj)`. `for...in` is a different statement that iterates property names and has surprising behaviour; avoid it for arrays."),
      p("Inside the loop, `const item` is a fresh binding per pass. Modifying the array you are iterating (removing items) causes skipped elements; build a new array instead. `break` and `continue` work as in counting loops. Loops can be nested; a `break` only exits the innermost one.")
    ]),
    section("syntax", "syntax", "Shapes", [
      js(`const names = ["Reginald", "Mirabel", "Tobias"];\nfor (const name of names) {\n  if (name.startsWith("M")) continue;   // skip Mirabel\n  console.log(name);\n}\nfor (const [index, name] of names.entries()) {\n  console.log(index + 1, name);         // index when you really need it\n}\nfor (const ch of "d20") {\n  if (ch === "2") break;                // stop at the first 2\n  console.log(ch);\n}`, { expectOutput: ["Reginald", "Tobias", "1 Reginald", "2 Mirabel", "3 Tobias", "d"] })
    ]),
    section("example-minimal", "example-minimal", "Below the threshold", [
      js(`const creatures = [{ name: "Goblin", hp: 2, max: 7 }, { name: "Orc", hp: 15, max: 42 }, { name: "Wolf", hp: 11, max: 11 }];\nconst wounded = [];\nfor (const c of creatures) {\n  if (c.hp <= c.max / 2) wounded.push(c.name);\n}\nconsole.log("Wounded:", wounded);`, { expectOutput: ["Wounded: [\"Goblin\", \"Orc\"]"] })
    ]),
    section("example-annotated", "example-annotated", "Filter, report, handle empty", [
      js(`function reportWounded(creatures) {\n  if (!creatures.length) {\n    return "No creatures to check.";\n  }\n  const wounded = [];\n  for (const c of creatures) {\n    if (c.hp > c.max / 2) continue;\n    wounded.push(\`\${c.name} (\${c.hp}/\${c.max})\`);\n  }\n  if (!wounded.length) return "Nobody is wounded.";\n  return "Wounded: " + wounded.join(", ");\n}\nconsole.log(reportWounded([]));\nconsole.log(reportWounded([{ name: "Wolf", hp: 11, max: 11 }]));\nconsole.log(reportWounded([{ name: "Goblin", hp: 2, max: 7 }, { name: "Orc", hp: 15, max: 42 }]));`, { annotations: [{ line: 2, note: "Empty input: say so and stop. This is a separate case from 'nobody qualifies'." }, { line: 7, note: "`continue` for the ones that do not qualify keeps the qualifying path unindented." }, { line: 10, note: "The second empty case: input existed but nothing matched." }, { line: 11, note: "`join` turns the array into one readable string." }], expectOutput: ["No creatures to check.", "Nobody is wounded.", "Wounded: Goblin (2/7), Orc (15/42)"] })
    ]),
    section("incorrect", "incorrect", "The silent empty run", [
      js(`const selected = [];   // nothing selected\nfor (const token of selected) {\n  console.log("Checking", token.name);\n}\nconsole.log("Done");`, { expectOutput: ["Done"], caption: "Correct and useless: the user sees 'Done' and nothing else." })
    ]),
    section("why-fails", "why-fails", "Why it is wrong", [
      p("There is no error. The loop body never ran because there was nothing to run it on. From the user's point of view, the macro 'did nothing', and they have no idea whether that means 'no targets', 'all fine' or 'broken'. A tool that cannot distinguish 'nothing to do' from 'done' will be distrusted."),
      p("Explicit empty handling is cheap: one `if` before the loop, with a message that says what the user should do differently.")
    ]),
    section("corrected", "corrected", "Say what happened", [
      js(`const selected = [];\nif (!selected.length) {\n  console.log("Nothing selected. Select one or more tokens and run again.");\n} else {\n  for (const token of selected) {\n    console.log("Checking", token.name);\n  }\n  console.log("Done");\n}`, { highlight: [2, 3], expectOutput: ["Nothing selected. Select one or more tokens and run again."] })
    ]),
    section("use-case", "use-case", "Wounded tokens on the scene", [
      fvtt(`const tokens = canvas.tokens.placeables;\nif (!tokens.length) {\n  ui.notifications.warn("There are no tokens on this scene.");\n} else {\n  const wounded = [];\n  for (const token of tokens) {\n    const hp = token.actor?.system?.attributes?.hp;\n    if (!hp) continue;                    // no actor or no HP data: skip\n    if (hp.value <= hp.max / 2) wounded.push(\`\${token.name} (\${hp.value}/\${hp.max})\`);\n  }\n  const text = wounded.length ? "Wounded: " + wounded.join(", ") : "Nobody is wounded.";\n  await ChatMessage.create({ content: text, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });\n}`, { caption: "Walks every token on the scene (not just selected ones), skips tokens without HP data, and whispers the result to the GM. Practice data: Mirabel, Orc War Chief and the Wolf qualify." })
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Using `for...in` on an array (iterates index strings, and sometimes more).", "Forgetting `of`: `for (const t in tokens)` compiles and gives you \"0\", \"1\".", "Mutating the list you are looping over.", "Treating 'empty input' and 'no matches' as the same case; they deserve different messages.", "Reporting per-item inside the loop when the user wanted one summary."])
    ]),
    section("debugging", "debugging", "Loop not doing anything?", [
      steps(["Print the list's length before the loop. Zero explains everything.", "Print each item at the top of the body to confirm the loop runs and what it sees.", "If every item is skipped by a `continue`, print the condition's inputs for one item."])
    ]),
    section("summary", "summary", "Summary", [
      list(["`for (const item of list)` visits each item; no index, no off-by-one.", "`continue` skips an item; `break` stops the loop.", "Collect matches into a new array and report once.", "Check for empty input first and say what to do."])
    ])
  ],
  exercises: [
    predict({ id: "t2-for-of-predict", title: "continue and break", prompt: "Predict the output.", code: `const rolls = [3, 18, 1, 20, 11];\nlet seen = 0;\nfor (const r of rolls) {\n  if (r < 5) continue;\n  if (r === 20) break;\n  seen += 1;\n  console.log("counted", r);\n}\nconsole.log("seen", seen);`, answer: "counted 18\nseen 1", explanation: "3 is skipped, 18 counted, 1 skipped, 20 breaks before counting, 11 never reached.", concepts: ["loops"], hints: ["continue skips; break ends the whole loop."] }),
    identify({ id: "t2-for-of-wrong-keyword", title: "in or of?", prompt: "This prints `0`, `1`, `2` instead of the names. Select the faulty line.", code: `const names = ["A", "B", "C"];\nfor (const n in names) {\n  console.log(n);\n}`, answer: [2], explanation: "`for...in` iterates property names (the indexes as strings). Use `for...of` for values.", concepts: ["loops"], hints: ["Which keyword iterates values?"] }),
    mc({ id: "t2-for-of-empty", title: "Two kinds of nothing", prompt: "A macro loops over selected tokens to list the wounded ones. Which pair of messages best handles the two 'nothing' cases?", options: [["a", "Silence for both"], ["b", "'Select some tokens first' when nothing is selected; 'Nobody is wounded' when none qualify"], ["c", "'Nobody is wounded' for both"]], answer: "b", explanation: "Empty input and no matches are different situations needing different advice.", concepts: ["empty-collections", "validation"], hints: ["What should the user do differently in each case?"] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t2-for-of-q1", "`for (const x of [])` runs its body how many times?", [["a", "Once"], ["b", "Zero times"], ["c", "It throws"]], "b", "No items, no passes."),
    q("t2-for-of-q2", "Which statement iterates a plain object's keys and values?", [["a", "`for (const [k, v] of Object.entries(obj))`"], ["b", "`for (const [k, v] of obj)`"], ["c", "`for (const v of obj.values)`"]], "a", "Plain objects are not iterable; Object.entries provides pairs."),
    q("t2-for-of-q3", "`break` inside a nested inner loop:", [["a", "Exits both loops"], ["b", "Exits only the inner loop"], ["c", "Is a syntax error"]], "b", "break affects the innermost enclosing loop.")
  ] },
  challenge: codeEx({ id: "t2-for-of-threshold", type: "write-function", title: "belowThreshold", prompt: "Write `belowThreshold(creatures, fraction)` that returns an array of the names of creatures whose `hp` is at or below `fraction * max` (for example fraction 0.5 means half). Skip creatures that have no `max` (undefined or 0). Return an empty array for empty input. Use for...of.", runtime: "sandbox", starter: `function belowThreshold(creatures, fraction) {\n\n}\n`,
    tests: [{ name: "Half health", call: "belowThreshold", args: [[{ name: "Goblin", hp: 2, max: 7 }, { name: "Orc", hp: 30, max: 42 }, { name: "Wolf", hp: 5, max: 11 }], 0.5], expect: ["Goblin", "Wolf"] }, { name: "Quarter health", call: "belowThreshold", args: [[{ name: "Goblin", hp: 2, max: 7 }, { name: "Wolf", hp: 5, max: 11 }], 0.25], expect: [] }, { name: "Skips creatures without max", call: "belowThreshold", args: [[{ name: "Ghost", hp: 0 }, { name: "Goblin", hp: 1, max: 7 }], 0.5], expect: ["Goblin"] }, { name: "Empty input", call: "belowThreshold", args: [[], 0.5], expect: [] }, { name: "Uses for...of", codeIncludes: "for\\s*\\(\\s*(const|let)\\s+\\w+\\s+of\\b", message: "Use a for...of loop." }],
    hints: ["Create an empty result array before the loop and push names into it.", "`if (!c.max) continue;` skips missing or zero max.", "The condition is `c.hp <= c.max * fraction`."],
    reveal: [{ title: "Skeleton", code: `function belowThreshold(creatures, fraction) {\n  const result = [];\n  for (const c of creatures) {\n    // skip invalid, test, push\n  }\n  return result;\n}` }, { title: "Complete", code: `function belowThreshold(creatures, fraction) {\n  const result = [];\n  for (const c of creatures) {\n    if (!c.max) continue;\n    if (c.hp <= c.max * fraction) result.push(c.name);\n  }\n  return result;\n}` }],
    solution: { code: `function belowThreshold(creatures, fraction) {\n  const result = [];\n  for (const c of creatures) {\n    if (!c.max) continue;\n    if (c.hp <= c.max * fraction) result.push(c.name);\n  }\n  return result;\n}`, explanation: "A guard with continue, a comparison, and a result array. The empty-input case needs no special code: the loop runs zero times and the empty array is returned." },
    concepts: ["loops", "conditions", "arrays", "empty-collections"], criteria: ["Each test returns the expected names.", "Invalid creatures are skipped.", "for...of is used."] }),
  reinforces: ["t2-for-loops", "t1-arrays-objects", "t1-conditions"], documentation: [DOCS.mdnArray],
  completion: { required: ["t2-for-of-predict", "t2-for-of-wrong-keyword", "t2-for-of-empty"], checkpoint: true, criterion: "Predict continue/break behaviour, spot for...in, handle two empty cases, and pass the checkpoint." }
});
