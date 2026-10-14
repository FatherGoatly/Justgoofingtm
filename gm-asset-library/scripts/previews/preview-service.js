import diagnostics from "../core/diagnostics.js";
import { Emitter } from "../utilities/async.js";

/**
 * Owns media playback for previews. Only one audio or video element plays at a time, previews never
 * go through the game's playlist/audio pipeline (so nothing is broadcast to players), and
 * `stopAll()` releases every element when a viewer or the browser closes.
 */
export class PreviewService extends Emitter {
  #active = new Set();

  #current = null;

  /** Register a media element created by a renderer. */
  register(element) {
    if ( !element ) return element;
    this.#active.add(element);
    element.addEventListener("play", () => this.#onPlay(element));
    element.addEventListener("ended", () => this.emit("ended", element));
    return element;
  }

  #onPlay(element) {
    if ( this.#current && this.#current !== element ) {
      try { this.#current.pause(); } catch {}
    }
    this.#current = element;
    this.emit("play", element);
  }

  /** Pause and release one element. */
  release(element) {
    if ( !element ) return;
    try {
      element.pause?.();
      element.removeAttribute?.("src");
      element.load?.();
    } catch (err) { diagnostics.debug("Failed to release media element", err); }
    this.#active.delete(element);
    if ( this.#current === element ) this.#current = null;
  }

  stopAll() {
    for ( const el of [...this.#active] ) this.release(el);
    this.#active.clear();
    this.#current = null;
    this.emit("stopped");
  }

  get activeCount() { return this.#active.size; }

  get playing() { return this.#current && !this.#current.paused ? this.#current : null; }
}

export const previewService = new PreviewService();
