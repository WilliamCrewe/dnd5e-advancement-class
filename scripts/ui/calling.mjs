import { CLASS_TYPE, MODULE_ID } from "../constants.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Gift metadata flag shape on candidate items:
 *   flags.advancement-classes.gift = { side: "control", tier: "minor" }
 *
 * Calling milestone fields (system.calling):
 *   choiceSet  - shared key grouping mutually exclusive alternatives
 *   choiceKey  - this alternative's identity (matched to gift side)
 *   giftSource - compendium pack ID, or "world" for world items
 *   giftTiers  - set of tiers offered ("minor", "major", "grand")
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
  const bypass = { [MODULE_ID]: { bypass: true } };
  for ( const sibling of siblings ) await sibling.delete(bypass);
  await item.delete(bypass);
  await presentGifts(actor, item, choiceKey);
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
 * completed calling's choiceKey and offered tiers. Grand-tier gifts are
 * excluded unless the actor already holds 2 minor and 2 major gifts of the
 * same side.
 * @returns {Promise<{candidates: {item: object, gift: object}[], grandLocked: boolean}>}
 */
async function giftCandidates(item, actor) {
  const { choiceKey, giftSource, giftTiers } = item.system.calling;
  const docs = await giftDocuments(giftSource);

  const counts = { minor: 0, major: 0, grand: 0 };
  const owned = new Set();
  for ( const item of actor?.items ?? [] ) {
    const gift = item.getFlag(MODULE_ID, "gift");
    if ( !gift ) continue;
    if ( item.identifier ) owned.add(item.identifier);
    owned.add(item.name);
    if ( gift.side === choiceKey ) counts[gift.tier] = (counts[gift.tier] ?? 0) + 1;
  }
  const grandEligible = (counts.minor >= 2) && (counts.major >= 2);

  const tierOrder = { grand: 0, major: 1, minor: 2 };
  const candidates = docs
    .map(doc => ({ doc, item: doc.toObject(), gift: doc.getFlag(MODULE_ID, "gift") }))
    .filter(({ gift }) => gift?.side === choiceKey && giftTiers.has(gift.tier))
    .filter(({ gift }) => (gift.tier !== "grand") || grandEligible)
    .filter(({ item }) => !owned.has(item.system?.identifier) && !owned.has(item.name))
    .sort((a, b) => (tierOrder[a.gift.tier] ?? 3) - (tierOrder[b.gift.tier] ?? 3)
      || a.item.name.localeCompare(b.item.name, game.i18n.lang));
  return { candidates, grandLocked: giftTiers.has("grand") && !grandEligible };
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
 */
async function presentGifts(actor, item, choiceKey) {
  const { candidates, grandLocked } = await giftCandidates(item, actor);
  if ( !candidates.length ) {
    ui.notifications.warn("ADVANCEMENT_CLASSES.Calling.NoGifts", { localize: true });
    return;
  }

  const radios = candidates.map(({ item: data, gift }, i) => `
    <label class="calling-gift">
      <input type="radio" name="gift" value="${i}" ${i === 0 ? "checked" : ""}>
      <img class="gift-icon" src="${data.img}" alt="">
      <a class="gift-link" data-action="viewGift" data-index="${i}">${foundry.utils.escapeHTML(data.name)}</a>
      <span class="gift-tier">(${gift.tier})</span>
    </label>`).join("");

  const chosen = await DialogV2.prompt({
    window: { title: game.i18n.format("ADVANCEMENT_CLASSES.Calling.GiftTitle", { choice: choiceKey }) },
    content: `<form><p>${game.i18n.localize("ADVANCEMENT_CLASSES.Calling.GiftText")}</p>${radios}`
      + (grandLocked ? `<p class="notes">${game.i18n.localize("ADVANCEMENT_CLASSES.Calling.GrandLocked")}</p>` : "")
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
  // Gifts group on the character sheet by their advancement class. If the
  // item didn't declare one and the actor has exactly one, inherit it.
  if ( !data.flags?.[MODULE_ID]?.gift?.class ) {
    const classes = actor.items.filter(i => i.type === CLASS_TYPE);
    if ( classes.length === 1 && classes[0].identifier ) {
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.gift.class`, classes[0].identifier);
    }
  }
  await actor.createEmbeddedDocuments("Item", [data]);
}
