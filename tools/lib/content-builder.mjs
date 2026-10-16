/**
 * Content Builder
 * ===============
 * Generic pack _source authoring helpers for Advancement Classes content
 * modules. A content module imports this library (typically via a git
 * submodule checkout of this repository) and builds plain document data
 * objects, then writes them as pack _source JSON and compiles them with
 * the Foundry CLI.
 *
 * Nothing here is content-specific: factories accept every content value
 * (names, identifiers, icons, folders, flags) as parameters.
 *
 * Usage:
 *   import * as cb from "advancement-classes/tools/lib/content-builder.mjs";
 *   const folders = cb.createFolderSet();
 *   const root = folders.folder("my-class", "My Class");
 *   const doc = cb.feat("My Feature", "my-feature", "<p>Text</p>", { folder: root });
 *   cb.writeOut(rootDir, "classes", [...folders.docs, doc]);
 *   cb.packAll(rootDir);
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* -------------------------------------------- */
/*  Deterministic IDs                           */
/* -------------------------------------------- */

/**
 * Deterministic 16-character document ID derived from a slug, so
 * regenerating content produces stable IDs across runs.
 * @param {string} slug  Any string; namespace it (e.g. "feat:my-feat") to
 *                       avoid collisions between document kinds.
 * @returns {string}
 */
export function docId(slug) {
  const hash = createHash("sha1").update(`advclass:${slug}`).digest("hex");
  let out = "";
  for ( let i = 0; i < 16; i++ ) {
    const n = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
    out += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n % 62];
  }
  return out;
}

/**
 * Deterministic ID for an embedded Activity.
 * @param {string} slug
 * @returns {string}
 */
export function actId(slug) { return docId(`act:${slug}`); }

/**
 * Deterministic ID for an embedded Active Effect.
 * @param {string} slug
 * @returns {string}
 */
export function effId(slug) { return docId(`eff:${slug}`); }

/**
 * Deterministic ID for an embedded Advancement.
 * @param {string} slug
 * @returns {string}
 */
export function advId(slug) { return docId(`adv:${slug}`); }

/* -------------------------------------------- */
/*  Compendium UUIDs                            */
/* -------------------------------------------- */

/**
 * Build a compendium document UUID for the given module and pack.
 * @param {string} moduleId       The content module's id.
 * @param {string} pack           The pack name declared in module.json.
 * @param {string} documentName   "Item", "Actor", "JournalEntry", ...
 * @param {string} id             The document's _id.
 * @returns {string}
 */
export function packUuid(moduleId, pack, documentName, id) {
  return `Compendium.${moduleId}.${pack}.${documentName}.${id}`;
}

/**
 * Create bound UUID builders for a content module's three conventional
 * packs (items, actors, journals).
 * @param {string} moduleId                 The content module's id.
 * @param {object} packs
 * @param {string} packs.items              Item pack name.
 * @param {string} packs.actors             Actor pack name.
 * @param {string} packs.journals           JournalEntry pack name.
 * @returns {{itemUuid: Function, actorUuid: Function, journalUuid: Function}}
 */
export function uuidBuilders(moduleId, { items, actors, journals }) {
  return {
    itemUuid: id => packUuid(moduleId, items, "Item", id),
    actorUuid: id => packUuid(moduleId, actors, "Actor", id),
    journalUuid: id => packUuid(moduleId, journals, "JournalEntry", id)
  };
}

/* -------------------------------------------- */
/*  Pack Folders                                */
/* -------------------------------------------- */

/**
 * Create a compendium folder registry. Foundry packs support folder
 * nesting only to depth 3; folder `sort` values are multiplied by 10 so
 * integer stage numbers leave room between them for manual reordering.
 * @returns {{docs: object[], folder: Function}}
 */
export function createFolderSet() {
  const docs = [];
  return {
    docs,
    /**
     * Register a folder document.
     * @param {string} slug                 Stable slug (namespaced "folder:").
     * @param {string} name                 Display name.
     * @param {string|null} [parent]        Parent folder id, if any.
     * @param {object} [opts]
     * @param {number} [opts.sort=0]        Manual sort value (x10 stored).
     * @param {string} [opts.sorting="a"]   "a"lphabetical or "m"anual.
     * @param {string} [opts.type="Item"]   Document type the pack holds.
     * @returns {string} The folder document id.
     */
    folder(slug, name, parent = null, { sort = 0, sorting = "a", type = "Item" } = {}) {
      const fid = docId(`folder:${slug}`);
      docs.push({
        _id: fid, _key: `!folders!${fid}`, name, type,
        folder: parent, color: null, sort: sort * 10, sorting, flags: {}
      });
      return fid;
    }
  };
}

/* -------------------------------------------- */
/*  Item Documents                              */
/* -------------------------------------------- */

/**
 * Build a feat-type item document.
 * @param {string} name
 * @param {string} ident                `system.identifier`.
 * @param {string} description          HTML description.
 * @param {object} [extra]
 * @param {string} [extra.img]          Icon path (default: dnd5e feature icon).
 * @param {string} [extra.folder]       Folder id within the pack.
 * @param {number} [extra.sort=0]       Manual sort value.
 * @param {string} [extra.featType="class"]   `system.type.value`.
 * @param {string} [extra.subtype=""]         `system.type.subtype`.
 * @param {object} [extra.uses]         `system.uses` payload.
 * @param {object} [extra.activities]   `system.activities` map.
 * @param {object[]} [extra.effects]    Embedded Active Effects.
 * @param {object} [extra.flags]        Document flags.
 * @returns {object}
 */
export function feat(name, ident, description, extra = {}) {
  const fid = docId(`feat:${ident}`);
  if ( extra.effects ) {
    for ( const e of extra.effects ) e._key = `!items.effects!${fid}.${e._id}`;
  }
  const doc = {
    _id: fid,
    _key: `!items!${fid}`,
    name, type: "feat",
    img: extra.img ?? "systems/dnd5e/icons/svg/items/feature.svg",
    folder: extra.folder ?? null,
    sort: extra.sort ?? 0,
    system: {
      description: { value: description, chat: "" },
      identifier: ident,
      type: { value: extra.featType ?? "class", subtype: extra.subtype ?? "" },
      source: {}
    },
    flags: {}
  };
  if ( extra.uses ) doc.system.uses = extra.uses;
  if ( extra.activities ) doc.system.activities = extra.activities;
  if ( extra.effects ) doc.effects = extra.effects;
  if ( extra.flags ) doc.flags = extra.flags;
  return doc;
}

/**
 * Build an Advancement Milestone item document.
 * @param {string} name
 * @param {string} ident                `system.identifier`.
 * @param {string} description          Plain text; wrapped in `<p>`.
 * @param {object} [opts]
 * @param {string} [opts.img]
 * @param {string|null} [opts.folder]
 * @param {number} [opts.sort=0]
 * @param {string} [opts.type="counter"]  "manual" | "counter" | "gmConfirm" | "calling".
 * @param {number} [opts.max=1]         Progress required for counter milestones.
 * @param {object} [opts.calling]       `system.calling` payload for calling milestones.
 * @param {string} [opts.event]         `tracking.event` key for counter milestones.
 * @param {boolean} [opts.unique]       `tracking.uniqueTargets`.
 * @returns {object}
 */
export function milestone(name, ident, description, opts = {}) {
  const mid = docId(`ms:${ident}`);
  return {
    _id: mid,
    _key: `!items!${mid}`,
    name, type: "advancement-classes.advancement-milestone",
    img: opts.img ?? "icons/magic/symbols/star-rising-purple.webp",
    folder: opts.folder ?? null,
    sort: opts.sort ?? 0,
    system: {
      description: { value: `<p>${description}</p>`, chat: "" },
      identifier: ident,
      milestoneType: opts.type ?? "counter",
      progress: { value: 0, max: opts.max ?? 1 },
      calling: opts.calling ?? {},
      tracking: {
        event: opts.event ?? "",
        uniqueTargets: opts.unique ?? false,
        seen: []
      },
      source: {}
    },
    flags: {}
  };
}

/**
 * Build a Calling-type Advancement Milestone - one alternative of a
 * mutually exclusive choice set that grants a gift on completion.
 * @param {object} opts
 * @param {string} opts.name            e.g. "Calling: Control (Stage 2)".
 * @param {string} opts.ident           `system.identifier`.
 * @param {string} opts.description     Plain text description.
 * @param {string} opts.choiceSet       Shared key grouping the alternatives.
 * @param {string} opts.choiceKey       This alternative's identity.
 * @param {string} opts.giftSource      Compendium pack id, or "world".
 * @param {string[]} opts.giftTiers     Tier ids offered by this milestone.
 * @param {string} [opts.folder]
 * @param {number} [opts.sort=0]
 * @param {string} [opts.img]
 * @returns {object}
 */
export function callingMilestone({
  name, ident, description, choiceSet, choiceKey, giftSource, giftTiers, folder, sort = 0, img
}) {
  return milestone(name, ident, description, {
    type: "calling", folder, sort, img,
    calling: { choiceSet, choiceKey, giftSource, giftTiers }
  });
}

/* -------------------------------------------- */
/*  Advancements                                */
/* -------------------------------------------- */

/**
 * Build an ItemGrant advancement.
 * @param {number} level                Stage at which items are granted.
 * @param {string[]} uuids              Compendium/world UUIDs granted.
 * @param {object} [meta]
 * @param {string} [meta.title]
 * @param {string} [meta.hint]
 * @param {string} [meta.tag]           Extra slug component for the id.
 * @param {string} [meta.id]            Explicit advancement _id.
 * @returns {object}
 */
export function itemGrant(level, uuids, meta = {}) {
  return {
    _id: meta.id ?? advId(`grant:${level}:${meta.tag ?? "items"}:${uuids.join("|")}`),
    type: "ItemGrant", level,
    title: meta.title ?? "",
    hint: meta.hint ?? "",
    configuration: { items: uuids.map(uuid => ({ uuid })), optional: false },
    value: {}
  };
}

/**
 * Build a ScaleValue advancement.
 * @param {string} identifier           Scale identifier (`@scale.<class>.<identifier>`).
 * @param {string} type                 "number" | "dice" | "distance" | "string".
 * @param {object} scale                Stage-keyed scale values.
 * @param {object} [meta]
 * @param {string} [meta.title]
 * @param {string} [meta.hint]
 * @param {string} [meta.id]            Explicit advancement _id.
 * @returns {object}
 */
export function scaleValue(identifier, type, scale, meta = {}) {
  return {
    _id: meta.id ?? advId(`sv:${identifier}`),
    type: "ScaleValue", level: 0,
    title: meta.title ?? "",
    hint: meta.hint ?? "",
    configuration: { identifier, type, scale, distance: { units: "" } },
    value: {}
  };
}

/* -------------------------------------------- */
/*  Activities                                  */
/* -------------------------------------------- */

/**
 * Build a base activity payload of the given type with dnd5e defaults.
 * @param {string} type                 Activity type ("utility", "heal", ...).
 * @param {string} name                 Activity name (also its id slug).
 * @param {object} [extra]
 * @param {string} [extra.identifier]   Activity identifier (tracking events target this).
 * @param {string} [extra.activation="action"]
 * @param {object[]} [extra.consume]    `consumption.targets` entries.
 * @param {object[]} [extra.effects]    Applied effect stubs.
 * @param {string} [extra.range="self"]
 * @param {string} [extra.affects]      `target.affects.type`.
 * @param {string} [extra.affectCount]  `target.affects.count`.
 * @param {object} [extra.data]         Type-specific keys merged last.
 * @returns {object}
 */
export function baseActivity(type, name, extra = {}) {
  return {
    _id: actId(`${type}:${name}`), type,
    name, img: null, sort: 0, identifier: extra.identifier ?? "",
    activation: { type: extra.activation ?? "action", value: null, override: false, condition: "" },
    consumption: { scaling: { allowed: false }, spellSlot: false, targets: extra.consume ?? [] },
    description: { chatFlavor: "" },
    duration: { units: "inst", concentration: false, override: false },
    effects: extra.effects ?? [],
    range: { units: extra.range ?? "self", override: false },
    target: {
      template: { contiguous: false, units: "ft", type: "" },
      affects: { choice: false, type: extra.affects ?? "", count: extra.affectCount ?? "" },
      override: false, prompt: true
    },
    uses: { spent: 0, recovery: [], max: "" },
    flags: {},
    visibility: { level: {}, requireAttunement: false, requireIdentification: false, requireMagic: false },
    ...extra.data
  };
}

/**
 * Build a Transform activity. Defaults preserve the actor's identity
 * across the change: hit points, ability scores, proficiency bonus,
 * resistances, vision, and biography are kept; save and skill
 * proficiencies merge; effects come only from origin/background/feat.
 * @param {string} name
 * @param {object[]} profiles           Transform profiles [{_id, name, uuid, ...}].
 * @param {object} [opts]
 * @param {string} [opts.minimumAC=""]
 * @param {object[]} [opts.consume=[]]  `consumption.targets` entries.
 * @param {string} [opts.activation="action"]
 * @returns {object}
 */
export function transformActivity(name, profiles, { minimumAC = "", consume = [], activation = "action" } = {}) {
  return baseActivity("transform", name, {
    activation,
    consume,
    data: {
      transform: { customize: true, mode: "", preset: "" },
      profiles,
      settings: {
        effects: ["origin", "otherOrigin", "background", "feat"], merge: ["saves", "skills"],
        keep: ["hp", "tempHP", "physical", "mental", "resistances", "vision", "bio", "prof"],
        minimumAC, other: [], spellLists: [], transformTokens: true, tempFormula: ""
      }
    }
  });
}

/**
 * Build a Save activity.
 * @param {string} name
 * @param {string} ability              Save ability key ("str", "con", ...).
 * @param {string} [dcCalc="con"]       `dc.calculation` ability.
 * @param {object} [extra]              Passed to baseActivity; `dmgParts`
 *                                      fills `damage.parts`, `appliedEffects`
 *                                      fills `effects`.
 * @returns {object}
 */
export function saveActivity(name, ability, dcCalc = "con", extra = {}) {
  return baseActivity("save", name, {
    activation: extra.activation ?? "special",
    affects: "creature", affectCount: "1",
    effects: extra.appliedEffects ?? [],
    data: {
      save: { ability: [ability], dc: { calculation: dcCalc, formula: "" } },
      damage: { onSave: "none", parts: extra.dmgParts ?? [] }
    }
  });
}

/* -------------------------------------------- */
/*  Actors                                      */
/* -------------------------------------------- */

/** Token grid footprint (squares per side) for each actor size. */
export const TOKEN_SIZE = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };

/**
 * Build a natural weapon item embedded in an actor document.
 * @param {string} slug                 Unique slug for id generation.
 * @param {object} attack
 * @param {string} attack.name          Weapon name.
 * @param {string} attack.ident         `system.identifier`.
 * @param {string} attack.dice          Damage dice ("1d8", "2d4", "1").
 * @param {string} attack.dmg           Damage type.
 * @param {string} attack.ability       Attack ability ("str", "dex").
 * @param {string} [attack.extra]       Extra damage dice ("1d4").
 * @param {string} [attack.extraType]   Extra damage type.
 * @param {object} [attack.rider]       Optional on-hit save activity that
 *                                      applies a rider effect:
 *                                      `{ ability, dcCalculation, slug,
 *                                      effectSlug, effect: {name, img,
 *                                      description, flags} }`.
 * @param {string} actorId              Owning actor's _id (for _key paths).
 * @returns {object}
 */
export function weaponItem(slug, attack, actorId) {
  const wid = docId(`wpn:${slug}:${attack.ident}`);
  const item = {
    _id: wid,
    _key: `!actors.items!${actorId}.${wid}`,
    name: attack.name, type: "weapon",
    img: "systems/dnd5e/icons/svg/items/weapon.svg",
    system: {
      identifier: attack.ident,
      type: { value: "natural", baseItem: "" },
      activities: {},
      uses: { spent: 0, recovery: [], max: "" },
      description: { value: "", chat: "" },
      source: {},
      properties: [],
      identified: true,
      unidentified: { name: "Unidentified Weapon", description: "" },
      mastery: "",
      range: { units: "ft", value: null, long: null, reach: null },
      damage: {
        base: { number: 1, denomination: Number(attack.dice.replace(/\d*d/, "")) || null,
                number2: null, custom: { enabled: false } },
        versatile: { number: null, denomination: null, types: [], custom: { enabled: false } }
      },
      quantity: 1
    },
    flags: {}
  };

  const parts = [];
  if ( attack.extra ) {
    parts.push({
      number: 1, denomination: Number(attack.extra.replace(/\d*d/, "")),
      bonus: "", types: [attack.extraType], custom: { enabled: false }
    });
  }
  const atkAct = baseActivity("attack", `${slug}-${attack.ident}`, {
    data: {
      attack: { critical: { threshold: null }, flat: false, type: { value: "", classification: "" }, ability: attack.ability, bonus: "" },
      damage: { critical: { bonus: "" }, includeBase: true, parts }
    }
  });
  item.system.activities[atkAct._id] = atkAct;
  item.system.damage.base = attack.dice === "1"
    ? { number: null, denomination: null, bonus: "", types: [attack.dmg], custom: { enabled: false } }
    : {
        number: Number(attack.dice.match(/^(\d*)d/)?.[1] ?? 1),
        denomination: Number(attack.dice.match(/d(\d+)/)?.[1]),
        bonus: "", types: [attack.dmg], custom: { enabled: false }
      };

  if ( attack.rider ) {
    const { ability = "con", dcCalculation = "con", effect } = attack.rider;
    const riderEffId = effId(attack.rider.effectSlug ?? `rider:${slug}:${attack.ident}`);
    const riderAct = saveActivity(attack.rider.slug ?? `rider:${slug}:${attack.ident}`, ability, dcCalculation, {
      affects: "creature", affectCount: "1",
      appliedEffects: [{ _id: riderEffId }]
    });
    riderAct.name = effect.name;
    item.system.activities[riderAct._id] = riderAct;
    item.effects = [{
      _id: riderEffId,
      _key: `!actors.items.effects!${actorId}.${wid}.${riderEffId}`,
      name: effect.name,
      img: effect.img ?? "systems/dnd5e/icons/svg/statuses/transformed.svg",
      type: "base", transfer: false, disabled: false,
      changes: [], duration: {}, origin: null, tint: "#ffffff",
      description: effect.description ?? "",
      statuses: [], flags: effect.flags ?? {}
    }];
  }
  return item;
}

/**
 * Build an NPC actor document representing a transformation form (or any
 * summoned/creature stat block).
 * @param {object} spec
 * @param {string} spec.name
 * @param {string} spec.identifier              `system.identifier`.
 * @param {string} [spec.id]                    Explicit _id (default: docId of the identifier).
 * @param {string} spec.size                    "tiny"|"sm"|"med"|"lg"|"huge"|"grg".
 * @param {number} spec.acFlat                  Flat AC.
 * @param {object} spec.move                    Movement speeds {walk: 40, ...}.
 * @param {object} [spec.senses]                Sense ranges {darkvision: 60, ...};
 *                                              written in the dnd5e 6.x `ranges` shape.
 * @param {number} [spec.hp=30]                 Hit points (value and max).
 * @param {object} [spec.abilities]             Ability scores {str: 16, ...}.
 * @param {string} [spec.alignment]
 * @param {object} [spec.creatureType]          `{ value: "beast", subtype: "" }`.
 * @param {number} [spec.cr=1]
 * @param {string} [spec.biography]
 * @param {object[]} [spec.attacks]             Weapon specs for weaponItem.
 * @param {string} [spec.weaponSlug]            Slug prefix for weapon item/activity
 *                                              ids (default: spec.identifier).
 * @param {string} [spec.img]
 * @param {object} [spec.flags]                 Actor flags (e.g. formAC).
 * @param {object} [spec.token]                 `{ name, disposition, texture }` overrides.
 * @returns {object}
 */
export function npcFormActor(spec) {
  const nid = spec.id ?? docId(`form:${spec.identifier}`);
  const items = (spec.attacks ?? []).map(a => weaponItem(spec.weaponSlug ?? spec.identifier, a, nid));

  const abilities = {};
  for ( const ab of ["str", "dex", "con", "int", "wis", "cha"] ) {
    abilities[ab] = { value: spec.abilities?.[ab] ?? 10, proficient: 0 };
  }

  return {
    _id: nid,
    _key: `!actors!${nid}`,
    name: spec.name,
    type: "npc",
    img: spec.img ?? "systems/dnd5e/icons/svg/monster.svg",
    system: {
      identifier: spec.identifier,
      abilities,
      attributes: {
        ac: { flat: spec.acFlat, calc: "flat" },
        hp: { value: spec.hp ?? 30, max: spec.hp ?? 30, temp: null, tempmax: null },
        init: { ability: "", roll: {}, bonus: "" },
        movement: { units: "ft", hover: false, ...spec.move },
        // dnd5e 6.x SensesField shape: ranges map + units + special.
        senses: {
          ranges: {
            darkvision: spec.senses?.darkvision ?? null,
            blindsight: spec.senses?.blindsight ?? null,
            tremorsense: spec.senses?.tremorsense ?? null,
            truesight: spec.senses?.truesight ?? null
          },
          units: "ft", special: spec.senses?.special ?? ""
        }
      },
      details: {
        alignment: spec.alignment ?? "",
        type: spec.creatureType ?? { value: "beast", subtype: "" },
        cr: spec.cr ?? 1,
        biography: { value: spec.biography ?? "", public: "" }
      },
      traits: {
        size: spec.size,
        di: { value: [], bypasses: [] }, dr: { value: [], bypasses: [] },
        dv: { value: [], bypasses: [] }, dm: { amount: {}, bypasses: [] },
        ci: { value: [], bypasses: [] },
        languages: { value: [], custom: "", communication: {} }
      },
      bonuses: { mwak: { attack: "", damage: "" }, rwak: { attack: "", damage: "" }, msak: { attack: "", damage: "" }, rsak: { attack: "", damage: "" } },
      source: {}
    },
    items,
    effects: [],
    flags: spec.flags ?? {},
    // transformInto copies token dimensions verbatim, so forms declare
    // explicit width/height for their size.
    prototypeToken: {
      name: spec.token?.name ?? spec.name, actorLink: true, sight: { enabled: true },
      width: TOKEN_SIZE[spec.size] ?? 1, height: TOKEN_SIZE[spec.size] ?? 1,
      disposition: spec.token?.disposition ?? -1,
      texture: { src: spec.token?.texture ?? spec.img ?? "systems/dnd5e/icons/svg/monster.svg" }
    }
  };
}

/* -------------------------------------------- */
/*  Output                                      */
/* -------------------------------------------- */

/**
 * Write documents as pack _source JSON under
 * `<rootDir>/packs/_source/<pack>/`. Filenames are slugged from the
 * document's identifier or name; folder documents are written as
 * `folder-<id>.json`.
 * @param {string} rootDir   The content module's repository root.
 * @param {string} pack      Pack name (directory under packs/_source).
 * @param {object[]} docs    Documents (and folder docs) to write.
 */
export function writeOut(rootDir, pack, docs) {
  const target = join(rootDir, "packs/_source", pack);
  mkdirSync(target, { recursive: true });
  for ( const doc of docs ) {
    const isFolder = doc._key?.startsWith("!folders!");
    const base = isFolder ? `folder-${doc._id}` : (doc.system?.identifier || doc.name);
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    writeFileSync(join(target, `${slug}.json`), JSON.stringify(doc, null, 2) + "\n");
  }
  console.log(`${pack}: ${docs.length} documents`);
}

/**
 * Compile every directory under `<rootDir>/packs/_source/` into a binary
 * LevelDB pack in `<rootDir>/packs/<name>/` using the Foundry CLI. The CLI
 * appends the pack name itself, so `--out` is the parent `packs` dir.
 * @param {string} rootDir   The content module's repository root.
 * @param {object} [opts]
 * @param {string} [opts.type]  Passed as `--type` if given.
 */
export function packAll(rootDir, opts = {}) {
  const src = join(rootDir, "packs", "_source");
  for ( const name of readdirSync(src) ) {
    if ( !statSync(join(src, name)).isDirectory() ) continue;
    const args = ["-y", "@foundryvtt/foundryvtt-cli", "package", "pack", name,
      "--in", join(src, name), "--out", join(rootDir, "packs")];
    if ( opts.type ) args.push("--type", opts.type);
    execFileSync("npx", args, { stdio: "inherit" });
  }
}
