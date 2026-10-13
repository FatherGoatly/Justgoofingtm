/**
 * Turns lesson data into HTML strings. All text passes through escapeHTML/renderInline: lesson data can never
 * inject raw markup. Pure JavaScript (no Foundry dependency) so rendering is unit-tested.
 */
import { escapeHTML, renderInline, renderCodeBlock } from "../utilities/html.js";
import { formatDuration } from "../utilities/text.js";
import { REQUIRED_SECTION_KINDS } from "./schema.js";

export const SECTION_LABELS = Object.freeze({
  "plain": "In plain English",
  "analogy": "At the table",
  "technical": "How it really works",
  "syntax": "Syntax and terminology",
  "example-minimal": "Minimal working example",
  "example-annotated": "Annotated example",
  "incorrect": "A broken version",
  "why-fails": "Why it fails",
  "corrected": "The corrected version",
  "use-case": "Practical use in Foundry",
  "common-mistakes": "Common mistakes",
  "debugging": "Debugging guidance",
  "summary": "Summary",
  "deeper": "Going deeper",
  "aside": "Aside",
  "project": "Project notes"
});

const COMPAT_LABELS = Object.freeze({
  node: "Executed in the test suite",
  emulator: "Executed in the Foundry emulator (dry run)",
  static: "Checked against documentation and syntax-validated; not executed live",
  none: "Illustrative only; not executed"
});

/**
 * Render a list of blocks.
 * @param {object[]} blocks
 * @param {object} [options]
 * @param {boolean} [options.showCompat=true]
 * @returns {string}
 */
export function renderBlocks(blocks, { showCompat=true }={}) {
  return (blocks ?? []).map(b => renderBlock(b, { showCompat })).join("\n");
}

/**
 * Render one block.
 * @param {object} block
 * @param {object} [options]
 * @returns {string}
 */
export function renderBlock(block, { showCompat=true }={}) {
  switch ( block.type ) {
    case "paragraph": return `<p>${renderInline(block.text)}</p>`;
    case "heading": return `<h4 class="block-heading">${renderInline(block.text)}</h4>`;
    case "list": return `<${block.ordered ? "ol" : "ul"} class="block-list">${block.items.map(i => `<li>${renderInline(i)}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>`;
    case "steps": return `<ol class="block-steps">${block.items.map(i => `<li>${renderInline(i)}</li>`).join("")}</ol>`;
    case "callout": {
      const icons = { tip: "fa-lightbulb", note: "fa-circle-info", warning: "fa-triangle-exclamation", danger: "fa-radiation", challenge: "fa-flag-checkered" };
      const labels = { tip: "Tip", note: "Note", warning: "Warning", danger: "Danger", challenge: "Challenge" };
      const title = block.title ? renderInline(block.title) : labels[block.variant];
      return `<aside class="callout callout-${escapeHTML(block.variant)}" role="note"><div class="callout-title"><i class="fa-solid ${icons[block.variant]}" aria-hidden="true"></i> ${title}</div><div class="callout-body">${renderInline(block.text)}</div></aside>`;
    }
    case "table": {
      const head = `<tr>${block.headers.map(h => `<th scope="col">${renderInline(h)}</th>`).join("")}</tr>`;
      const rows = block.rows.map(r => `<tr>${r.map(c => `<td>${renderInline(String(c))}</td>`).join("")}</tr>`).join("");
      return `<div class="table-wrap"><table class="block-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    }
    case "term": return `<div class="term-block"><a class="academy-link glossary-link" data-action="openTerm" data-term="${escapeHTML(block.term)}"><i class="fa-solid fa-book" aria-hidden="true"></i> ${escapeHTML(block.term)}</a>${block.text ? ` <span class="term-text">${renderInline(block.text)}</span>` : ""}</div>`;
    case "code": return renderCode(block, { showCompat });
    default: return "";
  }
}

/**
 * Render a code block with its caption, compatibility footer and action buttons.
 * @param {object} block
 * @param {object} [options]
 * @returns {string}
 */
export function renderCode(block, { showCompat=true }={}) {
  const language = block.language ?? (block.compat?.target === "json" ? "json" : block.compat?.target === "html" ? "html" : "javascript");
  const body = renderCodeBlock(block.code, { language, annotations: block.annotations ?? [], highlight: block.highlight ?? [] });
  const caption = block.caption ? `<div class="code-caption">${renderInline(block.caption)}</div>` : "";
  const actions = [`<button type="button" class="code-action" data-action="copyCode" aria-label="Copy code"><i class="fa-solid fa-copy" aria-hidden="true"></i> Copy</button>`];
  if ( block.runnable ) actions.push(`<button type="button" class="code-action" data-action="openInWorkshop" data-runtime="${escapeHTML(block.runnable)}" aria-label="Open in workshop"><i class="fa-solid fa-flask" aria-hidden="true"></i> Open in workshop</button>`);
  let compat = "";
  if ( showCompat && block.compat ) {
    const bits = [`<span class="compat-target">${escapeHTML(targetLabel(block.compat))}</span>`, `<span class="compat-tested">${escapeHTML(COMPAT_LABELS[block.compat.tested] ?? block.compat.tested)}</span>`];
    if ( block.compat.note ) bits.push(`<span class="compat-note">${renderInline(block.compat.note)}</span>`);
    compat = `<div class="code-compat">${bits.join(" · ")}</div>`;
  }
  const expect = block.expectError ? `<div class="code-expect-error"><i class="fa-solid fa-bug" aria-hidden="true"></i> This example is intentionally broken.</div>` : "";
  return `<figure class="code-figure">${caption}${body}<div class="code-actions">${actions.join("")}</div>${expect}${compat}<template class="code-source">${escapeHTML(block.code)}</template></figure>`;
}

function targetLabel(compat) {
  switch ( compat.target ) {
    case "javascript": return "Plain JavaScript";
    case "foundry": return `Foundry VTT ${compat.foundryVersion ?? "V14"}`;
    case "dnd5e": return `D&D 5e ${compat.systemVersion ?? ""}`.trim();
    case "module": return `Optional module: ${compat.module ?? ""}`.trim();
    case "pseudocode": return "Pseudocode (not runnable)";
    default: return compat.target;
  }
}

/**
 * Render the lesson header (title, meta, objectives).
 * @param {object} lesson
 * @param {object} [context]
 * @param {string} [context.stateLabel]
 * @param {object} [context.tier]
 * @returns {string}
 */
export function renderLessonHeader(lesson, { stateLabel="", tier=null }={}) {
  const meta = [
    `<span class="meta-item"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Tier ${lesson.tier}${tier ? `: ${escapeHTML(tier.title)}` : ""}</span>`,
    `<span class="meta-item"><i class="fa-solid fa-clock" aria-hidden="true"></i> ${escapeHTML(formatDuration(lesson.estimatedMinutes))}</span>`,
    `<span class="meta-item difficulty-${escapeHTML(lesson.difficulty)}"><i class="fa-solid fa-signal" aria-hidden="true"></i> ${escapeHTML(capitalize(lesson.difficulty))}</span>`,
    `<span class="meta-item"><i class="fa-solid fa-tag" aria-hidden="true"></i> ${escapeHTML(lesson.topic)}</span>`
  ];
  if ( stateLabel ) meta.push(`<span class="meta-item lesson-state">${escapeHTML(stateLabel)}</span>`);
  const access = renderAccessBadges(lesson.access);
  const objectives = `<ul class="objectives">${lesson.objectives.map(o => `<li>${renderInline(o)}</li>`).join("")}</ul>`;
  return `<header class="lesson-header"><h2 class="lesson-title">${escapeHTML(lesson.title)}</h2><div class="lesson-meta">${meta.join("")}</div>${access}<p class="lesson-summary">${renderInline(lesson.summary)}</p><div class="lesson-objectives"><h3>What you will be able to do</h3>${objectives}</div></header>`;
}

/**
 * Render access badges describing what a lesson's practical parts touch.
 * @param {object} access
 * @returns {string}
 */
export function renderAccessBadges(access={}) {
  const defs = [
    ["reads", "Reads game data", "fa-eye"],
    ["writes", "Updates documents", "fa-pen"],
    ["creates", "Creates documents", "fa-plus"],
    ["mechanics", "Triggers game mechanics", "fa-dice-d20"]
  ];
  const items = defs.map(([k, label, icon]) => `<li class="access-badge ${access[k] ? "on" : "off"}"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${label}: <strong>${access[k] ? "yes" : "no"}</strong></li>`);
  return `<ul class="access-badges" aria-label="What this lesson touches">${items.join("")}</ul>`;
}

/**
 * Render all lesson sections as navigable articles.
 * @param {object} lesson
 * @param {object} [options]
 * @param {boolean} [options.progressive=true]   Collapse deep-dive sections for beginners
 * @returns {string}
 */
export function renderLessonSections(lesson, { progressive=true }={}) {
  const order = new Map(REQUIRED_SECTION_KINDS.map((k, i) => [k, i]));
  const sections = [...lesson.sections].sort((a, b) => (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99));
  return sections.map(s => {
    const deep = progressive && ["technical", "deeper", "aside"].includes(s.kind) && lesson.difficulty === "beginner";
    const label = SECTION_LABELS[s.kind] ?? s.kind;
    const inner = renderBlocks(s.blocks);
    if ( deep ) return `<details class="lesson-section section-${escapeHTML(s.kind)}" id="section-${escapeHTML(s.id)}"><summary><span class="section-kind">${escapeHTML(label)}</span> <span class="section-title">${renderInline(s.title)}</span></summary><div class="section-body">${inner}</div></details>`;
    return `<section class="lesson-section section-${escapeHTML(s.kind)}" id="section-${escapeHTML(s.id)}" aria-labelledby="heading-${escapeHTML(s.id)}"><h3 id="heading-${escapeHTML(s.id)}"><span class="section-kind">${escapeHTML(label)}</span> <span class="section-title">${renderInline(s.title)}</span></h3><div class="section-body">${inner}</div></section>`;
  }).join("\n");
}

/**
 * Render the section navigation list.
 * @param {object} lesson
 * @returns {Array<{id:string, label:string, title:string}>}
 */
export function sectionNav(lesson) {
  const order = new Map(REQUIRED_SECTION_KINDS.map((k, i) => [k, i]));
  return [...lesson.sections].sort((a, b) => (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99)).map(s => ({ id: `section-${s.id}`, label: SECTION_LABELS[s.kind] ?? s.kind, title: s.title }));
}

/**
 * Render the "further reading" list.
 * @param {object[]} docs
 * @returns {string}
 */
export function renderDocumentation(docs=[]) {
  if ( !docs.length ) return "";
  const items = docs.map(d => `<li><a class="external-link" href="${escapeHTML(d.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(d.title)} <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a> <span class="doc-verified">(verified ${escapeHTML(d.verified)})</span></li>`);
  return `<ul class="documentation-list">${items.join("")}</ul>`;
}

/**
 * Render a glossary entry.
 * @param {object} term
 * @param {object[]} [relatedLessons]
 * @returns {string}
 */
export function renderTerm(term, relatedLessons=[]) {
  const parts = [`<h3 class="term-title">${escapeHTML(term.term)}</h3>`, `<p class="term-plain">${renderInline(term.plain)}</p>`, `<p class="term-technical"><strong>Precisely:</strong> ${renderInline(term.technical)}</p>`];
  if ( term.analogy ) parts.push(`<p class="term-analogy"><strong>At the table:</strong> ${renderInline(term.analogy)}</p>`);
  if ( term.example ) parts.push(renderCodeBlock(term.example, { language: "javascript" }));
  if ( term.misconception ) parts.push(`<aside class="callout callout-warning" role="note"><div class="callout-title">Common misconception</div><div class="callout-body">${renderInline(term.misconception)}</div></aside>`);
  if ( relatedLessons.length ) parts.push(`<p class="term-related">Related lessons: ${relatedLessons.map(l => `<a class="academy-link lesson-link" data-action="openLesson" data-lesson-id="${escapeHTML(l.id)}">${escapeHTML(l.title)}</a>`).join(", ")}</p>`);
  return `<article class="glossary-entry" id="term-${escapeHTML(term.slug)}">${parts.join("")}</article>`;
}

function capitalize(s) { return String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1); }
