/**
 * HTML for exercises, checkpoints and run results. Pure string builders over escaped data.
 */
import { escapeHTML, renderInline, renderCodeBlock } from "../utilities/html.js";
import { CODE_EXERCISE_TYPES } from "../curriculum/schema.js";
import { HINT_LEVEL_LABELS } from "../assessment/hints.js";
import { explainError } from "../diagnostics/error-explainer.js";

export const EXERCISE_TYPE_LABELS = Object.freeze({
  "multiple-choice": "Concept check", "predict-output": "Predict the output", "fill-blank": "Fill in the blanks", "identify-error": "Find the error",
  "repair-code": "Repair the code", "write-function": "Write a function", "complete-macro": "Complete the macro", "reorder-steps": "Put the steps in order",
  "explain-code": "Explain what the code does", "debug-scenario": "Debugging scenario", "api-discovery": "API discovery", "build-project": "Build from requirements", "capstone": "Capstone assessment"
});

function statusBadge(record) {
  if ( record?.passed ) return `<span class="exercise-status passed"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Passed${record.assisted ? " (with solution)" : ""}</span>`;
  if ( record?.attempts?.length ) return `<span class="exercise-status attempted"><i class="fa-solid fa-circle-half-stroke" aria-hidden="true"></i> ${record.attempts.length} attempt${record.attempts.length === 1 ? "" : "s"}</span>`;
  return `<span class="exercise-status todo"><i class="fa-regular fa-circle" aria-hidden="true"></i> Not attempted</span>`;
}

function hintsBlock(exercise, hintState, { exerciseId }) {
  const revealed = (exercise.hints ?? []).slice(0, hintState?.revealed ?? 0);
  const remaining = (exercise.hints ?? []).length - revealed.length;
  const items = revealed.map((h, i) => `<li class="hint-item"><span class="hint-level">${escapeHTML(HINT_LEVEL_LABELS[Math.min(i, HINT_LEVEL_LABELS.length - 1)])}</span> ${renderInline(h)}</li>`).join("");
  const button = remaining > 0 ? `<button type="button" class="hint-button" data-action="revealHint" data-exercise-id="${escapeHTML(exerciseId)}"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> Reveal hint (${remaining} left)</button>` : "";
  if ( !exercise.hints?.length ) return "";
  return `<div class="exercise-hints"><h5>Hints</h5>${items ? `<ol class="hint-list">${items}</ol>` : `<p class="hint">Hints explain the reasoning behind the next step. Using them never costs you anything.</p>`}${button}</div>`;
}

function feedbackBlock(result) {
  if ( !result ) return "";
  const cls = result.passed ? "passed" : "failed";
  const checks = (result.checks ?? []).map(c => `<li class="${c.passed ? "ok" : "fail"}"><i class="fa-solid ${c.passed ? "fa-check" : "fa-xmark"}" aria-hidden="true"></i> <span class="check-name">${escapeHTML(c.name)}</span>${c.message && c.message !== c.name ? `<span class="check-message">${escapeHTML(c.message)}</span>` : ""}</li>`).join("");
  return `<div class="exercise-feedback ${cls}" role="status" aria-live="polite"><div class="feedback-summary">${(result.feedback ?? []).map(f => `<p>${renderInline(f)}</p>`).join("")}</div>${checks ? `<ul class="check-list">${checks}</ul>` : ""}</div>`;
}

/**
 * Render an exercise form.
 * @param {object} exercise
 * @param {object} [state]
 * @param {object} [state.record]       Progress record for the exercise
 * @param {object} [state.hintState]
 * @param {object} [state.lastResult]   Last evaluation result
 * @param {unknown} [state.submission]  Last submission (to re-fill the form)
 * @param {boolean} [state.solutionShown]
 * @returns {string}
 */
export function renderExercise(exercise, { record=null, hintState=null, lastResult=null, submission=null, solutionShown=false }={}) {
  const id = exercise.id;
  const label = EXERCISE_TYPE_LABELS[exercise.type] ?? exercise.type;
  const header = `<header class="exercise-header"><span class="exercise-type">${escapeHTML(label)}</span><h4 class="exercise-title">${escapeHTML(exercise.title)}</h4>${statusBadge(record)}</header>`;
  const prompt = `<div class="exercise-prompt">${renderInline(exercise.prompt)}</div>`;
  const criteria = `<details class="exercise-criteria"><summary>How this is checked</summary><ul>${exercise.criteria.map(c => `<li>${renderInline(c)}</li>`).join("")}</ul></details>`;
  let body;
  if ( CODE_EXERCISE_TYPES.includes(exercise.type) ) {
    body = `<div class="exercise-code-launch"><p>This exercise is completed in the <strong>Workshop</strong>${exercise.runtime === "preview" ? " using Foundry Preview (a dry run against practice data)" : " using the Concept Sandbox (plain JavaScript, no Foundry access)"}.</p><button type="button" class="primary-button" data-action="startExercise" data-exercise-id="${escapeHTML(id)}"><i class="fa-solid fa-flask" aria-hidden="true"></i> Open in Workshop</button></div>`;
  } else {
    body = `<form class="exercise-form" data-exercise-id="${escapeHTML(id)}" data-exercise-type="${escapeHTML(exercise.type)}">${renderInputs(exercise, submission)}<div class="exercise-actions"><button type="submit" class="primary-button"><i class="fa-solid fa-check" aria-hidden="true"></i> Check answer</button>${renderSolutionButton(exercise, id, solutionShown)}</div></form>`;
  }
  const solution = solutionShown ? renderSolution(exercise) : "";
  return `<article class="exercise exercise-${escapeHTML(exercise.type)}" id="exercise-${escapeHTML(id)}" data-exercise-id="${escapeHTML(id)}">${header}${prompt}${body}${feedbackBlock(lastResult)}${hintsBlock(exercise, hintState, { exerciseId: id })}${solution}${criteria}</article>`;
}

function renderSolutionButton(exercise, id, shown) {
  if ( shown ) return "";
  const hasSolution = exercise.explanation || exercise.modelAnswer || exercise.solution;
  if ( !hasSolution ) return "";
  return `<button type="button" class="secondary-button" data-action="revealSolution" data-exercise-id="${escapeHTML(id)}"><i class="fa-solid fa-eye" aria-hidden="true"></i> Show answer</button>`;
}

function renderInputs(exercise, submission) {
  const id = escapeHTML(exercise.id);
  switch ( exercise.type ) {
    case "multiple-choice": {
      const multi = Array.isArray(exercise.answer);
      const chosen = new Set(Array.isArray(submission) ? submission : (submission ? [submission] : []));
      return `<fieldset class="choice-list"><legend class="sr-only">Options</legend>${exercise.options.map(o => `<label class="choice"><input type="${multi ? "checkbox" : "radio"}" name="answer" value="${escapeHTML(o.id)}" ${chosen.has(o.id) ? "checked" : ""}> <span>${renderInline(o.text)}</span></label>`).join("")}</fieldset>${multi ? `<p class="hint">Select every option that applies.</p>` : ""}`;
    }
    case "predict-output":
      return `${renderCodeBlock(exercise.code)}<label class="field"><span>What will this print? (one line per output line)</span><textarea name="answer" rows="4" spellcheck="false" autocomplete="off">${escapeHTML(submission ?? "")}</textarea></label>`;
    case "fill-blank": {
      const given = Array.isArray(submission) ? submission : [];
      let i = 0;
      const lines = exercise.code.split("\n").map(line => {
        const html = escapeHTML(line).replace(/____/g, () => { const n = i++; return `<input type="text" class="blank-input" name="blank-${n}" aria-label="Blank ${n + 1}" value="${escapeHTML(given[n] ?? "")}" autocomplete="off" spellcheck="false" size="${Math.max(6, (exercise.blanks[n]?.size ?? 10))}">`; });
        return `<div class="code-line"><span class="line-text">${html}</span></div>`;
      }).join("");
      return `<div class="academy-code fill-blank-code"><pre class="code-lines">${lines}</pre></div>`;
    }
    case "identify-error": {
      const chosen = new Set((Array.isArray(submission) ? submission : []).map(Number));
      const lines = exercise.code.split("\n").map((line, idx) => { const n = idx + 1; return `<label class="code-line selectable"><input type="checkbox" name="line" value="${n}" ${chosen.has(n) ? "checked" : ""} aria-label="Line ${n}"><span class="line-number" aria-hidden="true">${n}</span><span class="line-text">${escapeHTML(line)}</span></label>`; }).join("");
      return `<p class="hint">Tick the line(s) that contain the problem.</p><div class="academy-code identify-error-code"><div class="code-lines">${lines}</div></div>`;
    }
    case "reorder-steps": {
      const order = Array.isArray(submission) && submission.length ? submission : exercise.shuffled ?? shuffleDeterministic(exercise.steps.map(s => s.id), exercise.id);
      const byId = new Map(exercise.steps.map(s => [s.id, s]));
      return `<p class="hint">Use the arrows (or Alt+↑/↓ with keyboard focus) to put the steps in the right order.</p><ol class="reorder-list" data-exercise-id="${id}">${order.map(sid => `<li class="reorder-item" data-step-id="${escapeHTML(sid)}" tabindex="0"><span class="step-text">${renderInline(byId.get(sid)?.text ?? sid)}</span><span class="reorder-controls"><button type="button" class="icon-button" data-action="moveStep" data-direction="up" aria-label="Move up"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button><button type="button" class="icon-button" data-action="moveStep" data-direction="down" aria-label="Move down"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button></span></li>`).join("")}</ol>`;
    }
    case "explain-code": case "capstone": {
      const text = submission?.text ?? "";
      const ticked = new Set(submission?.rubric ?? []);
      const code = exercise.code ? renderCodeBlock(exercise.code) : "";
      const reqs = exercise.requirements ? `<h5>Requirements</h5><ol class="requirements">${exercise.requirements.map(r => `<li>${renderInline(r)}</li>`).join("")}</ol>` : "";
      const evidence = exercise.evidence ? `<h5>Evidence to collect</h5><ul>${exercise.evidence.map(r => `<li>${renderInline(r)}</li>`).join("")}</ul>` : "";
      return `${code}${reqs}${evidence}<label class="field"><span>${exercise.type === "capstone" ? "Describe your design decisions, how you tested it and what you would change" : "Explain, in your own words, what this code does and why"}</span><textarea name="text" rows="6">${escapeHTML(text)}</textarea></label><fieldset class="rubric"><legend>Self-assessment rubric (tick what your work covers honestly)</legend>${exercise.rubric.map(r => `<label class="choice"><input type="checkbox" name="rubric" value="${escapeHTML(r.id)}" ${ticked.has(r.id) ? "checked" : ""}> <span>${renderInline(r.text)}</span></label>`).join("")}</fieldset>`;
    }
    case "api-discovery":
      return `<label class="field"><span>Your answer</span><input type="text" name="answer" value="${escapeHTML(submission ?? "")}" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(exercise.placeholder ?? "e.g. actor.system.attributes.hp.value")}"></label>${exercise.runtime ? `<p class="hint">Investigate in the Workshop first: <button type="button" class="link-button" data-action="openWorkshop" data-runtime="${escapeHTML(exercise.runtime)}">open ${exercise.runtime === "preview" ? "Foundry Preview" : "the sandbox"}</button>.</p>` : ""}`;
    default:
      return `<p class="hint">This exercise type is not interactive here.</p>`;
  }
}

function renderSolution(exercise) {
  const parts = [];
  if ( exercise.type === "multiple-choice" ) { const ans = Array.isArray(exercise.answer) ? exercise.answer : [exercise.answer]; parts.push(`<p><strong>Answer:</strong> ${ans.map(a => renderInline(exercise.options.find(o => o.id === a)?.text ?? a)).join("; ")}</p>`); }
  if ( exercise.type === "predict-output" ) parts.push(`<p><strong>Output:</strong></p><pre class="plain-output">${escapeHTML(Array.isArray(exercise.answer) ? exercise.answer[0] : exercise.answer)}</pre>`);
  if ( exercise.type === "fill-blank" ) parts.push(`<p><strong>Accepted answers:</strong> ${exercise.blanks.map((b, i) => `blank ${i + 1}: <code>${escapeHTML(b.accept[0])}</code>`).join(", ")}</p>`);
  if ( exercise.type === "identify-error" ) parts.push(`<p><strong>Faulty line${exercise.answer.length > 1 ? "s" : ""}:</strong> ${exercise.answer.join(", ")}</p>`);
  if ( exercise.type === "reorder-steps" ) { const byId = new Map(exercise.steps.map(s => [s.id, s])); parts.push(`<ol class="requirements">${exercise.answer.map(id => `<li>${renderInline(byId.get(id)?.text ?? id)}</li>`).join("")}</ol>`); }
  if ( exercise.type === "api-discovery" ) parts.push(`<p><strong>Accepted:</strong> ${exercise.accept.map(a => `<code>${escapeHTML(a)}</code>`).join(", ")}</p>`);
  if ( exercise.modelAnswer ) parts.push(`<p><strong>Model answer:</strong> ${renderInline(exercise.modelAnswer)}</p>`);
  if ( exercise.explanation ) parts.push(`<p>${renderInline(exercise.explanation)}</p>`);
  if ( exercise.solution?.code ) parts.push(renderCodeBlock(exercise.solution.code), `<p>${renderInline(exercise.solution.explanation)}</p>`);
  return `<div class="exercise-solution" role="region" aria-label="Solution"><h5><i class="fa-solid fa-eye" aria-hidden="true"></i> Answer</h5>${parts.join("")}<p class="hint">Viewing the answer records this exercise as solution-assisted if you pass it afterwards. You can always retry later for an independent pass.</p></div>`;
}

/** Deterministic shuffle so the same exercise always shows the same starting order. */
export function shuffleDeterministic(items, seedText) {
  let seed = 0;
  for ( const ch of String(seedText) ) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const arr = [...items];
  for ( let i = arr.length - 1; i > 0; i-- ) { seed = (seed * 1103515245 + 12345) >>> 0; const j = seed % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  // Ensure it is not already the correct order when possible
  if ( arr.every((x, i) => x === items[i]) && arr.length > 1 ) [arr[0], arr[1]] = [arr[1], arr[0]];
  return arr;
}

/**
 * Render the knowledge checkpoint quiz.
 * @param {object} checkpoint
 * @param {object} [state]
 * @returns {string}
 */
export function renderCheckpoint(checkpoint, { record=null, lastResult=null, answers={} }={}) {
  const resultsById = new Map((lastResult?.results ?? []).map(r => [r.id, r]));
  const questions = checkpoint.questions.map((q, i) => {
    const multi = Array.isArray(q.answer);
    const chosen = new Set(Array.isArray(answers[q.id]) ? answers[q.id] : (answers[q.id] ? [answers[q.id]] : []));
    const r = resultsById.get(q.id);
    const verdict = r ? `<div class="question-verdict ${r.correct ? "ok" : "fail"}"><i class="fa-solid ${r.correct ? "fa-check" : "fa-xmark"}" aria-hidden="true"></i> ${r.correct ? "Correct." : "Not correct."} ${renderInline(r.explanation)}</div>` : "";
    return `<fieldset class="checkpoint-question"><legend><span class="question-number">${i + 1}.</span> ${renderInline(q.prompt)}</legend>${q.options.map(o => `<label class="choice"><input type="${multi ? "checkbox" : "radio"}" name="${escapeHTML(q.id)}" value="${escapeHTML(o.id)}" ${chosen.has(o.id) ? "checked" : ""}> <span>${renderInline(o.text)}</span></label>`).join("")}${verdict}</fieldset>`;
  }).join("");
  const status = record?.passed ? `<span class="exercise-status passed"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Passed (${Math.round((record.score ?? 0) * 100)}%)</span>` : (record?.attempts ? `<span class="exercise-status attempted">${record.attempts} attempt${record.attempts === 1 ? "" : "s"}, best ${Math.round((record.score ?? 0) * 100)}%</span>` : `<span class="exercise-status todo">Not attempted</span>`);
  const summary = lastResult ? `<div class="exercise-feedback ${lastResult.passed ? "passed" : "failed"}" role="status"><p>${lastResult.passed ? "Checkpoint passed." : "Not yet."} You scored ${Math.round(lastResult.score * 100)}% (pass mark ${Math.round(checkpoint.passScore * 100)}%).${lastResult.passed ? "" : " Read the explanations, revisit the lesson and try again whenever you like."}</p></div>` : "";
  return `<section class="checkpoint" id="checkpoint"><header class="exercise-header"><span class="exercise-type">Knowledge checkpoint</span><h4 class="exercise-title">Check your understanding</h4>${status}</header><p class="hint">Pass mark: ${Math.round(checkpoint.passScore * 100)}%. You can retry as often as you need; only your best score is kept.</p><form class="checkpoint-form">${questions}<div class="exercise-actions"><button type="submit" class="primary-button"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i> Submit checkpoint</button></div></form>${summary}</section>`;
}

/**
 * Render a workshop run result (output, chat, notifications, updates, warnings, error explanation).
 * @param {object|null} result   RunResult
 * @param {object} [options]
 * @param {object} [options.evaluation]   EvaluationResult for an exercise
 * @returns {string}
 */
export function renderRunResult(result, { evaluation=null }={}) {
  if ( !result ) return `<div class="results-empty"><i class="fa-solid fa-play" aria-hidden="true"></i> Run your code to see output here.</div>`;
  const sections = [];
  const modeLabel = { sandbox: "Concept Sandbox", preview: "Foundry Preview (dry run)", live: "Live execution" }[result.mode] ?? result.mode;
  const status = result.cancelled ? "cancelled" : (result.ok ? "ok" : "error");
  sections.push(`<div class="run-status ${status}"><i class="fa-solid ${result.ok ? "fa-circle-check" : (result.cancelled ? "fa-ban" : "fa-circle-exclamation")}" aria-hidden="true"></i> <strong>${escapeHTML(modeLabel)}</strong>: ${result.cancelled ? "cancelled" : (result.ok ? "finished without errors" : (result.timedOut ? "stopped (time limit)" : "stopped by an error"))} <span class="run-duration">${Number.isFinite(result.durationMs) ? `${result.durationMs} ms` : ""}</span></div>`);
  if ( evaluation ) sections.push(feedbackBlock(evaluation));
  if ( result.error && !result.cancelled ) {
    const ex = explainError(result.error);
    sections.push(`<section class="run-error"><h5><i class="fa-solid fa-bug" aria-hidden="true"></i> ${escapeHTML(result.error.name)}: ${escapeHTML(result.error.message)}${result.error.line ? ` <span class="error-line">(line ${result.error.line})</span>` : ""}</h5><div class="error-explanation ${ex.confirmed ? "confirmed" : "guess"}"><p class="explanation-title"><strong>${escapeHTML(ex.title)}</strong> <span class="confidence">${ex.confirmed ? "recognised pattern" : "general guidance"}</span></p><p>${renderInline(ex.explanation)}</p><p><strong>Common causes</strong></p><ul>${ex.causes.map(c => `<li>${renderInline(c)}</li>`).join("")}</ul><p><strong>What to try</strong></p><ul>${ex.investigate.map(c => `<li>${renderInline(c)}</li>`).join("")}</ul>${ex.lessonId ? `<p><a class="academy-link lesson-link" data-action="openLesson" data-lesson-id="${escapeHTML(ex.lessonId)}">Related lesson</a></p>` : ""}${result.error.stack ? `<details class="stack-trace"><summary>Stack trace</summary><pre>${escapeHTML(result.error.stack)}</pre></details>` : ""}</div></section>`);
  }
  const output = result.output ?? [];
  sections.push(`<section class="run-output"><h5><i class="fa-solid fa-terminal" aria-hidden="true"></i> Console output <span class="count">${output.length}</span></h5>${output.length ? `<pre class="console-output">${output.map(l => escapeHTML(l)).join("\n")}</pre>` : `<p class="hint">Nothing was printed. Use <code>console.log(value)</code> to see values.</p>`}</section>`);
  if ( result.returnValue !== undefined ) sections.push(`<section class="run-return"><h5>Return value</h5><pre class="console-output">${escapeHTML(JSON.stringify(result.returnValue, null, 2))}</pre></section>`);
  const chat = result.chat ?? [];
  if ( result.mode === "preview" || chat.length ) sections.push(`<section class="run-chat"><h5><i class="fa-solid fa-comments" aria-hidden="true"></i> Chat messages ${result.mode === "preview" ? "(would be posted)" : ""} <span class="count">${chat.length}</span></h5>${chat.length ? chat.map(m => `<div class="chat-preview"><div class="chat-speaker">${escapeHTML(m.speaker?.alias ?? "")}${m.whisper?.length ? ` <span class="whisper">whisper</span>` : ""}${m.flavor ? ` <span class="flavor">${escapeHTML(m.flavor)}</span>` : ""}</div><div class="chat-content">${sanitizePreviewHTML(m.content)}</div>${m.rolls?.length ? `<div class="chat-rolls">${m.rolls.map(r => `<span class="roll-chip">${escapeHTML(r.formula)} = <strong>${escapeHTML(r.total)}</strong></span>`).join(" ")}</div>` : ""}</div>`).join("") : `<p class="hint">No chat messages.</p>`}</section>`);
  const notes = result.notifications ?? [];
  if ( notes.length ) sections.push(`<section class="run-notifications"><h5><i class="fa-solid fa-bell" aria-hidden="true"></i> Notifications</h5><ul>${notes.map(n => `<li class="note-${escapeHTML(n.type)}">${escapeHTML(n.type)}: ${escapeHTML(n.message)}</li>`).join("")}</ul></section>`);
  const changes = [...(result.updates ?? []).map(u => ({ kind: "update", text: `${u.documentName} "${u.name}": ${JSON.stringify(u.data)}` })), ...(result.creates ?? []).map(c => ({ kind: "create", text: `create ${c.documentName}${c.parent ? ` on ${c.parent}` : ""}: ${JSON.stringify(c.data).slice(0, 200)}` })), ...(result.deletes ?? []).map(d => ({ kind: "delete", text: `delete ${d.documentName} "${d.name}"` })), ...(result.mechanics ?? []).map(m => ({ kind: "mechanic", text: Object.entries(m).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`).join(" ") })), ...(result.dialogs ?? []).map(d => ({ kind: "dialog", text: `${d.type} dialog${d.title ? ` "${d.title}"` : ""}` })), ...(result.settings ?? []).map(s => ({ kind: "setting", text: `${s.key} = ${JSON.stringify(s.value)}` })), ...(result.navigation ?? []).map(n => ({ kind: "navigation", text: Object.entries(n).map(([k, v]) => `${k}=${v}`).join(" ") }))];
  if ( result.mode === "preview" ) sections.push(`<section class="run-changes"><h5><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Game changes that would have happened <span class="count">${changes.length}</span></h5>${changes.length ? `<ul class="change-list">${changes.map(c => `<li class="change-${c.kind}"><span class="change-kind">${c.kind}</span> ${escapeHTML(c.text)}</li>`).join("")}</ul>` : `<p class="hint">No documents would be changed. Read-only code is the safest kind.</p>`}</section>`);
  const warnings = result.warnings ?? [];
  if ( warnings.length ) sections.push(`<section class="run-warnings"><h5><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Emulator notes</h5><ul>${warnings.map(w => `<li>${escapeHTML(w.message)}</li>`).join("")}</ul></section>`);
  return sections.join("");
}

/**
 * Chat content written by learner code is untrusted. Show it as escaped text with line breaks kept, so a
 * stray <script> in a draft can never run inside the academy window. (Live chat goes through Foundry's own
 * sanitiser when it is actually posted.)
 */
export function sanitizePreviewHTML(html) {
  return escapeHTML(String(html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<[^>]*>/g, "")).replace(/\n/g, "<br>");
}
