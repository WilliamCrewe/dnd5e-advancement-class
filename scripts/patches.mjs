import AdvancementClassManager from "./applications/advancement-class-manager.mjs";
import { CLASS_TYPE, GIFT_TYPE, MILESTONE_TYPE, MODULE_ID, PATH_TYPE, SETTING_MAX_STAGE } from "./constants.mjs";

/* -------------------------------------------- */
/*  Item5e Getters                              */
/* -------------------------------------------- */

/**
 * Mirror `item.class` for Advancement Path items: the embedded Advancement
 * Class whose identifier matches `system.classIdentifier`.
 */
function getAdvancementClass() {
  if ( !this.isEmbedded || (this.type !== PATH_TYPE) ) return null;
  const cid = this.system.classIdentifier;
  return this._advancementClassLink ??= this.parent.items.find(
    i => (i.type === CLASS_TYPE) && (i.identifier === cid)
  );
}

/**
 * Mirror `item.subclass` for Advancement Class items.
 */
function getAdvancementPath() {
  if ( !this.isEmbedded || (this.type !== CLASS_TYPE) ) return null;
  const cid = this.identifier;
  return this._advancementPathLink ??= this.parent.items.find(
    i => (i.type === PATH_TYPE) && (i.system.classIdentifier === cid)
  );
}

/**
 * Wrap `item.scaleValues` so ScaleValue advancements evaluate at the owning
 * Advancement Class's Stage rather than character level.
 * Mirrors `Item5e#scaleValues` (dnd5e 6.0.5 module/documents/item.mjs).
 */
function patchScaleValues() {
  const proto = CONFIG.Item.documentClass.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, "scaleValues");
  if ( !original?.get ) return;
  Object.defineProperty(proto, "scaleValues", {
    get: function() {
      if ( !this.advancement?.byType?.ScaleValue ) return {};
      const root = this.system.advancementRootItem;
      if ( ![CLASS_TYPE, PATH_TYPE].includes(root?.type) ) return original.get.call(this);
      const level = root.type === CLASS_TYPE
        ? root.system.levels
        : root.advancementClass?.system.levels ?? this.system.advancementLevel ?? 0;
      return this.advancement.byType.ScaleValue.reduce((obj, advancement) => {
        if ( (advancement.classRestriction === "primary") && !this.isOriginalClass ) return obj;
        if ( (advancement.classRestriction === "secondary") && this.isOriginalClass ) return obj;
        obj[advancement.identifier] = advancement.valueForLevel(level);
        return obj;
      }, {});
    },
    configurable: true
  });
}

/* -------------------------------------------- */
/*  AdvancementManager Routing                  */
/* -------------------------------------------- */

/**
 * Item ID / data extracted from the arguments of an AdvancementManager
 * factory method.
 */
function managerTargetType(name, args) {
  const [actor, second] = args;
  if ( name === "forNewItem" ) return second?.type;
  return actor?.items?.get(second)?.type;
}

/**
 * Route Advancement Class / Path advancement through AdvancementClassManager
 * whenever system code invokes the base manager factories.
 */
function patchManagerFactories() {
  const Manager = dnd5e.applications.advancement.AdvancementManager;

  // Prevent our item types' stage-mapped advancements (and flows of items
  // granted by them) from leaking into normal class level-ups. The base
  // createLevelChangeSteps evaluates every non-class item's flows at
  // character level. AdvancementClassManager keeps the unfiltered original
  // so its own flow building is unaffected.
  const originalFlowsForLevel = Manager.flowsForLevel;
  Manager.flowsForLevel = function(item, level, options) {
    const type = item?.type;
    if ( [CLASS_TYPE, PATH_TYPE, MILESTONE_TYPE].includes(type) ) return [];
    const rootType = item?.system?.advancementRootItem?.type;
    if ( [CLASS_TYPE, PATH_TYPE].includes(rootType) ) return [];
    return originalFlowsForLevel.call(this, item, level, options);
  };
  Object.defineProperty(AdvancementClassManager, "flowsForLevel", {
    value: originalFlowsForLevel, configurable: true, writable: true
  });

  const factories = [
    "forNewItem", "forDeletedItem", "forLevelChange",
    "forNewAdvancement", "forDeletedAdvancement", "forModifyChoices"
  ];
  for ( const name of factories ) {
    const original = Manager[name];
    if ( typeof original !== "function" ) continue;
    Manager[name] = function(...args) {
      const type = managerTargetType(name, args);
      // forNewItem must not route PATH_TYPE: our override delegates non-class
      // items to super.forNewItem, which resolves back to this wrapper.
      const routed = [CLASS_TYPE, PATH_TYPE].includes(type)
        && !(name === "forNewItem" && type === PATH_TYPE);
      if ( routed ) {
        // Dispatch to the subclass's own override where one exists; otherwise
        // invoke the original implementation with `this` bound to the subclass
        // so inherited factories still construct AdvancementClassManager. A
        // blind `AdvancementClassManager[name]` lookup would resolve back to
        // this patched function through inheritance and recurse forever.
        const override = Object.hasOwn(AdvancementClassManager, name)
          ? AdvancementClassManager[name]
          : original;
        return override.apply(AdvancementClassManager, args);
      }
      return original.apply(this, args);
    };
  }
}

/* -------------------------------------------- */
/*  Ability Score Improvement                   */
/* -------------------------------------------- */

/**
 * AbilityScoreImprovementAdvancement gates its two class features on
 * `item.type === "class"`: the default 2-point budget applied at creation
 * and the feat-selection UI. Extend both to Advancement Classes.
 */
function patchAbilityScoreImprovement() {
  const ASI = dnd5e.documents.advancement.AbilityScoreImprovementAdvancement;
  const proto = ASI.prototype;

  const preCreate = proto._preCreate;
  proto._preCreate = function(data) {
    if ( preCreate.call(this, data) === false ) return false;
    if ( (this.item.type === CLASS_TYPE) && !foundry.utils.hasProperty(data, "configuration.points") ) {
      this.updateSource({ "configuration.points": 2 });
    }
  };

  const allowFeat = Object.getOwnPropertyDescriptor(proto, "allowFeat");
  Object.defineProperty(proto, "allowFeat", {
    get: function() {
      if ( this.item.type !== CLASS_TYPE ) return allowFeat.get.call(this);
      return game.settings.get("dnd5e", "allowFeats") || (dnd5e.settings.rulesVersion === "modern");
    },
    configurable: true
  });
}

/* -------------------------------------------- */
/*  Hit Points                                  */
/* -------------------------------------------- */

/**
 * HitPointsAdvancement applies at every level because its `levels` getter
 * returns 1..maxLevel unconditionally. For Advancement Classes, let the
 * advancement's configuration choose which Stages grant hit points.
 */
function patchHitPoints() {
  const HP = dnd5e.documents.advancement.HitPointsAdvancement;
  const Config = dnd5e.applications.advancement.HitPointsConfig;

  const levels = Object.getOwnPropertyDescriptor(HP.prototype, "levels");
  Object.defineProperty(HP.prototype, "levels", {
    get: function() {
      if ( this.item?.type !== CLASS_TYPE ) return levels.get.call(this);
      const max = game.settings.get(MODULE_ID, SETTING_MAX_STAGE) ?? 10;
      if ( this.configuration?.stagesConfigured ) {
        return [this.configuration.stages].flat().map(Number)
          .filter(n => Number.isInteger(n) && (n >= 1) && (n <= max))
          .sort((a, b) => a - b);
      }
      return Array.fromRange(max, 1);
    },
    configurable: true
  });

  Config.PARTS.advancementStages = {
    template: `modules/${MODULE_ID}/templates/hit-points-stages.hbs`
  };

  const partContext = Config.prototype._preparePartContext;
  Config.prototype._preparePartContext = async function(partId, context, options) {
    context = await partContext.call(this, partId, context, options);
    if ( partId !== "advancementStages" ) return context;
    context.isAdvancementClass = this.item?.type === CLASS_TYPE;
    if ( context.isAdvancementClass ) {
      const max = game.settings.get(MODULE_ID, SETTING_MAX_STAGE) ?? 10;
      const configured = !!this.advancement.configuration.stagesConfigured;
      const selected = new Set([this.advancement.configuration.stages].flat().map(Number));
      context.stageOptions = Array.fromRange(max, 1).map(n => ({
        value: n,
        label: game.i18n.format("ADVANCEMENT_CLASSES.Stage", { stage: n }),
        checked: configured ? selected.has(n) : true
      }));
    }
    return context;
  };

  const prepareConfigurationUpdate = Config.prototype.prepareConfigurationUpdate;
  Config.prototype.prepareConfigurationUpdate = async function(configuration) {
    configuration = await prepareConfigurationUpdate.call(this, configuration);
    if ( this.item?.type !== CLASS_TYPE ) return configuration;
    if ( "stages" in configuration ) {
      configuration.stages = [configuration.stages].flat().map(Number)
        .filter(n => Number.isInteger(n) && n >= 1)
        .sort((a, b) => a - b);
    } else if ( configuration.stagesConfigured ) {
      configuration.stages = [];
    }
    if ( "stagesConfigured" in configuration ) configuration.stagesConfigured = true;
    return configuration;
  };

  // rollClassHitPoints refuses any item that isn't type "class". Proxy the
  // item so the system's roll logic (formula, hooks, chat card) applies.
  const actorProto = CONFIG.Actor.documentClass.prototype;
  const rollClassHitPoints = actorProto.rollClassHitPoints;
  actorProto.rollClassHitPoints = async function(item, options={}) {
    if ( item?.type === CLASS_TYPE ) {
      item = new Proxy(item, { get: (target, key) => key === "type" ? "class" : target[key] });
    }
    return rollClassHitPoints.call(this, item, options);
  };

  // Character hp.max derives only from `actor.classes` HitPoints
  // advancements; append ours so granted HP actually raises the maximum.
  const AttributesFields = dnd5e.dataModels.actor.AttributesFields;
  const prepareHitPoints = AttributesFields.prepareHitPoints;
  AttributesFields.prepareHitPoints = function(hp, options={}) {
    if ( (hp.max === null) && this.parent?.items ) {
      const extra = this.parent.items
        .filter(i => i.type === CLASS_TYPE)
        .map(i => i.advancement?.byType?.HitPoints?.[0])
        .filter(a => a);
      if ( extra.length ) {
        options = { ...options, advancement: [...(options.advancement ?? []), ...extra] };
      }
    }
    return prepareHitPoints.call(this, hp, options);
  };

  // The actor's HitDice tracker pools `actor.classes` only. Add Advancement
  // Class items so their dice appear, can be rolled, and recover on rests.
  const CharacterData = CONFIG.Actor.dataModels.character;
  const prepareBaseData = CharacterData.prototype.prepareBaseData;
  CharacterData.prototype.prepareBaseData = function() {
    prepareBaseData.call(this);
    const hd = this.attributes.hd;
    if ( !hd?.classes ) return;
    for ( const item of this.parent.items ) {
      if ( (item.type !== CLASS_TYPE) || !item.system.hd ) continue;
      const size = parseInt(item.system.hd.denomination?.slice(1));
      hd.classes.add(item);
      if ( !Number.isNaN(size) ) hd.sizes.add(size);
    }
  };
}

/* -------------------------------------------- */
/*  Character Sheet                             */
/* -------------------------------------------- */

function patchCharacterSheet() {
  const Sheet = dnd5e.applications.actor.CharacterActorSheet.prototype;

  /* ---- Item categories ---- */

  const assignCategories = Sheet._assignItemCategories;
  Sheet._assignItemCategories = function(item) {
    switch ( item.type ) {
      case CLASS_TYPE: return new Set(["advancementClasses"]);
      case PATH_TYPE: return new Set(["advancementPaths"]);
      case MILESTONE_TYPE: return new Set(["advancementMilestones"]);
      case GIFT_TYPE: return new Set(["advancementGifts"]);
      default: return assignCategories.call(this, item);
    }
  };

  /* ---- Create-dialog types ---- */

  const addDocumentItemTypes = Sheet._addDocumentItemTypes;
  Sheet._addDocumentItemTypes = function(documentType) {
    const types = addDocumentItemTypes.call(this, documentType);
    if ( documentType === "features" ) {
      for ( const t of [CLASS_TYPE, PATH_TYPE, MILESTONE_TYPE, GIFT_TYPE] ) types.push?.(t) ?? types.add?.(t);
    }
    return types;
  };

  /* ---- Per-item context ---- */

  const prepareItemFeature = Sheet._prepareItemFeature;
  Sheet._prepareItemFeature = async function(item, ctx) {
    await prepareItemFeature.call(this, item, ctx);
    ctx.groups ??= {};

    if ( item.type === MILESTONE_TYPE ) {
      ctx.groups.origin = "advancementMilestone";
      ctx.groups.activation = "passive";
      // Rows are rendered under the first section's columns before grouping
      // redistributes them, so milestones need a per-item column override to
      // show the progress cell at all.
      const Inventory = customElements.get(this.options.elements.inventory);
      ctx.columns = Inventory.mapColumns([
        { id: "milestoneProgress", label: "ADVANCEMENT_CLASSES.Sheet.MilestoneProgress",
          order: 200, width: 120, template: `${MODULE_ID}.column-milestone` },
        "controls"
      ]);
      const { milestoneType, progress } = item.system;
      const typeKeys = { manual: "Manual", counter: "Counter", gmConfirm: "GMConfirm", calling: "Calling" };
      ctx.milestone = {
        type: milestoneType,
        typeLabel: game.i18n.localize(`ADVANCEMENT_CLASSES.Milestone.Type.${typeKeys[milestoneType] ?? "Manual"}`),
        value: progress.value,
        max: progress.max,
        fulfilled: item.system.fulfilled,
        canComplete: item.system.canComplete(game.user),
        stage: item.system.associatedStage
      };
      return;
    }

    if ( item.type === CLASS_TYPE ) {
      const max = game.settings.get(MODULE_ID, "maxStage");
      const blocked = item.parent.items.some(i => i.type === MILESTONE_TYPE);
      ctx.stageBlocked = blocked;
      ctx.availableStages = Array.fromRange(max, 1).map(stage => {
        const value = stage - item.system.levels;
        const name = item.system.stageNames?.[String(stage)];
        const base = name
          ? `${stage} - ${name}`
          : game.i18n.format("ADVANCEMENT_CLASSES.Stage", { stage });
        const label = value ? `${base} (${value > 0 ? "+" : ""}${value})` : base;
        return { label, value, disabled: (value > 0) && blocked };
      });
      ctx.stageName = item.system.stageNames?.[String(item.system.levels)] ?? null;
      ctx.mastered = item.system.levels >= max;
      // Circular stage pips: dots arranged clockwise starting at 12 o'clock
      ctx.stagePips = Array.fromRange(max, 1).map(i => {
        const angle = ((i - 1) / max) * 2 * Math.PI - (Math.PI / 2);
        return {
          filled: i <= item.system.levels,
          x: (12 + 9 * Math.cos(angle)).toFixed(2),
          y: (12 + 9 * Math.sin(angle)).toFixed(2)
        };
      });
      const journal = item.system.journal;
      if ( journal ) ctx.journalUuid = journal;

      // Path picker indicator - mirrors the system's needsSubclass logic.
      if ( !item.advancementPath ) {
        const pathAdvancement = item.advancement.byType.AdvancementPath?.[0];
        if ( pathAdvancement && (pathAdvancement.level <= item.system.levels) ) ctx.needsPath = true;
      }
    }

    // Gifts group under a per-class "<Class> Gifts" section keyed on
    // `gift-<class identifier>` (or bare "gift-" for unclassed gifts).
    if ( item.type === GIFT_TYPE ) {
      ctx.groups.origin = `gift-${item.system.gift?.class ?? ""}`;
      const Inventory = customElements.get(this.options.elements.inventory);
      ctx.columns = Inventory.mapColumns([{ id: "uses", order: 200 }, "recovery", "controls"]);
      return;
    }

    // Grouping: features granted by an Advancement Class or Path land under
    // that class's section; milestones land in their own section.
    const [originId] = (item.getFlag("dnd5e", "advancementRoot") ?? item.getFlag("dnd5e", "advancementOrigin"))
      ?.split(".") ?? [];
    const group = item.parent.items.get(originId);
    switch ( group?.type ) {
      case CLASS_TYPE: ctx.groups.origin = group.identifier; break;
      case PATH_TYPE: ctx.groups.origin = group.advancementClass?.identifier ?? "other"; break;
    }
  };

  /* ---- Features tab context ---- */

  const prepareFeaturesContext = Sheet._prepareFeaturesContext;
  Sheet._prepareFeaturesContext = async function(context, options) {
    await prepareFeaturesContext.call(this, context, options);

    const enabled = game.settings.get(MODULE_ID, "enabled")
      && this.actor.getFlag("dnd5e", "advancementClasses");

    context.advancementClasses = (context.itemCategories.advancementClasses ?? [])
      .sort((lhs, rhs) => rhs.system.levels - lhs.system.levels);
    context.advancementPaths = context.itemCategories.advancementPaths ?? [];

    const max = game.settings.get(MODULE_ID, "maxStage");

    // Add control: flag on, sheet editable, all current classes mastered.
    const allMastered = context.advancementClasses.every(c => c.system.levels >= max);
    context.showAdvancementClassDrop = enabled && this.isEditMode && allMastered;
    context.advancementEnabled = enabled;

    // Additional sections: "{Class} Features" for each Advancement Class and
    // an Advancement Milestones section below them.
    const milestones = context.itemCategories.advancementMilestones ?? [];
    const gifts = context.itemCategories.advancementGifts ?? [];
    const Inventory = customElements.get(this.options.elements.inventory);
    if ( context.advancementClasses.length || milestones.length || gifts.length ) {
      const columns = [{ id: "uses", order: 200 }, "recovery", "controls"];

      // One "{Class} Gifts" section per class identifier present on held
      // gifts, in actor class order; unclassed gifts share a generic section.
      const classNames = new Map(context.advancementClasses.map(c => [c.identifier, c.name]));
      const giftIdents = [...new Set([
        ...context.advancementClasses.map(c => c.identifier),
        ...gifts.map(g => g.system.gift?.class ?? "")
      ])].filter(ident => gifts.some(g => (g.system.gift?.class ?? "") === ident));
      const giftSections = giftIdents.map((ident, i) => ({
        columns, id: `ac-gifts-${ident || "other"}`, order: 550 + (i * 100),
        groups: { origin: `gift-${ident}` },
        label: classNames.get(ident)
          ? game.i18n.format("ADVANCEMENT_CLASSES.Sheet.ClassGifts", { class: classNames.get(ident) })
          : (ident
            ? game.i18n.format("ADVANCEMENT_CLASSES.Sheet.ClassGifts", { class: ident.capitalize() })
            : game.i18n.localize("ADVANCEMENT_CLASSES.Sheet.Gifts"))
      }));

      const extra = [
        ...context.advancementClasses.map((cls, i) => ({
          columns, id: `ac-${cls.id}`, order: 500 + (i * 100),
          groups: { origin: cls.identifier },
          label: game.i18n.format("ADVANCEMENT_CLASSES.Sheet.Features", { name: cls.name })
        })),
        ...giftSections,
        milestones.length ? {
          columns: [
            { id: "milestoneProgress", label: "ADVANCEMENT_CLASSES.Sheet.MilestoneProgress",
              order: 200, width: 120,
              template: `${MODULE_ID}.column-milestone` },
            "controls"
          ],
          id: "advancementMilestones", order: 900,
          label: "ADVANCEMENT_CLASSES.Sheet.Milestones",
          groups: { origin: "advancementMilestone" }
        } : null
      ].filter(_ => _);
      context.sections.push(...Inventory.prepareSections(extra));
      context.sections.sort((a, b) => a.order - b.order);
      context.sections[0].items.push(...milestones);
      context.sections[0].items.push(...gifts);
      context.sections[0].items.push(
        ...context.advancementPaths.filter(p =>
          !context.advancementClasses.some(c => c.identifier === p.system.classIdentifier)
        )
      );
    }

    return context;
  };
}

/* -------------------------------------------- */
/*  Uses Maximum Modifiers                      */
/* -------------------------------------------- */

/**
 * Advancement Gifts carry `system.usesMax = { target, delta }` natively; any
 * other item may instead carry `flags.advancement-classes.usesMax` (a single
 * object or an array) - to raise or lower another item's uses maximum. When
 * an item's identifier equals `target`, after its uses are prepared apply
 * the summed delta and re-clamp.
 */
function patchUsesMax() {
  const seen = new Set();
  for ( const DataModel of Object.values(CONFIG.Item.dataModels ?? {}) ) {
    const proto = DataModel?.prototype;
    if ( !proto || seen.has(proto) || !DataModel.schema?.has("uses") ) continue;
    seen.add(proto);
    const original = proto.prepareFinalData;
    if ( typeof original !== "function" ) continue;
    proto.prepareFinalData = function(rollData) {
      original.call(this, rollData);
      const item = this.parent;
      const actor = item?.actor;
      if ( !actor || !item.identifier || (this.uses?.max == null) ) return;
      const delta = actor.items.reduce((n, i) => n + [i.system?.usesMax, i.getFlag(MODULE_ID, "usesMax")].flat()
        .reduce((d, entry) => d + ((entry?.target === item.identifier) ? (Number(entry.delta) || 0) : 0), 0), 0);
      if ( !delta ) return;
      this.uses.max = Math.max(0, this.uses.max + delta);
      this.uses.value = Math.clamp(this.uses.max - this.uses.spent, 0, this.uses.max);
    };
  }
}

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

export function applyPatches() {
  const proto = CONFIG.Item.documentClass.prototype;
  Object.defineProperty(proto, "advancementClass", { get: getAdvancementClass, configurable: true });
  Object.defineProperty(proto, "advancementPath", { get: getAdvancementPath, configurable: true });
  patchScaleValues();
  patchManagerFactories();
  patchAbilityScoreImprovement();
  patchHitPoints();
  patchCharacterSheet();
  patchUsesMax();
}
