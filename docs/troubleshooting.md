# Troubleshooting

**The importer button is missing.** Players need *Allow player imports* enabled. The button appears in the Actors and Items sidebar headers.

**"Could not determine what kind of content this is."** Pick the content type in the Source tab. Check that the stat block starts with the name line and that the type line (e.g. `Small humanoid (goblinoid), neutral evil`) follows it.

**Abilities default to 10.** The ability table was not recognized. Supported layouts: a `STR DEX CON INT WIS CHA` header followed by `8 (-1) 14 (+2) …`, 2024 rows `STR 27 +8 +8`, or inline `STR 8 (-1) DEX 14 (+2) …`.

**A mechanic is marked "Needs review".** The text lacked a required value (DC, trigger, duration) or was ambiguous. Accept it to import the interpretation (the preview shows the assumption) or disable it to keep the description only. Nothing is invented silently.

**Extra damage shows as a separate roll.** Without Midi-QOL the system cannot tell whether the attack hit before damage is rolled, so conditional damage (e.g. "vs undead") is added as its own roll in the damage card so it can be applied selectively. Unconditional extra damage is part of the weapon's damage parts.

**Spells on a monster are placeholders.** The spell name was not found in any Item compendium or world item. Install/enable the dnd5e SRD content or create the spell, then re-import with *Update existing* or replace the placeholder manually.

**Duplicates dialog keeps appearing.** The same source was imported before (fingerprint match). Choose Create copy, Skip, Update existing or Merge; or set a default policy in settings.

**A player got redirected to the staging folder.** They chose an Actor they do not own or lack the core permission to create world documents. Staging documents carry `flags.stat-block-importer.staging` and sit in the configured folder for GM review.

**Disable automation for one item.** `item.setFlag("stat-block-importer", "automationDisabled", true)`.

**Copy diagnostics.** Report tab → *Copy diagnostics* (includes the compatibility report and the last 100 log entries). Set *Diagnostic detail* to Debug for more.
