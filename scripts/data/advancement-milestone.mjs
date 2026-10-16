import { CLASS_TYPE, DEFAULT_GIFT_TIER_IDS, MODULE_ID, PATH_TYPE } from "../constants.mjs";

const { ItemDataModel } = dnd5e.dataModels.abstract;
const { ItemDescriptionTemplate } = dnd5e.dataModels.item;

const { BooleanField, NumberField, SchemaField, SetField, StringField } = foundry.data.fields;

/**
 * Data definition for Advancement Milestone items - per-stage goals granted
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
/**
 * Resolve the Advancement Class an item belongs to via its
 * `flags.dnd5e.advancementOrigin` chain: the root item is used directly if
 * it is an Advancement Class, or the class whose identifier matches
 * `system.classIdentifier` if it is an Advancement Path.
 * @param {Item5e} item
 * @returns {Item5e|null}
 */
export function owningAdvancementClass(item) {
  const actor = item?.actor;
  const origin = item?.getFlag("dnd5e", "advancementOrigin");
  const root = actor?.items.get(origin?.split(".")[0]);
  if ( root?.type === CLASS_TYPE ) return root;
  if ( root?.type === PATH_TYPE ) {
    return actor.items.find(
      i => (i.type === CLASS_TYPE) && (i.identifier === root.system.classIdentifier)
    ) ?? null;
  }
  return null;
}

/**
 * The gift-tier definitions an Advancement Class offers: a map of tier id to
 * `{ label, sort, requires }` ordered by ascending `sort`. Falls back to the
 * default tier ids when `cls` is null.
 * @param {Item5e|null} cls
 * @param {Set<string>|string[]} [extra]  Additional tier ids to include.
 * @returns {{id: string, label: string, sort: number, requires: object}[]}
 */
export function giftTierDefinitions(cls, extra = []) {
  const tiers = cls?.system.gifts?.tiers ?? {};
  const ids = new Set(Object.keys(tiers));
  if ( !cls ) for ( const id of DEFAULT_GIFT_TIER_IDS ) ids.add(id);
  for ( const id of extra ) ids.add(id);
  return [...ids]
    .map(id => ({
      id,
      label: tiers[id]?.label ?? id.capitalize(),
      sort: tiers[id]?.sort ?? null,
      requires: tiers[id]?.requires ?? {}
    }))
    .sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id, game.i18n.lang));
}

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
        giftTiers: new SetField(new StringField(), {
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
   * The Advancement Class this milestone was granted by, resolved through
   * `flags.dnd5e.advancementOrigin` (directly for class grants, through the
   * path's `classIdentifier` for path grants).
   * @type {Item5e|null}
   */
  get owningClass() {
    return owningAdvancementClass(this.parent);
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
    context.giftTiers = giftTierDefinitions(this.owningClass, this.calling.giftTiers).map(tier => ({
      value: tier.id,
      label: tier.label,
      checked: this.calling.giftTiers.has(tier.id)
    }));
  }
}
