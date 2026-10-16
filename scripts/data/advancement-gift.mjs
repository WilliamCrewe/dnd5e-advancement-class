import { CLASS_TYPE, MODULE_ID } from "../constants.mjs";
import { giftTierDefinitions, owningAdvancementClass } from "./advancement-milestone.mjs";

const { ItemDataModel } = dnd5e.dataModels.abstract;
const { ActivitiesTemplate, ItemDescriptionTemplate } = dnd5e.dataModels.item;

const { NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Data definition for Advancement Gift items: rewards claimed through
 * Calling milestones. Gifts are a dedicated item type (rather than feats
 * carrying module flags) so they sort into their own sheet section and
 * carry first-class schema fields instead of flags.
 *
 * - `gift.side`   Calling side this gift belongs to (e.g. "control").
 * - `gift.tier`   Tier id defined by the owning class's `system.gifts.tiers`.
 * - `gift.class`  Identifier of the owning Advancement Class.
 * - `usesMax`     Optional modifier applied to another item's uses maximum,
 *                 matched by identifier (e.g. a Control Points pool).
 */
export default class AdvancementGiftData extends ItemDataModel.mixin(
  ActivitiesTemplate, ItemDescriptionTemplate
) {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["ADVANCEMENT_CLASSES.GIFT", "DND5E.SOURCE"];

  /** @override */
  static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
    hasEffects: true
  }, { inplace: false }));

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      gift: new SchemaField({
        side: new StringField({
          required: false, blank: true,
          label: "ADVANCEMENT_CLASSES.Gift.Side"
        }),
        tier: new StringField({
          required: false, blank: true,
          label: "ADVANCEMENT_CLASSES.Gift.Tier"
        }),
        class: new StringField({
          required: false, blank: true,
          label: "ADVANCEMENT_CLASSES.Gift.ClassIdentifier"
        })
      }),
      usesMax: new SchemaField({
        target: new StringField({
          required: false, blank: true,
          label: "ADVANCEMENT_CLASSES.Gift.UsesMaxTarget"
        }),
        delta: new NumberField({
          required: false, integer: true, initial: 0,
          label: "ADVANCEMENT_CLASSES.Gift.UsesMaxDelta"
        })
      })
    });
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The Advancement Class this gift belongs to, resolved through
   * `flags.dnd5e.advancementOrigin` when granted by advancement and
   * `gift.class` otherwise.
   * @type {Item5e|null}
   */
  get owningClass() {
    return owningAdvancementClass(this.parent) ?? this.parent.actor?.items.find(
      i => (i.type === CLASS_TYPE) && (i.identifier === this.gift.class)
    ) ?? null;
  }

  /* -------------------------------------------- */
  /*  Data Migration                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static _migrateData(source) {
    super._migrateData(source);
    ActivitiesTemplate.migrateActivities(source);
    return source;
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
  prepareFinalData(rollData) {
    this.prepareFinalActivityData(this.parent.getRollData());
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getSheetData(context) {
    context.subtitles = [{ label: game.i18n.localize("TYPES.Item.advancement-classes.advancement-gift") }];
    context.singleDescription = true;
    context.parts = [`${MODULE_ID}.details-gift`];
    context.giftTiers = giftTierDefinitions(this.owningClass, [this.gift.tier])
      .map(t => ({ value: t.id, label: t.label }));
  }
}
