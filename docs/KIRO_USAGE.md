# How Kiro was used (draft)

*Draft, 2026-11-24. It describes the repository at commit 7605eb8 and rests only on the
files and history in this repository. It is updated as the build starts.*

The Kiroween 2026 [official rules](https://kiroween.devpost.com/rules) ask for a write-up
of how Kiro was used and list the topics below. Each section answers one topic. A topic
that does not apply yet says "not used yet". Nothing here is claimed for something that
was not done.

## State of the project

- No application code exists yet. There is no `src/`, no `tests/`, no `package.json` and no
  running app. The repository holds the product rules, three specs, four hooks, a decision
  log and a README.
- Because no code exists, **no code in this repository was written by chat-driven
  ("vibe") coding, and none was generated from a spec yet.** The comparison below is about
  how the rules and specs themselves were produced.
- The repository does not record which Kiro app (IDE, CLI, Web or Kiro Crew) wrote each
  file. Only the Kiro Crew work is recorded, in the work ledger described below.

## Summary

| Topic the rules ask about | Status in this repository |
|---|---|
| Kiro IDE, CLI, Web, Crew | Kiro Crew: used (see "Kiro Crew"). IDE, CLI, Web: no record, not used yet |
| Custom agents | Not used yet. No agent definition is in the repository |
| Agent hooks | Four hooks defined, not run yet |
| Spec-driven development | Three specs. All have requirements, two have a design, none has tasks yet |
| Steering docs | Seven steering files in use as written rules; two of them wait for source files |
| MCP | Not used yet. No MCP configuration is in the repository |
| Property-based testing | Planned in the specs (fast-check), not used yet |
| Kiro powers | Not used yet |

## Spec-driven development and chat-driven work

### Specs

| Spec | Requirements | Design | Tasks |
|---|---|---|---|
| `data-contract` | 9 requirements | yes | not yet |
| `scan-screen` | 8 requirements | yes | not yet |
| `research-ingest` | 10 requirements | not yet | not yet |

Files: [data-contract](../.kiro/specs/data-contract/), [scan-screen](../.kiro/specs/scan-screen/),
[research-ingest](../.kiro/specs/research-ingest/).

How they are structured:

- Each requirement has a user story and numbered acceptance criteria written as "THE
  system SHALL ...". Designs refer back to requirement numbers (for example "Req 4.3"), so
  a design line can be traced to the criterion it serves.
- The three specs share one data contract. The scan screen and the ingest both read it,
  so a rule changes in one place.
- The designs list correctness properties (for example "one status per path") that are
  meant to become fast-check tests once code exists.

### Order of work, from `git log`

| Commit | Date | What it holds |
|---|---|---|
| `6ce6f06` | 2026-11-22 | Repository start with the first steering files and hooks |
| `d22ca5d` | 2026-11-22 | Steering and hooks aligned with the project's source documents |
| `d942285` | 2026-11-22 | Draft requirements for the three specs |
| `07c5d35` | 2026-11-23 | Decisions D-001 to D-004 applied to steering and requirements |
| `3259f93` | 2026-11-23 | Decisions D-005 to D-007 applied to steering and requirements |
| `a1d30f0` | 2026-11-23 | Merge with the public repository's first commit |
| `4cd1887` | 2026-11-23 | `.gitignore` for internal material |
| `2deea6d` | 2026-11-23 | Draft designs for `data-contract` and `scan-screen` |
| `d0c9d28` | 2026-11-23 | Decisions D-008 to D-015 applied to the designs |
| `7605eb8` | 2026-11-24 | News excerpt rule and review verdict format (D-016, D-017) |

### How this compares with chat-driven work

- **Where a spec was used:** requirements came first, then a design, and each decision
  from the product owner was written into [`DECISIONS.md`](DECISIONS.md) (17 decisions,
  D-001 to D-017) and then applied to the files it affects. Example: commit `7605eb8`
  applied D-016 and D-017 to two hooks, five steering files, five spec files, the README
  and the decision log in one commit, with the decision numbers in the text. D-008 replaced a rule in the
  first design draft, and the design was changed to match (`d0c9d28`).
- **Where work happened without a spec:** the steering files and hooks were first committed
  as a handoff set (`6ce6f06`, `d22ca5d`), before any spec existed. The repository does not
  show how they were written, and chat is not kept in it, so this draft does not call them
  chat-driven.
- **What the repository cannot show:** how long either way took, or how many defects
  either way caused. No code exists to measure, so no claim is made that spec-driven work
  was faster or safer here. That comparison waits for the first code.

## Steering docs

Seven files in [`.kiro/steering/`](../.kiro/steering/):

| File | Inclusion | What it fixes |
|---|---|---|
| `product.md` | always | Scope, users, non-negotiables, decisions not yet made |
| `project-context.md` | always | The two paths (number and clause), the representative cases, evidence logic |
| `research-data.md` | always | Evidence gate, loading gate, review verdicts, dates, wording, excerpt limits |
| `structure.md` | always | Folder layout and what must never be in the repository |
| `tech.md` | always | Stack, rules for pure modules, planned commands |
| `legal-sources.md` | when matching files open | Which sources count as official originals |
| `ui-copy.md` | when matching files open | Record-state wording and what each screen element must show |

The two "when matching files open" files are set to apply to files under `src/`, `scripts/`
or `data/` (`legal-sources.md`) and under `src/ui/` or `src/i18n/` (`ui-copy.md`). No such
files exist yet, so they have not applied. The strategy behind the files: put each rule in
one place, and let specs, hooks and later code point to it. Commit `7605eb8` shows it: one
excerpt rule was changed in the steering file and then carried through specs and hooks.

## Agent hooks

Four hooks in [`.kiro/hooks/`](../.kiro/hooks/). All four run an agent prompt when a
matching file is saved. **All four are defined and have not run yet**: the files they
watch (`src/`, `data/`) do not exist, and the repository holds no record of a run.

| Hook | Watches | Defined to |
|---|---|---|
| `research-data-check` | `data/cases/`, `data/verification/` | Check saved data against the data contract and the research-data rules |
| `evidence-gate-check` | `src/contract/`, `src/ingest/` | Check that no path is shown as confirmed without evidence that passes the gate |
| `ui-wording-check` | `src/ui/`, `src/i18n/` | Flag evaluative words and check that screens can show their evidence |
| `publish-guard` | internal research files, handover files, `.env` files | Warn when internal material or a secrets file would enter the repository |

Each hook states that it is to switch to a command that runs a script once the script
exists, so that it stops using agent credits. None of those scripts exists yet.

## Kiro Crew

This section records what this project did with Kiro Crew, taken from the Kiro Crew work
ledger. The ledger is outside this repository, so only the commits can be checked here.

- A conductor chat split each request into tasks and sent each task to its own worker chat.
- Worker chats reported to a work ledger.
- Before the product owner was asked to approve, the conductor re-ran read-only checks:
  remote and local commits, changed files and the pre-push scan.
- The product owner pushed every time personally. No worker pushed.

Worker-chat rounds that match the history:

| Round | Matching commits and decisions |
|---|---|
| Merge with the public repository's first commit, local commits under a GitHub noreply address | `a1d30f0`, D-005 |
| `.gitignore` for internal material, before the first push | `4cd1887` |
| Two design drafts | `2deea6d` |
| Design decisions D-008 to D-015 | `d0c9d28` |
| News excerpt rule and review verdict format | `7605eb8`, D-016, D-017 |
| This draft | the commit that adds this file |

The pre-push scan is a script kept outside the repository. It checks the working folder and
the history of `main` for secrets, database connection strings, personal data, internal
paths and internal file names.

## Not used yet

- **Custom agents:** none defined in the repository.
- **MCP:** no MCP configuration in the repository.
- **Kiro powers:** none used.
- **Property-based testing:** the data-contract and scan-screen designs and the
  research-ingest requirements list properties, and `tech.md` names fast-check. No test
  exists, so no issue has been caught by it.
- **Kiro IDE, CLI and Web:** no record in the repository.

## To update once code exists

- Which parts were generated from the specs, and how the tasks were split.
- Whether the hooks ran, what they reported and when they changed to commands.
- Which properties caught a defect that a unit test did not.
- A measured comparison of spec-driven and chat-driven work, if one can be made.
