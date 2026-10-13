# Testing Report

## Automated tests (vitest, Foundry runtime mocked)

`npm test` runs 109 tests across 10 files. The mock (`tests/setup/foundry-mock.js`) models the V14 APIs the module
uses; roll fixtures (`tests/fixtures/rolls.js`) mirror the serialized `D20Roll` structure of dnd5e 6.0.6.

### Roll detection
- Natural 20 / natural 1 on attacks, ability checks, saving throws.
- Modified totals of 20 and 1 without a natural result (no award).
- Expanded critical range (natural 19 crit) is not a natural 20.
- Advantage/disadvantage with mixed results under all three policies, Elven Accuracy, modifier fallback.
- Rerolls (Halfling Lucky) under both reroll policies; Reliable Talent minimum keeps the natural 1.
- Damage rolls containing d20s and secondary d20 terms never award; plain `/r 1d20` never awards; unevaluated rolls.
- Category determination from message data, hook names and roll options.
- One roll observed by several hooks and the chat message → one award (tag, message key, object identity).
- Multiattack / several rolls in one message with identical totals → separate awards.
- NPC rolls excluded unless enabled; rolls without a selected token; unlinked token speaker resolution; rolls with
  no resolvable actor; delegation to the GM and GM re-validation; failed update releases the dedupe claim; concurrent
  qualifying rolls.

### Resource management
- Awards from 0, 1, 2; blocked fourth award without overflow conversion; both pools held simultaneously.
- Spending, refusing negative balances, refunds capped at the maximum.
- Concurrent awards serialized per actor; persistence across a simulated reload (re-read from flags).
- Permission failures, unsupported actor types, failed updates leaving state untouched.
- GM adjust/set/reset, cap enforcement, administrative override only when enabled (logged), history cap.

### Ability definition and activation
- First Heroic and first Villainous activation prompt independently; cancellation spends nothing; empty names and
  descriptions rejected; definitions reused; editing, clearing, unauthorized editing, second authorized owner.
- Manual activation; automated activation executing mechanics; spend after confirmation; cancellation before
  activation; execution failure refund; unsupported mechanics fail safely; GM approval state transitions;
  GM-controlled policy with no GM connected.
- Activation policies: no resource, outside combat, turn-bound, legendary per-round limit, GM-controlled, approval
  requirements.
- Definition validation: sanitization, limits, costs, mechanics, formula safety (no code-like formulas).

### Permissions and migration
- Ownership, GM-only administration/approval, world setting for player editing, participation by actor type.
- Flag migration structure and world migration idempotence.

## Manual smoke test checklist (run in a real Foundry V14 + dnd5e 6.x world)

1. Enable the module; confirm no console errors on load and the settings and both menus appear.
2. Roll a weapon attack from a character sheet with advantage until a natural 20 appears: confirm one award, one
   chat notification, the sheet card and panel update.
3. Roll a save with disadvantage until a natural 1 appears: confirm one Villainous award.
4. Roll a death save (category enabled): confirm exactly one award despite two dnd5e hooks.
5. Fill a pool to 3; roll another natural 20: confirm the "maximum capacity" message and no change.
6. Press **Use** on the sheet card: the definition dialog appears; cancel → nothing spent; define → review → save;
   confirm → resource spent and activation card posted.
7. Reload the world and reopen the sheet: counts and definitions persist.
8. Log in as a player without ownership: no Use/Define buttons; API calls throw permission errors.
9. With Midi-QOL (`dnd6` line) active: attack through Midi; confirm a single award.
10. GM Management: adjust, set above 3 with override off (clamped) and on (allowed, logged), reset, approve.

## Known limitations

- Real-environment execution was not possible in the build environment; see `COMPATIBILITY.md`.
- Mechanics not implemented: moving a token within a range, spending a defined item resource, summoning, applying
  arbitrary Active Effect changes. Describe such effects as manual abilities (or add a Note mechanic).
- Measured templates are placed at the actor's token and must be dragged into position.
- Abilities that cost more than one resource are supported by the schema (1–3) but the default is one.
- The sheet card is injected only into dnd5e's own ApplicationV2 sheets; other sheet modules use the panel.
- GM relay features (delegated awards, approvals, effects on unowned targets) require an active GM client.
