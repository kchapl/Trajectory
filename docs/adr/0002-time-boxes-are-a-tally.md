# Time Boxes are a tally, not a record

A Time Box is a fixed 25 minutes of wall-clock work on one Implementation Outcome, and the app keeps only a **count** of completed boxes per Outcome — no start times, no durations, no per-box rows. Effort is that count: it grows while the Outcome is unachieved, and settles when the Outcome ends. We chose a tally over a record because the only question the model has to answer is how much an Outcome took, and a count cannot drift, migrate or disagree with itself.

## Considered Options

- **A record per box** (a start, a length, an end, and partial credit for a box stopped early). Rejected: it buys history and auditability this app has no use for, at the price of a growing log that must be migrated and kept consistent.
- **A configurable box length.** Rejected: a count of boxes only means something if it means the same amount of time forever. Make the length settable and every historical figure silently changes meaning the day the setting changes.
- **Pause and resume.** Rejected: resuming requires remembering accumulated time between sessions, which is exactly the state the tally gives up.

## Consequences

- Because the length is fixed, boxes and hours are always convertible: hours are derived for display and never stored.
- There is no partial credit, so 25 uninterrupted minutes is the smallest unit of work the model can see. A box stopped early is discarded.
- There is no notion of *when* a box was worked, so Effort is attributed to the Outcome's Quarter rather than to the moment it ran — a box finishing after a boundary counts in the Quarter the Outcome was in. This is a consequence of the decision, not a defect to be fixed later.
- No daily, weekly or trend reporting is possible, and no work can be reconstructed after the fact.
- A dropped Outcome's boxes still count. The time was spent, and the figure does not get to flatter you.
- Carry-forward exists because of this decision: with no timestamps, an unachieved Outcome continues into the current Quarter carrying the boxes it already has.
