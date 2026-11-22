---
inclusion: always
---

# Product: Bill X-Ray

The handover and the mockup work order cited as "handover §n" and "work order §n" are
internal documents kept outside this repository. What matters for building is summarized
here and in `project-context.md`.

## One sentence
A tool for legislative reporters and data editors that compares a bill with its later
versions and follow-up documents, keeps the path of the bill number apart from the path
of each clause, and opens the official source behind every line it draws.

First-screen copy: **Same number. Different body.** / **Follow the clause, not just the bill number.**

## Who it is for
- Primary users: legislative reporters and data editors.
- Viewers abroad who do not know how bills move must see why the two lines split before
  they read any explanation.

## What makes it different
Congress.gov, LegiScan and similar services already offer search, related bills, text
versions and text diffs. Bill X-Ray keeps the number path and the clause path apart, lets
every line that reaches another document open its official source, and handles a new case
the same way without code changes. The last point counts only once a real third case has
been scanned.

## Scope (work order §3)
P0, this build:
1. Scan screen: US H.R. 748 ("Same number. Different body.") and the Korean Semiconductor
   Special Act (different number; some content carried in modified form, some not in the
   final text), both read through one data contract and one renderer.
2. "Scan your own bill": a real case the app has never seen, entered through the UI and
   compared by the tool.
3. Unverified states that never turn into confirmed ones.

P1, later: Korean UI toggle and term help, sample and result JSON export, restrained scan
and splice motion.

Out of scope: worldwide automatic collection, automatic URL interpretation, crawlers,
PDF/OCR, a runtime LLM or AI adapter, login, integration with live sites, a separate design
system, a legal model, automatic loading of 100 Korean cases, deployment, outbound
messages, payments and license changes. Development is local only. Never promise that a
URL alone lets the tool trace a bill in any country.

## Team (work order §2)
Two people, separate from the ATLAS Lineage team (no shared project or folders).

| Role | Owns | Checked by |
|---|---|---|
| A: data and verification | The data contract, pasting source text, version comparison and relation checks, the US and Korean samples, independent test cases | B enters real material that A has not seen |
| B: screen and demo | The English-first scan screen, number and clause paths, the evidence panel and unverified states, narrow screens and keyboard use, the 45-second demo | A checks sources, clauses and English labels |

Order: agree on the data contract; A builds comparison and checks while B builds the
screen on the same contract; connect the US and Korean samples; review new input and
errors; rehearse the demo.

## Done when (work order §3 and §5)
- The US and Korean samples share the contract and the renderer, and a first-time viewer
  can tell the two lines apart within 15 seconds.
- A teammate adds a real third case through the UI with no developer help and no code
  change, sees at least one sentence-level difference and opens two source anchors.
  "Not verified" may remain on the link.
- Missing evidence and wrong dates never show as a confirmed link or as "in effect".
- 360 px and desktop widths, keyboard only and reduced motion give the same result.
- Internal goal only: 4 of 5 English speakers with no legislative background name the
  difference within 15 seconds. Not advertised before it is measured.

## Target category (not yet approved)
Frankenstein: official legislative records, document version comparison and
evidence-bound clause tracing stitched into one tool. Costume Contest is considered only if
the UI is distinctive and functional enough. Two countries in one app is not Skeleton Crew.

## Non-negotiables
- No scores for politicians, parties or bills, no evaluative words, and no framing in
  which failed bills become monsters.
- Every line rests on official evidence or shows its unverified state.
- Claims about what Kiro contributed rest only on real tests and the change history.

## Decided
- Entry name: Seoul Economic Daily as an organization, for both its entries, approved by
  the company's representative (`docs/DECISIONS.md` D-007).
- Code license: MIT, copyright holder Seoul Economic Daily (D-005).
- The Korean sample stays in the demo only if its evidence is confirmed under D-006.

## Decisions not yet made
The data license, rights to the Seoul Economic Daily newsroom legislative tracking project
(brand, data/API, article redistribution), deployment and the act of submitting. Nothing in
this repository authorizes them.
