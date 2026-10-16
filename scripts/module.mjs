import AdvancementClassManager from "./applications/advancement-class-manager.mjs";
import AdvancementClassItemSheet from "./applications/advancement-class-sheet.mjs";
import AdvancementPathAdvancement from "./advancement-path.mjs";
import {
  CLASS_TYPE, GIFT_TYPE, MILESTONE_TYPE, MODULE_ID, PATH_ADVANCEMENT_TYPE, PATH_TYPE,
  SETTING_ENABLED, SETTING_MAX_STAGE, SETTING_STAGE_CARD
} from "./constants.mjs";
import AdvancementClassData from "./data/advancement-class.mjs";
import AdvancementGiftData from "./data/advancement-gift.mjs";
import AdvancementMilestoneData from "./data/advancement-milestone.mjs";
import AdvancementPathData from "./data/advancement-path.mjs";
import { applyPatches } from "./patches.mjs";
import { registerTracking, track } from "./tracking.mjs";
import { registerTransformInjection } from "./transform.mjs";
import { commitCalling } from "./ui/calling.mjs";
import { registerSheetUI } from "./ui/features-tab.mjs";
import { registerDocumentHooks } from "./ui/stage-change.mjs";

/* -------------------------------------------- */
/*  Module Initialization                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  // Custom item data models
  Object.assign(CONFIG.Item.dataModels, {
    [CLASS_TYPE]: AdvancementClassData,
    [PATH_TYPE]: AdvancementPathData,
    [MILESTONE_TYPE]: AdvancementMilestoneData,
    [GIFT_TYPE]: AdvancementGiftData
  });

  // Advancement type registration
  CONFIG.DND5E.advancementTypes[PATH_ADVANCEMENT_TYPE] = {
    documentClass: AdvancementPathAdvancement,
    validItemTypes: new Set([CLASS_TYPE])
  };
  const validItemTypes = {
    AbilityScoreImprovement: [CLASS_TYPE, PATH_TYPE],
    HitPoints: [CLASS_TYPE],
    ItemChoice: [CLASS_TYPE, PATH_TYPE],
    ItemGrant: [CLASS_TYPE, PATH_TYPE],
    ModifyItem: [CLASS_TYPE, PATH_TYPE],
    ScaleValue: [CLASS_TYPE, PATH_TYPE],
    Trait: [CLASS_TYPE, PATH_TYPE]
  };
  for ( const [type, additions] of Object.entries(validItemTypes) ) {
    const entry = CONFIG.DND5E.advancementTypes[type];
    for ( const t of additions ) entry?.validItemTypes?.add(t);
  }
  dnd5e.documents.advancement.ItemGrantAdvancement.VALID_TYPES.add(MILESTONE_TYPE);
  dnd5e.documents.advancement.ItemGrantAdvancement.VALID_TYPES.add(GIFT_TYPE);

  // Sheets: Advancement Class items get a dedicated ItemSheet5e subclass so
  // the Gift Tier actions are scoped to our sheet rather than injected into
  // every item sheet's shared action map.
  Items.registerSheet(MODULE_ID, AdvancementClassItemSheet, {
    types: [CLASS_TYPE], makeDefault: true
  });

  // Settings
  game.settings.register(MODULE_ID, SETTING_ENABLED, {
    name: "ADVANCEMENT_CLASSES.Settings.Enabled.Name",
    hint: "ADVANCEMENT_CLASSES.Settings.Enabled.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, SETTING_MAX_STAGE, {
    name: "ADVANCEMENT_CLASSES.Settings.MaxStage.Name",
    hint: "ADVANCEMENT_CLASSES.Settings.MaxStage.Hint",
    scope: "world", config: true, type: Number, default: 10, range: { min: 1, max: 20, step: 1 }
  });
  game.settings.register(MODULE_ID, SETTING_STAGE_CARD, {
    name: "ADVANCEMENT_CLASSES.Settings.StageCard.Name",
    hint: "ADVANCEMENT_CLASSES.Settings.StageCard.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });

  // Integration
  applyPatches();
  registerSheetUI();
  registerDocumentHooks();
  registerTracking();
  registerTransformInjection();

  // Public API
  game.advancementClasses = {
    AdvancementClassManager,
    /**
     * Complete (remove) a milestone, bypassing mode restrictions.
     * @param {Item5e} item
     */
    completeMilestone: item => item.delete({ [MODULE_ID]: { bypass: true } }),
    /**
     * Begin the commitment flow for a Calling milestone.
     * @param {Item5e} item
     */
    commitCalling,
    /**
     * Emit a milestone tracking event. See scripts/tracking.mjs for the
     * event vocabulary.
     */
    track
  };

  // Handlebars partials (details tabs for the custom item sheets)
  foundry.applications.handlebars.loadTemplates({
    [`${MODULE_ID}.details-class`]: `modules/${MODULE_ID}/templates/details-class.hbs`,
    [`${MODULE_ID}.details-path`]: `modules/${MODULE_ID}/templates/details-path.hbs`,
    [`${MODULE_ID}.details-milestone`]: `modules/${MODULE_ID}/templates/details-milestone.hbs`,
    [`${MODULE_ID}.details-gift`]: `modules/${MODULE_ID}/templates/details-gift.hbs`,
    [`${MODULE_ID}.column-milestone`]: `modules/${MODULE_ID}/templates/columns/milestone-progress.hbs`
  });
});
