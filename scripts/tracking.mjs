import { MILESTONE_TYPE, MODULE_ID } from "./constants.mjs";

/**
 * Feature-linked milestone tracking. Counter milestones may declare a
 * `tracking.event` key; when the module emits that event for the owning
 * actor, progress increments. Events are emitted by system hooks below and
 * are also available to content via `game.advancementClasses.track`.
 *
 * Event vocabulary:
 *   use:<identifier>        activity/item used (identifier = item or activity identifier)
 *   consume:<identifier>    item uses spent (amount = uses consumed)
 *   heal:<identifier>       healing rolled by activity (amount = roll total)
 *   damage:<identifier>     damage rolled by activity (amount = roll total)
 *   attackHit:<identifier>  attack roll met/exceeded a target's AC (per target)
 *   save:<ability>          saving throw rolled (ability key, e.g. "wis")
 *   saveSuccess:<ability>   saving throw met its target DC
 *   skill:<key>             skill check rolled (e.g. "prc", "ste")
 *   skillSuccess:<key>      skill check met its target DC
 *   transform               actor transformed via Transform activity
 *   revert                  actor reverted to original form
 *
 * When `tracking.uniqueTargets` is set, an event carrying target UUIDs only
 * increments once per distinct target, persisted in `tracking.seen`.
 */
export function registerTracking() {
  Hooks.on("dnd5e.postUseActivity", onActivityUsed);
  Hooks.on("dnd5e.postActivityConsumption", onConsumption);
  Hooks.on("dnd5e.rollAttackV2", onAttackRoll);
  Hooks.on("dnd5e.transformActorV2", onTransform);
  Hooks.on("dnd5e.revertOriginalForm", actor => track(actor, "revert"));
  Hooks.on("dnd5e.rollSavingThrowV2", (rolls, data) => onCheckRoll(rolls, data, "save", "ability"));
  Hooks.on("dnd5e.rollSkillV2", (rolls, data) => onCheckRoll(rolls, data, "skill", "skill"));
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
}

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

/**
 * Emit a tracking event for an actor. Counter milestones with a matching
 * `tracking.event` advance their progress.
 * @param {Actor5e} actor
 * @param {string} event        Event key, e.g. "use:control-points".
 * @param {object} [data]
 * @param {number} [data.amount=1]  Progress increment.
 * @param {string[]} [data.targets] Target document UUIDs for unique-target milestones.
 */
export function track(actor, event, { amount = 1, targets = [] } = {}) {
  if ( !actor || !event ) return;
  actor = milestoneOwner(actor);
  for ( const item of actor.items ) {
    if ( (item.type !== MILESTONE_TYPE) || (item.system.milestoneType !== "counter") ) continue;
    const { tracking, progress } = item.system;
    // `tracking.event` accepts a comma-separated list of event keys.
    if ( !tracking.event?.split(",").map(e => e.trim()).includes(event) ) continue;
    if ( tracking.uniqueTargets ) {
      if ( !targets.length ) continue;
      const fresh = targets.filter(t => !tracking.seen.has(t));
      if ( !fresh.length ) continue;
      const seen = new Set(tracking.seen);
      for ( const t of fresh ) seen.add(t);
      const value = Math.min(progress.value + fresh.length, progress.max);
      void item.update({ "system.progress.value": value, "system.tracking.seen": [...seen] });
      continue;
    }
    const value = Math.min(progress.value + amount, progress.max);
    if ( value !== progress.value ) void item.update({ "system.progress.value": value });
  }
}

/* -------------------------------------------- */
/*  Emitters                                    */
/* -------------------------------------------- */

function onActivityUsed(activity, usageConfig, results) {
  const actor = activity.item?.actor;
  if ( !actor ) return;
  const identifier = activity.identifier || activity.item.identifier || activity.item.type;
  track(actor, `use:${identifier}`, { targets: resultTargets(results) });

  const type = activity.type?.id ?? activity.type;
  if ( (type === "heal") || (type === "damage") ) {
    const amount = (results.rolls ?? []).reduce((n, r) => n + (r.total ?? 0), 0);
    if ( amount ) track(actor, `${type}:${identifier}`, { amount });
  }
  if ( type === "transform" ) track(actor, "transform");
}

function onConsumption(activity, usageConfig, messageConfig, updates) {
  const actor = activity.item?.actor;
  if ( !actor ) return;
  for ( const update of updates.item ?? [] ) {
    const spent = update["system.uses.spent"];
    if ( !spent ) continue;
    const item = actor.items.get(update._id);
    const previous = item?.system.uses?.spent ?? 0;
    const delta = spent - previous;
    if ( delta > 0 && item ) track(actor, `consume:${item.identifier || item.type}`, { amount: delta });
  }
}

function onAttackRoll(rolls, { subject } = {}) {
  if ( subject?.type !== "attack" ) return;
  const actor = subject.item?.actor;
  if ( !actor ) return;
  const identifier = subject.identifier || subject.item.identifier || subject.item.type;
  const targets = game.user.targets.map(t => {
    const ac = t.actor?.system.attributes?.ac?.value;
    const hit = rolls.some(r => r.isCritical || (ac == null) || (r.total >= ac));
    return hit ? t.document.uuid : null;
  }).filter(_ => _);
  if ( targets.length ) track(actor, `attackHit:${identifier}`, { targets });
}

function onTransform(host, source, data, settings, options) {
  track(host, "transform");
}

/* -------------------------------------------- */

/**
 * dnd5e transformations create a new Actor document linked back to the
 * original via the `dnd5e.originalActor` flag. Milestone items live on the
 * original actor, so events emitted by the transformed copy are redirected —
 * progress made while transformed persists when the copy is discarded on
 * revert.
 */
function milestoneOwner(actor) {
  const ref = actor.getFlag?.("dnd5e", "originalActor");
  if ( !ref ) return actor;
  const original = game.actors.get(ref)
    ?? (ref.includes(".") ? foundry.utils.fromUuidSync(ref) : null);
  return original ?? actor;
}

function onCheckRoll(rolls, data, type, key) {
  const actor = data.subject;
  const name = data[key];
  if ( !actor || !name ) return;
  track(actor, `${type}:${name}`);
  if ( rolls.some(r => r.isSuccess) ) track(actor, `${type}Success:${name}`);
}

/* -------------------------------------------- */

/**
 * Short-rest gift refunds: items flagged `advancement-classes.srRefund` name
 * an item identifier whose `uses.spent` is reduced by the flag's amount on a
 * short rest (e.g. Careful Control: regain 1 Control Point).
 */
function onRestCompleted(actor, result) {
  if ( result?.longRest ) return;
  for ( const item of actor.items ) {
    const refund = item.getFlag(MODULE_ID, "srRefund");
    if ( !refund?.target ) continue;
    const target = actor.items.find(i => (i.identifier === refund.target) && i.system.uses?.max);
    if ( !target ) continue;
    const spent = Math.max(0, target.system.uses.spent - (refund.amount ?? 1));
    if ( spent !== target.system.uses.spent ) void target.update({ "system.uses.spent": spent });
  }
}

/* -------------------------------------------- */

function resultTargets(results) {
  const targets = results.message?.system?.targets ?? [];
  return targets.map(t => t.uuid).filter(_ => _);
}
