import { CLASS_TYPE, MODULE_ID, PATH_TYPE } from "../constants.mjs";

const { ItemDataModel } = dnd5e.dataModels.abstract;
const { AdvancementTemplate, ItemDescriptionTemplate } = dnd5e.dataModels.item;
const { IdentifierField } = dnd5e.dataModels.fields;

/**
 * Data definition for Advancement Path items — the subclass analogue for
 * Advancement Classes. Linked to its parent class through
 * `system.classIdentifier`; its advancements resolve at the parent class's
 * Stage rather than character level.
 */
export default class AdvancementPathData extends ItemDataModel.mixin(
  AdvancementTemplate, ItemDescriptionTemplate
) {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["ADVANCEMENT_CLASSES.Path", "DND5E.SOURCE"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      classIdentifier: new IdentifierField({
        required: true, types: [CLASS_TYPE],
        label: "ADVANCEMENT_CLASSES.Path.ClassIdentifier",
        hint: "ADVANCEMENT_CLASSES.Path.ClassIdentifierHint"
      })
    });
  }

  /* -------------------------------------------- */

  /** @override */
  static get compendiumBrowserFilters() {
    return new Map([
      ["class", {
        label: `TYPES.Item.${CLASS_TYPE}`,
        type: "set",
        config: {
          choices: AdvancementPathData.#classChoices,
          keyPath: "system.classIdentifier"
        }
      }]
    ]);
  }

  /* -------------------------------------------- */

  /**
   * Identifiers of Advancement Classes currently present in the world or
   * unlocked packs, for compendium browser filtering.
   */
  static get #classChoices() {
    const choices = {};
    for ( const item of game.items ?? [] ) {
      if ( item.type !== CLASS_TYPE ) continue;
      choices[item.identifier] = item.name;
    }
    return choices;
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    AdvancementTemplate.migrateAdvancement(source);
    return source;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Stages are evaluated against the linked Advancement Class rather than
   * character level.
   * @override
   */
  get advancementLevel() {
    return this.parent.advancementClass?.system.levels ?? super.advancementLevel;
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.prepareDescriptionData();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getCardData(options) {
    const context = await super.getCardData(options);
    const cls = this.parent.actor?.items.find(
      i => (i.type === CLASS_TYPE) && (i.identifier === this.classIdentifier)
    )?.name;
    if ( cls ) {
      const label = game.i18n.format("ADVANCEMENT_CLASSES.Path.Subtitle", { class: cls });
      context.subtitle = [label];
      context.properties = [
        { type: "text", text: label, identity: true },
        ...context.properties.filter(p => !p.identity)
      ];
    }
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getSheetData(context) {
    context.subtitles = [{ label: game.i18n.localize(`TYPES.Item.${PATH_TYPE}`) }];
    context.singleDescription = true;
    context.parts = [`${MODULE_ID}.details-path`];
  }
}
