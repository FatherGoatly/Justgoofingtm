/**
 * Small DOM construction helpers. Everything rendered from user-controlled strings goes through
 * textContent, never innerHTML, so file names, aliases, notes and tags cannot inject markup.
 */

/**
 * Create an element.
 * @param {string} tag
 * @param {object} [props]   className, text, attrs (object), dataset (object), on (event map)
 * @param {Array<Node|string>} [children]
 */
export function el(tag, props={}, children=[]) {
  const node = document.createElement(tag);
  if ( props.className ) node.className = props.className;
  if ( props.text !== undefined ) node.textContent = String(props.text);
  if ( props.title ) node.title = props.title;
  if ( props.attrs ) for ( const [k, v] of Object.entries(props.attrs) ) { if ( v !== undefined && v !== null && v !== false ) node.setAttribute(k, v === true ? "" : String(v)); }
  if ( props.dataset ) for ( const [k, v] of Object.entries(props.dataset) ) { if ( v !== undefined && v !== null ) node.dataset[k] = String(v); }
  if ( props.style ) Object.assign(node.style, props.style);
  if ( props.on ) for ( const [k, v] of Object.entries(props.on) ) node.addEventListener(k, v);
  for ( const c of children ) {
    if ( c === null || c === undefined || c === false ) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function icon(classes, extra="") {
  const i = document.createElement("i");
  i.className = `${classes}${extra ? ` ${extra}` : ""}`;
  i.setAttribute("aria-hidden", "true");
  return i;
}

export function clear(node) {
  while ( node.firstChild ) node.removeChild(node.firstChild);
  return node;
}

/** Strip HTML to plain text safely using the DOM parser (no script execution, nothing inserted into the page). */
export function htmlToText(html, maxLength=Infinity) {
  if ( !html ) return "";
  let text = "";
  try {
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    text = doc.body?.textContent ?? "";
  } catch {
    text = String(html).replace(/<[^>]*>/g, " ");
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function localize(key, data) {
  const i18n = globalThis.game?.i18n;
  if ( !i18n ) return key;
  return data ? i18n.format(key, data) : i18n.localize(key);
}
