/**
 * The "Academy Practice Yard": a static, read-only snapshot of a small scene used by the Foundry emulator when a
 * lesson needs predictable data. It mirrors the documents the fixture service creates in a live world. Numbers
 * follow the D&D 5e 6.x data layout (system.attributes.hp etc.) so system lessons can practise against it; the
 * system id is "dnd5e" when the snapshot is used for system lessons and "generic" otherwise.
 */

const abilities = (str, dex, con, int, wis, cha, prof=2, saves=[]) => {
  const mk = (key, value) => ({ value, mod: Math.floor((value - 10) / 2), proficient: saves.includes(key) ? 1 : 0, save: { value: Math.floor((value - 10) / 2) + (saves.includes(key) ? prof : 0) }, check: { value: Math.floor((value - 10) / 2) } });
  return { str: mk("str", str), dex: mk("dex", dex), con: mk("con", con), int: mk("int", int), wis: mk("wis", wis), cha: mk("cha", cha) };
};
const skill = (ability, total, passive, prof=0) => ({ ability, total, passive, value: prof, mod: total, bonus: 0 });

function actor({ id, name, type, img, hp, ac, prof, abilitiesData, skills={}, items=[], effects=[], level=null, cr=null, ownerDefault=0, isOwner=true, conditions=[] }) {
  return {
    id, uuid: `Actor.${id}`, name, type, img, isOwner, ownership: { default: ownerDefault },
    system: {
      attributes: { hp: { value: hp.value, max: hp.max, temp: hp.temp ?? 0, tempmax: 0 }, ac: { value: ac, flat: null, calc: "default" }, prof, movement: { walk: 30, units: "ft" }, init: { total: abilitiesData.dex.mod, bonus: "" }, spellcasting: "", death: { success: 0, failure: 0 }, exhaustion: 0 },
      abilities: abilitiesData,
      skills: { acr: skill("dex", abilitiesData.dex.mod, 10 + abilitiesData.dex.mod), ath: skill("str", abilitiesData.str.mod, 10 + abilitiesData.str.mod), prc: skill("wis", abilitiesData.wis.mod, 10 + abilitiesData.wis.mod), ste: skill("dex", abilitiesData.dex.mod, 10 + abilitiesData.dex.mod), ...skills },
      details: level !== null ? { level, biography: { value: "" }, alignment: "" } : { cr, type: { value: "humanoid" }, biography: { value: "" } },
      traits: { size: "med", languages: { value: [] }, di: { value: [] }, dr: { value: [] }, dv: { value: [] }, ci: { value: [] } },
      currency: { pp: 0, gp: 15, ep: 0, sp: 4, cp: 12 }
    },
    items: items.map((it, i) => ({ id: `${id}i${i}`, uuid: `Actor.${id}.Item.${id}i${i}`, name: it.name, type: it.type, img: it.img ?? "icons/svg/item-bag.svg", system: it.system ?? {} })),
    effects: effects.map((ef, i) => ({ id: `${id}e${i}`, uuid: `Actor.${id}.ActiveEffect.${id}e${i}`, name: ef.name, img: ef.img ?? "icons/svg/aura.svg", disabled: false, statuses: ef.statuses ?? [] })),
    statuses: conditions,
    prototypeToken: { name, actorLink: type === "character" },
    flags: {}
  };
}

export const PRACTICE_ACTORS = [
  actor({ id: "acaReginald01", name: "Sir Reginald", type: "character", img: "icons/svg/mystery-man.svg", hp: { value: 24, max: 30, temp: 5 }, ac: 18, prof: 3, level: 5,
    abilitiesData: abilities(16, 12, 14, 10, 13, 8, 3, ["str", "con"]),
    skills: { ath: skill("str", 6, 16, 1), prc: skill("wis", 4, 14, 1) },
    items: [
      { name: "Longsword", type: "weapon", img: "icons/svg/sword.svg", system: { quantity: 1, equipped: true, damage: { base: { number: 1, denomination: 8, types: ["slashing"] } }, properties: ["ver"] } },
      { name: "Shield", type: "equipment", system: { quantity: 1, equipped: true, armor: { value: 2 } } },
      { name: "Potion of Healing", type: "consumable", system: { quantity: 2, uses: { max: 1, spent: 0 } } },
      { name: "Second Wind", type: "feat", system: { uses: { max: 1, spent: 0, recovery: [{ period: "sr", type: "recoverAll" }] } } }
    ] }),
  actor({ id: "acaMirabel0002", name: "Mirabel the Wise", type: "character", img: "icons/svg/mystery-man.svg", hp: { value: 9, max: 22 }, ac: 13, prof: 3, level: 5,
    abilitiesData: abilities(8, 14, 12, 18, 12, 11, 3, ["int", "wis"]),
    skills: { arc: skill("int", 7, 17, 1), inv: skill("int", 7, 17, 1) },
    items: [
      { name: "Quarterstaff", type: "weapon", system: { quantity: 1, equipped: true, damage: { base: { number: 1, denomination: 6, types: ["bludgeoning"] } } } },
      { name: "Fire Bolt", type: "spell", system: { level: 0, school: "evo", preparation: { mode: "prepared" } } },
      { name: "Magic Missile", type: "spell", system: { level: 1, school: "evo", preparation: { mode: "prepared", prepared: true } } },
      { name: "Shield", type: "spell", system: { level: 1, school: "abj", preparation: { mode: "prepared", prepared: true } } }
    ],
    effects: [{ name: "Mage Armor", statuses: [] }] }),
  actor({ id: "acaGoblinScout1", name: "Goblin Scout", type: "npc", img: "icons/svg/mystery-man.svg", hp: { value: 7, max: 7 }, ac: 15, prof: 2, cr: 0.25,
    abilitiesData: abilities(8, 14, 10, 10, 8, 8),
    skills: { ste: skill("dex", 6, 16, 2) },
    items: [{ name: "Scimitar", type: "weapon", system: { quantity: 1, equipped: true, damage: { base: { number: 1, denomination: 6, types: ["slashing"] } } } }, { name: "Shortbow", type: "weapon", system: { quantity: 1, equipped: true, damage: { base: { number: 1, denomination: 6, types: ["piercing"] } } } }] }),
  actor({ id: "acaOrcChief0001", name: "Orc War Chief", type: "npc", img: "icons/svg/mystery-man.svg", hp: { value: 15, max: 42 }, ac: 16, prof: 2, cr: 4,
    abilitiesData: abilities(18, 12, 16, 11, 11, 16, 2, ["str", "con", "wis"]),
    items: [{ name: "Greataxe", type: "weapon", system: { quantity: 1, equipped: true, damage: { base: { number: 1, denomination: 12, types: ["slashing"] } } } }],
    effects: [{ name: "Bloodied", statuses: ["bloodied"] }], conditions: ["bloodied"] }),
  actor({ id: "acaWolf00000001", name: "Wolf", type: "npc", img: "icons/svg/mystery-man.svg", hp: { value: 0, max: 11 }, ac: 13, prof: 2, cr: 0.25,
    abilitiesData: abilities(12, 15, 12, 3, 12, 6), conditions: ["dead"], effects: [{ name: "Dead", statuses: ["dead"] }] })
];

export const PRACTICE_TOKENS = [
  { id: "tokReginald0001", uuid: "Scene.acaScene000001.Token.tokReginald0001", name: "Sir Reginald", actorId: "acaReginald01", actorLink: true, x: 1000, y: 1000, width: 1, height: 1, disposition: 1, hidden: false, elevation: 0, controlled: true, targeted: false },
  { id: "tokMirabel00001", uuid: "Scene.acaScene000001.Token.tokMirabel00001", name: "Mirabel", actorId: "acaMirabel0002", actorLink: true, x: 1100, y: 1000, width: 1, height: 1, disposition: 1, hidden: false, elevation: 0, controlled: true, targeted: false },
  { id: "tokGoblinA00001", uuid: "Scene.acaScene000001.Token.tokGoblinA00001", name: "Goblin Scout A", actorId: "acaGoblinScout1", actorLink: false, x: 1300, y: 900, width: 1, height: 1, disposition: -1, hidden: false, elevation: 0, controlled: false, targeted: true },
  { id: "tokGoblinB00001", uuid: "Scene.acaScene000001.Token.tokGoblinB00001", name: "Goblin Scout B", actorId: "acaGoblinScout1", actorLink: false, x: 1400, y: 1100, width: 1, height: 1, disposition: -1, hidden: true, elevation: 0, controlled: false, targeted: false },
  { id: "tokOrcChief0001", uuid: "Scene.acaScene000001.Token.tokOrcChief0001", name: "Orc War Chief", actorId: "acaOrcChief0001", actorLink: false, x: 1600, y: 1000, width: 1, height: 1, disposition: -1, hidden: false, elevation: 0, controlled: false, targeted: false },
  { id: "tokWolf00000001", uuid: "Scene.acaScene000001.Token.tokWolf00000001", name: "Wolf", actorId: "acaWolf00000001", actorLink: false, x: 1200, y: 1300, width: 1, height: 1, disposition: -1, hidden: false, elevation: 0, controlled: false, targeted: false }
];

/**
 * Build the practice snapshot.
 * @param {object} [options]
 * @param {"dnd5e"|"generic"} [options.system="dnd5e"]
 * @param {boolean} [options.combat=true]
 * @param {boolean} [options.gm=true]
 * @param {string[]} [options.modules=[]]   Ids of optional integrations to mark as installed and active ("midi-qol")
 * @returns {object}
 */
export function createPracticeSnapshot({ system="dnd5e", combat=true, gm=true, modules=[] }={}) {
  const gmUser = { id: "usrAcademyGM001", name: "Gamemaster", role: 4, isGM: true, color: "#ff8800", character: null };
  const playerOne = { id: "usrPlayerOne001", name: "Player One", role: 1, isGM: false, color: "#44ff88", character: "acaReginald01" };
  const playerTwo = { id: "usrPlayerTwo001", name: "Player Two", role: 1, isGM: false, color: "#44aaff", character: "acaMirabel0002" };
  const user = gm ? gmUser : playerOne;
  const users = [gmUser, playerOne, playerTwo];
  return {
    kind: "practice",
    createdAt: 0,
    user, users,
    system: system === "dnd5e" ? { id: "dnd5e", title: "Dungeons & Dragons Fifth Edition", version: "6.0.6" } : { id: "generic", title: "Generic System", version: "1.0.0" },
    foundryVersion: "14.369",
    modules: [
      { id: "gm-macro-academy", title: "The Game Master's Macro Academy", version: "1.0.0", active: true, compatibility: { minimum: "14", verified: "14.369", maximum: "14" }, esmodules: ["scripts/main.js"] },
      // An installed-but-disabled module last verified for an older generation: a realistic census subject.
      { id: "legacy-token-tools", title: "Legacy Token Tools (example)", version: "0.9.4", active: false, compatibility: { minimum: "11", verified: "12", maximum: "12" }, esmodules: ["legacy.js"] },
      ...(modules.includes("midi-qol") ? [{ id: "midi-qol", title: "Midi Quality of Life Improvements", version: "14.6.2", active: true, compatibility: { minimum: "14.369", verified: "14.369" }, esmodules: ["dist/midi-qol.js"], emulated: true }] : [])
    ],
    scene: { id: "acaScene000001", uuid: "Scene.acaScene000001", name: "Academy Practice Yard", active: true, grid: { size: 100, distance: 5, units: "ft", type: 1 }, width: 3000, height: 2000, tokenIds: PRACTICE_TOKENS.map(t => t.id) },
    scenes: [{ id: "acaScene000001", name: "Academy Practice Yard", active: true, uuid: "Scene.acaScene000001" }, { id: "acaScene000002", name: "Tavern Cellar", active: false, uuid: "Scene.acaScene000002" }],
    actors: JSON.parse(JSON.stringify(PRACTICE_ACTORS)).map(a => {
      const owner = gm || a.id === user.character;
      return { ...a, isOwner: owner, ownership: owner ? { default: 0, [user.id]: 3 } : { default: 0 } };
    }),
    tokens: JSON.parse(JSON.stringify(PRACTICE_TOKENS)).map(t => {
      if ( t.actorLink ) return t;
      // Unlinked tokens carry their own synthetic actor copy, as in Foundry (token.actor !== game.actors.get(id)).
      const base = PRACTICE_ACTORS.find(a => a.id === t.actorId);
      const synthetic = JSON.parse(JSON.stringify(base));
      synthetic.name = t.name;
      synthetic.isOwner = gm;
      synthetic.ownership = gm ? { default: 0, [user.id]: 3 } : { default: 0 };
      return { ...t, syntheticActor: synthetic };
    }),
    items: [{ id: "itmWorldPotion1", uuid: "Item.itmWorldPotion1", name: "Potion of Greater Healing", type: "consumable", img: "icons/svg/item-bag.svg", system: { quantity: 1 } }],
    macros: [{ id: "macHelloWorld01", uuid: "Macro.macHelloWorld01", name: "Hello World", type: "script", command: "ChatMessage.create({ content: \"Hello!\" });" }],
    journal: [{ id: "jrnWelcome00001", uuid: "JournalEntry.jrnWelcome00001", name: "Campaign Notes" }],
    combat: combat ? { id: "cmbPractice0001", uuid: "Combat.cmbPractice0001", round: 2, turn: 0, started: true, combatants: [
      { id: "cbtReginald001", tokenId: "tokReginald0001", actorId: "acaReginald01", name: "Sir Reginald", initiative: 17, defeated: false },
      { id: "cbtGoblinA0001", tokenId: "tokGoblinA00001", actorId: "acaGoblinScout1", name: "Goblin Scout A", initiative: 14, defeated: false },
      { id: "cbtMirabel0001", tokenId: "tokMirabel00001", actorId: "acaMirabel0002", name: "Mirabel", initiative: 12, defeated: false },
      { id: "cbtOrcChief001", tokenId: "tokOrcChief0001", actorId: "acaOrcChief0001", name: "Orc War Chief", initiative: 8, defeated: false },
      { id: "cbtWolf0000001", tokenId: "tokWolf00000001", actorId: "acaWolf00000001", name: "Wolf", initiative: null, defeated: true }
    ] } : null,
    settings: { "core.rollMode": "publicroll" },
    worldTime: 0,
    paused: false
  };
}
