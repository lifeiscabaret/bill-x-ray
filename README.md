# Bill X-Ray

**Same number. Different body.**
**Follow the clause, not just the bill number.**

Bill X-Ray is a tool for legislative reporters and data editors. It compares a bill with
its later versions and follow-up documents, keeps the path of the bill number and its
versions apart from the path of each clause, and opens the official source behind every
line it draws.

Submitted by Seoul Economic Daily (Organization)

## Status

Mockup build, state of 2026-11-24.

- The app runs locally (`npm run dev`, http://127.0.0.1:4748). It has the scan screen and
  the "Scan your own bill" form. With no case data it opens on the form.
- Tests and checks run offline: `npm test`, `npm run validate:data`, `npm run check:copy`,
  `npm run check:repo`, `npm run check:dist` and `npm run build`.
- No demo case is loaded. `data/cases/` and `data/verification/` hold only placeholders,
  because the two evidence rechecks (the U.S. and the Korean sample) are still pending.
- Nothing is deployed. The deploy runbook, [docs/DEPLOY.md](docs/DEPLOY.md), has not been
  run.

What is finished, what is left and what waits on a decision is in
[docs/HANDOFF.md](docs/HANDOFF.md). The specs are in `.kiro/specs/`, and the steering files
in `.kiro/steering/` describe the product, the stack and the folder layout.

## Pre-existing work

The optional promise field follows the structure of an existing Seoul Economic Daily
promise-tracking service (yaksok.sedaily.ai), which is a separate service.
A check of the tracked files and history found no code or data from that service in
this repository.

Two planning notes (a handover note and a mockup work order) were written on 2026-11-19 to
2026-11-20 and are kept outside this repository; the steering files summarize them. The
first eight .kiro files were prepared outside Kiro on 2026-11-22 and committed as received,
apart from one title; later changes to them were made in Kiro. How Kiro was used is
described in [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md) (draft).

## License

- **Code:** MIT. See [LICENSE](LICENSE).
- **Legal texts and news:** excerpts of bill and statute texts and of Seoul Economic Daily
  articles may appear in this repository. Other news appears only as outlet, date, title,
  link and our own sentence. These texts are not covered by the MIT License. Any rights in
  them remain with their original authors and publishers, under each source's own terms.
  *Draft wording, to be confirmed before submission.*

`/.kiro` (specs, steering and hooks) is part of the project and must stay committed.

## How Kiro was used

See [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md) (draft).

## Team and roles

Contributors are named by GitHub account only (seunghow, lifeiscabaret). The "Team and
roles" section of [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md) lists who did what, with commit
hashes and paths, and says what the repository does not show.
