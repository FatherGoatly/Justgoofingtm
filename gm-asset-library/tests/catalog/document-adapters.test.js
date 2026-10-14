import { describe, expect, it } from "vitest";
import { describeDocument, WorldDocumentAdapter } from "../../scripts/adapters/world-document-adapter.js";
import { CompendiumAdapter } from "../../scripts/adapters/compendium-adapter.js";
import { ASSET_TYPE, SOURCE_KIND } from "../../scripts/core/constants.js";
import { makeDoc, makeGame } from "../setup/foundry-shim.js";

async function collect(gen) { const out = []; for await ( const b of gen ) out.push(...b.records); return out; }

describe("WorldDocumentAdapter", () => {
  it("describes each document type with its own representation", () => {
    const actor = makeDoc({ documentName: "Actor", name: "Goblin", type: "npc", img: "a.png", extra: { prototypeToken: { texture: { src: "t.png" } } } });
    const [a] = describeDocument(actor, "Actor");
    expect(a.thumbnail).toBe("a.png");
    expect(a.references).toEqual({ portrait: "a.png", token: "t.png" });

    const scene = makeDoc({ documentName: "Scene", name: "Chapel", extra: { thumb: "thumb.png", background: { src: "maps/chapel.webp" }, width: 4000, height: 3000 } });
    const [s] = describeDocument(scene, "Scene");
    expect(s.thumbnail).toBe("thumb.png");
    expect(s.path).toBe("maps/chapel.webp");
    expect(s.meta.width).toBe(4000);

    const journal = makeDoc({ documentName: "JournalEntry", name: "Handout", extra: { pages: { contents: [{ name: "Map", type: "image", src: "h.png", uuid: "JournalEntry.x.JournalEntryPage.1" }, { name: "Text", type: "text", text: { content: "<p>Hello <b>world</b><script>alert(1)</script></p>" }, uuid: "JournalEntry.x.JournalEntryPage.2" }] } } });
    const [j] = describeDocument(journal, "JournalEntry");
    expect(j.thumbnail).toBe("h.png");
    expect(j.children).toHaveLength(2);
    expect(j.summary).toBe("Hello worldalert(1)".replace("alert(1)", "alert(1)"));
    expect(j.summary).not.toContain("<");

    const playlist = makeDoc({ documentName: "Playlist", name: "Ambience", extra: { sounds: { contents: [{ name: "Cave", path: "audio/cave.ogg", uuid: "Playlist.p.PlaylistSound.1" }, { name: "Broken", path: "", uuid: "Playlist.p.PlaylistSound.2" }] } } });
    const recs = describeDocument(playlist, "Playlist");
    expect(recs).toHaveLength(2);
    expect(recs[1].type).toBe(ASSET_TYPE.AUDIO);
    expect(recs[1].documentName).toBe("PlaylistSound");
    expect(recs[1].parentUuid).toBe(playlist.uuid);

    const macro = makeDoc({ documentName: "Macro", name: "Init", type: "script", img: "icons/m.svg" });
    const [m] = describeDocument(macro, "Macro");
    expect(m.type).toBe(ASSET_TYPE.MACRO);
    expect(m.summary).toBe("script macro");
  });

  it("only catalogs documents the user can observe", async () => {
    const visible = makeDoc({ documentName: "Actor", name: "Seen", img: "a.png" });
    const hidden = makeDoc({ documentName: "Actor", name: "Hidden", img: "b.png", visible: false });
    const game = makeGame({ isGM: false, collections: { actors: [visible, hidden] } });
    const adapter = new WorldDocumentAdapter({ game });
    const records = await collect(adapter.scan({ documentTypes: ["Actor"] }));
    expect(records.map(r => r.name)).toEqual(["Seen"]);
    expect(records[0].source.kind).toBe(SOURCE_KIND.WORLD);
  });

  it("survives a document that throws during description", async () => {
    const bad = makeDoc({ documentName: "Scene", name: "Bad" });
    Object.defineProperty(bad, "background", { get() { throw new Error("boom"); } });
    const good = makeDoc({ documentName: "Scene", name: "Good", extra: { background: { src: "x.png" } } });
    const game = makeGame({ isGM: true, collections: { scenes: [bad, good] } });
    const out = [];
    let status;
    for await ( const b of new WorldDocumentAdapter({ game }).scan({ documentTypes: ["Scene"] }) ) { out.push(...b.records); if ( b.done ) status = b.status; }
    expect(out.map(r => r.name)).toEqual(["Good"]);
    expect(status.failed).toBe(1);
  });
});

describe("CompendiumAdapter", () => {
  function makePack({ collection, label, type, entries, visible=true, fail=false }) {
    const index = new Map(entries.map(e => [e._id, e]));
    return {
      collection, title: label, metadata: { type, label, packageName: "pkg" }, documentName: type, visible, folders: [], index,
      getIndex: async ({ fields }) => { if ( fail ) throw new Error("nope"); return index; },
      getUuid: id => `Compendium.${collection}.${type}.${id}`
    };
  }

  it("indexes visible packs of the configured types with lightweight index data", async () => {
    const packs = [
      makePack({ collection: "dnd5e.monsters", label: "Monsters", type: "Actor", entries: [{ _id: "a1", name: "Goblin", img: "g.png", type: "npc", prototypeToken: { texture: { src: "gt.png" } } }] }),
      makePack({ collection: "mod.maps", label: "Maps", type: "Scene", entries: [{ _id: "s1", name: "Chapel", thumb: "c-thumb.png", background: { src: "c.webp" } }] }),
      makePack({ collection: "hidden.pack", label: "Hidden", type: "Actor", entries: [{ _id: "h1", name: "Secret" }], visible: false }),
      makePack({ collection: "mod.items", label: "Items", type: "Item", entries: [{ _id: "i1", name: "Sword", img: "s.png" }] })
    ];
    makeGame({ isGM: false, collections: { packs } });
    const adapter = new CompendiumAdapter();
    const out = [];
    let status;
    for await ( const b of adapter.scan({ documentTypes: ["Actor", "Scene"] }) ) { out.push(...b.records); if ( b.done ) status = b.status; }
    expect(out.map(r => r.name).sort()).toEqual(["Chapel", "Goblin"]);
    const goblin = out.find(r => r.name === "Goblin");
    expect(goblin.id).toBe("pack:Compendium.dnd5e.monsters.Actor.a1");
    expect(goblin.source).toMatchObject({ kind: SOURCE_KIND.COMPENDIUM, pack: "dnd5e.monsters", packLabel: "Monsters" });
    expect(goblin.references.token).toBe("gt.png");
    const chapel = out.find(r => r.name === "Chapel");
    expect(chapel.thumbnail).toBe("c-thumb.png");
    expect(chapel.sceneBackground).toBe("c.webp");
    expect(status.packs).toBe(2);
    expect(status.skipped).toBe(2);
  });

  it("records a failing pack without aborting the others", async () => {
    const packs = [
      makePack({ collection: "a.bad", label: "Bad", type: "Item", entries: [], fail: true }),
      makePack({ collection: "a.good", label: "Good", type: "Item", entries: [{ _id: "i1", name: "Sword", img: "s.png" }] })
    ];
    makeGame({ isGM: true, collections: { packs } });
    const out = [];
    let status;
    for await ( const b of new CompendiumAdapter().scan({ documentTypes: ["Item"] }) ) { out.push(...b.records); if ( b.done ) status = b.status; }
    expect(out).toHaveLength(1);
    expect(status.failed).toBe(1);
    expect(status.failures[0].pack).toBe("a.bad");
  });
});
