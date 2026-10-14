# The Game Master's Macro Academy

An interactive programming course that runs inside Foundry Virtual Tabletop V14. It takes a Game Master with no coding experience from "what is code?" to designing, building, testing and shipping their own Foundry automation, using the GM's own table as the motivation and Foundry itself as the workshop.

- **Ten progressive tiers** (57 lessons, 234 interactive exercises, 10 capstone projects) from reading your first error message to module development, with a 72-term glossary and a library of 15 deliberately broken macros to repair.
- **Three learning modes**: Guided (explanations first, deep dives collapsed), Workshop (code first, prompts beside the editor) and Independent Challenge (requirements only, solutions hidden until you ask).
- **A code workshop** with three clearly separated execution modes: the **Concept Sandbox** (plain JavaScript, no Foundry), **Foundry Preview** (an emulator fed by read-only snapshots of practice data or your world) and **Live Execution** (your real world, after an explicit warning and consent). Drafts with version history, export to file, clipboard or Macro document (never silently overwriting), and side-by-side comparison with the lesson's reference.
- **Honest assessment**: exercises are checked against behaviour (output, recorded updates, chat, dialogs, rolls, hooks, system mechanics), not against one reference string; five levels of hints; progressive solution reveals recorded as *assisted*; mastery states derived only from your saved records; review suggestions derived only from your attempt history.
- **A safe laboratory**: flagged practice actors and a practice scene that the Academy creates, resets and removes without touching anything else in your world.
- **A debugging workbench**: an error explainer that never invents details, a hook monitor, an object inspector and a diagnostics report that contains no secrets.
- **Progress that lasts**: per-user storage inside Foundry, validated import/export with migrations, and achievements earned from real records.

The primary worked example is the **D&D 5e** system (dnd5e 6.0.6); core JavaScript and core Foundry lessons work on any system, and system-specific lessons are labelled and gated by what is actually installed. Optional integrations (Midi-QOL 14.6.2) are detected by surface, never assumed.

## Requirements

| Component | Supported | Verified against |
|---|---|---|
| Foundry VTT | V14 (14.x) | 14.369 API documentation and release notes |
| Game system (primary) | dnd5e 6.0.0 or newer | dnd5e 6.0.6 source |
| Game system (other) | Any: core JavaScript and core Foundry lessons work; system lessons are marked unavailable | — |
| Optional integration | Midi-QOL 14.6.0 or newer (dnd6 branch) | Midi-QOL 14.6.2 source |
| Browser | Any browser Foundry V14 supports; Web Workers required for the sandbox and preview | — |

No third-party JavaScript dependencies are bundled. The code editor is Foundry's own `code-mirror` element.

See [COMPATIBILITY.md](COMPATIBILITY.md) for the full matrix and what has and has not been tested.

## Installation

1. In Foundry's **Add-on Modules** tab choose **Install Module** and paste the manifest URL: `https://github.com/FatherGoatly/Justgoofingtm/releases/latest/download/module.json`, or download the release zip and extract it into `Data/modules/gm-macro-academy/` (the folder name must be exactly `gm-macro-academy`).
2. Enable **The Game Master's Macro Academy** in your world's **Manage Modules** dialog.
3. By default only Gamemasters can open the Academy. To let players learn too, set **Who may use the academy** to *Everyone* in the module settings. Players can never run live code unless you also enable **Allow players to run code live** (and Foundry's own *Use Script Macros* permission allows it).

## Opening the academy

Any of these entry points opens the Academy window:

- The **graduation-cap tool** in the Token controls on the left of the canvas.
- The **Macro Academy** button in the Settings sidebar tab.
- The keyboard shortcut **Alt + Shift + A** (rebindable under Configure Controls).
- Typing `/academy` in chat.
- The **Open the Academy** button in the module's settings menu, or from any macro: `game.modules.get("gm-macro-academy").api.open()`.

## Where to start

- New to programming: open the Academy and press **Start**. Tier 0 assumes nothing. The [beginner guide](docs/beginner-guide.md) explains the windows and the modes in plain language.
- Already write macros: the dashboard's **Curriculum** tab lets you filter by tier, difficulty and category; Tier 3 (Understanding Foundry) or Tier 5 (D&D 5e automation) are good entry points, though the checkpoints of earlier lessons still gate the later ones.
- Want the practice data: open **Diagnostics** and press **Create practice fixtures** (GM only). The Academy creates a flagged folder of practice actors and a practice scene; **Reset** restores them and **Clean up** removes them, and nothing else is ever touched.

## Documentation

| Document | Audience |
|---|---|
| [User guide](docs/user-guide.md) | Every learner: windows, modes, workshop, assessment, progress |
| [Beginner guide](docs/beginner-guide.md) | GMs with no coding experience |
| [Developer guide](docs/developer-guide.md) | Contributors and module developers: architecture, tests, extension API |
| [Curriculum authoring](docs/curriculum-authoring.md) | Writing lessons, exercises and packs; the validated lesson schema |
| [API compatibility](docs/api-compatibility.md) | Which Foundry, dnd5e and Midi-QOL APIs the curriculum relies on and how they were verified |
| [Security model](docs/security.md) | What the sandbox, preview and live modes guarantee and what they do not |
| [Testing](docs/testing.md) | Automated test results, what could not be tested here, and the manual release checklist |
| [Troubleshooting](docs/troubleshooting.md) | Common problems and their fixes |
| [Architecture](docs/architecture.md) | System design, compatibility matrix, emulator subset, mastery and review rules |
| [CHANGELOG](CHANGELOG.md) | Release notes |

## Development

```
npm install
npm run check      # lint, manifest + curriculum validation, all tests
npm test           # vitest: unit, curriculum, assessment and integration suites
node tools/check-tier.mjs 5      # validate and execute one tier's lessons
node tools/build-examples.mjs    # regenerate examples/ from tested capstone solutions
npm run package                  # dist/gm-macro-academy.zip and dist/module.json
```

The project is plain ES modules: no build step, no bundler, no transpiler. See the [developer guide](docs/developer-guide.md).

## Honest status

Everything in this repository has been executed by the automated test suite in Node (the sandbox and the Foundry emulator are the same code that runs in the browser's Web Worker). The Academy's own windows, the live execution mode, Foundry's `code-mirror` element and the practice fixtures have **not** been exercised in a running Foundry V14 instance by the authors of this release; they were written against the 14.369 API documentation and the dnd5e 6.0.6 and Midi-QOL 14.6.2 sources. The [testing document](docs/testing.md) lists exactly what was run, what the results were, and the manual checklist that must pass on a live instance before the release is considered verified.

## License

MIT. See [LICENSE](LICENSE).
