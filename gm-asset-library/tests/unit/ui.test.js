import { beforeEach, describe, expect, it } from "vitest";
import { VirtualGrid } from "../../scripts/applications/virtual-grid.js";
import { CardRenderer } from "../../scripts/applications/card-renderer.js";
import { renderDocument, renderError, renderFallback, renderImage, selectRenderer } from "../../scripts/previews/renderers.js";
import { PreviewService } from "../../scripts/previews/preview-service.js";
import { createDocumentRecord, createFileRecord } from "../../scripts/catalog/asset-record.js";
import { OrganizationService } from "../../scripts/collections/organization-service.js";
import { registerSettings } from "../../scripts/core/settings.js";
import { el, htmlToText } from "../../scripts/utilities/dom.js";
import { makeGame, syntheticFiles } from "../setup/foundry-shim.js";

function viewport(width=800, height=600) {
  const v = document.createElement("div");
  Object.defineProperty(v, "clientWidth", { value: width });
  Object.defineProperty(v, "clientHeight", { value: height });
  document.body.append(v);
  return v;
}

describe("VirtualGrid", () => {
  it("renders only the visible window and recycles cards on scroll", () => {
    const v = viewport(800, 600);
    const rendered = [];
    const recycled = [];
    const grid = new VirtualGrid(v, { renderCard: (r, elm) => { elm.textContent = r.name; rendered.push(r.id); }, recycleCard: elm => recycled.push(elm.textContent), itemWidth: 160, itemHeight: 200, gap: 10, buffer: 1 });
    const items = syntheticFiles(5000).map(p => createFileRecord({ url: p }));
    grid.setItems(items);
    expect(grid.columns).toBe(4); // (800-10)/170 = 4.6
    const onScreen = v.querySelectorAll(".gmal-card").length;
    expect(onScreen).toBeGreaterThan(8);
    expect(onScreen).toBeLessThan(40);
    expect(Number(grid.spacer.style.height.replace("px", ""))).toBeGreaterThan(5000 / 4 * 200);
    v.scrollTop = 20000;
    grid.render();
    expect(recycled.length).toBeGreaterThan(0);
    const first = v.querySelector(".gmal-card");
    expect(Number(first.dataset.index)).toBeGreaterThan(300);
    expect(grid.cardFor(items[0].id)).toBeNull();
    grid.scrollToIndex(0);
    expect(grid.cardFor(items[0].id)).not.toBeNull();
    grid.setLayout({ mode: "list", itemHeight: 40 });
    expect(grid.columns).toBe(1);
    grid.destroy();
    expect(v.querySelector(".gmal-card")).toBeNull();
  });

  it("keeps indexes stable and refreshes single cards", () => {
    const v = viewport();
    let renders = 0;
    const grid = new VirtualGrid(v, { renderCard: (r, elm) => { renders++; elm.dataset.name = r.name; } });
    const items = syntheticFiles(20).map(p => createFileRecord({ url: p }));
    grid.setItems(items);
    const before = renders;
    grid.refresh(items[3].id);
    expect(renders).toBe(before + 1);
    expect(grid.indexOf(items[7].id)).toBe(7);
    expect(grid.indexOf("nope")).toBe(-1);
    grid.destroy();
  });
});

describe("CardRenderer", () => {
  let org;

  beforeEach(() => { makeGame(); registerSettings(); org = new OrganizationService().load(); });

  it("renders names via textContent (no HTML injection), badges, selection and favorites", async () => {
    const renderer = new CardRenderer({ organization: org, thumbnails: null, metadata: null }, { showMeta: true, isSelected: id => id === "sel", isActive: () => false });
    const rec = createFileRecord({ url: "maps/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E.webp" });
    const elm = document.createElement("div");
    renderer.render(rec, elm, { mode: "grid" });
    expect(elm.querySelector(".gmal-card-name").textContent).toContain("<img src=x onerror=alert(1)>");
    expect(elm.querySelector("[onerror]")).toBeNull();
    expect(elm.querySelectorAll("img")).toHaveLength(1); // only the pooled thumbnail element
    expect(elm.getAttribute("role")).toBe("option");
    expect(elm.draggable).toBe(true);
    await org.setFavorite(rec.id, true);
    await org.setAlias(rec.id, "Trap Map");
    renderer.render(rec, elm, { mode: "grid", refresh: true });
    expect(elm.querySelector(".gmal-card-favorite").classList.contains("active")).toBe(true);
    expect(elm.querySelector(".gmal-card-name").textContent).toBe("Trap Map");
    const sel = createFileRecord({ url: "x.png" }); sel.id = "sel"; sel.meta.width = 10; sel.meta.height = 20;
    renderer.render(sel, elm, { mode: "list" });
    expect(elm.classList.contains("selected")).toBe(true);
    expect(elm.getAttribute("aria-selected")).toBe("true");
    expect(elm.querySelector(".gmal-card-meta").textContent).toContain("10 × 20");
    renderer.recycle(elm);
    expect(elm.classList.contains("selected")).toBe(false);
  });
});

describe("renderers", () => {
  beforeEach(() => { makeGame(); });

  it("selects renderers by type and honours the media preview setting", () => {
    expect(selectRenderer(createFileRecord({ url: "a.png" }), {}).name).toBe("renderImage");
    expect(selectRenderer(createFileRecord({ url: "a.mp3" }), { mediaPreviews: true }).name).toBe("renderAudio");
    expect(selectRenderer(createFileRecord({ url: "a.mp3" }), { mediaPreviews: false }).name).toBe("renderMediaDisabled");
    expect(selectRenderer(createFileRecord({ url: "a.pdf" }), {}).name).toBe("renderPdf");
    expect(selectRenderer(createFileRecord({ url: "a.docx" }), {}).name).toBe("renderFallback");
    expect(selectRenderer(createDocumentRecord({ uuid: "Actor.x", documentName: "Actor", name: "A" }), {}).name).toBe("renderDocument");
  });

  it("renders an image preview with toolbar and grid overlay disabled by default", () => {
    const rec = createFileRecord({ url: "maps/a.webp" });
    const { element, destroy } = renderImage(rec, {});
    expect(element.querySelector("img").getAttribute("src")).toBe("maps/a.webp");
    expect(element.querySelector(".gmal-grid-overlay").hidden).toBe(true);
    expect(element.querySelectorAll(".gmal-tool").length).toBeGreaterThanOrEqual(6);
    expect(element.textContent).toContain("Overlay only");
    destroy();
    expect(element.querySelector("img").getAttribute("src")).toBeNull();
  });

  it("renders document info and fallbacks with escaped text", () => {
    const doc = createDocumentRecord({ uuid: "JournalEntry.j", documentName: "JournalEntry", name: "<b>Handout</b>", extra: { summary: "<script>x</script>", children: [{ name: "Page <1>", type: "text" }] } });
    const { element } = renderDocument(doc, {});
    expect(element.querySelector("script")).toBeNull();
    expect(element.textContent).toContain("<script>x</script>");
    expect(element.textContent).toContain("Page <1>");
    const fb = renderFallback(createFileRecord({ url: "x.docx" }));
    expect(fb.element.textContent).toContain("No preview is available for .docx");
    const err = renderError(createFileRecord({ url: "x.png" }), new Error("nope"), { onRetry() {}, onCopyPath() {} });
    expect(err.textContent).toContain("nope");
    expect(err.querySelectorAll("button")).toHaveLength(2);
  });

  it("strips HTML to text without executing it", () => {
    expect(htmlToText("<p>Hello <b>World</b><script>alert(1)</script></p>", 11)).toBe("Hello Worl…");
    expect(el("div", { text: "<x>" }).innerHTML).toBe("&lt;x&gt;");
  });
});

describe("PreviewService", () => {
  it("pauses the previous media element when another starts and releases on stopAll", () => {
    const svc = new PreviewService();
    const mk = () => { const a = document.createElement("audio"); let paused = true; a.play = () => { paused = false; a.dispatchEvent(new Event("play")); }; a.pause = () => { paused = true; }; Object.defineProperty(a, "paused", { get: () => paused }); a.load = () => {}; return a; };
    const a = svc.register(mk());
    const b = svc.register(mk());
    a.play();
    expect(svc.playing).toBe(a);
    b.play();
    expect(a.paused).toBe(true);
    expect(svc.playing).toBe(b);
    svc.stopAll();
    expect(svc.activeCount).toBe(0);
    expect(svc.playing).toBeNull();
  });
});
