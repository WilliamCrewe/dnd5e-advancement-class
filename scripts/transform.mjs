import { CLASS_TYPE, MODULE_ID, PATH_TYPE } from "./constants.mjs";
import { owningAdvancementClass } from "./data/advancement-milestone.mjs";

/**
 * Transform-time injection for Advancement Classes. When an actor
 * transforms (e.g. via a Transform activity granted by an Advancement
 * Class), this hook inspects the host actor's Advancement Class/Path items
 * for the `flags.advancement-classes.transform` configuration and applies:
 *
 *   keep: string[]          - added to the transformation's keep set
 *   abilityFloor: {
 *     ability: "str",       - ability to floor
 *     scale: "identifier"   - Scale Value identifier resolving to the floor
 *   }
 *   inject: [{
 *     uuid: "Item.x" | "Compendium.x.y.Item.z",  - item granted to the form
 *     minStage: 2                                 - stage gate, default 1
 *   }]
 *   effects: [{                                 - Active Effects applied to
 *     name: "Feral Speed",                          the transformed actor
 *     changes: [{key, mode, value}]
 *   }]
 *
 * Injected item data has `@scale.<identifier>.<scale>` references replaced
 * with values resolved on the host (whose class/path items are not carried
 * into the transformed actor).
 * Injected documents live only on the transformed actor and are discarded
 * on revert - no cleanup required.
 *
 * Multiple sources merge: keep entries union, abilityFloor applies the
 * highest resolved floor per ability, inject dedupes by UUID.
 */
export function registerTransformInjection() {
  Hooks.on("dnd5e.transformActorV2", onTransform);
}

/* -------------------------------------------- */

async function onTransform(host, source, data, settings, options) {
  const configs = collectConfigs(host);
  if ( !configs ) return;

  // Keep-set adjustments from configs (e.g. Gifts keeping languages/feats).
  if ( configs.keep.size ) {
    for ( const key of configs.keep ) settings.keep.add(key);
  }

  // Per-form AC formula: the target form may declare a `formAC` flag whose
  // formula is evaluated against the HOST's roll data (e.g. "12 + @abilities.con.mod").
  // `settings.minimumAC` is consumed before this hook fires, so the result is
  // written directly onto the creation data instead.
  const formAC = source.getFlag(MODULE_ID, "formAC");
  if ( formAC ) {
    const rollData = { ...host.getRollData(), source: source.getRollData() };
    const ac = dnd5e.utils.simplifyBonus(formAC, rollData);
    if ( ac ) {
      data.system.attributes.ac ??= {};
      data.system.attributes.ac.calc = "flat";
      data.system.attributes.ac.flat = ac;
    }
  }

  // Ability floors: UPGRADE-mode Active Effects resolved against the host's
  // roll data so scale values evaluate at the correct Stage.
  for ( const [ability, floor] of configs.floors ) {
    data.effects.push({
      name: game.i18n.format("ADVANCEMENT_CLASSES.Transform.AbilityFloor", {
        ability: game.i18n.localize(`DND5E.Ability${ability.capitalize()}`)
      }),
      img: "icons/magic/life/heart-cross-blue.webp",
      origin: host.uuid,
      changes: [{
        key: `system.abilities.${ability}.value`,
        mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
        value: String(floor)
      }]
    });
  }

  // Custom Active Effects granted to the form (e.g. Feral Speed).
  data.effects.push(...configs.effects);

  // Feature/item injection (e.g. Wild Regeneration, Bestial Aspect senses).
  const existing = new Set(data.items.map(i => i.flags?.[MODULE_ID]?.injectedFrom).filter(_ => _));
  const existingIdents = new Set(data.items.map(i => i.system?.identifier).filter(_ => _));
  for ( const entry of configs.inject ) {
    if ( existing.has(entry.uuid) ) continue;
    const doc = await fromUuid(entry.uuid);
    if ( !doc ) continue;
    if ( existingIdents.has(doc.identifier) ) continue;
    const itemData = substituteScales(doc.toObject(), host);
    delete itemData._id;
    foundry.utils.setProperty(itemData, `flags.${MODULE_ID}.injectedFrom`, entry.uuid);
    data.items.push(itemData);
  }
}

/* -------------------------------------------- */

/**
 * Collect transform configuration from the host's Advancement Class and
 * Path items, and from any other items (e.g. Gift feats) carrying a
 * `flags.advancement-classes.transform` block. `minStage` gating and
 * ability floors resolve against the Stage of the class each config-bearing
 * item belongs to.
 * @returns {{ keep: Set<string>, floors: Map<string, number>, inject: object[], effects: object[] }|null}
 */
function collectConfigs(host) {
  const keep = new Set();
  const floors = new Map();
  const inject = [];
  const effects = [];
  let found = false;

  for ( const item of host.items ) {
    const cfg = item.getFlag(MODULE_ID, "transform");
    if ( !cfg ) continue;
    found = true;
    const stage = configStage(host, item);

    for ( const key of cfg.keep ?? [] ) keep.add(key);
    for ( const effect of cfg.effects ?? [] ) effects.push(effect);
    if ( cfg.injectSelf && item.uuid ) inject.push({ uuid: item.uuid, minStage: cfg.minStage ?? 1 });

    const floor = cfg.abilityFloor;
    if ( floor?.ability && floor?.scale ) {
      const sv = item.scaleValues?.[floor.scale];
      const value = resolveScaleValue(sv, stage);
      if ( value && value > (floors.get(floor.ability) ?? 0) ) floors.set(floor.ability, value);
    }

    for ( const entry of cfg.inject ?? [] ) {
      if ( (entry.minStage ?? 1) <= stage ) inject.push(entry);
    }
  }

  return found ? { keep, floors, inject, effects } : null;
}

/* -------------------------------------------- */

/**
 * The Stage a transform configuration is evaluated at, resolved from the
 * config-bearing item itself: an Advancement Class's own Stage, the class
 * linked through an Advancement Path's `classIdentifier`, the class named
 * by a gift flag, or the class at the root of the item's advancement
 * origin chain. Falls back to the highest Advancement Class Stage on the
 * actor when nothing resolves.
 */
function configStage(host, item) {
  const fallback = Math.max(
    0, ...host.items.filter(i => i.type === CLASS_TYPE).map(i => i.system.levels)
  );
  const byIdentifier = ident => host.items.find(
    i => (i.type === CLASS_TYPE) && (i.identifier === ident)
  );
  if ( item.type === CLASS_TYPE ) return item.system.levels;
  if ( item.type === PATH_TYPE ) return byIdentifier(item.system.classIdentifier)?.system.levels ?? fallback;
  const giftClass = item.getFlag(MODULE_ID, "gift")?.class;
  if ( giftClass ) {
    const cls = byIdentifier(giftClass);
    if ( cls ) return cls.system.levels;
  }
  return owningAdvancementClass(item)?.system.levels ?? fallback;
}

/* -------------------------------------------- */

/**
 * Collect the host's scale values keyed `<itemIdentifier>.<scaleId>` and
 * replace `@scale.` references throughout serialized item data with their
 * resolved formulas, so injected features keep working on the transformed
 * actor where the class/path items no longer exist.
 */
function substituteScales(itemData, host) {
  const scaleValues = {};
  for ( const item of host.items ) {
    const svs = item.scaleValues;
    if ( !svs || !item.identifier ) continue;
    for ( const [scaleId, sv] of Object.entries(svs) ) {
      const formula = sv?.formula ?? sv?.value;
      if ( formula !== undefined && formula !== null ) {
        scaleValues[`${item.identifier}.${scaleId}`] = String(formula);
      }
    }
  }
  if ( !Object.keys(scaleValues).length ) return itemData;
  const serialized = JSON.stringify(itemData).replace(
    /@scale\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/g,
    (match, identifier, scaleId) => scaleValues[`${identifier}.${scaleId}`] ?? match
  );
  return JSON.parse(serialized);
}

/* -------------------------------------------- */

/**
 * Resolve a scale value to a number. Accepts a number scale value, a dice
 * scale value (evaluated against an empty roll context - not meaningful for
 * floors), or a raw value.
 */
function resolveScaleValue(sv, stage) {
  if ( !sv ) return null;
  if ( typeof sv === "number" ) return sv;
  if ( sv.value !== undefined ) return Number(sv.value) || null;
  if ( (sv.number !== undefined) && sv.faces ) {
    // Dice scale values aren't meaningful for floors; use the expectation.
    return Math.floor(sv.number * ((sv.faces + 1) / 2));
  }
  return null;
}
