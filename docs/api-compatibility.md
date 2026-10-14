# API compatibility

Every Foundry, dnd5e and Midi-QOL API the curriculum and the module rely on, where it was verified, and how the emulator treats it. "Verified" means read in the named documentation or source at the named version by the authors; it does not mean executed in a live Foundry instance unless the testing document says so.

## Foundry VTT V14 (14.369)

Sources: https://foundryvtt.com/api/ (V14 build), release notes for 14.349 and 14.369, Knowledge Base articles on macros, users and module development.

| API | Used by | Emulated? |
|---|---|---|
| `game.actors/items/scenes/users/macros/journal/combats` collections (`get`, `getName`, `contents`, `filter`, `find`, `size`) | Tiers 3+ | Yes |
| `game.user` (`id`, `name`, `isGM`, `role`, `can(permission)`, `hasRole`, `targets`, `character`) | Tiers 3+ | Yes (targets carry Foundry's Set helpers) |
| `game.users.activeGM`, `ChatMessage.getWhisperRecipients("GM")` | Tiers 4–6 | Yes |
| `game.combat`, `Combat#combatants/turns/turn/round/combatant/nextCombatant`, `rollInitiative(ids)`, `rollAll`, `rollNPC`, `nextTurn`, `nextRound`, `startCombat`, `endCombat`, `Combatant#token/actor/initiative/isDefeated/isNPC` | Tier 5 | Yes (initiative formula simplified to `1d20 + dex.mod`) |
| `canvas.tokens.controlled/placeables/get`, `canvas.scene`, `canvas.grid.measurePath`, `Token#center/document/actor/isOwner`, `TokenDocument#update/delete/disposition/hidden/actorLink` | Tiers 3+ | Yes |
| `Scene#createEmbeddedDocuments/updateEmbeddedDocuments/deleteEmbeddedDocuments("Token")` | Tiers 6, 8 | Yes |
| `Document#update/delete/getFlag/setFlag/unsetFlag/testUserPermission/isOwner/uuid`, `fromUuid`, `Actor.updateDocuments`, `Actor#createEmbeddedDocuments/updateEmbeddedDocuments/deleteEmbeddedDocuments("Item"/"ActiveEffect")`, `Actor.create`, `Item.create`, `Macro.create` | Tiers 3+ | Yes (ownership map, GM override, flags merge on write, `-=` deletion) |
| `ChatMessage.create` (`content`, `speaker`, `whisper`, `flavor`, `rolls`, `rollMode`) | Tiers 0+ | Yes (roll modes resolve whisper lists) |
| `Roll` (`evaluate`, `total`, `formula`, `dice`, `toMessage`, `@` data) | Tiers 4+ | Yes (own dice parser; seeded in tests) |
| `foundry.applications.api.DialogV2.prompt/confirm/input/wait` (null on dismiss) | Tiers 3+ | Yes (scripted answers; `query` not emulated) |
| `ui.notifications.info/warn/error` | Tiers 0+ | Yes |
| `Hooks.on/once/off/call/callAll/events`, document hooks (`preUpdate*`, `update*`, `preDelete*`, `delete*`, `create*`), `combatTurn`, `combatRound`, `canvasReady`, `init/setup/ready` | Tiers 5–9 | Registration and document hooks yes; combat and lifecycle hooks are registered but never fired by the emulator |
| `game.settings.register/get/set` (world, client, user scopes), `registerMenu` | Tiers 6, 9 and the module | Yes (register required before get; throws otherwise) |
| `game.modules` (`get`, iteration, `contents`, `size`), `module.active/version/compatibility/esmodules/api` | Tier 7 | Yes |
| `game.release.generation`, `game.version`, `game.system.id/version`, `foundry.utils.isNewerVersion` | Tiers 6–9 | Yes |
| `foundry.utils.escapeHTML`, `cleanHTML`, `deepClone`, `mergeObject`, `expandObject`, `flattenObject`, `getProperty`, `setProperty`, `randomID`, `debounce`, `throttle` | Tiers 4+ | Yes (`cleanHTML` is a conservative stand-in; `debounce/throttle` pass through) |
| `foundry.utils.AsyncFunction`, `Macro#execute` argument names and block wrapping | Workshop | Yes (the harness mirrors it) |
| `foundry.utils.saveDataToFile`, `navigator.clipboard` | Exporter | Not emulated (live only) |
| ApplicationV2, HandlebarsApplicationMixin, `code-mirror` element, `getSceneControlButtons`, `renderSettings`, keybindings | The module's own windows | Not emulated; lessons show them as static module source |
| Removed V12 globals (`Dialog`, `renderTemplate`, `TextEditor`, `actor.data.data`, `game.actors.entities`) | Tier 7 | The emulator throws explanatory errors naming the replacement |

## dnd5e 6.0.6

Source: the dnd5e system repository at tag 6.0.6 (`module/documents/actor/actor.mjs`, `module/documents/item.mjs`, `module/data/actor/templates/*.mjs`, `module/config.mjs`, `module/dice/*`).

| API | Used by | Emulated? |
|---|---|---|
| `actor.system.attributes.hp.{value,max,temp}`, `attributes.ac.value`, `attributes.prof`, `abilities.<key>.{value,mod,save.value,proficient}`, `skills.<key>.{total,passive}`, `details.level/cr`, `traits.dr/di/dv` | Tier 5 | Values yes; resistances read but not applied |
| `actor.rollAbilityCheck/rollSavingThrow/rollSkill(config, dialog, message)` → `D20Roll[] | null`; `config: { ability, skill, target, advantage, disadvantage }`, `dialog: { configure: false }`, `message: { create: false, rollMode }` | Tiers 5, 7, 9 | Yes (simplified: d20 + modifier, no situational bonuses) |
| `actor.applyDamage(number | [{ value, type }], { multiplier, ignore, invertHealing })`, `applyTempHP(n)` | Tiers 5–9 | Yes (temp HP absorbs first, clamped at zero, healing inverted; resistances not applied) |
| `actor.toggleStatusEffect(id, { active })`, `actor.statuses` | Tiers 5+ | Yes |
| `item.use(config, dialog, message)`, activities (`item.system.activities`), `uses.{max,spent,value}` | Tier 5 | Use is recorded; activities are summarised |
| `actor.rollInitiative({ createCombatants })` | Tier 5 | Yes (simplified) |
| Hooks `dnd5e.preApplyDamage`, `dnd5e.applyDamage`, `dnd5e.calculateDamage`, `dnd5e.preUseActivity`, `dnd5e.postUseActivity`, `dnd5e.rollDamageV2` | Tier 5 (static) | Not fired |
| `CONFIG.DND5E.abilities/skills/damageTypes/healingTypes/conditionTypes` | Tier 5 | Subset |

## Midi-QOL 14.6.2 (dnd6 branch)

Source: the Midi-QOL repository, `src/midi-qol.ts` and `src/module/Workflow.ts` at tag 14.6.2 (module.json minimum Foundry 14.369, dnd5e 6.0.6). Only these surfaces are taught; everything else is treated as private.

| Surface | Emulated on `practice-midi`? |
|---|---|
| `MidiQOL.applyTokenDamage(damageDetail, totalDamage, targets, item, saves, options)` | Yes (applies through `actor.applyDamage`, halves for saved targets, records the call) |
| `MidiQOL.completeItemUse(item, config, options)`, `completeActivityUse(activity, config, options)` | Recorded; the item/activity's own `use` is called |
| `MidiQOL.findNearby(disposition, token, distance, options)` | Yes (grid distance, excludes incapacitated by default) |
| `MidiQOL.getDistance(t1, t2)` | Yes |
| `MidiQOL.hasCondition(tokenOrActor, condition)` | Yes (reads `actor.statuses`) |
| Hooks `midi-qol.ready`, `AttackRollComplete`, `DamageRollComplete`, `RollComplete`, `preCheckHits`, `postActiveEffects`, `targetingComplete` | Registration only; never fired |

The stand-in exists to test detection and adapter logic. Real Midi-QOL behaviour (its workflow, chat cards, reactions, concentration) must be verified live, and the lessons say so.

## Verification policy

- Nothing is taught from memory: each lesson's `documentation` list names the page or source file and the verification date.
- When a documented API and its source disagree, the source at the installed version wins and the lesson says which it used.
- Version floors are enforced at runtime (`core/compatibility.js`) and taught (Tier 7).
- A new Foundry generation, dnd5e major version or Midi-QOL major version requires re-reading every row above before raising `compatibility.maximum`.
