/**
 * Small constructors that keep lesson files short. They only build plain data objects; nothing here executes
 * lesson content. See docs/curriculum-authoring.md.
 */

/* Blocks */
export const p = text => ({ type: "paragraph", text });
export const h = text => ({ type: "heading", text });
export const list = (items, ordered=false) => ({ type: "list", items, ordered });
export const steps = items => ({ type: "steps", items });
export const callout = (variant, text, title=undefined) => ({ type: "callout", variant, text, ...(title ? { title } : {}) });
export const tip = (text, title) => callout("tip", text, title);
export const note = (text, title) => callout("note", text, title);
export const warn = (text, title) => callout("warning", text, title);
export const danger = (text, title) => callout("danger", text, title);
export const table = (headers, rows) => ({ type: "table", headers, rows });
export const term = (t, text=undefined) => ({ type: "term", term: t, ...(text ? { text } : {}) });

/** Plain JavaScript example executed by the test suite in the sandbox. */
export const js = (code, extra={}) => ({ type: "code", language: "javascript", code, compat: { target: "javascript", tested: "node" }, runnable: "sandbox", ...extra });
/** JavaScript fragment (not a complete program): syntax-checked only. */
export const jsFragment = (code, extra={}) => ({ type: "code", language: "javascript", code, compat: { target: "javascript", tested: "static" }, fragment: true, ...extra });
/** Foundry example executed by the test suite in the emulator (preview). */
export const fvtt = (code, extra={}) => ({ type: "code", language: "javascript", code, compat: { target: "foundry", tested: "emulator", foundryVersion: "V14" }, runnable: "preview", ...extra });
/** Foundry example verified against documentation and syntax-checked but not executed (API outside the emulator). */
export const fvttStatic = (code, extra={}) => ({ type: "code", language: "javascript", code, compat: { target: "foundry", tested: "static", foundryVersion: "V14 (14.369 docs)" }, fragment: true, ...extra });
/** dnd5e example executed in the emulator. */
export const dnd = (code, extra={}) => ({ type: "code", language: "javascript", code, compat: { target: "dnd5e", tested: "emulator", systemVersion: "6.0.6" }, runnable: "preview", ...extra });
/** dnd5e example checked against the 6.0.6 source but not executed. */
export const dndStatic = (code, extra={}) => ({ type: "code", language: "javascript", code, compat: { target: "dnd5e", tested: "static", systemVersion: "6.0.6 (source read)" }, fragment: true, ...extra });
/** Pseudocode / shell / json blocks (never executed). */
export const pseudo = (code, extra={}) => ({ type: "code", language: "text", code, compat: { target: "pseudocode", tested: "none" }, ...extra });
export const json = (code, extra={}) => ({ type: "code", language: "json", code, compat: { target: "json", tested: "none" }, ...extra });
export const shell = (code, extra={}) => ({ type: "code", language: "text", code, compat: { target: "shell", tested: "none" }, ...extra });
export const html = (code, extra={}) => ({ type: "code", language: "html", code, compat: { target: "html", tested: "none" }, ...extra });

/* Sections */
export const section = (id, kind, title, blocks) => ({ id, kind, title, blocks });

/* Options */
const opts = options => options.map(([id, text]) => ({ id, text }));

/* Exercises */
export const mc = ({ id, title, prompt, options, answer, explanation, concepts, hints=[], criteria=["The selected option(s) match the correct answer."] }) => ({ id, type: "multiple-choice", title, prompt, options: opts(options), answer, explanation, concepts, hints, criteria });
export const predict = ({ id, title, prompt, code, answer, explanation, concepts, hints=[], criteria=["Your predicted output matches what the program prints, line for line (whitespace at line ends is ignored)."] }) => ({ id, type: "predict-output", title, prompt, code, answer, explanation, concepts, hints, criteria });
export const fill = ({ id, title, prompt, code, blanks, explanation, concepts, hints=[], criteria=["Every blank is filled with an accepted answer (case and spacing are ignored)."] }) => ({ id, type: "fill-blank", title, prompt, code, blanks: blanks.map(b => Array.isArray(b) ? { accept: b } : b), explanation, concepts, hints, criteria });
export const identify = ({ id, title, prompt, code, answer, explanation, concepts, hints=[], criteria=["Exactly the faulty line(s) are selected."] }) => ({ id, type: "identify-error", title, prompt, code, answer, explanation, concepts, hints, criteria });
export const reorder = ({ id, title, prompt, steps: st, answer, explanation, concepts, hints=[], criteria=["Every step is in the correct order."] }) => ({ id, type: "reorder-steps", title, prompt, steps: st.map(([sid, text]) => ({ id: sid, text })), answer, explanation, concepts, hints, criteria });
export const explain = ({ id, title, prompt, code, rubric, modelAnswer, concepts, hints=[], minWords=20, criteria=["Your explanation covers every rubric item (self-assessed) and is at least a few sentences long."] }) => ({ id, type: "explain-code", title, prompt, code, rubric: rubric.map((r, i) => Array.isArray(r) ? { id: r[0], text: r[1] } : { id: `${id}-r${i + 1}`, text: String(r) }), modelAnswer, concepts, hints, minWords, criteria });
export const discover = ({ id, title, prompt, accept, explanation, concepts, hints=[], runtime="preview", placeholder=undefined, criteria=["Your answer matches one of the accepted property paths or API names (spacing and case are ignored)."] }) => ({ id, type: "api-discovery", title, prompt, accept, explanation, concepts, hints, runtime, placeholder, criteria });
export const codeEx = ({ id, type="write-function", title, prompt, starter, runtime="sandbox", tests, solution, reveal, hints, concepts, criteria, inputs=undefined, snapshot=undefined, seed=undefined }) => ({ id, type, title, prompt, starter, runtime, tests, solution, reveal, hints, concepts, criteria, ...(inputs ? { inputs } : {}), ...(snapshot ? { snapshot } : {}), ...(seed !== undefined ? { seed } : {}) });
export const capstone = ({ id, title, prompt, requirements, rubric, evidence, concepts, hints=[], minWords=60, criteria=["Every requirement is demonstrably met in the declared environment.", "The rubric is self-assessed honestly and the write-up explains the design decisions."] }) => ({ id, type: "capstone", title, prompt, requirements, rubric: rubric.map((r, i) => Array.isArray(r) ? { id: r[0], text: r[1] } : { id: `${id}-r${i + 1}`, text: String(r) }), evidence, concepts, hints, minWords, criteria });

/* Checkpoint question */
export const q = (id, prompt, options, answer, explanation) => ({ id, prompt, options: opts(options), answer, explanation });

/* Documentation link */
export const doc = (title, url, verified="2026-10 (V14 API docs)") => ({ title, url, verified });

/** Common Foundry documentation links. */
export const DOCS = Object.freeze({
  api: doc("Foundry VTT API documentation (V14)", "https://foundryvtt.com/api/"),
  chatMessage: doc("ChatMessage (API)", "https://foundryvtt.com/api/classes/foundry.documents.ChatMessage.html"),
  dialogV2: doc("DialogV2 (API)", "https://foundryvtt.com/api/classes/foundry.applications.api.DialogV2.html"),
  roll: doc("Roll (API)", "https://foundryvtt.com/api/classes/foundry.dice.Roll.html"),
  hooks: doc("Hooks (API)", "https://foundryvtt.com/api/classes/foundry.helpers.Hooks.html"),
  hookEvents: doc("Hook events reference", "https://foundryvtt.com/api/modules/hookEvents.html"),
  actor: doc("Actor (API)", "https://foundryvtt.com/api/classes/foundry.documents.Actor.html"),
  token: doc("Token placeable (API)", "https://foundryvtt.com/api/classes/foundry.canvas.placeables.Token.html"),
  tokenDocument: doc("TokenDocument (API)", "https://foundryvtt.com/api/classes/foundry.documents.TokenDocument.html"),
  user: doc("User (API)", "https://foundryvtt.com/api/classes/foundry.documents.User.html"),
  combat: doc("Combat (API)", "https://foundryvtt.com/api/classes/foundry.documents.Combat.html"),
  settings: doc("ClientSettings (API)", "https://foundryvtt.com/api/classes/foundry.helpers.ClientSettings.html"),
  macro: doc("Macro (API)", "https://foundryvtt.com/api/classes/foundry.documents.Macro.html"),
  utils: doc("foundry.utils helpers", "https://foundryvtt.com/api/modules/foundry.utils.html"),
  appV2: doc("ApplicationV2 (API)", "https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html"),
  macrosArticle: doc("Macros (Knowledge Base)", "https://foundryvtt.com/article/macros/"),
  usersArticle: doc("Users and permissions (Knowledge Base)", "https://foundryvtt.com/article/users/"),
  moduleDev: doc("Introduction to module development (Knowledge Base)", "https://foundryvtt.com/article/module-development/"),
  packageDev: doc("Package development (Knowledge Base)", "https://foundryvtt.com/article/package-development/"),
  mdnJs: doc("MDN: JavaScript guide", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", "2026-10"),
  mdnAsync: doc("MDN: async functions", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function", "2026-10"),
  mdnArray: doc("MDN: Array", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array", "2026-10"),
  mdnErrors: doc("MDN: Error", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error", "2026-10"),
  dnd5eRepo: doc("dnd5e system source (release-6.0.6)", "https://github.com/foundryvtt/dnd5e/tree/release-6.0.6", "6.0.6"),
  dnd5eWiki: doc("dnd5e system wiki", "https://github.com/foundryvtt/dnd5e/wiki", "2026-10"),
  midiQol: doc("Midi-QOL repository (dnd6 branch)", "https://gitlab.com/tposney/midi-qol/-/tree/dnd6", "14.6.2"),
  git: doc("Pro Git book (free)", "https://git-scm.com/book/en/v2", "2026-10")
});

/* Lesson */
export function lesson({ id, tier, topic, title, summary, minutes, difficulty, category, prerequisites, objectives, access, requirements=undefined, sections, exercises, checkpoint, challenge, reinforces, documentation, completion, version=1 }) {
  return { id, version, tier, topic, title, summary, estimatedMinutes: minutes, difficulty, category, prerequisites, objectives, access, ...(requirements ? { requirements } : {}), sections, exercises, checkpoint, challenge, reinforces, documentation, completion };
}

export const ACCESS = Object.freeze({
  none: { reads: false, writes: false, creates: false, mechanics: false },
  read: { reads: true, writes: false, creates: false, mechanics: false },
  write: { reads: true, writes: true, creates: false, mechanics: false },
  create: { reads: true, writes: true, creates: true, mechanics: false },
  mechanics: { reads: true, writes: true, creates: false, mechanics: true },
  full: { reads: true, writes: true, creates: true, mechanics: true }
});

export const DND5E_REQ = Object.freeze({ system: { id: "dnd5e", title: "Dungeons & Dragons Fifth Edition", minimum: "6.0.0", verified: "6.0.6" }, alternative: "Without dnd5e active, read the lesson and run the preview exercises: the practice snapshot always uses dnd5e-shaped data." });
