import { ASSET_TYPE, THUMBNAIL_PIXELS } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { TaskQueue } from "../utilities/async.js";
import { isCrossOrigin } from "./metadata-service.js";
import { mediaCache as defaultCache, STORES } from "./media-cache.js";

/**
 * Generates and caches small thumbnails so the grid never has to decode full-resolution images more
 * than once per client. Thumbnails are stored as blobs in IndexedDB and handed out as object URLs,
 * which are revoked when the card that used them is recycled.
 *
 * Generation falls back to the original URL when the image cannot be drawn (cross-origin without CORS,
 * SVG, unsupported codec) so the grid still shows something useful.
 */
export class ThumbnailService {
  constructor({ cache=defaultCache, concurrency=3, size=THUMBNAIL_PIXELS, enabled=true, loaders={} }={}) {
    this.cache = cache;
    this.queue = new TaskQueue(concurrency);
    this.size = size;
    this.enabled = enabled;
    this.loaders = { image: loadImage, video: loadVideoFrame, ...loaders };
    this.objectUrls = new Map(); // key → { url, refs }
    this.failed = new Set();
  }

  /**
   * Resolve the best thumbnail URL for a record. Returns `{ url, generated }`, or `{ url: null }` when
   * the record has no visual representation.
   */
  async resolve(record) {
    const src = record.thumbnail ?? null;
    if ( !src ) return { url: null, generated: false };
    if ( !this.enabled || record.kind !== "file" || this.failed.has(src) || isSvg(src) || (record.type !== ASSET_TYPE.IMAGE && record.type !== ASSET_TYPE.VIDEO) ) return { url: src, generated: false };
    if ( isCrossOrigin(src) ) return { url: src, generated: false };
    const key = `${src}#${this.size}`;
    const existing = this.objectUrls.get(key);
    if ( existing ) { existing.refs++; return { url: existing.url, generated: true, key }; }
    try {
      let entry = await this.cache.get(STORES.THUMBS, key);
      if ( !entry?.blob ) {
        entry = await this.queue.push(() => this.#generate(record, src));
        if ( entry ) await this.cache.set(STORES.THUMBS, key, entry);
      }
      if ( !entry?.blob ) { this.failed.add(src); return { url: src, generated: false }; }
      const url = URL.createObjectURL(entry.blob);
      this.objectUrls.set(key, { url, refs: 1 });
      return { url, generated: true, key, width: entry.width, height: entry.height };
    } catch (err) {
      diagnostics.debug(`Thumbnail generation failed for ${src}`, err);
      this.failed.add(src);
      return { url: src, generated: false };
    }
  }

  /** Release a generated thumbnail URL when no card displays it any more. */
  release(key) {
    if ( !key ) return;
    const entry = this.objectUrls.get(key);
    if ( !entry ) return;
    entry.refs--;
    if ( entry.refs <= 0 ) { URL.revokeObjectURL(entry.url); this.objectUrls.delete(key); }
  }

  releaseAll() {
    for ( const { url } of this.objectUrls.values() ) URL.revokeObjectURL(url);
    this.objectUrls.clear();
  }

  async clearCache() { await this.cache.clear(STORES.THUMBS); this.failed.clear(); }

  async #generate(record, src) {
    const source = record.type === ASSET_TYPE.VIDEO ? await this.loaders.video(src) : await this.loaders.image(src);
    if ( !source ) return null;
    const { width, height } = source;
    if ( !width || !height ) return null;
    const scale = Math.min(1, this.size / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source.element, 0, 0, w, h);
    source.release?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
    if ( !blob ) return null;
    return { blob, width: w, height: h, createdAt: Date.now() };
  }
}

function isSvg(src) { return /\.svg(\?.*)?$/i.test(src); }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve({ element: img, width: img.naturalWidth, height: img.naturalHeight, release: () => { img.src = ""; } });
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function loadVideoFrame(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    const fail = () => { cleanup(); reject(new Error("video load failed")); };
    const cleanup = () => { video.onloadeddata = video.onseeked = video.onerror = null; };
    const timer = setTimeout(fail, 15000);
    video.onerror = fail;
    video.onloadeddata = () => { try { video.currentTime = Math.min(0.5, (video.duration || 1) / 10); } catch { fail(); } };
    video.onseeked = () => {
      clearTimeout(timer);
      cleanup();
      resolve({ element: video, width: video.videoWidth, height: video.videoHeight, release: () => { video.removeAttribute("src"); try { video.load(); } catch {} } });
    };
    video.src = src;
  });
}
