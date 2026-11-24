# Implementation Plan: scan-screen

Approved by the product owner on 2026-11-24 (D-020). Nothing here is implemented yet.

## How to read this plan

- **One top-level task is one working session.** The sub-tasks are its steps. A task is
  finished when its "Done when" line is true, with its own tests in the same session.
- **Owner and reviewer** follow the work order (`product.md`, "Team"): B is screen and demo,
  A is data and verification. The other role reviews; A checks sources, clauses and English
  labels.
- **Depends on** names tasks that must be finished first. Tasks of this spec are numbered
  `scan-screen N`; tasks of the contract spec are `data-contract N`.
- **Writes** lists the folders and files a task creates or changes, so that two tasks that
  share none of them can run at the same time in one working tree.
- **(person)** marks a step only a person can do: opening official URLs, entering a real
  case through the UI, deploying, rehearsing. Agents prepare and record; they never stand
  in for these, and they never sign up for a service or deploy (D-018).
- `*` after a checkbox marks an optional task (Kiro convention).
- Shared files: `src/i18n/en.json` and `src/ui/styles.css`. Each task adds only its own
  key groups (named in the task) and its own commented block. Edit them with targeted
  replacements and re-read before editing. Never rewrite them whole. `package.json` is
  shared too: scripts only, one line per task.
- Component and layout tests run in jsdom. Until the contract can build a `ScanModel`
  (`data-contract 6`), tests use models built by `tests/helpers/scanModel.ts` (task 2),
  which type-check against `src/contract/types.ts`.
- Until rechecked rows exist (D-020), development and tests use synthetic fixtures in
  `tests/fixtures/` with no news text. The app builds and runs with `data/cases/` empty.
- Every task ends with `npm test` and `npm run build` passing. Component work is checked in
  a real browser as well as in jsdom, and the result is read, not assumed.
- Public files name roles (A, B), never people, and carry no news text and no paths of any
  personal computer.
- Decisions that shape this plan: D-009, D-011, D-013 to D-016, D-018 (deployment), D-019
  (wording), D-020 (work order).

## Tasks

- [x] 1. Interface strings and the wording check
  - Owner B · Reviewer A · Depends on: data-contract 1 · Writes: `src/i18n/`,
    `scripts/check-copy.ts`, `tests/copy/`, `package.json` (scripts),
    `.kiro/hooks/ui-wording-check.json`
  - [x] 1.1 `src/i18n/en.json` with empty groups `app`, `mode`, `scanner`, `kind`, `status`,
    `need`, `issue`, `dateKind`, `timing`, `panel`, `form`, plus `app.heading`
    ("Same number. Different body.") and `app.tagline` ("Follow the clause, not just the
    bill number.").
  - [x] 1.2 `src/i18n/t.ts`: `t(key, params)` replaces `{name}` placeholders. A missing key
    throws when running under Vitest and returns the key otherwise.
  - [x] 1.3 `scripts/check-copy.ts` (`npm run check:copy`, exit 0 or 1 with file and line):
    (a) the evaluative words of `ui-copy.md` in English (broken promise, lie, failure,
    trick, monster) and Korean (약속 파기, 거짓말, 실패, 꼼수), matched as whole words with
    their plural forms, over `src/i18n/*.json` and `src/ui/**/*.tsx`; (b) with the TypeScript
    compiler API, JSX text and `aria-label`, `title`, `placeholder` and `alt` string
    literals in `src/ui/` that do not come from `t()`. The checking logic is a function over
    file contents; the script only reads files.
  - [x] 1.4 Tests in `tests/copy/check-copy.test.ts`: each evaluative word fails once in
    JSON and once in TSX; a JSX text literal fails; a literal `aria-label` fails; a `t()`
    call passes; "believe" and "client" do not match "lie"; a test runs the checker on the
    real `src/` and expects 0 findings.
  - [x] 1.5 Add `check:copy` to `package.json`. Switch `ui-wording-check` to a command
    action running `npm run --silent check:copy`, keeping its matcher.
  - Done when: `npm run check:copy` exits 0 on the current `src/`, the negative tests pass,
    and the hook shows `"type": "command"`.
  - _Requirements: 8.2, 8.4_

- [x] 2. Layout engine
  - Owner B · Reviewer A · Depends on: data-contract 2 · Writes: `src/ui/layout.ts`,
    `tests/ui/layout.test.ts`, `tests/helpers/scanModel.ts`
  - [x] 2.1 `tests/helpers/scanModel.ts`: small builders and a fast-check arbitrary for
    `ScanModel` (bounded: up to 8 versions, 12 evidence rows, 10 paths). It does not call
    `parseCase`, so this task does not wait for the contract's logic. It also builds two
    hand-made models shaped like the samples (a same-number, different-body case and a
    different-number case), using invented ids and a `Synthetic fixture` title.
  - [x] 2.2 `src/ui/layout.ts`: `layoutScan(model, { orientation, scanned })`, pure, no DOM.
    Columns follow the case file order (D-011); a separate law that is not on the number line
    still gets a column; lane 0 is the number track; each chain of connected clause endpoints
    gets the next lane. `reveal(c) = clamp(s - c, 0, 1)` moves a clause node from lane 0
    into its own lane. `horizontal` from 720 px up, `vertical` below (D-014). A path with
    `drawable: false` gets no connector and no label. A promise endpoint gets a node at the
    start of its lane. Export the output types (`nodes`, `connectors`, `labels`) so tasks 3
    and 5 build on them.
  - [x] 2.3 Tests: example expectations for the two hand-made models; property 1 (one
    connector and one label per drawable path, none for the others); property 2 (both
    orientations give the same node ids, connector ids and label texts); property 3 (moving
    the scanner forward never moves a clause node back toward lane 0; at 0 every clause node
    is on lane 0; at the end each is in its own lane). 200 runs each.
  - Done when: `tests/ui/layout.test.ts` passes with the three properties, and `npm test`
    and `npm run build` pass.
  - _Requirements: 1.2, 6.1; design properties: 1, 2, 3_

- [ ] 3. Connectors, nodes and labels
  - Owner B · Reviewer A · Depends on: 2 · Writes: `src/ui/ConnectorLayer.tsx`,
    `src/ui/NodeLayer.tsx`, `src/ui/styles.css` (base and line styles), `src/i18n/en.json`
    (`kind`, `status`, `dateKind`, `timing`), `tests/ui/`
  - [x] 3.1 `ConnectorLayer` draws SVG lines only and is `aria-hidden`. Each kind has its own
    pattern from the design table (thick solid, thick solid with arrowhead, thin solid,
    double, long dash, dotted with an open end), and each status its own end marker (filled,
    hollow with "?", not drawn).
  - [x] 3.2 `NodeLayer`: focusable HTML buttons for version nodes (document id, local stage
    label, each date with its kind; a future effective or applied date reads "Scheduled";
    an unknown value reads "Not verified"), clause nodes (anchor, the first 60 characters of
    the excerpt, or of the fact sentence for news from another outlet, with `lang` set to the
    language of that text) and path labels (kind label and status text). The accessible name
    spells out the whole line. Activation calls `onSelect`; opening the panel is task 5.
  - [x] 3.3 Strings: `kind.*`, `status.*`, `dateKind.*`, `timing.*` in `en.json`, using the
    labels of `ui-copy.md`. "Not found in this final version" never becomes "abolished" or
    "gone for good". 3 px `:focus-visible` outline in `styles.css`; colours only as an
    extra.
  - [ ] 3.4 If a promise record is rendered here, add a check to the task report: when a
    case carries promise data from the existing promise-tracking service, the README's
    pre-existing-work line must say so (D-019). Report it to the product owner; do not edit
    the README. No such data is planned now.
  - [x] 3.5 Tests: property 4 (each label's status text equals `ScanModel.paths[...].status`);
    property 5 (for every kind and status the label text is non-empty and the connector has
    the kind's pattern class); a future effective date reads "Scheduled" with a fixed
    reference date; a missing value reads "Not verified"; an unconfirmed path never carries
    the confirmed marker.
  - Done when: `tests/ui/nodes.test.tsx` and the properties pass, `npm run check:copy` exits
    0, and a render of the two hand-made models in a browser (`npm run dev`) shows the
    kinds apart in a screenshot converted to grayscale.
  - _Requirements: 1.3, 1.4, 4.1, 4.3, 4.4, 4.5, 4.6, 6.4; design properties: 4, 5_

- [x] 4. Evidence panel and difference text
  - Owner B · Reviewer A · Depends on: data-contract 2, data-contract 7 · Writes:
    `src/ui/EvidencePanel.tsx`, `src/ui/DiffText.tsx`, `src/ui/styles.css` (panel block),
    `src/i18n/en.json` (`panel`), `tests/ui/`
  - [x] 4.1 `EvidencePanel` for a version (title, publisher, version label, every date with
    kind and timing, the original link in a new tab with `rel="noopener noreferrer"`, source
    language), a clause (the version details plus anchor, original-language excerpt, the
    translation labelled "Translation" next to it, and who checked it as role and date) and
    a path (kind, status, the "Needs" list, the clause location in the earlier and the later
    document, and for `carried`, `transferred` and `same_outcome_separate_law` the computed
    difference of the two excerpts). For news from another outlet it shows outlet, date,
    title, link and the fact sentence, never an excerpt (D-016).
  - [x] 4.2 Focus: on open it moves to the panel heading; Close and Escape return focus to
    the element that opened it. Side panel on wide screens, below the scan on narrow ones
    (the narrow layout is finished in task 9).
  - [x] 4.3 `DiffText` renders `<ins>` and `<del>` with visually hidden "inserted" and
    "deleted" words; whitespace-only changes render as plain text; `too_long` and
    `too_costly` show a message that the texts are too long to compare.
  - [x] 4.4 Tests (opened by a stand-in button here; the real nodes are wired in task 5):
    title, publisher, anchor and link appear; Escape returns focus; a translation is
    labelled and never replaces the original; a news version shows a fact sentence and no
    excerpt; a not-confirmed path shows its status and what is still needed; difference text
    reads without colour.
  - Done when: `tests/ui/panel.test.tsx` and `tests/ui/difftext.test.tsx` pass, and
    `npm test`, `npm run check:copy` and `npm run build` pass.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.3_

- [x] 5. Scanner, scan view and the not-drawn list
  - Owner B · Reviewer A · Depends on: 3, 4 · Writes: `src/ui/Scanner.tsx`,
    `src/ui/ScanView.tsx`, `src/ui/NotDrawnList.tsx`, `src/ui/styles.css` (scanner block),
    `src/i18n/en.json` (`scanner`, `need`), `tests/ui/`
  - [x] 5.1 `Scanner`: a native `<input type="range">` from 0 to the number of columns, step
    1, labelled "Scan the bill", with `aria-valuetext` naming the versions scanned; buttons
    "Scan next version", "Back", "Show all" and "Reset". Dragging moves the value
    continuously; the buttons animate 400 ms unless `data-motion="reduce"`, which makes the
    change immediate.
  - [x] 5.2 `ScanView` assembles the scanner, the layers from tasks 3, the panel from task
    4 and a slot for a comparison strip. Selecting a node or a path label opens the panel.
  - [x] 5.3 `NotDrawnList`: every path the contract marks not drawable, with its status and
    needs, for example "Evidence missing: add the clause from the final version".
  - [x] 5.4 Tests: arrow keys, Home and End on the scanner reach the split state, and the
    buttons give the same result; Enter on a node opens the panel with title, publisher,
    anchor and link, and Escape returns focus to the node; the not-drawn list shows an
    evidence-missing path and no line is drawn for it; DOM order equals the design's tab
    order; reduced motion makes the buttons change state at once.
  - Done when: `tests/ui/scanview.test.tsx` passes, `npm test`, `npm run check:copy` and
    `npm run build` pass, and the scan of a hand-made model works with keyboard only in a
    browser.
  - _Requirements: 1.2, 3.4, 4.2, 6.2, 6.3, 6.4_

- [x] 6. App shell, sample loading and the first scene
  - Owner B · Reviewer A · Depends on: data-contract 6; scan-screen 1 and 5 · Writes: `src/main.tsx`,
    `src/ui/App.tsx`, `src/ui/samples.ts`, `src/ui/ErrorBoundary.tsx`, `vite.config.ts`
    (`fixtures` mode), `package.json` (scripts), `src/i18n/en.json` (`app`, `mode`, `need`),
    `tests/ui/`, `tests/fixtures/samples/`
  - [x] 6.1 `main.tsx` sets `data-motion` from `prefers-reduced-motion`; `App` has the mode
    switcher, today's local date as the reference date, and a "Reduce motion" toggle
    (`aria-pressed`).
  - [x] 6.2 `samples.ts`: `loadSamples(modules)` parses the files of `data/cases/*.json` with
    `origin: "bundled"`; the default argument is `import.meta.glob` (recommended:
    with Vite's `?raw` query, so `check:dist` can read the case text back from `dist/`, see
    data-contract 11.3). A sample mode button exists only for a sample that loaded, keyed by
    the case ids `us-116-hr748` and `kr-semiconductor-special-act`. With no sample the app
    opens on "Scan your own bill" and the heading and tagline stay (D-020, D-015). A sample
    with block issues shows its issue list under the title "This sample did not pass its checks".
  - [x] 6.3 `ErrorBoundary` around `ScanView`: "Something went wrong reading this case";
    the mode switcher keeps working.
  - [x] 6.4 Synthetic fixtures in `tests/fixtures/samples/`: two cases with the case ids
    above, invented documents and a `Synthetic fixture` title, written to pass the contract.
    `npm run dev:fixtures` (Vite `--mode fixtures`, same host and port) aliases the sample
    folder to them. The normal build never uses them.
  - [x] 6.5 Tests: with fixtures the app opens on the US sample with the heading and
    tagline; with an empty module map it opens on "Scan your own bill" and shows no sample
    button; with only the US sample the Korea button is absent; both samples render through
    the same components (a test fails if a file in `src/ui/` branches on `jurisdiction` or
    contains case content such as a bill number); `fetch`, `XMLHttpRequest` and `WebSocket`
    spies stay at zero calls through every mode; every `need.*` code of `NEED_CODES` has a
    string; the issue-list and error-boundary screens render.
  - [x] 6.6 The block-issue title is "This sample did not pass its checks" (decided by the
    product owner on 2026-11-24); keep it in `en.json` as the only wording.
  - Done when: `npm run build` passes with `data/cases/` empty, `npm run dev` opens on
    "Scan your own bill" there, `npm run dev:fixtures` opens the US fixture scene in a
    browser, and `npm test` and `npm run check:copy` pass.
  - _Requirements: 1.1, 1.4, 2.2, 2.4, 6.3, 8.1, 8.2, 8.3; D-015, D-020_

- [x] 7. Scan your own bill: fields and issues
  - Owner B · Reviewer A · Depends on: 6 · Writes: `src/ui/form/OwnBillForm.tsx`,
    `src/ui/form/toCaseInput.ts`, `src/ui/styles.css` (form block), `src/i18n/en.json`
    (`form`, `issue`), `tests/ui/`
  - [x] 7.1 Sections 1 to 3 of the design: Bill (jurisdiction, session, bill number),
    Versions (add, remove, move up and down with buttons; version label, title, publisher,
    source URL, original language, dates with a kind chosen from the contract's list and
    optional date, optional pasted text; a version marked as news from another outlet takes a
    fact sentence instead of an excerpt), Clauses (anchor and excerpt per version; the tool
    says when an excerpt is not in the pasted text).
  - [x] 7.2 `toCaseInput.ts`: form state to contract input with `origin: "user"`, and the
    JSON path to field id map.
  - [x] 7.3 Every contract issue shows next to the field its path points to, using
    `issue.<code>`. A block issue keeps its record out of the scan; a warning does not. A
    test fails if a code in `ISSUE_CODES` has no string.
  - [x] 7.4 Only the contract's date kinds are offered; the user may enter just the dates they
    know. The form has no control that marks a link as confirmed.
  - Done when: `tests/ui/form.test.tsx` passes (a broken URL shows its block message next to
    its field; only contract date kinds appear; all add, remove and move buttons work by
    keyboard), and `npm test`, `npm run check:copy` and `npm run build` pass.
  - _Requirements: 5.1, 5.2, 5.4, 6.2_

- [x] 8. Scan your own bill: links, promise, comparison, import and session
  - Owner B · Reviewer A · Depends on: 7, data-contract 7 · Writes:
    `src/ui/form/OwnBillForm.tsx`, `src/ui/form/` (new files), `src/ui/App.tsx`,
    `src/ui/styles.css` (form block), `src/i18n/en.json` (`form`), `tests/ui/`
  - [x] 8.1 Sections 4 to 6: Compare (pick two clauses or two versions; the difference
    appears at once in the scan view), Links (optional: from, to, kind and the evidence rows
    that back it), Promise (optional statement, source and date). The banner on user cases:
    "Entered by you. Bill X-Ray compared the texts. Links stay Not verified until the team
    checks them on the official pages."
  - [x] 8.2 "Start from a sample" copies a sample's items; rows copied unchanged keep their
    checks and an edited row loses its check (D-009). "Import JSON" reads a local file with
    `FileReader`, runs `parseCase` and fills the same fields; invalid JSON shows
    `issue.import_not_json` and changes nothing. Every field can also be typed in.
  - [x] 8.3 The form state is kept in `sessionStorage` under `billxray.own` and sent
    nowhere.
  - [x] 8.4 Tests: with two versions of different text a sentence-level difference appears
    in the scan view and two clause anchors open the panel (the automatic part of 5.8); a
    link without passing evidence reads "Not verified"; JSON import fills the fields; a whole
    case can be entered by typing alone; the network spies stay at zero; property 6 (for any
    form state with no row copied from a sample, no label reads as confirmed), 200 runs.
  - Done when: `tests/ui/form-flow.test.tsx` and property 6 pass, and `npm test`,
    `npm run check:copy` and `npm run build` pass.
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8; design properties: 6_

- [ ] 9. Narrow screens, keyboard and reduced motion
  - Owner B · Reviewer A · Depends on: 5, 8 · Writes: `src/ui/styles.css`,
    `src/ui/` (orientation hook), `tests/ui/`, `docs/mockup/screens/`,
    `docs/mockup/accessibility-check.md`
  - [x] 9.1 Orientation follows `matchMedia("(min-width: 720px)")`: below it the scan is
    vertical with the same nodes, lines and labels (D-014); the panel sits below the scan;
    no horizontal page scroll at 360 px; touch targets of at least 44 px.
  - [x] 9.2 Under `data-motion="reduce"` the CSS has no transitions or animations.
  - [x] 9.3 Tests: both orientations give the same text content; the Tab order matches the
    design; the reduce-motion toggle sets the attribute.
  - [ ] 9.4 (person) Open the app at 360 px and at a desktop width, use only the keyboard,
    and turn on the operating system's reduced motion. Put the results in
    `docs/mockup/accessibility-check.md` (role, date, pass or fail per row) and screenshots
    in `docs/mockup/screens/`. Screenshots read back as images stay under 1600 px on each
    side.
  - Done when: the three automated tests pass, and `docs/mockup/accessibility-check.md` has a
    pass or a listed defect for each of the three modes.
  - _Requirements: 6.1, 6.2, 6.3, 6.4; D-014_

- [ ] 10. Connect the real samples
  - Owner B · Reviewer A · Depends on: 6, data-contract 13, data-contract 14 (or the product
    owner's decision on the Korean sample) · Writes: `tests/ui/`, `src/ui/` (fixes only),
    `docs/mockup/`
  - [ ] 10.1 With the real files in `data/cases/`, run `npm run validate:data`, then render
    both modes. A data-driven test (skipped when a file is absent) checks that every sample
    parses with no block issue, that each path label shows the derived status, and that no
    unconfirmed path is styled as confirmed (D-020, requirement 4.6).
  - [ ] 10.2 US: the number line stays straight while the clause line to P.L. 116-94 leaves
    it, labelled "Same outcome, separate law" and drawn unlike a transfer. Korea: the number
    line runs from the original bill through the alternative to the Act, one clause path
    reads as carried, one reads "Not found in this final version". A test fails if
    `en.json` contains "abolished" or "gone for good" in a record-state label.
  - [ ] 10.3 If data-contract 14 removed the Korean sample, check that the Korea button is
    hidden (D-015) and note in `docs/mockup/` which replacement the product owner chose.
  - [ ] 10.4 Fix only what the real data shows is wrong in the screen. A problem in the data
    goes back to role A.
  - Done when: the data-driven test passes against the real files and a browser check of both
    modes is recorded as a short note in `docs/mockup/`.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 2.4, 4.6; D-015, D-020_

- [ ] 11. Third-case trial and error review
  - Owner B · Reviewer A · Depends on: 8, 10 · Writes: `docs/mockup/third-case-trial.md`,
    `src/ui/` (input fixes only)
  - [ ] 11.1 (person, role B) Pick a real case with two versions of official text that role
    A has not seen and that is not one of the 19 demo cases. Enter it through "Scan your own
    bill" with no developer help and no code change. Record the time, every stumble and every
    message that was unclear. Confirm at least one sentence-level difference and open two
    source anchors. "Not verified" may remain on the link.
  - [ ] 11.2 (person, role B) Enter a link with no evidence, an effective date in the future
    and a date with no kind. None may show as a confirmed link or as "in effect".
  - [ ] 11.3 (person, role A) Open the sources and anchors that role B used and check the
    English labels. Record what is wrong.
  - [ ] 11.4 (agent, B) For each recorded stumble, improve the input or the message. Do not
    widen the case scope. Record each fix in the trial note.
  - Done when: `docs/mockup/third-case-trial.md` lists the trial (roles, dates, result) and
    every recorded stumble is fixed or marked as left, with the reason. It carries only
    official-source excerpts within the limits and no news text.
  - _Requirements: 4.5, 5.4, 5.5, 5.8_

- [x] 12. Deploy runbook and release check (D-018)
  - Owner B · Reviewer A · Depends on: 10, data-contract 11 · Writes: `docs/DEPLOY.md`
  - [x] 12.1 Write `docs/DEPLOY.md` for a person: (1) the commands that must exit 0 first:
    `npm test`, `npm run validate:data`, `npm run check:copy`, `npm run check:repo`,
    `npm run build` and `npm run check:dist` (with the extra-patterns file kept outside the
    repository); (2) **(person)** the internal sign-off, recorded as a new decision line in
    `docs/DECISIONS.md`; (3) **(person)** upload only `dist/` directly to the company
    Cloudflare account, default address, no custom domain; (4) **(person, a different
    person)** right after the upload, fetch the live HTML and search it for
    `beacon.min.js` and `cloudflareinsights`; if either appears, turn Web Analytics off in
    the dashboard and fetch again to confirm both are gone; (5) **(person)** open the live
    site in a private window, check that the Network tab shows no request to another host,
    that 360 px and desktop widths work, and that there is no login; (6) keep the site up
    until 2027-02-04 KST, name the person who opens it weekly, and the person who can take it
    down; (7) rollback is uploading the previous `dist/` again, so keep the last good build
    outside the repository. Agents never sign up, log in or upload.
  - [x] 12.2 Run the commands of step (1) on the current tree and paste the exit codes into
    the task report, not into `DEPLOY.md`.
  - [x] 12.3 Read the README. If a sample carries promise data from the existing
    promise-tracking service and the README's pre-existing-work line does not say so, stop
    and report it to the product owner (D-019); do not edit the README.
  - [x] 12.4 Check that `dist/` holds no fixture sentinel, no source map and no other-outlet
    excerpt (`check:dist` covers this), and that `dist/` stays out of git.
  - Done when: `docs/DEPLOY.md` exists with every person step marked and no personal name,
    account name, secret or computer path, and the pre-deploy commands exit 0 on the current
    tree.
  - _Requirements: 8.1, 8.3; D-016, D-018, D-019_

- [ ] 13. The 45-second demo rehearsal
  - Owner B · Reviewer A · Depends on: 9, 10, 11 · Writes: `docs/mockup/demo-rehearsal.md`
  - [ ] 13.1 (person, role B, with role A watching) Run the path three times with a timer and
    no reload and no developer tools: the US scanner split (0 to 12 s), the Korean sample
    with one official source opened (12 to 24 s), a third case entered and compared (24 to
    45 s). If the Korean sample left the demo, use the replacement the product owner chose.
    Record each run's times and every stumble.
  - [ ] 13.2 (person, both roles) Go through the work order §5 pass list: official sources,
    numbers, anchors and dates match; no confirmed link or "in effect" from missing evidence
    or wrong dates; 360 px, desktop, keyboard only and reduced motion give the same result.
    Record pass or fail for each item with the role that checked it.
  - [ ]* 13.3 (person) The internal 15-second test with five English speakers who have no
    legislative background; four naming the difference is the internal goal. The result is
    not advertised until it is measured (requirement 7.2).
  - Done when: `docs/mockup/demo-rehearsal.md` records three timed runs and the pass list.
  - _Requirements: 7.1, 7.2, 6.1_

## Coverage

Requirements to tasks:

| Requirement | Tasks |
|---|---|
| 1.1 | 6, 10 |
| 1.2 | 2, 5, 10 |
| 1.3 | 3, 10 |
| 1.4 | 3, 6 |
| 2.1, 2.3 | 10 |
| 2.2 | 6 |
| 2.4 | 6, 10 |
| 3.1, 3.2, 3.3 | 4 |
| 3.4 | 4, 5 |
| 4.1, 4.3, 4.4, 4.5 | 3 (4.5 also 11) |
| 4.2 | 5 |
| 4.6 | 3, 10 |
| 5.1 | 7, 8 |
| 5.2 | 7 |
| 5.3 | 4, 8 |
| 5.4 | 7, 8, 11 |
| 5.5, 5.6, 5.7 | 8 (5.5 also 11) |
| 5.8 | 8, 11 |
| 6.1 | 2, 9, 13 |
| 6.2 | 5, 7, 9 |
| 6.3 | 5, 6, 9 |
| 6.4 | 3, 5, 9 |
| 7.1, 7.2 | 13 |
| 8.1 | 6, 8, 12 (and data-contract 1) |
| 8.2 | 1, 6 |
| 8.3 | 6, 12 (and data-contract 1) |
| 8.4 | 1 |

Design properties to tasks: 1, 2 and 3 in task 2; 4 and 5 in task 3; 6 in task 8. The design's
component tests: heading and tagline, empty-data start, Korea button, no-network test in
task 6; arrow keys, panel focus, not-drawn list in task 5; translation label in task 4;
"Scheduled" in task 3; form block message in task 7; JSON import in task 8. Manual checks
with screenshots in tasks 9 and 13. The hook switch is in task 1. Error boundary and the
block-issue screen are in task 6.

Decisions to tasks: D-009 in task 8; D-011 and D-014 in tasks 2 and 9; D-013 in tasks 2 and 5;
D-015 in tasks 6 and 10; D-016 in tasks 3, 4 and data-contract 11; D-018 in task 12 (and
data-contract 11); D-019 in tasks 3 and 12 (and data-contract 14); D-020 in tasks 6 and 10.

Not covered by any task here: the Korean dictionary and term help (P1), JSON export of samples
and results (P1), scan and splice motion beyond the 400 ms step (P1), a case picker for the other
17 demo cases (P1), and the research-ingest screens (postponed, D-020).
