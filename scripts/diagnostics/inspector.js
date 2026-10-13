/**
 * A controlled object inspector: turns a document or value into a depth-limited tree of plain descriptions
 * that the UI renders. Reading only: it never calls methods or mutates anything.
 */

/**
 * @typedef {object} InspectNode
 * @property {string} key
 * @property {string} type
 * @property {string} preview
 * @property {string} path
 * @property {InspectNode[]|null} children
 * @property {boolean} truncated
 */

const SKIP_KEYS = new Set(["parent", "schema", "collection", "apps", "_sheet", "compendium", "pack"]);

/**
 * Inspect a value.
 * @param {unknown} value
 * @param {object} [options]
 * @param {number} [options.maxDepth=3]
 * @param {number} [options.maxKeys=40]
 * @param {string} [options.path=""]
 * @returns {InspectNode}
 */
export function inspect(value, { maxDepth=3, maxKeys=40, path="", key="(root)", depth=0 }={}) {
  const type = typeOf(value);
  const node = { key, type, preview: preview(value, type), path, children: null, truncated: false };
  if ( depth >= maxDepth ) { node.truncated = type === "object" || type === "array" || type === "document" || type === "collection" || type === "set" || type === "map"; return node; }
  let entries = null;
  if ( type === "array" ) entries = value.map((v, i) => [String(i), v]);
  else if ( type === "set" ) entries = [...value].map((v, i) => [String(i), v]);
  else if ( type === "map" || type === "collection" ) entries = [...value.entries()].map(([k, v]) => [String(k), v]);
  else if ( type === "object" || type === "document" ) {
    entries = [];
    for ( const k of safeKeys(value) ) { if ( SKIP_KEYS.has(k) || k.startsWith("_") ) continue; try { entries.push([k, value[k]]); } catch(_err) { entries.push([k, "(unreadable)"]); } }
    if ( type === "document" ) {
      for ( const k of ["id", "uuid", "name", "type"] ) if ( !entries.some(e => e[0] === k) ) { try { entries.unshift([k, value[k]]); } catch(_err) { /* ignore */ } }
    }
  }
  if ( entries ) {
    node.truncated = entries.length > maxKeys;
    node.children = entries.slice(0, maxKeys).map(([k, v]) => inspect(v, { maxDepth, maxKeys, path: path ? `${path}.${k}` : k, key: k, depth: depth + 1 }));
  }
  return node;
}

function safeKeys(obj) {
  const keys = new Set(Object.keys(obj));
  // Include getters from the prototype chain for documents/data models (name, uuid, system...)
  let proto = Object.getPrototypeOf(obj);
  let guard = 0;
  while ( proto && proto !== Object.prototype && guard++ < 6 ) {
    for ( const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(proto)) ) if ( d.get && !k.startsWith("_") && !SKIP_KEYS.has(k) ) keys.add(k);
    proto = Object.getPrototypeOf(proto);
  }
  return [...keys].sort();
}

export function typeOf(v) {
  if ( v === null ) return "null";
  if ( Array.isArray(v) ) return "array";
  if ( v instanceof Set ) return "set";
  if ( v instanceof Map ) return (typeof v.getName === "function" || v.constructor?.name === "Collection") ? "collection" : "map";
  if ( typeof v === "object" ) return v.documentName ? "document" : "object";
  return typeof v;
}

function preview(v, type) {
  switch ( type ) {
    case "string": return JSON.stringify(v.length > 60 ? `${v.slice(0, 60)}…` : v);
    case "number": case "boolean": case "undefined": case "null": case "bigint": return String(v);
    case "function": return `ƒ ${v.name || "anonymous"}()`;
    case "symbol": return v.toString();
    case "array": return `Array(${v.length})`;
    case "set": return `Set(${v.size})`;
    case "map": return `Map(${v.size})`;
    case "collection": return `Collection(${v.size})`;
    case "document": return `${v.documentName} "${v.name ?? v.id}"`;
    default: {
      const ctor = v?.constructor?.name;
      return ctor && ctor !== "Object" ? `${ctor} {…}` : `{${Object.keys(v).length} keys}`;
    }
  }
}

/**
 * Resolve a dotted path on a value without calling functions.
 * @param {unknown} root
 * @param {string} path
 * @returns {unknown}
 */
export function resolvePath(root, path) {
  if ( !path ) return root;
  let cur = root;
  for ( const part of path.split(".") ) {
    if ( cur === null || cur === undefined ) return undefined;
    if ( cur instanceof Map ) cur = cur.get(part);
    else if ( cur instanceof Set ) cur = [...cur][Number(part)];
    else cur = cur[part];
  }
  return cur;
}
