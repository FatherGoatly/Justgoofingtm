/**
 * Line-based comparison used by the workshop's "compare" view. Pure JavaScript, no Foundry dependency.
 */

/**
 * @typedef {object} DiffLine
 * @property {"same"|"added"|"removed"} type  Relative to `before`: added lines exist only in `after`.
 * @property {string} text
 * @property {number|null} beforeLine
 * @property {number|null} afterLine
 */

/**
 * Compute a line diff between two texts using a longest-common-subsequence table.
 * @param {string} before
 * @param {string} after
 * @returns {DiffLine[]}
 */
export function diffLines(before, after) {
  const a = normalize(before);
  const b = normalize(after);
  const n = a.length, m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for ( let i = n - 1; i >= 0; i-- ) {
    for ( let j = m - 1; j >= 0; j-- ) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while ( i < n && j < m ) {
    if ( a[i] === b[j] ) { out.push({ type: "same", text: a[i], beforeLine: i + 1, afterLine: j + 1 }); i++; j++; }
    else if ( table[i + 1][j] >= table[i][j + 1] ) { out.push({ type: "removed", text: a[i], beforeLine: i + 1, afterLine: null }); i++; }
    else { out.push({ type: "added", text: b[j], beforeLine: null, afterLine: j + 1 }); j++; }
  }
  while ( i < n ) { out.push({ type: "removed", text: a[i], beforeLine: i + 1, afterLine: null }); i++; }
  while ( j < m ) { out.push({ type: "added", text: b[j], beforeLine: null, afterLine: j + 1 }); j++; }
  return out;
}

function normalize(text) {
  const s = String(text ?? "").replace(/\r\n/g, "\n");
  if ( s === "" ) return [];
  return s.split("\n");
}

/**
 * Summarize a diff in plain English for learners.
 * @param {DiffLine[]} diff
 * @returns {{added:number, removed:number, changed:number, summary:string}}
 */
export function summarizeDiff(diff) {
  const added = diff.filter(d => d.type === "added").length;
  const removed = diff.filter(d => d.type === "removed").length;
  const same = diff.filter(d => d.type === "same").length;
  let summary;
  if ( !added && !removed ) summary = "The two versions are identical.";
  else {
    const parts = [];
    if ( added ) parts.push(`${added} line${added === 1 ? "" : "s"} added`);
    if ( removed ) parts.push(`${removed} line${removed === 1 ? "" : "s"} removed`);
    summary = `${parts.join(" and ")}; ${same} unchanged.`;
  }
  return { added, removed, changed: added + removed, summary };
}

/**
 * Describe the kinds of differences found, to turn a diff into a teaching aid rather than a bare listing.
 * Looks for a handful of recognisable patterns in the changed lines.
 * @param {DiffLine[]} diff
 * @returns {string[]}
 */
export function explainDiff(diff) {
  const notes = [];
  const added = diff.filter(d => d.type === "added").map(d => d.text);
  const removed = diff.filter(d => d.type === "removed").map(d => d.text);
  const joinedAdded = added.join("\n");
  const joinedRemoved = removed.join("\n");
  const has = (text, re) => re.test(text);
  if ( has(joinedAdded, /\bawait\b/) && !has(joinedRemoved, /\bawait\b/) ) notes.push("The reference waits for asynchronous work with `await`; make sure every promise-returning call is awaited before its result is used.");
  if ( has(joinedAdded, /\btry\s*{/) && !has(joinedRemoved, /\btry\s*{/) ) notes.push("The reference wraps risky work in `try`/`catch` so a failure produces a readable message instead of a silent stop.");
  if ( has(joinedAdded, /\bconst\b|\blet\b/) && has(joinedRemoved, /\bvar\b/) ) notes.push("`var` was replaced with `const`/`let`, which keeps variables scoped to the block where they are declared.");
  if ( has(joinedAdded, /\?\./) && !has(joinedRemoved, /\?\./) ) notes.push("Optional chaining (`?.`) guards against reading a property of something that may be `null` or `undefined`.");
  if ( has(joinedAdded, /ui\.notifications\.(warn|error)/) && !has(joinedRemoved, /ui\.notifications\.(warn|error)/) ) notes.push("The reference reports problems to the user with `ui.notifications` instead of failing silently.");
  if ( has(joinedAdded, /\.length\s*===?\s*0|!.*\.length/) && !has(joinedRemoved, /\.length\s*===?\s*0|!.*\.length/) ) notes.push("The reference checks for an empty selection before doing any work.");
  if ( added.length && !removed.length ) notes.push("Your version is missing lines that the reference includes; compare the added lines to see which step was skipped.");
  if ( removed.length && !added.length ) notes.push("Your version has extra lines the reference does not need. Extra lines are not wrong by themselves, but check that each one does something useful.");
  if ( !notes.length && (added.length || removed.length) ) notes.push("The versions differ in wording or structure. Different code can still be correct: the tests decide, not the diff.");
  return notes;
}
