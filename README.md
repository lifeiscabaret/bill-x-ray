# Bill X-Ray

**Same number. Different body.**
**Follow the clause, not just the bill number.**

Bill X-Ray is a tool for legislative reporters and data editors. It compares a bill with
its later versions and follow-up documents, keeps the path of the bill number and its
versions apart from the path of each clause, and opens the official source behind every
line it draws.

Submitted by Seoul Economic Daily (Organization)

## Status

Pre-mockup (2026-11-22). Nothing is built or deployed yet. The specs are in
`.kiro/specs/`, and the steering files in `.kiro/steering/` describe the product, the
stack and the folder layout.

## Pre-existing work

The optional promise field follows the structure of an existing Seoul Economic Daily
promise-tracking service (yaksok.sedaily.ai) that predates the hackathon.

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
