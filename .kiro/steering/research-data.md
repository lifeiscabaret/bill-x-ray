---
inclusion: always
---
# Research data rules (Bill X-Ray)

These rules apply to any code or data that touches cases, legal documents, evidence and
path statuses.

## Source of truth
- Research arrives as JSON Lines in an exchange format: one object per line, each with
  `type` and `id` (for example `B3a-EVI-0001`). Types: case, document, evidence,
  legal_event, legal_relation, pattern, api_source, source, conflict, open_item.
- The exchange format is an intermediate format. Map it to the data contract (work order
  §4: Case, DocumentVersion, Evidence, LegislativeEvent and Path; see
  `.kiro/specs/data-contract/`) through one mapping module in `src/ingest/`. Never
  hand-edit loaded data.
- Raw research reports, review packets and the research verification ledgers stay outside
  this repository. Only rows that pass the loading gate are committed.

## Evidence gate
- A path is confirmed only when the official URL in the original language, the clause
  anchor and the original-language excerpt match one to one, and the evidence was opened
  and checked: the research verification ledger records the excerpt word for word on the
  linked page (일치). The research row's own `verified_opened` value is not used (D-001).
- Every evidence row a demo case relies on is opened and checked once more by a person on
  the official source, because excerpts longer than 125 characters were matched on the
  verification tool's judgement (D-001).
- A translation is never evidence. Keep translations only as display text next to the
  original, labelled as a translation.
- Clauses and links proposed by research, including AI-assisted research, are candidates
  until the gate passes.

## Loading gate (first load)
Load a row only if all three hold:
1. Its cited sources opened and its evidence matched, according to the verification
   ledger (D-001).
2. For cases, `confidence` is `high` or `medium`.
3. Cross-review classified the row as "load as is". For the 19 gold (demo) cases only, a
   team recheck stands in for cross-review when the person who rechecks and the person who
   confirms are different and both open the official URL; `data/verification/` records
   who (role A or B), when, the URL and the result (D-002, D-006). For B3a-CASE-0001, which
   has no matched research row, a row confirmed this way counts as matched under D-001; if
   it cannot be confirmed, the case leaves the demo and the gate stays as it is (D-006).

Rows that fail stay out and are listed in the load report with the reason. Any change to
this gate is recorded in `docs/DECISIONS.md`.

## Facts, dates and wording
- Never invent bill numbers, law numbers, URLs or dates. Unknown values stay `null` (or
  `unknown` in the exchange format) and render as "Not verified" in English and "확인 불가"
  in Korean.
- Every date carries a kind, for example introduced, passed, promulgated, published,
  effective, applied, repealed, postponed or unknown (the full list is in the data-contract
  spec). Never merge kinds into one date and never compute one kind from another.
- Describe record states only, such as "Not in the final text" (최종 조문에 없음),
  "Effective date not set" (시행일 미정) or "Left for further committee discussion"
  (부대의견으로 계속 논의). Do not use evaluative words such as "broken promise", "lie",
  "failure", "trick", "약속 파기", "거짓말", "실패" or "꼼수".
- Keep control cases (no gap) in the dataset. The tool must not look as if it only finds
  problems.
- `case.domain` in research rows uses the 12 Korean field names. Map English codes when
  loading: welfare_pension → 복지·연금, health → 보건·의료, education → 교육,
  environment_climate → 환경·기후, transport_safety → 교통·안전, digital_ai_privacy →
  디지털·AI·개인정보.

## URLs and quotes
- Some research URLs contain look-alike characters: `∶` (U+2236) for `:` and `·` (U+00B7)
  for `.`. Normalize URL fields (url, official_url, base_url) only, and log every change.
- Treat `null`, empty and `"unknown"` URLs as missing.
- Excerpts stay within 200 characters for news and 300 for official documents.

## Records
- Each gate or load decision is one line in `docs/DECISIONS.md`. Each ingest run lists its
  sources, exclusions and reasons in `docs/load-report.md`.
