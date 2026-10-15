import AdvancementPathFlow from "./applications/advancement-path-flow.mjs";
import { PATH_TYPE } from "./constants.mjs";

const { LocalDocumentField } = dnd5e.dataModels.fields;
const { DocumentUUIDField } = foundry.data.fields;
const { SubclassAdvancement } = dnd5e.documents.advancement;

/**
 * Value data for the Advancement Path advancement.
 */
class AdvancementPathValueData extends foundry.abstract.DataModel {
  /** @override */
  static defineSchema() {
    return {
      document: new LocalDocumentField(foundry.documents.BaseItem),
      uuid: new DocumentUUIDField({ type: "Item" })
    };
  }
}

/**
 * Advancement that allows the player to select an Advancement Path for their
 * Advancement Class. Mirrors `SubclassAdvancement`; only allowed on
 * Advancement Class items and only taken once.
 */
export default class AdvancementPathAdvancement extends SubclassAdvancement {

  /** @inheritDoc */
  static get metadata() {
    return foundry.utils.mergeObject(super.metadata, {
      dataModels: {
        value: AdvancementPathValueData
      },
      order: 70,
      icon: "icons/svg/upgrade.svg",
      typeIcon: "systems/dnd5e/icons/svg/subclass.svg",
      title: game.i18n.localize("ADVANCEMENT_CLASSES.Advancement.Path.Title"),
      hint: game.i18n.localize("ADVANCEMENT_CLASSES.Advancement.Path.Hint"),
      apps: {
        flow: AdvancementPathFlow
      }
    });
  }

  /* -------------------------------------------- */
  /*  Display Methods                             */
  /* -------------------------------------------- */

  /** @inheritdoc */
  summaryforLevel(level, { configMode=false }={}) {
    const path = this.item.advancementPath;
    if ( configMode || !path ) return "";
    return path.toAnchor().outerHTML;
  }

  /* -------------------------------------------- */
  /*  Editing Methods                             */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static availableForItem(item) {
    return !item.advancement.byType.AdvancementPath?.length;
  }

  /* -------------------------------------------- */
  /*  Application Methods                         */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async reverse(level, options={}) {
    const item = this.value.document ?? this.item.advancementPath;
    if ( !item ) return;
    this.actor.items.delete(item.id);
    this.updateSource({ value: { document: null, uuid: null } });
    return item.toObject();
  }
}
