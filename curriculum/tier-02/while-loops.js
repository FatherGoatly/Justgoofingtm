import { lesson, section, p, list, steps, tip, note, warn, danger, table, js, fvtt, mc, predict, identify, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t2-while-loops", tier: 2, topic: "Control flow and problem solving", title: "while loops and the art of stopping",
  summary: "Keep rolling until the total reaches the DC; keep drawing until the deck is empty. while loops repeat until a condition changes, which means the loop body must change it, or it never ends.",
  minutes: 25, difficulty: "beginner", category: "core-js", prerequisites: ["t2-for-of"], access: ACCESS.none,
  objectives: ["Write while loops with a clear termination condition", "Identify why a loop never ends and fix it", "Add a safety limit to open-ended loops", "Choose between for, for...of and while"],
  sections: [
    section("plain", "plain", "Repeat until", [
      p("Sometimes you do not know how many times to repeat. 'Keep attacking until the orc drops.' 'Keep rolling until you get a 6.' That is `while (condition) { ... }`: test the condition, run the body if it is true, test again, and so on. The loop ends the first time the test is false."),
      p("Which means the body has to *change something the test looks at*. If the test is `while (hp > 0)` and the body never lowers `hp`, the test is true forever and your browser tab freezes. That is an **infinite loop**, and it is the reason the academy's sandbox has a time limit: run one and you will see the sandbox stop it, which is far better than discovering it in Foundry."),
      p("Professionals add a safety counter to any loop whose end depends on data they do not fully control: `let guard = 0; while (condition && guard < 1000) { ...; guard++; }`.")
    ]),
    section("analogy", "analogy", "The player who will not stop rolling", [
      p("'Roll until you beat the DC' is fine if the DC is 15. If the DC is 25 and the player's best possible result is 24, they will roll forever. A good GM notices the impossible condition and says 'you cannot make this check'. A good program checks that the stopping condition can actually be reached, or counts attempts and gives up.")
    ]),
    section("technical", "technical", "while and do...while", [
      p("`while (c) body` evaluates `c` before each pass; the body may run zero times. `do body while (c);` runs the body once before testing, so at least one pass always happens: useful for 'ask until valid input'. Both support `break` and `continue`."),
      p("Termination reasoning: identify the variables in the condition, confirm the body moves at least one of them toward making the condition false on every pass, and consider what happens with extreme inputs (zero, negative, NaN: `while (hp > 0)` with hp = NaN ends immediately because NaN > 0 is false; `while (i !== 10)` with i stepping by 3 never ends).")
    ]),
    section("syntax", "syntax", "Shapes", [
      js(`let hp = 20;\nlet rounds = 0;\nwhile (hp > 0) {\n  hp -= 7;\n  rounds++;\n}\nconsole.log("Dropped after", rounds, "rounds");\nlet attempts = 0;\ndo {\n  attempts++;\n} while (attempts < 3);\nconsole.log("attempts:", attempts);`, { expectOutput: ["Dropped after 3 rounds", "attempts: 3"] })
    ]),
    section("example-minimal", "example-minimal", "Roll until success (simulated)", [
      js(`const dc = 15;\nconst modifier = 4;\nconst rolls = [8, 3, 12, 17];   // pretend d20 results\nlet attempt = 0;\nwhile (attempt < rolls.length && rolls[attempt] + modifier < dc) {\n  attempt++;\n}\nconsole.log(attempt < rolls.length ? \`Success on attempt \${attempt + 1}\` : "Never succeeded");`, { expectOutput: ["Success on attempt 3"] })
    ]),
    section("example-annotated", "example-annotated", "A guarded loop", [
      js(`function roundsToDrop(hp, damagePerRound) {\n  if (damagePerRound <= 0) return Infinity;   // can never drop\n  let rounds = 0;\n  let guard = 0;\n  while (hp > 0 && guard < 10000) {\n    hp -= damagePerRound;\n    rounds++;\n    guard++;\n  }\n  return rounds;\n}\nconsole.log(roundsToDrop(42, 8));\nconsole.log(roundsToDrop(42, 0));\nconsole.log(roundsToDrop(0, 8));`, { annotations: [{ line: 2, note: "Reason about termination up front: with zero damage the loop could never end, so refuse before entering it." }, { line: 5, note: "Two conditions: the real one and a guard. The guard is insurance against a mistake you have not thought of." }, { line: 6, note: "The body changes `hp`, the variable the condition tests. This is what makes the loop terminate." }, { line: 14, note: "hp starts at 0, so the body runs zero times: 0 rounds." }], expectOutput: ["6", "Infinity", "0"] })
    ]),
    section("incorrect", "incorrect", "The loop that never ends", [
      js(`let hp = 20;\nlet rounds = 0;\nwhile (hp > 0) {\n  rounds++;\n  const damage = 7;\n}\nconsole.log(rounds);`, { expectError: true, caption: "Run it. The sandbox stops it after its time limit; in a real browser the tab would hang." })
    ]),
    section("why-fails", "why-fails", "Why it never ends", [
      p("The condition tests `hp`. The body computes `damage` but never subtracts it from `hp`, so `hp` stays 20, `hp > 0` stays true, and the loop runs forever. The `rounds` counter grows without limit; nothing else changes."),
      p("In Foundry an infinite loop freezes the whole client, and the only exit is closing the tab, losing unsaved dialog input. This is why the sandbox exists for loop exercises and why guards are worth their two lines.")
    ]),
    section("corrected", "corrected", "Change what you test", [
      js(`let hp = 20;\nlet rounds = 0;\nwhile (hp > 0) {\n  rounds++;\n  const damage = 7;\n  hp -= damage;\n}\nconsole.log(rounds);`, { highlight: [6], expectOutput: ["3"] })
    ]),
    section("use-case", "use-case", "Where while loops appear in macros", [
      p("Genuinely open-ended repetition is rare in macros: most work is 'for each token'. `while` shows up when you search for something (walk up a folder tree until the root), retry until a condition holds (wait for the canvas to be ready, with a limit), or consume a queue. Always pair it with a guard."),
      fvtt(`// Draw a unique name from a list until one is not already used on the scene (guarded)\nconst candidates = ["Goblin Scout C", "Goblin Scout A", "Goblin Scout D"];\nconst used = new Set(canvas.tokens.placeables.map(t => t.name));\nlet index = 0;\nwhile (index < candidates.length && used.has(candidates[index])) {\n  index++;\n}\nconsole.log(index < candidates.length ? "Use: " + candidates[index] : "All candidate names are taken");`, { caption: "The condition includes the bound `index < candidates.length`, so even if every name is taken the loop ends." })
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["The body never changes the tested variable.", "Testing with `!==` and stepping past the target value.", "Forgetting that the test happens before the first pass (the body may not run at all).", "Using a while loop where for...of would say what you mean more clearly."])
    ]),
    section("debugging", "debugging", "When the sandbox says 'time limit'", [
      steps(["Find the while condition and list the variables in it.", "In the body, find the line that changes each of those variables. If there is none, that is the bug.", "Print the variable at the top of the body for a few passes: is it moving toward ending the loop?", "Add a guard counter while you investigate; remove it only if you can prove termination."])
    ]),
    section("summary", "summary", "Summary", [
      list(["`while` repeats until the condition is false; the body must change what the condition tests.", "`do...while` always runs once.", "Add a guard to open-ended loops.", "Prefer `for...of` for collections; use `while` for 'until'."])
    ])
  ],
  exercises: [
    predict({ id: "t2-while-predict", title: "Count the passes", prompt: "Predict the output.", code: `let n = 1;\nlet passes = 0;\nwhile (n < 50) {\n  n = n * 3;\n  passes++;\n}\nconsole.log(n, passes);`, answer: "81 4", explanation: "n: 3, 9, 27, 81 (four passes); the loop stops once n is 81 because 81 < 50 is false.", concepts: ["loops"], hints: ["Track n after each pass."] }),
    identify({ id: "t2-while-infinite", title: "Why does it hang?", prompt: "This loop never ends. Select the line that should change the tested variable but does not.", code: `let remaining = 10;\nlet drawn = 0;\nwhile (remaining > 0) {\n  drawn = drawn + 1;\n  console.log("drew a card");\n}\nconsole.log(drawn);`, answer: [4], explanation: "The body increments `drawn` but never decrements `remaining`, which the condition tests. Line 4 should be (or be followed by) `remaining--`.", concepts: ["loops", "infinite-loop"], hints: ["Which variable does the condition look at?"] }),
    mc({ id: "t2-while-choose", title: "Pick the loop", prompt: "Which task is the best fit for a while loop rather than for...of?", options: [["a", "Print every selected token's name"], ["b", "Keep splitting a treasure pile in half until each share is below 100 gp"], ["c", "Add up the hit points of an array of creatures"]], answer: "b", explanation: "The number of repetitions is unknown in advance and depends on a changing value: a while loop. The others iterate a known collection.", concepts: ["loops"], hints: ["Which task does not know how many repetitions it needs?"] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t2-while-q1", "A while loop's body never changes the variables in its condition. The loop:", [["a", "Runs once"], ["b", "Runs forever (if the condition starts true)"], ["c", "Throws an error"]], "b", "Nothing can make the condition false."),
    q("t2-while-q2", "`do { x++ } while (false);` runs the body:", [["a", "Zero times"], ["b", "Once"], ["c", "Forever"]], "b", "do...while tests after the first pass."),
    q("t2-while-q3", "What is a guard counter for?", [["a", "Counting results"], ["b", "Forcing a loop to stop after a maximum number of passes even if the real condition never becomes false"], ["c", "Making the loop faster"]], "b", "Insurance against termination mistakes.")
  ] },
  challenge: codeEx({ id: "t2-while-retry", type: "write-function", title: "attemptsUntil", prompt: "Write `attemptsUntil(rolls, modifier, dc, maxAttempts)`. Walk the `rolls` array in order (each is a d20 result) using a while loop; return the 1-based attempt number of the first roll where `roll + modifier >= dc`. Return `null` if no attempt succeeds within `maxAttempts` or before the rolls run out. The loop must be bounded by both limits.", runtime: "sandbox", starter: `function attemptsUntil(rolls, modifier, dc, maxAttempts) {\n\n}\n`,
    tests: [{ name: "Succeeds on the third roll", call: "attemptsUntil", args: [[8, 3, 12, 17], 4, 15, 10], expect: 3 }, { name: "Gives up at maxAttempts", call: "attemptsUntil", args: [[8, 3, 12, 17], 4, 15, 2], expect: null }, { name: "Runs out of rolls", call: "attemptsUntil", args: [[1, 2], 0, 30, 10], expect: null }, { name: "First roll succeeds", call: "attemptsUntil", args: [[20], 0, 10, 1], expect: 1 }, { name: "Uses a while loop", codeIncludes: "while\\s*\\(", message: "Use a while loop." }],
    hints: ["Use an index `i` starting at 0; the condition should include `i < rolls.length && i < maxAttempts`.", "Inside, check success; if so return `i + 1`; otherwise `i++`.", "After the loop, return null."],
    reveal: [{ title: "Bounded loop", code: `function attemptsUntil(rolls, modifier, dc, maxAttempts) {\n  let i = 0;\n  while (i < rolls.length && i < maxAttempts) {\n    // test rolls[i]\n    i++;\n  }\n  return null;\n}` }, { title: "Complete", code: `function attemptsUntil(rolls, modifier, dc, maxAttempts) {\n  let i = 0;\n  while (i < rolls.length && i < maxAttempts) {\n    if (rolls[i] + modifier >= dc) return i + 1;\n    i++;\n  }\n  return null;\n}` }],
    solution: { code: `function attemptsUntil(rolls, modifier, dc, maxAttempts) {\n  let i = 0;\n  while (i < rolls.length && i < maxAttempts) {\n    if (rolls[i] + modifier >= dc) return i + 1;\n    i++;\n  }\n  return null;\n}`, explanation: "Two bounds in the condition guarantee termination; the early return reports success; the fall-through reports failure honestly with null." },
    concepts: ["loops", "conditions", "validation"], criteria: ["All four cases return the expected value.", "A while loop with both bounds is used."] }),
  reinforces: ["t2-for-loops", "t1-conditions"], documentation: [DOCS.mdnJs],
  completion: { required: ["t2-while-predict", "t2-while-infinite", "t2-while-choose"], checkpoint: true, criterion: "Predict a while loop, find a missing update, choose the right loop, and pass the checkpoint." }
});
