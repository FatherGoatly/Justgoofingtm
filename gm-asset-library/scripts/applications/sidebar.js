import { CATEGORIES } from "../core/constants.js";
import { clear, el, icon, localize } from "../utilities/dom.js";

/**
 * Left navigation: categories with counts, favorites, recents, collections, saved searches and
 * health views. Rendered into a <nav> element; selection state lives in the browser.
 */
export class Sidebar {
  constructor(container, { onSelect, onCollectionMenu, onSavedSearchMenu, onNewCollection, organization }) {
    this.container = container;
    this.onSelect = onSelect;
    this.onCollectionMenu = onCollectionMenu;
    this.onSavedSearchMenu = onSavedSearchMenu;
    this.onNewCollection = onNewCollection;
    this.organization = organization;
  }

  /**
   * @param {object} state      { view, category, collectionId, savedSearchId }
   * @param {object} counts     { categories: {id: n}, favorites, recent, duplicates, missing }
   */
  render(state, counts) {
    const c = this.container;
    const scroll = c.scrollTop;
    clear(c);
    const list = el("ul", { className: "gmal-nav-list", attrs: { role: "list" } });
    for ( const cat of CATEGORIES ) {
      const n = counts.categories?.[cat.id] ?? 0;
      if ( cat.id !== "all" && n === 0 ) continue;
      list.append(this.#item({ icon: cat.icon, label: localize(cat.label), count: n, active: state.view === "category" && state.category === cat.id, onClick: () => this.onSelect({ view: "category", category: cat.id }) }));
    }
    c.append(el("h4", { className: "gmal-nav-heading", text: localize("GMAL.Nav.Browse") }), list);

    const personal = el("ul", { className: "gmal-nav-list", attrs: { role: "list" } });
    personal.append(this.#item({ icon: "fa-solid fa-star", label: localize("GMAL.Nav.Favorites"), count: counts.favorites, active: state.view === "favorites", onClick: () => this.onSelect({ view: "favorites" }) }));
    personal.append(this.#item({ icon: "fa-solid fa-clock-rotate-left", label: localize("GMAL.Nav.Recent"), count: counts.recent, active: state.view === "recent", onClick: () => this.onSelect({ view: "recent" }) }));
    c.append(el("h4", { className: "gmal-nav-heading", text: localize("GMAL.Nav.Personal") }), personal);

    const colHead = el("h4", { className: "gmal-nav-heading" }, [localize("GMAL.Nav.Collections")]);
    if ( this.organization?.canEditShared ) {
      const add = el("button", { className: "gmal-nav-add", attrs: { type: "button", title: localize("GMAL.Collections.New"), "aria-label": localize("GMAL.Collections.New") } }, [icon("fa-solid fa-plus")]);
      add.addEventListener("click", () => this.onNewCollection());
      colHead.append(add);
    }
    const cols = el("ul", { className: "gmal-nav-list gmal-nav-collections", attrs: { role: "list" } });
    const collections = this.organization?.collections() ?? [];
    for ( const col of collections ) {
      const item = this.#item({ icon: "fa-solid fa-folder", label: col.name, count: col.assetIds.length, active: state.view === "collection" && state.collectionId === col.id, onClick: () => this.onSelect({ view: "collection", collectionId: col.id }) });
      item.dataset.collectionId = col.id;
      item.classList.add("gmal-nav-collection");
      cols.append(item);
    }
    if ( !collections.length ) cols.append(el("li", { className: "gmal-nav-empty", text: localize("GMAL.Collections.Empty") }));
    c.append(colHead, cols);

    const saved = el("ul", { className: "gmal-nav-list gmal-nav-saved", attrs: { role: "list" } });
    const searches = this.organization?.savedSearches() ?? [];
    for ( const s of searches ) {
      const item = this.#item({ icon: "fa-solid fa-bookmark", label: s.name, active: state.view === "saved" && state.savedSearchId === s.id, onClick: () => this.onSelect({ view: "saved", savedSearchId: s.id }) });
      item.dataset.savedSearchId = s.id;
      item.classList.add("gmal-nav-saved-search");
      saved.append(item);
    }
    if ( !searches.length ) saved.append(el("li", { className: "gmal-nav-empty", text: localize("GMAL.SavedSearches.Empty") }));
    c.append(el("h4", { className: "gmal-nav-heading", text: localize("GMAL.Nav.SavedSearches") }), saved);

    const health = el("ul", { className: "gmal-nav-list", attrs: { role: "list" } });
    health.append(this.#item({ icon: "fa-solid fa-clone", label: localize("GMAL.Nav.Duplicates"), count: counts.duplicates, active: state.view === "duplicates", onClick: () => this.onSelect({ view: "duplicates" }) }));
    health.append(this.#item({ icon: "fa-solid fa-link-slash", label: localize("GMAL.Nav.MissingReferences"), count: counts.missing, active: state.view === "missing", onClick: () => this.onSelect({ view: "missing" }) }));
    c.append(el("h4", { className: "gmal-nav-heading", text: localize("GMAL.Nav.Health") }), health);
    c.scrollTop = scroll;
  }

  #item({ icon: ic, label, count, active, onClick }) {
    const btn = el("button", { className: `gmal-nav-item${active ? " active" : ""}`, attrs: { type: "button", "aria-current": active ? "true" : undefined } }, [icon(ic), el("span", { className: "gmal-nav-label", text: label, title: label })]);
    if ( count !== undefined && count !== null ) btn.append(el("span", { className: "gmal-count", text: String(count) }));
    btn.addEventListener("click", onClick);
    return el("li", {}, [btn]);
  }
}
