import { localize } from "../utilities/dom.js";

/**
 * Thin wrappers around DialogV2 so actions can be unit-tested by swapping `dialogs` implementations.
 * All dynamic text inserted into dialog HTML goes through `esc`.
 */
export function esc(value) {
  const f = globalThis.foundry?.utils?.escapeHTML;
  if ( typeof f === "function" ) return f(String(value ?? ""));
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function DialogV2() { return globalThis.foundry?.applications?.api?.DialogV2; }

export const dialogs = {
  /** @returns {Promise<boolean>} true when confirmed */
  async confirm({ title, content, yesLabel=null, yesIcon="fa-solid fa-check", danger=false }) {
    const D = DialogV2();
    if ( !D ) return globalThis.confirm?.(content.replace(/<[^>]+>/g, " ")) ?? false;
    const result = await D.confirm({
      window: { title },
      content,
      modal: true,
      rejectClose: false,
      classes: ["gm-asset-library", "gmal-dialog", danger ? "danger" : ""],
      yes: { label: yesLabel ?? localize("Yes"), icon: yesIcon, default: !danger },
      no: { label: localize("No"), default: danger }
    });
    return result === true;
  },

  /** @returns {Promise<string|null>} the entered text or null when cancelled */
  async promptText({ title, label, value="", hint=null, multiline=false, placeholder="" }) {
    const D = DialogV2();
    const id = `gmal-input-${Math.random().toString(36).slice(2, 8)}`;
    const field = multiline
      ? `<textarea id="${id}" name="value" rows="5" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
      : `<input id="${id}" name="value" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus>`;
    const content = `<div class="form-group stacked"><label for="${id}">${esc(label)}</label>${field}${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
    if ( !D ) { const v = globalThis.prompt?.(label, value); return v === null || v === undefined ? null : String(v); }
    const result = await D.prompt({
      window: { title }, content, modal: true, rejectClose: false, classes: ["gm-asset-library", "gmal-dialog"],
      ok: { label: localize("GMAL.Dialog.OK"), icon: "fa-solid fa-check", callback: (event, button) => button.form.elements.value.value }
    });
    return typeof result === "string" ? result : null;
  },

  /**
   * Pick one option from a select.
   * @param {object} config  { title, label, options: [{value, label, group?}], hint, selected }
   * @returns {Promise<string|null>}
   */
  async pickOption({ title, label, options, hint=null, selected=null, content: extra="" }) {
    const D = DialogV2();
    if ( !options?.length ) return null;
    if ( !D ) return options[0].value;
    const id = `gmal-select-${Math.random().toString(36).slice(2, 8)}`;
    const opts = options.map(o => `<option value="${esc(o.value)}" ${o.value === selected ? "selected" : ""}>${esc(o.label)}</option>`).join("");
    const content = `${extra}<div class="form-group stacked"><label for="${id}">${esc(label)}</label><select id="${id}" name="choice">${opts}</select>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
    const result = await D.prompt({
      window: { title }, content, modal: true, rejectClose: false, classes: ["gm-asset-library", "gmal-dialog"],
      ok: { label: localize("GMAL.Dialog.Continue"), icon: "fa-solid fa-arrow-right", callback: (event, button) => button.form.elements.choice.value }
    });
    return typeof result === "string" ? result : null;
  },

  /**
   * A small form dialog. `fields` is [{name, label, type: "text"|"number"|"select"|"checkbox", value, options, hint, min, max, step}].
   * @returns {Promise<object|null>} field values keyed by name, or null when cancelled
   */
  async form({ title, fields, content: extra="", okLabel=null }) {
    const D = DialogV2();
    if ( !D ) return null;
    const html = fields.map(f => {
      const id = `gmal-f-${f.name}`;
      let input;
      switch ( f.type ) {
        case "select": input = `<select id="${id}" name="${esc(f.name)}">${(f.options ?? []).map(o => `<option value="${esc(o.value)}" ${o.value === f.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`; break;
        case "checkbox": input = `<input id="${id}" name="${esc(f.name)}" type="checkbox" ${f.value ? "checked" : ""}>`; break;
        case "number": input = `<input id="${id}" name="${esc(f.name)}" type="number" value="${esc(f.value ?? "")}" ${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""} ${f.step != null ? `step="${f.step}"` : ""}>`; break;
        default: input = `<input id="${id}" name="${esc(f.name)}" type="text" value="${esc(f.value ?? "")}">`;
      }
      return `<div class="form-group"><label for="${id}">${esc(f.label)}</label><div class="form-fields">${input}</div>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ""}</div>`;
    }).join("");
    const result = await D.prompt({
      window: { title }, content: `${extra}${html}`, modal: true, rejectClose: false, classes: ["gm-asset-library", "gmal-dialog"],
      ok: {
        label: okLabel ?? localize("GMAL.Dialog.Continue"), icon: "fa-solid fa-check",
        callback: (event, button) => {
          const out = {};
          for ( const f of fields ) {
            const elm = button.form.elements[f.name];
            if ( !elm ) continue;
            out[f.name] = f.type === "checkbox" ? elm.checked : f.type === "number" ? Number(elm.value) : elm.value;
          }
          return out;
        }
      }
    });
    return result && typeof result === "object" ? result : null;
  },

  async notify(message, type="info", options={}) {
    const n = globalThis.ui?.notifications;
    if ( !n ) { console.log(`[gm-asset-library] ${type}: ${message}`); return; }
    (n[type] ?? n.info).call(n, message, options);
  }
};

/** Build an HTML list of affected items for confirmation dialogs (escaped). */
export function affectedList(items, max=12) {
  const shown = items.slice(0, max).map(i => `<li>${esc(i)}</li>`).join("");
  const more = items.length > max ? `<li><em>${esc(localize("GMAL.Dialog.AndMore", { count: items.length - max }))}</em></li>` : "";
  return `<ul class="gmal-affected">${shown}${more}</ul>`;
}
