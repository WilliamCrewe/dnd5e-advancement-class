import { CLASS_TYPE, MILESTONE_TYPE, MODULE_ID, SETTING_STAGE_CARD } from "../constants.mjs";

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Register document-level hooks: Stage-change detection for the
 * `advancementClasses.stageChanged` hook + chat card, and milestone
 * completion guards.
 */
export function registerDocumentHooks() {
  Hooks.on("preUpdateItem", stashStage);
  Hooks.on("updateItem", onStageChanged);
  Hooks.on("updateItem", promptMilestoneCompletion);
  Hooks.on("preDeleteItem", guardMilestoneDeletion);
}

/* -------------------------------------------- */
/*  Stage Changes                               */
/* -------------------------------------------- */

function stashStage(item, changed, options, userId) {
  if ( (item.type !== CLASS_TYPE) || !("levels" in (changed.system ?? {})) ) return;
  options[MODULE_ID] ??= {};
  options[MODULE_ID].previousStage = item.system.levels;
}

async function onStageChanged(item, changed, options, userId) {
  if ( item.type !== CLASS_TYPE ) return;
  // Bulk updates share one options object across every item in the batch, so
  // a stashed previousStage can leak to unrelated documents. Confirm this
  // update is the one that actually changed levels.
  if ( !foundry.utils.hasProperty(changed, "system.levels") ) return;
  const previous = options[MODULE_ID]?.previousStage;
  if ( previous === undefined ) return;
  const current = item.system.levels;
  if ( previous === current ) return;

  /**
   * Fires when an Advancement Class changes Stage.
   * @param {Actor5e} actor      The owning actor.
   * @param {Item5e} item        The Advancement Class item.
   * @param {number} previous    The prior Stage.
   * @param {number} current     The new Stage.
   */
  Hooks.callAll(`${MODULE_ID}.stageChanged`, item.actor, item, previous, current);

  if ( !game.settings.get(MODULE_ID, SETTING_STAGE_CARD) ) return;
  if ( userId !== game.user.id ) return;

  const stageName = item.system.stageNames?.[String(current)];
  const key = stageName ? "ADVANCEMENT_CLASSES.Chat.StageUpName" : "ADVANCEMENT_CLASSES.Chat.StageUp";
  const content = await renderTemplate(`modules/${MODULE_ID}/templates/chat/stage-up.hbs`, {
    actor: item.actor,
    item,
    previous,
    current,
    stageName,
    message: game.i18n.format(key, {
      actor: item.actor?.name ?? "",
      class: item.name,
      stage: game.i18n.format("ADVANCEMENT_CLASSES.Stage", { stage: current }),
      name: stageName
    })
  });
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: item.actor }),
    flags: { [MODULE_ID]: { stageChanged: { item: item.id, previous, current } } }
  });
}

/* -------------------------------------------- */
/*  Milestone Guards                            */
/* -------------------------------------------- */

/**
 * When a counter milestone's progress is set to its maximum — by the sheet
 * +/- actions, editing the item directly, or any other source — offer the
 * responsible user the completion confirmation.
 */
function promptMilestoneCompletion(item, changed, options, userId) {
  if ( (item.type !== MILESTONE_TYPE) || (item.system.milestoneType !== "counter") ) return;
  if ( userId !== game.user.id ) return;
  if ( !foundry.utils.hasProperty(changed, "system.progress.value") ) return;
  if ( item.system.progress.value < item.system.progress.max ) return;
  void item.deleteDialog();
}

/**
 * Completing a milestone means deleting it. Counter milestones must reach
 * their required progress; GM-confirm milestones may only be removed by a
 * GM. Advancement-manager reversals and explicit API calls bypass.
 */
function guardMilestoneDeletion(item, options, userId) {
  if ( item.type !== MILESTONE_TYPE ) return;
  if ( options[MODULE_ID]?.bypass || options.isAdvancement ) return;

  const user = game.users.get(userId);
  if ( !item.system.canComplete(user) ) {
    const key = item.system.milestoneType === "gmConfirm"
      ? "ADVANCEMENT_CLASSES.Milestone.GMOnly"
      : "ADVANCEMENT_CLASSES.Milestone.IncompleteWarn";
    ui.notifications.warn(key, { localize: true });
    return false;
  }
}
