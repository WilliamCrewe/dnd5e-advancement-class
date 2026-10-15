import AdvancementClassManager from "./applications/advancement-class-manager.mjs";
import AdvancementPathAdvancement from "./advancement-path.mjs";
import {
  CLASS_TYPE, MILESTONE_TYPE, MODULE_ID, PATH_ADVANCEMENT_TYPE, PATH_TYPE,
  SETTING_ENABLED, SETTING_MAX_STAGE, SETTING_STAGE_CARD
} from "./constants.mjs";
import AdvancementClassData from "./data/advancement-class.mjs";
import AdvancementMilestoneData from "./data/advancement-milestone.mjs";
import AdvancementPathData from "./data/advancement-path.mjs";
import { applyPatches } from "./patches.mjs";
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
    [MILESTONE_TYPE]: AdvancementMilestoneData
  });

  // Advancement type registration
  CONFIG.DND5E.advancementTypes[PATH_ADVANCEMENT_TYPE] = {
    documentClass: AdvancementPathAdvancement,
    validItemTypes: new Set([CLASS_TYPE])
  };
  const validItemTypes = {
    AbilityScoreImprovement: [CLASS_TYPE, PATH_TYPE],
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

  // Public API
  game.advancementClasses = {
    AdvancementClassManager,
    /**
     * Complete (remove) a milestone, bypassing mode restrictions.
     * @param {Item5e} item
     */
    completeMilestone: item => item.delete({ [MODULE_ID]: { bypass: true } })
  };

  // Handlebars partials (details tabs for the custom item sheets)
  foundry.applications.handlebars.loadTemplates({
    [`${MODULE_ID}.details-class`]: `modules/${MODULE_ID}/templates/details-class.hbs`,
    [`${MODULE_ID}.details-path`]: `modules/${MODULE_ID}/templates/details-path.hbs`,
    [`${MODULE_ID}.details-milestone`]: `modules/${MODULE_ID}/templates/details-milestone.hbs`
  });
});
