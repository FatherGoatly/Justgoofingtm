import { ASSET_TYPE, SOURCE_KIND } from "../core/constants.js";
import { GROUP_ORDER } from "../actions/action-service.js";
import { sourceLabel } from "../catalog/asset-record.js";
import { clear, el, icon, localize } from "../utilities/dom.js";
import { formatAspect, formatBytes, formatDimensions, formatDuration, formatRelativeTime } from "../utilities/format.js";

/** Renders the inspector for the current selection into a container element. */
export class DetailsPanel {
  constructor(container, services, { runAction, actionContext }) {
    this.container = container;
    this.services = services;
    this.runAction = runAction;
    this.actionContext = actionContext;
    this.usages = null; // { id, result }
  }

  render(selection) {
    const c = this.container;
    clear(c);
    if ( !selection.length ) { c.append(el("div", { className: "gmal-details-empty" }, [icon("fa-solid fa-hand-pointer fa-2x"), el("p", { text: localize("GMAL.Details.Empty") })])); return; }
    if ( selection.length > 1 ) return this.#renderMulti(selection);
    this.#renderSingle(selection[0]);
  }

  #actionsBar(records) {
    const { actions } = this.services;
    const ctx = this.actionContext();
    const list = actions.actionsFor(records, ctx).filter(a => a.id !== "preview" || records.length === 1);
    const groups = new Map();
    for ( const a of list ) { if ( !groups.has(a.group) ) groups.set(a.group, []); groups.get(a.group).push(a); }
    const wrap = el("div", { className: "gmal-details-actions" });
    for ( const g of GROUP_ORDER ) {
      const items = groups.get(g);
      if ( !items?.length ) continue;
      const row = el("div", { className: `gmal-action-group group-${g}` }, [el("h4", { text: localize(`GMAL.ActionGroup.${g}`) })]);
      for ( const a of items ) {
        const b = el("button", { className: `gmal-action-button${a.mutates ? " mutates" : ""}`, attrs: { type: "button", title: a.mutates ? localize("GMAL.Action.MutatesHint") : undefined } }, [icon(a.icon), ` ${localize(a.label)}`]);
        b.addEventListener("click", () => this.runAction(a.id, records));
        row.append(b);
      }
      wrap.append(row);
    }
    return wrap;
  }

  #renderMulti(records) {
    const c = this.container;
    const types = new Map();
    for ( const r of records ) types.set(r.type, (types.get(r.type) ?? 0) + 1);
    c.append(el("h3", { className: "gmal-details-title", text: localize("GMAL.Details.SelectedCount", { count: records.length }) }));
    c.append(el("p", { className: "gmal-details-sub", text: [...types.entries()].map(([t, n]) => `${n} × ${localize(`GMAL.Type.${t}`)}`).join(", ") }));
    c.append(el("p", { className: "gmal-preview-hint", text: localize("GMAL.Details.BulkHint") }));
    c.append(this.#actionsBar(records));
  }

  #renderSingle(r) {
    const c = this.container;
    const { organization } = this.services;
    const alias = organization?.getAlias(r.id);
    // Preview
    const previewWrap = el("div", { className: "gmal-details-preview checker" });
    if ( r.thumbnail && r.accessible !== false ) {
      const img = document.createElement("img");
      img.alt = r.name;
      img.decoding = "async";
      img.onerror = () => { img.replaceWith(el("div", { className: "gmal-thumb-fallback big" }, [icon(r.icon, "fa-3x")])); };
      img.src = r.thumbnail;
      img.addEventListener("click", () => this.runAction("preview", [r]));
      img.title = localize("GMAL.Action.Preview");
      previewWrap.append(img);
    } else previewWrap.append(el("div", { className: "gmal-thumb-fallback big" }, [icon(r.icon, "fa-3x")]));
    c.append(previewWrap);
    if ( r.accessible === false || r.missing ) c.append(el("div", { className: "gmal-details-warning", attrs: { role: "status" } }, [icon("fa-solid fa-triangle-exclamation"), ` ${r.missing ? localize("GMAL.Details.MissingEntry") : localize("GMAL.Details.MissingFile")}`]));
    if ( r.previewError && r.accessible !== false ) c.append(el("div", { className: "gmal-details-warning" }, [icon("fa-solid fa-circle-exclamation"), ` ${r.previewError}`]));

    c.append(el("h3", { className: "gmal-details-title", text: alias ?? r.name, title: r.name }));
    if ( alias ) c.append(el("p", { className: "gmal-details-sub", text: `${localize("GMAL.Details.OriginalName")}: ${r.fileName ?? r.name}` }));

    const dl = el("dl", { className: "gmal-doc-meta" });
    const add = (k, v, mono=false) => { if ( v === null || v === undefined || v === "" ) return; dl.append(el("dt", { text: k }), el("dd", { text: v, title: String(v), className: mono ? "mono" : "" })); };
    add(localize("GMAL.Details.Type"), `${localize(`GMAL.Type.${r.type}`)}${r.extension ? ` (.${r.extension})` : ""}`);
    if ( r.type === ASSET_TYPE.IMAGE ) add(localize("GMAL.Details.Role"), r.role ? `${localize(`GMAL.Role.${r.role}`)}${r.mapType ? ` · ${localize(`GMAL.MapType.${cap(r.mapType)}`)}` : ""} (${localize(r.roleSource === "user" ? "GMAL.Details.RoleUser" : "GMAL.Details.RoleInferred")})` : localize("GMAL.Role.none"));
    if ( r.documentName ) add(localize("GMAL.Details.DocumentType"), `${r.documentName}${r.documentType ? ` · ${r.documentType}` : ""}`);
    add(localize("GMAL.Details.Source"), sourceLabel(r));
    if ( r.source.kind === SOURCE_KIND.COMPENDIUM ) add(localize("GMAL.Details.Pack"), r.source.pack, true);
    add(localize("GMAL.Details.Folder"), r.folder);
    if ( r.url ?? r.path ) add(localize("GMAL.Details.Path"), r.url ?? r.path, true);
    if ( r.uuid ) add(localize("GMAL.Details.Uuid"), r.uuid, true);
    if ( r.meta.width ) add(localize("GMAL.Details.Dimensions"), `${formatDimensions(r.meta.width, r.meta.height)} · ${formatAspect(r.meta.width, r.meta.height)}`);
    if ( r.meta.duration ) add(localize("GMAL.Details.Duration"), formatDuration(r.meta.duration));
    if ( r.meta.size ) add(localize("GMAL.Details.Size"), formatBytes(r.meta.size));
    if ( r.meta.modifiedAt ) add(localize("GMAL.Details.Modified"), new Date(r.meta.modifiedAt).toLocaleString());
    if ( r.meta.discoveredAt ) add(localize("GMAL.Details.Discovered"), formatRelativeTime(r.meta.discoveredAt));
    const last = organization?.lastAccessed(r.id);
    if ( last ) add(localize("GMAL.Details.LastUsed"), formatRelativeTime(last));
    if ( r.accessible === null && r.kind === "file" ) add(localize("GMAL.Details.Verified"), localize("GMAL.Details.NotChecked"));
    if ( r.references ) for ( const [k, v] of Object.entries(r.references) ) add(localize(`GMAL.Details.Ref.${cap(k)}`), v, true);
    if ( r.summary ) add(localize("GMAL.Details.Summary"), r.summary);
    c.append(dl);

    // Tags
    const tags = organization?.getTags(r.id) ?? [];
    const tagWrap = el("div", { className: "gmal-tags" }, [el("h4", { text: localize("GMAL.Details.Tags") })]);
    const chips = el("div", { className: "gmal-chips" });
    for ( const t of tags ) {
      const chip = el("span", { className: "gmal-chip", text: t });
      if ( organization?.canEditShared ) {
        const x = el("button", { className: "gmal-chip-remove", attrs: { type: "button", "aria-label": localize("GMAL.Tags.Remove", { tag: t }) } }, ["×"]);
        x.addEventListener("click", () => organization.removeTags([r.id], [t]));
        chip.append(x);
      }
      chips.append(chip);
    }
    if ( !tags.length ) chips.append(el("span", { className: "gmal-muted", text: localize("GMAL.Tags.None") }));
    tagWrap.append(chips);
    c.append(tagWrap);

    // Collections
    const cols = organization?.collectionsOf(r.id) ?? [];
    c.append(el("div", { className: "gmal-collections-of" }, [el("h4", { text: localize("GMAL.Details.Collections") }), el("p", { className: cols.length ? "" : "gmal-muted", text: cols.length ? cols.map(x => x.name).join(", ") : localize("GMAL.Collections.None") })]));

    // Note
    const note = organization?.getNote(r.id);
    if ( note ) c.append(el("div", { className: "gmal-note" }, [el("h4", { text: localize("GMAL.Details.Note") }), el("p", { text: note })]));

    // Children (playlist tracks, journal pages)
    if ( r.children?.length ) {
      const list = el("ul", { className: "gmal-doc-children" });
      for ( const ch of r.children.slice(0, 50) ) list.append(el("li", { text: `${ch.name}${ch.type ? ` · ${ch.type}` : ""}`, title: ch.path ?? ch.src ?? "" }));
      c.append(el("div", {}, [el("h4", { text: localize("GMAL.Details.Contents", { count: r.children.length }) }), list]));
    }

    c.append(this.#actionsBar([r]));

    // Usages (filled on demand through showUsages)
    if ( this.usages?.id === r.id ) c.append(this.#renderUsages(this.usages.result));
  }

  showUsages(record, result) {
    this.usages = { id: record.id, result };
    this.render([record]);
    this.container.querySelector(".gmal-usages")?.scrollIntoView?.({ block: "nearest" });
  }

  #renderUsages(result) {
    const wrap = el("div", { className: "gmal-usages" }, [el("h4", { text: localize("GMAL.Usages.Title", { count: result.references.length }) })]);
    if ( !result.references.length ) wrap.append(el("p", { className: "gmal-muted", text: localize("GMAL.Usages.None") }));
    else {
      const ul = el("ul");
      for ( const ref of result.references ) {
        const li = el("li", { text: `${ref.documentName}: ${ref.name}${ref.parent ? ` (${ref.parent})` : ""} — ${ref.field}` });
        if ( ref.uuid ) { const open = el("button", { className: "gmal-link", attrs: { type: "button" }, text: localize("GMAL.Action.Open") }); open.addEventListener("click", async () => { const d = await fromUuid(ref.uuid); (d?.sheet ?? d?.parent?.sheet)?.render(true); }); li.append(" ", open); }
        ul.append(li);
      }
      wrap.append(ul);
    }
    wrap.append(el("p", { className: "gmal-preview-hint", text: `${localize("GMAL.Usages.Scope")}: ${result.scope.documentTypes.join(", ")}; ${result.scope.embedded.join(", ")}. ${result.scope.note}` }));
    return wrap;
  }
}

function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
