# Automation model

## Categories (spec §7)

| Category | Meaning | Example |
| --- | --- | --- |
| native | Expressed entirely in dnd5e document data | extra 1d6 fire on hit → damage part; 7 charges regaining 1d6+1 at dawn → uses/recovery; DC 15 WIS save or frightened → save activity + applied condition |
| declarative | Validated transfer Active Effect | +1 AC (non-armor), resistance to fire, darkvision 60 ft., +1 saving throws |
| integration | Needs an installed module capability | conditional on-hit damage via Midi-QOL `damageBonus` |
| module | Module-owned runtime handler on a documented dnd5e hook | conditional on-hit damage without Midi (`dnd5e.preRollDamageV2`); last-charge destruction roll (`dnd5e.postActivityConsumption`) |
| interactive | Needs a decision; generated wrapper macro calls the runtime | teleport to a chosen point |
| unresolved | Ambiguous or unsupported; description preserved, nothing automated | missing DC, situational advantage, token light |

Confidence is assigned per interpretation (`high ≥ 0.9`, `medium ≥ 0.6`, `low ≥ 0.3`). `reviewRequired` mechanics block import until accepted or disabled (policy configurable).

## Ownership

| Operation | Owner |
| --- | --- |
| Trigger/roll/damage/consumption for activities | dnd5e (or Midi-QOL when active, which replaces the activity workflow) |
| Conditional on-hit damage | Midi-QOL `damageBonus` pass **or** module `preRollDamageV2` handler — the runtime checks `midi.workflow` and uses exactly one |
| Effect application from activities | dnd5e chat card (manual click) / Midi-QOL (automatic) |
| Condition application from module code | `Actor#toggleStatusEffect` (Convenient Effects when it defines the effect) |
| Durations/expiry | Foundry core + dnd5e (`duration.expiry`); Times Up only sets the expiry action on V14 |
| Charges | dnd5e uses/recovery; module only reads them and rolls destruction after consumption |

Duplicate guards: per-event keys in the runtime prevent double application within the same roll; hook listeners are installed once per module load by the trigger registry.

## Mechanic specification (stored in `flags.stat-block-importer.mechanics`)

```json
{
  "id": "mech-…", "version": 1, "kind": "damage.bonus-on-hit", "label": "+2d6 radiant vs undead",
  "category": "module", "confidence": 0.85, "reviewRequired": false, "enabled": true,
  "trigger": { "event": "hit", "condition": "target.type:undead" },
  "target": { "scope": "hitTarget", "filter": { "creatureType": "undead" } },
  "effect": { "formula": "2d6", "damageType": "radiant", "activityId": "…" },
  "implementation": { "owner": "module", "method": "dnd5e.preRollDamageV2", "requires": [], "limitations": [] },
  "assumptions": [], "sourceText": "When you hit an undead with this weapon, the target takes an extra 2d6 radiant damage."
}
```

Kinds: `damage.bonus-on-hit`, `damage.save`, `condition.on-failed-save`, `condition.on-hit`, `resource.charges`, `resource.limited-use`, `resource.recharge`, `resource.destroy-on-last-charge`, `bonus.attack-damage`, `bonus.ac`, `bonus.saves`, `bonus.spell-attack-dc`, `trait.resistance`, `trait.condition-immunity`, `trait.sense`, `trait.speed`, `trait.advantage`, `healing.use`, `healing.temp-hp`, `spell.cast-from-item`, `light.emit`, `summon`, `teleport`, `multiattack`, `legendary.resistance`, `unresolved`.

## Triggers

Only documented hooks are used: `dnd5e.preRollAttackV2`, `dnd5e.rollAttackV2`, `dnd5e.preRollDamageV2`, `dnd5e.rollDamageV2`, `dnd5e.preApplyDamage`, `dnd5e.applyDamage`, `dnd5e.preRollSavingThrowV2`, `dnd5e.rollSavingThrowV2`, `dnd5e.preUseActivity`, `dnd5e.postUseActivity`, `dnd5e.postActivityConsumption`, `dnd5e.restCompleted`, `createActiveEffect`, `deleteActiveEffect`, `combatTurnChange`, `combatRound`, and Midi-QOL workflow hooks (`midi-qol.AttackRollComplete`, `midi-qol.DamageRollComplete`, `midi-qol.RollComplete`, …). The registry maps abstract events (`hit`, `damage.after`, `resource.consumed`, …) to these names.

Limitation: without Midi-QOL the system does not know whether an attack hit before damage is rolled, so the damage roll is used as the hit signal and the extra damage is added as a separate roll that can be applied selectively from the damage card.

## Generated macros

Only for `interactive` mechanics and only when the GM macro policy allows it. Template (never contains imported text):

```js
const api = game.modules.get("stat-block-importer")?.api;
if ( !api ) return ui.notifications.error("Stat Block Importer is not active.");
return api.execute("<mechanic id>", { itemUuid: "<uuid>", actor, token, speaker, event });
```

One macro per mechanic id (idempotent; regenerated when the template hash changes). The runtime re-validates ownership, item existence and the mechanic before acting.

## Disabling automation

Set `flags.stat-block-importer.automationDisabled = true` on an Item or Actor (e.g. `item.setFlag("stat-block-importer", "automationDisabled", true)`), toggle mechanics in the preview before import, or turn off the world setting *Generate automation*.
