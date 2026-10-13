import { lesson, section, p, list, steps, tip, note, table, fvtt, js, mc, codeEx, q, DOCS, ACCESS } from "../_helpers.js";

export default lesson({
  id: "t0-welcome-macro", tier: 0, topic: "The zero-code gateway", title: "Project: a personalised welcome macro",
  summary: "Build, run, change and explain a welcome macro for your own campaign: a greeting, a session number and a whisper to the GM, posted in order.",
  minutes: 30, difficulty: "beginner", category: "project", prerequisites: ["t0-what-macros-touch"], access: ACCESS.read,
  objectives: ["Assemble a multi-statement macro from pieces you understand", "Change a macro's text and explain what changed and why", "Post a message that only the GM can see", "Export the finished macro to a real Macro document (optional, GM live mode)"],
  sections: [
    section("plain", "plain", "Your first real deliverable", [
      p("Everything in this tier comes together here. You will write a macro that posts a campaign welcome banner, a session line, and a private note to the GM. Then you will change it, run it again, and say in plain words what changed. That last step is the point: being able to explain code is how you know you understand it."),
      p("Keep the ambition small and the code correct. A three-line macro you understand completely is worth more than a thirty-line macro you copied.")
    ]),
    section("analogy", "analogy", "Setting the table", [
      p("Before a session, a good GM sets the scene: the recap, the hook, the whispered reminder to themselves about the NPC's secret. This macro does exactly that, every session, with one click. Later tiers will make it read the session number from a setting and the recap from a journal; today it is fixed text, which is fine.")
    ]),
    section("technical", "technical", "The three statements", [
      p("Each message is one `ChatMessage.create` call. The first two are public. The third uses the `whisper` field: a list of user ids who may see the message. `ChatMessage.getWhisperRecipients(\"GM\")` returns the GM users, and `.map(u => u.id)` turns them into ids. You do not need to understand `map` yet (Tier 2 covers it); you need to recognise the shape and use it."),
      p("`await` in front of each `create` makes the program wait for the message to be posted before continuing, which guarantees the order. Messages posted without `await` usually still arrive in order, but 'usually' is not a word to build on.")
    ]),
    section("syntax", "syntax", "Fields you will use", [
      table(["Field", "Meaning", "Example"], [["`content`", "The message text (HTML allowed)", "`\"<h2>Welcome</h2>\"`"], ["`whisper`", "Array of user ids who can see it", "`ChatMessage.getWhisperRecipients(\"GM\").map(u => u.id)`"], ["`speaker`", "Who the message is from", "`{ alias: \"The Narrator\" }`"]]),
      p("Simple HTML tags inside `content` are allowed: `<h2>`, `<p>`, `<strong>`, `<em>`. Foundry cleans the HTML for safety when the message is created.")
    ]),
    section("example-minimal", "example-minimal", "Banner only", [
      fvtt(`await ChatMessage.create({ content: "<h2>Welcome back to the Shattered Coast</h2>", speaker: { alias: "The Narrator" } });`)
    ]),
    section("example-annotated", "example-annotated", "The full welcome", [
      fvtt(`// Session opener for my campaign\nawait ChatMessage.create({ content: "<h2>Welcome back to the Shattered Coast</h2>", speaker: { alias: "The Narrator" } });\nawait ChatMessage.create({ content: "<p>Session 12. Last time: the lighthouse went dark.</p>", speaker: { alias: "The Narrator" } });\nconst gms = ChatMessage.getWhisperRecipients("GM").map(u => u.id);\nawait ChatMessage.create({ content: "<p><em>GM note: the keeper is lying about the storm.</em></p>", whisper: gms });`, { annotations: [{ line: 1, note: "A comment describing the macro's purpose. Future you will thank present you." }, { line: 2, note: "Public banner. The `speaker` alias replaces your user name as the sender." }, { line: 3, note: "Public recap line." }, { line: 4, note: "Collect the ids of all Gamemaster users into `gms`." }, { line: 5, note: "Whispered message: only the users in `gms` see it." }], caption: "In Foundry Preview the results panel marks the third message as a whisper." })
    ]),
    section("incorrect", "incorrect", "The whisper that everyone sees", [
      p("The author wanted the note private but passed the user *objects* instead of their *ids*, and also misspelled the field."),
      fvtt(`const gms = ChatMessage.getWhisperRecipients("GM");\nawait ChatMessage.create({ content: "<p>GM note: the keeper is lying.</p>", wisper: gms });`, { caption: "No error at all. The message is public." })
    ]),
    section("why-fails", "why-fails", "Why it is public", [
      p("`wisper` is not a field Foundry knows, so it is ignored, and the message gets the default visibility: everyone. Misspelled field names are a silent logic error: JavaScript happily creates an object with a `wisper` key, and `create` happily ignores it."),
      p("Even with the spelling fixed, `whisper` expects ids (strings), not User documents. Passing documents is also silently wrong in some versions. The rule: read the API documentation for the field type, and test secrets in preview (the panel marks whispers) before trusting them at the table.")
    ]),
    section("corrected", "corrected", "Private for real", [
      fvtt(`const gms = ChatMessage.getWhisperRecipients("GM").map(u => u.id);\nawait ChatMessage.create({ content: "<p>GM note: the keeper is lying.</p>", whisper: gms });`, { highlight: [1, 2] })
    ]),
    section("use-case", "use-case", "From the workshop to your hotbar", [
      steps(["Build the macro in the workshop and run it in Foundry Preview until the three messages look right.", "If you are the GM, switch to Live, read the code once more, confirm, and watch it appear in real chat.", "Use the workshop's 'Create or update a Macro document' button. The academy asks before creating anything and never overwrites a macro without showing you which one.", "Drag the new macro from the Macro Directory to your hotbar."]),
      note("Players can do everything except the live run and the macro export if the GM has not enabled those in the module settings. The learning is identical.")
    ]),
    section("common-mistakes", "common-mistakes", "Common mistakes", [
      list(["Misspelling a field (`contents`, `wisper`): no error, wrong result.", "Forgetting `await`, then wondering why messages sometimes swap order.", "Putting the GM note before the banner, so the private line is not at the end where you expect it.", "Using the `<script>` tag in content. Foundry strips it; chat is not a place to run code."])
    ]),
    section("debugging", "debugging", "Checking a whisper", [
      steps(["In preview, look for the 'whisper' badge on the message.", "Live, open chat as a player (or ask one) and confirm the note is absent.", "If it is visible, log `gms` with `console.log(gms)` and check it is an array of id strings, not objects."])
    ]),
    section("summary", "summary", "Summary", [
      list(["A multi-message macro is just several `create` calls in order, each awaited.", "`whisper` takes user ids; `getWhisperRecipients(\"GM\").map(u => u.id)` produces them.", "Misspelled fields fail silently. Test visibility in preview.", "Export only what you understand; the academy never creates a macro without asking."])
    ])
  ],
  exercises: [
    mc({ id: "t0-welcome-macro-whisper", title: "Who sees it?", prompt: "`whisper: ChatMessage.getWhisperRecipients(\"GM\").map(u => u.id)` is set on a message. Who can read it?", options: [["a", "Everyone"], ["b", "Gamemaster users and the author"], ["c", "Only the first player"]], answer: "b", explanation: "Whispered messages are visible to the listed recipients and to the author.", concepts: ["chat"], hints: ["Whisper means private to the listed users."] }),
    codeEx({ id: "t0-welcome-macro-session", type: "complete-macro", title: "Add the session line", prompt: "The banner is written. Add a second public message, after it, containing the words `Session 1`.", runtime: "preview", starter: `await ChatMessage.create({ content: "<h2>Welcome, heroes</h2>" });\n// Add the session line here\n`,
      tests: [{ name: "Runs without errors", expectNoError: true }, { name: "Two messages", expectChat: { count: 2 } }, { name: "Banner first, then the session line", expectChat: { matches: "Welcome, heroes[\\s\\S]*Session 1" } }],
      hints: ["Copy the first line and change the content.", "Keep `await` so the order is guaranteed.", "`await ChatMessage.create({ content: \"<p>Session 1: into the mines.</p>\" });`"],
      reveal: [{ title: "Second message", code: `await ChatMessage.create({ content: "<h2>Welcome, heroes</h2>" });\nawait ChatMessage.create({ content: "<p>Session 1: into the mines.</p>" });` }],
      solution: { code: `await ChatMessage.create({ content: "<h2>Welcome, heroes</h2>" });\nawait ChatMessage.create({ content: "<p>Session 1: into the mines.</p>" });`, explanation: "Two awaited creates post two messages in order." },
      concepts: ["chat", "sequencing"], criteria: ["Two messages are posted in order.", "The second contains 'Session 1'."] })
  ],
  checkpoint: { passScore: 0.75, questions: [
    q("t0-welcome-macro-q1", "You misspell `content` as `contents`. What happens?", [["a", "A syntax error"], ["b", "The message is created with empty content, no error"], ["c", "Foundry corrects the spelling"]], "b", "Unknown fields are ignored; the required field is missing, so the message is blank. A silent logic error."),
    q("t0-welcome-macro-q2", "Why `await` each `ChatMessage.create`?", [["a", "To make sure each message is posted before the next"], ["b", "Because create does not work without it"], ["c", "To make the message a whisper"]], "a", "Awaiting guarantees ordering and surfaces errors on the right line."),
    q("t0-welcome-macro-q3", "The academy's 'Create macro' button finds a macro with the same name that you own. What does it do?", [["a", "Overwrites it immediately"], ["b", "Asks whether to replace it or create a new copy"], ["c", "Refuses"]], "b", "Existing macros are never silently overwritten.")
  ] },
  challenge: codeEx({ id: "t0-welcome-macro-build", type: "build-project", title: "Your campaign's welcome macro", prompt: "Write the full welcome macro: (1) a public banner containing the word `Welcome`, (2) a public session line containing `Session`, (3) a GM-only whisper containing `GM note`, in that order. Use your own campaign names.", runtime: "preview", starter: `// 1. Public banner\n// 2. Public session line\n// 3. GM-only whisper\n`,
    tests: [{ name: "Runs without errors", expectNoError: true }, { name: "Three messages", expectChat: { count: 3 } }, { name: "Order: Welcome, Session, GM note", expectChat: { matches: "Welcome[\\s\\S]*Session[\\s\\S]*GM note" } }, { name: "The note is whispered", expectChat: { whisperToGM: true } }],
    hints: ["Three `await ChatMessage.create(...)` statements.", "The whisper needs `whisper: ChatMessage.getWhisperRecipients(\"GM\").map(u => u.id)`.", "Order follows the order of the statements."],
    reveal: [{ title: "Banner and session", code: `await ChatMessage.create({ content: "<h2>Welcome back to Greyhollow</h2>" });\nawait ChatMessage.create({ content: "<p>Session 7: the siege begins.</p>" });` }, { title: "The whisper", code: `await ChatMessage.create({ content: "<h2>Welcome back to Greyhollow</h2>" });\nawait ChatMessage.create({ content: "<p>Session 7: the siege begins.</p>" });\nconst gms = ChatMessage.getWhisperRecipients("GM").map(u => u.id);\nawait ChatMessage.create({ content: "<p><em>GM note: the mayor has the key.</em></p>", whisper: gms });` }],
    solution: { code: `await ChatMessage.create({ content: "<h2>Welcome back to Greyhollow</h2>" });\nawait ChatMessage.create({ content: "<p>Session 7: the siege begins.</p>" });\nconst gms = ChatMessage.getWhisperRecipients("GM").map(u => u.id);\nawait ChatMessage.create({ content: "<p><em>GM note: the mayor has the key.</em></p>", whisper: gms });`, explanation: "Three ordered messages, the last one whispered to every GM user. Your own text passes just as well: the checks look for the key words and the whisper, not for this exact wording." },
    concepts: ["chat", "sequencing", "project"], criteria: ["Three messages in the required order.", "The third is whispered to the GM.", "No errors."] }),
  reinforces: ["t0-what-is-code", "t0-reading-code", "t0-what-macros-touch"], documentation: [DOCS.chatMessage, DOCS.macrosArticle],
  completion: { required: ["t0-welcome-macro-session", "t0-welcome-macro-build"], checkpoint: true, criterion: "Build the three-message welcome macro so every check passes and pass the checkpoint." }
});
