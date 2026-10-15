import AdvancementClassManager from "../applications/advancement-class-manager.mjs";
import { ACTOR_FLAG, MILESTONE_TYPE, MODULE_ID, SETTING_ENABLED } from "../constants.mjs";

const { renderTemplate } = foundry.applications.handlebars;
const PILLS_TEMPLATE = `modules/${MODULE_ID}/templates/advancement-classes.hbs`;

/**
 * Register DOM-level integrations on the character sheet:
 * - Advancement Class pills injected after the classes row on Features
 * - Stage selector + milestone actions
 * - Per-character toggle injected into Special Traits > Class
 */
export function registerSheetUI() {
  Hooks.on("renderCharacterActorSheet", onRenderCharacterSheet);
  registerSheetActions();
}

/* -------------------------------------------- */

function onRenderCharacterSheet(app, element, context, options) {
  if ( !game.settings.get(MODULE_ID, SETTING_ENABLED) ) return;
  if ( app.actor?.type !== "character" ) return;
  injectToggle(app, element);
  if ( app.actor.getFlag("dnd5e", ACTOR_FLAG) ) {
    void injectPills(app, element, context);
    bindStageSelector(app, element);
  }
}

/* -------------------------------------------- */
/*  Pills                                       */
/* -------------------------------------------- */

async function injectPills(app, element, context) {
  const featuresTab = element.querySelector('[data-tab="features"]');
  const classesSection = featuresTab?.querySelector("section.classes");
  if ( !classesSection || featuresTab.querySelector("section.advancement-classes") ) return;

  const html = await renderTemplate(PILLS_TEMPLATE, {
    ...context,
    editable: context.editable ?? app.isEditable
  });
  classesSection.insertAdjacentHTML("afterend", html);
}

/* -------------------------------------------- */

function bindStageSelector(app, element) {
  element.querySelectorAll("select.advancement-stage-selector").forEach(select => {
    if ( select.dataset.acBound ) return;
    select.dataset.acBound = "1";
    select.addEventListener("change", event => onStageChange(app, event));
  });
}

async function onStageChange(app, event) {
  const select = event.currentTarget;
  const item = app.actor.items.get(select.dataset.itemId);
  const delta = Number(select.value);
  if ( !item || !delta ) return;

  // Milestone gate: characters may only gain a Stage with no outstanding milestones
  if ( (delta > 0) && app.actor.items.some(i => i.type === MILESTONE_TYPE) ) {
    ui.notifications.warn("ADVANCEMENT_CLASSES.Sheet.CannotAdvance", { localize: true });
    select.value = "0";
    return;
  }

  const manager = AdvancementClassManager.forLevelChange(app.actor, item.id, delta);
  if ( manager.steps.length ) {
    if ( delta > 0 ) {
      manager.render({ force: true });
    } else {
      try {
        const shouldRemove = await dnd5e.applications.advancement.AdvancementConfirmationDialog
          .forLevelDown(item, { sheet: app });
        if ( shouldRemove ) manager.render({ force: true });
      } catch { /* cancelled */ }
    }
  } else {
    await item.update({ "system.levels": item.system.levels + delta });
  }
  select.value = "0";
}

/* -------------------------------------------- */
/*  Special Traits Toggle                       */
/* -------------------------------------------- */

function injectToggle(app, element) {
  const tab = element.querySelector('[data-tab="specialTraits"]');
  const fieldset = tab?.querySelector("fieldset.card");
  if ( !fieldset || fieldset.querySelector("[data-ac-toggle]") ) return;

  const disabled = app._mode === app.constructor.MODES?.PLAY;
  const value = app.actor.getFlag("dnd5e", ACTOR_FLAG);

  const group = document.createElement("div");
  group.className = "form-group";
  group.dataset.acToggle = "1";

  const label = document.createElement("label");
  label.textContent = game.i18n.localize("ADVANCEMENT_CLASSES.Flags.Enabled.Name");

  const fields = document.createElement("div");
  fields.className = "form-fields";
  const checkbox = document.createElement("dnd5e-checkbox");
  checkbox.name = `flags.dnd5e.${ACTOR_FLAG}`;
  checkbox.checked = !!value;
  checkbox.disabled = disabled;
  fields.appendChild(checkbox);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = game.i18n.localize("ADVANCEMENT_CLASSES.Flags.Enabled.Hint");

  group.append(label, fields, hint);
  fieldset.appendChild(group);
}

/* -------------------------------------------- */
/*  Sheet Actions                               */
/* -------------------------------------------- */

/**
 * Add module actions to the character sheet's action map. Milestone
 * completion itself reuses the built-in `deleteDocument` action.
 */
function registerSheetActions() {
  const options = dnd5e.applications.actor.CharacterActorSheet.DEFAULT_OPTIONS;
  options.actions = {
    ...options.actions,
    async advancementClassesMilestoneIncrement(event, target) {
      const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
      if ( item?.type !== MILESTONE_TYPE ) return;
      const max = item.system.progress.max;
      const value = Math.min(item.system.progress.value + 1, max);
      await item.update({ "system.progress.value": value });
    },
    async advancementClassesMilestoneDecrement(event, target) {
      const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
      if ( item?.type !== MILESTONE_TYPE ) return;
      const value = Math.max(item.system.progress.value - 1, 0);
      await item.update({ "system.progress.value": value });
    },
    async advancementClassesOpenJournal(event, target) {
      const doc = await fromUuid(target.dataset.uuid);
      doc?.sheet?.render(true);
    }
  };
}
