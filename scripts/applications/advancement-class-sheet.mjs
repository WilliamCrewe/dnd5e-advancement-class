const { DialogV2 } = foundry.applications.api;

/**
 * Item sheet for Advancement Class items: the system's ItemSheet5e plus
 * the Gift Tier add/delete actions, registered for our type only instead
 * of injecting handlers into every item sheet's shared action map.
 */
export default class AdvancementClassItemSheet extends dnd5e.applications.item.ItemSheet5e {

  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    actions: {
      addGiftTier: AdvancementClassItemSheet.#onAddGiftTier,
      deleteGiftTier: AdvancementClassItemSheet.#onDeleteGiftTier
    }
  }, { inplace: false });

  /* -------------------------------------------- */

  /**
   * Add a new gift tier, prompting for its id.
   * @this AdvancementClassItemSheet
   */
  static async #onAddGiftTier() {
    const item = this.item;
    const tierId = await DialogV2.prompt({
      window: { title: game.i18n.localize("ADVANCEMENT_CLASSES.Class.GiftTierAdd") },
      content: `<form><div class="form-group">
        <label>${game.i18n.localize("ADVANCEMENT_CLASSES.Class.GiftTierId")}</label>
        <div class="form-fields"><input type="text" name="tierId" autofocus></div>
      </div></form>`,
      ok: { callback: (event, button) => new FormData(button.form).get("tierId") },
      rejectClose: false
    });
    const clean = String(tierId ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if ( !clean ) return;
    const tiers = item.system.gifts?.tiers ?? {};
    if ( tiers[clean] ) {
      ui.notifications.warn("ADVANCEMENT_CLASSES.Warnings.DuplicateTier", {
        format: { identifier: clean }, localize: true
      });
      return;
    }
    const maxSort = Math.max(-1, ...Object.values(tiers).map(t => t?.sort ?? 0));
    await item.update({
      [`system.gifts.tiers.${clean}`]: { label: clean.capitalize(), sort: maxSort + 1, requires: {} }
    });
  }

  /* -------------------------------------------- */

  /**
   * Delete a gift tier via `ForcedDeletion` data-field operators on the
   * TypedObjectField, also stripping dangling `requires` references.
   * @this AdvancementClassItemSheet
   */
  static async #onDeleteGiftTier(event, target) {
    const item = this.item;
    const tierId = target.dataset.tierId;
    if ( !tierId ) return;
    if ( Object.keys(item.system.gifts?.tiers ?? {}).length <= 1 ) {
      ui.notifications.warn("ADVANCEMENT_CLASSES.Warnings.LastTier", { localize: true });
      return;
    }
    const del = foundry.data.operators.ForcedDeletion.create();
    const update = { [`system.gifts.tiers.${tierId}`]: del };
    for ( const otherId of Object.keys(item.system.gifts?.tiers ?? {}) ) {
      if ( otherId !== tierId ) {
        update[`system.gifts.tiers.${otherId}.requires.${tierId}`] = del;
      }
    }
    await item.update(update);
  }
}
