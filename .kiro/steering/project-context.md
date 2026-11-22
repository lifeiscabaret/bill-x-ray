---
inclusion: always
---
# Bill X-Ray: project context

## What it is
Bill X-Ray shows what happened to a policy promise reported in the news once it reached the actual statute, through three questions:
1. In the text? Is the promised content in the final clause?
2. Since when? When was it passed, promulgated, made effective and actually applied?
3. Really gone? If it was repealed or scrapped, does it survive in another law?
The message: passing is not the end.

## Scope
- A framework built on Korean cases, then applied to the United States, Japan and China to show that the same illusion appears everywhere.
- One pipeline for all four countries, with no country-specific parsers. An AI multilingual adapter reads the official originals, and a rule-based evidence gate decides.
- Control cases (delivered as promised, on schedule) stay in the dataset so the tool does not look as if it only finds problems.

## Evidence gate
AI may extract clauses, but a verdict passes only when the official URL in the original language, the clause location and the original excerpt match one to one. Otherwise the case is blocked (✕) and shown as unconfirmed.

## Data
Cases, documents, evidence, legal events and legal relations load into CasePack. Korean auto-load target: 100 cases. Research seed as of 2026-11-22: 72 Korean candidates across 12 policy fields, 20 deep-dive cases with clause-level evidence, and 7 core plus 9 reserve overseas cases.

## Out of scope
Judging politicians or parties. Evaluative words. Translations as evidence.
