import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../src/domain.js';

// A fixed "now" so nothing here depends on when it runs: 2026-Q4.
const TODAY = new Date(2026, 9, 28); // 28 October 2026

function seed() {
  let s = d.emptyState(TODAY);
  s = d.addGoal(s, 'Become a staff engineer');
  s = d.addGoal(s, 'Build a durable writing practice');
  s = d.addGoal(s, 'Learn conversational Japanese');
  const goals = s.goals;
  s = d.addObjective(s, { goalId: goals[0].id, quarterKey: '2026-Q4', title: 'Ship the platform API v2 migration' });
  s = d.addObjective(s, { goalId: goals[1].id, quarterKey: '2026-Q4', title: 'Publish four engineering notes' });
  const [o1, o2] = s.objectives;
  s = d.addOutcome(s, { quarterKey: '2026-Q4', objectiveId: o1.id, title: 'Ship the auth service cutover' });
  s = d.addOutcome(s, { quarterKey: '2026-Q4', objectiveId: o1.id, title: 'Retire the v1 client shims' });
  s = d.addOutcome(s, { quarterKey: '2026-Q4', objectiveId: o2.id, title: 'Publish note #7' });
  s = d.addOutcome(s, { quarterKey: '2026-Q4', title: 'Read the staff-eng handbook' });
  return s;
}

// --- Quarter arithmetic ----------------------------------------------------

test('a date belongs to its calendar quarter', () => {
  assert.equal(d.quarterOf(new Date(2026, 0, 1)), '2026-Q1');
  assert.equal(d.quarterOf(new Date(2026, 2, 31)), '2026-Q1');
  assert.equal(d.quarterOf(new Date(2026, 3, 1)), '2026-Q2');
  assert.equal(d.quarterOf(new Date(2026, 9, 28)), '2026-Q4');
  assert.equal(d.quarterOf(new Date(2026, 11, 31)), '2026-Q4');
  assert.equal(d.quarterOf(new Date(2027, 0, 1)), '2027-Q1');
});

test('a quarter knows its bounds and its neighbours', () => {
  assert.deepEqual(d.quarterStart('2026-Q4'), new Date(2026, 9, 1));
  assert.deepEqual(d.quarterEnd('2026-Q4'), new Date(2027, 0, 1));
  assert.equal(d.shiftQuarter('2026-Q4', 1), '2027-Q1');
  assert.equal(d.shiftQuarter('2027-Q1', -1), '2026-Q4');
  assert.equal(d.shiftQuarter('2026-Q1', -1), '2025-Q4');
  assert.equal(d.shiftQuarter('2026-Q3', 3), '2027-Q2');
});

test('a new state has carried through to the quarter before now', () => {
  assert.equal(d.emptyState(TODAY).carriedThrough, '2026-Q3');
});

// --- The hierarchy ---------------------------------------------------------

test('outcomes carry the chain up to their goal', () => {
  const s = seed();
  const outcome = s.outcomes[0];
  const chain = d.chainOf(s, outcome);
  assert.equal(chain.objective.title, 'Ship the platform API v2 migration');
  assert.equal(chain.goal.title, 'Become a staff engineer');
});

test('a parentless outcome has no chain and stays parentless', () => {
  const s = seed();
  const lone = s.outcomes.find((o) => !o.objectiveId);
  assert.equal(d.chainOf(s, lone), null);
  assert.equal(d.parentless(s, '2026-Q4').length, 1);
});

test('an outcome can be attached to and detached from an objective', () => {
  const s = seed();
  const lone = s.outcomes.find((o) => !o.objectiveId);
  const attached = d.setOutcomeParent(s, lone.id, s.objectives[0].id);
  assert.equal(d.outcomeById(attached, lone.id).objectiveId, s.objectives[0].id);
  const detached = d.setOutcomeParent(attached, lone.id, null);
  assert.equal(d.outcomeById(detached, lone.id).objectiveId, null);
});

test('an outcome cannot be attached to an objective in another quarter', () => {
  const s = seed();
  const goal = s.goals[0];
  const withNext = d.addObjective(s, { goalId: goal.id, quarterKey: '2027-Q1', title: 'Next quarter work' });
  const nextObjective = withNext.objectives[withNext.objectives.length - 1];
  const lone = withNext.outcomes.find((o) => !o.objectiveId);
  const after = d.setOutcomeParent(withNext, lone.id, nextObjective.id);
  assert.equal(d.outcomeById(after, lone.id).objectiveId, null);
});

// --- Emergencies -----------------------------------------------------------

test('an emergency is parentless by definition', () => {
  const s = seed();
  const lone = s.outcomes.find((o) => !o.objectiveId);
  const marked = d.setEmergency(s, lone.id, true);
  assert.equal(d.outcomeById(marked, lone.id).emergency, true);
});

test('attaching an emergency to an objective clears the mark', () => {
  const s = seed();
  const lone = s.outcomes.find((o) => !o.objectiveId);
  const marked = d.setEmergency(s, lone.id, true);
  const attached = d.setOutcomeParent(marked, lone.id, s.objectives[1].id);
  const outcome = d.outcomeById(attached, lone.id);
  assert.equal(outcome.emergency, false);
  assert.equal(outcome.objectiveId, s.objectives[1].id);
});

test('an outcome with a parent cannot be marked an emergency', () => {
  const s = seed();
  const owned = s.outcomes.find((o) => o.objectiveId);
  assert.equal(d.outcomeById(d.setEmergency(s, owned.id, true), owned.id).emergency, false);
});

// --- Effort and stages -----------------------------------------------------

test('effort is a tally of completed boxes, and zero until a box is run', () => {
  const s = seed();
  assert.equal(d.outcomeById(s, s.outcomes[0].id).boxes, 0);
  const three = [1, 2, 3].reduce((acc) => d.addTimeBox(acc, s.outcomes[0].id), s);
  assert.equal(d.outcomeById(three, s.outcomes[0].id).boxes, 3);
});

test('completing a box puts the outcome in Doing', () => {
  const s = seed();
  assert.equal(d.stageOf(d.outcomeById(s, s.outcomes[0].id)), 'todo');
  const after = d.addTimeBox(s, s.outcomes[0].id);
  assert.equal(d.stageOf(d.outcomeById(after, s.outcomes[0].id)), 'doing');
});

test('boxes and hours stay convertible', () => {
  assert.equal(d.hours(0), '0h 00m');
  assert.equal(d.hours(10), '4h 10m');
  assert.equal(d.hours(66), '27h 30m');
});

test('effort rolls up the objective and the goal', () => {
  const s = seed();
  const [o1] = s.objectives;
  const after = [s.outcomes[0].id, s.outcomes[1].id, s.outcomes[1].id]
    .reduce((acc, id) => d.addTimeBox(acc, id), s);
  assert.equal(d.objectiveEffort(after, o1.id), 3);
  assert.equal(d.goalEffort(after, '2026-Q4', o1.goalId), 3);
});

test('achievement is terminal and takes no further boxes', () => {
  const s = seed();
  const id = s.outcomes[0].id;
  const achieved = d.setStage(s, id, 'achieved');
  assert.equal(d.stageOf(d.outcomeById(achieved, id)), 'achieved');
  assert.equal(d.addTimeBox(achieved, id).outcomes.find((o) => o.id === id).boxes, 0);
  assert.equal(d.stageOf(d.outcomeById(d.setStage(achieved, id, 'doing'), id)), 'achieved');
});

test('the board groups live outcomes into three ordered columns', () => {
  const s = seed();
  const withStages = d.setStage(d.addTimeBox(s, s.outcomes[1].id), s.outcomes[2].id, 'achieved');
  const columns = d.boardColumns(withStages, '2026-Q4');
  assert.deepEqual(columns.map((c) => c.stage), ['todo', 'doing', 'achieved']);
  assert.equal(columns[0].outcomes.length, 2);
  assert.equal(columns[1].outcomes.length, 1);
  assert.equal(columns[2].outcomes.length, 1);
  assert.deepEqual(columns[0].outcomes.map((o) => o.rank), [1, 4]);
});

test('a dropped outcome leaves the board but stays in the figures', () => {
  const s = seed();
  const withBoxes = d.addTimeBox(s, s.outcomes[0].id);
  const dropped = d.dropOutcome(withBoxes, s.outcomes[0].id);
  assert.equal(d.liveOutcomesIn(dropped, '2026-Q4').length, 3);
  assert.equal(d.quarterTotals(dropped, '2026-Q4').boxes, 1);
});

test('an achieved or dropped outcome cannot be dropped again', () => {
  const s = seed();
  const id = s.outcomes[0].id;
  const achieved = d.setStage(s, id, 'achieved');
  assert.equal(d.outcomeById(d.dropOutcome(achieved, id), id).status, 'achieved');
});

test('an objective ends when every one of its outcomes is dropped', () => {
  const s = seed();
  const objectiveId = s.objectives[0].id;
  const dropped = d.dropObjective(s, objectiveId);
  assert.equal(d.outcomesOf(dropped, objectiveId).every((o) => o.status === 'dropped'), true);
  assert.equal(d.isEnded(s.objectives[0], dropped), true);
});

// --- Rank ------------------------------------------------------------------

test('rank is one manual order over the quarter, parentless included', () => {
  const s = seed();
  const order = d.outcomesIn(s, '2026-Q4').map((o) => o.title);
  assert.deepEqual(order, [
    'Ship the auth service cutover',
    'Retire the v1 client shims',
    'Publish note #7',
    'Read the staff-eng handbook'
  ]);
});

test('reordering moves an outcome and renumbers the quarter', () => {
  const s = seed();
  const moved = d.reorderOutcome(s, s.outcomes[3].id, -2, '2026-Q4');
  assert.deepEqual(d.outcomesIn(moved, '2026-Q4').map((o) => o.title), [
    'Ship the auth service cutover',
    'Read the staff-eng handbook',
    'Retire the v1 client shims',
    'Publish note #7'
  ]);
  assert.deepEqual(d.outcomesIn(moved, '2026-Q4').map((o) => o.rank), [1, 2, 3, 4]);
});

test('reordering off the end of the list does nothing', () => {
  const s = seed();
  assert.equal(d.reorderOutcome(s, s.outcomes[0].id, -1, '2026-Q4'), s);
  assert.equal(d.reorderOutcome(s, s.outcomes[3].id, 1, '2026-Q4'), s);
});

// --- Gaps and the Quarter review -------------------------------------------

test('gaps are the three structural holes, computed not recorded', () => {
  const s = seed();
  const found = d.gaps(s, '2026-Q4');
  assert.deepEqual(found.map((g) => g.kind).sort(), ['goal', 'parentless']);
  assert.equal(found.find((g) => g.kind === 'goal').title, 'Learn conversational Japanese');
});

test('an objective with no outcomes is a gap, and an emergency is not', () => {
  let s = seed();
  s = d.addObjective(s, { goalId: s.goals[0].id, quarterKey: '2026-Q4', title: 'Establish a review forum' });
  const lone = s.outcomes.find((o) => !o.objectiveId);
  s = d.setEmergency(s, lone.id, true);
  const kinds = d.gaps(s, '2026-Q4').map((g) => g.kind);
  assert.ok(kinds.includes('objective'));
  assert.ok(!kinds.includes('parentless'));
});

test('the review asks a different question of an emergency', () => {
  const s = seed();
  const lone = s.outcomes.find((o) => !o.objectiveId);
  const plain = d.reviewItems(s, '2026-Q4');
  const parentless = plain.find((i) => i.kind === 'parentless');
  assert.match(parentless.next, /Attach it to an Objective, or drop it/);

  const marked = d.setEmergency(s, lone.id, true);
  const emergency = d.reviewItems(marked, '2026-Q4').find((i) => i.kind === 'emergency');
  assert.match(emergency.next, /Achieve it or drop it/);
});

test('an achieved emergency is not asked about', () => {
  const s = seed();
  const lone = s.outcomes.find((o) => !o.objectiveId);
  const done = d.setStage(d.setEmergency(s, lone.id, true), lone.id, 'achieved');
  assert.equal(d.reviewItems(done, '2026-Q4').some((i) => i.kind === 'emergency'), false);
});

test('an archived goal is not a gap, and its objectives still count', () => {
  const s = seed();
  const archived = d.setGoalArchived(s, s.goals[2].id, true);
  assert.equal(d.gaps(archived, '2026-Q4').some((g) => g.kind === 'goal'), false);
  assert.equal(d.activeGoals(archived).length, 2);
  assert.equal(d.archivedGoals(archived).length, 1);
});

// --- Closing a quarter -----------------------------------------------------

test('closing carries unachieved work into the current quarter, with its effort', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q2' };
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'Still open from Q3' });
  const stillOpen = s.outcomes[s.outcomes.length - 1];
  s = d.addTimeBox(d.addTimeBox(s, stillOpen.id), stillOpen.id);
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'Finished in Q3' });
  const finished = s.outcomes[s.outcomes.length - 1];
  s = d.setStage(s, finished.id, 'achieved');

  const closed = d.closeElapsed(s, TODAY);
  const carried = d.outcomesIn(closed, '2026-Q4').filter((o) => o.title === 'Still open from Q3');
  assert.equal(carried.length, 1);
  assert.equal(carried[0].boxes, 2);
  assert.equal(carried[0].carriedIn, 2);
  assert.equal(d.outcomesIn(closed, '2026-Q4').some((o) => o.title === 'Finished in Q3'), false);
  assert.equal(closed.carriedThrough, '2026-Q3');
});

test('the closed quarter keeps its record exactly as it stood', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q2' };
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'Still open from Q3' });
  const closed = d.closeElapsed(s, TODAY);
  const q3 = d.outcomesIn(closed, '2026-Q3');
  assert.equal(q3.length, 1);
  assert.equal(q3[0].status, 'open');
  assert.equal(d.outcomesIn(closed, '2026-Q4').filter((o) => o.title === 'Still open from Q3').length, 1);
});

test('an achieved or dropped outcome is left behind, not carried', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q2' };
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'Finished in Q3' });
  const finished = s.outcomes[s.outcomes.length - 1];
  s = d.setStage(s, finished.id, 'achieved');
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'Abandoned in Q3' });
  const abandoned = s.outcomes[s.outcomes.length - 1];
  s = d.dropOutcome(s, abandoned.id);
  const closed = d.closeElapsed(s, TODAY);
  assert.equal(d.outcomesIn(closed, '2026-Q4').some((o) => o.title === 'Finished in Q3'), false);
  assert.equal(d.outcomesIn(closed, '2026-Q4').some((o) => o.title === 'Abandoned in Q3'), false);
});

test('a carried outcome travels with a copy of its objective', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q2' };
  s = d.addObjective(s, { goalId: s.goals[0].id, quarterKey: '2026-Q3', title: 'Q3 migration' });
  const q3Objective = s.objectives[s.objectives.length - 1];
  s = d.addOutcome(s, { quarterKey: '2026-Q3', objectiveId: q3Objective.id, title: 'Open Q3 outcome' });
  const closed = d.closeElapsed(s, TODAY);

  const carried = d.outcomesIn(closed, '2026-Q4').find((o) => o.title === 'Open Q3 outcome');
  const chain = d.chainOf(closed, carried);
  assert.equal(chain.objective.title, 'Q3 migration');
  assert.equal(chain.objective.quarterKey, '2026-Q4');
  assert.equal(chain.objective.carriedFrom, '2026-Q3');
  // The same Objective appears in two quarters' reports.
  assert.equal(closed.objectives.filter((o) => o.title === 'Q3 migration').length, 2);
});

test('an objective with nothing unachieved is not carried', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q2' };
  s = d.addObjective(s, { goalId: s.goals[0].id, quarterKey: '2026-Q3', title: 'Finished Q3 work' });
  const objective = s.objectives[s.objectives.length - 1];
  s = d.addOutcome(s, { quarterKey: '2026-Q3', objectiveId: objective.id, title: 'Done in Q3' });
  const outcome = s.outcomes[s.outcomes.length - 1];
  s = d.setStage(s, outcome.id, 'achieved');
  const closed = d.closeElapsed(s, TODAY);
  assert.equal(closed.objectives.filter((o) => o.title === 'Finished Q3 work' && o.quarterKey === '2026-Q4').length, 0);
});

test('a skipped quarter is recorded with nothing in it, and the carry jumps', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q1' }; // last used in Q1; now it is Q4
  s = d.addOutcome(s, { quarterKey: '2026-Q2', title: 'One box from Q2' });
  const boxed = d.addTimeBox(s, s.outcomes[s.outcomes.length - 1].id);
  const closed = d.closeElapsed(boxed, TODAY);
  assert.equal(d.outcomesIn(closed, '2026-Q3').length, 0);
  const carried = d.outcomesIn(closed, '2026-Q4').find((o) => o.title === 'One box from Q2');
  assert.ok(carried, 'unachieved Q2 work lands in the quarter you are actually in');
  assert.equal(carried.carriedIn, 1);
});

test('carry-forward runs once and is idempotent', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q2' };
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'Still open from Q3' });
  const once = d.closeElapsed(s, TODAY);
  const twice = d.closeElapsed(once, TODAY);
  assert.equal(d.outcomesIn(twice, '2026-Q4').filter((o) => o.title === 'Still open from Q3').length, 1);
});

test('a carried outcome keeps its position in the order', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q2' };
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'Second in Q3' });
  const second = s.outcomes[s.outcomes.length - 1];
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'First in Q3' });
  const third = s.outcomes[s.outcomes.length - 1];
  s = d.reorderOutcome(s, third.id, -1, '2026-Q3');
  const closed = d.closeElapsed(s, TODAY);
  const carried = d.outcomesIn(closed, '2026-Q4').map((o) => o.title);
  assert.deepEqual(carried.slice(-2), ['First in Q3', 'Second in Q3']);
});

test('carrying into the quarter you are in does not renumber what is already there', () => {
  let s = seed();
  s = { ...s, carriedThrough: '2026-Q2' };
  s = d.addOutcome(s, { quarterKey: '2026-Q3', title: 'Old but open' });
  const closed = d.closeElapsed(s, TODAY);
  assert.deepEqual(d.outcomesIn(closed, '2026-Q4').map((o) => o.rank), [1, 2, 3, 4, 5]);
});

// --- The Inbox -------------------------------------------------------------

test('an idea is captured, renamed and discarded with no trace', () => {
  let s = d.emptyState(TODAY);
  s = d.addIdea(s, 'Maybe write about the tally model');
  assert.equal(s.ideas.length, 1);
  s = d.renameIdea(s, s.ideas[0].id, 'Write about the tally model');
  assert.equal(s.ideas[0].text, 'Write about the tally model');
  assert.equal(d.discardIdea(s, s.ideas[0].id).ideas.length, 0);
});

test('an idea is not an outcome, and takes no effort or quarter', () => {
  let s = d.emptyState(TODAY);
  s = d.addIdea(s, 'Something shapeless');
  assert.equal(s.outcomes.length, 0);
  assert.equal(d.quarterTotals(s, '2026-Q4').count, 0);
  assert.equal(d.gaps(s, '2026-Q4').length, 0);
  assert.equal(d.reviewItems(s, '2026-Q4').length, 0);
});

test('promotion consumes the idea and creates the tier it became', () => {
  let s = seed();
  s = d.addIdea(s, 'Learn to sketch');
  const idea = s.ideas[0];

  const asGoal = d.promoteIdea(s, idea.id, { kind: 'goal' });
  assert.equal(asGoal.ideas.length, 0);
  assert.ok(asGoal.goals.some((g) => g.title === 'Learn to sketch'));

  s = d.addIdea(s, 'Write a note on ranking');
  const asObjective = d.promoteIdea(s, s.ideas[s.ideas.length - 1].id, { kind: 'objective', goalId: s.goals[1].id, quarterKey: '2026-Q4' });
  assert.ok(asObjective.objectives.some((o) => o.title === 'Write a note on ranking' && o.quarterKey === '2026-Q4'));

  s = d.addIdea(s, 'Read the SRE book');
  const asOutcome = d.promoteIdea(s, s.ideas[s.ideas.length - 1].id, { kind: 'outcome', quarterKey: '2026-Q4' });
  const created = asOutcome.outcomes.find((o) => o.title === 'Read the SRE book');
  assert.equal(created.objectiveId, null);
  assert.equal(created.boxes, 0);
  assert.equal(asOutcome.ideas.some((i) => i.text === 'Read the SRE book'), false);
});

test('promotion offers all three tiers as targets', () => {
  const s = seed();
  const values = d.promotionTargets(s, '2026-Q4').map((t) => t.value);
  assert.ok(values.includes('goal'));
  assert.equal(values.filter((v) => v.startsWith('outcome')).length, 1);
  assert.equal(values.filter((v) => v.startsWith('objective:')).length, 3);
});

// --- The document ----------------------------------------------------------

test('a newer schema is refused rather than truncated', () => {
  assert.throws(() => d.migrate({ schemaVersion: d.SCHEMA_VERSION + 1 }), /newer version/);
});

test('an old document is accepted and stamped with the current version', () => {
  const migrated = d.migrate({ goals: [], objectives: [], outcomes: [], ideas: [] });
  assert.equal(migrated.schemaVersion, d.SCHEMA_VERSION);
  assert.deepEqual(migrated.ideas, []);
});

test('state round-trips through JSON unchanged', () => {
  const s = seed();
  assert.deepEqual(d.migrate(JSON.parse(JSON.stringify(s))), s);
});
