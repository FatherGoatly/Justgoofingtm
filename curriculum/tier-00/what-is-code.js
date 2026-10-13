import { lesson, section, p, h, list, steps, tip, note, warn, table, js, fvtt, fvttStatic, pseudo, mc, predict, codeEx, reorder, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t0-what-is-code", tier: 0, topic: "The zero-code gateway", title: "What code is, and what happens when a macro runs",
  summary: "Code is a list of instructions a computer follows literally. A macro is a saved list of instructions Foundry runs for you. Your first macro posts a greeting to chat.",
  minutes: 25, difficulty: "beginner", category: "core-js", prerequisites: [], access: ACCESS.none,
  objectives: ["Explain, in your own words, what code and a macro are", "Describe what Foundry does when a macro runs", "Tell apart code, data and the user interface", "Run a greeting macro, change its text, and explain what changed"],
  sections: [
    section("plain", "plain", "Instructions, followed exactly", [
      p("Code is a list of instructions written in a language a computer can read. Nothing more mysterious than that. The computer starts at the top, does the first thing, then the second, then the third, and never skips ahead, never guesses what you meant, and never gets bored."),
      p("A **macro** in Foundry is a saved list of those instructions with a button on it. When you click the button, Foundry hands the instructions to the browser, the browser does them one after another, and whatever they say happens: a message appears in chat, a token moves, a sheet changes."),
      p("That literal-mindedness is the whole trick of programming. Computers are not clever; they are obedient. If an instruction is ambiguous, the computer does not ask what you meant. It does exactly what you wrote. Most of learning to code is learning to write instructions precise enough that 'exactly what you wrote' is also what you wanted."),
      tip("You already give precise instructions all the time. 'Roll a d20, add your Dexterity modifier, compare to the trap's DC' is an algorithm. You are a step closer than you think.")
    ]),
    section("analogy", "analogy", "The new player who does exactly what you say", [
      p("Imagine a player who has never heard of your game and follows your words with absolute literalness. You say 'roll initiative' and they ask 'with what?'. You say 'roll a d20' and they roll it and sit there, because you did not say to add anything or to tell you the result."),
      p("That player is the computer. Writing code is writing the rules so completely that this player can run the scene without you. The upside: once the rules are written, that player will run the scene flawlessly a thousand times, at any hour, without complaint.")
    ]),
    section("technical", "technical", "What actually happens when you click a macro", [
      steps(["Foundry looks up the Macro document (a saved record in your world) and reads its `command` text.", "Because it is a script macro, Foundry wraps that text in a JavaScript function and asks the browser to run it with a few useful values already filled in: `speaker`, `actor`, `token`, `character` and `scope`.", "The browser reads the text line by line (parsing). If any line is malformed, it stops here with a **syntax error** and nothing runs.", "Otherwise it executes each statement in order. Statements that change the game send a request to the Foundry server, which checks your permissions and saves the change.", "When the last statement finishes (or an error stops it), the macro is over. Anything it printed with `console.log` is in the browser console; anything it posted is in chat."]),
      p("Two facts hide in that list that you will use forever: the browser runs your code (so JavaScript is the language), and the server checks permissions (so a macro can only do what you could do by hand).")
    ]),
    section("syntax", "syntax", "Three words you will hear constantly", [
      table(["Word", "Means", "Example"], [["Code", "Instructions for the computer", "`ChatMessage.create({ content: \"Hello\" })`"], ["Data", "The information the code works on", "The text `\"Hello\"`, a token's name, a hit point number"], ["User interface (UI)", "What you see and click", "The chat log, a token on the map, a dialog window"]]),
      p("Code reads and changes data. The UI shows data to people. A macro that posts a greeting is code; the greeting text is data; the chat log is UI. Keeping those three apart will make every later lesson clearer."),
      p("A **statement** is one complete instruction, usually one line, often ending in a semicolon. Reading code means reading statements from the top down.")
    ]),
    section("example-minimal", "example-minimal", "The smallest useful macro", [
      p("This is a complete Foundry macro. One statement. It creates a chat message whose content is the text between the quotes."),
      fvtt(`ChatMessage.create({ content: "Greetings, adventurers!" });`, { caption: "Try it: press Open in workshop, then Run. In Foundry Preview the message appears in the results panel instead of your real chat." })
    ]),
    section("example-annotated", "example-annotated", "Reading it piece by piece", [
      fvtt(`ChatMessage.create({ content: "Greetings, adventurers!" });`, { annotations: [{ line: 1, note: "`ChatMessage` is Foundry's chat-message document type. `.create(...)` asks it to make a new one. Inside the parentheses is the data for the message: an object `{ ... }` with one field, `content`, holding the text to show. The semicolon ends the statement." }] }),
      p("Every character matters. The quotes mark where the text starts and ends. The braces mark the object. The parentheses mark what is handed to `create`. Change any of them and the browser will either refuse to run the macro or do something different.")
    ]),
    section("incorrect", "incorrect", "A version that does not run", [
      p("Here the closing quote after the greeting is missing. To the browser, the text never ends, so the rest of the line is swallowed into it."),
      fvtt(`ChatMessage.create({ content: "Greetings, adventurers! });`, { expectError: true, caption: "Run it and read the error message. You will see one like this many times; getting comfortable with it is the point." })
    ]),
    section("why-fails", "why-fails", "Why the broken version fails", [
      p("The browser reads the opening quote and starts collecting text. It reaches the end of the line still inside the text, with no closing quote. It cannot build an instruction out of that, so it reports a **syntax error** and runs nothing at all."),
      p("Notice the important property of syntax errors: they stop everything before it starts. No message was posted, no data changed. The code was never executed; it was rejected."),
      note("The error message usually points near the mistake, not at it. 'Unexpected end of input' or 'Invalid or unexpected token' means 'I got confused around here'. Look at the line named, then at the one above.")
    ]),
    section("corrected", "corrected", "The fix", [
      fvtt(`ChatMessage.create({ content: "Greetings, adventurers!" });`, { highlight: [1], caption: "Close the quote and the statement is whole again." })
    ]),
    section("use-case", "use-case", "What this is good for at the table", [
      p("Chat macros are the fastest way to add atmosphere without typing mid-session: a weather report, a tavern description, a dramatic 'roll for initiative!' banner. Every GM utility you will build later starts from this shape: gather some data, do something with it, tell the table what happened."),
      p("The same `create` call accepts more fields: who is speaking, whether the message is whispered, and so on. Those come in [[lesson:t3-chat-and-dialogs|Chat and dialogs]]. For now, one field is plenty.")
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Mismatched quotes: starting with `\"` and ending with `'`, or forgetting the closing one.", "Typing `chatmessage` instead of `ChatMessage`. JavaScript is case-sensitive: these are different names.", "Pasting from a document that converted straight quotes `\"` into curly quotes `“ ”`. Curly quotes are not quotes to JavaScript.", "Expecting the macro to run when you save it. Saving stores the text; clicking runs it."])
    ]),
    section("debugging", "debugging", "If it does not work", [
      steps(["Open the browser console (F12, then the Console tab) and look for a red line that appeared when you ran the macro.", "Read the first red line. It names the kind of error and, usually, a line number.", "Compare your line character by character with the working example above.", "Change one thing at a time and run again. Small, single changes make it obvious which change fixed (or broke) something."])
    ]),
    section("summary", "summary", "Summary", [
      list(["Code is literal instructions; a macro is saved code with a button.", "Foundry runs macro code in your browser and the server checks permissions for anything that changes the world.", "Code acts on data and the UI shows data. Keep the three apart.", "A syntax error stops a program before it runs anything. The message points near the problem."])
    ])
  ],
  exercises: [
    mc({ id: "t0-what-is-code-roles", title: "Code, data or interface?", prompt: "In the greeting macro, which part is **data**?", options: [["a", "`ChatMessage.create`"], ["b", "The text `\"Greetings, adventurers!\"`"], ["c", "The chat log where the message appears"], ["d", "The macro button on the hotbar"]], answer: "b", explanation: "The greeting text is the information the code works on. `ChatMessage.create` is code; the chat log and hotbar are user interface.", concepts: ["code-vs-data"], hints: ["Data is the information; code is the instruction; UI is what you see."] }),
    predict({ id: "t0-what-is-code-order", title: "Top to bottom", prompt: "The computer runs statements in order. What does this program print? (Write each printed line on its own line.)", code: `console.log("First");\nconsole.log("Second");\nconsole.log("First");`, answer: "First\nSecond\nFirst", explanation: "Each `console.log` prints exactly its text, in the order written. Repeating a statement repeats its effect; nothing is remembered or skipped.", concepts: ["sequencing"], hints: ["Read each line in order and write down what it prints."] }),
    codeEx({ id: "t0-what-is-code-greeting", type: "complete-macro", title: "Your first macro", prompt: "Make the macro post a chat message that contains the words `Welcome to the table`. Keep the rest of the text whatever you like.", runtime: "preview", starter: `// Replace the content below with a greeting that includes: Welcome to the table\nChatMessage.create({ content: "" });`,
      tests: [{ name: "Runs without errors", expectNoError: true }, { name: "Posts a chat message", expectChat: true }, { name: "The message contains 'Welcome to the table'", expectChat: { contains: "Welcome to the table" } }],
      hints: ["The text between the quotes is what appears in chat.", "Type your greeting between the two quote characters, keeping both quotes.", "For example: `ChatMessage.create({ content: \"Welcome to the table, heroes!\" });`"],
      reveal: [{ title: "Put the greeting inside the quotes", code: `ChatMessage.create({ content: "Welcome to the table, heroes!" });` }],
      solution: { code: `ChatMessage.create({ content: "Welcome to the table, heroes!" });`, explanation: "The content field holds the text. Everything else is the fixed shape of a chat-message macro." },
      concepts: ["chat", "strings"], criteria: ["The program runs.", "Exactly the shape `ChatMessage.create({ content: ... })` posts a message containing the required words."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t0-what-is-code-q1", "What does a computer do with an instruction that could mean two things?", [["a", "Picks the more sensible meaning"], ["b", "Does exactly what was literally written"], ["c", "Asks the user"]], "b", "Computers follow instructions literally. Ambiguity is resolved by the rules of the language, not by guessing intent."),
    q("t0-what-is-code-q2", "A macro has a syntax error on line 3 of 5. What happens when you click it?", [["a", "Lines 1 and 2 run, then it stops"], ["b", "Nothing runs; the error is reported"], ["c", "Lines 1, 2, 4 and 5 run"]], "b", "Syntax errors are found while reading the code, before anything executes."),
    q("t0-what-is-code-q3", "Who checks whether a macro is allowed to change an actor?", [["a", "The macro itself"], ["b", "The Foundry server, using the running user's permissions"], ["c", "Nobody; macros can change anything"]], "b", "Changes are requests to the server, which enforces roles and ownership. A macro can only do what its user could do by hand."),
    q("t0-what-is-code-q4", "Which of these is the user interface?", [["a", "`ChatMessage.create(...)`"], ["b", "The chat log panel"], ["c", "The word `content`"]], "b", "The chat log is what people see and click. The call and the field name are code.")
  ] },
  challenge: codeEx({ id: "t0-what-is-code-two-lines", type: "complete-macro", title: "Two messages in order", prompt: "Post two chat messages: the first must contain `The door creaks open` and the second must contain `Roll initiative`. They must be posted in that order.", runtime: "preview", starter: `// Post two messages, one after the other.\n`,
    tests: [{ name: "Runs without errors", expectNoError: true }, { name: "Posts exactly two messages", expectChat: { count: 2 } }, { name: "First message is the door", expectChat: { matches: "The door creaks open[\\s\\S]*Roll initiative" } }],
    hints: ["One statement posts one message. You need two statements.", "Copy the `ChatMessage.create` line twice and change the text in each.", "Statements run top to bottom, so the door message goes first."],
    reveal: [{ title: "Two create calls", code: `ChatMessage.create({ content: "The door creaks open..." });\nChatMessage.create({ content: "Roll initiative!" });` }],
    solution: { code: `ChatMessage.create({ content: "The door creaks open..." });\nChatMessage.create({ content: "Roll initiative!" });`, explanation: "Two statements, two messages, in the order written. This is sequencing: the most basic structure of every program." },
    concepts: ["chat", "sequencing"], criteria: ["Two messages are posted.", "The door message is posted before the initiative message."] }),
  reinforces: [], documentation: [DOCS.macrosArticle, DOCS.chatMessage],
  completion: { required: ["t0-what-is-code-greeting"], checkpoint: true, criterion: "Post a greeting macro from the workshop and pass the checkpoint." }
});
