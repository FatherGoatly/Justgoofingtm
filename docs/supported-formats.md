# Supported input formats

| Format | Detection | Notes |
| --- | --- | --- |
| Plain text | default | Creature stat blocks (2014 and 2024 MM layouts), magic items/weapons/armor/consumables, spells, labelled character sheets. Several blocks may be pasted together. |
| Markdown | headings/emphasis/tables/`___` | Homebrewery-style stat blocks are flattened to text (tables → ability rows, `***Name.***` → `Name.`). |
| HTML | tags present or `.html` upload | Sanitized to a small tag allow-list with no attributes; scripts/styles/objects removed; then converted to text. Can be disabled by the GM. |
| Module JSON schema | `$schema: "stat-block-importer/v1"` or `kind` field | See below. |
| Foundry export | `{ name, type, system }` of a dnd5e Actor or Item | Ownership, ids, folders and foreign flags are stripped; known formulas are validated. |
| CSV | `.csv` or header with `name` | Simple item tables; see below. |
| PDF / DOCX | — | Extract the text with any tool and paste it. Ligatures, curly quotes and dashes are normalized. |
| Images | — | Not bundled. When the GM enables OCR, an external provider must supply text to `api.pipeline.run(text)`. |

## Creature stat blocks

Recognized lines: name, size/type/alignment, `Armor Class`/`AC`, `Hit Points`/`HP`, `Speed`, `Initiative`, ability table (2014 row, 2024 `STR 27 +8 +8` rows, inline or stacked), `Saving Throws`, `Skills`, damage vulnerabilities/resistances/immunities (2024 combined `Immunities`), `Condition Immunities`, `Senses`, `Languages`, `Challenge`/`CR` (with XP and PB), `Gear`. Sections: Traits, Actions, Bonus Actions, Reactions, Legendary Actions (with `Legendary Action Uses`), Mythic Actions, Lair Actions, Regional Effects, Villain Actions.

Feature names may carry `(Recharge 5–6)`, `(1/Day)`, `(2/Day)`, `(Recharges after a Short or Long Rest)`, `(Costs 2 Actions)`.

Attacks: `Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) slashing damage plus 3 (1d6) fire damage.` and `Melee Attack Roll: +14, reach 10 ft. Hit: 13 (1d10 + 8) Slashing damage.` Saves: `must succeed on a DC 15 Dexterity saving throw …` and `Dexterity Saving Throw: DC 21, each creature in a 60-foot Cone. Failure: … Success: Half damage.` Spellcasting: 2014 level/slots groups and 2024 `At Will:` / `1/Day Each:` groups.

## Items

```
Flame Tongue
Weapon (any sword), rare (requires attunement)
Description…
```

Type line kinds: Weapon, Armor, Shield, Wondrous item, Potion, Scroll, Ring, Rod, Staff, Wand, Ammunition, Adventuring gear, Tool, Poison, Food, Container. Mundane entries may include price (`15 gp`), weight (`3 lb.`), damage (`1d8 slashing`), `versatile (1d10)`, `range (80/320)`, armor `AC 16`, `Str 13`.

## Spells

```
Fireball
3rd-level evocation            or    Level 3 Evocation (Sorcerer, Wizard)
Casting Time: 1 action
Range: 150 feet
Components: V, S, M (…)
Duration: Instantaneous
Description… At Higher Levels. …
```

## Character sheets (text)

Labelled lines: `Name`, `Species`/`Race`, `Class` (e.g. `Fighter 5 (Battle Master) / Wizard 2`), `Background`, `Alignment`, `Level`, an ability line (`STR 16 DEX 14 …`), `Saving Throws`, `Skills` (`Perception (expertise)`), `Armor Class`, `Hit Points` (`52 / 60`), `Hit Dice`, `Speed`, `Senses`, `Languages`, `Proficiencies`, `Currency`, `Equipment` (`Potion of Healing x2`), `Spells`, `Features`, `Feats`, `Biography`. Equipment, spells, features and feats are resolved by name against compendia at import; unresolved names become placeholders.

## JSON schema (v1)

```json
{
  "$schema": "stat-block-importer/v1",
  "entries": [
    {
      "kind": "item", "itemType": "weapon", "name": "Frost Blade", "rarity": "rare", "attunement": "required",
      "description": "When you hit a creature with this magic weapon, the target takes an extra 1d6 cold damage.",
      "weapon": { "category": "martialM", "baseItem": "longsword", "damage": { "formula": "1d8", "type": "slashing" }, "properties": ["ver"] },
      "uses": { "max": "3", "recovery": [{ "period": "dawn", "type": "recoverAll" }] }
    },
    {
      "kind": "actor", "actorType": "npc", "name": "Goblin", "size": "sm",
      "creatureType": { "value": "humanoid", "subtype": "goblinoid" }, "alignment": "Neutral Evil",
      "ac": { "value": 15 }, "hp": { "max": 7, "formula": "2d6" }, "movement": { "walk": 30 }, "cr": 0.25,
      "abilities": { "str": { "value": 8 }, "dex": { "value": 14 } },
      "items": [ { "kind": "item", "itemType": "weapon", "name": "Scimitar", "weapon": { "damage": { "formula": "1d6", "type": "slashing" } } } ]
    }
  ]
}
```

Field names mirror the intermediate representation (`scripts/import/schema.js`). Descriptions in JSON entries are interpreted for mechanics exactly like text.

## CSV

Header must include `name`. Recognized columns: `type` (e.g. `Weapon (longsword)`, `Armor (chain mail)`, `Adventuring Gear`), `damage`, `damage type`, `cost`/`price`, `weight`, `properties`, `ac`, `rarity`, `attunement`, `quantity`, `description`. Each row is rendered as an item text block and parsed by the item parser. Limitations: one item per row, no activities beyond what the description implies, no actors.
