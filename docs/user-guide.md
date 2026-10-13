# User guide

## Opening the importer
Actors or Items sidebar → **Import Stat Block**. GMs always can; players can when *Allow player imports* is on.

## Importing
1. **Source**: paste text or upload `.txt`, `.md`, `.json`, `.csv`, `.html`. The detected format and content kind are shown; override the kind if detection is wrong. Several stat blocks, items or spells can be pasted at once.
2. **Parse & Preview**: every document to be created is listed with extracted statistics, features and actions (keeping action / bonus / reaction / legendary categories), effects, and mechanics. Each mechanic shows its trigger, implementation (native, Active Effect, integration, module runtime, macro, or unresolved/manual), required modules, confidence and limitations. Untick a mechanic to import without it. Mechanics flagged *Needs review* must be accepted (✓) or kept as description only (⊘).
3. **Options**: destination (World, an Actor you own, Staging folder; GMs can also name a folder), duplicate policy, attach automation, generate interactive macros (GM policy permitting). The integrations table shows what was detected.
4. **Import**: creates documents in controlled batches. Failures roll back what this import created. The **Report** lists created/updated/skipped documents (click to open), mechanics implemented and verified, mechanics needing review, unsupported mechanics kept as description, placeholders to replace, warnings, and a diagnostics copy button.

## Reimporting
Re-importing the same source is detected (content fingerprint or source id). Choose *Create copy*, *Skip*, *Update existing* (replaces data, keeps the document) or *Merge* (keeps your edited description, updates mechanics). Automation never registers twice: handlers are global and read mechanics from document flags.

## Players vs GMs
Players: import into Actors they own, or the staging folder if the GM allows it; cannot create macros unless the GM policy and core permission allow; cannot change module settings. GMs: all destinations, settings, review of staging content, integration configuration, logs.
