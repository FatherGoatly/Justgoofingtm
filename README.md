# Stat Block Importer & Automation Engine (D&D 5e)

A Foundry VTT **V14** module for the **D&D 5e system (v6.x)** that turns pasted or uploaded stat blocks into fully structured Actors and Items with validated, native-first automation.

- **Inputs**: plain text, Markdown (including Homebrewery), sanitized HTML, the module's documented JSON schema, Foundry Actor/Item exports, and simple CSV item tables. PDF/DOCX text can be pasted after extraction; OCR is an optional, GM-configured provider (none is bundled).
- **Content**: creatures/NPCs (2014 and 2024 layouts), player characters (labelled-line sheets and JSON), weapons, armor, equipment, consumables, magic items with several powers, and spells.
- **Fidelity**: the original description is always preserved; stated damage, DCs, durations and costs are never changed or invented. Where a value is missing the mechanic is flagged for review instead.
- **Automation**: mechanics are implemented with native dnd5e data first (activities, damage parts, uses/recovery, applied effects), then validated Active Effects, then optional integrations (Midi-QOL, DAE, Convenient Effects), then module-owned handlers, and only lastly a tiny generated macro wrapper. Nothing from imported text is ever executed.
- **Safety**: formulas go through a restricted parser, HTML is sanitized, ownership/folders/foreign flags are stripped, players can only import into Actors they own or a GM staging folder, and every document operation goes through Foundry's normal permission-checked API.
- **Review**: a preview shows every document, extracted statistic, effect and detected mechanic with its trigger, implementation owner, confidence and limitations. Ambiguous mechanics must be accepted or disabled before import.
- **Idempotent**: re-imports are detected by content fingerprint and source id with create/skip/update/merge choices; hook listeners are registered once per module load, never per import.

## Installation

Manifest URL (releases): `https://github.com/FatherGoatly/Justgoofingtm/releases/latest/download/module.json`

Or build the zip yourself:

```bash
npm install
npm test
npm run package      # dist/stat-block-importer.zip + dist/module.json
```

Requirements: Foundry VTT 14.367 or later (verified 14.369) and dnd5e 6.0.0 or later (verified against 6.0.6 sources).

## Usage

1. Open the Actors or Items sidebar and click **Import Stat Block** (or run `game.modules.get("stat-block-importer").api.open()`).
2. Paste text or upload a file. The format and content kind are detected; override the content kind if needed.
3. **Parse & Preview**. Check statistics, features, effects and mechanics. Toggle mechanics off, and accept or disable anything marked *Needs review*.
4. Choose a destination (world, an Actor you own, or the staging folder), the duplicate policy and whether to attach automation / generate macros.
5. **Import**. The report lists every created document, which mechanics were implemented *and verified*, which need review, which stay manual, and any placeholders you should replace with compendium entries.

See `docs/` for the user guide, supported formats, automation model, integrations and troubleshooting.

## Status

Version 0.1.0. All milestones have working code and automated tests (106 tests: parsers, rules, document builders, automation, permissions, importer scenarios). Integration adapters were verified against the modules' sources and tested with mocks; a live-world run with the optional modules has **not** been performed in this environment. See `docs/integrations.md` for the tested/theoretical distinction and `CHANGELOG.md` for known limitations.
