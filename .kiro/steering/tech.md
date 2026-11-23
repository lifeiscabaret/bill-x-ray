---
inclusion: always
---

# Technology

Proposed on 2026-11-22 for the mockup build. Change the stack here, not ad hoc in code.

| Layer | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript (strict), a static single-page app | No server is needed: no login, no runtime LLM, no live-site integration |
| Data contract | TypeScript types and a zod schema in `src/contract/` | One definition for the form, JSON import, renderer and ingest; parse errors carry JSON paths |
| Text comparison | `diff` (jsdiff) | Insertions, deletions and changes between versions without writing our own diff |
| Tests | Vitest, fast-check (property-based), Testing Library with jsdom | `npm test` runs offline in one command |
| Scripts | `tsx` | Ingest and check scripts in TypeScript, sharing the contract module |
| Styling | Plain CSS with custom properties | The work order rules out a separate design system |
| UI text | JSON dictionaries in `src/i18n/` (`en.json` by default; `ko.json` is P1) | No i18n framework; one place for the wording check |

## Rules
- `src/contract/`, `src/compare/` and `src/ingest/` are pure TypeScript with no DOM or Node
  imports, so the app, the scripts and the tests run the same code. File access lives in
  `scripts/` only.
- No runtime network requests except source links the user opens. No analytics, and no
  fonts or scripts from CDNs.
- Bind the dev server to 127.0.0.1 explicitly.
- The research directory is read from `--research <dir>` or `BILLXRAY_RESEARCH_DIR` and must
  be outside this repository.
- Never commit secrets, `.env*` files or sample keys that look real.
- Do not add a dependency for something a 30-line function does.
- `check:copy` parses TSX with the TypeScript 5 compiler API through the dev-only alias
  `typescript5`, because TypeScript 7 ships no JavaScript API. The build and type check stay
  on TypeScript 7, and the build calls TypeScript 7's compiler by path, because the
  `typescript5` alias also installs a `tsc` command.
- Node 22 LTS.

## Commands (planned; each exists once its task lands)
- `npm run dev`: the app on http://127.0.0.1:4748
- `npm test`: unit and property-based tests, offline
- `npm run validate:data`: checks `data/cases/` and `data/verification/` against the contract (hook target)
- `npm run check:copy`: wording check for `src/ui/` and `src/i18n/` (hook target)
- `npm run check:repo`: internal material, `.env*` files and `.gitignore` lines that would hide `.kiro` (hook target)
- `npm run check:dist`: checks `dist/` before an upload; fails on any excerpt from another outlet's news (D-016), a secret, an internal material name, an analytics beacon such as `beacon.min.js` or `cloudflareinsights`, or a script or font from a CDN
- `npm run ingest -- --research <dir>`: research ingest; writes `data/cases/`, `docs/load-report.md` and `docs/DECISIONS.md`. Deferred until the app runs (D-020); demo cases go into `data/` directly
- `npm run build`: static build into `dist/`

## Deployment (D-018)
Only `dist/` goes online, uploaded by a person to the company's Cloudflare account at its
default address, with no domain bought. Agents never sign up or deploy. After each
deployment, check that the live HTML has no `beacon.min.js` or `cloudflareinsights`; if it
does, turn Web Analytics off. The site stays up until 2027-02-04 KST.

## Hooks
Hooks start as agent prompts. When the script a hook needs exists, switch that hook to a
`command` action so it stops spending Kiro credits. Each switch is a task in the specs.
