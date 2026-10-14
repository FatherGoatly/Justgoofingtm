/**
 * Exercise evaluation. Pure JavaScript: code exercises are evaluated from a RunResult produced by the workshop
 * runner (worker) so this module never executes learner code itself.
 *
 * @typedef {object} RunResult
 * @property {boolean} ok              Did the program finish without throwing?
 * @property {{name:string, message:string, stack?:string, line?:number|null}|null} error
 * @property {string[]} output         Captured console output lines
 * @property {unknown} returnValue     Value returned by the program (if any)
 * @property {Array<{index:number, result?:unknown, error?:{name:string,message:string}|null}>} callResults
 * @property {Array<{content:string, speaker?:object, whisper?:string[]}>} chat
 * @property {Array<{type:string, message:string}>} notifications
 * @property {Array<{uuid:string, name:string, documentName:string, data:object}>} updates
 * @property {Array<{documentName:string, data:object}>} creates
 * @property {Array<{type:string, title?:string, result:unknown}>} dialogs
 * @property {Array<{formula:string, total:number}>} rolls
 * @property {Array<{name:string, args?:unknown[]}>} hooks
 * @property {boolean} timedOut
 * @property {number} durationMs
 *
 * @typedef {object} EvaluationResult
 * @property {boolean} passed
 * @property {number} score            0..1
 * @property {Array<{name:string, passed:boolean, message:string}>} checks
 * @property {string[]} feedback       Plain-English feedback for the learner
 * @property {boolean} needsManualReview
 */

import { looselyEqual, normalizeWhitespace } from "../utilities/text.js";
import { CODE_EXERCISE_TYPES, RUBRIC_EXERCISE_TYPES } from "../curriculum/schema.js";

/**
 * Evaluate a non-code submission (choice, prediction, blanks, ordering, discovery) or a rubric self-assessment.
 * @param {object} exercise
 * @param {unknown} submission
 * @returns {EvaluationResult}
 */
export function evaluateSubmission(exercise, submission) {
  switch ( exercise.type ) {
    case "multiple-choice": return evaluateChoice(exercise, submission);
    case "predict-output": return evaluateText(exercise, submission, { label: "Predicted output" });
    case "fill-blank": return evaluateBlanks(exercise, submission);
    case "identify-error": return evaluateLines(exercise, submission);
    case "reorder-steps": return evaluateOrder(exercise, submission);
    case "api-discovery": return evaluateText(exercise, submission, { label: "Answer", accept: exercise.accept, normalizer: normalizeAnswer });
    case "explain-code":
    case "capstone": return evaluateRubric(exercise, submission);
    default:
      if ( CODE_EXERCISE_TYPES.includes(exercise.type) ) throw new Error(`Code exercises are evaluated with evaluateRun(), not evaluateSubmission()`);
      return { passed: false, score: 0, checks: [], feedback: [`Unknown exercise type "${exercise.type}".`], needsManualReview: true };
  }
}

/**
 * Evaluate a checkpoint quiz.
 * @param {object} checkpoint
 * @param {Record<string,string|string[]>} answers  Question id -> option id(s)
 * @returns {{passed:boolean, score:number, results:Array<{id:string, correct:boolean, explanation:string, answer:string|string[]}>}}
 */
export function evaluateCheckpoint(checkpoint, answers={}) {
  const results = checkpoint.questions.map(q => {
    const r = evaluateChoice(q, answers[q.id]);
    return { id: q.id, correct: r.passed, explanation: q.explanation, answer: q.answer };
  });
  const score = results.filter(r => r.correct).length / Math.max(1, results.length);
  return { passed: score >= checkpoint.passScore, score, results };
}

function evaluateChoice(exercise, submission) {
  const expected = new Set(Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer]);
  const given = new Set(Array.isArray(submission) ? submission : (submission === undefined || submission === null || submission === "" ? [] : [submission]));
  const passed = expected.size === given.size && [...expected].every(a => given.has(a));
  const feedback = passed ? ["Correct.", exercise.explanation] : (given.size ? ["Not quite.", exercise.explanation] : ["Choose an answer first."]);
  return { passed, score: passed ? 1 : 0, checks: [{ name: "Answer", passed, message: passed ? "Correct" : "Incorrect" }], feedback, needsManualReview: false };
}

function normalizeAnswer(text) {
  return String(text ?? "").trim().toLowerCase().replace(/\s+/g, "").replace(/;$/, "");
}

function evaluateText(exercise, submission, { label, accept=null, normalizer=null }={}) {
  const candidates = accept ?? (Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer]);
  const given = String(submission ?? "");
  if ( !given.trim() ) return { passed: false, score: 0, checks: [], feedback: [`Enter your ${label.toLowerCase()} first.`], needsManualReview: false };
  const matches = normalizer ? candidates.some(c => normalizer(c) === normalizer(given)) : candidates.some(c => looselyEqual(c, given));
  const feedback = matches ? ["Correct.", exercise.explanation] : [`${label} does not match.`, exercise.explanation];
  return { passed: matches, score: matches ? 1 : 0, checks: [{ name: label, passed: matches, message: matches ? "Matches" : `Expected: ${normalizeWhitespace(candidates[0])}` }], feedback, needsManualReview: false };
}

function evaluateBlanks(exercise, submission) {
  const given = Array.isArray(submission) ? submission : [];
  const checks = exercise.blanks.map((b, i) => {
    const value = String(given[i] ?? "").trim();
    const passed = b.accept.some(a => normalizeAnswer(a) === normalizeAnswer(value));
    return { name: `Blank ${i + 1}`, passed, message: passed ? "Correct" : (value ? `"${value}" is not accepted${b.hint ? `: ${b.hint}` : ""}` : "Empty") };
  });
  const correct = checks.filter(c => c.passed).length;
  const passed = correct === checks.length;
  return { passed, score: correct / checks.length, checks, feedback: passed ? ["All blanks correct.", exercise.explanation] : [`${correct} of ${checks.length} blanks correct.`], needsManualReview: false };
}

function evaluateLines(exercise, submission) {
  const expected = new Set(exercise.answer);
  const given = new Set((Array.isArray(submission) ? submission : [submission]).map(n => Number(n)).filter(Number.isInteger));
  const hit = [...expected].filter(n => given.has(n)).length;
  const extra = [...given].filter(n => !expected.has(n)).length;
  const passed = hit === expected.size && extra === 0;
  const checks = [{ name: "Faulty lines", passed, message: passed ? "Found" : `Expected line${expected.size > 1 ? "s" : ""} ${[...expected].join(", ")}` }];
  const feedback = passed ? ["Correct.", exercise.explanation] : (given.size ? [hit ? "You found part of the problem, but the selection is not exactly right." : "That is not where the problem is.", extra ? "Some selected lines are fine as written." : ""] : ["Select the faulty line(s) first."]).filter(Boolean);
  return { passed, score: expected.size ? Math.max(0, (hit - extra) / expected.size) : 0, checks, feedback, needsManualReview: false };
}

function evaluateOrder(exercise, submission) {
  const given = Array.isArray(submission) ? submission : [];
  const expected = exercise.answer;
  const correctPositions = expected.filter((id, i) => given[i] === id).length;
  const passed = correctPositions === expected.length && given.length === expected.length;
  return { passed, score: correctPositions / expected.length, checks: [{ name: "Order", passed, message: passed ? "Correct order" : `${correctPositions} of ${expected.length} steps in the right place` }], feedback: passed ? ["Correct order.", exercise.explanation] : ["Not yet. Think about which steps depend on the result of an earlier step."], needsManualReview: false };
}

function evaluateRubric(exercise, submission) {
  const ticked = new Set(Array.isArray(submission?.rubric) ? submission.rubric : []);
  const text = String(submission?.text ?? "");
  const checks = exercise.rubric.map(r => ({ name: r.text, passed: ticked.has(r.id), message: ticked.has(r.id) ? "Covered" : "Not covered" }));
  const covered = checks.filter(c => c.passed).length;
  const required = exercise.rubric.filter(r => r.required !== false).length;
  const minWords = exercise.minWords ?? 20;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const longEnough = words >= minWords;
  checks.push({ name: `Written answer (${minWords}+ words)`, passed: longEnough, message: longEnough ? `${words} words` : `${words} words; write a little more` });
  const passed = covered >= required && longEnough;
  return { passed, score: Math.min(1, covered / Math.max(1, exercise.rubric.length)), checks, feedback: passed ? ["Your explanation covers the rubric. Compare it with the model answer to refine your understanding."] : ["Keep going: cover every rubric item in your own words. The rubric is self-assessed; honesty here helps you, not a grade."], needsManualReview: RUBRIC_EXERCISE_TYPES.includes(exercise.type) };
}

/**
 * Evaluate a code exercise from the workshop run result.
 * @param {object} exercise
 * @param {RunResult} run
 * @param {string} code      The learner's code (for codeIncludes/codeExcludes checks)
 * @returns {EvaluationResult}
 */
export function evaluateRun(exercise, run, code="") {
  const checks = exercise.tests.map((tc, index) => evaluateTest(tc, index, run, code));
  const passedCount = checks.filter(c => c.passed).length;
  const passed = passedCount === checks.length;
  const feedback = [];
  if ( run.timedOut ) feedback.push("Your program did not finish in time. This usually means a loop never reaches its stopping condition.");
  else if ( run.error && !exercise.tests.some(t => "expectError" in t || "expectTimeout" in t) ) feedback.push(`Your program threw an error: ${run.error.name}: ${run.error.message}${run.error.line ? ` (line ${run.error.line})` : ""}`);
  if ( passed ) feedback.push(`All ${checks.length} checks passed.`);
  else feedback.push(`${passedCount} of ${checks.length} checks passed.`);
  return { passed, score: checks.length ? passedCount / checks.length : 0, checks, feedback, needsManualReview: false };
}

function evaluateTest(tc, index, run, code) {
  const name = tc.name;
  const fail = message => ({ name, passed: false, message });
  const pass = message => ({ name, passed: true, message });
  if ( "call" in tc ) {
    const cr = run.callResults?.find(r => r.index === index);
    if ( !cr ) return fail(`The function ${tc.call} was not called (did the program fail before defining it?)`);
    if ( cr.missing ) return fail(`No function named "${tc.call}" was defined. Define it with: function ${tc.call}(...) { ... }`);
    if ( "expectThrows" in tc ) {
      if ( !cr.error ) return fail(`Expected ${tc.call}(${fmtArgs(tc.args)}) to throw an error, but it returned ${fmt(cr.result)}`);
      if ( typeof tc.expectThrows === "string" && !String(cr.error.message).includes(tc.expectThrows) ) return fail(`Threw "${cr.error.message}" but expected a message containing "${tc.expectThrows}"`);
      return pass(`Throws as expected`);
    }
    if ( cr.error ) return fail(`${tc.call}(${fmtArgs(tc.args)}) threw ${cr.error.name}: ${cr.error.message}`);
    if ( "expectType" in tc ) {
      const actualType = Array.isArray(cr.result) ? "array" : (cr.result === null ? "null" : typeof cr.result);
      return actualType === tc.expectType ? pass(`Returns a ${tc.expectType}`) : fail(`Expected a ${tc.expectType} but got ${actualType} (${fmt(cr.result)})`);
    }
    if ( "expectMatches" in tc ) {
      const re = new RegExp(tc.expectMatches, tc.flags ?? "");
      const text = typeof cr.result === "string" ? cr.result : fmt(cr.result);
      return re.test(text) ? pass(`Returns ${fmt(cr.result)}`) : fail(`${tc.call}(${fmtArgs(tc.args)}) returned ${fmt(cr.result)}, which does not match /${tc.expectMatches}/`);
    }
    return deepEqual(cr.result, tc.expect) ? pass(`${tc.call}(${fmtArgs(tc.args)}) → ${fmt(cr.result)}`) : fail(`${tc.call}(${fmtArgs(tc.args)}) returned ${fmt(cr.result)} but ${fmt(tc.expect)} was expected`);
  }
  if ( "expectNoError" in tc ) {
    if ( run.timedOut ) return fail("Program timed out");
    return run.error ? fail(`Program threw ${run.error.name}: ${run.error.message}`) : pass("Runs without errors");
  }
  if ( "expectError" in tc ) {
    if ( !run.error ) return fail("Expected the program to throw an error, but it ran without one");
    if ( typeof tc.expectError === "string" && !`${run.error.name}: ${run.error.message}`.includes(tc.expectError) ) return fail(`Threw "${run.error.name}: ${run.error.message}" but expected "${tc.expectError}"`);
    return pass(`Throws ${run.error.name} as expected`);
  }
  if ( "expectTimeout" in tc ) return run.timedOut ? pass("Timed out as expected (infinite loop reproduced)") : fail("Expected the program to run forever, but it finished");
  if ( "expectOutput" in tc ) {
    const expected = Array.isArray(tc.expectOutput) ? tc.expectOutput.join("\n") : tc.expectOutput;
    const actual = (run.output ?? []).join("\n");
    return looselyEqual(expected, actual) ? pass("Output matches") : fail(`Output was:\n${actual || "(nothing)"}\nExpected:\n${expected}`);
  }
  if ( "outputIncludes" in tc ) {
    const actual = (run.output ?? []).join("\n");
    const needles = Array.isArray(tc.outputIncludes) ? tc.outputIncludes : [tc.outputIncludes];
    const missing = needles.filter(n => !actual.includes(n));
    return missing.length ? fail(`Output should include "${missing[0]}". Output was:\n${actual || "(nothing)"}`) : pass("Output includes the expected text");
  }
  if ( "outputMatches" in tc ) {
    const actual = (run.output ?? []).join("\n");
    return new RegExp(tc.outputMatches, tc.flags ?? "m").test(actual) ? pass("Output matches the pattern") : fail(`Output did not match /${tc.outputMatches}/. Output was:\n${actual || "(nothing)"}`);
  }
  if ( "expectReturn" in tc ) return deepEqual(run.returnValue, tc.expectReturn) ? pass(`Returned ${fmt(run.returnValue)}`) : fail(`Program returned ${fmt(run.returnValue)} but ${fmt(tc.expectReturn)} was expected`);
  if ( "returnMatches" in tc ) return new RegExp(tc.returnMatches, tc.flags ?? "").test(String(run.returnValue)) ? pass("Return value matches") : fail(`Return value ${fmt(run.returnValue)} does not match /${tc.returnMatches}/`);
  if ( "expectChat" in tc ) {
    const spec = tc.expectChat;
    const msgs = run.chat ?? [];
    if ( spec === true ) return msgs.length ? pass(`${msgs.length} chat message(s) created`) : fail("No chat message was created. Use ChatMessage.create({ content: ... })");
    if ( spec.count !== undefined && msgs.length !== spec.count ) return fail(`Expected ${spec.count} chat message(s) but ${msgs.length} were created`);
    if ( spec.contains !== undefined ) {
      const needles = Array.isArray(spec.contains) ? spec.contains : [spec.contains];
      const text = msgs.map(m => stripTags(m.content)).join("\n");
      const missing = needles.filter(n => !text.includes(n));
      if ( missing.length ) return fail(`A chat message should contain "${missing[0]}". Messages: ${text || "(none)"}`);
    }
    if ( spec.matches !== undefined ) {
      const text = msgs.map(m => stripTags(m.content)).join("\n");
      if ( !new RegExp(spec.matches, spec.flags ?? "m").test(text) ) return fail(`Chat text did not match /${spec.matches}/. Messages: ${text || "(none)"}`);
    }
    if ( spec.html !== undefined ) {
      const raw = msgs.map(m => String(m.content)).join("\n");
      if ( !new RegExp(spec.html, spec.flags ?? "m").test(raw) ) return fail(`Chat HTML did not match /${spec.html}/. HTML was: ${raw.slice(0, 300) || "(none)"}`);
    }
    if ( spec.whisperToGM && !msgs.some(m => Array.isArray(m.whisper) && m.whisper.length) ) return fail("The message should be whispered to the GM (set the whisper option)");
    if ( spec.speakerAlias && !msgs.some(m => m.speaker?.alias === spec.speakerAlias) ) return fail(`Expected a message spoken as "${spec.speakerAlias}"`);
    return pass("Chat output is as expected");
  }
  if ( "expectNotification" in tc ) {
    const spec = tc.expectNotification;
    const list = run.notifications ?? [];
    const hits = list.filter(n => (!spec.type || n.type === spec.type) && (!spec.contains || n.message.includes(spec.contains)));
    if ( typeof spec.count === "number" ) return hits.length === spec.count ? pass(`${hits.length} ${spec.type ?? ""} notification(s), as expected`) : fail(`Expected ${spec.count} ${spec.type ?? ""} notification(s) but ${hits.length} were shown${hits.length ? `: ${hits.map(n => n.message).join(" | ")}` : ""}`);
    const hit = hits[0];
    return hit ? pass(`Notification shown: ${hit.message}`) : fail(`Expected a ${spec.type ?? ""} notification${spec.contains ? ` containing "${spec.contains}"` : ""}. Use ui.notifications.${spec.type ?? "warn"}(...)`);
  }
  if ( "expectUpdate" in tc ) {
    const spec = tc.expectUpdate;
    const ups = (run.updates ?? []).filter(u => (!spec.name || u.name === spec.name) && (!spec.uuid || u.uuid === spec.uuid) && (!spec.documentName || u.documentName === spec.documentName));
    const match = ups.find(u => {
      const flat = flatten(u.data);
      if ( !(spec.path in flat) ) return false;
      return spec.value === undefined || deepEqual(flat[spec.path], spec.value);
    });
    if ( match ) return pass(`Updated ${match.name}: ${spec.path} = ${fmt(flatten(match.data)[spec.path])}`);
    return fail(`Expected an update to ${spec.name ?? spec.uuid ?? "a document"} setting "${spec.path}"${spec.value !== undefined ? ` to ${fmt(spec.value)}` : ""}. Updates recorded: ${ups.length ? ups.map(u => `${u.name} ${JSON.stringify(u.data)}`).join("; ") : "none"}`);
  }
  if ( "expectNoUpdate" in tc ) {
    const spec = tc.expectNoUpdate === true ? {} : tc.expectNoUpdate;
    const ups = (run.updates ?? []).filter(u => (!spec.name || u.name === spec.name));
    return ups.length ? fail(`No update was expected${spec.name ? ` to ${spec.name}` : ""}, but ${ups.length} happened`) : pass("No unwanted updates");
  }
  if ( "expectCreate" in tc ) {
    const spec = tc.expectCreate;
    const cr = (run.creates ?? []).filter(c => !spec.documentName || c.documentName === spec.documentName);
    return cr.length ? pass(`${cr.length} ${spec.documentName ?? "document"}(s) created`) : fail(`Expected a ${spec.documentName ?? "document"} to be created`);
  }
  if ( "expectDialog" in tc ) {
    const spec = tc.expectDialog === true ? {} : tc.expectDialog;
    const ds = (run.dialogs ?? []).filter(d => !spec.type || d.type === spec.type);
    return ds.length ? pass(`Dialog shown (${ds.map(d => d.type).join(", ")})`) : fail(`Expected a dialog${spec.type ? ` of type ${spec.type}` : ""} (e.g. foundry.applications.api.DialogV2.${spec.type ?? "prompt"})`);
  }
  if ( "expectRoll" in tc ) {
    const spec = tc.expectRoll === true ? {} : tc.expectRoll;
    const rs = (run.rolls ?? []).filter(r => !spec.formula || r.formula.replace(/\s+/g, "") === String(spec.formula).replace(/\s+/g, ""));
    return rs.length ? pass(`Rolled ${rs.map(r => `${r.formula} = ${r.total}`).join(", ")}`) : fail(`Expected a roll${spec.formula ? ` of ${spec.formula}` : ""} (new Roll("...").evaluate())`);
  }
  if ( "expectHook" in tc ) {
    const spec = tc.expectHook === true ? {} : tc.expectHook;
    const hs = (run.hooks ?? []).filter(h => !spec.name || h.name === spec.name);
    return hs.length ? pass(`Hook registered: ${hs.map(h => h.name).join(", ")}`) : fail(`Expected Hooks.on("${spec.name ?? "..."}", ...)`);
  }
  if ( "codeIncludes" in tc ) {
    const needles = Array.isArray(tc.codeIncludes) ? tc.codeIncludes : [tc.codeIncludes];
    const missing = needles.filter(n => !new RegExp(n).test(code));
    return missing.length ? fail(tc.message ?? `Your code should use ${missing[0]}`) : pass(tc.message ?? "Uses the expected construct");
  }
  if ( "codeExcludes" in tc ) {
    const needles = Array.isArray(tc.codeExcludes) ? tc.codeExcludes : [tc.codeExcludes];
    const found = needles.filter(n => new RegExp(n).test(code));
    return found.length ? fail(tc.message ?? `Your code should not use ${found[0]}`) : pass(tc.message ?? "Avoids the discouraged construct");
  }
  return fail("Unknown test kind");
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };
/** Text content of chat HTML: tags removed and the common entities decoded, so tests can match what a reader sees. */
function stripTags(html) { return String(html ?? "").replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, m => ENTITIES[m] ?? m); }

function fmtArgs(args=[]) { return args.map(fmt).join(", "); }

/** Format a value for feedback. */
export function fmt(v) {
  if ( typeof v === "string" ) return JSON.stringify(v);
  if ( v === undefined ) return "undefined";
  try { return JSON.stringify(v); } catch(_err) { return String(v); }
}

/** Structural equality for JSON-like values; NaN equals NaN; numbers compare with a tiny tolerance. */
export function deepEqual(a, b) {
  if ( a === b ) return true;
  if ( typeof a === "number" && typeof b === "number" ) return (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) < 1e-9;
  if ( a === null || b === null || typeof a !== "object" || typeof b !== "object" ) return false;
  if ( Array.isArray(a) !== Array.isArray(b) ) return false;
  if ( Array.isArray(a) ) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  if ( ka.length !== kb.length ) return false;
  return ka.every(k => deepEqual(a[k], b[k]));
}

/** Flatten nested object keys into dot paths (arrays kept as values). */
export function flatten(obj, prefix="", out={}) {
  if ( obj === null || typeof obj !== "object" || Array.isArray(obj) ) { if ( prefix ) out[prefix] = obj; return out; }
  for ( const [k, v] of Object.entries(obj) ) {
    const key = prefix ? `${prefix}.${k}` : k;
    if ( v !== null && typeof v === "object" && !Array.isArray(v) ) flatten(v, key, out);
    else out[key] = v;
  }
  if ( prefix ) out[prefix] = obj;
  return out;
}
