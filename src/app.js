// The shell. Two modes over one document: Planning is strategy (the ranked list,
// gaps, the review), Implementation is throughput (the board, the timer). All model
// work lives in domain.js; this file reads state, dispatches, and re-renders.
//
// Every control here is a Material 3 component from m3.css, and every colour,
// type style, shape and duration comes from the generated tokens.

import * as d from './domain.js';
import * as store from './store.js';

const app = document.getElementById('app');
const snack = document.getElementById('snack');
const dialog = document.getElementById('dialog');
const dialogHeadline = document.getElementById('dialog-headline');
const dialogBody = document.getElementById('dialog-body');
const dialogConfirm = document.getElementById('dialog-confirm');
const dialogCancel = document.getElementById('dialog-cancel');
const importInput = document.getElementById('import-file');

const current = () => d.quarterOf(new Date());
const shownQuarter = () => viewing || current();
const isReadOnly = () => shownQuarter() !== current();

const loaded = store.load();
let state = loaded.state || d.emptyState();
state = d.closeElapsed(state);
store.save(state);
if (loaded.error) say('Could not read the saved copy. It was kept aside as "trajectory.state.unreadable".');

let mode = store.loadMode();
let hideAchieved = false;
let viewing = null;        // a closed Quarter being read, or null for the current one
let editing = null;        // { kind, id } while a title is being edited
let menu = null;           // { kind, id } while a menu is open
let timer = null;          // { id, endsAt, handle }
let statusHandle = null;
let committing = false;
const openDetails = new Set();

// --- Small helpers ---------------------------------------------------------

function esc(value) {
  return String(value).replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function mmss(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

const ICONS = {
  more: { fill: true, path: '<circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/>' },
  check: { path: '<path d="m5 12.5 4.5 4.5L19 7"/>' },
  chevron: { path: '<path d="m7 10 5 5 5-5"/>' }
};

function icon(name) {
  const spec = ICONS[name];
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"' +
    (spec.fill ? ' fill="currentColor"' : ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') +
    '>' + spec.path + '</svg>';
}

// The M3 snackbar: one line, no buttons, dismissed by time.
function say(message) {
  snack.textContent = message;
  snack.classList.add('is-on');
  clearTimeout(statusHandle);
  statusHandle = setTimeout(() => {
    snack.classList.remove('is-on');
    snack.textContent = '';
  }, 3600);
}

// M3 dialogs ask; they do not use the browser's own chrome.
function confirmAction(options) {
  // A menu would otherwise stay painted behind the dialog that replaced it.
  if (menu) { menu = null; render(); }
  dialogHeadline.textContent = options.headline;
  dialogBody.textContent = options.body || '';
  dialogConfirm.textContent = options.confirmLabel;
  const close = () => {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };
  dialogConfirm.onclick = () => { close(); options.onConfirm(); };
  dialogCancel.onclick = close;
  try {
    if (!dialog.open) dialog.showModal();
  } catch (error) {
    dialog.setAttribute('open', '');
  }
}

function persist() {
  store.save(state);
  render();
}

function titleEditor(kind, id, text) {
  if (editing && editing.kind === kind && editing.id === id) {
    return '<input class="editor" data-editor="' + kind + ':' + id + '" value="' + esc(text) + '" aria-label="Edit">';
  }
  return '<button type="button" class="text" data-edit="' + kind + ':' + id + '">' + esc(text) + '</button>';
}

// On the board the column already says Achieved, so the pill would only repeat it.
function tags(o, onBoard) {
  let out = '';
  if (o.emergency) out += '<span class="tag tag--emergency md-label-small">Emergency</span>';
  if (o.status === 'dropped') out += '<span class="tag tag--dropped md-label-small">Dropped</span>';
  if (o.status === 'achieved' && !onBoard) out += '<span class="tag tag--achieved md-label-small">Achieved</span>';
  return out;
}

function effortBits(o) {
  return '<b>' + d.boxesLabel(o.boxes) + '</b><span>' + d.hours(o.boxes) + '</span>' +
    (o.carriedIn ? '<span class="row__carry">' + o.carriedIn + ' carried in</span>' : '');
}

// --- Menus -----------------------------------------------------------------

function menuItem(attrs, label, extra) {
  return '<button type="button" role="menuitem" class="md-menu__item md-layer' + (extra ? ' ' + extra : '') + '" ' + attrs + '>' + label + '</button>';
}

function menuTrigger(kind, id, label, extraClass) {
  const open = !!menu && menu.kind === kind && menu.id === id;
  return '<button type="button" class="md-icon-button md-layer' + (extraClass ? ' ' + extraClass : '') + '"' +
    ' data-act="menu" data-menu="' + kind + '" data-for="' + (id || '') + '"' +
    ' aria-haspopup="menu" aria-expanded="' + open + '" aria-label="' + label + '">' + icon('more') + '</button>';
}

function menuPanel(kind, id, items, modifier) {
  if (!menu || menu.kind !== kind || (menu.id || '') !== (id || '')) return '';
  return '<div class="md-menu' + (modifier ? ' ' + modifier : '') + '" role="menu">' + items + '</div>';
}

// --- Header, timer ---------------------------------------------------------

// A Quarter is an entity you navigate, not a label: closed ones stay openable as a
// record, and carry-forward is what moves the work on.
function quarterKeys() {
  const keys = new Set([current()]);
  state.objectives.forEach((o) => keys.add(o.quarterKey));
  state.outcomes.forEach((o) => keys.add(o.quarterKey));
  return [...keys].sort().reverse();
}

// The Quarter is the page's title even when there is only one to show; the menu
// that switches to an older record appears once a second Quarter exists.
function quarterSwitch(q) {
  const keys = quarterKeys();
  if (keys.length < 2) return '<h1 class="md-headline-large">' + q + '</h1>';
  return '<h1 class="md-headline-large"><div class="md-menu-wrap">' +
    '<button type="button" class="quarter-button" data-act="menu" data-menu="quarter" aria-haspopup="menu" aria-expanded="' + (!!menu && menu.kind === 'quarter') + '">' +
      q + icon('chevron') +
    '</button>' +
    menuPanel('quarter', '', keys.map((key) =>
      menuItem('data-act="quarter" data-key="' + key + '"', key + (key === current() ? ' \u00b7 current' : ' \u00b7 closed'))
    ).join(''), 'md-menu--left') +
  '</div></h1>';
}

function segmented() {
  const item = (value, label) =>
    '<button type="button" data-act="mode" data-mode="' + value + '" aria-pressed="' + (mode === value) + '">' +
      '<span class="seg-check" aria-hidden="true">' + icon('check') + '</span>' + label +
    '</button>';
  return '<div class="md-segmented" role="group" aria-label="Mode">' + item('planning', 'Planning') + item('implementation', 'Implementation') + '</div>';
}

function topBar() {
  return '<div class="topbar"><div class="shell shell--bar md-top-app-bar">' +
    '<span class="md-top-app-bar__title">trajectory</span>' +
    '<span class="md-top-app-bar__actions">' +
      '<button type="button" class="md-button md-button--text md-layer" data-act="export">Save a copy</button>' +
      '<label class="md-button md-button--text md-layer" for="import-file">Open a copy</label>' +
    '</span>' +
  '</div></div>';
}

function pageHead(q) {
  const totals = d.quarterTotals(state, q);
  return '<header class="page-head">' +
    '<div class="page-head__id">' +
      '<p class="eyebrow md-label-medium">Quarter</p>' +
      quarterSwitch(q) +
      '<p class="page-meta md-body-medium">' + (totals.count
        ? '<span><b>' + totals.count + '</b> Outcomes</span>' +
          '<span><b>' + totals.boxes + '</b> boxes</span>' +
          '<span>' + d.hours(totals.boxes) + '</span>' +
          (totals.carriedIn ? '<span><b>' + totals.carriedIn + '</b> carried in</span>' : '')
        : 'Nothing planned yet') + '</p>' +
    '</div>' +
    '<div class="page-head__tools">' + segmented() + '</div>' +
  '</header>';
}

function timerBar() {
  if (!timer) {
    // Nothing to time yet: a hint about Time Boxes would be the loudest thing on an empty page.
    if (!state.outcomes.some((o) => o.status === 'open')) return '';
    return '<div class="timerbar md-body-medium" id="timerbar">' +
      '<span class="timer__what">' +
        '<span class="timer__dot" aria-hidden="true"></span>' +
        'A Time Box is 25 minutes. Start one from a card on the board.' +
      '</span>' +
    '</div>';
  }
  const outcome = d.outcomeById(state, timer.id);
  if (!outcome) { timer = null; return timerBar(); }
  return '<div class="timer timer--running" id="timerbar">' +
    '<div class="timer__what"><span class="timer__dot" aria-hidden="true"></span><b class="md-body-large">' + esc(outcome.title) + '</b></div>' +
    '<div class="md-headline-small" id="clock" aria-live="off">' + mmss(timer.endsAt - Date.now()) + '</div>' +
    '<button type="button" class="md-button md-button--outlined md-layer" data-act="stop">Stop</button>' +
  '</div>';
}

function paintClock() {
  const clock = document.getElementById('clock');
  if (clock && timer) clock.textContent = mmss(timer.endsAt - Date.now());
}

function startBox(id) {
  if (timer) stopBox();
  timer = { id: id, endsAt: Date.now() + d.BOX_MS, handle: setInterval(tick, 250) };
  render();
}

function tick() {
  if (!timer) return;
  if (Date.now() >= timer.endsAt) finishBox();
  else paintClock();
}

// Only a completed box counts. Stopping early abandons it.
function finishBox() {
  const id = timer.id;
  clearInterval(timer.handle);
  timer = null;
  state = d.addTimeBox(state, id);
  store.save(state);
  say('One box counted.');
  render();
}

function stopBox() {
  if (!timer) return;
  clearInterval(timer.handle);
  timer = null;
  render();
}

// --- Planning view ---------------------------------------------------------

function reviewBlock(q) {
  const items = d.reviewItems(state, q);
  if (!items.length) {
    return '<section class="review"><h2 class="md-title-medium">Quarter review</h2>' +
      '<p class="review__clear md-body-medium">Nothing outstanding. Every goal has an Objective, every Objective has Outcomes, and nothing is unparented.</p></section>';
  }
  return '<section class="review">' +
    '<h2 class="review__head md-title-medium">Quarter review \u00b7 ' + items.length + ' open</h2>' +
    '<ul>' + items.map((item) => {
      let actions = '';
      if (item.kind === 'goal') actions = '<button type="button" class="md-button md-button--text md-layer" data-act="focus" data-target="add-objective-' + item.id + '">Add an Objective</button>';
      else if (item.kind === 'objective') actions = '<button type="button" class="md-button md-button--text md-layer" data-act="focus" data-target="add-outcome-' + item.id + '">Add an Outcome</button>';
      else if (item.kind === 'parentless') actions = '<button type="button" class="md-button md-button--text md-layer" data-act="drop" data-id="' + item.id + '">Drop it</button>' +
        '<span class="md-body-small review__next">or attach it in the list below</span>';
      else actions = '<button type="button" class="md-button md-button--text md-layer" data-act="achieve" data-id="' + item.id + '">Achieve it</button>' +
        '<button type="button" class="md-button md-button--text md-layer" data-act="drop" data-id="' + item.id + '">Drop it</button>';
      return '<li class="review__item">' +
        '<p class="md-body-large">' + esc(item.question) + '</p>' +
        '<p class="review__next md-body-small"><b>Next:</b> ' + esc(item.next) + '</p>' +
        '<div class="review__acts">' + actions + '</div>' +
      '</li>';
    }).join('') + '</ul>' +
  '</section>';
}

function goalIndex() {
  const goals = d.activeGoals(state);
  if (!goals.length) return '';
  return '<nav class="index" aria-label="Career Goals">' + goals.map((goal) => {
    const count = d.objectivesOfGoal(state, shownQuarter(), goal.id).length;
    return '<a class="md-chip md-layer" href="#goal-' + goal.id + '">' + esc(goal.title) +
      '<span class="md-chip__count">' + count + '</span></a>';
  }).join('') + '</nav>';
}

// A parentless Outcome is the one case where the parent still has to be chosen, so
// it gets the only parent control in the list.
function attachControl(o) {
  const objectives = d.activeGoals(state).flatMap((goal) =>
    d.objectivesOfGoal(state, o.quarterKey, goal.id).map((objective) => ({ goal, objective })));
  return '<div class="md-menu-wrap attach">' +
    '<button type="button" class="md-button md-button--text md-layer" data-act="menu" data-menu="attach" data-for="' + o.id + '" aria-haspopup="menu" aria-expanded="' + (!!menu && menu.kind === 'attach' && menu.id === o.id) + '">' +
      'Attach to an Objective' +
    '</button>' +
    menuPanel('attach', o.id, objectives.length
      ? objectives.map(({ goal, objective }) =>
        menuItem('data-act="parent" data-id="' + o.id + '" data-objective="' + objective.id + '"',
          '<span class="md-menu__stack"><span class="md-menu__eyebrow md-body-small">' + esc(goal.title) + '</span>' +
          '<span class="md-body-large">' + esc(objective.title) + '</span></span>'))
        .join('')
      : '<button type="button" class="md-menu__item" disabled>No Objectives this Quarter yet</button>', 'md-menu--left') +
  '</div>';
}

function outcomeRow(o, ro) {
  const settled = o.status !== 'open' || ro;
  return '<li class="row is-' + o.status + (o.emergency ? ' is-em' : '') + '">' +
    '<span class="rank md-label-large">' + (o.status === 'dropped' ? '\u2013' : o.rank) + '</span>' +
    '<div class="row__main">' +
      '<div class="row__title md-body-large">' + titleEditor('outcome', o.id, o.title) + tags(o) + '</div>' +
      // Inside an Objective the parent is already on screen, so the only place
      // the choice needs showing is where there is none yet.
      (o.objectiveId ? '' : '<p class="row__meta md-body-small">No parent</p>') +
      (settled || o.objectiveId ? '' : attachControl(o)) +
    '</div>' +
    '<div class="row__effort md-body-medium">' + effortBits(o) + '</div>' +
    '<div class="row__menu">' + (settled ? '' : '<div class="md-menu-wrap">' +
      menuTrigger('row', o.id, 'Actions for ' + o.title) + menuPanel('row', o.id, rowMenuItems(o)) + '</div>') + '</div>' +
  '</li>';
}

function rowMenuItems(o) {
  return [
    menuItem('data-act="rename" data-id="' + o.id + '"', 'Rename'),
    '<div class="md-menu__sep" role="separator"></div>',
    menuItem('data-act="up" data-id="' + o.id + '"', 'Move up'),
    menuItem('data-act="down" data-id="' + o.id + '"', 'Move down'),
    '<div class="md-menu__sep" role="separator"></div>',
    (o.objectiveId
      ? menuItem('data-act="detach" data-id="' + o.id + '"', 'Detach from its Objective')
      : menuItem('data-act="emergency" data-id="' + o.id + '"', o.emergency ? 'Clear Emergency mark' : 'Mark as Emergency')),
    '<div class="md-menu__sep" role="separator"></div>',
    menuItem('data-act="achieve" data-id="' + o.id + '"', 'Achieve'),
    menuItem('data-act="drop" data-id="' + o.id + '"', 'Drop', 'md-menu__item--danger')
  ].join('');
}

function objectiveSection(objective, ro) {
  const outcomes = d.outcomesOf(state, objective.id);
  const effort = d.objectiveEffort(state, objective.id);
  const ended = d.isEnded(objective, state);
  const menuOpen = !!menu && menu.kind === 'objective' && menu.id === objective.id;
  const items = menuItem('data-act="rename-objective" data-id="' + objective.id + '"', 'Rename this Objective') +
    '<div class="md-menu__sep" role="separator"></div>' +
    menuItem('data-act="drop-objective" data-id="' + objective.id + '"', 'Drop this Objective', 'md-menu__item--danger');
  return '<section class="objective">' +
    '<header class="objective__head">' +
      '<h3 class="objective__title md-title-medium">' + titleEditor('objective', objective.id, objective.title) + '</h3>' +
      '<p class="objective__meta md-body-small"><b>' + outcomes.length + '</b> Outcomes \u00b7 <b>' + effort + '</b> boxes \u00b7 ' + d.hours(effort) +
        (objective.carriedFrom ? ' \u00b7 carried from ' + esc(objective.carriedFrom) : '') +
        (ended ? ' \u00b7 ended' : '') + '</p>' +
      (ro ? '' : '<div class="objective__menu">' +
        '<div class="md-menu-wrap">' + menuTrigger('objective', objective.id, 'Actions for ' + objective.title) +
        menuPanel('objective', objective.id, items) + '</div></div>') +
    '</header>' +
    (outcomes.length
      ? '<ol class="rows">' + outcomes.map((o) => outcomeRow(o, ro)).join('') + '</ol>'
      : '<div class="hole"><b class="md-label-small">Gap</b>No Implementation Outcomes. Add one, or carry the Objective forward empty.</div>') +
    (ro ? '' : '<form class="add" data-form="add-outcome" data-objective="' + objective.id + '">' +
      '<label class="md-field">' +
        '<input class="md-field__input" name="title" id="add-outcome-' + objective.id + '" placeholder=" " autocomplete="off">' +
        '<span class="md-field__label">Add an Outcome</span>' +
      '</label>' +
      '<button class="md-button md-button--filled md-layer" type="submit">Add</button>' +
    '</form>') +
  '</section>';
}

function goalChapter(goal, ro) {
  const q = shownQuarter();
  const objectives = d.objectivesOfGoal(state, q, goal.id);
  return '<section class="chapter" id="goal-' + goal.id + '">' +
    '<header class="chapter__head">' +
      '<h2 class="md-headline-small">' + titleEditor('goal', goal.id, goal.title) + '</h2>' +
      '<p class="chapter__meta md-body-small">' + objectives.length + (objectives.length === 1 ? ' Objective' : ' Objectives') +
        ' \u00b7 <b>' + d.goalEffort(state, q, goal.id) + '</b> boxes</p>' +
    '</header>' +
    (objectives.length ? '' : '<div class="hole"><b class="md-label-small">Gap</b>A Career Goal with nothing committed to it this quarter. Add an Objective, or let it rest.</div>') +
    objectives.map((o) => objectiveSection(o, ro)).join('') +
    (ro ? '' : '<form class="add" data-form="add-objective" data-goal="' + goal.id + '">' +
      '<label class="md-field">' +
        '<input class="md-field__input" name="title" id="add-objective-' + goal.id + '" placeholder=" " autocomplete="off">' +
        '<span class="md-field__label">Add a Quarterly Objective</span>' +
      '</label>' +
      '<button class="md-button md-button--outlined md-layer" type="submit">Add</button>' +
    '</form>') +
    '<div class="chapter__foot"><button type="button" class="md-button md-button--text md-layer" data-act="archive" data-id="' + goal.id + '">Archive this goal</button></div>' +
  '</section>';
}

// "No parent" is a visible state, never a blank, so this section is always here —
// it is also the only place an Outcome can be captured without an Objective, which
// is how an Emergency gets into the world.
function noParentChapter(q, ro) {
  const list = d.parentless(state, q);
  return '<section class="chapter chapter-quiet">' +
    '<header class="chapter__head"><h2 class="md-headline-small">No parent</h2>' +
      '<p class="chapter__meta md-body-small">' + list.length + ' Outcomes \u00b7 <b>' + d.sumBoxes(list) + '</b> boxes</p></header>' +
    (list.length
      ? '<ol class="rows">' + list.map((o) => outcomeRow(o, ro)).join('') + '</ol>'
      : '<p class="chapter__note md-body-medium">An Outcome does not need a Quarterly Objective. An urgent, unexpected one is captured here as an Emergency.</p>') +
    (ro ? '' : '<form class="add" data-form="add-parentless">' +
      '<label class="md-field">' +
        '<input class="md-field__input" name="title" id="add-parentless" placeholder=" " autocomplete="off">' +
        '<span class="md-field__label">Capture an Outcome with no parent</span>' +
      '</label>' +
      '<label class="md-checkbox"><input type="checkbox" name="emergency"><span>Emergency</span></label>' +
      '<button class="md-button md-button--filled md-layer" type="submit">Add</button>' +
    '</form>') +
  '</section>';
}

function inbox(q) {
  const ideas = state.ideas;
  const targets = d.promotionTargets(state, q);
  return '<details class="inbox" data-key="inbox"' + (openDetails.has('inbox') ? ' open' : '') + '>' +
    '<summary class="inbox__summary">' +
      '<span class="md-expand" aria-hidden="true">' + icon('chevron') + '</span>' +
      '<span class="md-title-medium">Inbox \u00b7 ' + ideas.length + (ideas.length === 1 ? ' Idea' : ' Ideas') + '</span>' +
      '<span class="md-body-small inbox__note-inline">outside the quarter</span>' +
    '</summary>' +
    '<p class="inbox__note md-body-medium">An Idea has no Quarter, no Objective, no Effort and no rank, so nothing here touches the quarter\u2019s figures. Promoting one consumes it: it becomes a Career Goal, an Objective or an Outcome.</p>' +
    (ideas.length ? '<ul class="idea-list">' + ideas.map((idea) =>
      '<li class="idea">' +
        '<span class="idea__text md-body-large">' + titleEditor('idea', idea.id, idea.text) + '</span>' +
        '<form class="promote" data-form="promote" data-idea="' + idea.id + '">' +
          '<select class="md-select" name="target" aria-label="Promote to">' +
            targets.map((t) => '<option value="' + t.value + '">' + esc(t.label) + '</option>').join('') +
          '</select>' +
          '<button class="md-button md-button--text md-layer" type="submit">Promote</button>' +
        '</form>' +
        '<button type="button" class="md-button md-button--text md-layer md-button--danger" data-act="discard" data-id="' + idea.id + '">Discard</button>' +
      '</li>').join('') + '</ul>'
      : '<p class="inbox__note md-body-medium">Nothing captured yet.</p>') +
    '<form class="add" data-form="add-idea">' +
      '<label class="md-field">' +
        '<input class="md-field__input" name="title" placeholder=" " autocomplete="off">' +
        '<span class="md-field__label">Capture a rough idea</span>' +
      '</label>' +
      '<button class="md-button md-button--outlined md-layer" type="submit">Capture</button>' +
    '</form>' +
  '</details>';
}

function archivedBlock() {
  const list = d.archivedGoals(state);
  if (!list.length) return '';
  return '<details class="archived" data-key="archived"' + (openDetails.has('archived') ? ' open' : '') + '>' +
    '<summary class="inbox__summary">' +
      '<span class="md-expand" aria-hidden="true">' + icon('chevron') + '</span>' +
      '<span class="md-title-medium">Archived goals \u00b7 ' + list.length + '</span>' +
    '</summary>' +
    '<ul>' + list.map((goal) =>
      '<li class="md-body-large">' + esc(goal.title) +
        '<button type="button" class="md-button md-button--text md-layer" data-act="restore" data-id="' + goal.id + '">Restore</button></li>'
    ).join('') + '</ul>' +
  '</details>';
}

function goalForm(extraClass) {
  return '<form class="add ' + (extraClass || '') + '" data-form="add-goal">' +
    '<label class="md-field">' +
      '<input class="md-field__input" name="title" placeholder=" " autocomplete="off">' +
      '<span class="md-field__label">Add a Career Goal</span>' +
    '</label>' +
    '<button class="md-button md-button--filled md-layer" type="submit">Add</button>' +
  '</form>';
}

function planning(q, ro) {
  const goals = d.activeGoals(state);
  // A brand-new document gets one clear action, not a review of nothing.
  const blank = !ro && !goals.length && !state.outcomes.length;
  const onboarding = blank
    ? '<section class="onboard"><h2 class="md-headline-small">Start with a Career Goal</h2>' +
      '<p class="onboard__copy md-body-medium">A Career Goal is a long-term ambition that outlives any single quarter. Quarterly Objectives and Implementation Outcomes hang off it.</p>' +
      goalForm() + '</section>'
    : '';

  return (blank ? '' : (ro
      ? '<p class="closed-note md-body-medium">Closed Quarter. This is its record exactly as it stood \u2014 to work, switch back to ' + current() + '.</p>'
      : reviewBlock(q))) +
    onboarding + goalIndex() +
    goals.map((goal) => goalChapter(goal, ro)).join('') +
    (blank ? '' : noParentChapter(q, ro)) +
    inbox(q) +
    archivedBlock() +
    (ro || blank ? '' : goalForm('goal-add'));
}

// --- Implementation view: the board ---------------------------------------

function stageMenu(o) {
  const items = menuItem('data-act="rename" data-id="' + o.id + '"', 'Rename') +
    '<div class="md-menu__sep" role="separator"></div>' +
    ['todo', 'doing', 'achieved'].map((stage) =>
      menuItem('data-act="stage" data-id="' + o.id + '" data-stage="' + stage + '"' + (d.stageOf(o) === stage ? ' disabled' : ''),
        d.STAGE_LABELS[stage])).join('');
  return '<div class="md-menu-wrap">' + menuTrigger('card', o.id, 'Move ' + o.title) +
    menuPanel('card', o.id, items) + '</div>';
}

function boardCard(o, ro) {
  const chain = d.chainOf(state, o);
  const settled = o.status !== 'open' || ro;
  return '<article class="card md-card is-' + o.status + (o.emergency ? ' is-em' : '') + '"' +
    (settled ? '' : ' draggable="true"') + ' data-id="' + o.id + '">' +
    '<h3 class="card__title md-body-large">' + titleEditor('outcome', o.id, o.title) + tags(o, true) + '</h3>' +
    '<p class="card__chain md-body-small">' + (chain
      ? esc(chain.goal.title) + ' <span class="sep">\u2192</span> ' + esc(chain.objective.title)
      : '<span class="card__none">No parent</span>') + '</p>' +
    '<div class="card__foot md-body-small">' + effortBits(o) + '</div>' +
    (settled ? '' :
      '<div class="card__actions">' +
        '<button type="button" class="md-button md-button--tonal md-layer" data-act="start" data-id="' + o.id + '">Start 25:00</button>' +
        stageMenu(o) +
      '</div>') +
  '</article>';
}

function board(q, ro) {
  const totals = d.quarterTotals(state, q);
  const columns = d.boardColumns(state, q);
  const spent = d.sumBoxes(d.outcomesIn(state, q).filter((o) => o.status === 'achieved'));

  return '<section class="board-sum md-body-medium">' +
    '<span><b>' + totals.count + '</b> live</span>' +
    '<span><b>' + totals.doing + '</b> doing</span>' +
    '<span><b>' + totals.achieved + '</b> achieved</span>' +
    '<span><b>' + spent + '</b> boxes on achieved work</span>' +
    '<span><b>' + totals.boxes + '</b> boxes \u00b7 ' + d.hours(totals.boxes) + '</span>' +
    (totals.carriedIn ? '<span><b>' + totals.carriedIn + '</b> carried in</span>' : '') +
    '<button type="button" class="md-button md-button--text md-layer" data-act="toggle-achieved">' + (hideAchieved ? 'Show achieved' : 'Hide achieved') + '</button>' +
  '</section>' +
  '<div class="board">' + columns.map((column) => {
    const hidden = hideAchieved && column.stage === 'achieved';
    return '<section class="col" data-stage="' + column.stage + '" data-drop="' + column.stage + '">' +
      '<header class="col__head"><h2 class="md-label-large">' + column.label + '</h2>' +
        '<span class="col__count md-label-large">' + column.outcomes.length + '</span></header>' +
      (hidden
        ? '<p class="col__empty md-body-medium">' + column.outcomes.length + ' achieved. <button type="button" class="md-button md-button--text md-layer" data-act="toggle-achieved">Show them</button></p>'
        : (column.outcomes.length ? column.outcomes.map((o) => boardCard(o, ro)).join('') : '<p class="col__empty md-body-medium">Nothing here.</p>')) +
    '</section>';
  }).join('') + '</div>';
}

// --- Render ---------------------------------------------------------------

function render() {
  const q = shownQuarter();
  const ro = isReadOnly();
  app.innerHTML = topBar() +
    '<div class="shell">' + pageHead(q) + timerBar() +
    (mode === 'planning' ? planning(q, ro) : board(q, ro)) + '</div>';
  if (editing) {
    const input = app.querySelector('.editor');
    if (input) { input.focus(); input.select(); }
  }
  positionMenus();
  if (menu) {
    const first = app.querySelector('.md-menu__item:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }
}

// M3 menus avoid the window edge: a menu with no room below opens upward.
function positionMenus() {
  app.querySelectorAll('.md-menu').forEach((panel) => {
    const rect = panel.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8 && rect.top > rect.height) panel.classList.add('md-menu--up');
  });
}

// --- Editing --------------------------------------------------------------

function commitEditor(input) {
  if (!editing || committing) return;
  committing = true;
  const value = input.value;
  const target = editing;
  editing = null;
  if (target.kind === 'goal') state = d.renameGoal(state, target.id, value);
  else if (target.kind === 'objective') state = d.renameObjective(state, target.id, value);
  else if (target.kind === 'outcome') state = d.renameOutcome(state, target.id, value);
  else if (target.kind === 'idea') state = d.renameIdea(state, target.id, value);
  committing = false;
  persist();
}

// --- Actions --------------------------------------------------------------

function act(name, el) {
  const id = el.dataset.id;
  switch (name) {
    case 'rename':
      menu = null;
      editing = { kind: 'outcome', id };
      render();
      return;
    case 'rename-objective':
      menu = null;
      editing = { kind: 'objective', id };
      render();
      return;
    case 'menu': {
      const kind = el.dataset.menu;
      const key = el.dataset.for || '';
      const same = menu && menu.kind === kind && (menu.id || '') === key;
      menu = same ? null : { kind, id: key };
      render();
      return;
    }
    case 'mode':
      menu = null;
      mode = el.dataset.mode;
      store.saveMode(mode);
      render();
      return;
    case 'quarter':
      menu = null;
      viewing = el.dataset.key === current() ? null : el.dataset.key;
      render();
      return;
    case 'export':
      store.download(state);
      say('Saved a copy of your state.');
      return;
    case 'start':
      menu = null;
      startBox(id);
      return;
    case 'stop':
      stopBox();
      say('Box abandoned \u2014 it does not count.');
      return;
    case 'achieve':
      menu = null;
      state = d.setStage(state, id, 'achieved');
      persist();
      return;
    case 'stage':
      menu = null;
      state = d.setStage(state, id, el.dataset.stage);
      persist();
      return;
    case 'parent':
      menu = null;
      state = d.setOutcomeParent(state, id, el.dataset.objective);
      persist();
      return;
    case 'drop':
      confirmAction({
        headline: 'Drop this Outcome?',
        body: 'It leaves the plan. The Effort it took still counts, so the Quarter\u2019s figures do not change.',
        confirmLabel: 'Drop',
        onConfirm: () => { state = d.dropOutcome(state, id); persist(); }
      });
      return;
    case 'detach':
      menu = null;
      state = d.setOutcomeParent(state, id, null);
      persist();
      return;
    case 'drop-objective':
      confirmAction({
        headline: 'Drop this Objective?',
        body: 'Its open Outcomes are dropped with it. The Effort already spent still counts.',
        confirmLabel: 'Drop',
        onConfirm: () => { state = d.dropObjective(state, id); persist(); }
      });
      return;
    case 'emergency': {
      menu = null;
      const outcome = d.outcomeById(state, id);
      state = d.setEmergency(state, id, !(outcome && outcome.emergency));
      persist();
      return;
    }
    case 'up':
      menu = null;
      state = d.reorderOutcome(state, id, -1, current());
      persist();
      return;
    case 'down':
      menu = null;
      state = d.reorderOutcome(state, id, 1, current());
      persist();
      return;
    case 'archive':
      state = d.setGoalArchived(state, id, true);
      persist();
      return;
    case 'restore':
      state = d.setGoalArchived(state, id, false);
      persist();
      return;
    case 'discard':
      confirmAction({
        headline: 'Discard this Idea?',
        body: 'Nothing was spent on it, so it leaves no record.',
        confirmLabel: 'Discard',
        onConfirm: () => { state = d.discardIdea(state, id); persist(); }
      });
      return;
    case 'toggle-achieved':
      hideAchieved = !hideAchieved;
      render();
      return;
    case 'focus': {
      const target = document.getElementById(el.dataset.target);
      if (target) { target.focus(); target.scrollIntoView({ block: 'center' }); }
      return;
    }
    default:
      return;
  }
}

// --- Events ---------------------------------------------------------------

app.addEventListener('click', (event) => {
  const editEl = event.target.closest('[data-edit]');
  if (editEl) {
    const parts = editEl.dataset.edit.split(':');
    editing = { kind: parts[0], id: parts[1] };
    render();
    return;
  }
  const el = event.target.closest('[data-act]');
  if (!el || el.disabled) return;
  act(el.dataset.act, el);
});

// A menu closes on any click that is not a menu item or another menu trigger.
document.addEventListener('click', (event) => {
  if (!menu) return;
  if (event.target.closest('.md-menu')) return;
  if (event.target.closest('[data-act="menu"]')) return;
  menu = null;
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (menu) { menu = null; render(); }
});

app.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector('input');
  const value = input ? input.value : '';
  const kind = form.dataset.form;

  if (kind === 'add-goal') state = d.addGoal(state, value);
  else if (kind === 'add-objective') state = d.addObjective(state, { goalId: form.dataset.goal, quarterKey: current(), title: value });
  else if (kind === 'add-outcome') {
    const objective = d.objectiveById(state, form.dataset.objective);
    state = d.addOutcome(state, { quarterKey: objective.quarterKey, objectiveId: objective.id, title: value });
  } else if (kind === 'add-parentless') {
    const wasEmpty = state.outcomes.length;
    state = d.addOutcome(state, { quarterKey: current(), title: value });
    const emergency = form.querySelector('input[name="emergency"]');
    if (emergency && emergency.checked && state.outcomes.length > wasEmpty) {
      state = d.setEmergency(state, state.outcomes[state.outcomes.length - 1].id, true);
    }
  } else if (kind === 'add-idea') state = d.addIdea(state, value);
  else if (kind === 'promote') {
    const ideaId = form.dataset.idea;
    const target = form.querySelector('select').value;
    if (target === 'goal') state = d.promoteIdea(state, ideaId, { kind: 'goal' });
    else if (target === 'outcome') state = d.promoteIdea(state, ideaId, { kind: 'outcome', quarterKey: current() });
    else state = d.promoteIdea(state, ideaId, { kind: 'objective', goalId: target.split(':')[1], quarterKey: current() });
    say('Promoted out of the Inbox.');
  }
  persist();
});

// M3 menus are keyboard menus: arrows move, Home and End jump, Escape closes.
app.addEventListener('keydown', (event) => {
  const panel = event.target.closest('.md-menu');
  if (!panel) return;
  const items = [...panel.querySelectorAll('.md-menu__item:not([disabled])')];
  if (!items.length) return;
  const at = items.indexOf(document.activeElement);
  if (event.key === 'ArrowDown') { event.preventDefault(); items[(at + 1) % items.length].focus(); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
  else if (event.key === 'Home') { event.preventDefault(); items[0].focus(); }
  else if (event.key === 'End') { event.preventDefault(); items[items.length - 1].focus(); }
});

app.addEventListener('keydown', (event) => {
  const input = event.target.closest('.editor');
  if (!input) return;
  if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
  else if (event.key === 'Escape') { event.preventDefault(); editing = null; render(); }
});

app.addEventListener('focusout', (event) => {
  const input = event.target.closest('.editor');
  if (!input || !editing) return;
  commitEditor(input);
});

// The Inbox remembers whether it was open across a render.
app.addEventListener('toggle', (event) => {
  const el = event.target;
  if (!el || el.tagName !== 'DETAILS' || !el.dataset.key) return;
  if (el.open) openDetails.add(el.dataset.key);
  else openDetails.delete(el.dataset.key);
}, true);

// Drag a card to claim attention. Terminal states are not draggable.
app.addEventListener('dragstart', (event) => {
  const card = event.target.closest('.card');
  if (!card) return;
  event.dataTransfer.setData('text/plain', card.dataset.id);
  event.dataTransfer.effectAllowed = 'move';
});

app.addEventListener('dragover', (event) => {
  const column = event.target.closest('[data-drop]');
  if (!column) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
});

app.addEventListener('drop', (event) => {
  const column = event.target.closest('[data-drop]');
  if (!column) return;
  event.preventDefault();
  const id = event.dataTransfer.getData('text/plain');
  if (!id) return;
  state = d.setStage(state, id, column.dataset.drop);
  persist();
});

// The M3 ripple follows the pointer from wherever it pressed.
app.addEventListener('pointerdown', (event) => {
  const target = event.target.closest('.md-layer');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const span = document.createElement('span');
  span.className = 'md-ripple';
  span.style.width = span.style.height = size + 'px';
  span.style.left = (event.clientX - rect.left - size / 2) + 'px';
  span.style.top = (event.clientY - rect.top - size / 2) + 'px';
  target.appendChild(span);
  setTimeout(() => span.remove(), 700);
});

importInput.addEventListener('change', async () => {
  const file = importInput.files && importInput.files[0];
  if (!file) return;
  try {
    state = await store.readFile(file);
    state = d.closeElapsed(state);
    store.save(state);
    say('Opened a copy.');
    render();
  } catch (error) {
    say(error.message || 'Could not open that file.');
  } finally {
    importInput.value = '';
  }
});

render();
