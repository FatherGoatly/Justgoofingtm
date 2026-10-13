import { lesson, section, p, list, steps, tip, note, warn, table, js, fvtt, identify, mc, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t0-reading-errors", tier: 0, topic: "The zero-code gateway", title: "What an error message is telling you",
  summary: "Errors are not failures; they are the computer explaining precisely where it got stuck. Learn the three kinds (syntax, runtime, logic) and how to read a message instead of fearing it.",
  minutes: 25, difficulty: "beginner", category: "debugging", prerequisites: ["t0-reading-code"], access: ACCESS.none,
  objectives: ["Distinguish syntax errors, runtime errors and logic errors", "Read an error message and locate the line it refers to", "Use the academy's error explainer and the browser console", "Store a value in a variable as a first step toward fixing errors"],
  sections: [
    section("plain", "plain", "The computer is telling you where it got stuck", [
      p("An error message feels like an accusation. It is not. It is the most precise information you will ever get about your program: the computer saying 'I was doing this, on this line, and I could not continue because of that'. Experienced programmers read errors first and code second."),
      p("There are three kinds of trouble, and they feel different:"),
      list(["**Syntax error**: the code could not even be read. Nothing ran. Something is misspelled or mispunctuated.", "**Runtime error**: the code was read fine and started running, then hit something impossible on a particular line, like reading the name of a token that does not exist. Everything before that line already happened.", "**Logic error**: the code ran to the end without complaint and did the wrong thing. No message at all. The hardest kind, because the only detector is you."]),
      p("Before the next lesson introduces variables properly, we will use one here: a named value. `const damage = 7;` makes a box labelled `damage` holding 7. You can then write `damage` anywhere you would have written 7. That is all you need for this lesson.")
    ]),
    section("analogy", "analogy", "Three ways a rules question goes wrong", [
      p("A player asks 'can I cast Fireball at the dragon's weak point for triple damage?'. If they say it in a language you do not speak, you cannot even start: syntax error. If you understand but there is no dragon in the room, the action fails when you try to resolve it: runtime error. If you resolve it, but forgot the dragon has fire immunity and dealt damage anyway, the game continued with a wrong result: logic error."),
      p("Same at the keyboard. The useful question is never 'why is it broken?' but 'which of the three is this, and what line was it on?'")
    ]),
    section("technical", "technical", "How each kind shows up", [
      table(["Kind", "When", "What you see", "What ran"], [["Syntax", "While parsing, before execution", "`SyntaxError: Unexpected token`, `missing ) after argument list`, `Unexpected end of input`", "Nothing"], ["Runtime", "During execution, on a specific line", "`TypeError: Cannot read properties of undefined`, `ReferenceError: x is not defined`", "Everything before that line"], ["Logic", "Never reported", "Wrong output, wrong number, nothing happening", "Everything"]]),
      p("Runtime errors carry a name (`TypeError`, `ReferenceError`), a message, and a **stack trace** listing the line where it happened. The academy's workshop shows the line number; the browser console shows the full trace. [[lesson:t8-stack-traces|Tier 8]] goes deep on traces; for now, 'find the line, read the message' is the skill."),
      p("The two runtime errors you will meet most: `ReferenceError: name is not defined` means you used a name that does not exist (usually a typo). `TypeError: Cannot read properties of undefined (reading 'x')` means the thing before the dot was empty when you tried to read `.x` from it.")
    ]),
    section("syntax", "syntax", "Anatomy of an error message", [
      js(`const hero = "Reginald";\nconsole.log(hero.lenght);`, { caption: "This program is legal and prints `undefined`, because `lenght` is misspelled. Reading a property that does not exist is not an error in JavaScript; it just gives you `undefined`. That is a logic error waiting to become a runtime error one line later.", expectOutput: ["undefined"] }),
      p("Message format: `ErrorName: description (line, column)`. `ReferenceError: herro is not defined` reads as: kind = ReferenceError; the name `herro` does not exist; look at the line given.")
    ]),
    section("example-minimal", "example-minimal", "A runtime error, on purpose", [
      js(`const damage = 7;\nconsole.log("Damage:", damage);\nconsole.log("Damage:", damag);`, { expectError: true, caption: "Line 2 runs and prints. Line 3 throws `ReferenceError: damag is not defined`. Run it: notice that the first print did happen." })
    ]),
    section("example-annotated", "example-annotated", "Locating the fault from the message", [
      js(`const damage = 7;\nconst label = "Damage:";\nconsole.log(label, damage);\nconsole.log(labl, damage);`, { annotations: [{ line: 1, note: "Creates a variable `damage` holding 7." }, { line: 2, note: "Creates `label` holding the text." }, { line: 3, note: "Works: both names exist." }, { line: 4, note: "`labl` was never created. ReferenceError here, with line 4 in the message. The fix is on this line, not on line 2." }], expectError: true })
    ]),
    section("incorrect", "incorrect", "A logic error with no message", [
      p("A GM wants to report how much damage remains after a shield absorbs 3 points. Nothing here is a syntax or runtime error. Run it and compare the output with what the author intended."),
      js(`const damage = 10;\nconst absorbed = 3;\nconsole.log("Remaining:", damage + absorbed);`, { expectOutput: ["Remaining: 13"], caption: "Prints `Remaining: 13`. The shield made things worse." })
    ]),
    section("why-fails", "why-fails", "Why no error appeared", [
      p("`damage + absorbed` is a perfectly valid instruction; the computer added two numbers exactly as asked. The author meant subtraction. There is no way for JavaScript to know that a shield absorbs rather than adds, so it reports nothing."),
      p("Logic errors are found by prediction: 'I expect 7' versus 'it printed 13'. Whenever a number looks wrong, trace the arithmetic by hand with the same inputs.")
    ]),
    section("corrected", "corrected", "The fix", [
      js(`const damage = 10;\nconst absorbed = 3;\nconsole.log("Remaining:", damage - absorbed);`, { highlight: [3], expectOutput: ["Remaining: 7"] })
    ]),
    section("use-case", "use-case", "The error explainer", [
      p("The academy's **Debugging** page has an error explainer: paste a message from the console and it tells you, in plain English, what that kind of message usually means and what to check. It only explains the message you give it; it does not guess at your code. The workshop does the same automatically whenever a run fails."),
      warn("Never paste an error message into an internet search and copy the first code you find into your world. Read the explanation, understand the cause, then change your own code. Fixes you do not understand break again at the worst moment.")
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Fixing the line *after* the one named in the message. The named line is where the computer stopped; the cause is there or just above.", "Reading only the first word of the message. `Cannot read properties of undefined (reading 'actor')` tells you which property you tried to read; that is the clue.", "Assuming a clean run means a correct run.", "Changing many things at once, so you cannot tell which change mattered."])
    ]),
    section("debugging", "debugging", "A repeatable procedure", [
      steps(["Read the whole message aloud (yes, aloud). Identify the kind: Syntax, Reference, Type, or no error.", "Go to the line named. Put your finger on it.", "If it is a ReferenceError, search the file for the name. Is it spelled exactly the same everywhere?", "If it is a TypeError about `undefined`, find the thing before the dot and print it with `console.log` on the line above.", "If there is no error, write down what you expected and compare it with what you got, line by line."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Syntax errors stop everything; runtime errors stop at a line; logic errors stop nothing.", "The message names the kind, the problem, and the line. Read all three.", "`ReferenceError: x is not defined` is a name problem; `TypeError ... of undefined` is an empty-value problem.", "`const name = value;` stores a value under a name you can reuse."])
    ])
  ],
  exercises: [
    mc({ id: "t0-reading-errors-kind", title: "Which kind?", prompt: "A macro prints `Healed for 0` when it should have printed `Healed for 8`. No red text appears anywhere. Which kind of error is this?", options: [["a", "Syntax error"], ["b", "Runtime error"], ["c", "Logic error"]], answer: "c", explanation: "It ran to completion with a wrong result and no message: a logic error.", concepts: ["errors"], hints: ["Did anything stop the program?"] }),
    identify({ id: "t0-reading-errors-find", title: "Find the faulty line", prompt: "This program throws `ReferenceError: tokenName is not defined`. Select the line where the problem is.", code: `const name = "Goblin Scout";\nconst hp = 7;\nconsole.log("Creature:", name);\nconsole.log("Hit points:", hp);\nconsole.log("Summary:", tokenName, hp);`, answer: [5], explanation: "`tokenName` is used on line 5 but the variable was declared as `name` on line 1. The message names the undefined identifier; find where it is used.", concepts: ["errors", "variables"], hints: ["Search for the exact name in the error message.", "Where is `tokenName` written?"] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t0-reading-errors-q1", "`TypeError: Cannot read properties of undefined (reading 'name')`. What does it tell you?", [["a", "The property `name` does not exist on any object"], ["b", "The thing before `.name` was undefined when the line ran"], ["c", "You misspelled `name`"]], "b", "The message says the object you tried to read `.name` from was undefined (empty)."),
    q("t0-reading-errors-q2", "A runtime error happens on line 6 of a 10-line macro. Which lines executed?", [["a", "None"], ["b", "Lines 1 to 5 (and 6 up to the failure)"], ["c", "All ten"]], "b", "Execution proceeds in order and stops at the failing line."),
    q("t0-reading-errors-q3", "What is the first thing to do with an error message?", [["a", "Search the internet for the message"], ["b", "Read it fully and find the line it names"], ["c", "Delete the macro and start again"]], "b", "The message is evidence. Read it, then look at the line.")
  ] },
  challenge: codeEx({ id: "t0-reading-errors-repair", type: "repair-code", title: "Repair three faults", prompt: "This program has a syntax error, a runtime error and a logic error. Fix all three so it prints `Potion heals 8` and then `HP after: 20` (starting HP 12, potion heals 8).", runtime: "sandbox",
    starter: `const hp = 12;\nconst potion = 8\nconsole.log("Potion heals", potoin);\nconsole.log("HP after:", hp - potion);`,
    tests: [{ name: "Runs without errors", expectNoError: true }, { name: "Prints the healing line", outputIncludes: "Potion heals 8" }, { name: "Prints the correct HP after healing", outputIncludes: "HP after: 20" }],
    hints: ["Run it first. The very first error is a syntax error: which line is missing something at its end?", "After fixing that, the next run gives a ReferenceError naming a misspelled variable.", "Finally, the HP after healing should go up, not down: check the arithmetic."],
    reveal: [{ title: "Fix the syntax: semicolon", code: `const hp = 12;\nconst potion = 8;\nconsole.log("Potion heals", potoin);\nconsole.log("HP after:", hp - potion);` }, { title: "Fix the name", code: `const hp = 12;\nconst potion = 8;\nconsole.log("Potion heals", potion);\nconsole.log("HP after:", hp - potion);` }, { title: "Fix the logic", code: `const hp = 12;\nconst potion = 8;\nconsole.log("Potion heals", potion);\nconsole.log("HP after:", hp + potion);` }],
    solution: { code: `const hp = 12;\nconst potion = 8;\nconsole.log("Potion heals", potion);\nconsole.log("HP after:", hp + potion);`, explanation: "Three kinds, three fixes: a missing semicolon (actually tolerated by JavaScript here, but the habit matters), a misspelled identifier, and a minus that should have been a plus. Only the first two produced messages." },
    concepts: ["errors", "variables", "arithmetic"], criteria: ["No errors are thrown.", "Both output lines are correct."] }),
  reinforces: ["t0-reading-code"], documentation: [DOCS.mdnErrors],
  completion: { required: ["t0-reading-errors-kind", "t0-reading-errors-find"], checkpoint: true, criterion: "Classify an error correctly, locate a faulty line from its message, and pass the checkpoint." }
});
