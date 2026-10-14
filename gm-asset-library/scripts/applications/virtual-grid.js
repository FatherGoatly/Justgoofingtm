/**
 * A dependency-free virtualized grid/list. Only the rows in view (plus a buffer) have DOM nodes; cards
 * are pooled and recycled by record id. The owner supplies `renderCard(record, element)` to fill a
 * card and `recycleCard(element)` to release resources (thumbnail object URLs).
 *
 * The grid is agnostic of selection: the owner toggles classes on `cardFor(id)`.
 */
export class VirtualGrid {
  /**
   * @param {HTMLElement} viewport   The scrolling element
   * @param {object} options
   * @param {Function} options.renderCard
   * @param {Function} [options.recycleCard]
   * @param {Function} [options.onRangeChange]  ({start, end}) when the rendered range changes
   * @param {number} [options.itemWidth=160]
   * @param {number} [options.itemHeight=200]
   * @param {number} [options.gap=10]
   * @param {number} [options.buffer=2]        Extra rows above and below
   * @param {"grid"|"list"} [options.mode="grid"]
   */
  constructor(viewport, { renderCard, recycleCard=null, onRangeChange=null, itemWidth=160, itemHeight=200, gap=10, buffer=2, mode="grid" }) {
    this.viewport = viewport;
    this.renderCard = renderCard;
    this.recycleCard = recycleCard;
    this.onRangeChange = onRangeChange;
    this.layout = { itemWidth, itemHeight, gap, mode };
    this.buffer = buffer;
    this.items = [];
    this.pool = new Map(); // id → element
    this.spare = [];
    this.range = { start: 0, end: 0 };
    this.columns = 1;
    this.spacer = document.createElement("div");
    this.spacer.className = "gmal-virtual-spacer";
    this.layer = document.createElement("div");
    this.layer.className = "gmal-virtual-layer";
    this.layer.setAttribute("role", "presentation");
    viewport.append(this.spacer, this.layer);
    this.#onScroll = () => this.#schedule();
    viewport.addEventListener("scroll", this.#onScroll, { passive: true });
    this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.#schedule(true)) : null;
    this.resizeObserver?.observe(viewport);
    this.#frame = null;
  }

  #onScroll;

  #frame;

  get rowHeight() { return this.layout.itemHeight + this.layout.gap; }

  get rowCount() { return Math.ceil(this.items.length / this.columns); }

  /** Replace the items. Keeps scroll position when `keepScroll` is true. */
  setItems(items, { keepScroll=false }={}) {
    this.items = items;
    this.index = new Map(items.map((r, i) => [r.id, i]));
    if ( !keepScroll ) this.viewport.scrollTop = 0;
    this.#measure();
    this.render(true);
  }

  setLayout(changes) {
    Object.assign(this.layout, changes);
    this.#measure();
    this.render(true);
  }

  indexOf(id) { return this.index?.get(id) ?? -1; }

  cardFor(id) { return this.pool.get(id) ?? null; }

  #measure() {
    const width = this.viewport.clientWidth || 0;
    const { itemWidth, gap, mode } = this.layout;
    this.columns = mode === "list" ? 1 : Math.max(1, Math.floor((width - gap) / (itemWidth + gap)));
    this.spacer.style.height = `${Math.max(1, this.rowCount * this.rowHeight + gap)}px`;
  }

  #schedule(remeasure=false) {
    if ( remeasure ) this._needsMeasure = true;
    if ( this.#frame ) return;
    const raf = globalThis.requestAnimationFrame ?? (fn => setTimeout(fn, 16));
    this.#frame = raf(() => {
      this.#frame = null;
      if ( this._needsMeasure ) { this._needsMeasure = false; this.#measure(); }
      this.render();
    });
  }

  visibleRange() {
    const top = this.viewport.scrollTop;
    const height = this.viewport.clientHeight || 600;
    const firstRow = Math.max(0, Math.floor(top / this.rowHeight) - this.buffer);
    const lastRow = Math.min(this.rowCount, Math.ceil((top + height) / this.rowHeight) + this.buffer);
    return { start: firstRow * this.columns, end: Math.min(this.items.length, lastRow * this.columns) };
  }

  /** Render the visible range. */
  render(force=false) {
    const { start, end } = this.visibleRange();
    if ( !force && start === this.range.start && end === this.range.end ) return;
    this.range = { start, end };
    const keep = new Set();
    for ( let i = start; i < end; i++ ) keep.add(this.items[i].id);
    for ( const [id, elm] of this.pool ) {
      if ( keep.has(id) ) continue;
      this.pool.delete(id);
      this.recycleCard?.(elm);
      elm.remove();
      this.spare.push(elm);
    }
    const { itemWidth, itemHeight, gap, mode } = this.layout;
    const totalWidth = this.viewport.clientWidth || 0;
    const usable = mode === "list" ? totalWidth - gap * 2 : this.columns * (itemWidth + gap) - gap;
    const offsetX = mode === "list" ? gap : Math.max(gap, Math.floor((totalWidth - usable) / 2));
    for ( let i = start; i < end; i++ ) {
      const record = this.items[i];
      let elm = this.pool.get(record.id);
      const fresh = !elm;
      if ( fresh ) {
        elm = this.spare.pop() ?? document.createElement("div");
        elm.className = "gmal-card";
        this.pool.set(record.id, elm);
      }
      const row = Math.floor(i / this.columns);
      const col = i % this.columns;
      elm.style.transform = `translate(${offsetX + col * (itemWidth + gap)}px, ${gap + row * this.rowHeight}px)`;
      elm.style.width = `${mode === "list" ? usable : itemWidth}px`;
      elm.style.height = `${itemHeight}px`;
      elm.dataset.index = String(i);
      if ( fresh || force ) {
        elm.dataset.id = record.id;
        this.renderCard(record, elm, { index: i, mode });
        if ( !elm.isConnected ) this.layer.append(elm);
      }
    }
    this.onRangeChange?.(this.range);
  }

  /** Re-render a single card if it is currently on screen. */
  refresh(id) {
    const elm = this.pool.get(id);
    const i = this.indexOf(id);
    if ( !elm || i < 0 ) return;
    this.renderCard(this.items[i], elm, { index: i, mode: this.layout.mode, refresh: true });
  }

  refreshAll() { for ( const id of this.pool.keys() ) this.refresh(id); }

  /** Scroll so the item at `index` is visible; renders synchronously so the card exists afterwards. */
  scrollToIndex(index, { align="nearest" }={}) {
    if ( index < 0 || index >= this.items.length ) return;
    const row = Math.floor(index / this.columns);
    const top = row * this.rowHeight;
    const bottom = top + this.rowHeight + this.layout.gap;
    const vt = this.viewport.scrollTop;
    const vh = this.viewport.clientHeight || 600;
    if ( align === "start" ) this.viewport.scrollTop = top;
    else if ( top < vt ) this.viewport.scrollTop = top;
    else if ( bottom > vt + vh ) this.viewport.scrollTop = bottom - vh;
    this.render(true);
  }

  destroy() {
    this.viewport.removeEventListener("scroll", this.#onScroll);
    this.resizeObserver?.disconnect();
    const caf = globalThis.cancelAnimationFrame ?? clearTimeout;
    if ( this.#frame ) caf(this.#frame);
    for ( const elm of this.pool.values() ) this.recycleCard?.(elm);
    this.pool.clear();
    this.spare = [];
    this.layer.remove();
    this.spacer.remove();
  }
}
