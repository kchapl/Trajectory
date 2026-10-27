# CONTEXT — trajectory

The domain language for this project. Read this before exploring the codebase, and use these terms in issue titles, briefs, test names and acceptance criteria rather than inventing synonyms. See `docs/agents/domain.md` for the consumer rules.

## What this is

A single-user tool for setting long-term ambitions and tracing implementation work back up to them. Three tiers, one unit of work, and an explicit chain of custody from an Implementation Outcome to the Career Goal it serves.

## Glossary

### Career Goal

The top tier: a long-term ambition that outlives any single quarter (for example, "become a staff engineer"). A Career Goal spans many Quarters and has no completion date of its own; it is reviewed, not closed.

Not a "Milestone" — see *Retired terms*.

### Quarterly Objective

The middle tier: a concrete result committed to within one Quarter, and the level at which progress is actually reviewed. Larger than an Implementation Outcome, smaller than a Career Goal. A Quarterly Objective is **composed of** Implementation Outcomes: it is achieved by achieving them, and has no progress of its own beyond theirs.

### Quarter

A first-class, dated container — a calendar quarter with a start and an end date (for example `2026-Q3`) — that can be listed and reviewed after it has closed. Quarter is an entity you navigate, not merely a label stamped on a Quarterly Objective: the closed Quarter is the unit of review.

A Quarter **closes at its calendar boundary**, without being asked to: the first use of the app after a boundary closes the Quarter that ended and carries forward whatever was unachieved in it. Closing is a date rather than an act — reviewing is what you do afterwards, and dropping only ever happens there.

### Implementation Outcome

The bottom tier and the only unit of work: something specific that is to be **achieved**. A Quarterly Objective is composed of zero or more Implementation Outcomes.

An Outcome is achieved, not "done". The distinction is why the tier is not called a task: a task is an activity you finish, an Outcome is a result you reach, and this app is about tracing results. Identifier: `ImplementationOutcome`. Called an *Outcome* for short once the tier is unambiguous; never use a bare "objective" for this tier, which is tier two.

### Time Box

A single **25-minute** interval of focused work on one Implementation Outcome, attested by the app's own clock. The length is fixed and not configurable, so a Time Box means the same thing everywhere and at all times.

A Time Box is discrete, and it is **counted rather than recorded**. It is either completed or it is not: a box stopped before its 25 minutes are up does not count, and there is no partial or fractional credit. Boxes are not entities with a start, a length and an end — the app keeps a count per Outcome, and the domain has no notion of *when* a box was worked.

Every box belongs to exactly one Implementation Outcome: the timer cannot start until one is chosen, and there is no such thing as unowned work. A box is 25 minutes of wall-clock and cannot be paused, so stopping one abandons it.

Breaks are not part of the domain. The timer cycles between boxes with breaks between them, but there is no Break concept and no cycle entity here.

### Effort

The number of completed Time Boxes an Implementation Outcome has taken. Effort is a **result, not a plan**: nothing estimates it in advance, and there is no forecast for it to contradict.

Effort is both **ongoing and final**. While the Outcome is unachieved the number grows as boxes are completed and is still called Effort; when the Outcome ends it stops moving and is settled. Nothing is added afterwards — achievement is terminal, so further work in the same area is a new Outcome.

Effort is counted in **boxes**. Hours are derived rather than stored, because a box is always 25 minutes: ten boxes is 4h 10m, and it will be the same in ten years.

Effort is attributed to the **Outcome's Quarter**, never to when a box was worked — with no per-box times the app cannot know, and it does not pretend to. So a box that ends after a boundary still counts in the Quarter the Outcome was in when it ran.

Effort belongs to the Outcome, not to the Quarterly Objective. An Objective's figure is the sum over all its Outcomes, achieved or dropped — derived, never stored — and an Objective has no Effort of its own. Time on a parentless Outcome belongs to its Quarter but to no Objective. Because Effort is retrospective rather than planned, a Quarter has no planned capacity: nothing here can say in advance how many boxes a Quarter will take.

### Carry-forward

What happens to an Outcome that is still unachieved when its Quarter closes: it continues into the current Quarter and opens **carrying in** the boxes it has already taken. Those boxes are its *carried-in Effort*, and a Quarter's figures keep carried-in Effort distinct from Effort worked in that Quarter.

The Outcome's Objective travels with it — copied into the current Quarter holding the Outcomes that are still unachieved — while the closed Quarter keeps its own record exactly as it stood. The same Objective can therefore appear in two Quarters' reports. An Objective is carried only if at least one of its Outcomes is still unachieved; otherwise it is left behind.

If more than one Quarter has elapsed since the app was last used, the carry **jumps**: every Quarter up to the current one is closed, but unachieved work lands in the Quarter you are actually in, and the Quarters you skipped are recorded with nothing in them.

### Dropped

How an Outcome or Objective ends when it is abandoned rather than achieved. Dropping is a decision taken at the Quarter review and is never automatic. A dropped Outcome still counts: the boxes it took were spent, its Effort is settled by being dropped rather than by achievement, and it stays in its Objective's and its Quarter's figures.

### Card

UI shorthand only. A Card is how an Implementation Outcome is *displayed* on the board, not a thing in itself. Don't use "card" in specs, briefs, issue titles or acceptance criteria where an Outcome is meant.

### Traceability

The property that an Implementation Outcome can be walked up its parent chain to the Quarterly Objective and the Career Goal it serves, and that the display shows that chain on the Outcome itself rather than hiding it.

An Outcome's parent is **optional**. An Outcome serving no Objective is a *parentless Outcome*, and the display must render that state **explicitly**: "no parent" is a visible state, never a blank or ambiguous indicator. Parentless Outcomes surface in the Quarter review so they get attached to an Objective or dropped. An emergency is the motivating case for a parentless Outcome, but the model does not restrict parentless-ness to emergencies — see below.

### Emergency

An Implementation Outcome captured in a hurry because it is urgent and unexpected, and **marked** so that everyone — the review included — knows its lack of a parent is deliberate rather than unfinished.

An Emergency is **parentless by definition**: an Outcome that has a parent is not an Emergency, and attaching one to a Quarterly Objective clears the mark, because the work turned out to belong to the plan after all. Marking an Outcome as an Emergency therefore requires that it has no parent.

The mark's entire job is to change the question the Quarter review asks. An ordinary parentless Outcome is asked to be **attached or dropped**; an Emergency is asked to be **achieved or dropped**, since finding it a parent was never the point. In every other respect it is an ordinary Outcome: its Time Boxes count toward its Quarter, and if it is still unachieved at a boundary it carries forward like anything else.

## Retired terms

- **Milestone** — issue #1 says "Career goal" in its hierarchy line and "Career milestone" in its traceability line. These are one concept; the canonical name is **Career Goal**. Don't reintroduce Milestone as a fourth tier unless it earns behaviour that distinguishes it.
- **Task**, **implementation task**, **implementation level**, **ticket** — all mean **Implementation Outcome**. "Task" was the tier-three noun until 2026-10-27 and was retired because the tier is a unit of *result*, not of activity. Code written from this glossary must not introduce a `Task` type.
- **"Card" as a domain noun** — see above; it names a rendering, not a model.
- **"Outcome" used bare for tier two** — tier two is a Quarterly Objective; "Outcome" alone means an Implementation Outcome. The qualifier carries the tier, so don't let the two nouns collapse into each other.
- **Pomodoro**, **session**, **interval**, **break** — the technique and the timer's behaviour, not model nouns. The domain terms are **Time Box** and **Effort**. Issue #2 is titled "Add pomodoro support", but the technique's name is not the project's vocabulary.

## Settled elsewhere

- **Where the data lives, and what "portable" obliges** — a local-first static app, no backend, no account, browser storage with JSON export/import. See `docs/adr/0001-local-first-static-app-with-browser-store.md`.

## Open decisions

- **The board's column and stage model** — issue #1 asks for a drag-and-drop Kanban view but never says what the columns mean, whether stages are fixed or user-defined, or what a card moving between them asserts. Filed as issue #8; its absence is why the board is not part of the hierarchy slice.
- **Whether work can be created in a future Quarter** (issue #6) — postponing an Outcome into a Quarter that has not started yet is a planning act, and the planning/implementation split in issue #6 is ungrilled, so nothing here says whether a future Quarter is writable.
- **An Objective whose Outcomes are all dropped** (found by the issue #5 audit) — an Objective carries forward only while at least one of its Outcomes is still unachieved, and what becomes of the Objective that has none left is undecided.
- **Goal deletion or archival** (found by the issue #5 audit) — Goals are reviewed and never closed, and whether one can be removed at all is undecided.
- **Deleting an Outcome that has Effort** (found by the issue #5 audit) — whether deleting discards the boxes already spent is undecided, and the Quarter review's path deletes parentless Outcomes.
- **Schema migration** (found by the issue #5 audit) — a schema version is required in `AppState`, but nothing yet says what happens when the shape changes.
- **Planning vs implementation modes** (issue #6) — mode is not yet a term, and issue #1's four key features do not mention it.

The terms above accrete as issues #2, #4 and #6 are grilled; there is no separate tracking issue for the vocabulary.
