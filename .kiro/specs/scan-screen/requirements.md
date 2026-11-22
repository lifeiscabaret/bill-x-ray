# Requirements Document: scan-screen

## Introduction

The English-first screen for the three P0 items in work order §3: the scan screen with the
US and Korean samples, "Scan your own bill", and the display of unverified states. The
screen reads only the data contract (spec `data-contract`) and never decides on its own
whether a line is confirmed.

Role: B leads. A checks sources, clauses and English labels (work order §2).

Related: `product.md`, `project-context.md`, `ui-copy.md`; specs `data-contract` and
`research-ingest`.

## Glossary

- **Scan_Screen**: the main view that shows one Case.
- **Scanner**: the control the user slides across a Case to split the Number_Path from the
  Clause_Path. It also works with buttons and the keyboard.
- **Case**, **Number_Path**, **Clause_Path**, **Path_Status**, **Evidence**,
  **Reference_Date**: as defined in the `data-contract` spec.
- **Evidence_Panel**: the panel that opens for a selected clause or path.
- **Own_Bill_Form**: the "Scan your own bill" form.
- **Sample**: a Case file in `data/cases/` shown by default: US H.R. 748 and the Korean
  Semiconductor Special Act.

## Requirements

### Requirement 1: US first scene: same number, different body

**User Story:** As a viewer who does not know the legislative process, I want to see at once
that one bill number carried two different bodies, so that I understand why the two lines
split before I read anything.

#### Acceptance Criteria

1. WHEN the app opens, THE Scan_Screen SHALL show the US H.R. 748 Sample in English under the
   heading "Same number. Different body." and the line "Follow the clause, not just the bill
   number."
2. WHEN the user moves the Scanner, THE Scan_Screen SHALL split the view into the
   Number_Path (one bill number, two versions) and the Clause_Path (the excise tax repeal
   content), so that the number line continues while the clause line leaves it.
3. THE Scan_Screen SHALL label the line to P.L. 116-94 "Same outcome, separate law" and draw
   it in a form different from an official transfer.
4. THE Scan_Screen SHALL take every number, clause, excerpt and date from the Case file and
   SHALL NOT hard-code case content in components.

### Requirement 2: Korean scene: different number, content kept or missing

**User Story:** As a viewer, I want the Korean case to show the opposite situation, so that I
see that a new number can carry old content and that some content does not reach the final
text.

#### Acceptance Criteria

1. THE Scan_Screen SHALL show the Korean Semiconductor Special Act Sample, where the
   Number_Path moves from the original bill to the committee alternative and then the Act,
   while one Clause_Path shows content carried in modified form and another shows "Not found
   in this final version".
2. THE Scan_Screen SHALL render the US and Korean Samples with the same components and the
   same contract, with no country-specific branches.
3. THE Scan_Screen SHALL NOT describe the clause missing from the Korean final text as
   abolished, failed or gone for good.
4. IF the evidence the Korean Sample relies on cannot be confirmed under decision D-006, THEN
   THE team SHALL remove that Sample from the demo instead of lowering the evidence gate; the
   product owner decides whether another case replaces it.

### Requirement 3: Evidence panel

**User Story:** As a reporter, I want to open the official source behind any line, so that I
can check it myself.

#### Acceptance Criteria

1. WHEN the user selects a clause or a path, THE Evidence_Panel SHALL show the source title,
   publisher, version, what the date means, the clause location in the earlier and the
   later document, a short original-language excerpt and the original link.
2. WHERE a translation exists, THE Evidence_Panel SHALL show it labelled "Translation" next
   to the original, never in its place.
3. WHEN a Path is not confirmed, THE Evidence_Panel SHALL show its status and what is still
   needed.
4. THE Evidence_Panel SHALL open by mouse, touch or keyboard and SHALL return focus to the
   selected item when it closes.

### Requirement 4: Unverified states

**User Story:** As a viewer, I want every unconfirmed line to say so in words, so that I never
mistake a gap in the record for a fact.

#### Acceptance Criteria

1. THE Scan_Screen SHALL show each Path with the one Path_Status derived by the Contract,
   using the labels in `ui-copy.md`.
2. THE Scan_Screen SHALL NOT draw a Path whose status is "Evidence missing"; it SHALL list
   such Paths with what they need.
3. THE Scan_Screen SHALL make every Path kind and status readable from its text label and line
   shape, without relying on colour.
4. THE Scan_Screen SHALL show a missing value as "Not verified".
5. WHEN a date lies after the Reference_Date, THE Scan_Screen SHALL show it as scheduled, not
   as in effect.
6. WHILE a Sample still has unconfirmed Paths, THE Scan_Screen SHALL show their real statuses
   and SHALL NOT style them as confirmed for the demo.

### Requirement 5: Scan your own bill

**User Story:** As a data editor, I want to enter a case the app has never seen and get the
same scan, so that the tool works beyond its samples without code changes.

#### Acceptance Criteria

1. THE Own_Bill_Form SHALL let the user enter jurisdiction, session and bill number,
   document versions, source URLs, clause locations and short texts to compare (or start
   from a Sample), relation evidence when it exists, and an optional promise text.
2. THE Own_Bill_Form SHALL offer only the date kinds of the Contract and SHALL let the user
   enter only the dates they know.
3. WHEN the user has entered two versions, THE Scan_Screen SHALL show the tool-computed
   difference between them in the same scan view.
4. THE Own_Bill_Form SHALL show the Contract's blocks and warnings next to the fields they
   concern and SHALL NOT let the user mark a Path as confirmed by hand.
5. WHEN a link to another document has no passing evidence, THE Scan_Screen SHALL show it as
   "Not verified".
6. WHERE the user imports JSON, THE Own_Bill_Form SHALL load it into the same fields, and
   every field SHALL also be enterable without JSON.
7. THE Own_Bill_Form SHALL keep the entered Case in the browser session only and SHALL NOT
   send it anywhere.
8. WHEN a teammate who did not prepare the case enters a real third case through the form,
   THE Scan_Screen SHALL show at least one sentence-level difference and let them open two
   source anchors, with no developer help and no code change (work order §3).

### Requirement 6: Narrow screens, keyboard and reduced motion

**User Story:** As any viewer, I want the same result on a phone, with only a keyboard, or with
motion turned down.

#### Acceptance Criteria

1. THE Scan_Screen SHALL show the same information at 360 px width and at desktop widths.
2. THE Scan_Screen SHALL make every action, including moving the Scanner, available from the
   keyboard and from visible buttons, not only by dragging.
3. WHILE the operating system or the in-app setting asks for reduced motion, THE Scan_Screen
   SHALL replace animated transitions with immediate state changes.
4. THE Scan_Screen SHALL keep a visible focus indicator and a logical focus order.

### Requirement 7: The 45-second demo path

**User Story:** As role B, I want the demo sequence to run without reloads or developer tools,
so that the recorded demo shows the real app.

#### Acceptance Criteria

1. THE app SHALL support this order in one session: the US Scanner split (0–12 s), the Korean
   Sample with one official source opened (12–24 s), and a third case entered and compared
   (24–45 s) (work order §5).
2. THE team SHALL treat "4 of 5 first-time English viewers name the difference within 15
   seconds" as an internal goal only and SHALL NOT claim it before it is measured.

### Requirement 8: Local, offline and English first

**User Story:** As the team, we want the app to run locally with no outside calls, so that it
stays within the work order's limits.

#### Acceptance Criteria

1. THE app SHALL make no network requests except the source links a user opens.
2. THE app SHALL take every user-facing string from `src/i18n/en.json`, so that a Korean
   dictionary (P1) and the wording check use the same keys.
3. THE dev server SHALL bind to 127.0.0.1.
4. THE project SHALL provide `npm run check:copy`, and once it exists THE `ui-wording-check`
   hook SHALL switch to a command action that runs it.
