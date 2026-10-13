import { LIMITS } from "../core/constants.js";

/**
 * Restricted dice-formula parser and validator.
 *
 * Imported formulas are never passed to `eval`, `Function` or an unvalidated `Roll`. This module
 * tokenizes and parses a formula into an AST using an explicit grammar, enforces allow-lists for
 * operators, functions, dice modifiers and `@` references, and bounds complexity. Only the
 * canonical string produced here is handed to the system's roll engine.
 *
 * Grammar (precedence low → high):
 *   expr    := term (("+" | "-") term)*
 *   term    := unary (("*" | "/" | "%") unary)*
 *   unary   := ("-" | "+") unary | primary
 *   primary := number | dice | reference | func "(" expr ("," expr)* ")" | "(" expr ")"
 */

const ALLOWED_FUNCTIONS = new Set(["floor", "ceil", "round", "min", "max", "abs", "clamp", "signum"]);

/** Allowed `@` reference prefixes (relative to actor/item roll data). */
const ALLOWED_REFERENCE_PREFIXES = [
  "abilities.", "attributes.", "details.", "skills.", "spells.", "classes.", "scale.", "item.", "activity.",
  "resources.", "traits.", "bonuses.", "rolls.", "flags.dnd5e.", "prof", "mod", "level", "spellcasting.",
  "scaling", "attack", "damage", "save", "target.", "name"
];

const DICE_MODIFIER_RE = /^(kh\d*|kl\d*|dh\d*|dl\d*|k\d*|d\d+|r<\d+|r>\d+|r=\d+|r\d+|ro<\d+|ro>\d+|ro\d+|min\d+|max\d+|x\d*|xo\d*|cs<=?\d+|cs>=?\d+|cf<=?\d+|cf>=?\d+|ms\d*)$/i;

/** Token patterns. Order matters. */
const TOKEN_PATTERNS = [
  ["ws", /^\s+/],
  ["dice", /^(\d*)d(\d+|%)((?:kh\d*|kl\d*|dh\d*|dl\d*|r<\d+|r>\d+|r=\d+|ro<\d+|ro>\d+|ro\d+|r\d+|min\d+|max\d+|xo\d*|x\d*|cs<=?\d+|cs>=?\d+|cf<=?\d+|cf>=?\d+|ms\d*|k\d*)*)/i],
  ["number", /^\d+(?:\.\d+)?/],
  ["reference", /^@[a-zA-Z_][a-zA-Z0-9_.\-]*/],
  ["func", /^[a-zA-Z_]+(?=\s*\()/],
  ["op", /^[-+*/%]/],
  ["lparen", /^\(/],
  ["rparen", /^\)/],
  ["comma", /^,/]
];

class FormulaError extends Error {}

/**
 * Tokenize a formula string.
 * @param {string} formula
 * @returns {object[]}
 */
export function tokenize(formula) {
  const tokens = [];
  let rest = formula;
  let pos = 0;
  while ( rest.length ) {
    let matched = false;
    for ( const [type, re] of TOKEN_PATTERNS ) {
      const m = rest.match(re);
      if ( !m ) continue;
      matched = true;
      if ( type !== "ws" ) tokens.push({ type, value: m[0], pos, groups: m.slice(1) });
      rest = rest.slice(m[0].length);
      pos += m[0].length;
      break;
    }
    if ( !matched ) throw new FormulaError(`Unexpected character "${rest[0]}" at position ${pos}`);
  }
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
    this.terms = 0;
    this.references = [];
    this.dice = [];
    this.functions = [];
  }

  peek() { return this.tokens[this.i]; }

  next() { return this.tokens[this.i++]; }

  expect(type, value) {
    const t = this.next();
    if ( !t || t.type !== type || (value !== undefined && t.value !== value) ) {
      throw new FormulaError(`Expected ${value ?? type} but found ${t ? `"${t.value}"` : "end of formula"}`);
    }
    return t;
  }

  bump() {
    this.terms++;
    if ( this.terms > LIMITS.MAX_FORMULA_TERMS ) throw new FormulaError("Formula is too complex");
  }

  parseExpr() {
    let node = this.parseTerm();
    while ( this.peek()?.type === "op" && ["+", "-"].includes(this.peek().value) ) {
      const op = this.next().value;
      const right = this.parseTerm();
      node = { type: "binary", op, left: node, right };
    }
    return node;
  }

  parseTerm() {
    let node = this.parseUnary();
    while ( this.peek()?.type === "op" && ["*", "/", "%"].includes(this.peek().value) ) {
      const op = this.next().value;
      const right = this.parseUnary();
      node = { type: "binary", op, left: node, right };
    }
    return node;
  }

  parseUnary() {
    const t = this.peek();
    if ( t?.type === "op" && ["-", "+"].includes(t.value) ) {
      this.next();
      return { type: "unary", op: t.value, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.next();
    if ( !t ) throw new FormulaError("Unexpected end of formula");
    this.bump();
    switch ( t.type ) {
      case "number": return { type: "number", value: Number(t.value) };
      case "dice": {
        const [countStr, facesStr, mods] = t.groups;
        const count = countStr ? parseInt(countStr, 10) : 1;
        const faces = facesStr === "%" ? 100 : parseInt(facesStr, 10);
        if ( count > LIMITS.MAX_DICE_COUNT ) throw new FormulaError(`Too many dice (${count})`);
        if ( faces > LIMITS.MAX_DIE_FACES || faces < 1 ) throw new FormulaError(`Invalid die faces (${faces})`);
        const modifiers = splitModifiers(mods ?? "");
        for ( const mod of modifiers ) if ( !DICE_MODIFIER_RE.test(mod) ) throw new FormulaError(`Unsupported dice modifier "${mod}"`);
        const node = { type: "dice", count, faces, modifiers };
        this.dice.push(node);
        return node;
      }
      case "reference": {
        const path = t.value.slice(1);
        if ( !ALLOWED_REFERENCE_PREFIXES.some(p => path === p.replace(/\.$/, "") || path.startsWith(p)) ) {
          throw new FormulaError(`Reference "@${path}" is not allowed`);
        }
        if ( path.includes("..") || path.includes("__proto__") || path.includes("constructor") ) {
          throw new FormulaError(`Reference "@${path}" is not allowed`);
        }
        this.references.push(path);
        return { type: "reference", path };
      }
      case "func": {
        const name = t.value.toLowerCase();
        if ( !ALLOWED_FUNCTIONS.has(name) ) throw new FormulaError(`Function "${t.value}" is not allowed`);
        this.expect("lparen");
        const args = [this.parseExpr()];
        while ( this.peek()?.type === "comma" ) { this.next(); args.push(this.parseExpr()); }
        this.expect("rparen");
        this.functions.push(name);
        return { type: "func", name, args };
      }
      case "lparen": {
        const inner = this.parseExpr();
        this.expect("rparen");
        return { type: "group", inner };
      }
      default:
        throw new FormulaError(`Unexpected token "${t.value}"`);
    }
  }
}

function splitModifiers(mods) {
  const out = [];
  const re = /(kh\d*|kl\d*|dh\d*|dl\d*|r<\d+|r>\d+|r=\d+|ro<\d+|ro>\d+|ro\d+|r\d+|min\d+|max\d+|xo\d*|x\d*|cs<=?\d+|cs>=?\d+|cf<=?\d+|cf>=?\d+|ms\d*|k\d*)/gi;
  let m;
  while ( (m = re.exec(mods)) ) out.push(m[0]);
  return out;
}

/**
 * Render an AST back to a canonical formula string.
 * @param {object} node
 * @returns {string}
 */
export function stringify(node) {
  switch ( node.type ) {
    case "number": return String(node.value);
    case "dice": return `${node.count}d${node.faces}${node.modifiers.join("")}`;
    case "reference": return `@${node.path}`;
    case "unary": return `${node.op}${stringify(node.operand)}`;
    case "binary": return `${stringify(node.left)} ${node.op} ${stringify(node.right)}`;
    case "group": return `(${stringify(node.inner)})`;
    case "func": return `${node.name}(${node.args.map(stringify).join(", ")})`;
    default: throw new FormulaError(`Unknown node ${node.type}`);
  }
}

/**
 * Evaluate an AST. Dice nodes are evaluated with the provided strategy ("average", "min", "max").
 * References are resolved from `data` (dotted paths). Unknown references resolve to 0 and are
 * reported in `missing`.
 * @param {object} node
 * @param {object} [data]
 * @param {object} [options]
 * @param {"average"|"min"|"max"} [options.dice="average"]
 * @param {string[]} [options.missing]
 * @returns {number}
 */
export function evaluate(node, data={}, options={}) {
  const strategy = options.dice ?? "average";
  const missing = options.missing ?? [];
  const ev = n => evaluate(n, data, { ...options, missing });
  switch ( node.type ) {
    case "number": return node.value;
    case "dice": {
      let perDie;
      if ( strategy === "min" ) perDie = 1;
      else if ( strategy === "max" ) perDie = node.faces;
      else perDie = (node.faces + 1) / 2;
      let count = node.count;
      const keep = node.modifiers.find(m => /^k[hl]?\d*$/i.test(m));
      if ( keep ) {
        const n = parseInt(keep.replace(/^k[hl]?/i, ""), 10);
        if ( Number.isFinite(n) ) count = Math.min(count, n);
        else count = 1;
      }
      return count * perDie;
    }
    case "reference": {
      const value = getPath(data, node.path);
      if ( value === undefined || value === null ) { missing.push(node.path); return 0; }
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    }
    case "unary": return node.op === "-" ? -ev(node.operand) : ev(node.operand);
    case "group": return ev(node.inner);
    case "binary": {
      const l = ev(node.left), r = ev(node.right);
      switch ( node.op ) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? 0 : l / r;
        case "%": return r === 0 ? 0 : l % r;
      }
      return 0;
    }
    case "func": {
      const args = node.args.map(ev);
      switch ( node.name ) {
        case "floor": return Math.floor(args[0]);
        case "ceil": return Math.ceil(args[0]);
        case "round": return Math.round(args[0]);
        case "abs": return Math.abs(args[0]);
        case "min": return Math.min(...args);
        case "max": return Math.max(...args);
        case "signum": return Math.sign(args[0]);
        case "clamp": return Math.min(Math.max(args[0], args[1] ?? -Infinity), args[2] ?? Infinity);
      }
      return 0;
    }
  }
  return 0;
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o !== null && o !== undefined && typeof o === "object") ? o[k] : undefined, obj);
}

/**
 * Validate a formula.
 * @param {string} formula
 * @param {object} [options]
 * @param {boolean} [options.deterministic=false]  Require no dice.
 * @param {boolean} [options.allowReferences=true]
 * @param {boolean} [options.allowEmpty=true]
 * @returns {FormulaValidation}
 */
export function validateFormula(formula, options={}) {
  const result = {
    valid: false, input: formula, formula: "", errors: [], warnings: [], ast: null, deterministic: true,
    average: null, min: null, max: null, references: [], dice: [], functions: []
  };
  if ( formula === null || formula === undefined ) formula = "";
  if ( typeof formula !== "string" ) formula = String(formula);
  formula = formula.trim();
  if ( !formula ) {
    if ( options.allowEmpty === false ) result.errors.push("Formula is empty");
    else result.valid = true;
    return result;
  }
  if ( formula.length > LIMITS.MAX_FORMULA_LENGTH ) {
    result.errors.push(`Formula exceeds ${LIMITS.MAX_FORMULA_LENGTH} characters`);
    return result;
  }
  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens);
    const ast = parser.parseExpr();
    if ( parser.peek() ) throw new FormulaError(`Unexpected token "${parser.peek().value}"`);
    result.ast = ast;
    result.references = parser.references;
    result.dice = parser.dice.map(d => `${d.count}d${d.faces}${d.modifiers.join("")}`);
    result.functions = parser.functions;
    result.deterministic = parser.dice.length === 0;
    result.formula = stringify(ast);
    if ( options.deterministic && !result.deterministic ) result.errors.push("Formula must not contain dice");
    if ( options.allowReferences === false && parser.references.length ) result.errors.push("Formula must not contain references");
    const missing = [];
    result.average = round2(evaluate(ast, options.data ?? {}, { dice: "average", missing }));
    result.min = round2(evaluate(ast, options.data ?? {}, { dice: "min" }));
    result.max = round2(evaluate(ast, options.data ?? {}, { dice: "max" }));
    if ( missing.length && !options.data ) {
      // Without data, unresolved references are expected; keep informational.
      result.warnings.push(`Unresolved references: ${[...new Set(missing)].join(", ")}`);
    } else if ( missing.length ) {
      result.warnings.push(`Unknown references: ${[...new Set(missing)].join(", ")}`);
    }
    result.valid = result.errors.length === 0;
  } catch (err) {
    result.errors.push(err.message);
  }
  return result;
}

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Convenience: is this a simple "NdX [+ bonus]" damage formula?
 * @param {string} formula
 * @returns {{number: number, denomination: number, bonus: string}|null}
 */
export function splitSimpleDice(formula) {
  const v = validateFormula(formula);
  if ( !v.valid || !v.ast ) return null;
  const parts = [];
  const flatten = n => {
    if ( n.type === "binary" && n.op === "+" ) { flatten(n.left); flatten(n.right); }
    else parts.push(n);
  };
  flatten(v.ast);
  const diceParts = parts.filter(p => p.type === "dice");
  if ( diceParts.length !== 1 || diceParts[0].modifiers.length ) return null;
  if ( parts[0] !== diceParts[0] ) return null;
  const rest = parts.slice(1);
  if ( rest.some(p => p.type === "dice") ) return null;
  const bonus = rest.map(stringify).join(" + ");
  return { number: diceParts[0].count, denomination: diceParts[0].faces, bonus };
}

/** Normalize unicode minus and spacing in a formula string before validation. */
export function cleanFormulaText(text) {
  return String(text ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*([+\-*/()])\s*/g, " $1 ")
    .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
    .trim();
}
