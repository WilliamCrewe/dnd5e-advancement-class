import { CLASS_TYPE, MODULE_ID, PATH_TYPE, SETTING_MAX_STAGE } from "../constants.mjs";

const { AdvancementManager } = dnd5e.applications.advancement;

/**
 * AdvancementManager specialized for Advancement Classes.
 *
 * Differences from the base manager:
 * - Progression axis is the item's Stage (`system.levels`), never character level.
 * - Race and unrelated character-level item flows are not re-applied on
 *   Stage changes; only flows for the Advancement Class itself, its
 *   Advancement Path, and items rooted in that chain are processed.
 * - Subtitles display "Stage N".
 */
export default class AdvancementClassManager extends AdvancementManager {

  /** @inheritDoc */
  constructor(actor, options={}) {
    super(actor, options);
    // The base `#synthesizeSteps` iterates `clone.system.details.level` when
    // constructing reverse steps for items deleted mid-flow. Advancement
    // Stages can exceed character level, so bump the clone's level to cover
    // the full stage range.
    const details = this.clone.system.details;
    if ( details && (details.level < this.constructor.maxStage) ) {
      this.clone.updateSource({ "system.details.level": this.constructor.maxStage });
    }
  }

  /* -------------------------------------------- */

  /** Maximum stage configured for the module. */
  static get maxStage() {
    return game.settings.get(MODULE_ID, SETTING_MAX_STAGE);
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static forNewItem(actor, itemData, options={}) {
    if ( itemData.type !== CLASS_TYPE ) return super.forNewItem(actor, itemData, options);
    const manager = new this(actor, options);

    // Add item to clone & get new instance from clone
    const dataClone = foundry.utils.deepClone(itemData);
    dataClone._id = foundry.utils.randomID();
    dataClone.system.levels = 0;
    manager.clone.updateSource({ items: [dataClone] });
    const clonedItem = manager.clone.items.get(dataClone._id);

    return manager.createLevelChangeSteps(clonedItem, itemData.system?.levels ?? 1);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static forDeletedItem(actor, itemId, options={}) {
    const manager = new this(actor, options);
    const clonedItem = manager.clone.items.get(itemId);
    if ( !clonedItem ) return manager;

    if ( clonedItem.type === CLASS_TYPE ) {
      return manager.createLevelChangeSteps(clonedItem, clonedItem.system.levels * -1);
    }

    // All other items, just create some flows down from current level
    Array.fromRange(this.currentLevel(clonedItem, manager.clone) + 1)
      .flatMap(l => this.flowsForLevel(clonedItem, l))
      .reverse()
      .forEach(flow => manager.steps.push({ type: "reverse", flow, automatic: true }));

    if ( manager.steps.length ) manager.steps.push({ type: "delete", item: clonedItem, automatic: true });
    return manager;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @inheritDoc */
  get subtitle() {
    const parts = [];

    const item = this.step?.flow?.item;
    if ( item ) parts.push(item.name);

    // Stage of the current step
    let level = this.step?.flow?.level;
    if ( this.step?.class && [CLASS_TYPE, PATH_TYPE].includes(item?.type) ) {
      level = this.step.class.level;
    }
    if ( level ) {
      const stageNames = this.step?.class?.item?.system?.stageNames ?? item?.system?.stageNames;
      const name = stageNames?.[String(level)];
      const label = game.i18n.format("ADVANCEMENT_CLASSES.Stage", { stage: level });
      parts.push(name ? `${label} - ${name}` : label);
    }

    // Step Count
    const visibleSteps = this.steps.filter(s => !s.automatic);
    const visibleIndex = visibleSteps.indexOf(this.step);
    if ( visibleIndex >= 0 ) parts.push(game.i18n.format("DND5E.ADVANCEMENT.Manager.Steps", {
      current: visibleIndex + 1,
      total: visibleSteps.length
    }));

    return parts.join(" • ");
  }

  /* -------------------------------------------- */
  /*  Step Creation                               */
  /* -------------------------------------------- */

  /** @inheritDoc */
  createLevelChangeSteps(classItem, levelDelta) {
    const pushSteps = (flows, data) => this.steps.push(...flows.map(flow => ({ flow, ...data })));

    // Only items rooted in this Advancement Class (or its Path) contribute
    // flows, evaluated at the class's Stage.
    const getItemFlows = classLevel => this.clone.items.contents.flatMap(i => {
      if ( [CLASS_TYPE, PATH_TYPE, "class", "subclass", "race"].includes(i.type) ) return [];
      const root = i.system.advancementRootItem;
      if ( ![CLASS_TYPE, PATH_TYPE].includes(root?.type) || !i.system.advancementClassLinked ) return [];
      const rootClass = root.type === CLASS_TYPE ? root : root.advancementClass;
      if ( rootClass !== classItem ) return [];
      return this.constructor.flowsForLevel(i, classLevel);
    });

    const characterLevel = this.actor.system.details?.level ?? 0;

    // Stage increased
    for ( let offset = 1; offset <= levelDelta; offset++ ) {
      const classLevel = classItem.system.levels + offset;
      const stepData = {
        type: "forward", class: { item: classItem, level: classLevel }, level: characterLevel
      };
      pushSteps(this.constructor.flowsForLevel(classItem, classLevel), stepData);
      pushSteps(this.constructor.flowsForLevel(classItem.advancementPath, classLevel), stepData);
      pushSteps(getItemFlows(classLevel), stepData);
    }

    // Stage decreased
    for ( let offset = 0; offset > levelDelta; offset-- ) {
      const classLevel = classItem.system.levels + offset;
      const stepData = {
        type: "reverse", class: { item: classItem, level: classLevel }, automatic: true, level: characterLevel
      };
      pushSteps(getItemFlows(classLevel).reverse(), stepData);
      pushSteps(this.constructor.flowsForLevel(classItem.advancementPath, classLevel).reverse(), stepData);
      pushSteps(this.constructor.flowsForLevel(classItem, classLevel).reverse(), stepData);
      if ( classLevel === 1 ) this.steps.push({ type: "delete", item: classItem, automatic: true });
    }

    // Ensure the class stage ends up at the appropriate point
    this.steps.push({
      type: "forward", automatic: true,
      class: { item: classItem, level: classItem.system.levels += levelDelta },
      level: characterLevel
    });

    return this;
  }
}
