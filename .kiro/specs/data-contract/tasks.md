# Implementation Plan: data-contract

Approved by the product owner on 2026-11-24 (D-020). Status on 2026-11-24: a ticked box is done; `docs/HANDOFF.md` lists what is left.

## How to read this plan

- **One top-level task is one working session.** The sub-tasks are its steps. A task is
  finished when its "Done when" line is true, with its own tests in the same session.
- **Owner and reviewer** follow the work order (`product.md`, "Team"): A is data and
  verification, B is screen and demo. The other role reviews.
- **Depends on** names tasks that must be finished first. Tasks of this spec are numbered
  `data-contract N`; tasks of the screen spec are `scan-screen N`.
- **Writes** lists the folders and files a task creates or changes, so that two tasks that
  share none of them can run at the same time in one working tree.
- **(person)** marks a step only a person can do: opening official URLs, deploying, entering
  a real case through the UI. Agents prepare and record; they never stand in for these.
- `*` after a checkbox marks an optional task (Kiro convention).
- Shared files that several tasks touch: `package.json` (scripts only: add one line, change
  nothing else), `src/i18n/en.json` and `src/ui/styles.css` (scan-screen tasks only). Edit
  them with targeted replacements and re-read before editing. Never rewrite them whole.
- Property-based tests (fast-check, 200 runs at least) go into
  `tests/contract/properties.test.ts`, one `describe` block per property, added by the task
  that builds the code the property covers. Property 10 sits in
  `tests/compare/properties.test.ts`.
- Every task ends with `npm test` and `npm run build` passing, and leaves
  `data/cases/` and `data/verification/` untouched unless the task says otherwise.
- Public files name roles (A, B), never people, and carry no news text and no paths of any
  personal computer.
- Decisions that shape this plan: D-001 to D-006 (evidence gate, rechecks), D-008 (one role
  on the screen gate), D-016 (news excerpts), D-018 (deployment), D-019 (wording), D-020
  (work order: no ingest tasks; rechecked rows are entered directly).

## Tasks

- [x] 1. Project scaffold
  - Owner A · Reviewer B · Depends on: none · Writes: repository root (`package.json`,
    `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`), `src/main.tsx`
    (placeholder), `data/cases/.gitkeep`, `data/verification/.gitkeep`, `tests/`
  - [x] 1.1 Create `package.json`: Node 22 in `engines`, `"type": "module"`, scripts `dev`
    (Vite on `127.0.0.1:4748`, `--strictPort`), `build` (`tsc --noEmit && vite build`),
    `test` (`vitest run`). Add only the dependencies named in `tech.md`: react, react-dom,
    zod, diff (runtime); vite, @vitejs/plugin-react, typescript, vitest, fast-check, jsdom,
    @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, tsx and
    the matching `@types/*` (dev). Commit the lockfile. No other dependency.
  - [x] 1.2 `tsconfig.json` with `strict`. `vite.config.ts` binds `server` and `preview` to
    `127.0.0.1`, port 4748, `strictPort`, leaves `build.sourcemap` off, and sets the Vitest
    environment (jsdom for `tests/ui/**`, node elsewhere).
  - [x] 1.3 Minimal `index.html` and `src/main.tsx` that build. No fonts, scripts or images
    from other hosts. `data/cases/` and `data/verification/` exist with a `.gitkeep` each.
  - [x] 1.4 Tests in `tests/scaffold.test.ts`: the Vite config binds `127.0.0.1:4748`;
    `index.html` contains no `http(s)://` host; every `.ts` file under `src/contract/`,
    `src/compare/` and `src/ingest/` imports no `node:*` module, `fs`, `path` and uses no
    `document` or `window` (the purity rule in `tech.md`).
  - Done when: `npm install` finishes, `npm test` and `npm run build` pass with
    `data/cases/` empty, and `npm run dev` answers on `http://127.0.0.1:4748` (probed, not
    assumed).
  - _Requirements: scan-screen 8.1, 8.3; data-contract 8.3; `tech.md` rules_

- [x] 2. Contract types, result types and structural schema
  - Owner A · Reviewer B · Depends on: 1 · Writes: `src/contract/` (`types.ts`, `schema.ts`,
    `parse.ts`, `index.ts`), `tests/contract/`
  - [x] 2.1 `types.ts`: every type in the design's "Data model" and "Results" sections,
    including `Issue`, `IssueCode`, `ScanModel`, `PathView`, `GateResult`, `DateView`, `Need`
    and `Recheck`. Export `ISSUE_CODES` (a const list) so that other code can check it is
    complete. These types are the interface the screen is built on: once this task lands,
    scan-screen tasks 2 to 5 can start.
  - [x] 2.2 `schema.ts`: zod schemas for `Case` and `Recheck`. `Role` is `"A" | "B"` only.
    A structural error becomes a `schema_*` issue with a JSON path, severity and an English
    fallback message.
  - [x] 2.3 `parse.ts`: `parseCase(input, { referenceDate, origin, bundledChecks })` runs
    stage 1 (structure) and returns `{ model, issues }`. It never throws for any JSON
    value. Later tasks add the other stages to this function.
  - [x] 2.4 `index.ts` is the only import path for code outside `src/contract/`.
  - [x] 2.5 Tests: a minimal valid case parses; each required field removed gives one issue
    at the right path; the optional `promise` and `provenance` may be absent; a `fast-check`
    run over `fc.jsonValue()` never throws; property 11 (every issue path resolves to a
    location in the input; a missing field resolves through its parent).
  - Done when: `npm test` passes `tests/contract/schema.test.ts` and the property 11
    block in `tests/contract/properties.test.ts` (200 runs), and `npm run build` passes.
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6; design properties: 11_

- [x] 3. URL normalization and semantic checks
  - Owner A · Reviewer B · Depends on: 2 · Writes: `src/contract/urls.ts`,
    `src/contract/checks.ts`, `src/contract/parse.ts`, `tests/contract/`
  - [x] 3.1 `urls.ts`: in `sourceUrl`, `check.url`, `check.confirmedUrl` and
    `promise.sourceUrl` only, U+2236 becomes ":" and U+00B7 becomes "." with a
    `url_lookalike_fixed` warning (old and new value). `null`, `""` and `"unknown"` are
    missing (`url_missing`). A value that is not an absolute http(s) URL is `url_invalid`
    (block). `;jsessionid=` gives `url_session_token` and the URL stays as it is.
  - [x] 3.2 `checks.ts`: duplicate ids; every reference resolves (`documentId`,
    `versionId`, `evidenceId`, `from`, `to`, `evidenceRefs`); `title` and `publisher`
    present; excerpt at most 300 characters for official documents and 200 for a Seoul
    Economic Daily article; an excerpt on news from another outlet is
    `news_excerpt_not_allowed` (this covers `promise.excerpt` and Evidence rows of a news
    version); pasted-text rules (excerpt must occur word for word: block; anchor must occur:
    warn); the kind and endpoint table; the derived `pasted_text_only` state.
  - [x] 3.3 Wire stages 2 and 3 into `parseCase` with the severity table: a block issue
    removes the record into `excluded`, a warning keeps it.
  - [x] 3.4 Tests with fixtures in `tests/fixtures/contract/`: look-alike URLs, missing and
    invalid URLs, a session token, a missing publisher, excerpts of 301 and 201 characters,
    a news excerpt from another outlet (synthetic text), an unresolved reference, each
    kind and endpoint mismatch. Property 7: normalization changes nothing outside the four
    URL fields and applying it twice equals applying it once.
  - Done when: the fixtures pass in `tests/contract/checks.test.ts` and
    `tests/contract/urls.test.ts`, property 7 passes with 200 runs, and `npm test` and
    `npm run build` pass.
  - _Requirements: 1.2, 2.2, 4.4, 4.5, 4.7, 6.1, 6.2, 6.3, 6.4, 6.5, 8.2; design
    properties: 7_

- [x] 4. Evidence gate and origin handling
  - Owner A · Reviewer B · Depends on: 3 · Writes: `src/contract/gate.ts`,
    `src/contract/parse.ts`, `tests/contract/`
  - [x] 4.1 `gate.ts`: `gateEvidence()` returns pass or fail with every failing reason, one
    check per row of the design's gate table. One role is enough (D-008); the second role
    fields are optional. The translation and `provenance` are never read.
  - [x] 4.2 Origin: with `origin: "user"` a stored check record is ignored
    (`check_record_ignored`), unless the row was copied from a sample and its `documentId`,
    `versionId`, `anchor`, `excerpt` and the version's `sourceUrl` are unchanged
    (`bundledChecks` lookup, D-009). Any edit drops the check.
  - [x] 4.3 `GateResult` is stored in `ScanModel.gate`. A row in pasted text only ends at
    `pasted_text_only` and never passes.
  - [x] 4.4 Tests: one fixture per failing reason code; a translation offered as evidence; a
    news source with and without an excerpt never passes; a row that carries only
    `confirmedBy` still fails without `checkedBy`; the `confirmedUrl` mismatch gives
    `checked_other_url`; a user case ignores its check records; an unchanged copy keeps its
    check and an edited copy loses it.
  - Done when: `tests/contract/gate.test.ts` and `tests/contract/origin.test.ts` pass, and
    `npm test` and `npm run build` pass.
  - _Requirements: 1.6, 4.1, 4.2, 4.3, 4.6, 6.1; D-008, D-009_

- [x] 5. Dates and legislative events
  - Owner A · Reviewer B · Depends on: 3 · Writes: `src/contract/dates.ts`,
    `src/contract/parse.ts`, `tests/contract/`
  - [x] 5.1 `dates.ts`: `eventDate` is `YYYY-MM-DD`, `YYYY-MM`, `YYYY` or `unknown`, and
    keeps its precision; `date_format` and `date_kind_missing` block. The kind list is the
    design's `EventKind`.
  - [x] 5.2 `timing` for `effective` and `applied` events only: `past`, `scheduled`,
    `too_coarse` or `unknown`, against `referenceDate`. The reference date is an input;
    tests pass a fixed one and the app passes today's local date. No function computes one
    date from another or from rule text.
  - [x] 5.3 Two events with the same `documentId`, `versionId` and `eventKind` but different
    dates both stay, each with a `date_conflict` warning that names the other.
  - [x] 5.4 Tests: a future effective date is `scheduled` and never past; a year-only date
    that spans the reference date is `too_coarse`; a note such as "six months after
    promulgation" produces no date; a date without a kind is blocked; property 8 (every date
    in the model appears in the input) and property 9 (an effective or applied event whose
    earliest possible day is after the reference date is `scheduled`), 200 runs each.
  - Done when: `tests/contract/dates.test.ts` passes, properties 8 and 9 pass, and
    `npm test` and `npm run build` pass.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7; design properties: 8, 9_

- [x] 6. Path status and the complete `parseCase`
  - Owner A · Reviewer B · Depends on: 4, 5 · Writes: `src/contract/status.ts`,
    `src/contract/parse.ts`, `src/contract/index.ts`, `tests/contract/`
  - [x] 6.1 `status.ts`: `deriveStatus()` follows the design's "Path status" rules 1 to 7:
    unresolved endpoint, no evidence, title or number as evidence set aside,
    `not_included` with its absence check, `same_outcome_separate_law` needing passing
    evidence from both documents, every other kind, and `review_state_overclaim`. It returns
    the status, `drawable` and the list of what is still needed. Export `NEED_CODES`.
  - [x] 6.2 Track and endpoint rules from the design table: the track is derived from the
    kind, never stored.
  - [x] 6.3 Finish `parseCase`: stages 1 to 6 build `ScanModel` (`gate`, `paths`, `dates`,
    `excluded`, `origin`, `referenceDate`). A warning never raises a status.
  - [x] 6.4 Tests: one unit test per rule branch and per kind; a recorded `confirmed` whose
    evidence fails stays derived and warns; `tests/contract/imports.test.ts` fails if
    `gate.ts` or `status.ts` imports anything from `src/compare/`, and fails if code
    outside `src/contract/` imports a file of the module other than `index.ts`.
  - Done when: `tests/contract/status.test.ts` and `tests/contract/imports.test.ts` pass,
    `npm test` and `npm run build` pass. Scan-screen tasks 6, 7 and 8 can start.
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 6.6_

- [x] 7. Text comparison
  - Owner A · Reviewer B · Depends on: 1 · Writes: `src/compare/`, `tests/compare/`
  - [x] 7.1 `src/compare/diff.ts`: `compareTexts(before, after)` on jsdiff
    `diffWordsWithSpace`, returning `equal`, `insert` and `delete` segments. Inputs over
    20,000 characters give `too_long`. The diff runs with `maxEditLength` and a 500 ms
    timeout; when jsdiff gives up the result is `too_costly`. The limits are constants that a
    test can lower through an optional argument.
  - [x] 7.2 The module exports no similarity figure and imports nothing from
    `src/contract/`.
  - [x] 7.3 Tests: English, Korean and mixed text; a text compared with itself gives only
    `equal`; two runs give the same result; `too_long` and `too_costly` are reached. Property
    10 in `tests/compare/properties.test.ts` (kept here so this task can run beside the
    contract tasks): joining `equal` and `delete` rebuilds `before`, joining `equal` and
    `insert` rebuilds `after`, 200 runs.
  - Done when: `tests/compare/diff.test.ts` and `tests/compare/properties.test.ts` pass, and
    `npm test` and `npm run build` pass.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5; design properties: 10_

- [x] 8. Regression fixtures and property suite
  - Owner A · Reviewer B · Depends on: 6, 7 · Writes: `tests/fixtures/contract/`,
    `tests/contract/regression.test.ts`, `tests/contract/properties.test.ts`
  - [x] 8.1 Add the ten named fixtures to `tests/fixtures/contract/`, each with an
    `<name>.expected.json` that lists the expected statuses and issue codes: same number but a
    different version; a different number that is a legitimate successor; a path without
    evidence; a missing author or document source; a future effective date; an official
    transfer next to a separate-law outcome; a translation offered as evidence; look-alike URL
    characters; two similar texts with no relation evidence; a recorded `confirmed` whose
    evidence fails the gate. Fixtures are synthetic (`fixture-` case ids, invented numbers and
    wording) or short official excerpts. No news text.
  - [x] 8.2 `regression.test.ts` runs every fixture in the folder, so a new fixture needs no
    code change.
  - [x] 8.3 Properties 1 to 6 in `properties.test.ts`, each with `numRuns: 200` and bounded
    generators (up to 8 versions, 12 evidence rows, 10 paths): one status and one track per
    path; no confirmed path rests on failing evidence; failing evidence never confirms; a
    shared number alone never confirms a clause path; changing `pastedText` leaves statuses
    unchanged; a `user` case with empty `bundledChecks` has no confirmed path. Re-run
    property 11 against the generated cases.
  - Done when: `npm test` passes the regression and property suites offline, and breaking an
    expected status in one fixture makes the suite fail (checked once, then reverted).
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5; design properties: 1, 2, 3, 4, 5, 6, 11_

- [x] 9. `validate:data`, recheck records and the two data hooks
  - Owner A · Reviewer B · Depends on: 6 · Writes: `scripts/validate-data.ts`,
    `src/contract/` (`parse.ts`: `parseRecheck`; `checks.ts`: the recheck cross-check),
    `tests/scripts/`, `tests/contract/`, `package.json` (scripts), `.kiro/hooks/research-data-check.json`,
    `.kiro/hooks/evidence-gate-check.json`
  - [x] 9.1 `parseRecheck()` for `data/verification/<caseId>.json` (a list of `Recheck`):
    schema, `url_lookalike_fixed` on `sourceUrl` and `confirm.url`, excerpt at most 300
    characters, roles A or B, no personal names in `note`.
  - [x] 9.2 Cross-check (D-002, D-006, D-020), a pure function: every Evidence row in a
    bundled case whose state is `matched_official` needs a recheck with result `matched`,
    a `confirm` part with result `matched`, two different roles, and both URLs equal to the
    row's `sourceUrl` after normalization. The absence check of a `not_included` path needs
    the same two roles (`checkedBy` and `confirmedBy` differ). A missing record is
    `recheck_missing` (block).
  - [x] 9.3 `scripts/validate-data.ts`: reads `data/cases/*.json` and
    `data/verification/*.json` (ignores `.gitkeep`), parses cases with `origin: "bundled"`
    and today's date, prints one line per issue (file, JSON path, code, message), exits 0
    when nothing blocks, 1 on a block issue, 2 on a usage error. It exits 0 when both
    folders are empty. The logic is a pure function; the script only reads files.
  - [x] 9.4 Add `validate:data` and `test:gate` (`vitest run tests/contract tests/compare`;
    the ingest folder does not exist, D-020) to `package.json`.
  - [x] 9.5 Switch `research-data-check` to a command action running
    `npm run --silent validate:data`, and `evidence-gate-check` to
    `npm run --silent test:gate`. Keep each hook's trigger and matcher. Use the command
    action shape Kiro documents for hooks.
  - [x] 9.6 Tests in `tests/scripts/validate-data.test.ts`: empty folders pass; each
    cross-check failure is reported; a block issue exits 1; a bad argument exits 2.
  - Done when: `npm run validate:data` and `npm run test:gate` exit 0 on the empty folders,
    both hook files show `"type": "command"`, and `npm test` passes.
  - _Requirements: 9.1, 9.3, 6.2; D-002, D-006, D-020_

- [x] 10. `check:repo` and the publish guard hook
  - Owner A · Reviewer B · Depends on: 1 · Writes: `scripts/check-repo.ts`,
    `tests/scripts/check-repo.test.ts`, `package.json` (scripts),
    `.kiro/hooks/publish-guard.json`
  - [x] 10.1 `scripts/check-repo.ts` fails (exit 1) when a tracked file path matches the
    internal-material patterns, when a tracked environment file exists, or when
    `git check-ignore --no-index` reports `.kiro` or any path under it as ignored. It reads
    the patterns from the `matcher` of `publish-guard.json`, so there is one list. The
    findings logic is a pure function over a file list; the script runs `git ls-files`.
  - [x] 10.2 Tests: a file list with an internal-material name fails; a tracked
    environment file fails; a `.gitignore` text that ignores `.kiro` fails; a clean list passes; one run on
    this repository exits 0.
  - [x] 10.3 Add `check:repo` to `package.json`. Switch `publish-guard` to a command action
    running `npm run --silent check:repo`, keeping its matcher.
  - [x] 10.4 The script and its tests necessarily carry literal internal-material patterns.
    When this task and task 11 land, the conductor adds those exact files to the private
    pre-push scanner's allow-list. Keep literal patterns in `scripts/` and `tests/` only,
    and describe internal material in plain words everywhere else in the repository.
  - Done when: `npm run check:repo` exits 0 here, the tests pass, and the hook shows
    `"type": "command"`.
  - _Requirements: 9.2, 9.3_

- [x] 11. `check:dist` (D-018)
  - Owner A · Reviewer B · Depends on: 1, 3 · Writes: `scripts/check-dist.ts`,
    `tests/scripts/check-dist.test.ts`, `package.json` (scripts)
  - [x] 11.1 `npm run check:dist` reads `dist/` (or `--dir <path>`) and an optional
    `--extra-patterns <file>` (or `BILLXRAY_DIST_PATTERNS`). An agent prepares the patterns
    file from the private research folder and stores it outside this repository; a person
    may spot-check it. It holds one string per line (for example sentences from other
    outlets' articles, personal names and retired brand names), must lie outside this
    repository, and the script refuses a path
    inside it, like `--research`. Exit 0 clean, 1 findings, 2 usage error. A finding prints
    file, rule and line, and for an extra pattern only its line number in the patterns file,
    never its text.
  - [x] 11.2 Rules, each with a test: (a) file allow-list: source maps, environment files,
    Markdown and JSON Lines files, git bundle backups, git metadata and any folder that holds
    internal material fail; (b) secrets: private key
    blocks, `api_key=`, bearer tokens, access-key shapes; (c) internal material names (the
    `publish-guard` patterns) and absolute paths into a personal computer's home
    folders (Windows, macOS and Linux forms); (d) analytics beacons: `beacon.min.js`, `cloudflareinsights`,
    `googletagmanager`, `google-analytics`, `plausible`, `hotjar`; (e) scripts, styles or
    fonts from other hosts (`<script src>`, `<link href>`, `@import url(`, `fonts.googleapis`,
    `unpkg`, `jsdelivr`, `cdnjs`), with a short documented allow-list for strings that
    libraries embed (the SVG namespace, the React error-decoder URL); in the JS bundle,
    hosts other than the `sourceUrl` hosts of the bundled cases fail; (f) news excerpts
    (D-016, D-018): the case data found in `dist/` goes through the contract's
    `news_excerpt_not_allowed` rule, and every `--extra-patterns` line is searched in every
    text file after whitespace normalization; (g) sentinel strings of development fixtures
    (`Synthetic fixture`); (h) at most 20,000 files and 25 MiB per file.
  - [x] 11.3 How the case data is read back from `dist/` is decided here with B: the
    recommended default is that `samples.ts` imports `data/cases/*.json` with Vite's `?raw`
    query so the JSON text survives in the bundle (a small change that scan-screen task 6
    makes); if that is not possible the script checks the same source files with the
    contract and relies on the extra patterns for the bundle.
  - [x] 11.4 On success print the file list with the SHA-256 of `index.html`, so a person
    can compare it with the live page after a deploy.
  - [x] 11.5 Tests build a small `dist/` in a temporary folder and cover: clean passes; each
    rule fails once; the extra-patterns file inside the repository is refused; a pattern
    hit never prints the pattern. Add `check:dist` to `package.json`.
  - Done when: `npm run build && npm run check:dist` exits 0 with `data/cases/` empty, the
    tests pass, and no rule's failure message contains the secret or the pattern it found.
  - _Requirements: 4.5, 4.7, 8.1; scan-screen 8.1; D-016, D-018_

- [x] 12. Recheck worksheets for the 19 demo cases (D-020)
  - Owner A · Reviewer B · Depends on: 1 · Writes: `scripts/make-worksheet.ts`,
    `tests/scripts/make-worksheet.test.ts`. The worksheets themselves are written outside
    this repository and never committed: they carry research-ledger results.
  - [x] 12.1 A one-off script (`shortcut: not the ingest; the ingest is postponed, D-020`)
    reads the research rows through `--research <dir>` or `BILLXRAY_RESEARCH_DIR` and writes
    one worksheet per case for the 19 cases of D-002 and D-006 into the directory given by
    `--out <dir>`. It refuses a research folder or an `--out` folder inside this repository.
    It only reads the research folder. The output folder is the private research folder; no
    file in this repository names it by path.
  - [x] 12.2 Each worksheet lists, for every evidence row: the research ids (evidence,
    document, source), the official URL with look-alike characters normalized (each change
    logged), the clause anchor, the original-language excerpt when it is at most 300
    characters (otherwise a note that the person copies the span), and what the research
    verification ledger says in one word (matched, partial, could not confirm, could not
    open). Rows that rest on news, or that have no official URL, are marked as such and carry
    no news text. Blank columns for the person: role, date, URL opened, result, anchor and
    excerpt as written, and the second role's part.
  - [x] 12.3 Rows with no research row are listed as "no research row": for H.R. 748 the
    short title in section 1 of the enrolled text (BILLS-116hr748enr) and P.L. 116-94
    Division N, Title I, section 503 (D-003); for the Semiconductor Special Act the clause
    rows of the original bill, the alternative (no official URL in the research), the
    working-hours exception, and the text page of the Act (the page the research opened shows
    the title but not the articles). The worksheet gives candidate URLs only when a source
    already names them, and marks them "candidate, the person records the URL actually
    opened".
  - [x] 12.4 The Semiconductor worksheet has a "dates to read from the official record"
    block. The research carries two dates for the discarded original bill: 2025-12-04
    (also the committee note date) and 2026-01-29 (the plenary vote on the alternative). The
    person records which date the National Assembly bill record shows for the original's
    disposition, and keeps `discarded`, `committee_note` and `passed` as separate kinds.
    Nothing is computed from another date.
  - [x] 12.5 Every worksheet starts with a short "how to record" section: the `Recheck` JSON
    shape, the two-role rule (D-002, D-006), result words (`matched`, `partial`,
    `mismatch`, `could_not_open`, `not_found`), and "if a page does not open or does not show
    the clause, record that; do not fill it in".
  - [x] 12.6 Tests on synthetic research rows: a news-based row is marked and carries no
    news text; a row without a URL is marked; a look-alike URL is normalized and logged; an
    excerpt of 301 characters is not printed; a research folder or an `--out` folder inside
    the repository is refused.
  - Done when: the script runs against the private research folder and writes 19 worksheets
    outside the repository (the task report lists, per case, official rows, news or
    URL-less rows and "no research row" rows), `npm test` passes, and `git status` shows no
    worksheet file in the repository.
  - _Requirements: D-002, D-003, D-006, D-020; `research-data.md`_

- [ ] 13. H.R. 748: recheck and entry (D-003, D-020)
  - Owner A · Reviewer B · Depends on: 9, 12 · Writes: `data/verification/`, `data/cases/`
  - [ ] 13.1 (person, role A) Open every official URL of the H.R. 748 worksheet, including
    the two D-003 rows, and fill the first part: the anchor and excerpt as written on the
    page, the URL actually opened, the date and the result. Use a page that shows the clause
    text (a GovInfo details page shows metadata only).
  - [ ] 13.2 (person, role B, a different person) Open the same URLs without looking at the
    first answer and fill the `confirm` part.
  - [ ] 13.3 (person) Read each date the case needs from the official page with its kind:
    introduced, passed, enacted or promulgated, effective, applied. Record the kind next to
    the date. The enrolled text's opening that still carries the old long title, and the
    application date of section 503 (taxable years after 2019-12-31), each need their own
    row.
  - [ ] 13.4 (agent, A) After the records exist: write `data/verification/us-116-hr748.json`
    from the signed worksheet, and `data/cases/us-116-hr748.json` in contract format with
    only the evidence rows whose recheck is complete. Paths: the number path between the
    introduced and the enrolled text of H.R. 748, and the clause path "same outcome,
    separate law" to P.L. 116-94, Division N, section 503. A path whose evidence rows were
    not entered is not entered. A person compares the entered files with the signed
    worksheet once. No `promise` record (overseas case). The sources do not
    establish a direct transfer or legislative causation, so no `transferred` path.
  - [ ] 13.5 Run `npm run validate:data`, `npm test` and `npm run check:repo`.
  - Done when: the two data files exist, `npm run validate:data` exits 0 with the recheck
    cross-check, and each entered evidence row names two different roles. If a row cannot be
    confirmed, it stays out and the report says which; the criteria are not lowered.
  - _Requirements: 4.1, 4.6, 9.1; D-002, D-003, D-008, D-020_

- [ ] 14. Semiconductor Special Act: recheck and entry (D-006, D-020)
  - Owner A · Reviewer B · Depends on: 9, 12 · Writes: `data/verification/`, `data/cases/`
  - [ ] 14.1 (person, role A) Open the National Assembly bill records for the original bill
    2205453 and the committee alternative 2215103, and the statute page that shows the
    articles of Act No. 21337. Record the anchors and excerpts as written: original section
    15 (power and water infrastructure), original section 33 (working-hours exception for
    certain R&D staff), Act section 18, Act section 33, the supplementary provision with the
    effective date, and the committee note if its page opens. Each row records the URL opened.
  - [ ] 14.2 (person, role B, a different person) Open the same pages independently and fill
    the `confirm` part.
  - [ ] 14.3 (person) Read the dates with their kinds: introduced, the disposition of the
    original bill, the committee note, the plenary vote on the alternative (2026-01-29 per
    the research), promulgation (2026-02-10), effective (2026-08-11). For the discarded
    original bill, write down which of the research's two dates (2025-12-04, 2026-01-29) the
    official record shows, and do not copy one kind's date into another.
  - [ ] 14.4 (person, both roles) The absence of the working-hours exception in the final
    text is an absence check: record the version searched, the scope (whole text or listed
    articles), the terms searched for and both roles with dates. It is wording only: never
    "passed as proposed" and never "permanently abolished".
  - [ ] 14.5 (agent, A) After the records exist: write
    `data/verification/kr-semiconductor-special-act.json` and
    `data/cases/kr-semiconductor-special-act.json` with only fully rechecked rows. Paths: the
    number path from the original bill to the alternative to the Act, a `carried` clause path
    from original section 15 to Act section 18, and a `not_included` path for section 33 with
    its absence check. Titles are English display titles; excerpts stay in Korean. No
    `promise` record from the newsroom tracking service unless the README's pre-existing-work
    line already says so (D-019).
  - [ ] 14.6 Run `npm run validate:data`, `npm test` and `npm run check:repo`.
  - Done when: both files exist and `npm run validate:data` exits 0; or, if the rows cannot be
    confirmed, no case file is written, the report says which rows failed and why, and the
    product owner is told the Korean sample leaves the demo (D-006, D-015).
  - _Requirements: 3.5, 4.1, 4.6, 5.1, 9.1; D-006, D-008, D-015, D-019, D-020_

- [ ]* 15. Remaining 17 demo cases (D-002, D-020)
  - Owner A · Reviewer B · Depends on: 13 · Writes: `data/verification/`, `data/cases/`
  - [ ]* 15.1 (person, two roles) One worksheet at a time: recheck the rows as in task 13.
  - [ ]* 15.2 (agent, A) Enter each case that has complete rechecks as in task 13.4, one case
    per session. Keep control cases (no gap) in the data.
  - Done when: each entered case passes `npm run validate:data`.
  - Not needed for the P0 demo. The screen shows only the two samples (scan-screen task 6),
    so these cases appear nowhere until a case picker exists (P1). Do this only after the
    product owner decides it is wanted.
  - _Requirements: D-002, D-020_

## Coverage

Requirements to tasks:

| Requirement | Tasks |
|---|---|
| 1.1, 1.3, 1.5 | 2 (1.5 also 3) |
| 1.2 | 3 |
| 1.4 | 2, 6 |
| 1.6 | 2, 4 |
| 2.1, 2.3, 2.4 | 6 (and 8, properties 1, 4, 5) |
| 2.2 | 3, 6 |
| 3.1 to 3.8 | 6 (3.4 also 8) |
| 4.1, 4.2, 4.3, 4.6 | 4 |
| 4.4, 4.5, 4.7 | 3 |
| 5.1 to 5.7 | 5 (5.6 also 6) |
| 6.1 | 3, 4 |
| 6.2 to 6.5 | 3 |
| 6.6 | 6 |
| 7.1 to 7.5 | 7 |
| 8.1, 8.2, 8.4, 8.5 | 8 (8.2 also 3) |
| 8.3 | 1 (all test tasks keep it offline) |
| 9.1 | 9 |
| 9.2 | 10 |
| 9.3 | 9, 10 |

Design properties to tasks: 1, 2, 3, 4, 5, 6 in task 8; 7 in task 3; 8 and 9 in task 5;
10 in task 7; 11 in tasks 2 and 8. The "no import from `src/compare/`" test is in task 6.
The origin rules are in task 4, the recheck record format in tasks 2 and 9, the hooks table
in tasks 9 and 10, the error handling and exit codes in tasks 2, 9 and 10.

Decisions to tasks: D-002, D-003, D-006 in tasks 9, 12, 13, 14; D-008 in tasks 4, 9, 13, 14;
D-009 in task 4; D-016 in tasks 3 and 11; D-018 in task 11 (and scan-screen task 12);
D-019 in task 14 (and scan-screen tasks 3 and 12); D-020 in tasks 9, 12, 13, 14 and 15.

Not covered by any task here: the research-ingest spec (design postponed, D-020), the
properties and requirements of `research-ingest` that the contract design cites (4.1, 4.4),
and the Korean dictionary (P1).
