/** Async helpers: debounce, cancellation, concurrency-limited queues and yielding to the event loop. */

export function debounce(fn, wait) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, wait);
  };
  debounced.cancel = () => { clearTimeout(timer); timer = null; };
  debounced.flush = (...args) => { debounced.cancel(); fn(...args); };
  return debounced;
}

export class CancellationToken {
  #cancelled = false;

  #reason = null;

  get cancelled() { return this.#cancelled; }

  get reason() { return this.#reason; }

  cancel(reason="cancelled") { this.#cancelled = true; this.#reason = reason; }

  throwIfCancelled() { if ( this.#cancelled ) throw new CancelledError(this.#reason); }
}

export class CancelledError extends Error {
  constructor(reason) { super(`Operation cancelled: ${reason}`); this.name = "CancelledError"; this.cancelled = true; }
}

/** Yield to the event loop so the interface stays responsive during long loops. */
export function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Run async tasks with a concurrency limit. `tasks` may grow while running (a queue).
 */
export class TaskQueue {
  #concurrency;

  #running = 0;

  #queue = [];

  #idleResolvers = [];

  constructor(concurrency=3) { this.#concurrency = Math.max(1, concurrency); }

  get size() { return this.#queue.length + this.#running; }

  get pending() { return this.#queue.length; }

  push(fn, { priority=false }={}) {
    return new Promise((resolve, reject) => {
      const job = { fn, resolve, reject };
      if ( priority ) this.#queue.unshift(job); else this.#queue.push(job);
      this.#drain();
    });
  }

  clear() {
    const dropped = this.#queue.splice(0);
    for ( const job of dropped ) job.reject(new CancelledError("queue cleared"));
  }

  /** Resolves once the queue is empty and nothing is running. */
  onIdle() {
    if ( this.size === 0 ) return Promise.resolve();
    return new Promise(resolve => this.#idleResolvers.push(resolve));
  }

  #drain() {
    while ( this.#running < this.#concurrency && this.#queue.length ) {
      const job = this.#queue.shift();
      this.#running++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => {
        this.#running--;
        if ( this.size === 0 ) { const r = this.#idleResolvers.splice(0); for ( const f of r ) f(); }
        this.#drain();
      });
    }
  }
}

/** Fetch with a timeout, using foundry.utils.fetchWithTimeout when available. */
export async function fetchWithTimeout(url, options={}, timeoutMs=8000) {
  const f = globalThis.foundry?.utils?.fetchWithTimeout;
  if ( typeof f === "function" ) return f(url, options, { timeoutMs });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(t); }
}

/** A tiny typed event emitter. */
export class Emitter {
  #listeners = new Map();

  on(event, fn) {
    if ( !this.#listeners.has(event) ) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) { this.#listeners.get(event)?.delete(fn); }

  emit(event, payload) {
    for ( const fn of [...(this.#listeners.get(event) ?? [])] ) {
      try { fn(payload); } catch (err) { console.error(`[gm-asset-library] listener for "${event}" failed`, err); }
    }
  }

  removeAll() { this.#listeners.clear(); }
}
