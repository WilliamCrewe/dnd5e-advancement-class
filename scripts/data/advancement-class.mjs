import { CLASS_TYPE, MODULE_ID, SETTING_MAX_STAGE } from "../constants.mjs";

const { ItemDataModel } = dnd5e.dataModels.abstract;
const { AdvancementTemplate, ItemDescriptionTemplate } = dnd5e.dataModels.item;

const { DocumentUUIDField, NumberField, StringField, TypedObjectField } = foundry.data.fields;

/**
 * Data definition for Advancement Class items.
 *
 * Mirrors `ClassData` but uses a separate 0–10 Stage progression stored in
 * `system.levels`. Because the type is not "class", it is excluded from
 * `details.level`, proficiency bonus, hit dice, and spell-slot progression.
 */
export default class AdvancementClassData extends ItemDataModel.mixin(
  AdvancementTemplate, ItemDescriptionTemplate
) {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["ADVANCEMENT_CLASSES.CLASS", "DND5E.SOURCE"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      levels: new NumberField({
        required: true, nullable: false, integer: true, min: 0, initial: 1,
        label: "ADVANCEMENT_CLASSES.StageLabel"
      }),
      stageNames: new TypedObjectField(new StringField({ required: true }), {
        required: false, label: "ADVANCEMENT_CLASSES.Class.StageNames", hint: "ADVANCEMENT_CLASSES.Class.StageNamesHint"
      }),
      journal: new DocumentUUIDField({
        required: false, type: "JournalEntryPage",
        label: "ADVANCEMENT_CLASSES.Class.Journal", hint: "ADVANCEMENT_CLASSES.Class.JournalHint"
      })
    });
  }

  /* -------------------------------------------- */

  /** The maximum stage permitted by module settings. */
  static get maxStage() {
    return game.settings.get(MODULE_ID, SETTING_MAX_STAGE);
  }

  /* -------------------------------------------- */

  /** @override */
  static get compendiumBrowserFilters() {
    return new Map();
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

  /** @inheritDoc */
  static _resetData(source) {
    super._resetData(source);
    delete source.levels;
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
  async getSheetData(context) {
    context.subtitles = [{ label: game.i18n.localize(`TYPES.Item.${CLASS_TYPE}`) }];
    context.singleDescription = true;
    context.parts = [`${MODULE_ID}.details-class`];
    context.maxStage = AdvancementClassData.maxStage;
    context.stageNameRows = Array.fromRange(AdvancementClassData.maxStage).map(i => {
      const stage = String(i + 1);
      return { stage, name: this.stageNames?.[stage] ?? "" };
    });
  }

  /* -------------------------------------------- */
  /*  Socket Event Handlers                       */
  /* -------------------------------------------- */

  /** @override */
  _advancementToCreate(options) {
    return [
      { type: "AdvancementPath", level: 3 },
      { type: "AbilityScoreImprovement", level: 4 },
      { type: "AbilityScoreImprovement", level: 8 }
    ];
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preCreate(data, options, user) {
    if ( (await super._preCreate(data, options, user)) === false ) return false;

    const actor = this.parent.actor;
    if ( actor ) {
      const identifier = data.system?.identifier ?? this.parent.identifier;
      const duplicate = actor.items.find(i =>
        (i.type === CLASS_TYPE) && (i !== this.parent) && (i.identifier === identifier)
      );
      if ( duplicate ) {
        ui.notifications.error("ADVANCEMENT_CLASSES.Warnings.DuplicateIdentifier", {
          format: { identifier }, localize: true
        });
        return false;
      }
    }

    await this.preCreateAdvancement(data, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    if ( (await super._preUpdate(changed, options, user)) === false ) return false;
    if ( !("levels" in (changed.system ?? {})) ) return;

    const max = AdvancementClassData.maxStage;
    if ( changed.system.levels <= 0 ) {
      ui.notifications.warn("ADVANCEMENT_CLASSES.Warnings.StageMinimum", { localize: true });
      changed.system.levels = 1;
    }
    if ( changed.system.levels > max ) {
      ui.notifications.warn("ADVANCEMENT_CLASSES.Warnings.StageMaximum", { format: { max }, localize: true });
      changed.system.levels = max;
    }
  }
}
