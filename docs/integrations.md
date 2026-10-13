# Integrations and compatibility

Adapters live in `scripts/automation/integrations/`. Each declares its module id, minimum/verified versions, capabilities and an API verification step. The core importer works with none of them installed.

| Component | Version range | Status | Capabilities | Verified facts used |
| --- | --- | --- | --- | --- |
| Foundry VTT | 14.367 – 14 (verified 14.369) | verified by source (dnd5e 6.0.6 targets 14.367+) | — | ActiveEffect `system.changes` with `type`/`phase`, native expiry (`duration.expiry`), ApplicationV2/HandlebarsApplicationMixin, DialogV2 |
| dnd5e | 6.0.0 – 6 (verified 6.0.6) | verified by source | native activities, uses, effects | Data models in `module/data/**`, hook names in `module/documents/**`, compendium sources in `packs/_source` |
| Midi-QOL | 14.6.0+ (verified 14.6.2 sources) | mock-tested | `midi.workflow`, `midi.damageBonus`, `midi.flags`, `midi.applyDamage` | `flags.midi-qol.onUseMacroName` `[damageBonus]function.<path>`; result `{damageRoll, damageType, flavor}`; workflow hooks; `MidiQOL.applyTokenDamage` |
| DAE | 14.6.0+ (verified 14.6.1 sources) | mock-tested | `dae.specialDuration`, `dae.effectKeys` | `flags.dae.specialDuration` keys; `DAE.daeSpecialDurations` |
| DFreds Convenient Effects | 7.0.0+ | mock-tested | `ce.conditions` | `game.dfreds.effectInterface.{findEffect,hasEffectApplied,addEffect,removeEffect}` |
| Times Up | 14.0.0+ | mock-tested | none | On V14 only sets `CONFIG.ActiveEffect.expiryAction`; no second expiry mechanism is scheduled |
| Tidy 5e Sheets | V14 branch (dnd5e 6.0.x) | mock-tested | `sheet.tidy5e` | presentation only |
| CRUX / Chris's Premades | — | not implemented | — | Deferred until core is stable and interfaces are verified |

"mock-tested" means the adapter's detection, API verification and data contracts are covered by automated tests with mocked globals; **no live Foundry world with the module installed was available in the build environment**. Treat those rows as theoretically compatible until exercised in a real world.

## Graceful degradation

- Missing/old/disabled module → adapter reports `active: false`; capabilities absent; the planner selects the next owner (module handler or manual) and the preview/report say so.
- GM allow-list (`Enabled integrations` setting) can switch an installed adapter off.
- When Midi-QOL is present, the dnd5e-hook path for conditional damage is inert, preventing double application. When it is removed later, the on-use flag is ignored by nothing (Midi is gone) and the dnd5e path takes over automatically.
