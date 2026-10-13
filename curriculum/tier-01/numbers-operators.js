import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, fill, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t1-numbers-operators", tier: 1, topic: "JavaScript foundations", title: "Calculating: numbers, operators and the 'valid but wrong' result",
  summary: "Compute an attack bonus, a modifier from an ability score, and a remaining-HP value. Learn operator precedence, Math helpers, comparisons, and how a calculation can be perfectly legal and still wrong.",
  minutes: 30, difficulty: "beginner", category: "core-js", prerequisites: ["t1-strings-templates"], access: ACCESS.none,
  objectives: ["Use + - * / % and understand precedence", "Use Math.floor, Math.max, Math.min and Math.round", "Compare values with === !== < <= > >=", "Catch a logic error in arithmetic by predicting the result by hand"],
  sections: [
    section("plain", "plain", "Arithmetic the computer is happy to get wrong", [
      p("Computers never make arithmetic mistakes. They make *your* arithmetic mistakes, perfectly, every time. If you tell one that an ability modifier is `score - 10 / 2`, it will faithfully compute 16 - 5 = 11 instead of (16 - 10) / 2 = 3, because division happens before subtraction unless you say otherwise with parentheses."),
      p("This lesson is about the handful of operators you need and the one habit that catches arithmetic logic errors: work one example by hand before trusting the code.")
    ]),
    section("analogy", "analogy", "Order of operations at the table", [
      p("'Take your Strength score, subtract 10, halve it, round down' is a procedure with an order. Done out of order (halve first, then subtract 10) you get a modifier of -2 for a Strength of 16. Every player would notice. The computer will not; it will print -2 with total confidence. Parentheses are how you tell the computer which step comes first, just as the rulebook does with commas and 'then'.")
    ]),
    section("technical", "technical", "Operators and precedence", [
      table(["Operator", "Meaning", "Example", "Result"], [["`+ -`", "add, subtract", "`7 - 2 + 1`", "6 (left to right)"], ["`* / %`", "multiply, divide, remainder", "`7 % 3`", "1"], ["`**`", "power", "`2 ** 3`", "8"], ["`( )`", "group first", "`(16 - 10) / 2`", "3"], ["`===`, `!==`", "equal / not equal (same type and value)", "`7 === \"7\"`", "false"], ["`< <= > >=`", "ordering", "`hp <= max / 2`", "true/false"]]),
      p("Precedence: parentheses, then `**`, then `* / %`, then `+ -`, then comparisons. When in doubt, add parentheses; they cost nothing and remove doubt for the next reader."),
      p("Useful `Math` helpers: `Math.floor(x)` rounds down, `Math.ceil(x)` up, `Math.round(x)` to nearest, `Math.max(a, b, ...)` and `Math.min(...)` pick the largest/smallest, `Math.abs(x)` removes the sign. Clamping a value between 0 and max is `Math.max(0, Math.min(max, value))`."),
      p("Always compare with `===` and `!==`. The two-character `==` converts types first (`0 == \"\"` is true) and causes bugs you will not enjoy.")
    ]),
    section("syntax", "syntax", "Shorthand assignments", [
      js(`let hp = 20;\nhp -= 8;   // same as hp = hp - 8\nhp += 3;   // hp = hp + 3\nhp *= 2;   // hp = hp * 2\nconsole.log(hp);`, { expectOutput: ["30"] }),
      p("`x++` and `x--` add or subtract one. They are fine in loop counters; elsewhere `x += 1` is clearer.")
    ]),
    section("example-minimal", "example-minimal", "Ability modifier", [
      js(`const strength = 16;\nconst modifier = Math.floor((strength - 10) / 2);\nconsole.log("STR modifier:", modifier);`, { expectOutput: ["STR modifier: 3"] })
    ]),
    section("example-annotated", "example-annotated", "Attack bonus and remaining HP", [
      js(`const strength = 16;\nconst proficiency = 2;\nconst modifier = Math.floor((strength - 10) / 2);\nconst attackBonus = modifier + proficiency;\nconst maxHP = 30;\nlet hp = 24;\nconst damage = 31;\nhp = Math.max(0, hp - damage);\nconsole.log(\`Attack bonus +\${attackBonus}; HP \${hp}/\${maxHP}\`);\nconsole.log("Below half?", hp <= maxHP / 2);`, { annotations: [{ line: 3, note: "Parentheses force the subtraction first, then the division, then floor: (16-10)/2 = 3." }, { line: 4, note: "3 + 2 = 5." }, { line: 8, note: "24 - 31 = -7, but HP cannot go below 0: Math.max picks the larger of 0 and -7." }, { line: 9, note: "Template literal; `+` inside the text is just a character." }, { line: 10, note: "A comparison produces a boolean; 0 <= 15 is true." }], expectOutput: ["Attack bonus +5; HP 0/30", "Below half? true"] })
    ]),
    section("incorrect", "incorrect", "Valid, confident, wrong", [
      js(`const dexterity = 14;\nconst modifier = dexterity - 10 / 2;\nconsole.log("DEX modifier:", modifier);`, { expectOutput: ["DEX modifier: 9"], caption: "Prints 9. A Dexterity of 14 should give +2." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("Division binds tighter than subtraction, so JavaScript computed `10 / 2 = 5` first and then `14 - 5 = 9`. The author meant `(14 - 10) / 2 = 2`. No error, no warning: the computer did what the expression said."),
      p("The defence is cheap: before trusting any formula, pick an input whose answer you know (Dexterity 14 is +2 in 5e) and check the program's output against it. If they disagree, the formula is wrong, however reasonable it looks.")
    ]),
    section("corrected", "corrected", "Parentheses and floor", [
      js(`const dexterity = 14;\nconst modifier = Math.floor((dexterity - 10) / 2);\nconsole.log("DEX modifier:", modifier);`, { highlight: [2], expectOutput: ["DEX modifier: 2"] }),
      note("Why `Math.floor`? Odd scores: (13 - 10) / 2 = 1.5, and the rules round down to +1. Without floor you would print 1.5. Check odd and negative cases too: a score of 9 gives -0.5, which floors to -1, the correct modifier.")
    ]),
    section("use-case", "use-case", "Reading real numbers", [
      p("In dnd5e the system already computes modifiers for you (`actor.system.abilities.str.mod`), which is a theme of Tier 5: use the system's numbers rather than recomputing rules. But GM utilities constantly do small arithmetic the system does not: splitting treasure, scaling an encounter, counting rounds."),
      fvtt(`const actor = canvas.tokens.controlled[0].actor;\nconst str = actor.system.abilities.str;\nconsole.log(\`\${actor.name}: STR \${str.value} (mod \${str.mod}), prof +\${actor.system.attributes.prof}\`);\nconsole.log("Computed mod matches system?", Math.floor((str.value - 10) / 2) === str.mod);`, { caption: "Practice data: Sir Reginald STR 16, mod 3, proficiency 3." })
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Trusting precedence instead of writing parentheses.", "Using `==` instead of `===`.", "Forgetting that `/` produces decimals: 7 / 2 is 3.5, not 3.", "Letting a value go negative or above its maximum; clamp with Math.max/Math.min.", "Testing only the 'normal' case. Test an odd score, a zero, a negative."])
    ]),
    section("debugging", "debugging", "Checking a formula", [
      steps(["Choose an input with a known answer (a 5e table value, a worked example).", "Print the intermediate values, not just the final one: `console.log(strength - 10, (strength - 10) / 2)`.", "Find the first intermediate value that differs from your hand calculation.", "Add parentheses or the missing Math helper at that step."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Precedence is real; parentheses remove doubt.", "`Math.floor`, `Math.max`, `Math.min` handle rounding and clamping.", "Compare with `===`; comparisons give booleans.", "A legal expression can be wrong. Check against a known case."])
    ])
  ],
  exercises: [
    predict({ id: "t1-numbers-predict", title: "Predict the arithmetic", prompt: "What are the four printed values?", code: `console.log(2 + 3 * 4);\nconsole.log((2 + 3) * 4);\nconsole.log(7 % 3);\nconsole.log(Math.floor(-0.5));`, answer: "14\n20\n1\n-1", explanation: "Multiplication first (14); parentheses first (20); remainder of 7/3 is 1; floor of -0.5 is -1 (floor goes toward negative infinity).", concepts: ["arithmetic"], hints: ["Precedence: * before +.", "Floor rounds down, even for negatives."] }),
    mc({ id: "t1-numbers-compare", title: "Below half?", prompt: "`maxHP` is 31 and `hp` is 15. Which expression is true and correctly means 'at or below half'?", options: [["a", "`hp <= maxHP / 2`"], ["b", "`hp < maxHP / 2`"], ["c", "`hp == \"15\"`"]], answer: "a", explanation: "31 / 2 = 15.5; 15 <= 15.5 is true. `<` would also be true here but excludes exactly-half. `==` with a string is a type-coercion trap.", concepts: ["arithmetic", "conditions"], hints: ["Compute maxHP / 2 first."] }),
    fill({ id: "t1-numbers-clamp", title: "Clamp the hit points", prompt: "Fill the blanks so hp can never go below 0 or above max.", code: `const max = 30;\nlet hp = 24;\nhp = hp - 40;\nhp = Math.____(0, Math.____(max, hp));\nconsole.log(hp);`, blanks: [["max"], ["min"]], explanation: "Math.min(max, hp) caps the top; Math.max(0, ...) caps the bottom.", concepts: ["arithmetic"], hints: ["The outer call must choose the larger of 0 and the value.", "The inner call must choose the smaller of max and the value."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t1-numbers-q1", "What is `10 - 2 * 3`?", [["a", "24"], ["b", "4"], ["c", "16"]], "b", "Multiplication first: 10 - 6 = 4."),
    q("t1-numbers-q2", "Which comparison should you use for equality in new code?", [["a", "`==`"], ["b", "`===`"], ["c", "`=`"]], "b", "=== compares value and type without conversion; = assigns."),
    q("t1-numbers-q3", "`Math.floor((9 - 10) / 2)` is:", [["a", "0"], ["b", "-0.5"], ["c", "-1"]], "c", "(9-10)/2 = -0.5, floor rounds down to -1."),
    q("t1-numbers-q4", "A formula prints a plausible number. How do you know it is right?", [["a", "If there is no error, it is right"], ["b", "Check it against an input with a known answer"], ["c", "Run it twice"]], "b", "Only comparison with a known case reveals arithmetic logic errors.")
  ] },
  challenge: codeEx({ id: "t1-numbers-modifier-fn", type: "write-function", title: "abilityModifier and attackBonus", prompt: "Write two functions. `abilityModifier(score)` returns the 5e modifier (floor((score - 10) / 2)). `attackBonus(score, proficiency)` returns the modifier plus proficiency. Both must work for odd and low scores.", runtime: "sandbox", starter: `function abilityModifier(score) {\n\n}\n\nfunction attackBonus(score, proficiency) {\n\n}\n`,
    tests: [{ name: "16 gives +3", call: "abilityModifier", args: [16], expect: 3 }, { name: "13 gives +1 (round down)", call: "abilityModifier", args: [13], expect: 1 }, { name: "9 gives -1", call: "abilityModifier", args: [9], expect: -1 }, { name: "attackBonus(16, 2) is 5", call: "attackBonus", args: [16, 2], expect: 5 }, { name: "attackBonus(8, 3) is 2", call: "attackBonus", args: [8, 3], expect: 2 }],
    hints: ["Parentheses around `score - 10` before dividing.", "`Math.floor` handles the odd scores.", "`attackBonus` can call `abilityModifier` instead of repeating the formula."],
    reveal: [{ title: "abilityModifier", code: `function abilityModifier(score) {\n  return Math.floor((score - 10) / 2);\n}` }, { title: "attackBonus reuses it", code: `function abilityModifier(score) {\n  return Math.floor((score - 10) / 2);\n}\n\nfunction attackBonus(score, proficiency) {\n  return abilityModifier(score) + proficiency;\n}` }],
    solution: { code: `function abilityModifier(score) {\n  return Math.floor((score - 10) / 2);\n}\n\nfunction attackBonus(score, proficiency) {\n  return abilityModifier(score) + proficiency;\n}`, explanation: "Parentheses and floor make the modifier right for every score; the second function reuses the first instead of duplicating the formula." },
    concepts: ["arithmetic", "functions"], criteria: ["All five test cases return the expected numbers."] }),
  reinforces: ["t1-variables", "t1-strings-templates"], documentation: [DOCS.mdnJs],
  completion: { required: ["t1-numbers-predict", "t1-numbers-compare", "t1-numbers-clamp"], checkpoint: true, criterion: "Predict precedence results, pick the right comparison, clamp a value, and pass the checkpoint." }
});
