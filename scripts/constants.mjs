export const MODULE_ID = "advancement-classes";

export const CLASS_TYPE = `${MODULE_ID}.advancement-class`;
export const PATH_TYPE = `${MODULE_ID}.advancement-path`;
export const MILESTONE_TYPE = `${MODULE_ID}.advancement-milestone`;

/** Key registered in CONFIG.DND5E.advancementTypes for the path-selection advancement. */
export const PATH_ADVANCEMENT_TYPE = "AdvancementPath";

/**
 * Per-character flag controlling visibility of the Advancement Class UI.
 * Stored under the dnd5e namespace so the sheet's `_processFormData` handles
 * falsy-flag cleanup identically to system character flags.
 */
export const ACTOR_FLAG = "advancementClasses";
export const ACTOR_FLAG_PATH = `flags.dnd5e.${ACTOR_FLAG}`;

export const SETTING_ENABLED = "enabled";
export const SETTING_MAX_STAGE = "maxStage";
export const SETTING_STAGE_CARD = "stageUpChatCard";

export const MAX_STAGE_DEFAULT = 10;

/** Origin group key for milestone items in the features list. */
export const MILESTONE_GROUP = "advancementMilestone";

/** Localized label shown in stage selectors/managers, e.g. "Stage 3 — Adept". */
export function stageLabel(item, stage) {
  const name = item.system.stageNames?.[String(stage)];
  const base = game.i18n.format("ADVANCEMENT_CLASSES.Stage", { stage });
  return name ? `${base} — ${name}` : base;
}
