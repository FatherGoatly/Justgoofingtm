import { lesson, section, p, list, steps, tip, note, table, js, predict, fill, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t0-reading-code", tier: 0, topic: "The zero-code gateway", title: "Reading code from top to bottom",
  summary: "Programs are read like a recipe: one statement at a time, in order. Comments are notes for humans, and console.log is how a program talks to you.",
  minutes: 20, difficulty: "beginner", category: "core-js", prerequisites: ["t0-what-is-code"], access: ACCESS.none,
  objectives: ["Read a short program and say what it does without running it", "Use comments to leave notes that the computer ignores", "Use console.log to make a program show you a value", "Recognise the difference between the console and the chat log"],
  sections: [
    section("plain", "plain", "One line at a time", [
      p("Code is read exactly like a recipe: start at the top, do the first step, then the next. Nothing on line 5 happens before line 4 is finished. When you are unsure what a program does, do not stare at the whole thing. Put your finger on line 1 and ask 'what does this one line do?' Then move your finger down."),
      p("Programs also talk back. The instruction `console.log(...)` prints whatever you give it to the browser **console**, a text panel that only you see. It is the programmer's notebook: not part of the game, not visible to players, perfect for checking what your code is doing."),
      p("And programs can carry notes that the computer ignores completely. Anything after `//` on a line is a **comment**: a message from the author to the next reader. Good comments explain *why*, not *what*.")
    ]),
    section("analogy", "analogy", "Running a combat round", [
      p("Think of a combat round. The initiative order is the program: first the rogue acts, then the goblin, then the wizard. You do not resolve the wizard's fireball before the rogue's sneak attack just because it is more exciting. Order is the rule."),
      p("Comments are your pencilled notes in the margin of the adventure: 'the goblins flee if the chief dies'. The players never see them, but they help you run the scene. `console.log` is you muttering the current hit point total to yourself to keep track.")
    ]),
    section("technical", "technical", "Statements, comments and the console", [
      p("JavaScript executes **statements** sequentially within a block. A statement is terminated by a semicolon (JavaScript will often insert one for you, but writing it yourself avoids surprises)."),
      p("`console.log(a, b, c)` writes its arguments to the developer console separated by spaces. Strings print as-is; numbers print as numbers; objects print in an expandable form. It returns nothing and changes nothing."),
      p("Comments come in two forms: `// text` to the end of a line, and `/* text */` which may span lines. The parser discards both; they have no effect on behaviour and cannot cause runtime errors (an unclosed `/*` is a syntax error, though).")
    ]),
    section("syntax", "syntax", "The shapes to recognise", [
      table(["Shape", "What it is", "Example"], [["`// ...`", "Line comment", "`// heal the party`"], ["`/* ... */`", "Block comment", "`/* old version */`"], ["`console.log(x);`", "Print x to the console", "`console.log(\"HP:\", 24);`"], ["`name(args);`", "Call a function with arguments", "`ChatMessage.create({...});`"]]),
      p("Parentheses after a name mean 'run this'. The things inside the parentheses are the inputs. A line with no parentheses, like `const x = 5;`, is doing something else (storing a value; next tier).")
    ]),
    section("example-minimal", "example-minimal", "A program that explains itself", [
      js(`// Announce the start of a session\nconsole.log("Session 12 begins");\nconsole.log("Players present:", 4);`, { caption: "Two prints. The first prints a string; the second prints a label and a number, separated by a space." })
    ]),
    section("example-annotated", "example-annotated", "Reading it with your finger", [
      js(`// The GM's pre-session checklist\nconsole.log("Checklist");\n// Each item is printed on its own line\nconsole.log("1. Load the scene");\nconsole.log("2. Roll initiative");\nconsole.log("Done");`, { annotations: [{ line: 1, note: "A comment. The computer skips it entirely." }, { line: 2, note: "Prints `Checklist`." }, { line: 3, note: "Another comment. Still skipped." }, { line: 4, note: "Prints the first item. Nothing from line 2 affects this; each statement is independent." }, { line: 6, note: "The last statement. After it, the program ends." }], expectOutput: ["Checklist", "1. Load the scene", "2. Roll initiative", "Done"] }),
      p("Predicting the output before running is the single most valuable habit in this entire academy. Do it every time, even when it seems obvious.")
    ]),
    section("incorrect", "incorrect", "Comment in the wrong place", [
      p("The author meant to describe the second line, but put the comment marker before the code on the same line. Everything after `//` is ignored, including the instruction."),
      js(`console.log("Round 1");\n// console.log("Round 2");\nconsole.log("Round 3");`, { caption: "This runs without any error. That is the problem." })
    ]),
    section("why-fails", "why-fails", "Why it is wrong even though it runs", [
      p("Line 2 is now a comment, so `Round 2` is never printed. The program runs cleanly and prints `Round 1` and `Round 3`. There is no error message because nothing is syntactically wrong; the program simply does not do what the author wanted."),
      p("This is a **logic error**: valid code, wrong behaviour. The computer cannot detect it because, as far as it knows, you meant it. Only reading the output and comparing it to your intention reveals it."),
      note("Commenting out a line is also a legitimate technique: it is how programmers temporarily switch a line off while testing. The mistake here is doing it by accident.")
    ]),
    section("corrected", "corrected", "The fix", [
      js(`console.log("Round 1");\nconsole.log("Round 2"); // the second round\nconsole.log("Round 3");`, { highlight: [2], expectOutput: ["Round 1", "Round 2", "Round 3"] })
    ]),
    section("use-case", "use-case", "Console versus chat", [
      p("`console.log` is for you; `ChatMessage.create` is for the table. When a macro misbehaves, sprinkle `console.log` lines through it to print what it is working with at each step: the token it found, the number it calculated. Remove them when it works. You will do this in every later tier."),
      p("The academy's workshop captures `console.log` output in its results panel so you do not need to open the browser console, but in real Foundry the console is where that text goes.")
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Expecting `console.log` to show something to players. It never does.", "Forgetting the parentheses: `console.log \"hi\"` is a syntax error.", "Putting `//` in front of code you still want to run.", "Reading a program by jumping to the interesting line. Start at the top; the interesting line depends on the lines before it."])
    ]),
    section("debugging", "debugging", "Debugging by printing", [
      steps(["Decide what you expect the program to print.", "Run it and compare line by line.", "The first line that differs from your expectation is where the problem is (or just before it).", "Add a `console.log` just before that point to see the value the program is actually working with."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Statements run top to bottom, one at a time.", "`// comment` is ignored by the computer; use it to explain intent.", "`console.log(...)` prints to the console, which only you see.", "A program that runs without errors can still be wrong: that is a logic error."])
    ])
  ],
  exercises: [
    predict({ id: "t0-reading-code-predict", title: "What prints?", prompt: "Read the program and predict its output exactly, one line per printed line.", code: `console.log("Torches lit");\n// console.log("Doors locked");\nconsole.log("Initiative!");\nconsole.log("Round", 1);`, answer: "Torches lit\nInitiative!\nRound 1", explanation: "The commented line never runs. `console.log(\"Round\", 1)` prints both values separated by a space.", concepts: ["sequencing", "comments", "console"], hints: ["Which line starts with `//`?", "Two arguments to console.log print separated by one space."] }),
    fill({ id: "t0-reading-code-fill", title: "Complete the program", prompt: "Fill the blanks so the program prints `Welcome` and then `Begin`, with a comment above the second print.", code: `____("Welcome");\n____ announce the start\nconsole.log("____");`, blanks: [["console.log"], ["//"], ["Begin"]], explanation: "`console.log` prints; `//` starts a comment; the text inside the quotes is printed exactly.", concepts: ["console", "comments"], hints: ["The printing instruction is the same on both lines.", "A comment starts with two slashes."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t0-reading-code-q1", "Who sees the output of `console.log`?", [["a", "Everyone in the game"], ["b", "Only the person whose browser ran the code"], ["c", "Only the GM"]], "b", "The console is local to the browser running the code."),
    q("t0-reading-code-q2", "What does the computer do with `// heal the party`?", [["a", "Heals the party"], ["b", "Ignores it"], ["c", "Reports an error"]], "b", "Everything after // on a line is a comment and is skipped."),
    q("t0-reading-code-q3", "A program runs with no errors but prints the wrong thing. What kind of problem is that?", [["a", "A syntax error"], ["b", "A logic error"], ["c", "A permissions error"]], "b", "Valid code with wrong behaviour is a logic error; the computer cannot detect it for you.")
  ] },
  challenge: codeEx({ id: "t0-reading-code-checklist", type: "write-function", title: "Session checklist", prompt: "Write a program that prints exactly three lines: `Scene loaded`, `Music playing`, `Ready`. Include at least one comment explaining what the program is for.", runtime: "sandbox", starter: `// Your checklist program goes here\n`,
    tests: [{ name: "Prints the three lines in order", expectOutput: ["Scene loaded", "Music playing", "Ready"] }, { name: "Contains a comment", codeIncludes: "//", message: "Add a comment with // explaining the program." }],
    hints: ["Each line of output needs its own console.log.", "Text goes inside double quotes.", "A comment line starts with // and can say anything."],
    reveal: [{ title: "Three prints and a comment", code: `// Pre-session checklist for the GM\nconsole.log("Scene loaded");\nconsole.log("Music playing");\nconsole.log("Ready");` }],
    solution: { code: `// Pre-session checklist for the GM\nconsole.log("Scene loaded");\nconsole.log("Music playing");\nconsole.log("Ready");`, explanation: "Three statements in order produce three lines in order. The comment documents the intent without affecting behaviour." },
    concepts: ["console", "sequencing", "comments"], criteria: ["The output matches exactly.", "A comment is present."] }),
  reinforces: ["t0-what-is-code"], documentation: [DOCS.mdnJs],
  completion: { required: ["t0-reading-code-predict", "t0-reading-code-fill"], checkpoint: true, criterion: "Predict the output of a short program correctly and complete the blanks; pass the checkpoint." }
});
