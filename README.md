# Heroic & Villainous Actions

A Foundry VTT **V14** module for the **D&D 5e system (6.x)** that turns natural 20s and natural 1s into a
player-facing resource system inspired by Legendary Actions.

- A **natural 20** on a qualifying d20 test earns one **Heroic Action**.
- A **natural 1** on a qualifying d20 test earns one **Villainous Action**.
- Each character holds up to **three** of each, independently (six in total).
- The **first time** a character spends a Heroic or Villainous Action, the player defines that character's unique
  ability. The definition is stored on the Actor and reused afterwards.
- Abilities can be **manual** (a description the table resolves) or **automated** (built from supported mechanics
  executed by trusted module code).

The die face is what matters: a natural 15 + 5 = 20 never awards, and a natural 4 − 3 = 1 never awards.

## Requirements

| Component | Version |
| --- | --- |
| Foundry VTT | 14 (verified against the 14.368 API) |
| D&D 5e system | 6.0.0 or later (verified against 6.0.6 source) |
| Optional | Midi-QOL `dnd6` line (14.6.x) |

No other module is required. Tidy 5e Sheets is not required.

## Installation

1. In Foundry, open **Add-on Modules → Install Module**.
2. Paste the manifest URL:
   `https://github.com/FatherGoatly/Justgoofingtm/releases/latest/download/module.json`
3. Enable **Heroic & Villainous Actions** in your world.

To install from a build instead, run `npm ci && npm run package` and extract `dist/heroic-villainous-actions.zip`
into `Data/modules/`.

## How it works at the table

### Earning resources
Roll attacks, checks and saves as usual from the character sheet, item cards or chat buttons. When a qualifying
roll shows a natural 20 or 1 the module:

1. verifies the roll is a dnd5e d20 test and resolves the Actor that rolled it (never the selected token),
2. classifies the natural result under the configured advantage/disadvantage and reroll policies,
3. checks the roll has not been processed already (one logical roll = at most one award),
4. updates the Actor's pool (capped at three), and
5. posts a notification such as *"A Heroic Action has been earned!"* or
   *"Villainous Actions are already at maximum capacity."*

### Spending resources
Open the character sheet: a **Heroic & Villainous** card appears in the sidebar with both counters, the ability
names and **Use** / **Define** buttons. The sheet header also has a button that opens the **action panel**, which
shows the full definitions, history and editing controls. You can also open the panel with the API
(`game.modules.get("heroic-villainous-actions").api.ui.openPanel(actor)`) or bind the *Open the action panel*
keybinding.

Pressing **Use**:

1. checks the pool holds at least one action,
2. on first use, opens **Define Your Heroic Action** / **Define Your Villainous Action** (cancelling spends nothing),
3. checks the activation policy (turn, combat, approval),
4. shows a confirmation with the ability, its mode and the cost (cancelling spends nothing),
5. spends the resource, executes automated mechanics (refunding on failure), and
6. posts the activation card to chat.

### Defining abilities
The definition dialog asks for a name, a description, the mode, activation type (action, bonus action, reaction,
free or *special* Legendary-style activation), trigger, target, range, duration and cost. Automated abilities add
one or more mechanics:

| Mechanic | What happens on activation |
| --- | --- |
| Roll damage | Posts a dnd5e `[[/damage]]` link so damage is rolled and applied with the system's own tools |
| Heal | Rolls the formula and heals current targets (or posts a `[[/heal]]` link when nothing is targeted) |
| Grant temporary HP | Rolls the formula and grants temp HP to targets (or self) |
| Force a saving throw | Posts a dnd5e `[[/save]]` link with the chosen ability and DC |
| Call for a check | Posts a dnd5e `[[/check]]` link |
| Apply / remove condition | Toggles a status effect from `CONFIG.statusEffects` on targets (or self) |
| Create a template | Places a measured template of the given shape and size at the token |
| Choice prompt | Asks the player to pick an option and records it on the card |
| Note | Adds reminder text to the card |

Effects on targets the player does not own are relayed to the active GM client, which re-validates the payload
before applying it. Player text is never executed as code; formulas are validated structurally and with
`Roll.validate`.

## Settings (world scope unless noted)

| Setting | Default | Notes |
| --- | --- | --- |
| Enable Heroic / Villainous Actions | on / on | |
| Qualifying categories | attacks, ability/skill/tool checks, saves, concentration on; death saves and initiative off | one toggle per category |
| Advantage & disadvantage handling | Selected result only | or *Any die*, *Ordinary rolls only* |
| Reroll handling | Final kept result | or *Exclude rolls with rerolls* |
| NPCs earn resources | off | GMs can always grant manually |
| Count rolls outside combat | on | |
| Behavior at the cap | Announce | or log only |
| Award chat notifications | Public | or owners & GM, none |
| Show toast notifications / Show sheet card | on (client) | |
| Activation policy | Flexible | Legendary-style, Turn-bound, GM-controlled |
| Legendary-style uses per round | 1 | 0 = unlimited |
| Allow abilities outside combat | on | |
| GM approval for automated abilities | on | mechanic changes reset approval |
| Default resource cost | 1 | 1–3 |
| Players may edit definitions | on | |
| Manual abilities without approval | on | |
| Require public activation messages | off | |
| Allow administrative override | off | lets the GM exceed the cap; logged |
| Diagnostics logging | off (client) | |

The **Rules Reference** menu documents every policy; the **GM Management** menu adjusts, sets and resets pools,
edits or clears definitions, approves automation and shows roll diagnostics (why a roll did or did not qualify).

### Activation economy (defaults)
- *Flexible*: each ability's own activation type and trigger apply.
- *Legendary-style*: off-turn use only for **Reaction** or **Special** abilities, limited per round; anything on the
  character's own turn.
- *Turn-bound*: own turn only, except Reaction/Special abilities.
- *GM-controlled*: the active GM approves each activation before the resource is spent.

Spending a resource never grants an extra ordinary action. A Reaction ability uses the reaction; a Special ability
is an extra Legendary-style activation that should state its trigger. Opportunity attacks and concentration follow
the normal rules.

## Roll detection details

Verified against dnd5e 6.0.6 source:

- The primary d20 is `roll.terms[0]`, a `D20Die`. Dice elsewhere in the formula (damage dice, extra d20s) never count.
- Advantage/disadvantage keep the chosen die `active` and mark the others `discarded`; rerolls (Halfling Lucky)
  mark the replaced die `rerolled`. Reliable Talent raises the counted value but leaves the die face intact, so a
  natural 1 is still a natural 1.
- Rolls are tagged with a stable id in `dnd5e.postRollConfiguration` (before evaluation). The tag is serialized into
  the chat message with the roll, so the post-roll hooks (`dnd5e.rollAttack`, `dnd5e.rollSavingThrow`,
  `dnd5e.rollDeathSave`, …) and `createChatMessage` all resolve to the same key. Death saves, which fire two dnd5e
  hooks, award once.
- Only the chat message's author processes its rolls, so one logical roll has one processing client. If that user
  cannot update the Actor, the request is relayed to the GM, who re-reads the message and re-validates it.
- Rolls whose provenance cannot be established (`/r 1d20`, unknown message types) never award.

## Permissions

- Owners use and define abilities for their Actors; definitions belong to the Actor, not to a user's browser.
- Editing can be restricted to the GM; administrative changes (set, reset, override, approval) are GM-only.
- Players cannot change world settings, spend what they do not have, exceed the cap, or edit other players' Actors.
- Every state change goes through one `ResourceManager` with per-actor serialization; failed updates are reported and
  leave the stored counts untouched.

## API

```js
const api = game.modules.get("heroic-villainous-actions").api;
api.resources.getCount(actor, "heroic");        // 0–3
await api.resources.award(actor, "villainous");  // respects the cap, requires permission
await api.abilities.activate(actor, "heroic");   // full workflow incl. first-use definition
api.rolls.classify(rollOrRollData, { advantagePolicy: "any" });
api.diagnostics.recent(20);                      // why recent rolls did or did not qualify
api.ui.openPanel(actor); api.ui.openGM(); api.ui.openHelp();
```

Hooks: `heroic-villainous-actions.resourceChanged (actor, entry)`,
`heroic-villainous-actions.abilityChanged (actor, {pool, ability, previous})`,
`heroic-villainous-actions.abilityActivated (actor, {pool, ability, cost, results})`,
`heroic-villainous-actions.ready (api)`.

## Development

```bash
npm ci
npm test          # vitest unit and pipeline tests (Foundry runtime mocked)
npm run lint
npm run validate  # module.json checks
npm run package   # dist/heroic-villainous-actions.zip + module.json
```

See [COMPATIBILITY.md](COMPATIBILITY.md) for the compatibility report and [docs/TESTING.md](docs/TESTING.md) for
the list of tested features and known limitations.

## License

MIT.
