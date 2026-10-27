# 1. Local-first static app with a browser store and JSON file export

Date: 2026-10-27
Status: Accepted

## Context

`trajectory` is a single-user planning tool. Issue #1 sets two hard constraints, and the maintainer has confirmed how the first is to be read:

- **Portable** — usable "from any browser without hardware lock-in", with portability confirmed as the priority criterion. The user's data must not be trapped in a service, a machine, or a browser profile.
- **Only reliable free third-party services that don't require payment details.**

A catalog search for a free hosted Postgres that does not require a credit card returned no candidates, and free application hosting (Vercel Hobby) could not be confirmed card-free. Any design whose correctness depends on a card-free managed database therefore rests on an unverified premise.

## Decision

`trajectory` is a **local-first static web app**.

- It ships as a **static bundle** — HTML, JS and CSS with no server-side component and no database — so it can be served by any free static host (GitHub Pages by default). The host being swappable is itself a portability property.
- There is **no account and no authentication**. Single-user is a design fact, not a setting.
- Application state lives in **browser storage** on the user's device, as a single serialisable document.
- Portability is delivered by **explicit JSON export and import**: "Save a copy" writes the whole state to a file the user owns, and "Open a copy" restores it. The export *is* the state, so there is no partial or lossy migration path to maintain.
- Browser storage plus export/import is the only required persistence mechanism, and it works in every current browser, including iOS Safari.

## Consequences

- Every constraint in issue #1 is met without depending on any third party's billing policy: no server, no database, no account.
- **Single-device by default.** Two browsers are two independent states, reconciled only by exporting from one and importing into the other. This is accepted as the cost of needing no backend, and export/import is the same mechanism that makes the data portable.
- **All state must fit in one document** that can be serialised, versioned and restored, so schema changes need a migration path inside that document.
- **Backups are the user's responsibility.** A cleared browser profile destroys the data unless a copy was exported. Anything that reduces this risk (nudging an export, autosaving to a linked file) is additive and does not revisit this decision.
- **Multi-device sync would be a new decision**, not an extension of this one, since it reintroduces the account and hosted-store questions this ADR exists to avoid.

## Alternatives considered

- **Hosted app with a managed database** (login, sync across devices). Rejected: no card-free free Postgres could be verified, so it fails issue #1's constraint on unverified ground.
- **File System Access API as the primary store** (a real file on disk, autosaved in place). Rejected as the primary mechanism: it is Chromium-desktop only, so Firefox, Safari and all of iOS fall back to download/upload, contradicting "from any browser". Retained as a possible future mirror over the browser store.
- **Desktop application.** Rejected: hardware lock-in, the exact thing issue #1 rules out.
