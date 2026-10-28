# 3. Rough ideas wait in a global Inbox, outside the three tiers

Date: 2026-10-28
Status: Accepted

## Context

Issue #12 asks for rough ideas, recorded at any level: "These would appear in some sort of inbox and be shapeless nuggets that might be valuable or worthless. They would only be integrated into the system after triage."

Nothing in the model could hold such a thing. A Career Goal, a Quarterly Objective and an Implementation Outcome all require a Quarter or a place in one, and the app has spent its whole vocabulary insisting that tier three is a *result you reach*, not an activity you might get to. A rough thought that may become a Goal, or an Objective, or an Outcome, or nothing, cannot be any of them yet.

A prototype of the planning view had to put 180 not-yet-chosen items somewhere, and put them in `2027-Q1` as Implementation Outcomes with no Quarterly Objective. That rendered convincingly, which is exactly why the decision needs recording: the arrangement is wrong in ways the eye cannot see.

## Decision

An **Idea** is a pre-tier capture: a phrase, with no Quarter, no parent, no Stage, no Rank and no Effort. Ideas live in a single **global Inbox**, not a per-Quarter one. Triage **promotes** an Idea into a Career Goal, a Quarterly Objective or an Implementation Outcome, which consumes it, or **discards** it, which also leaves nothing behind.

Ideas therefore never appear in a Quarter's figures, never take a Time Box, are never achieved, are never Gaps, and never reach the Quarter review.

## Considered Options

- **Park Outcomes in a future Quarter** — what the prototype did. Rejected: an Outcome belongs to a Quarter that will be reviewed, so every parked item becomes a Gap the moment that Quarter is current, arriving as one enormous piece of review debt — a backlog the app has deliberately refused to have. It also hands an Idea a Stage and an Effort of zero, and Rank is defined only over the *current* Quarter's Outcomes, so the parked items would be ordered by nothing at all.
- **A fourth tier, a Backlog of uncommitted Outcomes** — rejected: it makes the shapeless thing a unit of work, which is what #12 says it is not, and an Idea may become an Objective or a Goal, so it cannot sit *below* Outcome in the hierarchy at all.
- **A tag on Outcomes marking them as ideas** — rejected: it counts uncommitted things inside a Quarter, so the Quarter's numbers would include work nobody has agreed to; and promotion would have to remove the tag, moving the figures for something that never happened.
- **A per-Quarter Inbox** — rejected: an Idea has not been placed in time yet, so partitioning it by Quarter pre-empts the one decision triage exists to make, and quarter-close would then have to decide what an unexamined idea carries forward as.

## Consequences

- `AppState` gains an Idea collection whenever this lands, and the schema version bumps with it. The Inbox is not reachable from a Quarter, so carry-forward, closing and review ignore it completely — a Quarter can close with 180 Ideas sitting there and nothing about it changes.
- Promotion is destructive by design: no tombstone, no "promoted from" link. If the app later wants to answer *why does this exist*, that is a new decision rather than an extension of this one.
- A large Inbox is normal and must stay cheap to hold. It is a triage queue, not a plan: no ranking, no WIP, and no counts folded into the Quarter strip.
- The Emergency stays a separate door. Both are captures made in a hurry, and the difference is whether you have already decided to do the thing — an Emergency is an Outcome in a Quarter missing only its parent, an Idea is missing everything.
