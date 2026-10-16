import { CLASS_TYPE, GIFT_TYPE, MODULE_ID } from "../constants.mjs";
import { giftTierDefinitions, owningAdvancementClass } from "../data/advancement-milestone.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Gifts are Advancement Gift items (`advancement-classes.advancement-gift`)
 * with `system.gift = { side, tier, class }`.
 *
 * Calling milestone fields (system.calling):
 *   choiceSet  - shared key grouping mutually exclusive alternatives
 *   choiceKey  - this alternative's identity (matched to gift side)
 *   giftSource - compendium pack ID, or "world" for world items
 *   giftTiers  - set of tier ids offered
 *
 * Tier definitions (label, sort order, and prerequisite `requires` counts)
 * come from the owning Advancement Class's `system.gifts.tiers`.
 */

/* -------------------------------------------- */
/*  Commit Flow                                 */
/* -------------------------------------------- */

/**
 * Present the commitment dialog for a Calling milestone, then resolve the
 * choice: the completed milestone and every sibling sharing its choiceSet
 * are removed, and the gift picker opens.
 * @param {Item5e} item  The calling milestone being completed.
 */
export async function commitCalling(item) {
  const { choiceKey, choiceSet } = item.system.calling;
  if ( !choiceSet ) return item.deleteDialog();

  const siblings = item.system.callingSiblings;
  const label = callingLabel(item);
  const content = `<p>${game.i18n.format("ADVANCEMENT_CLASSES.Calling.ConfirmText", {
    choice: label,
    count: siblings.length
  })}</p>`;

  const confirmed = await DialogV2.confirm({
    window: { title: game.i18n.format("ADVANCEMENT_CLASSES.Calling.ConfirmTitle", { choice: label }) },
    content,
    modal: true
  });
  if ( !confirmed ) return;

  const actor = item.actor;
  // Resolve the owning class before the milestone is deleted - an embedded
  // document loses its actor link once removed.
  const owningClass = owningAdvancementClass(item);
  const bypass = { [MODULE_ID]: { bypass: true } };
  for ( const sibling of siblings ) await sibling.delete(bypass);
  await item.delete(bypass);
  await presentGifts(actor, item, choiceKey, owningClass);
}

/* -------------------------------------------- */

/**
 * Display label for the chosen alternative - the milestone's name, e.g.
 * "Calling: Control".
 */
function callingLabel(item) {
  const key = item.system.calling.choiceKey;
  const localized = key && game.i18n.has(`ADVANCEMENT_CLASSES.Calling.Keys.${key}`)
    ? game.i18n.localize(`ADVANCEMENT_CLASSES.Calling.Keys.${key}`)
    : null;
  return localized ?? item.name;
}

/* -------------------------------------------- */
/*  Gift Selection                              */
/* -------------------------------------------- */

/**
 * Collect candidate gift items from the configured source, filtered by the
 * completed calling's choiceKey and offered tiers. A candidate is only
 * eligible when its tier's `requires` counts - evaluated over gifts the
 * actor already owns with the same side and class - are met.
 * @param {Item5e} item           The calling milestone being completed.
 * @param {Actor5e} actor
 * @param {Item5e|null} owningClass  The milestone's owning Advancement Class.
 * @returns {Promise<{candidates: object[], locked: string[], tierDefs: Map<string, object>}>}
 */
async function giftCandidates(item, actor, owningClass) {
  const { choiceKey, giftSource, giftTiers } = item.system.calling;
  const docs = await giftDocuments(giftSource);
  const classIdent = owningClass?.identifier;
  const tierDefs = new Map(giftTierDefinitions(owningClass, giftTiers).map(t => [t.id, t]));

  // Gifts the actor already owns, counted per tier for `requires` checks -
  // only same-side gifts of the same class count.
  const counts = {};
  const owned = new Set();
  for ( const ownedItem of actor?.items ?? [] ) {
    if ( ownedItem.type !== GIFT_TYPE ) continue;
    const gift = ownedItem.system.gift;
    if ( !gift ) continue;
    if ( ownedItem.identifier ) owned.add(ownedItem.identifier);
    owned.add(ownedItem.name);
    if ( (gift.side === choiceKey) && (!classIdent || !gift.class || (gift.class === classIdent)) ) {
      counts[gift.tier] = (counts[gift.tier] ?? 0) + 1;
    }
  }

  const unmet = tierId => Object.entries(tierDefs.get(tierId)?.requires ?? {})
    .filter(([reqId, min]) => ((min ?? 0) > 0) && ((counts[reqId] ?? 0) < min));
  const locked = [...giftTiers].filter(tierId => unmet(tierId).length);

  const candidates = docs
    .filter(doc => doc.type === GIFT_TYPE)
    .map(doc => ({ doc, item: doc.toObject(), gift: doc.system.gift }))
    .filter(({ gift }) => gift?.side === choiceKey && giftTiers.has(gift.tier))
    .filter(({ gift }) => !classIdent || !gift.class || (gift.class === classIdent))
    .filter(({ gift }) => !unmet(gift.tier).length)
    .filter(({ item }) => !owned.has(item.system?.identifier) && !owned.has(item.name))
    .sort((a, b) => ((tierDefs.get(b.gift.tier)?.sort ?? -Infinity)
      - (tierDefs.get(a.gift.tier)?.sort ?? -Infinity))
      || a.item.name.localeCompare(b.item.name, game.i18n.lang));
  return { candidates, locked, tierDefs };
}

/* -------------------------------------------- */

async function giftDocuments(giftSource) {
  if ( giftSource === "world" ) return [...game.items];
  const pack = giftSource ? game.packs.get(giftSource) : null;
  if ( pack ) return pack.getDocuments();
  // No source configured: search world items and every pack.
  return [...game.items, ...(await Promise.all(
    game.packs.filter(p => p.documentName === "Item").map(p => p.getDocuments())
  )).flat()];
}

/* -------------------------------------------- */

/**
 * Render the gift-picker dialog and create the chosen item on the actor.
 * @param {Actor5e} actor
 * @param {Item5e} item              The completed calling milestone.
 * @param {string} choiceKey
 * @param {Item5e|null} owningClass  The milestone's owning Advancement Class.
 */
async function presentGifts(actor, item, choiceKey, owningClass) {
  const { candidates, locked, tierDefs } = await giftCandidates(item, actor, owningClass);
  if ( !candidates.length ) {
    ui.notifications.warn("ADVANCEMENT_CLASSES.Calling.NoGifts", { localize: true });
    return;
  }

  const tierLabel = tierId => tierDefs.get(tierId)?.label ?? tierId.capitalize();
  const lockedNotes = locked.map(tierId => {
    const requirements = Object.entries(tierDefs.get(tierId)?.requires ?? {})
      .filter(([, min]) => (min ?? 0) > 0)
      .map(([reqId, min]) =>
        game.i18n.format("ADVANCEMENT_CLASSES.Calling.TierRequirement", {
          count: min, tier: tierLabel(reqId)
        }));
    return game.i18n.format("ADVANCEMENT_CLASSES.Calling.TierLocked", {
      tier: tierLabel(tierId),
      requirements: new Intl.ListFormat(game.i18n.lang, { type: "conjunction" }).format(requirements)
    });
  });

  const radios = candidates.map(({ item: data, gift }, i) => `
    <label class="calling-gift">
      <input type="radio" name="gift" value="${i}" ${i === 0 ? "checked" : ""}>
      <img class="gift-icon" src="${data.img}" alt="">
      <a class="gift-link" data-action="viewGift" data-index="${i}">${foundry.utils.escapeHTML(data.name)}</a>
      <span class="gift-tier">(${foundry.utils.escapeHTML(tierLabel(gift.tier))})</span>
    </label>`).join("");

  const chosen = await DialogV2.prompt({
    window: { title: game.i18n.format("ADVANCEMENT_CLASSES.Calling.GiftTitle", { choice: choiceKey }) },
    content: `<form><p>${game.i18n.localize("ADVANCEMENT_CLASSES.Calling.GiftText")}</p>${radios}`
      + lockedNotes.map(note => `<p class="notes">${note}</p>`).join("")
      + `</form>`,
    actions: {
      viewGift(event, target) {
        candidates[Number(target.dataset.index)]?.doc.sheet?.render(true);
      }
    },
    ok: {
      label: game.i18n.localize("ADVANCEMENT_CLASSES.Calling.GiftConfirm"),
      callback: (event, button) => Number(new FormData(button.form).get("gift"))
    },
    rejectClose: false
  });
  if ( chosen === null || chosen === undefined ) return;

  const data = candidates[chosen].item;
  delete data._id;
  // Gifts group on the character sheet by their advancement class. Stamp the
  // owning class's identifier; absent one, inherit when the actor has
  // exactly one Advancement Class.
  if ( !data.system?.gift?.class ) {
    const identifier = owningClass?.identifier ?? (() => {
      const classes = actor.items.filter(i => i.type === CLASS_TYPE);
      return (classes.length === 1) ? classes[0].identifier : null;
    })();
    if ( identifier ) {
      foundry.utils.setProperty(data, "system.gift.class", identifier);
    }
  }
  await actor.createEmbeddedDocuments("Item", [data]);
}
