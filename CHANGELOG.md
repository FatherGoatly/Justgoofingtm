# Changelog

## 0.1.0 — 2026-10-13

Initial release.

### Added
- Module manifest for Foundry V14 (14.367+) and dnd5e 6.x; settings (world-scoped GM controls), permission model, compatibility/capability registry, diagnostics log.
- Import pipeline: format detection, text/Markdown/HTML/JSON schema/Foundry export/CSV parsers, intermediate representation with validation, content fingerprints.
- Parsers for creature stat blocks (2014 and 2024 layouts, legendary/lair/mythic sections, recharge, spellcasting groups), magic items/weapons/armor/consumables, spells and labelled-line character sheets (multiclass aware).
- Restricted formula validator (allow-listed operators, functions, dice modifiers and `@` references; bounded complexity).
- Rules interpreter producing structured mechanic specifications with confidence and source sentences; native-first implementation (damage parts, alternate activities, save activities with applied conditions, uses/recovery, transfer effects).
- Document builders producing dnd5e 6.0.6 Actor/Item/ActiveEffect data, including attack/damage reconciliation against ability scores so printed numbers roll exactly.
- Automation runtime with a single trigger registry, conditional on-hit damage (Midi-QOL `damageBonus` function or `dnd5e.preRollDamageV2`, never both), last-charge destruction roll, interactive teleport via generated wrapper macro, verification of created documents.
- Integration adapters: Midi-QOL 14.6.x, DAE 14.6.x, DFreds Convenient Effects 7.x, Times Up (V14 note), Tidy 5e Sheets.
- Importer transaction with duplicate detection (fingerprint/source/name), create/skip/update/merge policies, staging destination, batch limits, rollback of created documents on failure, verification and report.
- ApplicationV2 importer window (Source / Preview / Options / Report).
- Documentation and automated tests (vitest).

### Known limitations
- Monster spellcasting requires spells to be found in a compendium (dnd5e SRD packs or world items) to become Cast activities; otherwise placeholder spell items are created and flagged.
- Character sheet equipment/spells/features are resolved by name against compendia; unresolved names become placeholders.
- Token light from items is not automated (no supported core API without an integration); flagged as manual.
- Summoning requires the creature to exist in a compendium; otherwise flagged for manual configuration.
- Situational advantage/disadvantage and conditional bonuses are preserved as descriptions and marked manual unless unconditional.
- OCR is not bundled; the setting only allows a GM-configured provider to feed text into the pipeline.
- Live testing with Midi-QOL/DAE/CE installed was not possible in the build environment; adapters are source-verified and mock-tested.
