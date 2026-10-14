# Curriculum authoring

Lessons are data, validated by `scripts/curriculum/schema.js` and exercised by `tests/curriculum/curriculum.test.js`. This document is the authoring contract. Use `node tools/check-tier.mjs <tier>` while writing; it runs every check for one tier with readable output.

## Principles

1. **Explain why.** Every lesson pairs the mechanism with the reason a GM needs it.
2. **Tested claims only.** A code block declares what it was tested against, and the test suite enforces the declaration. Do not mark a block `node` or `emulator` unless it runs there.
3. **Behaviour, not strings.** Exercise checks describe what a correct program does. Use `codeIncludes` only to enforce a taught practice, always alongside behavioural checks.
4. **Honest emulation.** When the emulator simplifies (no resistances, no real dialogs), say so in the lesson and point to the live checklist.
5. **Failure paths.** Every tier needs exercises that handle cancelled dialogs, empty selections, invalid input, missing permissions or errors.

## Files

```
curriculum/
  _helpers.js        constructors for blocks, sections, exercises, docs links, ACCESS and DND5E_REQ presets
  index.js           loadCurriculum(): imports every tier, the glossary and the broken macros
  glossary.js        GLOSSARY terms
  broken-macros.js   the debugging library
  tier-0N/index.js   { lessons, tier }  and one file per lesson
```

A tier: `{ number, title, objective, graduation, lessons: [ids], capstone: id, achievements: [ids] }`. The capstone must be one of the tier's lessons and have `category: "project"`.

## The lesson object

| Field | Rule |
|---|---|
| `id` | kebab-case, prefixed `t<tier>-`; globally unique |
| `version` | positive integer; bump when exercises change meaningfully (progress reconciliation reports changed lessons) |
| `tier`, `topic`, `title`, `summary` | required; summary is one sentence |
| `estimatedMinutes`, `difficulty` (`beginner`, `intermediate`, `advanced`, `expert`), `category` (`core-js`, `core-foundry`, `system`, `module`, `debugging`, `integration`, `project`) | required |
| `prerequisites` | lesson ids; the bundle must be acyclic and ordered by tier |
| `objectives` | at least two |
| `access` | `{ reads, writes, creates, mechanics }` booleans: what the lesson's code touches; use the `ACCESS` presets |
| `requirements` | optional `{ system: { id, title, minimum, verified }, modules: [{ id, optional, minimum }], alternative }`; use `DND5E_REQ` for dnd5e lessons |
| `sections` | the 13 required kinds in order: `plain`, `analogy`, `technical`, `syntax`, `example-minimal`, `example-annotated`, `incorrect`, `why-fails`, `corrected`, `use-case`, `common-mistakes`, `debugging`, `summary`; optional `deeper`, `aside`, `project` |
| `exercises` | at least one interactive exercise |
| `challenge` | one practical code exercise |
| `checkpoint` | `{ passScore (0,1], questions: [≥2] }` |
| `reinforces` | earlier lesson ids (non-empty after tier 0) |
| `documentation` | `[{ title, url, verified }]`; use `DOCS.*` |
| `completion` | `{ required: [exercise ids], checkpoint: boolean, criterion: "plain English" }` |

### Section and block constraints

- `example-minimal`, `incorrect`, `corrected` must contain a code block; `example-annotated` must contain a code block with `annotations: [{ line, note }]` whose lines exist.
- Block types: `paragraph`, `heading`, `list`, `steps`, `callout` (`tip`, `note`, `warning`, `danger`), `table`, `term`, `code`.
- Inline markup in text: `` `code` ``, `**bold**`, `_italic_`, `[[term]]`, `[[lesson:id|label]]`. Everything is escaped; raw HTML is never rendered from lesson text.

### Code blocks and the `compat` declaration

| Helper | target / tested | Executed by the tests? | Use for |
|---|---|---|---|
| `js(code)` | javascript / node | Yes, in the sandbox | Plain JavaScript |
| `jsFragment(code)` | javascript / static | Syntax-checked only | Partial snippets |
| `fvtt(code)` | foundry / emulator | Yes, in the emulator with the practice fixture | Foundry examples |
| `fvttStatic(code)` | foundry / static | Syntax-checked only | APIs outside the emulator (documented and verified) |
| `dnd(code)` | dnd5e / emulator (systemVersion 6.0.6) | Yes | dnd5e examples |
| `dndStatic(code)` | dnd5e / static | Syntax-checked only | dnd5e APIs outside the emulator |
| `mod(code)` | module / static | Shown only (import/export syntax) | Module source |
| `pseudo`, `json`, `shell`, `html` | — / none | Never executed | Everything else |

Extras: `caption`, `highlight: [lines]`, `annotations`, `expectOutput: [lines]` (asserted), `expectError: true` (the block must throw), `inputs: [...]` (scripted dialog answers), `snapshot: "practice" | "practice-player" | "practice-generic" | "practice-nocombat" | "practice-midi"`.

## Exercises

Constructors in `_helpers.js`: `mc`, `predict`, `fill`, `identify`, `reorder`, `explain`, `discover`, `codeEx` (types `repair-code`, `write-function`, `complete-macro`, `debug-scenario`, `build-project`), `capstone`, and `q` for checkpoint questions. Every exercise needs an id prefixed with the lesson's tier (`t4-`), a title, a prompt, `concepts` (used by review and achievements), at least three hints for code exercises, and `criteria` (plain-English success criteria shown to the learner).

Code exercises need `starter`, `runtime` (`sandbox` or `preview`; never `live`), `tests`, `solution: { code, explanation }` and `reveal: [{ title, code }]` (progressive steps). The test suite runs the solution (must pass every test) and the starter (must fail at least one).

### Test kinds

| Kind | Checks |
|---|---|
| `call: "fn", args: [...], expect | expectMatches | expectType | expectThrows` | Calls a function the learner defined (dotted paths allowed, e.g. `T.config.validate`) |
| `script: "…", expect | …` | Runs a snippet after the program, in its scope, and checks its return value |
| `expectOutput: [lines]`, `outputIncludes`, `outputMatches` | Console output |
| `expectNoError`, `expectError`, `expectTimeout` | Program outcome |
| `expectReturn`, `returnMatches` | Program return value |
| `expectChat: { count, contains, matches, html, whisperToGM, speakerAlias }` | Chat messages (text matching decodes entities; `html` matches raw HTML) |
| `expectNotification: { type, contains, count }` | `ui.notifications` |
| `expectUpdate: { name | uuid, path, value? }`, `expectNoUpdate: { name }` | Document updates |
| `expectCreate: { documentName }`, `expectDialog: { type }`, `expectRoll: { formula? }`, `expectHook: { name }`, `expectMechanic: { type, count? }` | Recorded side effects |
| `codeIncludes`, `codeExcludes` (regex) | Code text; pair with behavioural checks |

## Glossary terms

`t(term, slug, plain, technical, { analogy, example, misconception, related, tags })`. Slugs are kebab-case and unique; `related` lesson ids must exist. Lessons link terms with `[[slug]]`; the registry also lists terms whose titles appear in a lesson's prose.

## Broken macros

`{ id, title, category, difficulty, summary, symptom, expected, exercise }` where `exercise` is a `repair-code` exercise whose starter reproduces the fault and whose solution repairs it (both enforced by the tests).

## Checklist before committing content

- `node tools/check-tier.mjs <n>` prints "All checks passed".
- Every API named in the lesson was read in the documentation or source at the verified version, and the `documentation` list says where.
- The incorrect example is a mistake a GM would actually make, and "why it fails" explains the mechanism, not just the fix.
- At least one exercise exercises a failure path.
- Hints go from nudge to near-solution; the reveal steps teach, not just paste.
