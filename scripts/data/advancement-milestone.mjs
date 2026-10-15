import { MODULE_ID } from "../constants.mjs";

const { ItemDataModel } = dnd5e.dataModels.abstract;
const { ItemDescriptionTemplate } = dnd5e.dataModels.item;

const { BooleanField, NumberField, SchemaField, SetField, StringField } = foundry.data.fields;

/**
 * Data definition for Advancement Milestone items — per-stage goals granted
 * by an Advancement Class (usually via ItemGrant). A character may not gain
 * the next Stage while any milestone remains.
 *
 * Completion semantics:
 * - `manual`:    any owner may complete (delete) the milestone.
 * - `counter`:   `progress.value` must reach `progress.max` first.
 * - `gmConfirm`: only a GM may complete the milestone.
 * - `calling`:   like `manual`, but completing commits to one of a mutually
 *                exclusive set of alternatives. Every milestone sharing
 *                `calling.choiceSet` on the same actor is deleted, and the
 *                completer is offered a reward item (e.g. a Gift).
 */
export default class AdvancementMilestoneData extends ItemDataModel.mixin(ItemDescriptionTemplate) {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @override */
  static LOCALIZATION_PREFIXES = ["ADVANCEMENT_CLASSES.MILESTONE", "DND5E.SOURCE"];

  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    return this.mergeSchema(super.defineSchema(), {
      milestoneType: new StringField({
        required: true, initial: "manual", choices: ["manual", "counter", "gmConfirm", "calling"],
        label: "ADVANCEMENT_CLASSES.Milestone.Type.Label"
      }),
      progress: new SchemaField({
        value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        max: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 })
      }),
      calling: new SchemaField({
        choiceSet: new StringField({ required: false, blank: true }),
        choiceKey: new StringField({ required: false, blank: true }),
        giftSource: new StringField({ required: false, blank: true }),
        giftTiers: new SetField(new StringField({ choices: ["minor", "major", "grand"] }), {
          required: false, initial: ["minor"]
        })
      }),
      tracking: new SchemaField({
        event: new StringField({ required: false, blank: true }),
        uniqueTargets: new BooleanField({ required: false, initial: false }),
        seen: new SetField(new StringField(), { required: false })
      })
    });
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * The Stage at which this milestone was granted, resolved from the
   * advancement that created it, if any.
   * @type {number|null}
   */
  get associatedStage() {
    const origin = this.parent.getFlag("dnd5e", "advancementOrigin");
    if ( !origin ) return null;
    const [rootId, , advancementId] = origin.split(".");
    const root = this.parent.actor?.items.get(rootId);
    return root?.system.advancement?.get(advancementId)?.level ?? null;
  }

  /* -------------------------------------------- */

  /**
   * Other Calling milestones on the same actor sharing this milestone's
   * `choiceSet`. Empty unless `milestoneType` is "calling".
   * @type {Item5e[]}
   */
  get callingSiblings() {
    if ( this.milestoneType !== "calling" ) return [];
    const set = this.calling.choiceSet;
    if ( !set || !this.parent.isEmbedded ) return [];
    return this.parent.actor.items.filter(i =>
      (i !== this.parent) && (i.type === this.parent.type)
      && (i.system.milestoneType === "calling")
      && (i.system.calling.choiceSet === set)
    );
  }

  /* -------------------------------------------- */

  /**
   * Whether this milestone's requirements are fulfilled and it can be
   * completed. GM-confirmation milestones are always completable by the GM;
   * this reflects mechanical completion only.
   * @type {boolean}
   */
  get fulfilled() {
    if ( this.milestoneType === "counter" ) return this.progress.value >= this.progress.max;
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Whether the given user may complete this milestone.
   * @param {User} user
   * @returns {boolean}
   */
  canComplete(user) {
    if ( this.milestoneType === "gmConfirm" ) return user.isGM;
    return this.fulfilled;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async getSheetData(context) {
    context.subtitles = [{ label: game.i18n.localize("TYPES.Item.advancement-classes.advancement-milestone") }];
    context.singleDescription = true;
    context.parts = [`${MODULE_ID}.details-milestone`];
    const typeKeys = { manual: "Manual", counter: "Counter", gmConfirm: "GMConfirm", calling: "Calling" };
    context.milestoneTypes = ["manual", "counter", "gmConfirm", "calling"].map(value => ({
      value, label: game.i18n.localize(`ADVANCEMENT_CLASSES.Milestone.Type.${typeKeys[value]}`)
    }));
    context.giftTiers = ["minor", "major", "grand"].map(value => ({
      value,
      label: game.i18n.localize(`ADVANCEMENT_CLASSES.Milestone.Calling.Tier.${value.capitalize()}`),
      checked: this.calling.giftTiers.has(value)
    }));
  }
}
