import AdvancementClassManager from "../applications/advancement-class-manager.mjs";
import { ACTOR_FLAG, CLASS_TYPE, MILESTONE_TYPE, MODULE_ID, SETTING_ENABLED, SETTING_MAX_STAGE } from "../constants.mjs";
import { commitCalling } from "./calling.mjs";

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
}

/* -------------------------------------------- */

function onRenderCharacterSheet(app, element, context, options) {
  if ( !game.settings.get(MODULE_ID, SETTING_ENABLED) ) return;
  if ( app.actor?.type !== "character" ) return;
  injectToggle(app, element);
  bindSheetActions(app, element);
  if ( app.actor.getFlag("dnd5e", ACTOR_FLAG) ) {
    void injectPills(app, element, context)
      .then(() => bindStageSelector(app, element));
  }
}

/* -------------------------------------------- */
/*  Pills                                       */
/* -------------------------------------------- */

async function injectPills(app, element, context) {
  const featuresTab = element.querySelector('[data-tab="features"]');
  const classesSection = featuresTab?.querySelector("section.classes");
  if ( !classesSection || featuresTab.querySelector("section.advancement-classes") ) return;

  // Base render context lacks part-context keys (itemCategories, sections),
  // so compute the pill data from the actor directly. `itemContext` IS in the
  // base context, so per-item ctx (stage pips, names) resolves via
  // dnd5e-itemContext.
  const actor = app.actor;
  const max = game.settings.get(MODULE_ID, SETTING_MAX_STAGE);
  const advancementClasses = actor.items
    .filter(i => i.type === CLASS_TYPE)
    .sort((lhs, rhs) => rhs.system.levels - lhs.system.levels);
  const showDrop = app.isEditMode && advancementClasses.every(c => c.system.levels >= max);

  const html = await renderTemplate(PILLS_TEMPLATE, {
    ...context,
    advancementClasses,
    showAdvancementClassDrop: showDrop,
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
 * Bind delegated click handlers for module controls rendered inside the
 * character sheet (milestone counter/complete buttons, journal links).
 * Controls carry `data-ac-action` so the system's action dispatcher ignores
 * them; binding here keeps the system's shared action map untouched.
 */
function bindSheetActions(app, element) {
  if ( element.dataset.acActionsBound ) return;
  element.dataset.acActionsBound = "1";
  element.addEventListener("click", event => {
    const target = event.target.closest("[data-ac-action]");
    if ( !target || target.disabled ) return;
    void onSheetAction(app, target);
  });
}

/* -------------------------------------------- */

async function onSheetAction(app, target) {
  const item = app.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  switch ( target.dataset.acAction ) {
    case "milestoneIncrement": {
      if ( item?.type !== MILESTONE_TYPE ) return;
      const max = item.system.progress.max;
      const value = Math.min(item.system.progress.value + 1, max);
      // The updateItem hook prompts completion once progress reaches max.
      await item.update({ "system.progress.value": value });
      break;
    }
    case "milestoneDecrement": {
      if ( item?.type !== MILESTONE_TYPE ) return;
      const value = Math.max(item.system.progress.value - 1, 0);
      await item.update({ "system.progress.value": value });
      break;
    }
    case "milestoneComplete": {
      if ( item?.type !== MILESTONE_TYPE ) return;
      if ( item.system.milestoneType === "calling" ) return commitCalling(item);
      await item.deleteDialog({ sheet: app });
      break;
    }
    case "openJournal": {
      const doc = await fromUuid(target.dataset.uuid);
      doc?.sheet?.render(true);
      break;
    }
  }
}
