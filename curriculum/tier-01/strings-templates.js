import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, mc, predict, fill, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t1-strings-templates", tier: 1, topic: "JavaScript foundations", title: "Building messages: strings, template literals and conversion",
  summary: "Chat messages are strings. Learn to join text and values, use template literals with ${}, and convert between text and numbers without the classic '7' + 1 = '71' trap.",
  minutes: 30, difficulty: "beginner", category: "core-js", prerequisites: ["t1-variables"], access: ACCESS.none,
  objectives: ["Join strings and values with + and with template literals", "Use string methods: length, toUpperCase, includes, trim", "Convert text to numbers with Number() and check the result", "Explain why \"7\" + 1 is \"71\""],
  sections: [
    section("plain", "plain", "Text is a value too", [
      p("Almost everything a GM macro produces is text: a chat line, a notification, a label. A **string** is text as a value, written between quotes. You can glue strings together with `+`, and you can put a variable's value inside text. The modern way is the **template literal**: text between backticks where `${expression}` is replaced by the expression's value."),
      p("The trap every beginner falls into: `+` means 'add' for numbers but 'join' for strings. `\"7\" + 1` is `\"71\"`, because when either side is a string, JavaScript joins. Input from dialogs always arrives as a string, so a damage macro that forgets to convert will 'add' 10 damage to 24 HP and get `\"2410\"`. `Number(text)` converts text to a number; if the text is not numeric you get `NaN` (not a number), which you must check for.")
    ]),
    section("analogy", "analogy", "The herald's announcement", [
      p("A herald announces: 'Sir Reginald, bearing 24 hit points, enters the arena!'. The herald has a template with gaps and fills the gaps from the sheet. A template literal is exactly that: `` `${name}, bearing ${hp} hit points, enters the arena!` ``."),
      p("The conversion trap is the herald reading '24' off the sheet as a word rather than a number, then 'adding' 10 to it by writing the digits side by side. Silly for a person; completely natural for a computer that was told the value is text.")
    ]),
    section("technical", "technical", "Concatenation, interpolation and coercion", [
      p("`+` with at least one string operand converts the other operand to a string and concatenates. Template literals (backticks) interpolate `${expression}` by converting the expression's value to a string. `String(value)` converts explicitly; `Number(value)` parses text to a number, returning `NaN` for anything that is not numeric (`Number(\"\")` is 0, a quirk worth knowing). `Number.isNaN(x)` tests for NaN; `parseInt(text, 10)` reads leading digits and ignores the rest."),
      p("Strings are immutable: methods return new strings. Useful ones: `.length`, `.toUpperCase()`, `.toLowerCase()`, `.trim()`, `.includes(part)`, `.startsWith(part)`, `.slice(start, end)`, `.replace(a, b)`, `.split(separator)`.")
    ]),
    section("syntax", "syntax", "Three ways to build a message", [
      js(`const name = "Mirabel";\nconst hp = 9;\nconsole.log("Plain:", name + " has " + hp + " HP");\nconsole.log("Template:", \`\${name} has \${hp} HP\`);\nconsole.log("Method:", name.toUpperCase() + " (" + name.length + " letters)");`, { expectOutput: ["Plain: Mirabel has 9 HP", "Template: Mirabel has 9 HP", "Method: MIRABEL (7 letters)"] }),
      p("Prefer template literals when mixing text and values: they read like the final sentence. Inside `${}` you can write any expression: `${hp - 3}`, `${name.toUpperCase()}`.")
    ]),
    section("example-minimal", "example-minimal", "Converting input", [
      js(`const typed = "12";          // what a dialog gives you\nconst asNumber = Number(typed);\nconsole.log(typed + 1);       // joins: "121"\nconsole.log(asNumber + 1);    // adds: 13`, { expectOutput: ["121", "13"] })
    ]),
    section("example-annotated", "example-annotated", "A safe conversion", [
      js(`const typed = " 15 ";\nconst cleaned = typed.trim();\nconst amount = Number(cleaned);\nif (Number.isNaN(amount)) {\n  console.log("That is not a number: " + typed);\n} else {\n  console.log(\`Applying \${amount} damage\`);\n}`, { annotations: [{ line: 1, note: "Users type spaces. Assume messy input." }, { line: 2, note: "`trim()` removes spaces at both ends." }, { line: 3, note: "Convert. `Number(\"15\")` is 15; `Number(\"abc\")` is NaN." }, { line: 4, note: "`if` is coming in two lessons; read it as English: if the result is not a number, complain." }, { line: 7, note: "A template literal builds the message from the number." }], expectOutput: ["Applying 15 damage"] })
    ]),
    section("incorrect", "incorrect", "The classic '71'", [
      js(`const currentHP = 24;\nconst healing = "10"; // came from a text field\nconst newHP = currentHP + healing;\nconsole.log("New HP: " + newHP);`, { expectOutput: ["New HP: 2410"], caption: "No error. The actor would be set to 2410 hit points." })
    ]),
    section("why-fails", "why-fails", "Why it fails", [
      p("`healing` is the string `\"10\"`. `24 + \"10\"` sees a string on one side, converts 24 to `\"24\"`, and joins: `\"2410\"`. JavaScript did exactly what the rules say. The author's mistake was trusting that text looked like a number."),
      p("This is the single most common logic error in Foundry macros, because every dialog field, every setting typed by a user, and every `dataset` attribute arrives as a string.")
    ]),
    section("corrected", "corrected", "Convert first", [
      js(`const currentHP = 24;\nconst healing = Number("10");\nconst newHP = currentHP + healing;\nconsole.log("New HP: " + newHP);`, { highlight: [2], expectOutput: ["New HP: 34"] })
    ]),
    section("use-case", "use-case", "A chat line from real data", [
      fvtt(`const token = canvas.tokens.controlled[0];\nconst hp = token.actor.system.attributes.hp;\nconst line = \`<strong>\${token.name}</strong>: \${hp.value}/\${hp.max} HP\`;\nawait ChatMessage.create({ content: line });`, { caption: "Template literal with simple HTML. Practice data: Sir Reginald 24/30." }),
      warn("Names and other user-typed text placed into HTML should be escaped (`foundry.utils.escapeHTML(token.name)`). You will learn why in [[lesson:t4-chat-formatting|Chat formatting]]; for your own practice data it is harmless, for real worlds it matters.")
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Using plain quotes with `${}`: `\"Hello ${name}\"` prints the characters `${name}` literally. Only backticks interpolate.", "Forgetting that `Number(\"\")` is 0, so an empty field becomes zero damage silently. Check for empty input separately.", "Comparing a number to a string: `hp === \"24\"` is false even when hp is 24.", "Calling `.length()` with parentheses. `length` is a property, not a method."])
    ]),
    section("debugging", "debugging", "Is it a string or a number?", [
      steps(["Print `typeof value` next to the value: `console.log(typeof amount, amount)`.", "If it says `string` where you expected `number`, convert with `Number(...)` and check `Number.isNaN`.", "If a message shows `undefined` in the middle, one of the interpolated variables was not set; print each separately."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Template literals: backticks and `${expression}`.", "`+` joins when either side is a string; convert input with `Number()`.", "Always check `Number.isNaN(result)` for user input.", "Strings have useful methods; `length` is a property."])
    ])
  ],
  exercises: [
    predict({ id: "t1-strings-predict", title: "Join or add?", prompt: "Predict the three printed lines.", code: `const a = "3";\nconst b = 4;\nconsole.log(a + b);\nconsole.log(Number(a) + b);\nconsole.log(\`\${a}\${b}\`);`, answer: "34\n7\n34", explanation: "String + number joins (\"34\"); Number(\"3\") + 4 adds (7); a template literal always produces text (\"34\").", concepts: ["strings", "type-conversion"], hints: ["Which operations involve a string?", "Templates always build text."] }),
    fill({ id: "t1-strings-fill", title: "Make the announcement", prompt: "Fill the blanks to print `MIRABEL casts Fire Bolt!` using a template literal and a string method.", code: `const caster = "Mirabel";\nconst spell = "Fire Bolt";\nconsole.log(\`\${caster.____()} casts \${____}!\`);`, blanks: [["toUpperCase"], ["spell"]], explanation: "`toUpperCase()` returns the upper-case copy; `${spell}` interpolates the spell name.", concepts: ["strings"], hints: ["Which method makes text upper case?", "The second blank is a variable name."] }),
    mc({ id: "t1-strings-nan", title: "Checking input", prompt: "A dialog returns `\"abc\"` for a damage amount. Which check catches it after `const n = Number(text)`?", options: [["a", "`if (n === NaN)`"], ["b", "`if (Number.isNaN(n))`"], ["c", "`if (n === \"abc\")`"]], answer: "b", explanation: "NaN is never equal to anything, even itself, so `=== NaN` never works. Use Number.isNaN.", concepts: ["type-conversion", "validation"], hints: ["NaN === NaN is false."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t1-strings-q1", "What is `\"Round \" + 2 + 1`?", [["a", "`\"Round 3\"`"], ["b", "`\"Round 21\"`"], ["c", "An error"]], "b", "Left to right: \"Round \" + 2 is \"Round 2\", then + 1 joins to \"Round 21\"."),
    q("t1-strings-q2", "Which produces `Hello Mirabel` when name is \"Mirabel\"?", [["a", "`\"Hello ${name}\"`"], ["b", "`` `Hello ${name}` ``"], ["c", "`'Hello ' name`"]], "b", "Only backtick strings interpolate ${}."),
    q("t1-strings-q3", "`Number(\" 42 \")` is:", [["a", "NaN"], ["b", "42"], ["c", "\" 42 \""]], "b", "Number() ignores surrounding whitespace."),
    q("t1-strings-q4", "Why does input from a dialog need converting before arithmetic?", [["a", "Dialogs return strings"], ["b", "Dialogs return booleans"], ["c", "It does not need converting"]], "a", "Form fields deliver text; convert with Number() and validate.")
  ] },
  challenge: codeEx({ id: "t1-strings-announce", type: "write-function", title: "announceHit", prompt: "Write a function `announceHit(attacker, target, amount)` that returns the string `ATTACKER hits TARGET for N damage!` with the attacker's name in upper case, for example `GOBLIN hits Mirabel for 4 damage!`. If `amount` arrives as a string (like `\"4\"`) it must still work as a number: `announceHit(\"Goblin\", \"Mirabel\", \"4\")` must say `4 damage`, and `announceHit(\"Orc\", \"Reg\", \"3\" + 2)`... careful: just make sure you convert amount with Number().", runtime: "sandbox", starter: `function announceHit(attacker, target, amount) {\n  // return the announcement\n}\n`,
    tests: [{ name: "Basic announcement", call: "announceHit", args: ["Goblin", "Mirabel", 4], expect: "GOBLIN hits Mirabel for 4 damage!" }, { name: "String amount is converted", call: "announceHit", args: ["Orc", "Reginald", "12"], expect: "ORC hits Reginald for 12 damage!" }, { name: "Returns a string", call: "announceHit", args: ["Wolf", "Mirabel", 2], expectType: "string" }],
    hints: ["A template literal with three `${}` gaps is the cleanest shape.", "Upper-case the attacker with `attacker.toUpperCase()`.", "Convert the amount: `const n = Number(amount);` then use `${n}`."],
    reveal: [{ title: "Template literal", code: `function announceHit(attacker, target, amount) {\n  return \`\${attacker.toUpperCase()} hits \${target} for \${amount} damage!\`;\n}` }, { title: "With conversion", code: `function announceHit(attacker, target, amount) {\n  const n = Number(amount);\n  return \`\${attacker.toUpperCase()} hits \${target} for \${n} damage!\`;\n}` }],
    solution: { code: `function announceHit(attacker, target, amount) {\n  const n = Number(amount);\n  return \`\${attacker.toUpperCase()} hits \${target} for \${n} damage!\`;\n}`, explanation: "Interpolation builds the sentence; `Number` makes the amount a real number regardless of how it arrived. (Here the string form prints the same digits, but once you do arithmetic the conversion is essential.)" },
    concepts: ["strings", "functions", "type-conversion"], criteria: ["The returned text matches exactly.", "String amounts are handled."] }),
  reinforces: ["t1-variables", "t0-what-is-code"], documentation: [DOCS.mdnJs],
  completion: { required: ["t1-strings-predict", "t1-strings-fill", "t1-strings-nan"], checkpoint: true, criterion: "Predict join-versus-add results, complete a template literal, choose the NaN check, and pass the checkpoint." }
});
