/**
 * Live-world practice fixtures: a demonstration scene and actors the academy creates on request (GM only),
 * clearly flagged so cleanup and reset only ever touch academy-created documents.
 */
import { MODULE_ID, FLAGS } from "../core/constants.js";
import { canManageFixtures } from "../core/permissions.js";
import { PRACTICE_ACTORS, PRACTICE_TOKENS } from "./practice-snapshot.js";
import { getActiveAdapter } from "../adapters/registry.js";
import { Logger } from "../core/logger.js";

export const FIXTURE_SET = "practice-yard";
export const FIXTURE_FOLDER = "Academy Practice";
export const FIXTURE_SCENE = "Academy Practice Yard";

const fixtureFlags = () => ({ [MODULE_ID]: { [FLAGS.FIXTURE]: true, [FLAGS.FIXTURE_SET]: FIXTURE_SET } });
const isFixture = doc => doc?.getFlag?.(MODULE_ID, FLAGS.FIXTURE) === true;

/**
 * Report the fixture state in the current world.
 * @returns {{scene:Scene|null, actors:Actor[], folder:Folder|null, complete:boolean}}
 */
export function fixtureStatus() {
  const scene = game.scenes?.contents.find(isFixture) ?? null;
  const actors = game.actors?.contents.filter(isFixture) ?? [];
  const folder = game.folders?.contents.find(f => f.type === "Actor" && isFixture(f)) ?? null;
  return { scene, actors, folder, complete: Boolean(scene) && actors.length >= PRACTICE_ACTORS.length };
}

/**
 * Describe what creating the fixtures will do, for the confirmation dialog.
 * @returns {string[]}
 */
export function describeCreation() {
  return [
    `Create an Actor folder "${FIXTURE_FOLDER}" with ${PRACTICE_ACTORS.length} actors (${PRACTICE_ACTORS.map(a => a.name).join(", ")}).`,
    `Create a scene "${FIXTURE_SCENE}" with ${PRACTICE_TOKENS.length} tokens placed on a blank 30×20 grid.`,
    "Every created document is flagged as an academy fixture. Cleanup and reset only ever touch flagged documents.",
    "Nothing else in your world is read, modified or deleted."
  ];
}

/**
 * Pick an actor type available in the active system, preferring the requested one.
 * @param {string} preferred
 * @returns {string}
 */
export function pickActorType(preferred) {
  const types = (game.documentTypes?.Actor ?? Object.keys(CONFIG.Actor?.typeLabels ?? {})).filter(t => t !== "base");
  if ( types.includes(preferred) ) return preferred;
  const fallback = { character: ["character", "pc", "hero", "player"], npc: ["npc", "creature", "monster", "enemy"] }[preferred] ?? [];
  return fallback.find(t => types.includes(t)) ?? types[0];
}

/**
 * Build actor creation data for the active system.
 * @param {object} template   Entry from PRACTICE_ACTORS
 * @param {string|null} folderId
 * @returns {object}
 */
export function buildActorData(template, folderId=null) {
  const adapter = getActiveAdapter();
  const type = pickActorType(template.type);
  const data = { name: template.name, type, img: template.img, folder: folderId, flags: fixtureFlags(), prototypeToken: { name: template.name, actorLink: template.type === "character", disposition: template.type === "character" ? 1 : -1 } };
  if ( adapter.constructor.id === "dnd5e" ) {
    const sys = template.system;
    data.system = {
      attributes: { hp: { value: sys.attributes.hp.value, max: sys.attributes.hp.max, temp: sys.attributes.hp.temp } },
      abilities: Object.fromEntries(Object.entries(sys.abilities).map(([k, a]) => [k, { value: a.value }]))
    };
    if ( type === "character" ) data.system.details = { level: sys.details.level };
    else data.system.details = { cr: sys.details.cr };
    if ( type === "npc" ) data.system.attributes.hp.formula = "";
    data.items = template.items.filter(i => ["weapon", "equipment", "consumable", "feat", "spell"].includes(i.type)).map(i => ({ name: i.name, type: i.type, img: i.img ?? "icons/svg/item-bag.svg" }));
  } else {
    // Generic systems: only name/type/image; hit points are system-specific and left at defaults.
    data.items = [];
  }
  return data;
}

/**
 * Create the practice fixtures. Resolves with the created documents.
 * @returns {Promise<{scene:Scene, actors:Actor[], folder:Folder}>}
 */
export async function createFixtures() {
  const permission = canManageFixtures();
  if ( !permission.allowed ) throw new Error(permission.reason);
  const existing = fixtureStatus();
  if ( existing.complete ) return { scene: existing.scene, actors: existing.actors, folder: existing.folder };
  const FolderCls = getDocumentClass("Folder");
  const ActorCls = getDocumentClass("Actor");
  const SceneCls = getDocumentClass("Scene");
  const folder = existing.folder ?? await FolderCls.create({ name: FIXTURE_FOLDER, type: "Actor", flags: fixtureFlags() });
  const actorData = PRACTICE_ACTORS.filter(t => !existing.actors.some(a => a.name === t.name)).map(t => buildActorData(t, folder.id));
  const created = actorData.length ? await ActorCls.createDocuments(actorData) : [];
  const actors = [...existing.actors, ...created];
  let scene = existing.scene;
  if ( !scene ) {
    scene = await SceneCls.create({ name: FIXTURE_SCENE, width: 3000, height: 2000, grid: { type: 1, size: 100, distance: 5, units: "ft" }, padding: 0, backgroundColor: "#2b3a2b", tokenVision: false, fog: { exploration: false }, navigation: true, flags: fixtureFlags() });
    const tokenDocs = [];
    for ( const t of PRACTICE_TOKENS ) {
      const template = PRACTICE_ACTORS.find(a => a.id === t.actorId);
      const actor = actors.find(a => a.name === template?.name);
      if ( !actor ) continue;
      const doc = await actor.getTokenDocument({ x: t.x, y: t.y, name: t.name, hidden: t.hidden, disposition: t.disposition, flags: fixtureFlags() });
      tokenDocs.push(doc.toObject());
    }
    await scene.createEmbeddedDocuments("Token", tokenDocs);
  }
  Logger.info(`Created practice fixtures: ${actors.length} actors, scene "${scene.name}".`);
  return { scene, actors, folder };
}

/**
 * Delete every academy-flagged fixture document. Never touches anything else.
 * @returns {Promise<{scenes:number, actors:number, folders:number}>}
 */
export async function cleanupFixtures() {
  const permission = canManageFixtures();
  if ( !permission.allowed ) throw new Error(permission.reason);
  const scenes = game.scenes.contents.filter(isFixture);
  const actors = game.actors.contents.filter(isFixture);
  const folders = (game.folders?.contents ?? []).filter(isFixture);
  if ( scenes.length ) await getDocumentClass("Scene").deleteDocuments(scenes.map(s => s.id));
  if ( actors.length ) await getDocumentClass("Actor").deleteDocuments(actors.map(a => a.id));
  if ( folders.length ) await getDocumentClass("Folder").deleteDocuments(folders.map(f => f.id));
  Logger.info(`Removed practice fixtures: ${scenes.length} scene(s), ${actors.length} actor(s), ${folders.length} folder(s).`);
  return { scenes: scenes.length, actors: actors.length, folders: folders.length };
}

/** Reset = cleanup + create. Only academy-flagged documents are affected. */
export async function resetFixtures() {
  await cleanupFixtures();
  return createFixtures();
}
