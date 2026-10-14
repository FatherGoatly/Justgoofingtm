import { beforeEach, describe, expect, it } from "vitest";
import { ActionService } from "../../scripts/actions/action-service.js";
import { registerFoundryActions, browserUrl, summaryText } from "../../scripts/actions/foundry-actions.js";
import { dialogs } from "../../scripts/actions/dialogs.js";
import { createCompendiumRecord, createDocumentRecord, createFileRecord } from "../../scripts/catalog/asset-record.js";
import { OrganizationService } from "../../scripts/collections/organization-service.js";
import { registerSettings } from "../../scripts/core/settings.js";
import { makeDoc, makeGame } from "../setup/foundry-shim.js";

/** Script the dialogs: each call pops the next answer. */
function scriptDialogs(answers) {
  const log = [];
  const next = kind => { log.push(kind); return answers.length ? answers.shift() : null; };
  dialogs.confirm = async cfg => { log.push({ confirm: cfg.title, content: cfg.content }); return answers.length ? answers.shift() : false; };
  dialogs.promptText = async () => next("prompt");
  dialogs.pickOption = async cfg => { log.push({ pick: cfg.options.map(o => o.value) }); return answers.length ? answers.shift() : null; };
  dialogs.form = async () => next("form");
  dialogs.notify = async (m, type) => { log.push({ notify: type ?? "info", m }); };
  return log;
}

describe("actions", () => {
  let actions;
  let org;
  let game;
  let ctx;
  let actor;
  let scene;

  beforeEach(() => {
    actor = makeDoc({ documentName: "Actor", name: "Goblin", img: "old.png", extra: { prototypeToken: { texture: { src: "old-token.png" } } } });
    const readonly = makeDoc({ documentName: "Actor", name: "NotMine", img: "x.png", owner: false });
    scene = makeDoc({ documentName: "Scene", name: "Chapel", extra: { background: { src: "old-bg.webp" }, view: async () => { scene.viewed = true; return scene; }, activate: async () => { scene.activated = true; } } });
    game = makeGame({ isGM: true, collections: { actors: [actor, readonly], scenes: [scene], playlists: [] } });
    registerSettings();
    org = new OrganizationService().load();
    actions = registerFoundryActions(new ActionService());
    ctx = { organization: org, catalog: null, metadata: null, resultSet: [], refresh() {} };
    globalThis.fromUuid = async uuid => [actor, readonly, scene].find(d => d.uuid === uuid) ?? null;
    globalThis.CONFIG = { Scene: { documentClass: { canUserCreate: () => true, create: async data => ({ name: data.name, data, sheet: { render() {} } }) } }, Playlist: { documentClass: { canUserCreate: () => true } } };
  });

  it("offers only applicable actions per record type", () => {
    const img = createFileRecord({ url: "a/map.webp" });
    const audio = createFileRecord({ url: "a/x.mp3" });
    const doc = createDocumentRecord({ uuid: actor.uuid, documentName: "Actor", name: "Goblin", img: "old.png" });
    const pack = createCompendiumRecord({ uuid: "Compendium.p.k.Actor.z", pack: "p.k", packLabel: "K", documentName: "Actor", name: "Z" });
    const ids = recs => actions.actionsFor(recs, ctx).map(a => a.id);
    expect(ids([img])).toEqual(expect.arrayContaining(["preview", "copyPath", "copyUrl", "favorite", "setActorPortrait", "setActorToken", "createScene", "setSceneBackground", "addTags", "setRole"]));
    expect(ids([img])).not.toContain("copyUuid");
    expect(ids([img])).not.toContain("addToPlaylist");
    expect(ids([audio])).toContain("addToPlaylist");
    expect(ids([audio])).not.toContain("setActorPortrait");
    expect(ids([doc])).toEqual(expect.arrayContaining(["open", "copyUuid", "copyLink"]));
    expect(ids([doc])).not.toContain("importToWorld");
    expect(ids([pack])).toContain("importToWorld");
    // Multi-selection only shows multi actions.
    expect(ids([img, audio])).toEqual(expect.arrayContaining(["favorite", "addTags", "copySummary"]));
    expect(ids([img, audio])).not.toContain("setActorPortrait");
    expect(ids([img, audio])).not.toContain("setRole"); // audio is not an image
  });

  it("copies the exact FilePicker path and a browser URL", async () => {
    const log = scriptDialogs([]);
    const img = createFileRecord({ url: "assets/Maps/Old%20Chapel.webp" });
    await actions.run("copyPath", [img], ctx);
    expect(game.clipboard.copied).toBe("assets/Maps/Old%20Chapel.webp");
    expect(browserUrl(img)).toMatch(/^http:\/\/localhost(:\d+)?\/assets\/Maps\/Old%20Chapel\.webp$/);
    expect(log.at(-1).notify).toBe("info");
    const doc = createDocumentRecord({ uuid: actor.uuid, documentName: "Actor", name: "Goblin" });
    await actions.run("copyLink", [doc], ctx);
    expect(game.clipboard.copied).toBe(`@UUID[${actor.uuid}]{Goblin}`);
  });

  it("sets an actor portrait only after choosing the actor and confirming", async () => {
    const img = createFileRecord({ url: "tokens/new.png" });
    scriptDialogs([actor.id, false]);
    await actions.run("setActorPortrait", [img], ctx);
    expect(actor.img).toBe("old.png");
    const log = scriptDialogs([actor.id, true]);
    await actions.run("setActorPortrait", [img], ctx);
    expect(actor.img).toBe("tokens/new.png");
    expect(actor.updates).toEqual([{ img: "tokens/new.png" }]);
    expect(log[0].pick).toEqual([actor.id]); // read-only actor not offered
    expect(log[1].content).toContain("old.png");
    expect(log[1].content).toContain("tokens/new.png");
    scriptDialogs([actor.id, true]);
    await actions.run("setActorToken", [img], ctx);
    expect(actor.prototypeToken.texture.src).toBe("tokens/new.png");
  });

  it("replaces a scene background only with confirmation and never silently", async () => {
    const img = createFileRecord({ url: "maps/new.webp" });
    scriptDialogs([scene.id, false]);
    await actions.run("setSceneBackground", [img], ctx);
    expect(scene.background.src).toBe("old-bg.webp");
    scriptDialogs([scene.id, true]);
    await actions.run("setSceneBackground", [img], ctx);
    expect(scene.background.src).toBe("maps/new.webp");
  });

  it("creates a scene from the form values and cancels cleanly", async () => {
    const img = createFileRecord({ url: "maps/new.webp" });
    img.meta.width = 4200; img.meta.height = 2800;
    scriptDialogs([null]);
    expect(await actions.run("createScene", [img], ctx)).toBeNull();
    scriptDialogs([{ name: "Chapel Night", width: 4200, height: 2800, grid: 140, open: false }]);
    const created = await actions.run("createScene", [img], ctx);
    expect(created.data).toMatchObject({ name: "Chapel Night", background: { src: "maps/new.webp" }, width: 4200, height: 2800, grid: { size: 140 } });
  });

  it("opens and views documents and touches recents", async () => {
    const doc = createDocumentRecord({ uuid: actor.uuid, documentName: "Actor", name: "Goblin" });
    await actions.run("open", [doc], ctx);
    expect(actor.sheet.rendered).toBe(true);
    expect(org.recentIds()).toEqual([doc.id]);
    const sc = createDocumentRecord({ uuid: scene.uuid, documentName: "Scene", name: "Chapel" });
    await actions.run("viewScene", [sc], ctx);
    expect(scene.viewed).toBe(true);
    scriptDialogs([true]);
    await actions.run("activateScene", [sc], ctx);
    expect(scene.activated).toBe(true);
  });

  it("organizes: favorites, collections, tags, alias, note, role", async () => {
    const a = createFileRecord({ url: "a.png" });
    const b = createFileRecord({ url: "b.png" });
    await actions.run("favorite", [a, b], ctx);
    expect(org.favoriteIds().sort()).toEqual([a.id, b.id].sort());
    await actions.run("favorite", [a, b], ctx);
    expect(org.favoriteIds()).toEqual([]);
    scriptDialogs(["__new__", "Session 01"]);
    await actions.run("addToCollection", [a, b], ctx);
    expect(org.collections()[0]).toMatchObject({ name: "Session 01" });
    expect(org.collections()[0].assetIds.sort()).toEqual([a.id, b.id].sort());
    scriptDialogs(["undead, forest"]);
    await actions.run("addTags", [a], ctx);
    expect(org.getTags(a.id)).toEqual(["undead", "forest"]);
    scriptDialogs(["forest"]);
    await actions.run("removeTags", [a], ctx);
    expect(org.getTags(a.id)).toEqual(["undead"]);
    scriptDialogs(["Old Chapel"]);
    await actions.run("setAlias", [a], ctx);
    expect(org.getAlias(a.id)).toBe("Old Chapel");
    scriptDialogs(["Night version"]);
    await actions.run("setNote", [a], ctx);
    expect(org.getNote(a.id)).toBe("Night version");
    scriptDialogs(["map", "city"]);
    await actions.run("setRole", [a, b], ctx);
    expect(org.getRole(b.id)).toEqual({ role: "map", mapType: "city" });
    expect(summaryText(a, ctx)).toContain("Old Chapel");
    expect(summaryText(a, ctx)).toContain("undead");
  });

  it("reports failures through notifications instead of throwing", async () => {
    const log = scriptDialogs([]);
    actions.register({ id: "boom", label: "GMAL.Action.Open", icon: "x", available: () => true, run: async () => { throw new Error("kaboom"); } });
    expect(await actions.run("boom", [createFileRecord({ url: "x.png" })], ctx)).toBeNull();
    expect(log.at(-1).notify).toBe("error");
    expect(log.at(-1).m).toContain("kaboom");
  });

  it("refuses shared organization writes for players and tells them", async () => {
    makeGame({ isGM: false });
    registerSettings();
    const playerOrg = new OrganizationService().load();
    const pctx = { ...ctx, organization: playerOrg };
    const a = createFileRecord({ url: "a.png" });
    expect(actions.actionsFor([a], pctx).map(x => x.id)).not.toContain("addTags");
    const log = scriptDialogs([]);
    await actions.run("addTags", [a], pctx);
    expect(log.at(-1).notify).toBe("warn");
  });
});
