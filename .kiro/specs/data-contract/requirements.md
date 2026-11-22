# Requirements Document: data-contract

## Introduction

The data contract is the one input structure that the scan screen, "Scan your own bill",
JSON import and the research ingest all read and write. The work order makes it the first
thing roles A and B agree on (§2), and its field names follow work order §4. The contract
also holds the comparison and status rules, so no screen decides on its own whether a line
is confirmed.

Role: A leads. B reviews the contract before building the screen on it.

Related: `product.md`, `project-context.md`, `research-data.md`; specs `scan-screen` and
`research-ingest`.

## Glossary

- **Contract**: the TypeScript types and runtime schema in `src/contract/` for one Case.
- **Case**: one scan subject: jurisdiction, session, an optional promise, and lists of
  Document_Versions, Evidence, Legislative_Events and Paths.
- **Document_Version**: one version of one document (introduced bill, committee
  alternative, enrolled bill, public law, statute, decree), identified by `documentId`
  plus `versionId`.
- **Evidence**: a short, anchored, original-language excerpt from one Document_Version,
  with its verification state.
- **Legislative_Event**: a dated event with exactly one `eventKind`.
- **Path**: a line `from` one point `to` another, with `kind`, `evidenceRefs` and
  `reviewState`.
- **Number_Path**: a Path between Document_Versions: the bill number, its versions and its
  successor documents.
- **Clause_Path**: a Path that follows one piece of content by clause anchors.
- **Evidence_Gate**: the rule that decides whether one Evidence row counts as checked
  against its official source (`research-data.md`).
- **Path_Status**: the single status the Contract derives for each Path.
- **Comparison**: the text difference between two texts, computed by the tool
  (`src/compare/`).
- **Reference_Date**: the "as of" date used to decide whether a date lies in the future.

## Requirements

### Requirement 1: One contract with the work order §4 field names

**User Story:** As roles A and B, we want one agreed input structure, so that the samples, a
user's own case and research data all render through the same renderer.

#### Acceptance Criteria

1. THE Contract SHALL define a Case with `jurisdiction` and `session`, and lists of
   Document_Versions, Evidence, Legislative_Events and Paths that use the work order §4
   field names: `documentId`, `versionId`, `localEventLabel`, `sourceUrl`, `evidenceId`,
   `anchor`, `excerpt`, `translation`, `eventKind`, `eventDate`, `from`, `to`, `kind`,
   `evidenceRefs` and `reviewState`.
2. THE Contract SHALL require a `title` and a `publisher` on every Document_Version, because
   the evidence panel shows them (work order §3) and a missing author or document source is
   a listed regression case (work order §4).
3. THE Contract SHALL allow an optional promise (statement, source and date) on a Case and
   SHALL NOT require one, because overseas cases need no promise text.
4. THE Contract SHALL exist once, as types plus a runtime schema in `src/contract/`, and the
   scan screen, the form, JSON import, the data validator and the ingest SHALL use only that
   module.
5. WHEN a Case is parsed, THE Contract SHALL return either a valid Case or a list of issues,
   each with a JSON path, an issue code, a severity (`block` or `warn`) and a plain-English
   message.
6. THE Contract SHALL let every record carry an optional `provenance` list (for example
   research row ids) and SHALL NOT treat provenance as evidence.

### Requirement 2: Keep the number path and the clause path apart

**User Story:** As a legislative reporter, I want the number path and the clause path kept
apart, so that the same number never hides a different body and a different number never
hides carried-over content.

#### Acceptance Criteria

1. THE Contract SHALL mark every Path as either a Number_Path or a Clause_Path.
2. THE Contract SHALL accept a Number_Path between two versions of the same `documentId`
   (same number, different body) and between different `documentId`s (for example a bill
   replaced by a committee alternative), each with its own evidence.
3. THE Contract SHALL NOT accept a shared bill number, title or `documentId` as evidence for
   a Clause_Path.
4. THE Contract SHALL NOT treat a text difference, or the lack of a text match, as evidence
   that no Clause_Path exists.

### Requirement 3: Path kinds and one status per path

**User Story:** As a viewer, I want each line to say what kind of link it is and how far it
is confirmed, so that I never read "not found" as "abolished" or "same outcome" as
"transferred".

#### Acceptance Criteria

1. THE Contract SHALL distinguish these Path kinds: carried over or modified in a later
   version; officially transferred to another law; same outcome through a separate law; not
   included in that version.
2. THE Contract SHALL derive exactly one Path_Status for every Path from its kind, its
   evidence and the Evidence_Gate results. The statuses are a confirmed status for each kind
   (including "Same outcome, separate law" and "Not found in this final version"), "Not
   verified", "Evidence missing" and "Omission not verified".
3. WHEN a Path has no evidence, THE Contract SHALL give it "Evidence missing" and mark it as
   not drawable, so that the screen lists it instead of drawing a line (work order §3).
4. IF any Evidence of a Path fails the Evidence_Gate, THEN THE Contract SHALL NOT give that
   Path a confirmed status.
5. WHEN a Path's kind is "not included in that version", THE Contract SHALL confirm it only
   if the checked version and the scope of the check (whole text or listed articles) are
   recorded and at least one Evidence row from that version passes the Evidence_Gate;
   otherwise THE Contract SHALL give it "Omission not verified".
6. WHEN a Path's kind is "same outcome through a separate law", THE Contract SHALL require
   passing Evidence from both the original version and the separate law before confirming
   it, and SHALL keep it distinct from an official transfer.
7. THE Contract SHALL list, for every status that is not confirmed, what is still needed to
   confirm it (work order §3).
8. IF a recorded `reviewState` claims more than the derived status allows, THEN THE Contract
   SHALL keep the derived status and report the difference.

### Requirement 4: Evidence gate

**User Story:** As a data editor, I want a line confirmed only when its official source backs
it word for word, so that nothing on screen rests on a summary, a translation or a guess.

#### Acceptance Criteria

1. THE Evidence_Gate SHALL pass an Evidence row only when all of these hold: its
   Document_Version has an official `sourceUrl` in the original language; `anchor` is not
   empty; `excerpt` is in the original language and within its length limit; and its
   verification state records that the excerpt was found word for word on the page at
   `sourceUrl`.
2. THE Contract SHALL record each Evidence row's verification state as one of: matched on
   the official page, matched in pasted text only, partial, could not open, not checked, or
   mismatch. Only "matched on the official page" passes the Evidence_Gate.
3. THE Evidence_Gate SHALL NOT accept a translation, a news source, a shared number or a
   similarity figure as evidence.
4. THE Contract SHALL treat `null`, empty and `"unknown"` URLs as missing.
5. IF an excerpt is longer than 300 characters for an official document or 200 characters
   for news, THEN THE Contract SHALL block it.
6. THE Contract SHALL record, with every "matched on the official page" state, the URL that
   was opened, the date of the check and who checked it (role A or B, not a personal name).

### Requirement 5: Dates and legislative events

**User Story:** As a reporter, I want each date to say what it is, so that passed,
promulgated, effective and applied dates are never confused.

#### Acceptance Criteria

1. THE Contract SHALL require exactly one `eventKind` on every Legislative_Event, from a
   fixed list that includes at least introduced, passed, promulgated, published, effective,
   applied, repealed, postponed, discarded, other and unknown.
2. THE Contract SHALL accept `eventDate` only as YYYY-MM-DD, YYYY-MM, YYYY or unknown, and
   SHALL keep its precision.
3. IF a date has no kind, THEN THE Contract SHALL block it.
4. THE Contract SHALL NOT compute a date of one kind from another date or from rule text
   (for example "six months after promulgation"); each date needs its own record.
5. THE Contract SHALL take the Reference_Date as an input, defaulting to the current date,
   so that tests can fix it.
6. WHEN an effective or applied date is later than the Reference_Date, THE Contract SHALL
   mark it as scheduled and SHALL NOT report the provision as in effect.
7. IF two events of the same kind on the same Document_Version have different dates, THEN
   THE Contract SHALL keep both and report a conflict instead of choosing one.

### Requirement 6: Block or warn, never promote

**User Story:** As role A, I want broken links, missing clauses and missing date kinds to stop
or warn, so that a mistake never turns into a confirmed line.

#### Acceptance Criteria

1. IF a `sourceUrl` is missing, malformed or not http(s), THEN THE Contract SHALL report it,
   and Evidence on that Document_Version SHALL NOT pass the Evidence_Gate.
2. IF a reference (`documentId`, `versionId`, `evidenceId`, `from`, `to` or an
   `evidenceRefs` entry) does not resolve, THEN THE Contract SHALL block the record that
   holds it.
3. IF a Document_Version has pasted text and an Evidence excerpt from it does not occur word
   for word in that text, THEN THE Contract SHALL block that Evidence row.
4. IF a Document_Version has pasted text and an Evidence anchor does not occur in that text,
   THEN THE Contract SHALL warn.
5. IF a Document_Version lacks a `title` or a `publisher`, THEN THE Contract SHALL block it.
6. THE Contract SHALL keep each issue attached to the record it concerns and SHALL NOT clear
   an issue by changing a status.

### Requirement 7: The tool computes text differences

**User Story:** As a data editor, I want the tool to show what was inserted, deleted or
changed between two versions, so that nobody draws differences by hand.

#### Acceptance Criteria

1. WHEN two texts are compared, THE Comparison SHALL return the inserted, deleted and
   unchanged parts, computed by the tool and identical on every run.
2. THE Comparison SHALL handle English text, Korean text and text that mixes both.
3. WHEN a text is compared with itself, THE Comparison SHALL report no insertions and no
   deletions.
4. THE Comparison SHALL return a result from which both original texts can be rebuilt
   exactly.
5. WHERE a similarity figure is shown, THE Contract SHALL NOT use it to confirm, reject or
   create a Path.

### Requirement 8: Regression tests from the acceptance criteria

**User Story:** As the team, we want the listed failure cases fixed as tests, so that Kiro's
contribution is shown by tests and change history, not by claims.

#### Acceptance Criteria

1. THE test suite SHALL include fixtures for each case listed in work order §4: same number
   but a different version; a different number that is a legitimate successor; a path
   without evidence; a missing author or document source; a future effective date; an
   official clause transfer next to a separate-law outcome.
2. THE test suite SHALL also include: a translation offered as evidence; look-alike URL
   characters; two similar texts with no relation evidence; a recorded "confirmed" whose
   evidence fails the gate.
3. THE test suite SHALL run offline with one local command (`npm test`).
4. THE test suite SHALL include property-based tests: every Path gets exactly one status; no
   Path with failing evidence is confirmed; adding evidence that fails the gate never raises
   a status; a shared number alone never yields a Clause_Path; comparing a text with itself
   yields no change; comparison results rebuild both texts.
5. Fixtures SHALL be synthetic or short official-source excerpts, never news article text.

### Requirement 9: Checks behind the hooks

**User Story:** As the team, we want the hooks to run scripts instead of agent prompts, so
that saving a file does not spend Kiro credits.

#### Acceptance Criteria

1. THE project SHALL provide `npm run validate:data`, which checks every file in
   `data/cases/` and `data/verification/` against the Contract and exits non-zero with the
   issue list when any check blocks.
2. THE project SHALL provide `npm run check:repo`, which fails when a tracked file matches
   the internal-material patterns of `publish-guard`, when a `.env*` file is tracked, or when
   `.gitignore` would hide `.kiro` or any of its folders.
3. WHEN these scripts exist, THE `research-data-check`, `evidence-gate-check` and
   `publish-guard` hooks SHALL switch from agent prompts to command actions that run them or
   the gate tests.
