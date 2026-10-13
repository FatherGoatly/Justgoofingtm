/**
 * The curriculum data model and its validator. Pure JavaScript: used by the module at runtime, by the test
 * suite, and by tools/validate-curriculum.mjs. See docs/curriculum-authoring.md for the human description.
 */
import { CATEGORIES, DIFFICULTIES } from "../core/constants.js";

/** Section kinds every lesson must provide, in the order they are displayed. */
export const REQUIRED_SECTION_KINDS = Object.freeze([
  "plain",            // Plain-English explanation
  "analogy",          // Tabletop-specific analogy
  "technical",        // Technical explanation
  "syntax",           // Syntax and terminology
  "example-minimal",  // Minimal working example
  "example-annotated",// Annotated code example (+ line-by-line notes)
  "incorrect",        // Example of incorrect code
  "why-fails",        // Why the incorrect version fails
  "corrected",        // Corrected implementation
  "use-case",         // Practical Foundry use case
  "common-mistakes",  // Common mistakes
  "debugging",        // Debugging guidance
  "summary"           // Summary
]);

export const OPTIONAL_SECTION_KINDS = Object.freeze(["deeper", "aside", "project"]);
export const SECTION_KINDS = Object.freeze([...REQUIRED_SECTION_KINDS, ...OPTIONAL_SECTION_KINDS]);

export const BLOCK_TYPES = Object.freeze(["paragraph", "heading", "list", "code", "callout", "table", "steps", "term"]);
export const CALLOUT_VARIANTS = Object.freeze(["tip", "note", "warning", "danger", "challenge"]);
export const CODE_TARGETS = Object.freeze(["javascript", "foundry", "dnd5e", "module", "pseudocode", "json", "html", "shell"]);
export const CODE_TESTED = Object.freeze(["node", "emulator", "static", "none"]);
export const RUNTIMES = Object.freeze(["sandbox", "preview", "live"]);

export const EXERCISE_TYPES = Object.freeze([
  "multiple-choice", "predict-output", "fill-blank", "identify-error", "repair-code", "write-function",
  "complete-macro", "reorder-steps", "explain-code", "debug-scenario", "api-discovery", "build-project", "capstone"
]);

/** Exercise types whose submission is code executed by the workshop. */
export const CODE_EXERCISE_TYPES = Object.freeze(["repair-code", "write-function", "complete-macro", "debug-scenario", "build-project"]);

/** Exercise types graded against a rubric the learner self-assesses (with model answers shown afterwards). */
export const RUBRIC_EXERCISE_TYPES = Object.freeze(["explain-code", "capstone"]);

export const TEST_KINDS = Object.freeze([
  "call", "expectOutput", "outputIncludes", "outputMatches", "expectNoError", "expectError", "expectChat",
  "expectNotification", "expectUpdate", "expectNoUpdate", "expectReturn", "returnMatches", "expectTimeout",
  "expectDialog", "expectCreate", "expectRoll", "codeIncludes", "codeExcludes", "expectHook"
]);

export const ACCESS_KEYS = Object.freeze(["reads", "writes", "creates", "mechanics"]);

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/[^\s]+$/;

/**
 * @typedef {object} ValidationIssue
 * @property {string} path
 * @property {string} message
 */

class Ctx {
  constructor(prefix) { this.prefix = prefix; this.issues = []; }
  err(path, message) { this.issues.push({ path: `${this.prefix}${path ? "." + path : ""}`, message }); }
}

function isString(v, min=1) { return typeof v === "string" && v.trim().length >= min; }
function isArray(v) { return Array.isArray(v); }
function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * Validate a single lesson object.
 * @param {object} lesson
 * @param {object} [options]
 * @param {Set<string>} [options.knownIds]      All lesson ids, for prerequisite/reinforces checks
 * @param {Set<string>} [options.knownTerms]    Glossary slugs, for term block checks
 * @returns {ValidationIssue[]}
 */
export function validateLesson(lesson, { knownIds=null, knownTerms=null }={}) {
  const c = new Ctx(`lesson(${lesson?.id ?? "?"})`);
  if ( !isObject(lesson) ) { c.err("", "lesson must be an object"); return c.issues; }
  if ( !isString(lesson.id) || !ID_RE.test(lesson.id) ) c.err("id", "id must be a kebab-case string");
  if ( !Number.isInteger(lesson.version) || lesson.version < 1 ) c.err("version", "version must be a positive integer");
  if ( !Number.isInteger(lesson.tier) || lesson.tier < 0 || lesson.tier > 9 ) c.err("tier", "tier must be an integer 0-9");
  if ( !isString(lesson.topic) ) c.err("topic", "topic is required");
  if ( !isString(lesson.title) ) c.err("title", "title is required");
  if ( !isString(lesson.summary) ) c.err("summary", "summary (one sentence) is required");
  if ( !Number.isFinite(lesson.estimatedMinutes) || lesson.estimatedMinutes <= 0 ) c.err("estimatedMinutes", "estimatedMinutes must be a positive number");
  if ( !DIFFICULTIES.includes(lesson.difficulty) ) c.err("difficulty", `difficulty must be one of ${DIFFICULTIES.join(", ")}`);
  if ( !Object.values(CATEGORIES).includes(lesson.category) ) c.err("category", `category must be one of ${Object.values(CATEGORIES).join(", ")}`);
  if ( !isArray(lesson.prerequisites) ) c.err("prerequisites", "prerequisites must be an array");
  else lesson.prerequisites.forEach((p, i) => {
    if ( !isString(p) ) c.err(`prerequisites[${i}]`, "must be a lesson id");
    else if ( knownIds && !knownIds.has(p) ) c.err(`prerequisites[${i}]`, `unknown lesson id "${p}"`);
    else if ( p === lesson.id ) c.err(`prerequisites[${i}]`, "a lesson cannot require itself");
  });
  if ( !isArray(lesson.objectives) || lesson.objectives.length < 2 ) c.err("objectives", "at least two learning objectives are required");
  else lesson.objectives.forEach((o, i) => { if ( !isString(o) ) c.err(`objectives[${i}]`, "must be a string"); });
  validateRequirements(lesson.requirements, c);
  if ( !isObject(lesson.access) ) c.err("access", "access {reads, writes, creates, mechanics} is required");
  else for ( const k of ACCESS_KEYS ) if ( typeof lesson.access[k] !== "boolean" ) c.err(`access.${k}`, "must be boolean");

  // Sections
  if ( !isArray(lesson.sections) ) c.err("sections", "sections must be an array");
  else {
    const kinds = lesson.sections.map(s => s?.kind);
    for ( const k of REQUIRED_SECTION_KINDS ) if ( !kinds.includes(k) ) c.err("sections", `missing required section kind "${k}"`);
    const seen = new Set();
    lesson.sections.forEach((s, i) => validateSection(s, i, c, seen, knownTerms));
    // Annotated example must contain an annotated code block
    const annotated = lesson.sections.find(s => s?.kind === "example-annotated");
    if ( annotated && !annotated.blocks?.some(b => b?.type === "code" && b.annotations?.length) ) c.err("sections(example-annotated)", "must contain a code block with line annotations");
    const incorrect = lesson.sections.find(s => s?.kind === "incorrect");
    if ( incorrect && !incorrect.blocks?.some(b => b?.type === "code") ) c.err("sections(incorrect)", "must contain a code block");
    const corrected = lesson.sections.find(s => s?.kind === "corrected");
    if ( corrected && !corrected.blocks?.some(b => b?.type === "code") ) c.err("sections(corrected)", "must contain a code block");
    const minimal = lesson.sections.find(s => s?.kind === "example-minimal");
    if ( minimal && !minimal.blocks?.some(b => b?.type === "code") ) c.err("sections(example-minimal)", "must contain a code block");
  }

  // Exercises
  if ( !isArray(lesson.exercises) || !lesson.exercises.length ) c.err("exercises", "at least one interactive exercise is required");
  else {
    const ids = new Set();
    lesson.exercises.forEach((e, i) => validateExercise(e, `exercises[${i}]`, c, ids, lesson));
  }
  // Checkpoint
  validateCheckpoint(lesson.checkpoint, c);
  // Challenge
  if ( !isObject(lesson.challenge) ) c.err("challenge", "a practical challenge exercise is required");
  else validateExercise(lesson.challenge, "challenge", c, new Set(), lesson);
  if ( lesson.challenge?.id && lesson.exercises?.some(e => e?.id === lesson.challenge.id) ) c.err("challenge.id", "must not duplicate an exercise id");

  if ( !isArray(lesson.reinforces) ) c.err("reinforces", "reinforces must be an array (may be empty for the first lesson)");
  else lesson.reinforces.forEach((r, i) => { if ( knownIds && !knownIds.has(r) ) c.err(`reinforces[${i}]`, `unknown lesson id "${r}"`); });
  if ( lesson.tier > 0 && isArray(lesson.reinforces) && !lesson.reinforces.length ) c.err("reinforces", "lessons after tier 0 must name at least one earlier concept they reinforce");

  if ( !isArray(lesson.documentation) ) c.err("documentation", "documentation must be an array");
  else lesson.documentation.forEach((d, i) => {
    if ( !isObject(d) || !isString(d.title) || !isString(d.url) || !URL_RE.test(d.url) ) c.err(`documentation[${i}]`, "needs {title, url(http/https)}");
    if ( isObject(d) && !isString(d.verified) ) c.err(`documentation[${i}].verified`, "needs a verified date or version note");
  });

  if ( !isObject(lesson.completion) ) c.err("completion", "completion criteria are required");
  else {
    if ( !isArray(lesson.completion.required) ) c.err("completion.required", "must list required exercise ids");
    else {
      const all = new Set([...(lesson.exercises ?? []).map(e => e?.id), lesson.challenge?.id]);
      lesson.completion.required.forEach((id, i) => { if ( !all.has(id) ) c.err(`completion.required[${i}]`, `unknown exercise id "${id}"`); });
      if ( !lesson.completion.required.length ) c.err("completion.required", "must require at least one exercise");
    }
    if ( typeof lesson.completion.checkpoint !== "boolean" ) c.err("completion.checkpoint", "must be boolean");
    if ( !isString(lesson.completion.criterion) ) c.err("completion.criterion", "a plain-English completion criterion is required");
  }
  return c.issues;
}

function validateRequirements(req, c) {
  if ( req === undefined ) return;
  if ( !isObject(req) ) { c.err("requirements", "must be an object"); return; }
  if ( req.system !== undefined ) {
    if ( !isObject(req.system) || !isString(req.system.id) ) c.err("requirements.system", "needs {id, title?, minimum?}");
  }
  if ( req.modules !== undefined ) {
    if ( !isArray(req.modules) ) c.err("requirements.modules", "must be an array");
    else req.modules.forEach((m, i) => { if ( !isObject(m) || !isString(m.id) || typeof m.optional !== "boolean" ) c.err(`requirements.modules[${i}]`, "needs {id, optional:boolean, title?, minimum?}"); });
  }
}

function validateSection(s, i, c, seen, knownTerms) {
  const p = `sections[${i}]`;
  if ( !isObject(s) ) { c.err(p, "must be an object"); return; }
  if ( !isString(s.id) || !ID_RE.test(s.id) ) c.err(`${p}.id`, "kebab-case id required");
  else if ( seen.has(s.id) ) c.err(`${p}.id`, `duplicate section id "${s.id}"`);
  else seen.add(s.id);
  if ( !SECTION_KINDS.includes(s.kind) ) c.err(`${p}.kind`, `unknown section kind "${s.kind}"`);
  if ( !isString(s.title) ) c.err(`${p}.title`, "title required");
  if ( !isArray(s.blocks) || !s.blocks.length ) c.err(`${p}.blocks`, "at least one block required");
  else s.blocks.forEach((b, j) => validateBlock(b, `${p}.blocks[${j}]`, c, knownTerms));
}

export function validateBlock(b, p, c, knownTerms=null) {
  if ( !isObject(b) ) { c.err(p, "block must be an object"); return; }
  if ( !BLOCK_TYPES.includes(b.type) ) { c.err(`${p}.type`, `unknown block type "${b.type}"`); return; }
  switch ( b.type ) {
    case "paragraph": case "heading":
      if ( !isString(b.text) ) c.err(`${p}.text`, "text required");
      break;
    case "list": case "steps":
      if ( !isArray(b.items) || !b.items.length || !b.items.every(x => isString(x)) ) c.err(`${p}.items`, "non-empty string array required");
      break;
    case "callout":
      if ( !CALLOUT_VARIANTS.includes(b.variant) ) c.err(`${p}.variant`, `variant must be one of ${CALLOUT_VARIANTS.join(", ")}`);
      if ( !isString(b.text) ) c.err(`${p}.text`, "text required");
      break;
    case "table":
      if ( !isArray(b.headers) || !b.headers.every(h => isString(h)) ) c.err(`${p}.headers`, "headers must be strings");
      if ( !isArray(b.rows) || !b.rows.every(r => isArray(r) && r.every(x => typeof x === "string" || typeof x === "number")) ) c.err(`${p}.rows`, "rows must be arrays of strings/numbers");
      break;
    case "term":
      if ( !isString(b.term) ) c.err(`${p}.term`, "term required");
      if ( knownTerms && isString(b.term) && !knownTerms.has(b.term) ) c.err(`${p}.term`, `unknown glossary term "${b.term}"`);
      break;
    case "code":
      validateCode(b, p, c);
      break;
  }
}

function validateCode(b, p, c) {
  if ( typeof b.code !== "string" ) c.err(`${p}.code`, "code must be a string");
  if ( b.language !== undefined && !isString(b.language) ) c.err(`${p}.language`, "language must be a string");
  if ( !isObject(b.compat) ) { c.err(`${p}.compat`, "compat {target, tested} is required for every code block"); return; }
  if ( !CODE_TARGETS.includes(b.compat.target) ) c.err(`${p}.compat.target`, `target must be one of ${CODE_TARGETS.join(", ")}`);
  if ( !CODE_TESTED.includes(b.compat.tested) ) c.err(`${p}.compat.tested`, `tested must be one of ${CODE_TESTED.join(", ")}`);
  if ( b.compat.target === "dnd5e" && !isString(b.compat.systemVersion) ) c.err(`${p}.compat.systemVersion`, "dnd5e examples must state the system version they were checked against");
  if ( b.runnable !== undefined && b.runnable !== null && !RUNTIMES.includes(b.runnable) ) c.err(`${p}.runnable`, `runnable must be one of ${RUNTIMES.join(", ")}`);
  if ( (b.compat.tested === "node" || b.compat.tested === "emulator") && !b.runnable && !b.fragment ) c.err(`${p}.runnable`, "blocks claiming node/emulator testing must be runnable (or marked fragment:true)");
  if ( b.compat.tested === "node" && b.runnable && b.runnable !== "sandbox" ) c.err(`${p}.compat.tested`, "node-tested blocks run in the sandbox");
  if ( b.compat.tested === "emulator" && b.runnable && b.runnable !== "preview" ) c.err(`${p}.compat.tested`, "emulator-tested blocks run in preview");
  if ( b.annotations !== undefined ) {
    if ( !isArray(b.annotations) ) c.err(`${p}.annotations`, "must be an array");
    else {
      const lineCount = String(b.code ?? "").split("\n").length;
      b.annotations.forEach((a, i) => {
        if ( !isObject(a) || !Number.isInteger(a.line) || !isString(a.note) ) c.err(`${p}.annotations[${i}]`, "needs {line, note}");
        else if ( a.line < 1 || a.line > lineCount ) c.err(`${p}.annotations[${i}].line`, `line ${a.line} is outside the code (1-${lineCount})`);
      });
    }
  }
  if ( b.expectError !== undefined && typeof b.expectError !== "boolean" ) c.err(`${p}.expectError`, "must be boolean");
  if ( b.inputs !== undefined && !isArray(b.inputs) ) c.err(`${p}.inputs`, "scripted dialog inputs must be an array");
}

export function validateExercise(e, p, c, ids, lesson) {
  if ( !isObject(e) ) { c.err(p, "exercise must be an object"); return; }
  if ( !isString(e.id) || !ID_RE.test(e.id) ) c.err(`${p}.id`, "kebab-case id required");
  else if ( ids.has(e.id) ) c.err(`${p}.id`, `duplicate exercise id "${e.id}"`);
  else ids.add(e.id);
  if ( lesson?.id && isString(e.id) && !e.id.startsWith(`${String(lesson.id).split("-")[0]}-`) ) c.err(`${p}.id`, `exercise ids must start with the lesson's tier prefix ("${String(lesson.id).split("-")[0]}-")`);
  if ( !EXERCISE_TYPES.includes(e.type) ) { c.err(`${p}.type`, `unknown exercise type "${e.type}"`); return; }
  if ( !isString(e.title) ) c.err(`${p}.title`, "title required");
  if ( !isString(e.prompt) ) c.err(`${p}.prompt`, "prompt required");
  if ( !isArray(e.concepts) || !e.concepts.length ) c.err(`${p}.concepts`, "concept tags required (used for adaptive review)");
  if ( !isArray(e.hints) ) c.err(`${p}.hints`, "hints array required (may be empty for capstones)");
  else e.hints.forEach((h, i) => { if ( !isString(h) ) c.err(`${p}.hints[${i}]`, "hint must be a string"); });
  if ( !isArray(e.criteria) || !e.criteria.length ) c.err(`${p}.criteria`, "assessment criteria (plain English) required");
  const needCode = CODE_EXERCISE_TYPES.includes(e.type);
  switch ( e.type ) {
    case "multiple-choice":
      validateOptions(e, p, c);
      break;
    case "predict-output":
      if ( typeof e.code !== "string" ) c.err(`${p}.code`, "code required");
      if ( !isString(e.answer, 0) && !isArray(e.answer) ) c.err(`${p}.answer`, "expected output required (string or array of accepted strings)");
      if ( !isString(e.explanation) ) c.err(`${p}.explanation`, "explanation required");
      break;
    case "fill-blank":
      if ( typeof e.code !== "string" || !e.code.includes("____") ) c.err(`${p}.code`, "code with ____ placeholders required");
      if ( !isArray(e.blanks) || !e.blanks.length ) c.err(`${p}.blanks`, "blanks required");
      else {
        const count = (e.code?.match(/____/g) ?? []).length;
        if ( count !== e.blanks.length ) c.err(`${p}.blanks`, `code has ${count} placeholders but ${e.blanks.length} blank definitions`);
        e.blanks.forEach((b, i) => { if ( !isObject(b) || !isArray(b.accept) || !b.accept.length ) c.err(`${p}.blanks[${i}]`, "needs {accept:[...]}"); });
      }
      if ( !isString(e.explanation) ) c.err(`${p}.explanation`, "explanation required");
      break;
    case "identify-error":
      if ( typeof e.code !== "string" ) c.err(`${p}.code`, "code required");
      if ( !isArray(e.answer) || !e.answer.every(n => Number.isInteger(n)) ) c.err(`${p}.answer`, "answer must be an array of line numbers");
      else {
        const lines = String(e.code ?? "").split("\n").length;
        e.answer.forEach((n, i) => { if ( n < 1 || n > lines ) c.err(`${p}.answer[${i}]`, `line ${n} outside code`); });
      }
      if ( !isString(e.explanation) ) c.err(`${p}.explanation`, "explanation required");
      break;
    case "reorder-steps":
      if ( !isArray(e.steps) || e.steps.length < 3 ) c.err(`${p}.steps`, "at least three steps required");
      else {
        const stepIds = new Set(e.steps.map(s => s?.id));
        e.steps.forEach((s, i) => { if ( !isObject(s) || !isString(s.id) || !isString(s.text) ) c.err(`${p}.steps[${i}]`, "needs {id, text}"); });
        if ( !isArray(e.answer) || e.answer.length !== e.steps.length || !e.answer.every(id => stepIds.has(id)) ) c.err(`${p}.answer`, "answer must order every step id exactly once");
      }
      if ( !isString(e.explanation) ) c.err(`${p}.explanation`, "explanation required");
      break;
    case "explain-code":
      if ( typeof e.code !== "string" ) c.err(`${p}.code`, "code required");
      validateRubric(e, p, c);
      if ( !isString(e.modelAnswer) ) c.err(`${p}.modelAnswer`, "modelAnswer required");
      break;
    case "api-discovery":
      if ( !isArray(e.accept) || !e.accept.length ) c.err(`${p}.accept`, "accepted answers required");
      if ( !isString(e.explanation) ) c.err(`${p}.explanation`, "explanation required");
      if ( e.runtime !== undefined && !RUNTIMES.includes(e.runtime) ) c.err(`${p}.runtime`, "invalid runtime");
      break;
    case "capstone":
      if ( !isArray(e.requirements) || e.requirements.length < 3 ) c.err(`${p}.requirements`, "at least three requirements");
      validateRubric(e, p, c);
      if ( !isArray(e.evidence) || !e.evidence.length ) c.err(`${p}.evidence`, "evidence list required");
      break;
  }
  if ( needCode ) {
    if ( typeof e.starter !== "string" ) c.err(`${p}.starter`, "starter code required (may be empty string)");
    if ( !RUNTIMES.includes(e.runtime) ) c.err(`${p}.runtime`, "runtime sandbox|preview|live required");
    if ( e.runtime === "live" ) c.err(`${p}.runtime`, "automated exercises never run live; use preview and let learners run live afterwards");
    if ( !isArray(e.tests) || !e.tests.length ) c.err(`${p}.tests`, "at least one automated test required");
    else e.tests.forEach((tc, i) => validateTest(tc, `${p}.tests[${i}]`, c));
    if ( !isObject(e.solution) || typeof e.solution.code !== "string" || !isString(e.solution.explanation) ) c.err(`${p}.solution`, "solution {code, explanation} required");
    if ( !isArray(e.reveal) || !e.reveal.length ) c.err(`${p}.reveal`, "progressive reveal steps required");
    else e.reveal.forEach((r, i) => { if ( !isObject(r) || !isString(r.title) || (typeof r.code !== "string" && !isString(r.text)) ) c.err(`${p}.reveal[${i}]`, "needs {title, code|text}"); });
    if ( e.inputs !== undefined && !isArray(e.inputs) ) c.err(`${p}.inputs`, "scripted dialog inputs must be an array");
    if ( e.snapshot !== undefined && !isString(e.snapshot) ) c.err(`${p}.snapshot`, "snapshot must be a fixture name");
    if ( e.hints.length < 3 ) c.err(`${p}.hints`, "code exercises need at least three progressive hints");
  }
}

function validateOptions(e, p, c) {
  if ( !isArray(e.options) || e.options.length < 2 ) c.err(`${p}.options`, "at least two options");
  else {
    const optIds = new Set();
    e.options.forEach((o, i) => {
      if ( !isObject(o) || !isString(o.id) || !isString(o.text) ) c.err(`${p}.options[${i}]`, "needs {id, text}");
      else if ( optIds.has(o.id) ) c.err(`${p}.options[${i}].id`, "duplicate");
      else optIds.add(o.id);
    });
    const answers = isArray(e.answer) ? e.answer : [e.answer];
    if ( !answers.length || !answers.every(a => optIds.has(a)) ) c.err(`${p}.answer`, "answer must reference option ids");
  }
  if ( !isString(e.explanation) ) c.err(`${p}.explanation`, "explanation required");
}

function validateRubric(e, p, c) {
  if ( !isArray(e.rubric) || e.rubric.length < 2 ) c.err(`${p}.rubric`, "rubric with at least two items required");
  else e.rubric.forEach((r, i) => { if ( !isObject(r) || !isString(r.id) || !isString(r.text) ) c.err(`${p}.rubric[${i}]`, "needs {id, text}"); });
}

function validateTest(tc, p, c) {
  if ( !isObject(tc) ) { c.err(p, "test must be an object"); return; }
  if ( !isString(tc.name) ) c.err(`${p}.name`, "name required");
  const kinds = TEST_KINDS.filter(k => k in tc);
  if ( kinds.length !== 1 ) c.err(p, `exactly one test kind required (found: ${kinds.join(", ") || "none"})`);
  if ( "call" in tc ) {
    if ( !isString(tc.call) ) c.err(`${p}.call`, "function name required");
    if ( tc.args !== undefined && !isArray(tc.args) ) c.err(`${p}.args`, "args must be an array");
    if ( !("expect" in tc) && !("expectMatches" in tc) && !("expectType" in tc) && !("expectThrows" in tc) ) c.err(p, "call tests need expect, expectMatches, expectType or expectThrows");
  }
  if ( "expectOutput" in tc && !isArray(tc.expectOutput) && !isString(tc.expectOutput, 0) ) c.err(`${p}.expectOutput`, "string or array required");
  if ( "expectUpdate" in tc && (!isObject(tc.expectUpdate) || !isString(tc.expectUpdate.path)) ) c.err(`${p}.expectUpdate`, "needs {name|uuid, path, value?}");
}

export function validateCheckpoint(cp, c) {
  if ( !isObject(cp) ) { c.err("checkpoint", "knowledge checkpoint required"); return; }
  if ( !isArray(cp.questions) || cp.questions.length < 2 ) c.err("checkpoint.questions", "at least two questions required");
  else {
    const seen = new Set();
    cp.questions.forEach((q, i) => {
      const p = `checkpoint.questions[${i}]`;
      if ( !isObject(q) ) { c.err(p, "must be an object"); return; }
      if ( !isString(q.id) ) c.err(`${p}.id`, "id required");
      else if ( seen.has(q.id) ) c.err(`${p}.id`, "duplicate");
      else seen.add(q.id);
      if ( !isString(q.prompt) ) c.err(`${p}.prompt`, "prompt required");
      validateOptions(q, p, c);
    });
  }
  if ( typeof cp.passScore !== "number" || cp.passScore <= 0 || cp.passScore > 1 ) c.err("checkpoint.passScore", "passScore must be in (0,1]");
}

/**
 * Validate a glossary entry.
 * @param {object} entry
 * @param {Set<string>} [knownIds]
 * @returns {ValidationIssue[]}
 */
export function validateTerm(entry, knownIds=null) {
  const c = new Ctx(`term(${entry?.slug ?? entry?.term ?? "?"})`);
  if ( !isObject(entry) ) { c.err("", "must be an object"); return c.issues; }
  if ( !isString(entry.term) ) c.err("term", "term required");
  if ( !isString(entry.slug) || !ID_RE.test(entry.slug) ) c.err("slug", "kebab-case slug required");
  if ( !isString(entry.plain) ) c.err("plain", "plain-English definition required");
  if ( !isString(entry.technical) ) c.err("technical", "technical definition required");
  if ( entry.analogy !== undefined && !isString(entry.analogy) ) c.err("analogy", "must be a string");
  if ( entry.example !== undefined && typeof entry.example !== "string" ) c.err("example", "must be a code string");
  if ( entry.misconception !== undefined && !isString(entry.misconception) ) c.err("misconception", "must be a string");
  if ( !isArray(entry.related) ) c.err("related", "related lesson ids required (may be empty)");
  else if ( knownIds ) entry.related.forEach((r, i) => { if ( !knownIds.has(r) ) c.err(`related[${i}]`, `unknown lesson id "${r}"`); });
  if ( !isArray(entry.tags) ) c.err("tags", "tags array required (e.g. javascript, foundry)");
  return c.issues;
}

/**
 * Validate a tier descriptor.
 * @param {object} tier
 * @returns {ValidationIssue[]}
 */
export function validateTier(tier) {
  const c = new Ctx(`tier(${tier?.number ?? "?"})`);
  if ( !isObject(tier) ) { c.err("", "must be an object"); return c.issues; }
  if ( !Number.isInteger(tier.number) || tier.number < 0 || tier.number > 9 ) c.err("number", "0-9 required");
  if ( !isString(tier.title) ) c.err("title", "title required");
  if ( !isString(tier.objective) ) c.err("objective", "objective required");
  if ( !isString(tier.graduation) ) c.err("graduation", "graduation project description required");
  if ( !isArray(tier.lessons) || !tier.lessons.length ) c.err("lessons", "lesson id list required");
  if ( !isString(tier.capstone) ) c.err("capstone", "capstone lesson id required");
  if ( !isArray(tier.achievements) ) c.err("achievements", "achievement id list required");
  return c.issues;
}

/**
 * Validate an entire curriculum bundle: tiers, lessons, glossary and cross references.
 * @param {{tiers:object[], lessons:object[], glossary:object[]}} bundle
 * @returns {ValidationIssue[]}
 */
export function validateCurriculum(bundle) {
  const issues = [];
  const c = new Ctx("curriculum");
  if ( !isObject(bundle) ) { c.err("", "bundle must be an object"); return c.issues; }
  const lessons = isArray(bundle.lessons) ? bundle.lessons : [];
  const tiers = isArray(bundle.tiers) ? bundle.tiers : [];
  const glossary = isArray(bundle.glossary) ? bundle.glossary : [];
  const ids = new Set();
  for ( const l of lessons ) {
    if ( ids.has(l?.id) ) c.err("lessons", `duplicate lesson id "${l.id}"`);
    ids.add(l?.id);
  }
  const slugs = new Set(glossary.map(g => g?.slug));
  for ( const l of lessons ) issues.push(...validateLesson(l, { knownIds: ids, knownTerms: slugs }));
  for ( const g of glossary ) issues.push(...validateTerm(g, ids));
  const dupSlugs = new Set();
  for ( const g of glossary ) { if ( dupSlugs.has(g?.slug) ) c.err("glossary", `duplicate slug "${g.slug}"`); dupSlugs.add(g?.slug); }
  const tierNumbers = new Set();
  for ( const t of tiers ) {
    issues.push(...validateTier(t));
    if ( tierNumbers.has(t?.number) ) c.err("tiers", `duplicate tier ${t.number}`);
    tierNumbers.add(t?.number);
    for ( const id of t?.lessons ?? [] ) {
      if ( !ids.has(id) ) c.err(`tier(${t.number}).lessons`, `unknown lesson "${id}"`);
      else {
        const lesson = lessons.find(l => l.id === id);
        if ( lesson.tier !== t.number ) c.err(`tier(${t.number}).lessons`, `lesson "${id}" declares tier ${lesson.tier}`);
      }
    }
    if ( t?.capstone && !t?.lessons?.includes(t.capstone) ) c.err(`tier(${t.number}).capstone`, "capstone must be one of the tier's lessons");
    const cap = lessons.find(l => l.id === t?.capstone);
    if ( cap && cap.category !== CATEGORIES.PROJECT ) c.err(`tier(${t.number}).capstone`, "capstone lesson must have category project");
  }
  for ( let n = 0; n <= 9; n++ ) if ( !tierNumbers.has(n) ) c.err("tiers", `tier ${n} is missing`);
  // Every lesson must be listed in exactly one tier
  const listed = new Map();
  for ( const t of tiers ) for ( const id of t?.lessons ?? [] ) listed.set(id, (listed.get(id) ?? 0) + 1);
  for ( const l of lessons ) if ( (listed.get(l.id) ?? 0) !== 1 ) c.err("tiers", `lesson "${l.id}" must be listed in exactly one tier`);
  // Prerequisite cycles and ordering
  const byId = new Map(lessons.map(l => [l.id, l]));
  const state = new Map();
  const visit = (id, stack) => {
    if ( state.get(id) === "done" ) return;
    if ( state.get(id) === "visiting" ) { c.err("prerequisites", `cycle detected: ${[...stack, id].join(" -> ")}`); return; }
    state.set(id, "visiting");
    for ( const p of byId.get(id)?.prerequisites ?? [] ) if ( byId.has(p) ) visit(p, [...stack, id]);
    state.set(id, "done");
  };
  for ( const l of lessons ) visit(l.id, []);
  for ( const l of lessons ) for ( const p of l.prerequisites ?? [] ) {
    const pre = byId.get(p);
    if ( pre && pre.tier > l.tier ) c.err(`lesson(${l.id}).prerequisites`, `"${p}" is in a later tier (${pre.tier} > ${l.tier})`);
  }
  // Broken macro library
  const broken = isArray(bundle.brokenMacros) ? bundle.brokenMacros : [];
  broken.forEach((b, i) => {
    const bc = new Ctx(`brokenMacro[${i}]`);
    if ( !isObject(b) ) { bc.err("", "must be an object"); issues.push(...bc.issues); return; }
    for ( const k of ["id", "title", "category", "difficulty", "summary", "symptom", "expected"] ) if ( !isString(b[k]) ) bc.err(k, "required string");
    if ( !isObject(b.exercise) ) bc.err("exercise", "repair exercise required");
    else {
      validateExercise(b.exercise, "exercise", bc, new Set(), { id: b.id });
      if ( b.exercise.type !== "repair-code" && b.exercise.type !== "debug-scenario" ) bc.err("exercise.type", "must be repair-code or debug-scenario");
    }
    issues.push(...bc.issues);
  });
  // Exercise ids must be globally unique
  const exIds = new Map();
  for ( const l of lessons ) for ( const e of [...(l.exercises ?? []), l.challenge].filter(Boolean) ) exIds.set(e.id, (exIds.get(e.id) ?? 0) + 1);
  for ( const b of broken ) if ( b?.exercise?.id ) exIds.set(b.exercise.id, (exIds.get(b.exercise.id) ?? 0) + 1);
  for ( const [id, n] of exIds ) if ( n > 1 ) c.err("exercises", `exercise id "${id}" used ${n} times`);
  return [...c.issues, ...issues];
}
