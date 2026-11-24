# How Kiro was used (draft)

*Draft, updated 2026-11-24. It describes the repository at the commit that adds this
revision. It rests on the files and history in this repository and, for the Kiro Crew
section, on the Kiro Crew work ledger, chat history and task reports kept outside it. Every
claim below names a path or a commit hash that can be checked with `git log -- <path>` or
`git show <hash>`.*

The Kiroween 2026 [official rules](https://kiroween.devpost.com/rules) ask for a write-up
of how Kiro was used and list the topics below. Each section answers one topic. A feature
that was not used says "not used". Nothing here is claimed for something that was not done.

## State of the project

- The application exists. It is a static Vite + React + TypeScript app: `src/contract/`
  (data contract), `src/compare/` (text comparison), `src/ui/` (screens) and `src/i18n/`
  (interface strings), with `scripts/` for the command-line checks and `tests/`. It runs
  locally. It is not deployed.
- Tests: 1019 tests in 32 test files, run with `npm test`, measured on
  2026-11-24 before the commit that adds this revision. Checks: `npm run validate:data`,
  `check:copy`, `check:repo`, `check:dist` and `build`.
- No demo case is loaded. `data/cases/` and `data/verification/` hold only placeholders,
  because the two evidence rechecks that the loading gate needs are done by people and are
  still pending (`docs/HANDOFF.md`).
- Application code was written by Kiro Crew worker chats, one chat per top-level task of
  the two task lists (`.kiro/specs/data-contract/tasks.md`,
  `.kiro/specs/scan-screen/tasks.md`). Each commit subject names its task, for example
  "(data-contract 6)". The repository does not record which Kiro app wrote each file. The
  Kiro Crew chats are recorded in the work ledger, chat history and task reports described
  below.

## Summary

| Topic the rules ask about | Status | Where to check |
|---|---|---|
| Kiro Crew | Used. Its chats are driven through Kiro CLI | The Kiro Crew section below; the commits listed there |
| Kiro IDE | No record of use. Local Kiro IDE logs on the machine used hold no mention of this repository or of its hooks | Nothing in the repository; see "Agent hooks" |
| Kiro CLI directly, Kiro Web | No separate record | None |
| Custom agents | Not used | No agent definition exists under `.kiro/` |
| Agent hooks | Four hooks defined, all command actions. Defined, run not confirmed | `.kiro/hooks/*.json`; see "Agent hooks" |
| Spec-driven development | Used. Three specs: all have requirements, two have a design and a task list | `.kiro/specs/`; see "Spec-driven development" |
| Steering docs | Used. Seven steering files | `.kiro/steering/`; see "Steering docs" |
| MCP | Not used in this repository | No MCP configuration exists under `.kiro/` |
| Property-based testing | Used. fast-check runs in twelve test files | `git grep -l fast-check -- tests`; see "Property-based testing" |
| Kiro powers | Not used | No power is configured in the repository |

## Spec-driven development

### Specs

| Spec | Requirements | Design | Tasks |
|---|---|---|---|
| `data-contract` | 9 requirements, `d942285` | yes, `2deea6d` | 15 tasks, `ddd986e` (task 15 is optional) |
| `scan-screen` | 8 requirements, `d942285` | yes, `2deea6d` | 13 tasks, `ddd986e` |
| `research-ingest` | 10 requirements, `d942285` | not written | not written (postponed, D-020) |

Files: [data-contract](../.kiro/specs/data-contract/), [scan-screen](../.kiro/specs/scan-screen/),
[research-ingest](../.kiro/specs/research-ingest/).

How they are structured:

- Each requirement has a user story and numbered acceptance criteria written as "THE
  system SHALL ...". Designs refer back to requirement numbers (for example "Req 4.3"), so
  a design line can be traced to the criterion it serves.
- Each task in the two `tasks.md` files names the requirements and decisions it serves
  (the `_Requirements:_` line), the files it writes, what it depends on, and a "Done when"
  line. A task is finished when that line is true, with its own tests.
- The specs share one data contract. The scan screen reads it, and so will the ingest, so a
  rule changes in one place.
- The designs list correctness properties (for example "one status per path"). They became
  fast-check tests (see "Property-based testing").

### Order of work, from `git log`

| Commit | Date | What it holds |
|---|---|---|
| `6ce6f06` | 2026-11-22 | Repository start with the first steering files and hooks |
| `d22ca5d` | 2026-11-22 | Steering and hooks aligned with the project's source documents |
| `d942285` | 2026-11-22 | Draft requirements for the three specs |
| `07c5d35` | 2026-11-23 | Decisions D-001 to D-004 applied to steering and requirements |
| `3259f93` | 2026-11-23 | Decisions D-005 to D-007 applied to steering and requirements |
| `a1d30f0` | 2026-11-23 | Merge with the public repository's first two commits (the initial commit and its LICENSE update) |
| `f691a5a` | 2026-11-23 | README status and draft mark before the first push |
| `4cd1887` | 2026-11-23 | `.gitignore` for internal material |
| `2deea6d` | 2026-11-23 | Draft designs for `data-contract` and `scan-screen` |
| `d0c9d28` | 2026-11-23 | Decisions D-008 to D-015 applied to the designs |
| `7605eb8` | 2026-11-24 | News excerpt rule and review verdict format (D-016, D-017) |
| `13ca8e9` | 2026-11-24 | Decisions D-018 to D-020 and the pre-existing work section |
| `ddd986e` | 2026-11-24 | Approved task lists for `data-contract` and `scan-screen` |
| `7a6677e` to `174a9ce` | 2026-11-24 | 26 commits that implement the tasks, one task or follow-up each (listed under "Kiro Crew") |

### How this compares with chat-driven work

- **Where a spec was used:** requirements came first, then a design, then a task list, and
  each decision from the product owner was written into [`DECISIONS.md`](DECISIONS.md) and
  then applied to the files it affects. Example: commit `7605eb8` applied D-016 and D-017
  to two hooks, five steering files, five spec files, the README and the decision log in one
  commit, with the decision numbers in the text. D-008 replaced a rule in the first design
  draft, and the design was changed to match (`d0c9d28`). Implementation followed the task
  lists: the commit subjects `Add path status and complete parseCase (data-contract 6)`
  (`3206054`) and `Add the scanner, scan view and not-drawn list (scan-screen 5)` (`982e8db`)
  are two examples.
- **Where chat instructions were used without a spec:** the first steering files and hooks
  arrived as a delivered handoff set and were committed as received, apart from one title
  line (`6ce6f06`); the repository does not show how that set was written. One Kiro Crew
  chat then aligned it with the project's source documents and added the `product`, `tech`
  and `structure` steering files from the product owner's instructions (`d22ca5d`).
  Repository housekeeping was done the same way: the change of commit address to a GitHub
  noreply address, the merge with the public repository, the README edits, the `.gitignore`
  and the rebuild of the unpushed local commits on top of the public `main`. A pre-push
  scan followed each of these before the product owner pushed. None of this is application
  code.
- **What the repository cannot show:** how long either way took, or how many defects either
  way caused. No report records such a comparison, so no claim is made that spec-driven
  work was faster or safer here.

## Steering docs

Seven files in [`.kiro/steering/`](../.kiro/steering/), each with the commits that touched
it (from `git log --reverse -- <path>`):

| File | Inclusion | What it fixes | Commits |
|---|---|---|---|
| `product.md` | always | Scope, users, non-negotiables, decisions not yet made | `d22ca5d` `d942285` `3259f93` `7605eb8` `13ca8e9` |
| `project-context.md` | always | The two paths (number and clause), the representative cases, evidence logic | `6ce6f06` `d22ca5d` `d942285` `7605eb8` |
| `research-data.md` | always | Evidence gate, loading gate, review verdicts, dates, wording, excerpt limits | `6ce6f06` `d22ca5d` `07c5d35` `3259f93` `7605eb8` `13ca8e9` |
| `structure.md` | always | Folder layout and what must never be in the repository | `d22ca5d` `13ca8e9` |
| `tech.md` | always | Stack, rules for pure modules, commands | `d22ca5d` `13ca8e9` `b5ddbd9` |
| `legal-sources.md` | when matching files open | Which sources count as official originals | `6ce6f06` `d22ca5d` `7605eb8` |
| `ui-copy.md` | when matching files open | Record-state wording and what each screen element must show | `6ce6f06` `d22ca5d` `7605eb8` |

The two "when matching files open" files are set to apply to files under `src/contract/`,
`src/ingest/`, `scripts/` or `data/` (`legal-sources.md`) and under `src/ui/` or
`src/i18n/` (`ui-copy.md`). Files in most of those folders now exist. The repository does not
record whether a given chat loaded them. The strategy behind the files: put each rule in one
place, and let specs, hooks and code point to it. Commit `7605eb8` shows it: one excerpt rule
was changed in the steering file and then carried through specs and hooks. Commit `b5ddbd9`
shows the other direction: while adding `check:copy`, it wrote the `typescript5` alias rule
into `tech.md`.

## Agent hooks

Four hooks in [`.kiro/hooks/`](../.kiro/hooks/). Each runs on `PostFileSave` for files that
match its pattern. The hooks started as agent prompts. Each was switched to a command action
when the script it needed existed, so that it stops using agent credits.

| Hook | Watches | Command now | Added | Switched to a command |
|---|---|---|---|---|
| `research-data-check` | `data/cases/`, `data/verification/` | `npm run --silent validate:data` | `6ce6f06` | `09a58c1` |
| `evidence-gate-check` | `src/contract/`, `src/ingest/` | `npm run --silent test:gate` | `6ce6f06` | `09a58c1` |
| `ui-wording-check` | `src/ui/` components, `src/i18n/` | `npm run --silent check:copy` | `6ce6f06` | `b5ddbd9` |
| `publish-guard` | internal research and handover material, environment files | `npm run --silent check:repo` | `6ce6f06` | `69c411f` |

**Status of all four: defined, run not confirmed.** Kiro Crew does not run a project's hooks
(the product owner, and a Kiro Crew notice that a worker chat saw), so the Kiro Crew chats
could not have started them. The scripts behind the four commands were run by hand in the
chats, and the task reports record those runs. No record was found that any hook started in
Kiro IDE: the search covered Kiro IDE's local logs and data, Kiro CLI's local data and part
of the user's `.kiro` folder on the machine used. The newest Kiro IDE log folder there is
dated 2026-11-07, before this repository existed. The check in Kiro IDE is a task for a team
member (D-024) and is described in `docs/HANDOFF.md`. This section is updated when it is
done.

## Kiro Crew

This section records what this project did with Kiro Crew, taken from the Kiro Crew work
ledger, chat history and task reports. They are outside this repository, so only the
commits can be checked here.

**Kiro CLI.** Kiro Crew's documentation says Crew starts `kiro-cli` in ACP mode and drives
it, so the Kiro Crew chats ran through Kiro CLI. `kiro-cli` 3.1.0 is installed on the
machine used. The harness set in this Kiro Crew's configuration today is KAS, described in
the documentation as kiro-cli's v3 engine. Its setting on 2026-11-22 and 2026-11-23 was not
checked. There is no separate record of Kiro IDE or Kiro Web use.

**Phase 1, 2026-11-22 to the morning of 2026-11-23.** One Kiro Crew chat did the work
directly, with no conductor and no worker chats. That covers the repository start
(`6ce6f06`: the license, README and git settings files, and the delivered handoff steering
files and hooks committed as received), then `d22ca5d`, `d942285`, `07c5d35` and `3259f93`,
the change to a GitHub noreply address, the first merge, the README edits (now in `f691a5a`)
and the writing of both design drafts.

**Phase 2, from the next request on 2026-11-23.**
- A conductor chat split each request into tasks and sent each task to its own worker chat.
- Worker chats reported to a work ledger.
- Before the product owner was asked to approve, the conductor re-ran read-only checks:
  remote and local commits, changed files and the pre-push scan.
- The product owner pushed every time personally. No worker pushed.

**Phase 3, 2026-11-24: implementation.** Each top-level task of the two task lists went to
its own worker chat. A worker chat wrote the code and its tests, ran the checks and wrote a
task report. Several reports record a test that was first shown to fail on a deliberate
break and to pass again after the break was reverted. No worker pushed.

Worker-chat rounds that match the history:

| Round | Matching commits and decisions |
|---|---|
| Rebuild of the unpushed local commits on top of the updated public `main` | `6ce6f06` to `f691a5a`, including the merge `a1d30f0`; D-005 |
| `.gitignore` and the checks before the first push | `4cd1887` |
| A worker chat checked and committed the two design drafts, which the single chat had written earlier | `2deea6d` |
| Design decisions D-008 to D-015 | `d0c9d28` |
| News excerpt rule and review verdict format | `7605eb8`, D-016, D-017 |
| The first draft of this file and its two corrections | `aa3ea91`, `d8de120`, `2847448` |
| Deployment, pre-existing work disclosure and order of work | `13ca8e9`, D-018 to D-020 |
| Task lists for the two specs | `ddd986e` |
| Scaffold, contract types, URL and semantic checks, evidence gate, dates, path status, text comparison, regression and property suite (data-contract 1 to 8) | `7a6677e` `a97e5d5` `6f94080` `00e2547` `c765432` `3206054` `1dbac90` `9d960d5` `195b22f` |
| Data tooling: `validate:data` and recheck records, `check:repo`, `check:dist`, the recheck worksheet script, and the hook switches (data-contract 9 to 12) | `09a58c1` `a40635a` `69c411f` `8bf9c6e` `42113c1` |
| Interface strings, layout, connectors, evidence panel, scanner and scan view (scan-screen 1 to 5) | `b5ddbd9` `23b46a8` `d399ae0` `ca92441` `282f410` `982e8db` |
| App shell, sample loading and the "Scan your own bill" form (scan-screen 6 to 8) | `d439b36` `907b4ca` `0d4559b` |
| Deploy runbook (scan-screen 12) | `b1adbb3` `4463b5a` |
| Narrow screens, line label positions and reduced-motion rules (scan-screen 9, partly done; the check by a person is still open) | `174a9ce` |
| Push preparation: README, this file, `docs/HANDOFF.md`, task-list status, decisions D-021 to D-024 | the commits after `174a9ce` |

The pre-push scan is a script kept outside the repository. It checks the working folder and
the history of `main` for secrets, database connection strings, personal data, internal
paths and internal file names.

## Property-based testing

fast-check is a dev dependency (`package.json`). Twelve test files use it, and
`tests/helpers/scanModel.ts` holds a generator they share. Run `git grep -l fast-check --
tests` to list them. The properties come from the designs: for example, one status per path,
no confirmed path on failing evidence, and joining the `equal` and `delete` segments of a
comparison rebuilds the earlier text. They sit in `tests/contract/properties.test.ts`,
`tests/compare/properties.test.ts`, the gate and recheck tests, and several files under
`tests/ui/` (layout, labels, narrow screens, nodes, panel, difference text and forms). This draft does not say whether a property caught a defect
that a unit test did not.

## Team and roles

Contributors are named by GitHub account only, never by real name (D-023), and a
contribution is stated only where a commit, a path or a GitHub record shows it. The display
names that commits carry are not used here.

### seunghow

All commits in the history except two (`2313a53`, `be73511`, see the next account) carry
this account's GitHub noreply address as author and committer. For the commits already on
GitHub, `gh api repos/lifeiscabaret/bill-x-ray/commits/<sha> --jq .author.login` returns
`seunghow`. They were made by Kiro Crew chats on this account's machine, as the Kiro Crew
records described above show.
The repository itself shows only the commit author. The first eight `.kiro` files (the four
hooks and `legal-sources.md`, `project-context.md`, `research-data.md`, `ui-copy.md`) were
committed as received in `6ce6f06`; the repository does not show who wrote them. The work,
by unit:

| Unit | Paths | Commits |
|---|---|---|
| Repository start | `README.md`, `.gitignore`, `.gitattributes`, `LICENSE` (the `LICENSE` conflict was resolved by the merge `a1d30f0`, D-005) | `6ce6f06` `a1d30f0` `f691a5a` `4cd1887` |
| Steering | `.kiro/steering/*.md` | `6ce6f06` `d22ca5d` `d942285` `07c5d35` `3259f93` `7605eb8` `13ca8e9` `b5ddbd9` |
| Specs: requirements | `.kiro/specs/*/requirements.md` | `d942285` `07c5d35` `3259f93` `7605eb8` |
| Specs: designs | `.kiro/specs/data-contract/design.md`, `.kiro/specs/scan-screen/design.md` | `2deea6d` `d0c9d28` `7605eb8` |
| Specs: task lists | `.kiro/specs/data-contract/tasks.md`, `.kiro/specs/scan-screen/tasks.md` | `ddd986e` |
| Hooks, including the switch to command actions | `.kiro/hooks/*.json` | `6ce6f06` `d22ca5d` `7605eb8` `b5ddbd9` `69c411f` `09a58c1` |
| Decisions D-001 to D-024 | `docs/DECISIONS.md` (D-001 to D-004 in `07c5d35`, D-005 to D-007 in `3259f93`, D-008 to D-015 in `d0c9d28`, D-016 and D-017 in `7605eb8`, D-018 to D-020 in `13ca8e9`; D-021 to D-024 in the commit that adds this revision). The file records each decision as approved and names no approver | `07c5d35` `3259f93` `d0c9d28` `7605eb8` `13ca8e9` |
| App code: contract and comparison | `src/contract/`, `src/compare/` | `a97e5d5` `6f94080` `00e2547` `c765432` `3206054` `1dbac90` `09a58c1` `a40635a` `9d960d5` |
| App code: screens and strings | `src/ui/`, `src/i18n/`, `src/main.tsx` | `b5ddbd9` `23b46a8` `d399ae0` `ca92441` `282f410` `982e8db` `d439b36` `907b4ca` `0d4559b` |
| Tests | `tests/contract/`, `tests/compare/`, `tests/ui/`, `tests/scripts/`, `tests/copy/`, `tests/fixtures/`, `tests/helpers/` | the same commits as the code they test, plus `195b22f`, `42113c1`, `69c411f`, `8bf9c6e` |
| Scripts and build setup | `scripts/check-copy.ts` (`b5ddbd9`), `scripts/make-worksheet.ts` (`42113c1`), `scripts/check-repo.ts` (`69c411f`), `scripts/check-dist.ts` (`8bf9c6e`, `d439b36`), `scripts/validate-data.ts` (`09a58c1`), `package.json`, `vite.config.ts`, `tsconfig.json` (`7a6677e` and the commits that added scripts) | see the paths |
| Documents | `docs/KIRO_USAGE.md`, `docs/DEPLOY.md` (`b1adbb3` `4463b5a`), `docs/HANDOFF.md`, the README | see the paths |

### lifeiscabaret

- Owner of the GitHub repository (the `owner.login` field of the repository on GitHub).
- Author of two commits, read from GitHub: `2313a53` ("Initial commit", committed through
  GitHub's web interface) and `be73511` ("docs: update LICENSE copyright holder to Seoul
  Economic Daily").
- GitHub's list of repository events shows a push to `main` by this account on 2026-11-23
  and one by `seunghow` on 2026-11-23. The event payload does not say which commits each
  push carried, so this draft does not attribute commits to a push.
- Nothing else is claimed for this account.

## Not used

- **Custom agents:** not used. No agent definition exists under `.kiro/`.
- **MCP:** not used in this repository. No MCP configuration exists under `.kiro/`.
- **Kiro powers:** not used.
- **Kiro IDE and Kiro Web:** no record of use (see "Agent hooks" and the Kiro Crew section).

## To update

- Whether the four hooks run in Kiro IDE (a team member, D-024; see `docs/HANDOFF.md`).
  Until then each hook is "defined, run not confirmed".
- Which properties caught a defect that a unit test did not.
- A measured comparison of spec-driven and chat-driven work, if one can be made.
