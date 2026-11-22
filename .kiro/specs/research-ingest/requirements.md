# Requirements Document: research-ingest

## Introduction

Loads the deep-research results, kept outside this repository as JSON Lines in an exchange
format, into the data contract (spec `data-contract`), with a rule-based gate so that a line
reaches the screen as confirmed only when its evidence matches the official source one to
one. Adapted from the handoff spec prompt; the output is the work order §4 data contract
instead of CasePack.

Inputs as measured on 2026-11-22 (development and test data; cross-review and sample checks
are pending):
- `<research>/jsonl/<module>/<type>.jsonl` for modules B5, B1, B2a, B2b, B2c, B3a, B3b, B3R,
  B4 and B4R: 1,404 rows that reduce to 993 unique ids. The B3R folder repeats every B3a and
  B3b row and the B4R folder repeats every B4 row; all 411 repeated ids are identical.
- `<research>/verify/<module>/열람확인.jsonl`: the verification ledger, 589 rows (source 400,
  document 116, evidence 73), recording whether each URL opened and whether each excerpt
  appears word for word on the linked page.
- Later: a cross-review result per row (load as is / load after fix / re-research).

Role: A.

## Glossary

- **Research_Dir**: the research folder, given by `--research <dir>` or
  `BILLXRAY_RESEARCH_DIR`; always outside this repository.
- **Row**: one exchange-format JSON object with `type` and `id`.
- **Ledger**: the verification ledger rows, keyed by row id.
- **Ingest**: the command `npm run ingest` and its pure functions in `src/ingest/`.
- **Mapping_Module**: the one module that turns Rows into contract records.
- **Evidence_Gate**, **Loading_Gate**: as defined in `research-data.md`.
- **Gold_Set**: cases whose official URL, clause anchor and excerpt were matched one to one;
  the answer key for tests and samples.
- **Recheck**: the team's own check of one evidence item against its official page, stored in
  `data/verification/`.
- **Load_Report**: `docs/load-report.md`, written by every run.

## Requirements

### Requirement 1: Read the research safely

**User Story:** As role A, I want the ingest to read the research without touching it, so that
the research bundle stays the unchanged source of truth.

#### Acceptance Criteria

1. WHEN the Ingest starts, THE Ingest SHALL read the Research_Dir from `--research` or
   `BILLXRAY_RESEARCH_DIR` and SHALL refuse to run if it is missing or inside this
   repository.
2. THE Ingest SHALL only read the Research_Dir, and SHALL record the SHA-256 of every input
   file in the Load_Report.
3. THE Ingest SHALL read the types case, document, evidence, legal_event, legal_relation,
   source, pattern, api_source, conflict and open_item.
4. IF a line is not valid JSON or lacks `type` or `id`, THEN THE Ingest SHALL reject it with
   file, line number and reason, and SHALL continue with the other lines.

### Requirement 2: Repeated rows and replacements

**User Story:** As role A, I want repeated and replacement rows handled by rule, so that the
same fact never loads twice and a later correction is never lost.

#### Acceptance Criteria

1. WHEN one id appears in more than one module folder, THE Ingest SHALL keep one copy if the
   Rows are identical, and SHALL exclude every copy and report a conflict if they differ.
2. WHERE a Row's `format_notes` or `notes` says `supersedes <id>`, THE Ingest SHALL load that
   Row in place of the named Row, resolve references to the old id to the new Row, and list
   each replacement in the Load_Report (10 such Rows today).
3. THE Ingest SHALL NOT infer a replacement from similar ids or similar content (for example
   `B4R-EVI-0004` and `B4-EVI-0004`); such Rows are judged separately.

### Requirement 3: Validate every row

**User Story:** As role A, I want every row checked before mapping, so that broken references
and malformed values never reach the contract.

#### Acceptance Criteria

1. THE Ingest SHALL check the required fields of each type, the id format, and that every
   reference (`*_ids`, `case_id`, `document_id`, `from_ref`, `to_ref`) resolves to a Row of
   the expected type; `from_ref` and `to_ref` may be `"promise"`.
2. THE Ingest SHALL accept dates only as YYYY-MM-DD, YYYY-MM, YYYY or unknown.
3. THE Ingest SHALL check excerpt lengths: at most 200 characters for news and 300 for
   official documents.
4. IF a Row fails a check, THEN THE Ingest SHALL exclude it with the reason (for example a
   reference of the wrong type, such as an evidence id inside `promise_source_ids`).

### Requirement 4: URL normalization

**User Story:** As role A, I want look-alike characters in URLs fixed and logged, so that links
open without any other field being altered.

#### Acceptance Criteria

1. THE Ingest SHALL replace U+2236 with ':' and U+00B7 with '.' in `url`, `official_url` and
   `base_url` only, and SHALL log each change (row id, field, before, after).
2. THE Ingest SHALL treat `null`, empty and `"unknown"` URLs as missing.
3. THE Ingest SHALL flag URLs that carry a session token (`;jsessionid=`) without changing
   them.
4. THE Ingest SHALL leave every non-URL field unchanged, byte for byte.

### Requirement 5: Evidence gate from the ledger

**User Story:** As a data editor, I want the gate to rely on the independent opening check, so
that a researcher's own "opened" flag is never enough.

#### Acceptance Criteria

1. THE Evidence_Gate SHALL pass an evidence Row only when its document has an official URL in
   the original language, `clause_anchor` and `excerpt_original` are present and within
   limits, and the Ledger records that the URL opened (`열림`) and the excerpt matched word for
   word (`일치`).
2. THE Evidence_Gate SHALL fail Rows whose Ledger result is partial (`부분`) or cannot be
   checked (`확인 불가`), and Rows with no Ledger row, and SHALL state the reason.
3. THE Evidence_Gate SHALL take "opened and checked" from the Ledger, not from the Row's own
   `verified_opened` flag. (Proposal: recorded in `docs/DECISIONS.md` once approved.)
4. THE Evidence_Gate SHALL NOT count `excerpt_en` or any translation as evidence.
5. THE Ingest SHALL judge each evidence Row and each path on its own; a case with one matched
   Row does not make its other paths confirmed.

### Requirement 6: First-load gate

**User Story:** As the team, we want only reviewed rows committed, so that the public
repository holds nothing that failed a check.

#### Acceptance Criteria

1. THE Loading_Gate SHALL load a Row into committed data only when its cited sources opened in
   the Ledger, its evidence passes the Evidence_Gate, the case `confidence` is `high` or
   `medium`, and cross-review classified the Row as "load as is".
2. WHILE no cross-review result exists for a Row, THE Loading_Gate SHALL exclude it with the
   reason "cross-review pending".
3. THE Ingest SHALL list every excluded Row with its reason; nothing is dropped silently.
4. WHEN the gate changes, THE team SHALL add a line with the reason to `docs/DECISIONS.md`.

### Requirement 7: One mapping module

**User Story:** As roles A and B, we want one place that turns research rows into contract
records, so that the screen never depends on the research format.

#### Acceptance Criteria

1. THE Mapping_Module SHALL turn case, document, evidence, legal_event and legal_relation Rows
   into Case, Document_Version, Evidence, Legislative_Event and Path records, and SHALL be
   the only code that does so.
2. THE Mapping_Module SHALL keep each date with its kind and precision and SHALL NOT merge or
   compute dates.
3. THE Mapping_Module SHALL map each `relation_type` through a fixed table to a Path kind and
   track; IF a `relation_type` has no entry, THEN THE Ingest SHALL exclude the Row with the
   reason "unmapped relation type" rather than guess.
4. THE Mapping_Module SHALL keep research conflicts as conflicts and SHALL attach open items
   to their case in the Load_Report.
5. THE Mapping_Module SHALL map English domain codes to the 12 Korean field names.
6. THE Mapping_Module SHALL record the source Row ids in each record's `provenance`.
7. THE Mapping_Module SHALL keep control cases and SHALL NOT give them gap statuses.

### Requirement 8: Output and records

**User Story:** As the team, we want every run to leave the same, readable record, so that
each load decision can be traced.

#### Acceptance Criteria

1. THE Ingest SHALL write only gated records, to `data/cases/<caseId>.json` in contract
   format.
2. THE Ingest SHALL write the Load_Report: counts per module and type, excluded Rows with
   reasons, gate results per case and per evidence Row, URL changes, replacements and
   repeated ids.
3. THE Ingest SHALL append one line per load decision to `docs/DECISIONS.md`.
4. WHEN run twice on the same inputs, THE Ingest SHALL produce byte-identical outputs.
5. THE Load_Report and `docs/DECISIONS.md` SHALL hold ids, counts and reasons only, with no
   news excerpts and no person names.
6. THE Ingest SHALL NOT invent values; missing values stay `null` and render as "Not
   verified" / "확인 불가".

### Requirement 9: Gold set and rechecks

**User Story:** As role A, I want to start from cases whose evidence was matched one to one,
and to recheck what the demo depends on, so that the samples rest on checked facts.

#### Acceptance Criteria

1. THE Gold_Set SHALL start with the 18 cases the research run log lists as matched one to
   one: B3a-CASE-0002, 0003, 0004, 0006 and 0009; B3b-CASE-0011, 0012, 0013, 0014, 0015 and
   0017; B4-CASE-0001 to 0007.
2. THE Gold_Set SHALL record, per case, which evidence Rows and paths are confirmed and which
   are not, and a test SHALL fail if a later change flips any of them without a line in
   `docs/DECISIONS.md`.
3. THE team SHALL recheck B3a-CASE-0001 (Semiconductor Special Act) against the official
   links in the handover (original bill 2205453, committee alternative 2215103, Act No.
   21337): the texts of the original §15 and §33 and of the Act's §18 and §33, the effective
   date, and the two discard dates in the research (2025-12-04 and 2026-01-29). Today 0 of
   its 5 evidence Rows match word for word.
4. THE team SHALL recheck the two H.R. 748 items the demo needs that are not yet matched: the
   short title in §1 of the 2020 enrolled text (no research Row exists) and P.L. 116-94
   Div. N, Title I, §503 on a page that shows the law text (research Row B4R-EVI-0005 points
   to a GovInfo details page without it).
5. THE team SHALL store each Recheck in `data/verification/` with the URL, anchor, official
   excerpt, result, date and the role that checked it; the other role SHALL confirm it, and
   Rechecks SHALL enter the data through the Mapping_Module. (Proposal: a Recheck confirmed
   by the other role counts as cross-reviewed for the Loading_Gate; recorded in
   `docs/DECISIONS.md` once approved.)
6. WHEN the Research_Dir is not available (for example for someone who clones the
   repository), THE tests that need it SHALL be skipped with a message, and the tests on
   committed data SHALL still run.

### Requirement 10: Property-based tests and hook

**User Story:** As the team, we want the ingest rules tested as properties and re-run on save,
so that a change to the mapping cannot quietly weaken the gate.

#### Acceptance Criteria

1. THE test suite SHALL check as properties: every reference resolves after loading; no
   confirmed path lacks a passing official evidence Row; normalization never changes a
   non-URL field; control cases never get gap statuses; loading the same Rows twice or in a
   different order gives the same result.
2. WHEN a file in `src/ingest/` or `src/contract/` is saved, THE `evidence-gate-check` hook
   SHALL run the ingest and gate tests as a command action, and SHALL refresh the Load_Report
   when the Research_Dir is set.
