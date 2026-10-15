# Advancement Classes

## Installation

In Foundry's **Install Module** dialog, paste the manifest URL:

```
https://github.com/OWNER/advancement-classes/releases/latest/download/module.json
```

(Replace `OWNER` with the GitHub account once the repo is published. The `url`, `manifest`, and `download` fields in `module.json` contain the same placeholder — and the release workflow rewrites them automatically, so the committed file is the only thing to update.)

## Releasing

Pushing a tag like `v0.1.0` triggers `.github/workflows/release.yml`, which compiles the compendium pack, stamps the tag's version/download URL into `module.json`, and publishes a GitHub release containing `module.zip` and `module.json`.

A Foundry VTT module for the dnd5e system (system 6.0.x, Foundry 14+) that adds **Advancement Classes** — class-like items with their own progression track called **Stages** (1–10) that is fully independent of normal class levels: they do not increase character level, proficiency bonus, hit dice, or spell-slot progression.

## Item Types

- **Advancement Class** — a class-like item with a 0–10 Stage track (`system.levels`), named stages, scale values, advancements, and an optional journal link.
- **Advancement Path** — the subclass analogue. Chosen through an `AdvancementPath` advancement on the class (default Stage 3); grants features at later stages.
- **Advancement Milestone** — a per-stage goal that must be completed before the character can gain the next Stage. Completion = deleting the item. Modes: `manual`, `counter` (progress tracker), `gmConfirm` (GM only).

## Usage

1. Enable the module's world setting **Enable Advancement Classes** (on by default).
2. On a character sheet, open **Special Traits → Class** and tick **Advancement Classes**.
3. On the **Features** tab, an "Add Advancement Class" pill appears while the sheet is in Edit Mode — provided every existing Advancement Class has reached Stage 10 (vacuously true with none).
4. Import the **Advancement Classes** compendium and drag the **Exemplar** advancement class onto a character (or use the add pill).

Stages are changed with the stage selector on each pill, which opens the advancement flow with the class's per-stage advancements. Milestones granted at each stage appear in the **Advancement Milestones** section and gate stage-ups until completed.

## Sample Content

The compendium pack contains **Exemplar** (advancement class, 10 named stages), **Path of Valor** (advancement path), three milestones demonstrating all modes, granted features including the charge-pool **Paragon Focus** feature backed by the `focus` scale value (`@scale.exemplar.focus`), and two spells cast via activities that consume focus charges at Spell-Points-style costs (2 / 5).

## API

- `game.advancementClasses.AdvancementClassManager` — the manager class.
- `game.advancementClasses.completeMilestone(item)` — force-complete a milestone.
- Hook: `advancementClasses.stageChanged(actor, item, previousStage, currentStage)`.

## Rebuilding the Compendium

```sh
npx @foundryvtt/foundryvtt-cli package pack advancement-classes \
  --in packs/_source/advancement-classes --out packs
```
