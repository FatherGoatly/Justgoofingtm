import { ASSET_TYPE, MAX_TEXT_PREVIEW_BYTES, SOURCE_KIND } from "../core/constants.js";
import diagnostics from "../core/diagnostics.js";
import { el, icon, localize } from "../utilities/dom.js";
import { formatAspect, formatBytes, formatDimensions, formatDuration } from "../utilities/format.js";
import { fetchWithTimeout } from "../utilities/async.js";

/**
 * Preview renderers. Each returns `{ element, destroy() }`. They never modify the source asset and
 * render user-controlled strings via textContent only. SVG images are shown through <img>, which does
 * not execute scripts; PDFs use the browser's own viewer in an iframe; text is fetched and shown as text.
 */

export function selectRenderer(record, options) {
  if ( !record ) return renderFallback;
  if ( record.kind === "document" && record.type !== ASSET_TYPE.AUDIO ) return renderDocument;
  switch ( record.type ) {
    case ASSET_TYPE.IMAGE: return renderImage;
    case ASSET_TYPE.AUDIO: return options.mediaPreviews === false ? renderMediaDisabled : renderAudio;
    case ASSET_TYPE.VIDEO: return options.mediaPreviews === false ? renderMediaDisabled : renderVideo;
    case ASSET_TYPE.PDF: return renderPdf;
    case ASSET_TYPE.TEXT: return renderText;
    default: return renderFallback;
  }
}

/* -------------------------------------------- */
/*  Image / map                                  */
/* -------------------------------------------- */

export function renderImage(record, { onError, onLoad, container }={}) {
  const state = { zoom: 1, fit: true, x: 0, y: 0, dragging: false, grid: false, gridSize: 100, checker: true };
  const img = document.createElement("img");
  img.alt = record.name;
  img.decoding = "async";
  img.draggable = false;
  img.className = "gmal-preview-image";
  const gridOverlay = el("div", { className: "gmal-grid-overlay", attrs: { hidden: true, "aria-hidden": "true" } });
  const stage = el("div", { className: "gmal-image-stage checker" }, [img, gridOverlay]);
  const viewport = el("div", { className: "gmal-image-viewport", attrs: { tabindex: "0", role: "img", "aria-label": record.name } }, [stage]);
  const status = el("div", { className: "gmal-preview-status", attrs: { "aria-live": "polite" } });

  const apply = () => {
    stage.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;
    gridOverlay.style.backgroundSize = `${state.gridSize}px ${state.gridSize}px`;
    gridOverlay.hidden = !state.grid;
    stage.classList.toggle("checker", state.checker);
    const pct = Math.round(state.zoom * 100);
    status.textContent = `${pct}%${record.meta.width ? ` · ${formatDimensions(record.meta.width, record.meta.height)}` : ""}${state.grid ? ` · ${localize("GMAL.Preview.GridOverlayNote", { size: state.gridSize })}` : ""}`;
  };
  const fit = () => {
    const vw = viewport.clientWidth || 1;
    const vh = viewport.clientHeight || 1;
    const iw = img.naturalWidth || 1;
    const ih = img.naturalHeight || 1;
    state.zoom = Math.min(vw / iw, vh / ih, 1);
    state.x = (vw - iw * state.zoom) / 2;
    state.y = (vh - ih * state.zoom) / 2;
    state.fit = true;
    apply();
  };
  const actualSize = () => {
    const vw = viewport.clientWidth || 1;
    const vh = viewport.clientHeight || 1;
    state.zoom = 1;
    state.x = Math.min(0, (vw - img.naturalWidth) / 2);
    state.y = Math.min(0, (vh - img.naturalHeight) / 2);
    state.fit = false;
    apply();
  };
  const zoomBy = (factor, cx, cy) => {
    const prev = state.zoom;
    state.zoom = Math.min(16, Math.max(0.02, prev * factor));
    const ratio = state.zoom / prev;
    const px = cx ?? viewport.clientWidth / 2;
    const py = cy ?? viewport.clientHeight / 2;
    state.x = px - (px - state.x) * ratio;
    state.y = py - (py - state.y) * ratio;
    state.fit = false;
    apply();
  };

  img.onload = () => { record.meta.width = img.naturalWidth; record.meta.height = img.naturalHeight; fit(); onLoad?.(record); };
  img.onerror = () => { onError?.(new Error(localize("GMAL.Preview.ImageFailed"))); };
  img.src = record.url ?? record.thumbnail;

  const onWheel = e => { e.preventDefault(); const r = viewport.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); };
  let last = null;
  const onDown = e => { if ( e.button !== 0 ) return; state.dragging = true; last = { x: e.clientX, y: e.clientY }; viewport.classList.add("dragging"); viewport.setPointerCapture?.(e.pointerId); };
  const onMove = e => { if ( !state.dragging || !last ) return; state.x += e.clientX - last.x; state.y += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; apply(); };
  const onUp = () => { state.dragging = false; last = null; viewport.classList.remove("dragging"); };
  const onKey = e => {
    const step = 40;
    switch ( e.key ) {
      case "+": case "=": zoomBy(1.2); break;
      case "-": zoomBy(1 / 1.2); break;
      case "0": fit(); break;
      case "1": actualSize(); break;
      case "ArrowLeft": state.x += step; apply(); break;
      case "ArrowRight": state.x -= step; apply(); break;
      case "ArrowUp": state.y += step; apply(); break;
      case "ArrowDown": state.y -= step; apply(); break;
      case "g": state.grid = !state.grid; apply(); break;
      default: return;
    }
    e.preventDefault();
  };
  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("pointerdown", onDown);
  viewport.addEventListener("pointermove", onMove);
  viewport.addEventListener("pointerup", onUp);
  viewport.addEventListener("pointercancel", onUp);
  viewport.addEventListener("keydown", onKey);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { if ( state.fit ) fit(); }) : null;
  ro?.observe(viewport);

  const gridInput = el("input", { className: "gmal-grid-size", attrs: { type: "number", min: "10", max: "1000", step: "5", value: String(state.gridSize), "aria-label": localize("GMAL.Preview.GridSize") } });
  gridInput.addEventListener("change", () => { state.gridSize = Math.max(10, Number(gridInput.value) || 100); apply(); });
  const toolbar = el("div", { className: "gmal-preview-toolbar", attrs: { role: "toolbar", "aria-label": localize("GMAL.Preview.ImageTools") } }, [
    toolButton("fa-solid fa-magnifying-glass-minus", "GMAL.Preview.ZoomOut", () => zoomBy(1 / 1.25)),
    toolButton("fa-solid fa-magnifying-glass-plus", "GMAL.Preview.ZoomIn", () => zoomBy(1.25)),
    toolButton("fa-solid fa-compress", "GMAL.Preview.Fit", fit),
    toolButton("fa-solid fa-expand", "GMAL.Preview.ActualSize", actualSize),
    toolButton("fa-solid fa-chess-board", "GMAL.Preview.Checkerboard", () => { state.checker = !state.checker; apply(); }, true),
    toolButton("fa-solid fa-border-all", "GMAL.Preview.GridOverlay", () => { state.grid = !state.grid; apply(); }, true),
    gridInput,
    el("span", { className: "gmal-preview-hint", text: localize("GMAL.Preview.GridOverlayHint") })
  ]);
  const element = el("div", { className: "gmal-renderer gmal-renderer-image" }, [toolbar, viewport, status]);
  apply();
  return {
    element,
    destroy() {
      ro?.disconnect();
      img.onload = img.onerror = null;
      img.removeAttribute("src");
    }
  };
}

function toolButton(iconClass, labelKey, onClick, toggle=false) {
  const label = localize(labelKey);
  const b = el("button", { className: "gmal-tool", attrs: { type: "button", title: label, "aria-label": label, "aria-pressed": toggle ? "false" : undefined } }, [icon(iconClass)]);
  b.addEventListener("click", () => { onClick(); if ( toggle ) b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true"); });
  return b;
}

/* -------------------------------------------- */
/*  Audio / video                                */
/* -------------------------------------------- */

export function renderAudio(record, { previewService, onError, onLoad }={}) {
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "metadata";
  audio.className = "gmal-preview-audio";
  audio.setAttribute("aria-label", record.name);
  previewService?.register(audio);
  const loopBox = el("input", { attrs: { type: "checkbox", id: `gmal-loop-${Math.random().toString(36).slice(2, 8)}` } });
  loopBox.addEventListener("change", () => { audio.loop = loopBox.checked; });
  const stop = el("button", { className: "gmal-tool", attrs: { type: "button" }, text: ` ${localize("GMAL.Preview.Stop")}` });
  stop.prepend(icon("fa-solid fa-stop"));
  stop.addEventListener("click", () => { audio.pause(); audio.currentTime = 0; });
  const info = el("div", { className: "gmal-preview-status", attrs: { "aria-live": "polite" } });
  audio.addEventListener("loadedmetadata", () => { record.meta.duration = Number.isFinite(audio.duration) ? audio.duration : record.meta.duration; info.textContent = `${localize("GMAL.Details.Duration")}: ${formatDuration(audio.duration)}`; onLoad?.(record); });
  audio.addEventListener("error", () => onError?.(new Error(localize("GMAL.Preview.MediaFailed"))));
  audio.src = record.url ?? record.path;
  const element = el("div", { className: "gmal-renderer gmal-renderer-audio" }, [
    el("div", { className: "gmal-audio-art" }, [icon("fa-solid fa-music fa-4x")]),
    audio,
    el("div", { className: "gmal-preview-toolbar" }, [stop, el("label", { attrs: { for: loopBox.id } }, [loopBox, ` ${localize("GMAL.Preview.Loop")}`])]),
    info,
    el("p", { className: "gmal-preview-hint", text: localize("GMAL.Preview.AudioLocalOnly") })
  ]);
  return { element, destroy() { previewService?.release(audio); } };
}

export function renderVideo(record, { previewService, onError, onLoad }={}) {
  const video = document.createElement("video");
  video.controls = true;
  video.muted = true;
  video.preload = "metadata";
  video.playsInline = true;
  video.className = "gmal-preview-video";
  video.setAttribute("aria-label", record.name);
  previewService?.register(video);
  const info = el("div", { className: "gmal-preview-status", attrs: { "aria-live": "polite" } });
  video.addEventListener("loadedmetadata", () => {
    record.meta.duration = Number.isFinite(video.duration) ? video.duration : record.meta.duration;
    record.meta.width = video.videoWidth || record.meta.width;
    record.meta.height = video.videoHeight || record.meta.height;
    info.textContent = `${formatDuration(video.duration)} · ${formatDimensions(video.videoWidth, video.videoHeight)}`;
    onLoad?.(record);
  });
  video.addEventListener("error", () => onError?.(new Error(localize("GMAL.Preview.VideoFailed"))));
  video.src = record.url ?? record.path;
  const element = el("div", { className: "gmal-renderer gmal-renderer-video" }, [video, info, el("p", { className: "gmal-preview-hint", text: localize("GMAL.Preview.VideoMutedHint") })]);
  return { element, destroy() { previewService?.release(video); } };
}

export function renderMediaDisabled(record) {
  const element = fallbackBox(record, "fa-solid fa-volume-xmark", localize("GMAL.Preview.MediaDisabled"));
  return { element, destroy() {} };
}

/* -------------------------------------------- */
/*  PDF / text                                   */
/* -------------------------------------------- */

export function renderPdf(record, { onError }={}) {
  const frame = document.createElement("iframe");
  frame.className = "gmal-preview-pdf";
  frame.title = record.name;
  frame.setAttribute("loading", "lazy");
  frame.src = record.url;
  const element = el("div", { className: "gmal-renderer gmal-renderer-pdf" }, [frame, el("p", { className: "gmal-preview-hint", text: localize("GMAL.Preview.PdfHint") })]);
  return { element, destroy() { frame.removeAttribute("src"); } };
}

export function renderText(record, { onError }={}) {
  const pre = el("pre", { className: "gmal-preview-text", text: localize("GMAL.Loading") });
  const element = el("div", { className: "gmal-renderer gmal-renderer-text" }, [pre]);
  let cancelled = false;
  (async () => {
    try {
      const res = await fetchWithTimeout(record.url, { method: "GET" }, 10000);
      if ( !res.ok ) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if ( cancelled ) return;
      pre.textContent = text.length > MAX_TEXT_PREVIEW_BYTES ? `${text.slice(0, MAX_TEXT_PREVIEW_BYTES)}\n\n… ${localize("GMAL.Preview.Truncated")}` : text;
    } catch (err) {
      if ( cancelled ) return;
      pre.textContent = "";
      onError?.(err);
    }
  })();
  return { element, destroy() { cancelled = true; } };
}

/* -------------------------------------------- */
/*  Foundry documents                            */
/* -------------------------------------------- */

export function renderDocument(record, { onError, onLoad }={}) {
  const children = [];
  if ( record.thumbnail ) {
    const img = document.createElement("img");
    img.className = "gmal-preview-doc-image";
    img.alt = record.name;
    img.decoding = "async";
    img.onerror = () => { img.replaceWith(fallbackBox(record, record.icon, localize("GMAL.Preview.ImageFailed"))); };
    img.onload = () => onLoad?.(record);
    img.src = record.thumbnail;
    children.push(el("div", { className: "gmal-doc-image-wrap checker" }, [img]));
  } else {
    children.push(fallbackBox(record, record.icon, localize("GMAL.Preview.NoVisual")));
  }
  const rows = [
    [localize("GMAL.Details.DocumentType"), `${record.documentName}${record.documentType ? ` (${record.documentType})` : ""}`],
    [localize("GMAL.Details.Source"), record.source.kind === SOURCE_KIND.COMPENDIUM ? `${localize("GMAL.Source.Compendium")}: ${record.source.packLabel ?? record.source.pack}` : localize("GMAL.Source.World")],
    [localize("GMAL.Details.Uuid"), record.uuid ?? ""]
  ];
  if ( record.summary ) rows.push([localize("GMAL.Details.Summary"), record.summary]);
  const dl = el("dl", { className: "gmal-doc-meta" });
  for ( const [k, v] of rows ) { if ( !v ) continue; dl.append(el("dt", { text: k }), el("dd", { text: v })); }
  children.push(dl);
  if ( record.children?.length ) {
    const list = el("ul", { className: "gmal-doc-children" });
    for ( const c of record.children.slice(0, 200) ) list.append(el("li", { text: `${c.name}${c.type ? ` · ${c.type}` : ""}${c.path ? ` · ${c.path}` : c.src ? ` · ${c.src}` : ""}` }));
    children.push(el("h4", { text: localize("GMAL.Details.Contents") }), list);
  }
  const element = el("div", { className: "gmal-renderer gmal-renderer-document" }, children);
  return { element, destroy() {} };
}

/* -------------------------------------------- */
/*  Fallback                                     */
/* -------------------------------------------- */

export function renderFallback(record) {
  const element = fallbackBox(record, record.icon, localize("GMAL.Preview.Unsupported", { ext: record.extension || record.type }));
  const dl = el("dl", { className: "gmal-doc-meta" });
  const rows = [[localize("GMAL.Details.Type"), record.type], [localize("GMAL.Details.Path"), record.path ?? ""], [localize("GMAL.Details.Size"), formatBytes(record.meta.size)], [localize("GMAL.Details.Dimensions"), record.meta.width ? `${formatDimensions(record.meta.width, record.meta.height)} (${formatAspect(record.meta.width, record.meta.height)})` : ""]];
  for ( const [k, v] of rows ) if ( v ) dl.append(el("dt", { text: k }), el("dd", { text: v }));
  element.append(dl);
  return { element, destroy() {} };
}

export function fallbackBox(record, iconClass, message) {
  return el("div", { className: "gmal-preview-fallback" }, [icon(iconClass ?? "fa-solid fa-file", "fa-3x"), el("p", { text: message })]);
}

/** Error state shared by the viewer and the details panel. */
export function renderError(record, error, { onRetry, onCopyPath }={}) {
  const reason = classifyError(record, error);
  const actions = el("div", { className: "gmal-preview-toolbar" });
  if ( onRetry ) { const b = el("button", { className: "gmal-tool", attrs: { type: "button" }, text: ` ${localize("GMAL.Retry")}` }); b.prepend(icon("fa-solid fa-rotate-right")); b.addEventListener("click", onRetry); actions.append(b); }
  if ( onCopyPath && record.path ) { const b = el("button", { className: "gmal-tool", attrs: { type: "button" }, text: ` ${localize("GMAL.Action.CopyPath")}` }); b.prepend(icon("fa-solid fa-copy")); b.addEventListener("click", onCopyPath); actions.append(b); }
  diagnostics.count("previewFailures");
  return el("div", { className: "gmal-preview-error", attrs: { role: "alert" } }, [icon("fa-solid fa-triangle-exclamation fa-2x"), el("p", { text: error?.message ?? localize("GMAL.Preview.Failed") }), el("p", { className: "gmal-preview-hint", text: reason }), actions]);
}

export function classifyError(record, error) {
  if ( record.accessible === false ) return localize("GMAL.Preview.Reason.Missing");
  if ( record.source?.storage === "s3" || /^https?:\/\//i.test(record.url ?? "") ) return localize("GMAL.Preview.Reason.Remote");
  const ext = record.extension;
  if ( ["tiff", "avif", "flac", "mid", "ogv", "m4v", "opus"].includes(ext) ) return localize("GMAL.Preview.Reason.Unsupported");
  return localize("GMAL.Preview.Reason.Unknown");
}
