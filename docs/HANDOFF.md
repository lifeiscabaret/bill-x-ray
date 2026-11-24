# Handoff

For the two team members who take over Bill X-Ray (roles A and B, as in
`.kiro/steering/product.md`). Feature work by the Kiro Crew chats stopped at the scan-screen
9 wrap-up (D-022). This file says where things stand, what is left, and what waits on a
person. Files in this repository name no people: write a role or a GitHub account,
never a real name (D-023).

## Start here

You need Node 22 LTS (`engines` in `package.json` allows `>=22 <23`).

```powershell
git clone https://github.com/lifeiscabaret/bill-x-ray.git
cd bill-x-ray
npm ci
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Serves the app on http://127.0.0.1:4748 (bound to 127.0.0.1, port fixed) |
| `npm run dev:fixtures` | Same address, with two synthetic sample cases from `tests/fixtures/samples/`. For looking at the screen only: the fixture cases must never go into a deployed build, and `check:dist` fails on their title text |
| `npm test` | Runs all unit, component and property tests offline |
| `npm run test:gate` | Runs only the contract and comparison tests (the `evidence-gate-check` hook runs this) |
| `npm run build` | Type-checks with TypeScript 7, then builds the static site into `dist/` |
| `npm run validate:data` | Checks `data/cases/` and `data/verification/` against the contract and the two-role recheck rule. Exits 0 on empty folders. A names check is skipped unless you pass `--research <dir>` or set `BILLXRAY_RESEARCH_DIR` to the private research folder, which must be outside this repository |
| `npm run check:copy` | Wording check for `src/ui/` and `src/i18n/`: evaluative words, and interface text that does not come from the dictionary |
| `npm run check:repo` | Fails when a tracked path matches the internal-material patterns, when an environment file is tracked, or when a `.gitignore` line would hide `.kiro` |
| `npm run check:dist` | Checks `dist/` before an upload: secrets, analytics beacons, scripts and fonts from other hosts, fixture text, and excerpts of other outlets' news. Run it after `npm run build`. For the full check, point it at the extra-patterns list with `--extra-patterns <file>` or `BILLXRAY_DIST_PATTERNS`; the file must be outside this repository |

`scripts/make-worksheet.ts` is a one-off script (run with `npx tsx`) that writes the recheck
worksheets. It reads the research bundle from `--research <dir>` or `BILLXRAY_RESEARCH_DIR`
and writes to `--out <dir>`. Both folders must be outside this repository, and the script
refuses a folder inside it.

In PowerShell, pass flags to an npm script after a quoted double dash, for example
`npm run check:dist '--' --extra-patterns <file>`, or use the environment variables.

## State at handoff

Measured on the tree of the commit that adds this file.

What works:
- The app runs locally. With `data/cases/` empty it opens on "Scan your own bill". A sample
  button appears only for a sample file that loads and passes its checks.
- "Scan your own bill" takes versions, clauses, links and an optional promise record by
  typing, by starting from a sample, or by importing a JSON file. It compares texts at the
  sentence level and draws a link only when the contract finds evidence for it. A user's
  link never shows as confirmed (D-009).
- The contract, the comparison, the evidence gate, path status and dates are tested:
  1019 tests in 32 test files, all passing. `validate:data`, `check:copy`,
  `check:repo`, `check:dist` and `build` all exit 0.
- All four hooks in `.kiro/hooks/` are command actions.
- `docs/DEPLOY.md` is written.

What does not work or is not done:
- No demo case is loaded: `data/cases/` and `data/verification/` hold only placeholders. The
  U.S. and Korean sample buttons stay hidden until the rechecks below are done and the case
  files are entered.
- Nothing is deployed, and `docs/DEPLOY.md` has not been executed.
- The hooks are defined but nobody has confirmed that they run in Kiro IDE (item below).
- The checks that need a person at the keyboard (narrow screens, keyboard only, reduced
  motion in the operating system) are listed under "Remaining tasks".

## Finished tasks

"Role" is the owner role in the task list (A: data and verification, B: screen and demo).
"Owner" is left blank for you to fill.

### data-contract (`.kiro/specs/data-contract/tasks.md`)

| Task | Title | Status | Commit(s) | Role | Owner |
|---|---|---|---|---|---|
| 1 | Project scaffold | done | `7a6677e` | A | |
| 2 | Contract types, result types and structural schema | done | `a97e5d5` | A | |
| 3 | URL normalization and semantic checks | done | `6f94080` | A | |
| 4 | Evidence gate and origin handling | done | `00e2547` | A | |
| 5 | Dates and legislative events | done | `c765432` | A | |
| 6 | Path status and the complete `parseCase` | done | `3206054`, `1dbac90` | A | |
| 7 | Text comparison | done | `9d960d5` | A | |
| 8 | Regression fixtures and property suite | done | `195b22f` | A | |
| 9 | `validate:data`, recheck records and the two data hooks | done | `09a58c1`, `a40635a` | A | |
| 10 | `check:repo` and the publish guard hook | done | `69c411f` | A | |
| 11 | `check:dist` (D-018) | done | `8bf9c6e` | A | |
| 12 | Recheck worksheets for the 19 demo cases (D-020) | done | `42113c1` | A | |

### scan-screen (`.kiro/specs/scan-screen/tasks.md`)

| Task | Title | Status | Commit(s) | Role | Owner |
|---|---|---|---|---|---|
| 1 | Interface strings and the wording check | done | `b5ddbd9` | B | |
| 2 | Layout engine | done | `23b46a8` | B | |
| 3 | Connectors, nodes and labels | partial: 3.1 to 3.3 and 3.5 done; 3.4 (a check that applies only if promise data is rendered) was not triggered and is not ticked | `d399ae0`, `282f410` | B | |
| 4 | Evidence panel and difference text | done | `ca92441`, `282f410` | B | |
| 5 | Scanner, scan view and the not-drawn list | done | `982e8db` | B | |
| 6 | App shell, sample loading and the first scene | done | `d439b36` | B | |
| 7 | Scan your own bill: fields and issues | done | `907b4ca` | B | |
| 8 | Scan your own bill: links, promise, comparison, import and session | done | `0d4559b` | B | |
| 9 | Narrow screens, keyboard and reduced motion | partial: 9.1 to 9.3 done, 9.4 (a person's check) not started | `174a9ce` | B | |
| 12 | Deploy runbook and release check (D-018) | done | `b1adbb3`, `4463b5a` | B | |

Notes:
- The checkboxes in the two task lists are current.
- Task 12 is written and its commands passed on the tree at that time. Steps 12.3 and 12.4
  (README check for promise data, `dist/` check with cases in it) must be run again once real
  samples are in `data/cases/`.
- Task 1 of the scan-screen list also switched `ui-wording-check` to a command action; tasks 9
  and 10 of the data-contract list switched the other three.

## Remaining tasks

| Task | Title | What is left | Waits on | Done when | Commit(s) | Role | Owner |
|---|---|---|---|---|---|---|---|
| scan-screen 9 (partial) | Narrow screens, keyboard and reduced motion | Step 9.4: a person opens the app at 360 px and at desktop width, uses only the keyboard, and turns on the operating system's reduced motion, then fills in the sheet `docs/mockup/accessibility-check.md` (role, date, pass or fail per row, listed defects) and puts screenshots in `docs/mockup/screens/` (1600 px or less on each side). The sheet is prepared and empty | A person (role A or B) | `docs/mockup/accessibility-check.md` has a pass or a listed defect for each of the three modes | `174a9ce` | B | |
| data-contract 13 | H.R. 748: recheck and entry | Two people recheck the official sources (step 13.1 to 13.3); then an agent enters the case files from the signed worksheets (13.4) and runs the checks (13.5) | The recheck (two people, roles A and B) | The two data files exist, `npm run validate:data` exits 0 with the recheck cross-check, and each entered evidence row names two different roles. A row that cannot be confirmed stays out | none | A | |
| data-contract 14 | Semiconductor Special Act: recheck and entry | Same as 13, plus the absence check for the clause that is not in the final text (14.4) | The recheck (two people, roles A and B) | Both files exist and `validate:data` exits 0; or no case file is written, the report says which rows failed, and the Korean sample leaves the demo (D-006, D-015) | none | A | |
| data-contract 15 (optional) | Remaining 17 demo cases | Recheck and enter each case, one at a time | The recheck, and a decision that these cases are wanted | Each entered case passes `npm run validate:data`. Not needed for the P0 demo, because the screen shows only the two samples until a case picker exists (P1) | none | A | |
| scan-screen 10 | Connect the real samples | Run `validate:data`, render both modes with the real files, add the data-driven test, check the labels and the Korea button (10.1 to 10.4) | data-contract 13 and 14 (or the product owner's decision on the Korean sample) | The data-driven test passes against the real files and a browser check of both modes is recorded as a short note in `docs/mockup/` | none | B | |
| scan-screen 11 | Third-case trial and error review | A person enters a real case that role A has not seen, records every stumble, and role A checks the sources and labels; then an agent fixes the recorded stumbles (11.1 to 11.4) | scan-screen 8 and 10, and two people | `docs/mockup/third-case-trial.md` lists the trial and every stumble is fixed or marked as left, with the reason | none | B | |
| scan-screen 13 | The 45-second demo rehearsal | Three timed runs and the pass list (13.1, 13.2). The five-speaker test (13.3) is optional | scan-screen 9, 10 and 11, and two people | `docs/mockup/demo-rehearsal.md` records three timed runs and the pass list | none | B | |

## Rechecks waiting (2)

The two demo cases whose evidence a person must open on the official pages are H.R. 748
(research case B4-CASE-0001) and the Semiconductor Special Act (B3a-CASE-0001). Under D-002 and
D-006 a row enters `data/` only after two different people, roles A and B, have opened the
official URL themselves and recorded the same anchor and excerpt.

How it goes:
1. Each of the two people opens the official pages separately and fills in their own copy of
   the worksheet for the case. Role B does not see role A's answers. The worksheets are
   part of the research bundle and are handed over privately; the script that wrote them is
   `scripts/make-worksheet.ts`.
2. An agent transcribes the results into `data/verification/` and `data/cases/` in contract
   format. A person then compares the entered files with the signed worksheets once.
3. `npm run validate:data` refuses a confirmed row that does not have records from both roles.
   It also compares each record's anchor, excerpt, roles and dates with the row.
4. If the Korean case cannot be confirmed, it leaves the demo and the Korea button stays
   hidden until the product owner picks a replacement (D-006, D-015). The criteria are not
   lowered.

The hard spots, in general terms:
- Some official pages show only metadata and no clause text. The person has to find a page
  that shows the clause, and record the URL actually opened.
- Some items have no official URL yet. The worksheet gives no guess; the person records the
  URL they opened.
- Some excerpts in the research came from a secondary source and must be found on the
  official page itself.
- For one case, a date has to be read on the official bill page, and each date keeps its own
  kind (see `.kiro/steering/research-data.md`).
- Page, row and URL details are in the worksheets, not here. This file carries no research
  values.

## Hook check in Kiro IDE (team member; not the account that made the commits)

D-024: the four hooks are defined as command actions, and no run has been confirmed. Kiro
Crew does not run project hooks, so this needs Kiro IDE on a machine of a team member. Steps:

1. Open the repository folder in Kiro IDE.
2. In the hooks panel (the Agent Hooks section of the Kiro panel), confirm that the four hooks
   are listed and enabled.
3. For each hook, read the watched pattern and the command from its file in `.kiro/hooks/`.
   Save a harmless edit to a file the hook watches, check that the hook starts and that its
   command runs, and take a screenshot. Then undo the edit until `git status` is clean.

   | Hook file | Save an edit to | Command that should run |
   |---|---|---|
   | `research-data-check.json` | a new file `data/verification/hooktest.json` that holds only `[]` | `npm run --silent validate:data` |
   | `evidence-gate-check.json` | `src/contract/index.ts` (add a blank line at the end) | `npm run --silent test:gate` |
   | `ui-wording-check.json` | `src/ui/App.tsx` (add a blank line at the end) | `npm run --silent check:copy` |
   | `publish-guard.json` | see step 4 | `npm run --silent check:repo` |

4. For `publish-guard`, create an empty file `.env.hooktest` at the repository root and save
   it: `.env*` is one of the hook's patterns. `check:repo` looks at tracked files only, so a
   clean result with 0 findings is the expected output; what you are looking for is the hook
   starting and the command running. Delete the file afterwards.
5. Keep the screenshots outside the repository until the team decides whether they go into
   `docs/`. Then update the hook rows in `docs/KIRO_USAGE.md` from "defined, run not
   confirmed" to what you saw.

## Deployment

`docs/DEPLOY.md` is written and has not been executed (D-018). A person deploys it after the
internal sign-off; agents never sign up, log in or upload.

- Note for the sign-off: Cloudflare's own page about the default `workers.dev` address
  describes it as meant for personal or hobby projects that are not business-critical, and
  recommends a custom domain for production
  ([workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)).
  D-018 chose the default address and no domain; the sign-off should say so knowingly.
- The site stays up until 2027-02-04 KST.
- After each deploy, a second person fetches the live HTML and searches it for
  `beacon.min.js` and `cloudflareinsights`. If either appears, turn Web Analytics off and
  fetch again.
- Run the pre-deploy commands (`npm test`, `npm run validate:data`, `npm run check:copy`,
  `npm run check:repo`, `npm run build`, `npm run check:dist`) again once demo data is in,
  because `check:dist` reads the case data back out of the bundle.

## Open questions and pending decisions

- **Launch date of the promise-tracking service.** The README and the Devpost field state that
  the optional promise field follows the structure of an existing Seoul Economic Daily
  service, without a date (D-021). The public launch date of that service is not confirmed.
  When it is, it decides whether a date claim can return to the README and the Devpost field,
  under a new D-number.
- The README rights wording for legal texts and news excerpts is still a draft.
- The data license.
- Rights to the newsroom legislative tracking project: brand, data/API and full-article
  redistribution. Short excerpts of Seoul Economic Daily articles are allowed (D-016); nothing
  else from that project is cleared.
- The act of submitting.
- research-ingest is decided again after the app runs (D-020). Its requirements exist; it has
  no design and no tasks, and `src/ingest/` does not exist.
- Known issues in the screens and tooling, from the task reports:
  - At scanner position 0 the clause nodes cover the version nodes in the first and the last
    column, so those two versions' names and dates are not visible until the scanner moves
    (they stay reachable by Tab and by a screen reader). That is the designed first scene
    (D-013). The line labels no longer cover the middle version's name (`174a9ce`). Look at the
    scene again with real data and decide whether to move the clause nodes aside at position 0.
  - Two clause nodes in the same column overlap, and lines that enter the same node overlap.
    A line label can still overlap another in the same column and lane when every gap between
    columns is already used. A version with four or more dates overflows its node box. Box
    sizes and the axis scale were set by eye and may need adjusting for long document numbers
    or Korean clause numbers.
  - A scan with four or more lanes at 360 px, or three columns between 720 and about 880 px,
    scrolls sideways inside the scan box. The page itself does not scroll sideways. Fitting
    them in one view needs a new width calculation.
  - The operating system's reduced-motion setting is read once, when the app starts. A change
    while the app is open is not followed. The in-app toggle works at any time.
  - No keyboard or touch check by a person has been done. The tests use synthetic events.
  - The panel now sits beside the scan from 1024 px up, not from 720 px, because a three-column
    scan does not fit next to it below that. The scan turns vertical below 720 px as D-014
    says. The spec did not say anything about the 1024 px point.
  - Korean text differences are shown in small pieces, because the comparison library splits
    Hangul by syllable.
  - The "not drawn" list points to a path that the contract left out by its position in the
    file, not by its id, because the excluded record carries no path id.
  - A clause path that starts from the promise record never shows as confirmed. A sample with
    such a path shows "Not verified".
  - In the form: an empty bill number leaves the document number blank in the panel; "Start
    from a sample" and "Import JSON" replace the whole form with no confirmation and no undo;
    the promise date is not checked for format; a sample's "not included" line shows "Omission
    not verified" in the form because the form has no place for the absence check.
  - Every keystroke runs the parse, the layout and the comparison again, so long pasted texts
    can make typing slow. This was not measured with large cases.
  - The error screen stays on until the number of documents changes.
  - Failures of the recheck cross-check all use one issue code (`recheck_missing`) with a
    reason in its parameters, and the issue list on screen shows the contract's English
    fallback message, not a dictionary string.
  - Some UI tests (`tests/ui/app.test.tsx`, `tests/ui/app-error.test.tsx`, the scanner timing
    tests, `tests/ui/form-flow.test.tsx`) have failed on a time limit when other heavy
    processes ran at the same time. They pass when the machine is idle. In a full run on an
    idle machine the whole suite took about 84 seconds, and the form test "a whole case entered
    by typing alone" took about 45 seconds of that.
  - The maximum edit length of the comparison (10,000) was chosen without measuring real long
    articles.
  - `@types/node` is version 26 while the app targets Node 22, so a Node API that Node 22
    lacks could compile.
  - The extra-patterns list that `check:dist` reads covers only a few sentences from other
    outlets' articles and a list of names, and only whole-sentence matches. It gives limited
    protection.

## Material kept outside the repository

Handed over privately, and never to be committed:
- the research bundle (raw reports, review packets, extracted rows, run logs and verification
  ledgers);
- the two recheck worksheets for the demo cases;
- the extra-patterns list that `check:dist` reads;
- the names list that `validate:data` reads for its personal-name check;
- the pre-push scan script that the product owner runs before each push.

`npm run check:repo` and the `publish-guard` hook watch for this material entering the
repository.

## Rules that still hold

- Agents never deploy, sign up or log in to a hosting account (D-018, `.kiro/steering/tech.md`).
- No force push.
- `/.kiro` stays committed. No `.gitignore` line may hide it or any folder in it
  (`.kiro/steering/structure.md`).
- Excerpts of other outlets' news are not allowed in this repository or on the screen
  (D-016, `.kiro/steering/research-data.md`, "URLs and quotes").
- The evidence gate: a path is confirmed only when the official URL, the clause anchor and
  the original-language excerpt match, and a person opened the page
  (`.kiro/steering/research-data.md`, "Evidence gate", and D-001, D-002, D-006, D-008).
- Wording: record states only, no evaluative words (`.kiro/steering/ui-copy.md`).
- Roles A and B and GitHub accounts only, never a real name (D-023).
