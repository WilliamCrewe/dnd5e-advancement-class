/**
 * Generate the Therianthrope compendium content for the Advancement Classes
 * module. Emits pack _source JSON into:
 *   packs/_source/advancement-classes/          (Items)
 *   packs/_source/advancement-classes-forms/    (Actors - form NPC sheets)
 *   packs/_source/advancement-classes-journals/ (JournalEntry)
 *
 * Run: node tools/generate-therianthrope.mjs
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ITEM_PACK = "advancement-classes.advancement-classes";
const ACTOR_PACK = "advancement-classes.advancement-classes-forms";
const JOURNAL_PACK = "advancement-classes.advancement-classes-journals";
const ITEM_UUID = id => `Compendium.${ITEM_PACK}.Item.${id}`;
const ACTOR_UUID = id => `Compendium.${ACTOR_PACK}.Actor.${id}`;
const JOURNAL_UUID = id => `Compendium.${JOURNAL_PACK}.JournalEntry.${id}`;

/** Deterministic 16-char document ID from a slug. */
function id(slug) {
  const hash = createHash("sha1").update(`advclass:${slug}`).digest("hex");
  let out = "";
  for ( let i = 0; i < 16; i++ ) {
    const n = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
    out += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[n % 62];
  }
  return out;
}
function actId(slug) { return id(`act:${slug}`); }
function effId(slug) { return id(`eff:${slug}`); }
function advId(slug) { return id(`adv:${slug}`); }

/* -------------------------------------------- */
/*  Static content tables                       */
/* -------------------------------------------- */

const BRANCHES = {
  bear:  { name: "Bear",  key: "str", keyName: "Strength",     alignment: "Chaotic Good",
           aspect: "keen smell. While transformed, you have advantage on Wisdom (Perception) checks that rely on smell and on Wisdom (Survival) checks to track creatures." },
  fox:   { name: "Fox",   key: "dex", keyName: "Dexterity",    alignment: "Chaotic Neutral",
           aspect: "keen hearing and smell. While transformed, you have advantage on Wisdom (Perception) checks that rely on hearing or smell." },
  raven: { name: "Raven", key: "dex", keyName: "Dexterity",    alignment: "Lawful Good",
           aspect: "mimicry. While transformed, you can mimic simple sounds and voices you have heard; a creature can tell the sound is imitation with a successful Wisdom (Insight) check against your Therianthrope DC." },
  tiger: { name: "Tiger", key: "str", keyName: "Strength",     alignment: "Neutral",
           aspect: "keen smell. While transformed, you have advantage on Wisdom (Perception) checks that rely on smell and on Dexterity (Stealth) checks made in natural terrain." },
  shark: { name: "Shark", key: "str", keyName: "Strength",     alignment: "Neutral Evil",
           aspect: "blood in the water. While transformed, you gain blindsight out to 30 feet while you are underwater." },
  snake: { name: "Snake", key: "dex", keyName: "Dexterity",    alignment: "Lawful Evil",
           aspect: "heat-sensing pits. While transformed, you gain blindsight out to 10 feet." },
  wolf:  { name: "Wolf",  key: "str", keyName: "Strength",     alignment: "Chaotic Evil",
           aspect: "keen hearing and smell. While transformed, you have advantage on Wisdom (Perception) checks that rely on hearing or smell." }
};

const TOKEN_SIZE = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };

const FORMS = {
  // [size, acBase, acFormula, movement, attacks, specials]
  bear:  {
    animal: { size: "lg", ac: "12 + @abilities.con.mod", acFlat: 15, move: { walk: 40, climb: 30 },
      attacks: [
        { name: "Bite", ident: "bite", dice: "1d8", dmg: "piercing", ability: "str" },
        { name: "Claws", ident: "claws", dice: "2d4", dmg: "slashing", ability: "str" }
      ], specials: [] },
    hybrid: { size: "lg", ac: "12 + @abilities.con.mod", acFlat: 15, move: { walk: 30 },
      attacks: [
        { name: "Claw", ident: "claw", dice: "2d4", dmg: "slashing", ability: "str" },
        { name: "Bite", ident: "bite", dice: "1d10", dmg: "piercing", ability: "str" }
      ], specials: [] }
  },
  fox:   {
    animal: { size: "sm", ac: "13 + @abilities.dex.mod", acFlat: 15, move: { walk: 40 },
      attacks: [{ name: "Bite", ident: "bite", dice: "1d4", dmg: "piercing", ability: "dex" }],
      specials: [] },
    hybrid: { size: "sm", ac: "13 + @abilities.dex.mod", acFlat: 15, move: { walk: 45 },
      attacks: [
        { name: "Claw", ident: "claw", dice: "1d6", dmg: "slashing", ability: "dex" },
        { name: "Bite", ident: "bite", dice: "1d8", dmg: "piercing", ability: "dex" }
      ], specials: [] }
  },
  raven: {
    animal: { size: "tiny", ac: "11 + @abilities.dex.mod", acFlat: 13, move: { walk: 10, fly: 60 },
      attacks: [{ name: "Peck", ident: "peck", dice: "1", dmg: "piercing", ability: "dex", cursed: true }],
      specials: [] },
    hybrid: { size: "sm", ac: "11 + @abilities.dex.mod", acFlat: 13, move: { walk: 25, fly: 30 },
      attacks: [
        { name: "Talon", ident: "talon", dice: "1d6", dmg: "slashing", ability: "dex" },
        { name: "Beak", ident: "beak", dice: "1d6", dmg: "piercing", ability: "dex", cursed: true }
      ], specials: [] }
  },
  tiger: {
    animal: { size: "lg", ac: "11 + @abilities.dex.mod", acFlat: 13, move: { walk: 40 },
      attacks: [
        { name: "Claw", ident: "claw", dice: "1d8", dmg: "slashing", ability: "str" },
        { name: "Bite", ident: "bite", dice: "1d10", dmg: "piercing", ability: "str", cursed: true }
      ], specials: [] },
    hybrid: { size: "med", ac: "11 + @abilities.dex.mod", acFlat: 13, move: { walk: 40 },
      attacks: [
        { name: "Claw", ident: "claw", dice: "2d4", dmg: "slashing", ability: "str" },
        { name: "Bite", ident: "bite", dice: "1d10", dmg: "piercing", ability: "str", cursed: true }
      ], specials: [] }
  },
  shark: {
    animal: { size: "lg", ac: "11 + @abilities.con.mod", acFlat: 13, move: { walk: 0, swim: 40 }, blindsight: 30,
      attacks: [{ name: "Bite", ident: "bite", dice: "2d6", dmg: "piercing", ability: "str", cursed: true }],
      specials: ["Water Breathing"] },
    hybrid: { size: "lg", ac: "11 + @abilities.con.mod", acFlat: 13, move: { walk: 30, swim: 40 }, blindsight: 30,
      attacks: [
        { name: "Bite", ident: "bite", dice: "2d6", dmg: "piercing", ability: "str", cursed: true },
        { name: "Claw", ident: "claw", dice: "1d10", dmg: "slashing", ability: "str" }
      ], specials: ["Amphibious"] }
  },
  snake: {
    animal: { size: "sm", ac: "11 + @abilities.dex.mod", acFlat: 13, move: { walk: 30, swim: 30 }, blindsight: 10,
      attacks: [{ name: "Bite", ident: "bite", dice: "1d4", dmg: "piercing", ability: "dex",
                  extra: "1d4", extraType: "poison", cursed: true }],
      specials: [] },
    hybrid: { size: "sm", ac: "11 + @abilities.dex.mod", acFlat: 13, move: { walk: 30 }, blindsight: 10,
      attacks: [{ name: "Bite", ident: "bite", dice: "1d6", dmg: "piercing", ability: "dex",
                  extra: "1d4", extraType: "poison", cursed: true }],
      specials: [] }
  },
  wolf:  {
    animal: { size: "med", ac: "12 + @abilities.dex.mod", acFlat: 14, move: { walk: 40 },
      attacks: [{ name: "Bite", ident: "bite", dice: "2d4", dmg: "piercing", ability: "str", cursed: true }],
      specials: [] },
    hybrid: { size: "med", ac: "12 + @abilities.dex.mod", acFlat: 14, move: { walk: 40 },
      attacks: [
        { name: "Bite", ident: "bite", dice: "1d8", dmg: "piercing", ability: "str", cursed: true },
        { name: "Claw", ident: "claw", dice: "1d6", dmg: "slashing", ability: "str" }
      ], specials: [] }
  }
};

const FLAWS = [
  ["Dominance", "I will hunt and even kill other Therianthropes to show I am the leader."],
  ["Violent", "I enjoy starting fights in the hope of seeing bloodshed."],
  ["Timidity", "I am frightened by displays of power greater than my own."],
  ["Nightmares", "My nights bring me glimpses of violent acts. Are these hallucinations, or broken memories?"],
  ["Possessive", "I will not allow anyone to touch anything that belongs to me. They might take it from me!"],
  ["The Hunt", "In my dreams, I am hunting. Every dream brings me slightly closer to success."],
  ["Restlessness", "I struggle with a sense of restlessness and unease that drives me to roam and hunt."],
  ["Feral", "I express myself through animalistic mannerisms: growling, snarling, purring, and the like."],
  ["Picky Eater", "I will only eat raw meat; the fresher, the better."],
  ["Paranoia", "I fear that those around me will learn what I am and make me their prey."]
];

const BRANCH_FEATURES = {
  bear: [
    { stage: 5, name: "Ursine Grip", ident: "ursine-grip",
      text: "When you hit a creature with your Claw attack while transformed, that creature is also grappled (escape DC equals your Therianthrope DC). You can have only one creature grappled in this way at a time." },
    { stage: 7, name: "Enduring Hide", ident: "enduring-hide",
      text: "When you transform, you gain temporary hit points equal to your Stage plus your Constitution modifier." },
    { stage: 9, name: "Maul", ident: "maul",
      text: "Once per turn while transformed, when you hit the same creature with a second natural weapon attack in the same turn, the attack deals an extra 2d8 damage and the target must succeed on a Strength saving throw against your Therianthrope DC or have the Prone condition.", activity: "maul-damage" }
  ],
  fox: [
    { stage: 5, name: "Cunning Escape", ident: "cunning-escape",
      text: "While transformed, you can take the Disengage action as a Bonus Action." },
    { stage: 7, name: "Slippery", ident: "slippery",
      text: "While transformed, opportunity attacks made against you have disadvantage." },
    { stage: 9, name: "Ninefold Wiles", ident: "ninefold-wiles",
      text: "When you roll Initiative, you can use your Reaction to transform. If you would be Surprised, spending this Reaction prevents it. You cannot be Surprised while transformed.", activity: "ninefold-wiles" }
  ],
  raven: [
    { stage: 5, name: "Ominous Gaze", ident: "ominous-gaze",
      text: "When you hit a creature with a natural weapon attack while transformed, you can fix it with an ominous gaze. Until the end of your next turn, that creature has disadvantage on the next saving throw it makes against your Therianthrope DC." },
    { stage: 7, name: "Flyby", ident: "flyby",
      text: "While transformed, you do not provoke opportunity attacks when you fly out of a creature's reach.", activity: "flyby" },
    { stage: 9, name: "Death's Witness", ident: "deaths-witness",
      text: "When you reduce a creature to 0 hit points while transformed, each enemy creature of your choice within 10 feet of it must succeed on a Wisdom saving throw against your Therianthrope DC or have the Frightened condition until the end of your next turn.", activity: "deaths-witness" }
  ],
  tiger: [
    { stage: 5, name: "Pounce", ident: "pounce",
      text: "While transformed, if you move at least 20 feet straight toward a creature and then hit it with a natural weapon attack, the target must succeed on a Strength saving throw against your Therianthrope DC or have the Prone condition.", activity: "pounce" },
    { stage: 7, name: "Stalker's Prowl", ident: "stalkers-prowl",
      text: "While transformed, once per turn when you hit a creature with a natural weapon attack while you are hidden from it, the attack deals an extra 2d8 damage. At Stage 9 this extra damage increases to 2d12.", activity: "stalkers-prowl" },
    { stage: 9, name: "Apex Strike", ident: "apex-strike",
      text: "While transformed, your natural weapon attacks score a critical hit on a roll of 19 or 20. In addition, the extra damage from Stalker's Prowl increases to 2d12." }
  ],
  shark: [
    { stage: 5, name: "Blood Frenzy", ident: "blood-frenzy",
      text: "While transformed, you have advantage on attack rolls against creatures that are below their hit point maximum." },
    { stage: 7, name: "Rending Bite", ident: "rending-bite",
      text: "While transformed, when you hit a creature with your Bite, it cannot regain hit points until the end of your next turn.", activity: "rending-bite" },
    { stage: 9, name: "Feeding Frenzy", ident: "feeding-frenzy",
      text: "While transformed, when you deal damage with your Bite to a creature, you regain hit points equal to half the damage dealt.", activity: "feeding-frenzy" }
  ],
  snake: [
    { stage: 5, name: "Venomous Bite", ident: "venomous-bite",
      text: "While transformed, when you hit a creature with your Bite, it must succeed on a Constitution saving throw against your Therianthrope DC or have the Poisoned condition and take an extra 2d4 poison damage. At Stage 7 the extra damage increases to 2d6, and at Stage 9 to 2d8.", activity: "venomous-bite" },
    { stage: 7, name: "Shed Skin", ident: "shed-skin",
      text: "While transformed, you can use a Bonus Action to end one effect on yourself that is grappling or restraining you or reducing your speed. Once you use this feature, you cannot do so again until that transformation ends.", activity: "shed-skin" },
    { stage: 9, name: "Virulent Venom", ident: "virulent-venom",
      text: "While transformed, once per round when a creature fails the saving throw against your Venomous Bite, it takes the venom damage again at the start of its next turn.", activity: "virulent-venom" }
  ],
  wolf: [
    { stage: 5, name: "Trip", ident: "trip",
      text: "While transformed, when you hit a creature with your Bite, it must succeed on a Strength saving throw against your Therianthrope DC or have the Prone condition.", activity: "trip" },
    { stage: 7, name: "Pack Tactics", ident: "pack-tactics",
      text: "While transformed, you have advantage on attack rolls against a creature if at least one of your allies is within 5 feet of it and that ally does not have the Incapacitated condition." },
    { stage: 9, name: "Alpha Howl", ident: "alpha-howl",
      text: "While transformed, you can use a Bonus Action to loose a commanding howl. Each ally of your choice within 30 feet that can hear you gains temporary hit points equal to your Stage and advantage on the next attack roll it makes before the end of your next turn.", activity: "alpha-howl" }
  ]
};

const GIFTS = [
  // Control - Minor
  { name: "Growing Control", side: "control", tier: "minor", ident: "gift-growing-control", cpDelta: 1,
    text: "Your maximum number of Control Points increases by 1." },
  { name: "Extended Form", side: "control", tier: "minor", ident: "gift-extended-form",
    text: "Your Controlled Transformation lasts a number of hours equal to your Stage instead of half your Stage." },
  { name: "Adorned Beast", side: "control", tier: "minor", ident: "gift-adorned-beast", keep: ["items"],
    text: "When you use Controlled Transformation, your equipment continues to be worn if your new form could physically wear it. You cannot benefit from magic items through this feature unless you also have the Hybrid Mastery gift." },
  { name: "Careful Control", side: "control", tier: "minor", ident: "gift-careful-control", srRefund: 1,
    text: "Whenever you finish a Short Rest, you regain 1 spent Control Point." },
  // Control - Major
  { name: "Tireless Beast", side: "control", tier: "major", ident: "gift-tireless-beast",
    text: "You no longer gain a level of Exhaustion when a Controlled Transformation ends." },
  { name: "Anchored Mind", side: "control", tier: "major", ident: "gift-anchored-mind",
    keep: ["languages", "class", "feats"],
    text: "You retain your languages, proficiencies, and class features during Controlled Transformation. You still cannot cast spells that require Somatic components." },
  { name: "Hybrid Mastery", side: "control", tier: "major", ident: "gift-hybrid-mastery", keep: ["items"],
    text: "Your Hybrid Form becomes an option for Controlled Transformation. Because the Hybrid Form has the physique for it, you can benefit from attuned magic items and their properties while transformed; you still cannot use any item your current form lacks the physique to use." },
  { name: "Tapped Instinct", side: "control", tier: "major", ident: "gift-tapped-instinct", activity: "tapped-instinct",
    text: "While not transformed, you can spend 1 Control Point as a Bonus Action to heighten your body's capabilities for 1 minute, gaining the benefits of Bestial Aspect, Wild Regeneration, and Feral Speed." },
  // Control - Grand
  { name: "True Mastery", side: "control", tier: "grand", ident: "gift-true-mastery", cpDelta: 1,
    text: "You have mastered the curse. Unwilling Transformation triggers only from the Planar Tear; you never gain Exhaustion from transforming; you can use Controlled Transformation as a Bonus Action; and your maximum number of Control Points increases by 1." },
  // Embrace - Minor
  { name: "Animal Rage", side: "embrace", tier: "minor", ident: "gift-animal-rage", cpDelta: -1,
    text: "Your maximum number of Control Points is reduced by 1. Choose one natural weapon from your Hybrid Form; you gain access to it while not transformed." },
  { name: "Savage Hunger", side: "embrace", tier: "minor", ident: "gift-savage-hunger", cpDelta: -1,
    text: "Your maximum number of Control Points is reduced by 1. Once per turn while transformed, when you hit with a natural weapon attack, the attack deals an extra 1d6 damage." },
  { name: "Ravenous Regeneration", side: "embrace", tier: "minor", ident: "gift-ravenous-regeneration", cpDelta: -1,
    text: "Your maximum number of Control Points is reduced by 1. Wild Regeneration heals an extra amount equal to half your proficiency bonus (rounded down)." },
  { name: "Press the Hunt", side: "embrace", tier: "minor", ident: "gift-press-the-hunt", cpDelta: -1,
    text: "Your maximum number of Control Points is reduced by 1. The first time each turn that you deal damage with a natural weapon, you gain temporary hit points equal to half your proficiency bonus (rounded down)." },
  // Embrace - Major (all carry the shared rider)
  { name: "Primal Vigour", side: "embrace", tier: "major", ident: "gift-primal-vigour", cpDelta: -1,
    text: "Your maximum number of Control Points is reduced by 1. You can use Wild Regeneration while not transformed." },
  { name: "Cursed Fury", side: "embrace", tier: "major", ident: "gift-cursed-fury", cpDelta: -1,
    changes: [{ key: "system.bonuses.mwak.attack", mode: 2, value: "floor(@prof / 2)" }],
    text: "Your maximum number of Control Points is reduced by 1. Add half your proficiency bonus (rounded down) to attack rolls with Natural Weapons." },
  { name: "Thick Hide", side: "embrace", tier: "major", ident: "gift-thick-hide", cpDelta: -1,
    changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: "floor(@prof / 2)" }],
    text: "Your maximum number of Control Points is reduced by 1. Add half your proficiency bonus (rounded down) to your Armor Class." },
  { name: "Swift Hunt", side: "embrace", tier: "major", ident: "gift-swift-hunt", cpDelta: -1,
    text: "Your maximum number of Control Points is reduced by 1. The speed bonus from Feral Speed is doubled." },
  // Embrace - Grand
  { name: "Beast Within", side: "embrace", tier: "grand", ident: "gift-beast-within", cpDelta: -1,
    text: "Your maximum number of Control Points is reduced by 1. While not transformed, you gain the benefits of your Key Ability Floor, all of your form's natural weapons, Feral Speed, and all Empowered Transformation bonuses. While transformed and below half your hit point maximum but above 0 hit points, you regain 10 hit points at the start of each of your turns." }
];

const EMBRACE_MAJOR_RIDER = " In addition, when you would make a saving throw against your Unwilling Transformation feature, you can choose to roll with Disadvantage. If this is the second Major Embrace gift you have taken, you can instead choose to fail the save.";

/* -------------------------------------------- */
/*  Document factories                          */
/* -------------------------------------------- */

/* ----- pack folders ----- */
// Compendium packs only support folder nesting up to depth 3, so leaves are
// flat under their depth-2 groups and items inside them are sorted manually.
const folderDocs = [];
function folder(slug, name, parent = null, { sort = 0, sorting = "a" } = {}) {
  const fid = id(`folder:${slug}`);
  folderDocs.push({
    _id: fid, _key: `!folders!${fid}`, name, type: "Item",
    folder: parent, color: null, sort: sort * 10, sorting, flags: {}
  });
  return fid;
}

const F_ROOT = folder("therianthrope", "Therianthrope", null, { sorting: "m" });
const F_FEATURES = folder("features", "Features", F_ROOT, { sort: 0, sorting: "m" });
const F_STAGE = {}; // stage -> folder id
for ( let s = 1; s <= 10; s++ ) {
  F_STAGE[s] = folder(`features-s${s}`, `Stage ${s}`, F_FEATURES, { sort: s });
}
const F_PATHS = folder("paths", "Paths", F_ROOT, { sort: 1, sorting: "m" });
const F_PATH_BRANCH = {}; // branch -> folder id
Object.keys(BRANCHES).forEach((b, bi) => {
  F_PATH_BRANCH[b] = folder(`paths-${b}`, BRANCHES[b].name, F_PATHS, { sort: bi, sorting: "m" });
});
const F_GIFTS = folder("gifts", "Gifts", F_ROOT, { sort: 2, sorting: "m" });
const F_GIFT_SIDE = {}; // side -> folder id
[["control", "Control", 0], ["embrace", "Embrace", 1]].forEach(([side, label, si]) => {
  F_GIFT_SIDE[side] = folder(`gifts-${side}`, label, F_GIFTS, { sort: si, sorting: "m" });
});
const F_MILESTONES = folder("milestones", "Milestones", F_ROOT, { sort: 3, sorting: "m" });
const F_MS = {
  standard: folder("ms-standard", "Standard", F_MILESTONES, { sort: 0, sorting: "m" }),
  control: folder("ms-control", "Control", F_MILESTONES, { sort: 1, sorting: "m" }),
  embrace: folder("ms-embrace", "Embrace", F_MILESTONES, { sort: 2, sorting: "m" })
};

/** Stage at which each class-level feature is granted. */
const FEATURE_STAGE = {
  "flaw-mitigation": 3, "feral-speed": 4, "empowered-transformation": 4,
  "predators-resurgence": 8, "control-points": 2, "wild-regeneration": 2
};

function feat(name, ident, description, extra = {}) {
  const docId = id(`feat:${ident}`);
  if ( extra.effects ) {
    for ( const e of extra.effects ) e._key = `!items.effects!${docId}.${e._id}`;
  }
  const doc = {
    _id: docId,
    _key: `!items!${docId}`,
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

function milestone(name, ident, description, opts = {}) {
  return {
    _id: id(`ms:${ident}`),
    _key: `!items!${id(`ms:${ident}`)}`,
    name, type: "advancement-classes.advancement-milestone",
    img: opts.img ?? "icons/magic/symbols/star-rising-purple.webp",
    folder: opts.folder ?? F_MS.standard,
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

function callingMilestone(stage, key) {
  const tiers = { 2: ["minor"], 4: ["minor"], 6: ["minor", "major"], 8: ["minor", "major"], 10: ["minor", "major", "grand"] }[stage];
  const label = key === "control" ? "Control" : "Embrace";
  return milestone(`Calling: ${label} (Stage ${stage})`, `calling-${key}-s${stage}`,
    `Commit yourself to the path of ${label} and claim a gift of the curse. Completing this Calling removes the alternative offered alongside it. A Grand gift may only be claimed by one who already holds at least two Minor and two Major gifts of the same Calling - full commitment to a single side is rewarded.`, {
      type: "calling",
      folder: F_MS[key],
      sort: stage,
      img: key === "control"
        ? "icons/magic/symbols/rune-sigil-rough-white-teal.webp"
        : "icons/magic/symbols/rune-sigil-red-orange.webp",
      calling: {
        choiceSet: "therianthrope-calling",
        choiceKey: key,
        giftSource: ITEM_PACK,
        giftTiers: tiers
      }
    });
}

/* ---------- activities ---------- */

function baseActivity(type, name, extra = {}) {
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

const cpConsume = amount => [{ type: "itemUses", target: "control-points", value: String(amount), scaling: { mode: "", formula: "" } }];

function transformActivity(name, profiles, minimumAC = "") {
  return baseActivity("transform", name, {
    activation: "action",
    consume: cpConsume(1),
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

function saveActivity(name, ability, dcCalc = "con", extra = {}) {
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

/* ---------- form NPCs ---------- */

function weaponItem(formSlug, atk, actorId) {
  const wid = id(`wpn:${formSlug}:${atk.ident}`);
  const item = {
    _id: wid,
    _key: `!actors.items!${actorId}.${wid}`,
    name: atk.name, type: "weapon",
    img: "systems/dnd5e/icons/svg/items/weapon.svg",
    system: {
      identifier: atk.ident,
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
        base: { number: 1, denomination: Number(atk.dice.replace(/\d*d/, "")) || null,
                number2: null, custom: { enabled: false } },
        versatile: { number: null, denomination: null, types: [], custom: { enabled: false } }
      },
      quantity: 1
    },
    flags: {}
  };

  const parts = [];
  if ( atk.extra ) parts.push({ number: 1, denomination: Number(atk.extra.replace(/\d*d/, "")), bonus: "", types: [atk.extraType], custom: { enabled: false } });
  item.system.damage.base.number = Number(atk.dice.match(/^(\d*)d/)?.[1] ?? 1);
  if ( atk.dice === "1" ) item.system.damage.base = { number: null, denomination: null, bonus: "", types: [atk.dmg], custom: { enabled: false } };

  const atkAct = baseActivity("attack", `${formSlug}-${atk.ident}`, {
    data: {
      attack: { critical: { threshold: null }, flat: false, type: { value: "", classification: "" }, ability: atk.ability, bonus: "" },
      damage: { critical: { bonus: "" }, includeBase: true, parts }
    }
  });
  item.system.activities[atkAct._id] = atkAct;
  // fix damage.base shape
  if ( atk.dice !== "1" ) {
    item.system.damage.base = {
      number: Number(atk.dice.match(/^(\d*)d/)?.[1] ?? 1),
      denomination: Number(atk.dice.match(/d(\d+)/)?.[1]),
      bonus: "", types: [atk.dmg], custom: { enabled: false }
    };
  }

  if ( atk.cursed ) {
    const curseEffId = effId(`curse:${formSlug}:${atk.ident}`);
    const curseAct = saveActivity(
      `Curse ${formSlug} ${atk.ident}`, "con", "con", {
        affects: "creature", affectCount: "1",
        appliedEffects: [{ _id: curseEffId }]
      });
    curseAct.name = "Therianthrope's Curse";
    item.system.activities[curseAct._id] = curseAct;
    item.effects = [{
      _id: curseEffId,
      _key: `!actors.items.effects!${actorId}.${wid}.${curseEffId}`,
      name: "Therianthrope's Curse",
      img: "systems/dnd5e/icons/svg/statuses/transformed.svg",
      type: "base", transfer: false, disabled: false,
      changes: [], duration: {}, origin: null, tint: "#ffffff",
      description: "The target is cursed. Unless the curse is removed before the next Planar Tear, the target gains Stage 1 of the Therianthrope advancement class.",
      statuses: [], flags: { "advancement-classes": { cursed: true } }
    }];
  }
  return item;
}

function formNPC(branchKey, kind) {
  const spec = FORMS[branchKey][kind];
  const branch = BRANCHES[branchKey];
  const nid = id(`form:${branchKey}:${kind}`);
  const items = spec.attacks.map(a => weaponItem(`${branchKey}-${kind}`, a, nid));

  const abilities = {};
  for ( const ab of ["str", "dex", "con", "int", "wis", "cha"] ) {
    abilities[ab] = { value: { str: 16, dex: 14, con: 14, int: 3, wis: 12, cha: 6 }[ab], proficient: 0 };
  }
  const senses = { darkvision: 60, blindsight: spec.blindsight ?? null, tremorsense: null, truesight: null, units: "ft", special: "" };

  return {
    _id: nid,
    _key: `!actors!${nid}`,
    name: `Were${branch.name.toLowerCase()} (${kind === "animal" ? "Animal" : "Hybrid"})`,
    type: "npc",
    img: "systems/dnd5e/icons/svg/monster.svg",
    system: {
      identifier: `therianthrope-${branchKey}-${kind}`,
      abilities,
      attributes: {
        ac: { flat: spec.acFlat, calc: "flat" },
        hp: { value: 30, max: 30, temp: null, tempmax: null },
        init: { ability: "", roll: {}, bonus: "" },
        movement: { units: "ft", hover: false, ...spec.move },
        senses
      },
      details: {
        alignment: branch.alignment,
        type: { value: "beast", subtype: "therianthrope" },
        cr: 1,
        biography: { value: `<p>The ${kind} form of a Therianthrope of the ${branch.name} branch.</p>`, public: "" }
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
    flags: { "advancement-classes": { formAC: spec.ac } },
    prototypeToken: {
      name: `Were${branch.name.toLowerCase()} (${kind === "animal" ? "Animal" : "Hybrid"})`, actorLink: true, sight: { enabled: true },
      width: TOKEN_SIZE[spec.size] ?? 1, height: TOKEN_SIZE[spec.size] ?? 1,
      disposition: -1, texture: { src: "systems/dnd5e/icons/svg/monster.svg" }
    }
  };
}

/* -------------------------------------------- */
/*  Feature text                                */
/* -------------------------------------------- */

const FEATURE_TEXT = {
  unwilling: `<p>The curse overwhelms your body at times of great stress, or when the moon is fullest, forcing you to transform.</p>
<p><strong>Triggers.</strong> When your hit points are reduced below half your maximum, or when you see an ally reduced to 0 hit points, you must succeed on a Wisdom saving throw against your Therianthrope DC or transform into your Hybrid Form for up to 10 minutes. During that time you must attack the source of the damage. If you are reduced to 0 hit points, the transformation ends.</p>
<p><strong>Planar Tear.</strong> For three nights each month the Planar Tear bathes the world in magical light. When it occurs you must make the same saving throw: on a failure you transform into your Hybrid Form, and on a success into your Animal Form, remaining transformed until morning.</p>
<p>When you revert to your normal form after an Unwilling Transformation, you gain 1 level of Exhaustion. While transformed, you ignore all levels of Exhaustion.</p>
<p>When one of these triggers occurs, roll the appropriate saving throw using the activities on this feature; on a failure, use the Transform activity to assume your Hybrid Form.</p>
<p><em>Therianthrope DC = 8 + your proficiency bonus + your Constitution modifier.</em></p>`,
  controlling: `<p>You have gained a small measure of control over the curse. You gain 1 Control Point, which you can spend to transform into your Animal Form as an Action using the activity on this feature. You regain all expended Control Points when you finish a Long Rest. Your Control Point maximum increases as you gain Stages (@scale.therianthrope.control-points).</p>
<p>A Controlled Transformation lasts a number of hours equal to half your Stage (rounded down). It ends early if you are reduced to 0 hit points or if you dismiss it as a Bonus Action. When the duration would expire, you can spend 1 additional Control Point to extend it by the same duration. Reverting from any transformation inflicts 1 level of Exhaustion; while transformed you ignore all Exhaustion.</p>`,
  wildRegen: `<p>While transformed, when you take damage that is not silvered, you can use your Reaction to harden your flesh and regenerate, regaining hit points equal to a roll of @scale.therianthrope.wild-regen.</p>`,
  flawMitigation: `<p>Your growing mastery lets you blunt the curse's compulsions. This feature improves as you gain Stages:</p>
<ul>
<li><strong>Stage 3.</strong> When reduced below half your hit point maximum would trigger an Unwilling Transformation, you can instead spend 1 Control Point to transform via Controlled Transformation.</li>
<li><strong>Stage 4.</strong> The above also applies when witnessing an ally reduced to 0 hit points.</li>
<li><strong>Stage 5.</strong> During the Planar Tear you can spend 1 Control Point to automatically succeed on the saving throw, transforming into your Animal Form.</li>
<li><strong>Stage 6.</strong> You have advantage on the saving throw triggered by being reduced below half your hit point maximum.</li>
<li><strong>Stage 7.</strong> You have advantage on that save and on the save triggered by witnessing an ally reduced to 0 hit points.</li>
<li><strong>Stage 8.</strong> An Unwilling Transformation no longer forces you to attack the damage's source.</li>
<li><strong>Stage 9.</strong> At the end of each of your turns during an Unwilling Transformation you can repeat the saving throw, ending the transformation on a success.</li>
<li><strong>Stage 10.</strong> You can choose to succeed on any saving throw against your Unwilling Transformation.</li>
</ul>`,
  bestialAspect: branch => `<p>While transformed, you manifest your animal's ${branch.aspect}</p>`,
  feralSpeed: `<p>While transformed, your speed increases by 10 feet.</p>`,
  empowered: `<p>Your transformations grow more potent:</p>
<ul>
<li><strong>Stage 4 (I).</strong> Your natural weapons count as magical for the purpose of overcoming resistance and immunity to nonmagical damage, except against other Therianthropes.</li>
<li><strong>Stage 6 (II).</strong> Your signature attack deals extra damage equal to your Constitution modifier.</li>
<li><strong>Stage 8 (III).</strong> The extra damage applies to all your natural weapon attacks while transformed. In addition, when you take the Attack action using Therianthrope natural weapons, you can make one additional natural weapon attack as a Bonus Action.</li>
</ul>`,
  resurgence: `<p>Once per Long Rest while not transformed, when you are reduced to 0 hit points you can use your Reaction to drop to 1 hit point instead, regain hit points equal to your Stage, and immediately trigger an Unwilling Transformation as though the damage source had reduced you below half your hit point maximum.</p>`
};

/* -------------------------------------------- */
/*  Milestone tables                            */
/* -------------------------------------------- */

const CLASS_MILESTONES = {
  1: [
    ["Transformation: Wounded", "ms-s1-half-hp", "Transform once after being reduced below half your hit point maximum.", { max: 1 }],
    ["Transformation: Ally Felled", "ms-s1-ally", "Transform once after witnessing an ally reduced to 0 hit points.", { max: 1 }],
    ["Transformation: Planar Tear", "ms-s1-tear", "Transform 3 times due to the Planar Tear.", { max: 3 }]
  ],
  2: [
    ["Exert the Curse", "ms-s2-cp", "Spend 10 Control Points.", { max: 10, event: "consume:control-points" }],
    ["Flesh That Knits", "ms-s2-regen", "Mitigate a total of 30 damage using Wild Regeneration.", { max: 30, event: "heal:wild-regeneration" }]
  ],
  3: [
    ["Seized Reins", "ms-s3-control", "Take control of an Unwilling Transformation 3 times.", { max: 3 }]
  ],
  4: [
    ["Seized Reins II", "ms-s4-control", "Take control of an Unwilling Transformation 5 times.", { max: 5 }],
    ["Bound of the Beast", "ms-s4-travel", "Travel 80 feet in one turn while transformed during Initiative.", { max: 1, type: "manual" }]
  ],
  5: [
    ["Calm in the Tear", "ms-s5-tear", "Spend 3 Control Points to automatically succeed on saving throws during the Planar Tear.", { max: 3, event: "consume:control-points" }]
  ],
  6: [
    ["Mark of the Curse", "ms-s6-bite", "Hit 10 different enemy creatures with your Bite.", { max: 10, event: "attackHit:bite,attackHit:peck,attackHit:beak", unique: true }],
    ["Iron Will", "ms-s6-saves", "Succeed on 5 saving throws to resist Unwilling Transformation (any trigger).", { max: 5 }]
  ],
  7: [
    ["Iron Will II", "ms-s7-saves", "Succeed on 10 saving throws to resist Unwilling Transformation (any trigger).", { max: 10 }]
  ],
  8: [
    ["Overwhelming Fury", "ms-s8-attacks", "Make 10 extra attacks with Empowered Transformation III.", { max: 10 }],
    ["Death Defied", "ms-s8-resurgence", "Trigger Predator's Resurgence once.", { max: 1, event: "use:predators-resurgence" }]
  ],
  9: [
    ["Tamed Terror", "ms-s9-end", "End an Unwilling Transformation 5 times.", { max: 5 }]
  ],
  10: []
};

const BRANCH_MILESTONES = {
  bear: {
    3: ["Ursine Instincts", "Succeed on 10 Perception or Survival checks.", { max: 10, event: "skillSuccess:prc,skillSuccess:sur" }],
    5: ["Crushing Embrace", "Grapple 5 different enemies.", { max: 5, unique: true }],
    7: ["Stoic Hide", "Gain 50 temporary hit points from Enduring Hide.", { max: 50 }],
    9: ["Bear's Maul", "Deal an extra 30 damage to enemies with Maul.", { max: 30, event: "damage:maul" }]
  },
  fox: {
    3: ["Vulpine Eyes", "Succeed on 10 Perception checks.", { max: 10, event: "skillSuccess:prc" }],
    5: ["Uncatchable", "Disengage from 5 different enemies in melee.", { max: 5, unique: true }],
    7: ["Untouchable", "Have 5 different enemies miss you with opportunity attacks.", { max: 5, unique: true }],
    9: ["Nine Lives", "Transform using Ninefold Wiles 10 times.", { max: 10, event: "use:ninefold-wiles" }]
  },
  raven: {
    3: ["Corvid Cunning", "Succeed on 10 Deception checks.", { max: 10, event: "skillSuccess:dec" }],
    5: ["Doomed Gaze", "Have 3 different enemy creatures fail a saving throw against your DC while affected by Ominous Gaze.", { max: 3, unique: true }],
    7: ["Winged Death", "Perform 10 Flyby Strikes.", { max: 10, event: "use:flyby" }],
    9: ["Herald of Ends", "Affect 10 different enemy creatures with Death's Witness.", { max: 10, event: "use:deaths-witness", unique: true }]
  },
  tiger: {
    3: ["Silent Prowl", "Succeed on 10 Perception or Stealth checks.", { max: 10, event: "skillSuccess:prc,skillSuccess:ste" }],
    5: ["First Pounce", "Pounce on 5 different enemy creatures.", { max: 5, event: "use:pounce", unique: true }],
    7: ["Ambush Predator", "Deal 30 damage with Stalker's Prowl.", { max: 30, event: "damage:stalkers-prowl" }],
    9: ["Apex Executioner", "Score 5 critical hits against enemy creatures while transformed.", { max: 5 }]
  },
  shark: {
    3: ["Hunter's Eye", "Succeed on 10 Perception checks.", { max: 10, event: "skillSuccess:prc" }],
    5: ["Feeding Frenzy", "Hit 5 different enemy creatures while benefiting from Blood Frenzy.", { max: 5, unique: true }],
    7: ["Open Wounds", "Affect 10 different enemies with Rending Bite.", { max: 10, event: "use:rending-bite", unique: true }],
    9: ["Devour", "Regain 30 hit points from enemies with Feeding Frenzy.", { max: 30 }]
  },
  snake: {
    3: ["Serpent's Watch", "Succeed on 10 Perception checks.", { max: 10, event: "skillSuccess:prc" }],
    5: ["Venom in the Veins", "Affect 5 different enemy creatures with Venomous Bite.", { max: 5, event: "use:venomous-bite", unique: true }],
    7: ["Shed the Old", "Use Shed Skin against 3 different enemies.", { max: 3, event: "use:shed-skin", unique: true }],
    9: ["Pitiless Poison", "Affect 10 different enemy creatures with Virulent Venom.", { max: 10, event: "use:virulent-venom", unique: true }]
  },
  wolf: {
    3: ["Wolf's Vigil", "Succeed on 10 Perception checks.", { max: 10, event: "skillSuccess:prc" }],
    5: ["Hamstring", "Trip 5 different enemy creatures.", { max: 5, event: "use:trip", unique: true }],
    7: ["Pack Hunter", "Hit 15 different enemies with attacks benefiting from Pack Tactics.", { max: 15, unique: true }],
    9: ["Voice of the Pack", "Use Alpha Howl 10 times.", { max: 10, event: "use:alpha-howl" }]
  }
};

/* -------------------------------------------- */
/*  Build documents                             */
/* -------------------------------------------- */

const items = [];
const actors = [];
const journals = [];
const out = { items, actors, journals };

/* ----- form NPCs ----- */
for ( const branch of Object.keys(BRANCHES) ) {
  actors.push(formNPC(branch, "animal"));
  actors.push(formNPC(branch, "hybrid"));
}

/* ----- core feats ----- */

const IMG_UNWILLING = "icons/creatures/magical/humanoid-horned-rider.webp";
const IMG_CONTROLLING = "icons/magic/nature/wolf-paw-glow-large-orange.webp";
const IMG_CONTROL_POINTS = "icons/creatures/mammals/wolf-howl-moon-forest-blue.webp";
const IMG_WILD_REGEN = "icons/magic/life/ankh-shadow-green.webp";
const IMG_FLAW = "icons/creatures/abilities/mouth-teeth-rows-red.webp";
const IMG_MILESTONE = "icons/magic/symbols/star-rising-purple.webp";
const IMG_CALLING_CONTROL = "icons/magic/symbols/rune-sigil-rough-white-teal.webp";
const IMG_CALLING_EMBRACE = "icons/magic/symbols/rune-sigil-red-orange.webp";
const IMG_FEAT = "systems/dnd5e/icons/svg/items/feature.svg";
const IMG_CLASS = "systems/dnd5e/icons/svg/items/class.svg";
const IMG_SUBCLASS = "systems/dnd5e/icons/svg/subclass.svg";
const IMG_NPC = "systems/dnd5e/icons/svg/monster.svg";
const IMG_JOURNAL = "icons/svg/book.svg";

const animalProfiles = Object.keys(BRANCHES).map(b => ({
  _id: actId(`profile:${b}:animal`), name: "Animal Form",
  uuid: ACTOR_UUID(id(`form:${b}:animal`)), cr: "", level: { min: null, max: null },
  movement: [], sizes: [], types: []
}));
const hybridProfiles = Object.keys(BRANCHES).map(b => ({
  _id: actId(`profile:${b}:hybrid`), name: "Hybrid Form",
  uuid: ACTOR_UUID(id(`form:${b}:hybrid`)), cr: "", level: { min: null, max: null },
  movement: [], sizes: [], types: []
}));
const branchProfiles = b => [
  animalProfiles.find(p => p.uuid === ACTOR_UUID(id(`form:${b}:animal`))),
  hybridProfiles.find(p => p.uuid === ACTOR_UUID(id(`form:${b}:hybrid`)))
];

// Per-branch Unwilling Transformation: each variant carries only that
// branch's Animal and Hybrid profiles, so the correct forms appear.
for ( const b of Object.keys(BRANCHES) ) {
  const acts = {};
  for ( const [key, name] of [
    ["half-hp", "Save: Reduced Below Half HP"],
    ["ally", "Save: Ally Reduced to 0 HP"],
    ["tear", "Save: Planar Tear"]
  ] ) {
    const act = saveActivity(`${b}-${key}`, "wis");
    act.name = name;
    acts[act._id] = act;
  }
  const tf = transformActivity("Transform", branchProfiles(b));
  tf.activation.type = "special";
  tf.consumption.targets = [];
  acts[tf._id] = tf;
  items.push(feat(`Unwilling Transformation - ${BRANCHES[b].name}`, `unwilling-transformation-${b}`,
    FEATURE_TEXT.unwilling, { activities: acts, img: IMG_UNWILLING, folder: F_PATH_BRANCH[b], sort: 10 }));
}

// Per-branch Controlling the Curse: the Controlled Transformation only
// offers that branch's Animal Form.
for ( const b of Object.keys(BRANCHES) ) {
  const ct = transformActivity("Controlled Transformation",
    [animalProfiles.find(p => p.uuid === ACTOR_UUID(id(`form:${b}:animal`)))]);
  items.push(feat(`Controlling the Curse - ${BRANCHES[b].name}`, `controlling-the-curse-${b}`,
    FEATURE_TEXT.controlling, { activities: { [ct._id]: ct }, img: IMG_CONTROLLING, folder: F_PATH_BRANCH[b], sort: 20 }));
}

items.push(feat("Control Points", "control-points",
  `<p>Control Points fuel the curse's deliberate gifts. You regain all expended Control Points when you finish a Long Rest. Maximum: @scale.therianthrope.control-points.</p>`,
  { uses: { max: "@scale.therianthrope.control-points", spent: 0, recovery: [{ period: "lr", type: "recoverAll" }] }, img: IMG_CONTROL_POINTS, folder: F_STAGE[2] }
));

const wrHeal = baseActivity("heal", "Wild Regeneration", {
  activation: "reaction", identifier: "wild-regeneration",
  data: {
    healing: { number: null, denomination: null, bonus: "", custom: { enabled: true, formula: "@scale.therianthrope.wild-regen" }, types: ["healing"], scaling: { number: 0 } }
  }
});
items.push(feat("Wild Regeneration", "wild-regeneration", FEATURE_TEXT.wildRegen, {
  activities: { [wrHeal._id]: wrHeal },
  flags: { "advancement-classes": { transform: { injectSelf: true } } },
  img: IMG_WILD_REGEN, folder: F_STAGE[2]
}));

items.push(feat("Flaw Mitigation", "flaw-mitigation", FEATURE_TEXT.flawMitigation, { folder: F_STAGE[3] }));

const fsEffect = {
  _id: effId("feral-speed"), name: "Feral Speed",
  changes: [{ key: "system.attributes.movement.walk", mode: 2, value: "10" }],
  disabled: false, icon: "icons/creatures/abilities/wolf-bite-maw-red.webp",
  duration: {}, flags: {}, origin: null, tint: "#ffffff", type: "base",
  description: "Your speed increases by 10 feet while transformed.", statuses: [], transfer: true
};
items.push(feat("Feral Speed", "feral-speed", FEATURE_TEXT.feralSpeed, {
  flags: { "advancement-classes": { transform: { effects: [fsEffect] } } },
  folder: F_STAGE[4]
}));
items.push(feat("Empowered Transformation", "empowered-transformation", FEATURE_TEXT.empowered, { folder: F_STAGE[4] }));
const prAct = baseActivity("utility", "Predator's Resurgence", { activation: "reaction" });
items.push(feat("Predator's Resurgence", "predators-resurgence", FEATURE_TEXT.resurgence, {
  activities: { [prAct._id]: prAct }, folder: F_STAGE[8]
}));

/* ----- flaws ----- */
for ( const [name, text] of FLAWS ) {
  const ident = `flaw-${name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`;
  items.push(feat(`Bestial Flaw: ${name}`, ident,
    `<p><strong>${name}.</strong> ${text}</p><p><em>A Bestial Flaw is a roleplaying compulsion granted by the curse; your GM adjudicates its effects.</em></p>`,
    { featType: "feat", img: IMG_FLAW, folder: F_STAGE[1] }));
}

/* ----- bestial aspects ----- */
for ( const [key, branch] of Object.entries(BRANCHES) ) {
  items.push(feat(`Bestial Aspect - ${branch.name}`, `bestial-aspect-${key}`,
    FEATURE_TEXT.bestialAspect(branch), { folder: F_PATH_BRANCH[key], sort: 30 }));
}

/* ----- branch features ----- */
const BRANCH_ACTIVITY_BUILDERS = {
  "maul-damage": (f) => baseActivity("damage", "Maul", { data: {
    damage: { critical: {}, includeBase: false, parts: [{ number: 2, denomination: 8, bonus: "", types: ["bludgeoning"], custom: { enabled: false } }] } } }),
  "stalkers-prowl": (f) => baseActivity("damage", "Stalker's Prowl", { data: {
    damage: { critical: {}, includeBase: false, parts: [{ number: 2, denomination: 8, bonus: "", types: ["piercing"], custom: { enabled: false } }] } } }),
  "feeding-frenzy": (f) => baseActivity("heal", "Feeding Frenzy", { data: {
    healing: { number: null, denomination: null, bonus: "", custom: { enabled: true, formula: "" }, types: ["healing"], scaling: { number: 0 } } } }),
  "ninefold-wiles": () => baseActivity("utility", "Ninefold Wiles", { activation: "reaction" }),
  "shed-skin": () => baseActivity("utility", "Shed Skin", { activation: "bonus" }),
  "alpha-howl": () => baseActivity("utility", "Alpha Howl", { activation: "bonus" }),
  "deaths-witness": () => saveActivity("Death's Witness", "wis", "con", { affects: "creature", affectCount: "5" }),
  "pounce": () => saveActivity("Pounce", "str"),
  "trip": () => saveActivity("Trip", "str"),
  "venomous-bite": () => saveActivity("Venomous Bite", "con"),
  "rending-bite": () => baseActivity("utility", "Rending Bite"),
  "virulent-venom": () => saveActivity("Virulent Venom", "con"),
  "flyby": () => baseActivity("utility", "Flyby Strike", { activation: "none" })
};

const branchFeatIds = {}; // key -> {5: ident, 7: ident, 9: ident}
for ( const [key, feats] of Object.entries(BRANCH_FEATURES) ) {
  branchFeatIds[key] = {};
  for ( const f of feats ) {
    const activities = {};
    if ( f.activity && BRANCH_ACTIVITY_BUILDERS[f.activity] ) {
      const act = BRANCH_ACTIVITY_BUILDERS[f.activity](f);
      activities[act._id] = act;
    }
    items.push(feat(f.name, f.ident, `<p>${f.text}</p>`, { activities, folder: F_PATH_BRANCH[key], sort: f.stage * 10 }));
    branchFeatIds[key][f.stage] = id(`feat:${f.ident}`);
  }
}

/* ----- gifts ----- */
const giftSortSeq = {}; // "side:tier" -> running index
for ( const g of GIFTS ) {
  const gk = `${g.side}:${g.tier}`;
  giftSortSeq[gk] = (giftSortSeq[gk] ?? 0) + 1;
  const text = g.side === "embrace" && g.tier === "major"
    ? `<p>${g.text}</p><p><em>${EMBRACE_MAJOR_RIDER.trim()}</em></p>`
    : `<p>${g.text}</p>`;
  const flags = { "advancement-classes": { gift: { side: g.side, tier: g.tier, class: "therianthrope" } } };
  if ( g.cpDelta ) flags["advancement-classes"].cpDelta = g.cpDelta;
  if ( g.keep ) flags["advancement-classes"].transform = { keep: g.keep };
  if ( g.srRefund ) flags["advancement-classes"].srRefund = { target: "control-points", amount: g.srRefund };
  const activities = {};
  const effs = (g.changes ?? []).map(c => ({
    _id: effId(g.ident + c.key), name: g.name, icon: "icons/magic/death/undead-ghost-screaming-teal.webp",
    changes: [{ key: c.key, mode: c.mode, value: c.value }], type: "base", transfer: true,
    disabled: false, duration: {}, origin: null, tint: "#ffffff", description: g.text, statuses: [], flags: {}
  }));
  if ( g.ident === "gift-tapped-instinct" ) {
    const tiEff = {
      _id: effId("tapped-instinct"), name: "Tapped Instinct",
      icon: "icons/magic/symbols/rune-sigil-horned-white-purple.webp",
      changes: [
        { key: "system.attributes.movement.walk", mode: 2, value: "10" },
        { key: "system.skills.prc.roll.mode", mode: 2, value: "1" },
        { key: "system.skills.sur.roll.mode", mode: 2, value: "1" }
      ],
      type: "base", transfer: false, disabled: false,
      duration: { seconds: 600 }, origin: null, tint: "#ffffff",
      description: g.text, statuses: [], flags: {}
    };
    const act = baseActivity("utility", "Tapped Instinct", {
      activation: "bonus", consume: cpConsume(1), affects: "self",
      effects: [{ _id: tiEff._id }]
    });
    activities[act._id] = act;
    activities[wrHeal._id] = wrHeal;
    effs.push(tiEff);
  }
  if ( g.ident === "gift-primal-vigour" ) activities[wrHeal._id] = wrHeal;
  if ( g.ident === "gift-hybrid-mastery" ) {
    const act = transformActivity("Controlled Transformation (Hybrid)", hybridProfiles);
    act._id = actId("gift:hybrid-mastery:transform");
    activities[act._id] = act;
  }
  items.push(feat(g.name, g.ident, text, { activities, effects: effs.length ? effs : undefined, flags, featType: "supernaturalGift", subtype: "blessing", folder: F_GIFT_SIDE[g.side], sort: { minor: 100, major: 200, grand: 300 }[g.tier] + giftSortSeq[gk],
    img: g.side === "control"
      ? "icons/magic/symbols/rune-sigil-horned-white-purple.webp"
      : "icons/magic/symbols/rune-sigil-white-pink.webp" }));
}

/* ----- milestones ----- */
const classMilestoneIds = {}; // stage -> { regular: [ids], calling: [ids] }
for ( const [stage, list] of Object.entries(CLASS_MILESTONES) ) {
  classMilestoneIds[stage] = { regular: [], calling: [] };
  for ( const [idx, [name, ident, text, opts]] of list.entries() ) {
    items.push(milestone(name, ident, text, { ...opts, sort: Number(stage) * 10 + idx }));
    classMilestoneIds[stage].regular.push(id(`ms:${ident}`));
  }
  if ( Number(stage) % 2 === 0 ) {
    for ( const key of ["control", "embrace"] ) {
      const ms = callingMilestone(Number(stage), key);
      items.push(ms);
      classMilestoneIds[stage].calling.push(ms._id);
    }
  }
}

const branchMilestoneIds = {}; // key -> {stage: id}
for ( const [key, stages] of Object.entries(BRANCH_MILESTONES) ) {
  branchMilestoneIds[key] = {};
  for ( const [stage, [name, text, opts]] of Object.entries(stages) ) {
    const ident = `ms-${key}-s${stage}`;
    items.push(milestone(`${BRANCHES[key].name}: ${name}`, ident, text, { ...opts, sort: Number(stage) * 10 + 5 }));
    branchMilestoneIds[key][stage] = id(`ms:${ident}`);
  }
}

/* ----- class & paths ----- */

function itemGrant(level, uuids, meta = {}) {
  return {
    _id: advId(`grant:${level}:${meta.tag ?? "items"}:${uuids.join("|")}`),
    type: "ItemGrant", level,
    title: meta.title ?? "",
    hint: meta.hint ?? "",
    configuration: { items: uuids.map(uuid => ({ uuid })), optional: false },
    value: {}
  };
}
function scaleValue(identifier, type, scale, meta = {}) {
  return {
    _id: advId(`sv:${identifier}`),
    type: "ScaleValue", level: 0,
    title: meta.title ?? "",
    hint: meta.hint ?? "",
    configuration: { identifier, type, scale, distance: { units: "" } },
    value: {}
  };
}

const STAGE_NAMES = { 1: "Afflicted", 2: "Savage", 3: "Feral", 4: "Primal", 5: "Adapted",
                      6: "Awakened", 7: "Packborn", 8: "Alpha", 9: "Dire", 10: "Apex" };

const classId = id("class:therianthrope");
const journalId = id("journal:therianthrope");
const journalPageId = id("page:therianthrope");
const journalUuid = JOURNAL_UUID(journalId);
const journalPageUuid = `${journalUuid}.JournalEntryPage.${journalPageId}`;

const classAdv = {};
// Each stage emits up to three ItemGrant advancements: gained features,
// regular milestones, and Calling (Control/Embrace) milestones.
const GRANT_META = {
  features: (s) => ({ tag: "features", title: `Stage ${s} Features`,
    hint: "Features granted by this Stage of the Therianthrope advancement class." }),
  milestones: (s) => ({ tag: "milestones", title: `Stage ${s} Milestones`,
    hint: "Advancement Milestones are goals you must complete before you can advance to the next Stage." }),
  callings: (s) => ({ tag: "callings", title: `Stage ${s} Callings`,
    hint: "Choose a Calling - Control or Embrace - and complete its milestone to claim a gift. The path not taken is lost. Grand gifts are offered only to those holding at least two Minor and two Major gifts of the same side." })
};
const grantAt = (stage, { features = [], milestones = [], callings = [] } = {}) => {
  for ( const [tag, uuids] of [["features", features], ["milestones", milestones], ["callings", callings]] ) {
    if ( !uuids.length ) continue;
    const a = itemGrant(stage, uuids, GRANT_META[tag](stage));
    classAdv[a._id] = a;
  }
};
const msUUIDs = stage => classMilestoneIds[stage].regular.map(ITEM_UUID);
const callingUUIDs = stage => classMilestoneIds[stage].calling.map(ITEM_UUID);

// Stage 1 - branch-specific Unwilling Transformation is granted by the Path.
grantAt(1, { milestones: msUUIDs(1) });
const flawPool = FLAWS.map(([name]) => ITEM_UUID(id(`feat:flaw-${name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`)));
const flawChoice = {
  _id: advId("choice:flaw"), type: "ItemChoice", level: 1,
  title: "Bestial Flaw",
  hint: "Choose a Bestial Flaw - a roleplaying compulsion the curse imposes on you.",
  configuration: {
    allowDrops: false,
    choices: { 1: { count: 1 } },
    pool: flawPool.map(uuid => ({ uuid })),
    restriction: { type: "feat" },
    type: "feat", sorting: "a"
  },
  value: {}
};
classAdv[flawChoice._id] = flawChoice;
const pathPick = {
  _id: advId("path:pick"), type: "AdvancementPath", level: 1,
  title: "Therianthrope Branch",
  hint: "Choose the animalistic branch of your curse, determined by the Therianthrope that infected you.",
  configuration: {}, value: {}
};
classAdv[pathPick._id] = pathPick;

// Stage 2+ - branch-specific Controlling the Curse is granted by the Path.
grantAt(2, {
  features: [ITEM_UUID(id("feat:control-points"))],
  milestones: msUUIDs(2), callings: callingUUIDs(2)
});
grantAt(3, {
  features: [ITEM_UUID(id("feat:flaw-mitigation"))],
  milestones: msUUIDs(3)
});
grantAt(4, {
  features: [ITEM_UUID(id("feat:feral-speed")), ITEM_UUID(id("feat:empowered-transformation"))],
  milestones: msUUIDs(4), callings: callingUUIDs(4)
});
grantAt(5, { milestones: msUUIDs(5) });
grantAt(6, { milestones: msUUIDs(6), callings: callingUUIDs(6) });
grantAt(7, { milestones: msUUIDs(7) });
grantAt(8, {
  features: [ITEM_UUID(id("feat:predators-resurgence"))],
  milestones: msUUIDs(8), callings: callingUUIDs(8)
});
grantAt(9, { milestones: msUUIDs(9) });
grantAt(10, { callings: callingUUIDs(10) });

const svCP = scaleValue("control-points", "number", { 2: { value: 1 }, 4: { value: 2 }, 6: { value: 3 }, 8: { value: 4 }, 10: { value: 5 } }, {
  title: "Control Points",
  hint: "Your pool of Control Points - spent on Controlled Transformation and Control gifts, and regained when you finish a Long Rest."
});
classAdv[svCP._id] = svCP;
const svWR = scaleValue("wild-regen", "dice", {
  2: { number: 1, faces: 4 }, 4: { number: 1, faces: 6 }, 6: { number: 1, faces: 8 },
  8: { number: 1, faces: 10 }, 10: { number: 2, faces: 6 }
}, {
  title: "Wild Regeneration",
  hint: "The hit points you regain when you use your Wild Regeneration reaction while transformed."
});
classAdv[svWR._id] = svWR;

items.push({
  _id: classId,
  _key: `!items!${classId}`,
  name: "Therianthrope",
  type: "advancement-classes.advancement-class",
  img: "systems/dnd5e/icons/svg/items/class.svg",
  folder: F_ROOT,
  sort: -10,
  system: {
    description: {
      value: `<p>A Therianthrope is a creature cursed to transform into beast and hybrid forms - a werecreature whose condition spreads through its bite during the light of the Planar Tear. Therianthrope Stages are tracked independently of class level and do not increase character level or proficiency bonus.</p><p>See the @UUID[${journalUuid}]{Therianthrope} journal for the full class write-up.</p>`,
      chat: ""
    },
    identifier: "therianthrope",
    levels: 1,
    hd: { additional: "0", denomination: "d6", spent: 0 },
    stageNames: STAGE_NAMES,
    journal: journalPageUuid,
    advancement: classAdv,
    source: {}
  },
  flags: {}
});

/* ----- paths ----- */
for ( const [key, branch] of Object.entries(BRANCHES) ) {
  const pathId = id(`path:${key}`);
  const adv = {};
  const floorSv = scaleValue("key-ability-floor", "number",
    { 1: { value: 14 }, 4: { value: 16 }, 7: { value: 18 }, 10: { value: 20 } }, {
      title: "Key Ability",
      hint: `The curse enhances your body - while transformed, your ${branch.keyName} score is increased to this value if it is not already higher.`
    });
  floorSv._id = advId(`sv:${key}:floor`);
  adv[floorSv._id] = floorSv;
  if ( key === "snake" ) {
    const sv = scaleValue("snake-venom", "dice",
      { 1: { number: 1, faces: 4 }, 5: { number: 2, faces: 4 }, 7: { number: 2, faces: 6 }, 9: { number: 2, faces: 8 } }, {
        title: "Snake Venom",
        hint: "The extra poison damage dealt by your Venomous Bite feature while transformed."
      });
    adv[sv._id] = sv;
  }
  if ( key === "tiger" ) {
    const sv = scaleValue("stalker-prowl", "dice", { 7: { number: 2, faces: 8 }, 9: { number: 2, faces: 12 } }, {
      title: "Stalker's Prowl",
      hint: "The extra damage dealt by your Stalker's Prowl feature while transformed."
    });
    adv[sv._id] = sv;
  }
  for ( const [stage, featIdents, msIds] of [
    [1, [`unwilling-transformation-${key}`], []],
    [2, [`controlling-the-curse-${key}`], []],
    [3, [`bestial-aspect-${key}`], [branchMilestoneIds[key][3]]],
    [5, [BRANCH_FEATURES[key].find(f => f.stage === 5).ident], [branchMilestoneIds[key][5]]],
    [7, [BRANCH_FEATURES[key].find(f => f.stage === 7).ident], [branchMilestoneIds[key][7]]],
    [9, [BRANCH_FEATURES[key].find(f => f.stage === 9).ident], [branchMilestoneIds[key][9]]]
  ] ) {
    for ( const [tag, ids] of [["features", featIdents.map(i => id(`feat:${i}`))], ["milestones", msIds]] ) {
      if ( !ids.length ) continue;
      const a = itemGrant(stage, ids.map(ITEM_UUID), GRANT_META[tag](stage));
      a._id = advId(`grant:${key}:${stage}:${tag}`);
      adv[a._id] = a;
    }
  }
  items.push({
    _id: pathId,
    _key: `!items!${pathId}`,
    name: `Therianthrope: ${branch.name}`,
    type: "advancement-classes.advancement-path",
    img: "systems/dnd5e/icons/svg/subclass.svg",
    folder: F_PATH_BRANCH[key],
    sort: 0,
    system: {
      description: { value: `<p>The ${branch.name} branch of the Therianthrope curse. Your key ability is ${branch.keyName}; while transformed your alignment becomes ${branch.alignment}.</p>`, chat: "" },
      identifier: `therianthrope-${key}`,
      classIdentifier: "therianthrope",
      advancement: adv,
      source: {}
    },
    flags: {
      "advancement-classes": {
        transform: {
          abilityFloor: { ability: branch.key, scale: "key-ability-floor" },
          inject: [
            { uuid: ITEM_UUID(id("feat:wild-regeneration")), minStage: 2 },
            { uuid: ITEM_UUID(id(`feat:bestial-aspect-${key}`)), minStage: 3 }
          ]
        }
      }
    }
  });
}

/* ----- journal ----- */
const JOURNAL_HTML = `<h1>Therianthrope</h1>
<p>A Therianthrope carries the curse of the werebeast - a slow transformation of body and instinct that grants power at the price of control. The curse spreads through its bite beneath the light of the Planar Tear.</p>
<p><em>Therianthrope DC = 8 + your proficiency bonus + your Constitution modifier.</em></p>

<h2>Advancement Table</h2>
<table>
<thead><tr><th>Stage</th><th>Name</th><th>Features</th><th>Control Points</th><th>Wild Regeneration</th><th>Ability Floor</th></tr></thead>
<tbody>
<tr><td>1</td><td>Afflicted</td><td>Bestial Flaw, Therianthrope Branch, Unwilling Transformation</td><td>-</td><td>-</td><td>14</td></tr>
<tr><td>2</td><td>Savage</td><td>Controlling the Curse, Wild Regeneration</td><td>1</td><td>1d4</td><td>14</td></tr>
<tr><td>3</td><td>Feral</td><td>Flaw Mitigation I, Bestial Aspect (branch)</td><td>1</td><td>1d4</td><td>14</td></tr>
<tr><td>4</td><td>Primal</td><td>Flaw Mitigation II, Feral Speed, Empowered Transformation I</td><td>2</td><td>1d6</td><td>16</td></tr>
<tr><td>5</td><td>Adapted</td><td>Flaw Mitigation III, branch feature</td><td>2</td><td>1d6</td><td>16</td></tr>
<tr><td>6</td><td>Awakened</td><td>Flaw Mitigation IV, Empowered Transformation II</td><td>3</td><td>1d8</td><td>16</td></tr>
<tr><td>7</td><td>Packborn</td><td>Flaw Mitigation V, branch feature</td><td>3</td><td>1d8</td><td>18</td></tr>
<tr><td>8</td><td>Alpha</td><td>Flaw Mitigation VI, Empowered Transformation III, Predator's Resurgence</td><td>4</td><td>1d10</td><td>18</td></tr>
<tr><td>9</td><td>Dire</td><td>Flaw Mitigation VII, branch feature</td><td>4</td><td>1d10</td><td>18</td></tr>
<tr><td>10</td><td>Apex</td><td>Flaw Mitigation VIII</td><td>5</td><td>2d6</td><td>20</td></tr>
</tbody>
</table>

<h2>Stage Features</h2>
<h3>Stage 1 - Bestial Flaws</h3>
<p>The curse affects both mind and body. Choose one of the following flaws: <em>${FLAWS.map(f => f[0]).join("; ")}</em>.</p>
<h3>Stage 1 - Therianthrope Branch</h3>
<p>Choose the branch of your curse - Bear, Fox, Raven, Tiger, Shark, Snake, or Wolf - determined by the Therianthrope that cursed you. Your branch determines your forms, your key ability, your alignment while transformed, and your branch features.</p>
<h3>Stage 1 - Unwilling Transformation</h3>
${FEATURE_TEXT.unwilling}
<h3>Stage 2 - Controlling the Curse &amp; Wild Regeneration</h3>
${FEATURE_TEXT.controlling}
${FEATURE_TEXT.wildRegen}
<h3>Stage 3 - Flaw Mitigation &amp; Bestial Aspect</h3>
${FEATURE_TEXT.flawMitigation}
<p>Each branch grants a different Bestial Aspect at Stage 3.</p>
<h3>Stage 4 - Feral Speed &amp; Empowered Transformation</h3>
${FEATURE_TEXT.feralSpeed}
${FEATURE_TEXT.empowered}
<h3>Stage 8 - Predator's Resurgence</h3>
${FEATURE_TEXT.resurgence}

<h2>Branches</h2>
${Object.entries(BRANCHES).map(([k, b]) => `
<h3>${b.name}</h3>
<p><strong>Key Ability:</strong> ${b.keyName} &nbsp; <strong>Transformed Alignment:</strong> ${b.alignment}</p>
<p><strong>Animal Form:</strong> size ${FORMS[k].animal.size}, speed ${Object.entries(FORMS[k].animal.move).filter(([,v]) => v).map(([m,v]) => `${m} ${v} ft.`).join(", ")}; attacks: ${FORMS[k].animal.attacks.map(a => `${a.name} (${a.dice})`).join(", ")}.</p>
<p><strong>Hybrid Form:</strong> size ${FORMS[k].hybrid.size}, speed ${Object.entries(FORMS[k].hybrid.move).filter(([,v]) => v).map(([m,v]) => `${m} ${v} ft.`).join(", ")}; attacks: ${FORMS[k].hybrid.attacks.map(a => `${a.name} (${a.dice})`).join(", ")}.</p>
<p><strong>Bestial Aspect (S3):</strong> ${b.aspect[0].toUpperCase() + b.aspect.slice(1)}</p>
${BRANCH_FEATURES[k].map(f => `<p><strong>${f.name} (S${f.stage}).</strong> ${f.text}</p>`).join("")}
`).join("")}

<h2>Milestones</h2>
<p>Stages are gated by Advancement Milestones. Complete all regular milestones to advance; at even Stages you also resolve the Callings below.</p>
${Object.entries(CLASS_MILESTONES).map(([stage, list]) => `<p><strong>Stage ${stage}:</strong> ${list.map(l => l[2]).join(" ")}${Number(stage) % 2 === 0 ? " <em>Plus the Callings.</em>" : ""}</p>`).join("")}

<h2>Callings &amp; Gifts</h2>
<p>At Stages 2, 4, 6, 8, and 10 you may commit to a Calling - Control or Embrace - by completing its milestone. Each grants a gift: Minor at S2–4, Minor or Major at S6–8, and any tier at S10. The Grand gift requires all four Minor and Major gifts of that side.</p>
<h3>Control</h3>
<ul>${GIFTS.filter(g => g.side === "control").map(g => `<li><strong>${g.name} (${g.tier}).</strong> ${g.text}</li>`).join("")}</ul>
<h3>Embrace</h3>
<ul>${GIFTS.filter(g => g.side === "embrace").map(g => `<li><strong>${g.name} (${g.tier}).</strong> ${g.text}</li>`).join("")}</ul>

<h2>Transformation Rules</h2>
<p>While transformed you keep your hit points (current, maximum, and temporary), ability scores, saving throws, skill proficiencies, proficiency bonus, damage resistances/immunities/vulnerabilities, and vision. Your key ability cannot drop below your branch's floor (14 at Stage 1, rising to 20 at Stage 10). You replace your natural AC, speed, creature type (Beast), size, and appearance with those of your form. You lose languages, gear proficiencies, class features, equipment, and spellcasting.</p>
<p>Reverting from any transformation inflicts 1 level of Exhaustion; while transformed you ignore all Exhaustion. The curse shifts your alignment while transformed to that of your branch. The curse spreads through your Bite (or Peck/Beak for the Raven branch): a target must succeed on a Constitution saving throw against your Therianthrope DC or become cursed, gaining Stage 1 of this class at the next Planar Tear unless the curse is first removed by <em>Remove Curse</em> or a similar effect.</p>`;

const pageId = journalPageId;
journals.push({
  _id: journalId,
  _key: `!journal!${journalId}`,
  name: "Therianthrope",
  pages: [{
    _id: pageId,
    _key: `!journal.pages!${journalId}.${pageId}`,
    name: "Therianthrope",
    type: "text",
    title: { show: false, level: 1 },
    text: { format: 1, content: JOURNAL_HTML },
    src: null,
    sort: 0,
    ownership: { default: -1 },
    flags: {}
  }],
  ownership: { default: -1 },
  flags: {}
});

/* -------------------------------------------- */
/*  Write files                                 */
/* -------------------------------------------- */

const writeOut = (dir, list) => {
  const target = join(ROOT, "packs/_source", dir);
  mkdirSync(target, { recursive: true });
  for ( const doc of list ) {
    const isFolder = doc._key?.startsWith("!folders!");
    const base = isFolder ? `folder-${doc._id}` : (doc.system?.identifier || doc.name);
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    writeFileSync(join(target, `${slug}.json`), JSON.stringify(doc, null, 2) + "\n");
  }
  console.log(`${dir}: ${list.length} documents`);
};

writeOut("advancement-classes", [...folderDocs, ...items]);
writeOut("advancement-classes-forms", actors);
writeOut("advancement-classes-journals", journals);
