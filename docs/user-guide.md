# User guide

This guide covers every part of The Game Master's Macro Academy as a learner sees it. If you have never written code, read the [beginner guide](beginner-guide.md) first; it explains the same windows in plainer language and tells you what to click first.

## Opening the academy

- Token controls (left of the canvas): the **graduation-cap** tool.
- Settings sidebar: **Macro Academy**.
- Keyboard: **Alt + Shift + A** (change it under Configure Controls).
- Chat: `/academy`.
- Module settings menu: **Open the Academy**.

By default only Gamemasters can open it; the GM can allow everyone in the module settings. The window remembers its size and position and reopens where you left it; progress is saved after every action, so closing the window never loses anything.

## The Academy window

The left navigation lists the views; the mode switch at the top changes how lessons are presented.

| View | What it shows |
|---|---|
| **Dashboard** | Your current tier, the next recommended lesson, overall progress, recent activity, achievements, review suggestions, environment warnings and a **Resume** button |
| **Curriculum** | Every tier with its objective and graduation project; filters for text, difficulty, category, tier and status; each lesson's state and what locks it |
| **Lesson** | The open lesson (see below) |
| **Glossary** | Searchable terms with a plain and a technical definition, an analogy, an example, a common misconception and links to the lessons that teach them |
| **Progress** | Lesson states, tier mastery requirements, achievements with dates, bookmarks, drafts count, review suggestions, export/import/reset |
| **Debugging** | The broken macro library, the error explainer, the hook monitor and the object inspector |
| **Diagnostics** | Environment, system adapter and capabilities, module detection, permissions, the practice fixtures and a copyable report |
| **Help** | How to use the academy, the modes, safety rules and keyboard shortcuts |

### Learning modes

| Mode | Lesson presentation | Exercises |
|---|---|---|
| **Guided** | Every explanation expanded; technical deep dives and asides collapsed for beginners; the worked examples first | Hints offered after a failed attempt; the solution can be revealed step by step |
| **Workshop** | Code first: examples and exercises open with the editor; explanations beside them | Same hints and reveals |
| **Independent Challenge** | Requirements and tests only; explanations available on request | Hints still available (they are never withheld), but the solution is hidden until you explicitly reveal it, and revealing it marks the exercise *assisted* |

The default mode is a per-user setting; the switch in the window changes it for the session.

### A lesson

Every lesson has the same shape, so you always know where to look:

1. Header: tier, difficulty, estimated time, category, what the code in the lesson touches (reads, writes, creates, mechanics), and system requirements if any.
2. Objectives and prerequisites (links).
3. Sections, in a fixed order: plain explanation, analogy, technical explanation, syntax, minimal example, annotated example, an incorrect example, why it fails, the corrected version, a practical GM use case, common mistakes, a debugging guide and a summary. Deep-dive and aside sections appear when the lesson has them.
4. Every code block states what it was tested against (JavaScript in the sandbox, Foundry V14 in the emulator, dnd5e 6.0.6, or "static": verified against documentation but not executed). Buttons copy the code or open it in the workshop.
5. Exercises, the practical challenge, the knowledge checkpoint, related lessons, glossary terms used, and the documentation links the lesson was verified against.

The section navigation on the right jumps between sections and remembers where you were. Bookmark a lesson from its header.

## Exercises and assessment

Thirteen exercise types are supported: multiple choice, predict the output, fill in the blanks, identify the faulty line, reorder steps, API discovery, explain the code, repair code, write a function, complete a macro, debugging scenario, build from requirements, and capstone assessment.

- **Code exercises** run in the workshop. The checks are listed before you start and are about behaviour: what the program printed, which chat messages it created, which documents it updated, whether it showed a dialog, rolled dice, registered a hook or used a system mechanic. Several correct programs pass the same exercise. A check that reads your code text exists only to enforce a taught practice (escaping names, awaiting updates, using a system method) and is always paired with behavioural checks.
- **Hints** come in five levels: a nudge, a concept reminder, a structural hint, a partial snippet, and a near-complete walkthrough. Using hints never counts against you.
- **Solution reveals** are progressive: the solution is shown in steps with explanations. Once the final step (or the reference solution) is shown, the exercise is recorded as **assisted**. You can always re-attempt later without assistance to earn an independent pass.
- **Checkpoints** are short quizzes at the end of each lesson with a pass threshold; wrong answers show the explanation.
- **Explanations and capstones** are self-assessed against a rubric with a minimum length; the model answer is shown afterwards for comparison.

### Lesson states

Locked, not started, in progress, completed (guided), completed (independent), mastered, needs review. A lesson is complete when its required exercises and checkpoint are passed; *independent* means no solution was revealed for a required exercise; *mastered* adds the practical challenge passed without assistance. The **Require assessment** setting controls whether checkpoints gate completion. Tier mastery requires every lesson, every checkpoint, the capstone, and at least one passed exercise that handles a failure case; the Progress view lists the requirements and which are met.

### Review suggestions

When at least three of your last ten attempts on exercises about one concept failed (and at least half of them), the dashboard suggests the lessons that teach that concept and up to three practice exercises. Completed lessons in that set are flagged *needs review*. The rules are fixed and shown in the Progress view; nothing is hidden.

## The workshop

Open it from any code block, exercise, draft or broken macro, or from the navigation. The header shows the **runtime**, the **snapshot source** and the run controls; the editor is Foundry's own code editor (Ctrl + Enter runs, Ctrl + S saves); the results panel shows output, errors with the learner's line number, recorded side effects and the exercise checks; the side panel has the prompt and hints, drafts, the comparison view and the snapshot summary.

| Runtime | What runs | When to use it |
|---|---|---|
| **Concept Sandbox** | Plain JavaScript in an isolated worker. No Foundry globals at all | Learning the language |
| **Foundry Preview** | Your code against an emulated Foundry fed by a snapshot (the Academy's practice data, or a read-only snapshot of your current world) in the same isolated worker. Every side effect is recorded and shown; nothing in your world changes | Almost everything: it is where exercises run |
| **Live Execution** | Your code against the real world, with your privileges. A warning dialog explains what that means and asks for consent (every run, or once per session) | Only when you have read and understood the code and tested it in preview |

Runs stop after the time limit (4 seconds) so an infinite loop cannot freeze Foundry. Dialogs in preview answer themselves from the exercise's scripted inputs or are treated as cancelled, and the results say so.

**Drafts** are saved per user in Foundry (up to 60 drafts of 64 KB, ten versions each). Unsaved editor text is also kept in your browser so a crash does not lose it. **Export** writes a `.js` file, copies to the clipboard, or creates a Macro document; if a macro of the same name exists you are asked to replace it, create a new one, or cancel. **Compare** shows your draft against the lesson's reference or a saved version as a line diff with a plain explanation of the differences.

## Progress, export and import

Progress is stored per user on the Foundry server and follows you between devices. **Export** downloads a JSON file (optionally without saved projects). **Import** shows what the file contains next to what you have, validates every field (unknown keys are dropped, bad values repaired and listed), and lets you choose **merge** (keep the more advanced state of each lesson, combine attempt histories), **replace**, or **keep existing**. Nothing changes until you confirm. **Reset** asks for confirmation and cannot be undone, so export first.

## Debugging workbench

- **Broken macro library**: fifteen deliberately broken macros, one per failure category (syntax, scope, undefined names, wrong property, wrong document, permissions, async, cancelled dialog, iteration, duplicate hooks, outdated API, missing dependency, empty selection, HTML injection, faulty error recovery). Each states the symptom and the expected behaviour; repair it in the workshop.
- **Error explainer**: paste an error message. If the Academy recognises the pattern it explains the likely causes, how to investigate, and which lesson covers it; if not, it says so and gives the general method rather than guessing.
- **Hook monitor**: watch selected Foundry hooks and see each event with a short, safe summary of its arguments.
- **Object inspector**: explore the selected token's document, actor or any path from `game` as a tree without calling functions.

## Diagnostics and practice fixtures

The Diagnostics view shows the Foundry and system versions, the active adapter and its capabilities, which optional modules are detected (and whether their API surface is present), your permissions, Web Worker availability and any warnings. **Copy report** puts a text report on the clipboard for bug reports; it contains no secrets.

**Practice fixtures** (GM only): the Academy creates an Actor folder "Academy Practice" with five actors and a scene "Academy Practice Yard" with six tokens, all flagged as fixtures. **Reset** restores them to their starting values and **Clean up** deletes them. Only flagged documents are ever touched; the dialog lists exactly what will be created before anything happens.

## Settings

| Setting | Scope | Effect |
|---|---|---|
| Who may use the academy | World | GM only (default) or everyone |
| Allow players to run code live | World | Off by default; even when on, Foundry's *Use Script Macros* permission still applies |
| Show system-specific lessons | World | Hide dnd5e lessons on other systems |
| Default learning mode | User | Guided, Workshop or Challenge |
| Editor font size | User | 10–24 px |
| Require assessment for completion | User | Checkpoints gate lesson completion (default on) |
| Record assisted completions | User | Record solution reveals as assisted (default on); with it off, revealed solutions do not mark exercises assisted |
| Notifications | User | Toasts for achievements and completions |
| On open | User | Dashboard or resume the last lesson |
| Export includes projects | User | Include saved project code in exports |
| Live execution warning | User | Every run (default) or once per session |

## Keyboard shortcuts

Alt + Shift + A opens or closes the Academy; Ctrl + Enter runs the editor's code; Ctrl + S saves the draft; `/academy` in chat opens the window. All controls are reachable by keyboard; the window announces results in a live region and respects reduced-motion preferences.
