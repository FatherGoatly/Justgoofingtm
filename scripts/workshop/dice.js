/**
 * A small dice-formula evaluator used by the Foundry emulator (preview runtime). It supports the subset of
 * Foundry roll syntax the curriculum teaches: NdX dice, kh/kl keep modifiers, numbers, + - * /, parentheses and
 * @path data substitution. It is NOT Foundry's Roll parser; the live game uses the real one.
 */

/**
 * Create a seeded pseudo-random generator (mulberry32) so tests are deterministic.
 * @param {number} seed
 * @returns {() => number}
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Replace @path references with values from data.
 * @param {string} formula
 * @param {object} data
 * @returns {string}
 */
export function substituteData(formula, data={}) {
  return String(formula).replace(/@([\w.]+)/g, (_m, path) => {
    const value = path.split(".").reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), data);
    if ( value === undefined || value === null ) throw new Error(`Roll formula references @${path}, which is not present in the roll data.`);
    return typeof value === "number" ? String(value) : String(value);
  });
}

/**
 * Tokenize a formula.
 * @param {string} src
 * @returns {Array<{type:string, value:string}>}
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  while ( i < src.length ) {
    const ch = src[i];
    if ( /\s/.test(ch) ) { i++; continue; }
    let m;
    if ( (m = src.slice(i).match(/^(\d*)d(\d+|f)((?:k[hl]?\d*|d[hl]?\d*|r\d*|min\d+|max\d+|x\d*|cs\d*|cf\d*)*)/i)) ) {
      tokens.push({ type: "dice", value: m[0], count: m[1] === "" ? 1 : parseInt(m[1], 10), faces: m[2].toLowerCase() === "f" ? "f" : parseInt(m[2], 10), mods: m[3] ?? "" });
      i += m[0].length; continue;
    }
    if ( (m = src.slice(i).match(/^\d+(?:\.\d+)?/)) ) { tokens.push({ type: "num", value: m[0] }); i += m[0].length; continue; }
    if ( "+-*/()".includes(ch) ) { tokens.push({ type: "op", value: ch }); i++; continue; }
    throw new Error(`Unexpected character "${ch}" in roll formula "${src}".`);
  }
  return tokens;
}

/**
 * Evaluate a roll formula.
 * @param {string} formula
 * @param {object} [data]
 * @param {object} [options]
 * @param {() => number} [options.random]   RNG (0..1)
 * @param {boolean} [options.maximize]
 * @param {boolean} [options.minimize]
 * @returns {{total:number, formula:string, dice:Array<{formula:string, faces:number, results:Array<{result:number, active:boolean}>, total:number}>, terms:string[]}}
 */
export function evaluateFormula(formula, data={}, { random=Math.random, maximize=false, minimize=false }={}) {
  const substituted = substituteData(formula, data);
  const tokens = tokenize(substituted);
  const dice = [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function rollDie(faces) {
    if ( faces === "f" ) return maximize ? 1 : (minimize ? -1 : Math.floor(random() * 3) - 1);
    if ( maximize ) return faces;
    if ( minimize ) return 1;
    return Math.floor(random() * faces) + 1;
  }

  function rollDice(tok) {
    if ( tok.count > 1000 ) throw new Error("Too many dice (limit 1000).");
    let results = Array.from({ length: tok.count }, () => ({ result: rollDie(tok.faces), active: true }));
    const mods = [...tok.mods.matchAll(/(k[hl]?|d[hl]?|r|min|max|x|cs|cf)(\d*)/gi)];
    for ( const [, kind, nStr] of mods ) {
      const k = kind.toLowerCase();
      const n = nStr === "" ? 1 : parseInt(nStr, 10);
      if ( k === "k" || k === "kh" || k === "kl" ) {
        const sorted = [...results].sort((a, b) => k === "kl" ? a.result - b.result : b.result - a.result);
        const keep = new Set(sorted.slice(0, n));
        for ( const r of results ) r.active = keep.has(r);
      } else if ( k === "d" || k === "dh" || k === "dl" ) {
        const sorted = [...results].sort((a, b) => k === "dh" ? b.result - a.result : a.result - b.result);
        const drop = new Set(sorted.slice(0, n));
        for ( const r of results ) r.active = !drop.has(r);
      } else if ( k === "r" ) {
        const threshold = nStr === "" ? 1 : n;
        results = results.map(r => r.result <= threshold ? { result: rollDie(tok.faces), active: true, rerolled: true } : r);
      } else if ( k === "min" ) {
        for ( const r of results ) if ( r.result < n ) r.result = n;
      } else if ( k === "max" ) {
        for ( const r of results ) if ( r.result > n ) r.result = n;
      } else if ( k === "x" ) {
        const explodeOn = nStr === "" ? tok.faces : n;
        let guard = 0;
        for ( let i = 0; i < results.length && guard < 100; i++ ) {
          if ( results[i].result >= explodeOn ) { results.push({ result: rollDie(tok.faces), active: true, exploded: true }); guard++; }
        }
      }
    }
    const total = results.filter(r => r.active).reduce((s, r) => s + r.result, 0);
    dice.push({ formula: tok.value, faces: tok.faces, count: tok.count, results, total });
    return total;
  }

  function parseFactor() {
    const tok = next();
    if ( !tok ) throw new Error(`Unexpected end of roll formula "${substituted}".`);
    if ( tok.type === "num" ) return parseFloat(tok.value);
    if ( tok.type === "dice" ) return rollDice(tok);
    if ( tok.type === "op" && tok.value === "(" ) {
      const v = parseExpr();
      const close = next();
      if ( !close || close.value !== ")" ) throw new Error(`Missing ")" in roll formula "${substituted}".`);
      return v;
    }
    if ( tok.type === "op" && tok.value === "-" ) return -parseFactor();
    if ( tok.type === "op" && tok.value === "+" ) return parseFactor();
    throw new Error(`Unexpected "${tok.value}" in roll formula "${substituted}".`);
  }
  function parseTerm() {
    let v = parseFactor();
    while ( peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/") ) {
      const op = next().value;
      const r = parseFactor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function parseExpr() {
    let v = parseTerm();
    while ( peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-") ) {
      const op = next().value;
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const total = parseExpr();
  if ( pos < tokens.length ) throw new Error(`Unexpected "${tokens[pos].value}" in roll formula "${substituted}".`);
  return { total, formula: substituted.replace(/\s+/g, " ").trim(), dice, terms: tokens.map(t => t.value) };
}

/**
 * Is the formula syntactically valid? Mirrors Roll.validate's purpose.
 * @param {string} formula
 * @returns {boolean}
 */
export function validateFormula(formula) {
  try { evaluateFormula(String(formula).replace(/@[\w.]+/g, "1"), {}, { random: () => 0.5 }); return true; }
  catch(_err) { return false; }
}
