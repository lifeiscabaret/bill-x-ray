---
inclusion: always
---
# Research data rules (Bill X-Ray)

These rules apply to any code or data that touches cases, legal documents, evidence and verdicts.

## Source of truth
- Research arrives as JSON Lines in an exchange format: one object per line, each with `type` and `id` (for example `B3a-EVI-0001`). Types: case, document, evidence, legal_event, legal_relation, pattern, api_source, source, conflict, open_item.
- The exchange format is an intermediate contract. Map it to CasePack through one mapping module. Never hand-edit loaded data.
- Raw research reports and review packets stay outside this repository. Only rows that pass the loading gate are committed.

## Evidence gate
- A verdict passes only when the official URL in the original language, the clause anchor and the original-language excerpt match one to one, and the evidence row has `verified_opened: true`.
- A translation is never evidence. Keep translations only as display text next to the original.
- Clauses extracted by AI are candidates until the gate passes.

## Loading gate (first load)
Load a row only if all three hold:
1. Its cited sources and evidence have `verified_opened: true`.
2. For cases, `confidence` is `high` or `medium`.
3. Cross-review classified the row as "load as is".
Rows that fail stay out and are listed in the load report with the reason. Any change to this gate is recorded in `docs/DECISIONS.md`.

## Facts, dates and wording
- Never invent bill numbers, law numbers, URLs or dates. Unknown values stay `unknown` or `null` and render as "확인 불가".
- Every date carries a kind: announced, passed, promulgated, effective, applied, repealed, postponed, unknown. Never merge kinds into one date.
- Describe record states only, such as "최종 조문에 없음", "시행일 미정" or "부대의견으로 계속 논의". Do not use evaluative words such as "약속 파기", "거짓말", "실패" or "꼼수".
- Keep control cases (no gap) in the dataset. The tool must not look as if it only finds problems.
- `case.domain` uses the 12 Korean field names. Map English codes when loading: welfare_pension → 복지·연금, health → 보건·의료, education → 교육, environment_climate → 환경·기후, transport_safety → 교통·안전, digital_ai_privacy → 디지털·AI·개인정보.

## URLs and quotes
- Some research URLs contain look-alike characters: `∶` (U+2236) for `:` and `·` (U+00B7) for `.`. Normalize URL fields (url, official_url, base_url) only, and log every change.
- Treat `null`, empty and `"unknown"` URLs as missing.
- Excerpts stay within 200 characters for news and 300 for official documents.

## Records
- Each load decision is one line in `docs/DECISIONS.md`. Sources go to the Bill X-Ray source ledger.
