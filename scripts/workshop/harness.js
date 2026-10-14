/**
 * Compiles and runs learner code with a controlled set of globals, capturing console output, errors and
 * function-call test results. This file is imported by the sandbox Web Worker (and by the Node test runner).
 * It is the one place in the module where learner code is turned into a function; see docs/security.md.
 */

const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

/** Convert any value to a console-like string. */
export function formatValue(v, depth=0) {
  if ( typeof v === "string" ) return depth ? JSON.stringify(v) : v;
  if ( typeof v === "number" || typeof v === "boolean" || v === null || v === undefined ) return String(v);
  if ( typeof v === "bigint" ) return `${v}n`;
  if ( typeof v === "function" ) return `[Function${v.name ? `: ${v.name}` : ""}]`;
  if ( typeof v === "symbol" ) return v.toString();
  if ( v instanceof Error ) return `${v.name}: ${v.message}`;
  if ( v instanceof Set ) return `Set(${v.size}) {${[...v].map(x => formatValue(x, depth + 1)).join(", ")}}`;
  if ( v instanceof Map ) return `Map(${v.size}) {${[...v].map(([k, x]) => `${formatValue(k, depth + 1)} => ${formatValue(x, depth + 1)}`).join(", ")}}`;
  if ( depth > 3 ) return Array.isArray(v) ? "[Array]" : "[Object]";
  if ( Array.isArray(v) ) return `[${v.map(x => formatValue(x, depth + 1)).join(", ")}]`;
  if ( v && typeof v.toObject === "function" && v.documentName ) return `${v.documentName} { name: ${JSON.stringify(v.name)}, id: ${JSON.stringify(v.id)} }`;
  try {
    const keys = Object.keys(v);
    if ( !keys.length ) return "{}";
    return `{ ${keys.slice(0, 20).map(k => `${k}: ${formatValue(v[k], depth + 1)}`).join(", ")}${keys.length > 20 ? ", …" : ""} }`;
  } catch(_err) { return String(v); }
}

/**
 * Create a console object that records output lines.
 * @param {string[]} output
 * @returns {Console}
 */
export function createConsole(output) {
  const push = (prefix, args) => output.push(`${prefix}${args.map(a => formatValue(a)).join(" ")}`);
  return {
    log: (...a) => push("", a), info: (...a) => push("", a), debug: (...a) => push("", a),
    warn: (...a) => push("⚠ ", a), error: (...a) => push("✖ ", a),
    table: (...a) => push("", a), dir: (...a) => push("", a), trace: (...a) => push("", a),
    group: (...a) => push("", a), groupEnd: () => {}, groupCollapsed: (...a) => push("", a), assert: (cond, ...a) => { if ( !cond ) push("Assertion failed: ", a); },
    count: () => {}, time: () => {}, timeEnd: () => {}, clear: () => {}
  };
}

/**
 * Describe an error thrown by learner code, extracting the learner-visible line number where possible.
 * The body of a dynamically created function starts on line 3 of its stack frame in V8, and compile() adds one
 * line for the opening block brace, so learner code starts on line 4.
 * @param {unknown} err
 * @returns {{name:string, message:string, stack?:string, line:number|null}}
 */
export function describeError(err) {
  if ( !(err instanceof Error) ) return { name: "Error", message: String(err), line: null };
  let line = null;
  const m = /<anonymous>:(\d+):(\d+)/.exec(err.stack ?? "") ?? /eval at [^\n]*:(\d+):(\d+)/.exec(err.stack ?? "");
  // Function header (line 1), function brace (line 2), block brace (line 3); learner code starts on line 4.
  if ( m ) line = Math.max(1, parseInt(m[1], 10) - 3);
  return { name: err.name, message: err.message, stack: err.stack, line };
}

/**
 * Compile learner code. Returns a function or throws a SyntaxError.
 * @param {string} code
 * @param {string[]} globalNames
 * @param {string[]} [collect]   Names of functions to collect after the program finishes
 * @returns {Function}
 */
export function compile(code, globalNames, collect=[]) {
  // The program is wrapped in a block exactly as Foundry wraps a script macro's command, so learner code may
  // shadow globals with const/let (e.g. `const CONFIG = {...}`) without a redeclaration error.
  let trailer = "";
  if ( collect.length ) {
    // A collected name may be a dotted member path (e.g. "T.config.validate"); the root is guarded with typeof and the
    // rest with optional chaining so a missing function yields undefined instead of a ReferenceError.
    const expr = n => { const parts = n.split("."); return `(typeof ${parts[0]} === "undefined" ? undefined : ${parts.join("?.")})`; };
    trailer = `\n;return { __academyFns: { ${collect.map(n => `${JSON.stringify(n)}: ${expr(n)}`).join(", ")} } };`;
  }
  return new AsyncFunction(...globalNames, `{\n${code}\n${trailer}\n}`);
}

/**
 * Syntax-check code without running it.
 * @param {string} code
 * @returns {{ok:boolean, error:{name:string,message:string}|null}}
 */
export function checkSyntax(code) {
  try { new AsyncFunction(String(code)); return { ok: true, error: null }; }
  catch(err) { return { ok: false, error: { name: err.name, message: err.message } }; }
}

/**
 * Run a program.
 * @param {object} options
 * @param {string} options.code
 * @param {Record<string, unknown>} options.globals   Names visible to the program
 * @param {object[]} [options.tests]                  Exercise tests (only `call` tests are executed here)
 * @returns {Promise<{ok:boolean, error:object|null, output:string[], returnValue:unknown, callResults:object[], durationMs:number}>}
 */
export async function runProgram({ code, globals={}, tests=[] }) {
  const output = [];
  const console = createConsole(output);
  const names = ["console", ...Object.keys(globals)];
  const values = [console, ...Object.values(globals)];
  const callTests = tests.map((t, index) => ({ t, index })).filter(({ t }) => t && "call" in t);
  const collect = [...new Set(callTests.map(({ t }) => t.call))].filter(n => /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(n));
  const started = Date.now();
  let fn;
  try { fn = compile(String(code), names, collect); }
  catch(err) {
    return { ok: false, error: describeError(err), output, returnValue: undefined, callResults: callTests.map(({ index }) => ({ index, missing: true })), durationMs: Date.now() - started };
  }
  let returnValue;
  let error = null;
  let fns = {};
  try {
    const result = await fn(...values);
    if ( result && typeof result === "object" && result.__academyFns ) fns = result.__academyFns;
    else returnValue = result;
  } catch(err) {
    error = describeError(err);
  }
  const callResults = [];
  for ( const { t, index } of callTests ) {
    const f = fns[t.call];
    if ( typeof f !== "function" ) { callResults.push({ index, missing: true }); continue; }
    try {
      const args = JSON.parse(JSON.stringify(t.args ?? []));
      let value = f(...args);
      if ( value && typeof value.then === "function" ) value = await value;
      callResults.push({ index, result: sanitize(value) });
    } catch(err) {
      callResults.push({ index, error: describeError(err) });
    }
  }
  return { ok: !error, error, output, returnValue: sanitize(returnValue), callResults, durationMs: Date.now() - started };
}

/** Make a value structured-cloneable and JSON-like. */
export function sanitize(v, depth=0) {
  if ( v === undefined || v === null ) return v;
  if ( typeof v === "number" || typeof v === "string" || typeof v === "boolean" ) return v;
  if ( typeof v === "bigint" ) return Number(v);
  if ( typeof v === "function" || typeof v === "symbol" ) return formatValue(v);
  if ( depth > 6 ) return "[nested]";
  if ( Array.isArray(v) ) return v.map(x => sanitize(x, depth + 1));
  if ( v instanceof Set ) return [...v].map(x => sanitize(x, depth + 1));
  if ( v instanceof Map ) return Object.fromEntries([...v].map(([k, x]) => [String(k), sanitize(x, depth + 1)]));
  if ( v instanceof Error ) return { name: v.name, message: v.message };
  if ( typeof v.toObject === "function" && v.documentName ) return { documentName: v.documentName, id: v.id, name: v.name, uuid: v.uuid };
  if ( typeof v === "object" ) {
    const out = {};
    for ( const k of Object.keys(v) ) { if ( k.startsWith("_") ) continue; out[k] = sanitize(v[k], depth + 1); }
    return out;
  }
  return String(v);
}
