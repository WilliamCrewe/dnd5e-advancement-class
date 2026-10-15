import { MODULE_ID, PATH_TYPE } from "../constants.mjs";

const { SubclassFlow } = dnd5e.applications.advancement;
const { CompendiumBrowser } = dnd5e.applications;

/**
 * Inline application that presents the player with a choice of Advancement
 * Path during advancement. Adapted from `SubclassFlow`.
 */
export default class AdvancementPathFlow extends SubclassFlow {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["advancement-path"],
    actions: {
      browse: AdvancementPathFlow.#browseCompendium,
      deleteItem: AdvancementPathFlow.#deleteItem
    }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: {
      template: `modules/${MODULE_ID}/templates/path-flow.hbs`
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContentContext(context, options) {
    context.path = this.advancement.value.document;
    return context;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle opening the compendium browser and displaying the result.
   * @this {AdvancementPathFlow}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #browseCompendium(event, target) {
    const filters = {
      locked: {
        additional: { class: { [this.item.identifier]: 1 } },
        types: new Set([PATH_TYPE])
      }
    };
    const result = await CompendiumBrowser.selectOne({ filters }, this.manager?._detachOptions());
    if ( result ) {
      await this.advancement.apply(this.level, { uuid: result });
      this.render();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle removing a selected item.
   * @this {AdvancementPathFlow}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   */
  static async #deleteItem(event, target) {
    await this.advancement.reverse();
    this.retainedData = null;
    this.render();
  }

  /* -------------------------------------------- */
  /*  Form Handling                               */
  /* -------------------------------------------- */

  /** @override */
  async _handleForm(event, form, formData) {}

  /* -------------------------------------------- */
  /*  Drag & Drop                                 */
  /* -------------------------------------------- */

  /**
   * Handle dropping an Advancement Path onto the flow.
   * @param {DragEvent} event  The concluding drag event.
   * @protected
   */
  async _onDrop(event) {
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }

    if ( data.type !== "Item" ) return;
    const item = await Item.implementation.fromDropData(data);

    // Ensure the dropped item is an Advancement Path
    if ( item.type !== PATH_TYPE ) {
      ui.notifications.warn("ADVANCEMENT_CLASSES.Advancement.Path.InvalidType", { localize: true });
      return;
    }

    this.advancement.apply(this.level, { uuid: item.uuid });
    this.render();
  }
}
