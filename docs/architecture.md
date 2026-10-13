# Architecture

```
scripts/
  main.js                    entry: registers lifecycle hooks only
  core/        constants, settings (world/client scopes), permissions, compatibility (capability registry),
               diagnostics, dnd5e-reference (static 6.0.6 config tables), api, lifecycle
  import/      input-manager → format-detector → parsers/* → schema (IR) → rules interpreter → normalizer → pipeline
               importer (transaction), duplicates, recovery
  rules/       formula-validator, mechanic-specifications (catalogue), mechanic-registry (selection), interpreter
  documents/   actor-builder, item-builder, effect-builder (IR → dnd5e 6.0.6 data)
  automation/  planner, runtime, trigger-registry, effect-service, resource-service, macro-generator, integrations/*
  ui/          importer-app (ApplicationV2 + Handlebars), index (sidebar buttons)
```

## Pipeline stages (spec §5)

| Stage | Module |
| --- | --- |
| 1 Input acquisition | `import/input-manager.js` (size/type limits, allowed formats) |
| 2 Format detection | `import/format-detector.js` |
| 3 Normalization | `parsers/markup.js` (Markdown/HTML/CSV → text), `text-utils.js` |
| 4 Parsing | `parsers/statblock-parser.js`, `action-parser.js`, `item-parser.js`, `spell-parser.js`, `character-parser.js`, `json-parser.js`, `foundry-export-parser.js`, `csv-parser.js` |
| 5 Interpretation | `rules/interpreter.js` |
| 6 Rule analysis | mechanic specifications (`rules/mechanic-specifications.js`) |
| 7 Compatibility analysis | `automation/planner.js` + `rules/mechanic-registry.js` + capability registry |
| 8 Validation | `import/schema.js#validateEntry`, formula validator |
| 9 Preview | `ui/importer-app.js` |
| 10 Resolution | preview review actions (accept / disable), duplicate choices |
| 11 Document creation | `import/importer.js` + `documents/*` |
| 12 Automation installation | flags + Midi on-use entry + optional wrapper macros |
| 13 Verification | `automation/runtime.js#verifyItem` |
| 14 Reporting | importer report object, Report tab |

## Intermediate representation

`import/schema.js` defines factories (`createActor`, `createItem`, `createActivity`, `createEffect`, `createMechanic`) and `validateEntry`. Every entry carries `source` (format, raw text), `description.original`, `confidence`, `warnings`, `validation`, `fingerprint` and provenance. Items carry `activities`, `effects`, `mechanics`, `uses` and type-specific blocks (`weapon`, `armor`, `spell`, `classData`, …). Mechanics carry `kind`, `category`, `confidence`, `reviewRequired`, `enabled`, `trigger`, `target`, `effect`, `resource`, `implementation` (owner/method/requires/limitations), `assumptions`, `sourceText`.

## Mechanic categories and owners

See `docs/automation.md`. The planner assigns one implementation owner per mechanic; the runtime enforces that exactly one component performs each operation (trigger, roll, damage, consumption, effect application, duration, cleanup).

## Data stored on documents

- `flags.stat-block-importer.import` — provenance: module/IR versions, fingerprint, source id, format, importer user, original text (truncated), description hash (for merge).
- `flags.stat-block-importer.mechanics` — the mechanic specifications (source of truth for the runtime).
- `flags.stat-block-importer.automationDisabled` — per-document switch.
- `flags.stat-block-importer.staging` — marker for GM-review imports.
- `flags.stat-block-importer.macro` — on generated macros: mechanic id, item uuid, template hash.
- `flags.midi-qol.onUseMacroName` — only when Midi-QOL is active and a conditional on-hit mechanic exists: `[damageBonus]function.StatBlockImporter.midi.damageBonus`.

## Extension points

- New parser: implement `score*`/`parse*`, register in `format-detector.js` and `pipeline.js`.
- New mechanic kind: add to `mechanic-specifications.js` (owners/capabilities), a recognizer in `interpreter.js`, a verification rule in `runtime.verifyItem`, and a handler if module-owned.
- New integration: subclass `integrations/base-adapter.js`, declare capabilities, add to `integrations/index.js`.

## Testing

`npm test` runs vitest with a minimal Foundry shim (`tests/setup/foundry-shim.js`). Parsers, rules, builders and the importer are pure enough to run in Node; UI code is syntax-checked and lint-checked only.
