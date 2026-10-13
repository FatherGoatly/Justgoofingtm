/**
 * Plain-English explanations for common JavaScript and Foundry errors. The explainer only ever describes the
 * error it was given; when it recognises nothing, it says so instead of inventing a diagnosis.
 */

/**
 * @typedef {object} Explanation
 * @property {string} title
 * @property {string} explanation
 * @property {string[]} causes
 * @property {string[]} investigate
 * @property {string|null} lessonId
 * @property {boolean} confirmed      True when the message pattern is specific enough to be a diagnosis
 */

const RULES = [
  {
    test: e => e.name === "SyntaxError" && /Unexpected end of input/i.test(e.message),
    title: "The program ends before a block is closed",
    explanation: "JavaScript reached the end of your code while still waiting for something: usually a closing brace `}`, bracket `]` or parenthesis `)`.",
    causes: ["A `{` opened a block (if, for, function) that was never closed.", "A string or template literal was not closed, so the rest of the program was swallowed."],
    investigate: ["Count opening and closing braces; the editor highlights the matching one when the cursor is next to it.", "Look at the last few lines: every `(` needs a `)` on the same statement."],
    lessonId: "t0-reading-errors", confirmed: true
  },
  {
    test: e => e.name === "SyntaxError" && /Unexpected token|Unexpected identifier|Unexpected string|Unexpected number/i.test(e.message),
    title: "JavaScript found something it did not expect",
    explanation: "A syntax error means the code could not even be read. The message names the token (word or symbol) where reading failed, which is usually just after the real mistake.",
    causes: ["A missing comma, parenthesis or quote earlier on the line.", "Using a word JavaScript reserves (like `const`, `class`) as a variable name.", "Pasting text with smart quotes (“ ”) instead of straight quotes."],
    investigate: ["Read the line named in the message and the one before it.", "Check that every string starts and ends with the same quote character."],
    lessonId: "t0-reading-errors", confirmed: true
  },
  {
    test: e => e.name === "SyntaxError" && /Missing initializer in const/i.test(e.message),
    title: "A const must be given a value when declared",
    explanation: "`const` creates a variable that can never be reassigned, so it must receive its value on the same line.",
    causes: ["`const total;` written without `= something`."],
    investigate: ["Use `let` if the value is assigned later, or give the const its value immediately."],
    lessonId: "t1-variables", confirmed: true
  },
  {
    test: e => e.name === "SyntaxError" && /await is only valid/i.test(e.message),
    title: "await used outside an async function",
    explanation: "Top-level `await` works in macros, but inside a normal function you must mark the function `async` before `await` is allowed.",
    causes: ["`function doThing() { await ... }` without the `async` keyword."],
    investigate: ["Add `async` before `function` (or before the arrow function parameters)."],
    lessonId: "t4-async-await", confirmed: true
  },
  {
    test: e => e.name === "ReferenceError" && /is not defined/i.test(e.message),
    title: m => `"${m}" does not exist here`,
    extract: e => /^(.+?) is not defined/.exec(e.message)?.[1],
    explanation: "You used a name that JavaScript cannot find: no variable, function or Foundry global with that exact spelling exists in this scope.",
    causes: ["A typo or different capitalisation (JavaScript is case-sensitive: `Actor` and `actor` are different).", "The variable was declared inside a block or function and you are using it outside.", "The name belongs to another environment (for example `game` inside the Concept Sandbox, or `alert` inside Foundry)."],
    investigate: ["Search your code for where the name is declared. If it is not declared, declare it or fix the spelling.", "If it is a Foundry global, make sure you are running in Foundry Preview or Live mode."],
    lessonId: "t1-scope", confirmed: true
  },
  {
    test: e => e.name === "ReferenceError" && /before initialization/i.test(e.message),
    title: "A variable was used before its declaration line ran",
    explanation: "`let` and `const` variables exist only after the line that declares them has executed. Using them earlier raises this error (the 'temporal dead zone').",
    causes: ["Calling a function that uses a `const` declared further down the file, before that line ran."],
    investigate: ["Move the declaration above the first use."],
    lessonId: "t1-scope", confirmed: true
  },
  {
    test: e => e.name === "TypeError" && /Cannot read propert(y|ies) of (undefined|null)/i.test(e.message),
    title: "Reading a property of nothing",
    extract: e => /reading '([^']+)'/.exec(e.message)?.[1],
    explanation: "Something before the dot was `undefined` or `null`, so there was no object to read the property from. The error names the property you tried to read, not the thing that was missing.",
    causes: ["No token was selected, so `canvas.tokens.controlled[0]` was undefined.", "A lookup like `game.actors.getName(...)` found nothing.", "A dialog was cancelled and returned `null`.", "A property path has a typo one level up (for example `system.attribute` instead of `system.attributes`)."],
    investigate: ["Log the object just before the failing line: `console.log(thing)`.", "Check for the empty case first: `if (!token) { ui.notifications.warn(...); return; }`.", "Use optional chaining `?.` only when a missing value is genuinely acceptable."],
    lessonId: "t3-selected-tokens", confirmed: true
  },
  {
    test: e => e.name === "TypeError" && /is not a function/i.test(e.message),
    title: "Calling something that is not a function",
    extract: e => /^(.+?) is not a function/.exec(e.message)?.[1],
    explanation: "You wrote `something(...)`, but `something` is not a function: it may be undefined, a plain value, or the method name may be misspelled or belong to a different class.",
    causes: ["A method name typo (for example `actor.udpate`).", "Calling a method on a Collection that only Arrays have (use `.contents` first, or the Collection's own helpers).", "Calling a V1 API that no longer exists in V13+ (for example the global `renderTemplate`)."],
    investigate: ["Log `typeof something` right before the call.", "Check the API documentation for the exact method name and which class provides it."],
    lessonId: "t3-collections", confirmed: true
  },
  {
    test: e => e.name === "TypeError" && /is not iterable/i.test(e.message),
    title: "Looping over something that cannot be looped",
    explanation: "`for...of` and spread syntax need an iterable (array, Set, Map, Collection). The value was probably `undefined` or a plain object.",
    causes: ["Looping over `actor.items.contents` is fine, but looping over `undefined` because the lookup failed is not.", "Using `for...of` on a plain object: use `Object.entries(obj)` instead."],
    investigate: ["Log the value before the loop and check it is an array or collection."],
    lessonId: "t2-for-of", confirmed: true
  },
  {
    test: e => e.name === "TypeError" && /Assignment to constant variable/i.test(e.message),
    title: "Reassigning a const",
    explanation: "A `const` variable cannot be assigned a new value after its declaration.",
    causes: ["Declaring an accumulator with `const total = 0;` and then writing `total += x`."],
    investigate: ["Use `let` for values that change, `const` for values that do not."],
    lessonId: "t1-variables", confirmed: true
  },
  {
    test: e => /Permission denied|does not have permission|lacks permission|User .* lacks/i.test(e.message),
    title: "Foundry refused the change because of permissions",
    explanation: "The server checks every document change against the user's role and the document's ownership. This user is not allowed to make that change.",
    causes: ["A player updating an actor they do not own.", "A player creating a document type that requires a higher role (scenes, actors, items).", "A script run by a player that assumes GM authority."],
    investigate: ["Check `game.user.isGM` and `document.isOwner` before attempting the change.", "Design a GM-operated workflow (or ask the GM to grant ownership) instead of bypassing the check."],
    lessonId: "t3-permissions", confirmed: true
  },
  {
    test: e => /not part of the Foundry Preview emulation/i.test(e.message),
    title: "This API is not emulated in Foundry Preview",
    explanation: "The Foundry Preview runs against an emulator that covers the APIs the curriculum teaches. Your code called something outside that subset. It may work in Live mode.",
    causes: ["Using an application class, template rendering or canvas feature the emulator does not model."],
    investigate: ["Check the Workshop help panel for the emulated API list.", "Test the specific call in Live mode after reviewing what it does."],
    lessonId: null, confirmed: true
  },
  {
    test: e => /deprecated/i.test(e.message),
    title: "A deprecated API was used",
    explanation: "Foundry keeps old APIs for a few versions with a warning, then removes them. The emulator refuses them immediately so you learn the current form.",
    causes: ["Code copied from an older tutorial (V11/V12) that still uses `Dialog`, `renderTemplate` or `TextEditor` as globals."],
    investigate: ["Replace with the namespaced V13+ API named in the message."],
    lessonId: "t7-version-mismatch", confirmed: true
  },
  {
    test: e => e.name === "TimeoutError" || /exceeded .* ms/i.test(e.message),
    title: "The program never finished",
    explanation: "The sandbox stopped your program because it ran too long. Almost always this is a loop whose stopping condition never becomes true.",
    causes: ["`while (hp > 0)` where `hp` is never decreased inside the loop.", "A `for` loop whose counter moves the wrong way.", "Awaiting a promise that never resolves."],
    investigate: ["Add `console.log` inside the loop to print the loop variable each pass.", "Make sure the loop body changes the variable tested in the condition."],
    lessonId: "t2-while-loops", confirmed: true
  },
  {
    test: e => /not a registered game setting/i.test(e.message),
    title: "Reading a setting that was never registered",
    explanation: "`game.settings.get` only works for settings that were registered (by core, a system or a module) during initialisation.",
    causes: ["A typo in the namespace or key.", "Reading a module's setting while that module is disabled."],
    investigate: ["Check `game.settings.settings` for the exact key.", "Register your own settings in the `init` hook before using them."],
    lessonId: "t6-configuration", confirmed: true
  },
  {
    test: e => /Roll has not been evaluated|already been rolled/i.test(e.message),
    title: "Roll used in the wrong order",
    explanation: "A Roll must be evaluated exactly once before its total can be read.",
    causes: ["Reading `roll.total` before `await roll.evaluate()`.", "Calling `evaluate()` twice on the same Roll."],
    investigate: ["Create the roll, `await roll.evaluate()`, then use `roll.total` or `roll.toMessage()`."],
    lessonId: "t4-dice-announcer", confirmed: true
  }
];

/**
 * Explain an error.
 * @param {{name?:string, message?:string, line?:number|null}} error
 * @returns {Explanation}
 */
export function explainError(error) {
  const e = { name: String(error?.name ?? "Error"), message: String(error?.message ?? ""), line: error?.line ?? null };
  for ( const rule of RULES ) {
    if ( !rule.test(e) ) continue;
    const extracted = rule.extract ? rule.extract(e) : null;
    const title = typeof rule.title === "function" ? rule.title(extracted ?? "?") : rule.title;
    return { title, explanation: rule.explanation, causes: [...rule.causes], investigate: [...rule.investigate], lessonId: rule.lessonId, confirmed: rule.confirmed, extracted };
  }
  return {
    title: `${e.name}: not a message the academy recognises`,
    explanation: "The academy has no specific explanation for this message, so here is the general method instead of a guess.",
    causes: ["The message is the most reliable evidence. Read it word by word; it usually names the thing that was wrong."],
    investigate: ["Note the line number if there is one and read that line plus the one above.", "Reproduce the error with the smallest possible program.", "Search the exact message text together with 'Foundry VTT'."],
    lessonId: "t8-stack-traces", confirmed: false, extracted: null
  };
}
