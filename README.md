# Advancement Classes

A Foundry VTT module for the dnd5e system (system 6.0.x, Foundry 14+) that adds **Advancement Classes**: class-like items with their own progression track called **Stages** (up to 10 by default). Stages are fully independent of normal class levels. They do not increase character level, proficiency bonus, multiclassing, spell slots, or class hit dice.

## Installation and settings

In Foundry's **Install Module** dialog, paste the manifest URL:

```
https://github.com/WilliamCrewe/dnd5e-advancement-class/releases/latest/download/module.json
```

1. Enable the world setting **Enable Advancement Classes** (on by default; GM only).
2. On a character sheet, open **Special Traits > Class** and tick **Advancement Classes** for that character.
3. On the **Features** tab, an "Add Advancement Class" drop zone appears while the sheet is in **Edit Mode**, provided every existing Advancement Class on the character has reached the maximum Stage (vacuously true with none).

Stages are changed with the stage selector on each class pill, which opens the advancement flow with the class's per-stage advancements.

## Item types

The module adds three item types, all of which support the usual item fields plus advancements:

- **Advancement Class**: a class-like item with `system.levels` as its Stage track. Fields:
  - **Identifier**: referenced by paths, gifts, and scale values.
  - **Stage Names**: optional display name per Stage (e.g. "Initiate", "Adept").
  - **Hit Die**: denomination and additional dice, consumed by Hit Points advancements.
  - **Reference Journal**: a JournalEntryPage documenting the class, linked from the sheet.
  - **Gift Tiers**: the tiers offered by Calling milestones (see below).
- **Advancement Path**: the subclass analogue. Chosen through an `AdvancementPath` advancement on the class and linked by its **Advancement Class Identifier**; its advancements resolve at the parent class's Stage.
- **Advancement Milestone**: a goal item that blocks Stage advancement while present (see below).

## Milestone types

| Type | Completion rule |
| --- | --- |
| `manual` | Any owner may complete it once its goal is met. |
| `counter` | `progress.value` must reach `progress.max` first. |
| `gmConfirm` | Only a GM may complete it. |
| `calling` | Like `manual`, but completing commits to one of a mutually exclusive set of alternatives and offers a gift. |

Progress on counter milestones is manual: players click the +/- controls, or content may drive it via the `track()` API below. Completing a milestone means deleting the item; deletion is the completion mechanic and is not gated, so an owner can always remove a milestone manually.

## Callings and Gifts

A Calling milestone carries `system.calling`: `choiceSet` (the shared key grouping alternatives), `choiceKey` (this alternative's identity), `giftSource` (a compendium pack id, or "world" for world items; blank searches everything), and `giftTiers` (the tier ids this milestone offers).

Gift items declare `flags.advancement-classes.gift = { side, tier, class }`. `side` is matched against the milestone's `choiceKey`; `tier` against `giftTiers`; `class` against the identifier of the milestone's owning Advancement Class.

Completing a Calling removes every sibling milestone sharing its `choiceSet`, then opens a picker listing eligible gifts sorted by tier (highest first). Each tier's `requires` map on the class defines how many gifts of lower tiers the actor must already hold for the tier to be offered. Granted gifts appear in a "<Class> Gifts" section on the Features tab.

### Gift tiers on the class

`system.gifts.tiers` is a map of tier id to `{ label, sort, requires }`. Lower `sort` means lower tier. `requires` maps other tier ids to minimum owned-gift counts (same side, same class). The default tiers are `minor`, `major`, and `grand` (grand requires nothing until you edit it; content modules can set e.g. `{ minor: 2, major: 2 }`). Add and delete tiers from the class sheet's Gift Tiers section.

## Flags reference

All content flags live under the `advancement-classes` namespace:

- **`gift`**: `{ side, tier, class }` on a feat-type item. Marks it as a Calling gift.
- **`transform`**: transform-time configuration on class, path, or gift items:
  - `keep`: array of keys added to the transformation's keep set (e.g. `["items", "languages", "class", "feats"]`).
  - `abilityFloor`: `{ ability, scale }` raises `ability` to the resolved `scale` value while transformed.
  - `inject`: `[{ uuid, minStage }]` items granted to the transformed actor from `minStage` onward.
  - `injectSelf`: inject the item carrying the flag itself (honors `minStage` on the same object).
  - `effects`: Active Effect data applied to the transformed actor.
- **`formAC`**: formula string on a form actor, evaluated against the host's roll data and applied as the transformed actor's flat AC.
- **`usesMax`**: `{ target, delta }` or an array of them. After uses are prepared on an item whose identifier equals `target`, `uses.max` is adjusted by the summed delta (clamped at 0) and `uses.value` is re-clamped.
- **`restRefund`**: `{ target, amount = 1, rest = "short" }` or an array. On a rest of the matching type ("short" or "long"), `uses.spent` of the actor's item identified by `target` is reduced by `amount`.

## Scale values

ScaleValue advancements on classes and paths evaluate at the owning class's Stage rather than character level. Reference them in formulas as `@scale.<itemIdentifier>.<scaleIdentifier>` (e.g. `@scale.therianthrope.control-points`). Transform item injection substitutes these references with the values resolved on the host, so injected features keep working on the transformed actor where the class items no longer exist.

## Transformation notes

- Use the Transform activity's Keep options, including Proficiency Bonus, to control what the form inherits.
- Forms need explicit `prototypeToken` width/height: `transformInto` copies token dimensions verbatim, so a Large form needs `width: 2, height: 2`.
- Polymorph creates a new actor linked to the original by `flags.dnd5e.originalActor`; milestone tracking events are redirected to the original so progress made while transformed persists on revert.

## Tracking API

`game.advancementClasses.track(actor, event)` increments any counter milestone on the actor whose `tracking.event` list matches. Event vocabulary:

- `use:<identifier>`: activity/item used
- `consume:<identifier>`: item uses spent
- `heal:<identifier>` / `damage:<identifier>`: healing/damage rolled by an activity
- `attackHit:<identifier>`: attack roll met a target's AC
- `save:<ability>` / `saveSuccess:<ability>`: saving throw rolled / succeeded
- `skill:<key>` / `skillSuccess:<key>`: skill check rolled / succeeded
- `transform` / `revert`: actor transformed / reverted

With `tracking.uniqueTargets` set, an event carrying `targets` increments once per distinct target.

Other API: `game.advancementClasses.AdvancementClassManager`, `completeMilestone(item)`, `commitCalling(item)`.

## Hooks

- `advancement-classes.stageChanged(actor, item, previousStage, currentStage)` fires on every Stage change.
- The world setting **Announce Stage Ups** posts a chat card on stage-ups.

## Creating your own Advancement Class

Two routes: author the items in Foundry and export them, or generate pack source with a script.

### In-Foundry authoring

1. In a world with the module enabled, create an **Advancement Class** item (create dialog on the Features tab, or the Items directory).
2. Configure its advancements per Stage: ItemGrant for granted features and milestone grants, ItemChoice for pick-one pools, ScaleValue for stage-scaled values, HitPoints, AbilityScoreImprovement, and an **Advancement Path** advancement for the path choice.
3. Create **Advancement Path** items with the class's identifier in **Advancement Class Identifier**, each with its own stage advancements.
4. Create **Advancement Milestone** items and grant them via ItemGrant.
5. For Callings, create calling milestones (choiceSet/choiceKey/giftSource/giftTiers) and gift feats carrying the `gift` flag, then configure the class's **Gift Tiers** on its sheet.
6. Write a JournalEntryPage describing the class and link it in the class's **Reference Journal** field.
7. Drag everything into a module compendium pack (or right-click > Export to Compendium) to ship it.

### Scripted generation

For larger content, generate pack `_source` JSON directly:

1. Create a new repository for your content module.
2. Add this repository as a git submodule at `vendor/advancement-classes`:
   `git submodule add <repo-url> vendor/advancement-classes`.
3. Write a generator that imports `tools/lib/content-builder.mjs` from the submodule; it provides deterministic id hashing, compendium folder docs, item/milestone/calling/activity factories, an NPC form factory, `writeOut`, and `packAll`.
4. Compile with `packAll(rootDir)` or the Foundry CLI (`npx @foundryvtt/foundryvtt-cli package pack <name> --in packs/_source/<name> --out packs`; `--out` is the parent directory).

### module.json essentials

A content module needs no code of its own: no `esmodules`, `styles`, or `languages`. Require the framework and system, and declare the packs:

```json
"relationships": {
  "systems": [{ "id": "dnd5e", "type": "system", "compatibility": { "minimum": "6.0.0" } }],
  "requires": [{ "id": "advancement-classes", "type": "module", "compatibility": { "minimum": "2.0.0" } }]
},
"packs": [{
  "name": "classes", "label": "Classes", "type": "Item", "path": "packs/classes",
  "flags": { "dnd5e": { "sourceBook": "<Your Book>", "types": [
    "advancement-classes.advancement-class",
    "advancement-classes.advancement-path",
    "advancement-classes.advancement-milestone",
    "feat"
  ] } }
}]
```

### The shared pack folder

Foundry merges `packFolders` with identical names across packages, so every content module can place its packs under the same top-level folder by declaring:

```json
"packFolders": [{
  "name": "Advancement Class", "color": "#4a2c6e", "sorting": "a",
  "folders": [{ "name": "<Class>", "sorting": "m", "packs": ["classes", "actors", "journals"] }]
}]
```

### Folder and sorting notes

- Compendium folders nest to a maximum depth of 3; keep the tree to `Class > Group > Leaf`.
- Use manual sorting (`"sorting": "m"`) with numeric `sort` for stage folders so they order 1 to 10.
- `packFolders` are cached per world in the `core.compendiumConfiguration` setting; if folder changes do not appear, reset it from the console:
  `await game.settings.set("core", "compendiumConfiguration", {})`.

### Worked example

The [Therianthrope module](https://github.com/WilliamCrewe/dnd5e-therianthrope-advancement) is a complete reference implementation built exactly this way.

## Releasing this module

Pushing a tag like `v2.0.0` triggers `.github/workflows/release.yml`, which stamps the tag's version and URLs into `module.json` and publishes a GitHub release containing `module.zip` and `module.json`. The framework ships no packs; content modules own their own pack compilation in their release workflows.
