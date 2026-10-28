// The domain model for trajectory. Pure: no DOM, no storage, no clock of its own
// (today is always passed in). Vocabulary is CONTEXT.md's, not a synonym for it.

export const SCHEMA_VERSION = 1;
export const BOX_MINUTES = 25;
export const BOX_MS = BOX_MINUTES * 60 * 1000;

const STAGES = ['todo', 'doing', 'achieved'];
export const STAGE_LABELS = { todo: 'Not started', doing: 'Doing', achieved: 'Achieved' };

export function newId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

// --- Quarter: a calendar quarter, derived from a date ----------------------

export function quarterOf(date = new Date()) {
  return date.getFullYear() + '-Q' + (Math.floor(date.getMonth() / 3) + 1);
}

export function splitQuarter(key) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(key));
  if (!m) throw new Error('Not a Quarter: ' + key);
  return { year: Number(m[1]), q: Number(m[2]) };
}

export function quarterStart(key) {
  const { year, q } = splitQuarter(key);
  return new Date(year, (q - 1) * 3, 1);
}

// Exclusive: the instant the Quarter closes.
export function quarterEnd(key) {
  const { year, q } = splitQuarter(key);
  return new Date(year, q * 3, 1);
}

export function shiftQuarter(key, delta) {
  const { year, q } = splitQuarter(key);
  const index = year * 4 + (q - 1) + delta;
  return Math.floor(index / 4) + '-Q' + (((index % 4) + 4) % 4 + 1);
}

// --- State ----------------------------------------------------------------

export function emptyState(today = new Date()) {
  const current = quarterOf(today);
  return {
    schemaVersion: SCHEMA_VERSION,
    carriedThrough: shiftQuarter(current, -1),
    goals: [],
    objectives: [],
    outcomes: [],
    ideas: []
  };
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Not a trajectory document.');
  const version = Number(raw.schemaVersion || 0);
  if (version > SCHEMA_VERSION) {
    throw new Error('This document was written by a newer version of trajectory (schema ' + version + ').');
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    carriedThrough: raw.carriedThrough || null,
    goals: raw.goals || [],
    objectives: raw.objectives || [],
    outcomes: raw.outcomes || [],
    ideas: raw.ideas || []
  };
}

// --- Quarter close: carry-forward ------------------------------------------
// A Quarter closes at its calendar boundary, without being asked to. The first
// use after a boundary closes every Quarter that has elapsed since the last carry
// and moves all unachieved work into the Quarter you are actually in. Skipped
// Quarters are recorded with nothing in them, which is to say: nothing happens.

export function closeElapsed(state, today = new Date()) {
  const current = quarterOf(today);
  const carriedThrough = state.carriedThrough;
  const elapsed = quartersBetween(state, carriedThrough, current);

  if (!elapsed.length) {
    return carriedThrough === shiftQuarter(current, -1)
      ? state
      : { ...state, carriedThrough: shiftQuarter(current, -1) };
  }

  let next = state;
  elapsed.forEach((key) => { next = carryQuarter(next, key, current); });
  return { ...next, carriedThrough: shiftQuarter(current, -1) };
}

// Quarters are not entities you have to create: they exist because they are on the
// calendar, or because something is recorded in them.
export function quartersBetween(state, after, before) {
  const keys = new Set();
  state.objectives.forEach((o) => keys.add(o.quarterKey));
  state.outcomes.forEach((o) => keys.add(o.quarterKey));
  let from = after ? shiftQuarter(after, 1) : null;
  if (!from) {
    const known = [...keys].sort();
    if (!known.length) return [];
    from = known[0];
  }
  const out = [];
  for (let k = from; k < before; k = shiftQuarter(k, 1)) out.push(k);
  return out;
}

export function carryQuarter(state, fromKey, toKey) {
  const unachieved = state.outcomes
    .filter((o) => o.quarterKey === fromKey && o.status === 'open')
    .sort(byRank);

  if (!unachieved.length) return state;

  // An Objective is carried only if at least one of its Outcomes is still
  // unachieved; otherwise it is left behind with the closed Quarter.
  const objectiveCopies = {};
  unachieved.forEach((o) => {
    if (!o.objectiveId || objectiveCopies[o.objectiveId]) return;
    const original = state.objectives.find((x) => x.id === o.objectiveId);
    if (!original) return;
    objectiveCopies[o.objectiveId] = {
      ...original,
      id: newId('obj'),
      quarterKey: toKey,
      carriedFrom: original.carriedFrom || original.quarterKey
    };
  });

  let rank = nextRank(state, toKey);
  const carried = unachieved.map((o) => ({
    ...o,
    id: newId('out'),
    quarterKey: toKey,
    objectiveId: o.objectiveId ? objectiveCopies[o.objectiveId].id : null,
    rank: rank++,
    carriedIn: o.boxes
  }));

  return {
    ...state,
    objectives: [...state.objectives, ...Object.values(objectiveCopies)],
    outcomes: [...state.outcomes, ...carried]
  };
}

// --- Reading the model -----------------------------------------------------

export function byRank(a, b) { return a.rank - b.rank; }

export function activeGoals(state) { return state.goals.filter((g) => !g.archived); }
export function archivedGoals(state) { return state.goals.filter((g) => g.archived); }
export function goalById(state, id) { return state.goals.find((g) => g.id === id) || null; }
export function objectiveById(state, id) { return state.objectives.find((o) => o.id === id) || null; }
export function outcomeById(state, id) { return state.outcomes.find((o) => o.id === id) || null; }

export function objectivesIn(state, quarterKey) {
  return state.objectives.filter((o) => o.quarterKey === quarterKey);
}
export function objectivesOfGoal(state, quarterKey, goalId) {
  return state.objectives.filter((o) => o.quarterKey === quarterKey && o.goalId === goalId);
}
export function outcomesIn(state, quarterKey) {
  return state.outcomes.filter((o) => o.quarterKey === quarterKey).sort(byRank);
}
export function liveOutcomesIn(state, quarterKey) {
  return outcomesIn(state, quarterKey).filter((o) => o.status !== 'dropped');
}
export function outcomesOf(state, objectiveId) {
  return state.outcomes.filter((o) => o.objectiveId === objectiveId).sort(byRank);
}
export function parentless(state, quarterKey) {
  return outcomesIn(state, quarterKey).filter((o) => !o.objectiveId);
}

export function stageOf(outcome) {
  return outcome.status === 'achieved' ? 'achieved' : outcome.stage;
}
export function isOpen(outcome) { return outcome.status === 'open'; }
export function isEnded(objective, state) {
  const outcomes = outcomesOf(state, objective.id);
  return outcomes.length > 0 && outcomes.every((o) => o.status === 'dropped');
}

// Traceability: an Outcome walks up to the Objective and the Career Goal it serves,
// or is explicitly parentless.
export function chainOf(state, outcome) {
  const objective = outcome.objectiveId ? objectiveById(state, outcome.objectiveId) : null;
  if (!objective) return null;
  return { objective, goal: goalById(state, objective.goalId) };
}

// Effort is a count of completed Time Boxes, attributed to the Outcome's Quarter.
export function hours(boxes) {
  const minutes = boxes * BOX_MINUTES;
  return Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2, '0') + 'm';
}
export function boxesLabel(n) { return n + (n === 1 ? ' box' : ' boxes'); }
export function sumBoxes(list) { return list.reduce((n, o) => n + o.boxes, 0); }

export function objectiveEffort(state, objectiveId) {
  return sumBoxes(outcomesOf(state, objectiveId));
}
export function goalEffort(state, quarterKey, goalId) {
  return objectivesOfGoal(state, quarterKey, goalId).reduce((n, o) => n + objectiveEffort(state, o.id), 0);
}
export function quarterTotals(state, quarterKey) {
  // Effort is settled by dropping, not erased by it: a dropped Outcome's boxes
  // still count in its Quarter's figures.
  const all = outcomesIn(state, quarterKey).filter((o) => o.status !== 'dropped' || o.boxes > 0);
  const live = liveOutcomesIn(state, quarterKey);
  const boxes = sumBoxes(all);
  const carriedIn = all.reduce((n, o) => n + o.carriedIn, 0);
  return {
    count: live.length,
    boxes,
    carriedIn,
    worked: boxes - carriedIn,
    doing: live.filter((o) => stageOf(o) === 'doing').length,
    achieved: live.filter((o) => o.status === 'achieved').length
  };
}

export function boardColumns(state, quarterKey) {
  const list = liveOutcomesIn(state, quarterKey);
  return STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    outcomes: list.filter((o) => stageOf(o) === stage).sort(byRank)
  }));
}

// --- Gaps and the Quarter review -------------------------------------------
// Computed from the model, never recorded. A Gap is always a hole with a next
// action attached. The Inbox is outside the plan, so an Idea is never a Gap.

export function gaps(state, quarterKey) {
  const out = [];
  activeGoals(state).forEach((goal) => {
    if (!objectivesOfGoal(state, quarterKey, goal.id).length) {
      out.push({ kind: 'goal', id: goal.id, title: goal.title });
    }
  });
  objectivesIn(state, quarterKey).forEach((objective) => {
    if (!outcomesOf(state, objective.id).length) {
      out.push({ kind: 'objective', id: objective.id, title: objective.title });
    }
  });
  parentless(state, quarterKey)
    .filter((o) => o.status === 'open' && !o.emergency)
    .forEach((o) => out.push({ kind: 'parentless', id: o.id, title: o.title }));
  return out;
}

export function reviewItems(state, quarterKey) {
  const items = gaps(state, quarterKey).map((gap) => {
    if (gap.kind === 'goal') return { ...gap, question: gap.title + ' has no Quarterly Objective in ' + quarterKey + '.', next: 'Add one, or let the goal rest.' };
    if (gap.kind === 'objective') return { ...gap, question: gap.title + ' has no Implementation Outcomes.', next: 'Add one, or carry the Objective forward empty.' };
    return { ...gap, question: gap.title + ' has no parent.', next: 'Attach it to an Objective, or drop it.' };
  });
  parentless(state, quarterKey)
    .filter((o) => o.status === 'open' && o.emergency)
    .forEach((o) => items.push({
      kind: 'emergency',
      id: o.id,
      title: o.title,
      question: o.title + ' is an Emergency, still unachieved.',
      next: 'Achieve it or drop it \u2014 finding it a parent was never the point.'
    }));
  return items;
}

// --- Mutations. Every one returns a new state; nothing is mutated in place. --

function replaceOutcome(state, id, patch) {
  return { ...state, outcomes: state.outcomes.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
}
function replaceObjective(state, id, patch) {
  return { ...state, objectives: state.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
}
function replaceGoal(state, id, patch) {
  return { ...state, goals: state.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
}

function nextRank(state, quarterKey) {
  const live = state.outcomes.filter((o) => o.quarterKey === quarterKey && o.status !== 'dropped');
  return live.length ? Math.max(...live.map((o) => o.rank)) + 1 : 1;
}

export function addGoal(state, title) {
  const clean = String(title).trim();
  if (!clean) return state;
  return { ...state, goals: [...state.goals, { id: newId('goal'), title: clean, archived: false }] };
}
export function renameGoal(state, id, title) {
  const clean = String(title).trim();
  return clean ? replaceGoal(state, id, { title: clean }) : state;
}
export function setGoalArchived(state, id, archived) {
  return replaceGoal(state, id, { archived: !!archived });
}

export function addObjective(state, { goalId, quarterKey, title }) {
  const clean = String(title).trim();
  if (!clean || !goalById(state, goalId)) return state;
  const objective = { id: newId('obj'), goalId, quarterKey, title: clean, carriedFrom: null };
  return { ...state, objectives: [...state.objectives, objective] };
}
export function renameObjective(state, id, title) {
  const clean = String(title).trim();
  return clean ? replaceObjective(state, id, { title: clean }) : state;
}

export function addOutcome(state, { quarterKey, objectiveId = null, title }) {
  const clean = String(title).trim();
  if (!clean) return state;
  const outcome = {
    id: newId('out'),
    quarterKey,
    objectiveId: objectiveId || null,
    title: clean,
    rank: nextRank(state, quarterKey),
    boxes: 0,
    carriedIn: 0,
    stage: 'todo',
    status: 'open',
    emergency: false
  };
  return { ...state, outcomes: [...state.outcomes, outcome] };
}
export function renameOutcome(state, id, title) {
  const clean = String(title).trim();
  return clean ? replaceOutcome(state, id, { title: clean }) : state;
}

// An Outcome's parent is optional, and attaching one to an Objective clears the
// Emergency mark, because the work turned out to belong to the plan after all.
export function setOutcomeParent(state, id, objectiveId) {
  const outcome = outcomeById(state, id);
  if (!outcome) return state;
  if (objectiveId) {
    const objective = objectiveById(state, objectiveId);
    if (!objective || objective.quarterKey !== outcome.quarterKey) return state;
    return replaceOutcome(state, id, { objectiveId, emergency: false });
  }
  return replaceOutcome(state, id, { objectiveId: null });
}

// Marking an Outcome as an Emergency requires that it has no parent.
export function setEmergency(state, id, on) {
  const outcome = outcomeById(state, id);
  if (!outcome || outcome.objectiveId) return state;
  return replaceOutcome(state, id, { emergency: !!on });
}

// Which rendering the Outcome sits in. Achieved is terminal; the two live stages
// are Not started and Doing.
export function setStage(state, id, stage) {
  if (STAGES.indexOf(stage) < 0) return state;
  const outcome = outcomeById(state, id);
  if (!outcome || outcome.status === 'dropped') return state;
  if (stage === 'achieved') return replaceOutcome(state, id, { status: 'achieved' });
  if (outcome.status === 'achieved') return state; // nothing ever leaves Achieved
  return replaceOutcome(state, id, { stage });
}

// A completed Time Box is the only thing that adds Effort, and completing one is
// evidence of attention, so it also puts the Outcome in Doing.
export function addTimeBox(state, id) {
  const outcome = outcomeById(state, id);
  if (!outcome || outcome.status !== 'open') return state;
  return replaceOutcome(state, id, { boxes: outcome.boxes + 1, stage: 'doing' });
}

export function dropOutcome(state, id) {
  const outcome = outcomeById(state, id);
  if (!outcome || outcome.status !== 'open') return state;
  return replaceOutcome(state, id, { status: 'dropped' });
}

// An Objective whose Outcomes are all dropped ends with them, and is left behind
// by carry-forward. Dropping every Outcome is how that happens.
export function dropObjective(state, objectiveId) {
  let next = state;
  outcomesOf(state, objectiveId).filter(isOpen).forEach((o) => { next = dropOutcome(next, o.id); });
  return next;
}

export function reorderOutcome(state, id, delta, quarterKey) {
  const live = state.outcomes
    .filter((o) => o.quarterKey === quarterKey && o.status !== 'dropped')
    .sort(byRank);
  const from = live.findIndex((o) => o.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= live.length) return state;
  const order = live.slice();
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const ranks = new Map(order.map((o, index) => [o.id, index + 1]));
  return {
    ...state,
    outcomes: state.outcomes.map((o) => (ranks.has(o.id) ? { ...o, rank: ranks.get(o.id) } : o))
  };
}

// --- The Inbox: Ideas, outside the three tiers ------------------------------

export function addIdea(state, text) {
  const clean = String(text).trim();
  if (!clean) return state;
  return { ...state, ideas: [...state.ideas, { id: newId('idea'), text: clean }] };
}
export function renameIdea(state, id, text) {
  const clean = String(text).trim();
  if (!clean) return state;
  return { ...state, ideas: state.ideas.map((i) => (i.id === id ? { ...i, text: clean } : i)) };
}
export function discardIdea(state, id) {
  return { ...state, ideas: state.ideas.filter((i) => i.id !== id) };
}

// Promotion consumes the Idea: the Career Goal, Quarterly Objective or
// Implementation Outcome it became is the only record of it.
export function promoteIdea(state, ideaId, target) {
  const idea = state.ideas.find((i) => i.id === ideaId);
  if (!idea) return state;
  let next = state;
  if (target.kind === 'goal') next = addGoal(next, idea.text);
  else if (target.kind === 'objective') next = addObjective(next, { goalId: target.goalId, quarterKey: target.quarterKey, title: idea.text });
  else next = addOutcome(next, { quarterKey: target.quarterKey, title: idea.text });
  return { ...next, ideas: next.ideas.filter((i) => i.id !== ideaId) };
}

// An Idea may become any of the three tiers, so promotion has to ask which.
export function promotionTargets(state, quarterKey) {
  const targets = [
    { value: 'goal', label: 'a Career Goal' },
    { value: 'outcome', label: 'an Outcome in ' + quarterKey }
  ];
  activeGoals(state).forEach((goal) => {
    targets.push({ value: 'objective:' + goal.id, label: 'an Objective under ' + goal.title });
  });
  return targets;
}
