---
inclusion: always
---

# Structure

```
.kiro/
  steering/          product, tech, structure, project-context, research-data, legal-sources, ui-copy
  hooks/             research-data-check, evidence-gate-check, ui-wording-check, publish-guard
  specs/             data-contract, scan-screen, research-ingest
src/
  contract/          data contract (work order §4): types, schema, validation, path status rules
  compare/           text comparison between versions
  ingest/            research rows to contract: normalize, gate, map, report (pure functions); deferred until the app runs (D-020)
  ui/                React components: scan screen, scanner, evidence panel, "Scan your own bill"
  i18n/              en.json (default), ko.json (P1)
scripts/             command-line tools with file access: validate-data, check-copy, check-repo, check-dist (ingest is deferred, D-020)
data/
  cases/             one contract JSON file per case; for P0 entered directly in contract format, only rows with a recorded recheck (D-002, D-006, D-020)
  verification/      the team's own re-checks of evidence against official pages (official excerpts only)
tests/               unit and property tests by area; fixtures/ holds synthetic regression cases
docs/
  DECISIONS.md       one line per gate or load decision
  load-report.md     written by the ingest (deferred, D-020)
  mockup/            static mockup images
```

## Where things go
- Case content (numbers, clauses, excerpts, dates) lives only in `data/` or in test fixtures,
  never in components.
- User-facing strings live only in `src/i18n/`.
- Test fixtures are synthetic or short official-source excerpts. No news article text.
- Verification records name roles (A, B), not people.

## Never in this repository
- The research bundle (raw reports, review packets, extracted rows, run logs, verification
  ledgers, the research kit guide) and the internal handover documents. They stay in a
  folder outside the repository; `publish-guard` warns when one appears here.
- `.env*` files and API keys.
- Rows that did not pass the loading gate.

`/.kiro` stays committed. Never add a `.gitignore` line that hides it or any of its folders.
