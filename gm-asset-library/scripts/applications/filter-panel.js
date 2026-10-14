import { ASSET_TYPE } from "../core/constants.js";
import { clear, el, localize } from "../utilities/dom.js";

/**
 * The filter panel: facet checkboxes derived from the records that survive the current category and
 * search, plus a few numeric/aspect filters. Facets with no matching records are not shown.
 */
export class FilterPanel {
  constructor(container, { onChange }) {
    this.container = container;
    this.onChange = onChange;
    this.filters = {};
  }

  /** Number of active filter criteria (for the toolbar badge). */
  activeCount(filters=this.filters) {
    let n = 0;
    for ( const [k, v] of Object.entries(filters) ) {
      if ( v === undefined || v === null || v === "" || v === false ) continue;
      if ( Array.isArray(v) ) { if ( v.length ) n++; continue; }
      if ( k === "ids" ) continue;
      n++;
    }
    return n;
  }

  reset() { this.filters = {}; this.onChange(this.filters); }

  render(facets, filters, { hasImages=true, hasMedia=true }={}) {
    this.filters = filters;
    const c = this.container;
    const scroll = c.scrollTop;
    clear(c);
    const header = el("div", { className: "gmal-filter-header" }, [el("h3", { text: localize("GMAL.Filters.Title") })]);
    const clearBtn = el("button", { className: "gmal-link", attrs: { type: "button" }, text: localize("GMAL.Filters.Clear") });
    clearBtn.addEventListener("click", () => this.reset());
    header.append(clearBtn);
    c.append(header);

    const toggles = el("div", { className: "gmal-filter-group" }, [el("h4", { text: localize("GMAL.Filters.Quick") })]);
    toggles.append(this.#toggle("favorite", localize("GMAL.Filters.FavoritesOnly"), filters.favorite === true, v => v ? true : undefined));
    toggles.append(this.#toggle("missingPreview", localize("GMAL.Filters.MissingPreview"), Boolean(filters.missingPreview)));
    toggles.append(this.#toggle("missingSource", localize("GMAL.Filters.MissingSource"), Boolean(filters.missingSource)));
    toggles.append(this.#toggle("duplicates", localize("GMAL.Filters.DuplicateCandidates"), Boolean(filters.duplicates)));
    c.append(toggles);

    this.#facetGroup("types", localize("GMAL.Filters.Type"), facets.types, k => localize(`GMAL.Type.${k}`));
    this.#facetGroup("sources", localize("GMAL.Filters.Source"), facets.sources, k => localize(`GMAL.Source.${cap(k)}`));
    if ( facets.storages?.length > 1 ) this.#facetGroup("storages", localize("GMAL.Filters.Storage"), facets.storages);
    if ( hasImages ) {
      this.#facetGroup("roles", localize("GMAL.Filters.Role"), facets.roles, k => localize(`GMAL.Role.${k}`));
      if ( facets.mapTypes?.length ) this.#facetGroup("mapTypes", localize("GMAL.Filters.MapType"), facets.mapTypes, k => k === "unknown" ? localize("GMAL.MapType.Unknown") : localize(`GMAL.MapType.${cap(k)}`));
    }
    this.#facetGroup("documentNames", localize("GMAL.Filters.DocumentType"), facets.documentNames);
    this.#facetGroup("packs", localize("GMAL.Filters.Pack"), facets.packs?.slice(0, 30));
    this.#facetGroup("extensions", localize("GMAL.Filters.Extension"), facets.extensions?.slice(0, 24), k => `.${k}`);
    this.#facetGroup("tags", localize("GMAL.Filters.Tags"), facets.tags?.slice(0, 40));

    if ( hasImages ) {
      const dims = el("div", { className: "gmal-filter-group" }, [el("h4", { text: localize("GMAL.Filters.Dimensions") })]);
      dims.append(this.#number("minWidth", localize("GMAL.Filters.MinWidth"), filters.minWidth), this.#number("minHeight", localize("GMAL.Filters.MinHeight"), filters.minHeight), this.#number("maxWidth", localize("GMAL.Filters.MaxWidth"), filters.maxWidth));
      const aspect = el("select", { attrs: { "aria-label": localize("GMAL.Filters.Aspect") } });
      for ( const [v, l] of [["", localize("GMAL.Filters.AnyAspect")], ["landscape", localize("GMAL.Filters.Landscape")], ["portrait", localize("GMAL.Filters.Portrait")], ["square", localize("GMAL.Filters.Square")], ["16:9", "16:9"], ["4:3", "4:3"]] ) aspect.append(el("option", { attrs: { value: v, selected: filters.aspect === v || undefined }, text: l }));
      aspect.addEventListener("change", () => this.#set("aspect", aspect.value || undefined));
      dims.append(el("label", { className: "gmal-filter-row" }, [el("span", { text: localize("GMAL.Filters.Aspect") }), aspect]));
      dims.append(el("p", { className: "gmal-preview-hint", text: localize("GMAL.Filters.DimensionsHint") }));
      c.append(dims);
    }
    if ( hasMedia ) {
      const dur = el("div", { className: "gmal-filter-group" }, [el("h4", { text: localize("GMAL.Filters.Duration") })]);
      dur.append(this.#number("minDuration", localize("GMAL.Filters.MinDuration"), filters.minDuration), this.#number("maxDuration", localize("GMAL.Filters.MaxDuration"), filters.maxDuration));
      c.append(dur);
    }
    const size = el("div", { className: "gmal-filter-group" }, [el("h4", { text: localize("GMAL.Filters.FileSize") })]);
    size.append(this.#number("minSize", localize("GMAL.Filters.MinSizeKb"), filters.minSize ? Math.round(filters.minSize / 1024) : undefined, 1024), this.#number("maxSize", localize("GMAL.Filters.MaxSizeKb"), filters.maxSize ? Math.round(filters.maxSize / 1024) : undefined, 1024));
    c.append(size);
    c.scrollTop = scroll;
  }

  #set(key, value) {
    const next = { ...this.filters };
    if ( value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length) ) delete next[key]; else next[key] = value;
    this.filters = next;
    this.onChange(next);
  }

  #toggle(key, label, checked, transform=v => (v ? true : undefined)) {
    const input = el("input", { attrs: { type: "checkbox", checked: checked || undefined } });
    input.addEventListener("change", () => this.#set(key, transform(input.checked)));
    return el("label", { className: "gmal-filter-check" }, [input, el("span", { text: label })]);
  }

  #number(key, label, value, multiplier=1) {
    const input = el("input", { attrs: { type: "number", min: "0", step: "1", value: value ?? "", placeholder: "—" } });
    input.addEventListener("change", () => { const n = Number(input.value); this.#set(key, Number.isFinite(n) && n > 0 ? n * multiplier : undefined); });
    return el("label", { className: "gmal-filter-row" }, [el("span", { text: label }), input]);
  }

  #facetGroup(key, title, entries, labelFn=k => k) {
    if ( !entries?.length ) return;
    const selected = new Set(this.filters[key] ?? []);
    if ( entries.length === 1 && !selected.size && key !== "tags" ) return;
    const group = el("div", { className: "gmal-filter-group" }, [el("h4", { text: title })]);
    for ( const e of entries ) {
      const input = el("input", { attrs: { type: "checkbox", value: e.key, checked: selected.has(e.key) || undefined } });
      input.addEventListener("change", () => {
        const next = new Set(this.filters[key] ?? []);
        if ( input.checked ) next.add(e.key); else next.delete(e.key);
        this.#set(key, [...next]);
      });
      group.append(el("label", { className: "gmal-filter-check" }, [input, el("span", { text: labelFn(e.key, e) }), el("span", { className: "gmal-count", text: String(e.count) })]));
    }
    this.container.append(group);
  }
}

export const MEDIA_TYPES = [ASSET_TYPE.AUDIO, ASSET_TYPE.VIDEO];

function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
