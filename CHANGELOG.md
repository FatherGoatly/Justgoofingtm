# Changelog

## 1.0.0 — 2026-10-13

Initial release for Foundry VTT V14 and D&D 5e 6.x.

- Natural 20 → Heroic Action, natural 1 → Villainous Action, three per pool, independent pools.
- Verified natural-result extraction from dnd5e `D20Roll` (primary `D20Die`, advantage/disadvantage, rerolls,
  Reliable Talent, expanded critical ranges, secondary d20s and damage dice ignored).
- Configurable advantage policies (selected die, any die, ordinary rolls only) and reroll policies.
- Idempotent roll processing: rolls are tagged at configuration time; hooks, chat messages and Midi-QOL workflows
  resolve to one key; failed awards release the claim.
- Persistent Actor flags (`flags.heroic-villainous-actions`) with history, statistics and schema versioning.
- First-use definition dialogs for Heroic and Villainous abilities with validation, review step and sanitized text.
- Manual and automated ability modes; automated mechanics: damage, heal, temporary HP, saving throw, check,
  apply/remove condition, measured template, choice prompt, note.
- Activation policies: flexible, Legendary-style (per-round off-turn limit), turn-bound, GM-controlled (socket
  approval). Spend after confirmation, refund on execution failure.
- Character and NPC sheet card, sheet header control, dedicated action panel, GM management application,
  rules reference, diagnostics.
- Optional Midi-QOL adapter (`midi-qol.AttackRollComplete`).
- Unit and pipeline test suite (vitest), CI and release packaging.
