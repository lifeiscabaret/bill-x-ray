---
inclusion: always
---
# Bill X-Ray: domain context

Scope, users and roles are in `product.md`. This file explains the two paths, the
representative cases and the evidence logic.

## Two paths
- **Number path:** a bill number and its document versions (introduced text, committee
  alternative, enrolled bill, public law, statute). The same number can carry a different
  body, and a different number can carry the same content.
- **Clause path:** one piece of policy content followed across documents by clause anchors.

A shared number is not evidence of a clause link. A text difference is not evidence that
no link exists.

## Representative cases (handover §2)
- **US, H.R. 748: same number, different body.** §2 of the 2019 introduced text proposed
  repealing the federal excise tax on high-cost employer health coverage (26 U.S.C. §4980I).
  Under the same number, the 2020 enrolled text became the CARES Act (P.L. 116-136, enacted
  2020-03-27); its opening still carries the old long title, so the title or the number
  alone misleads. The repeal itself came from a separate law, P.L. 116-94 Div. N, Title I,
  §503 (2019-12-20), applying to taxable years beginning after 2019-12-31. Label: "Same
  outcome, separate law". These sources do not establish a direct transfer or legislative
  causation.
- **Korea, Semiconductor Special Act: different number, content partly carried.** Original
  bill 2205453 was discarded when committee alternative 2215103 was adopted; the
  alternative passed the plenary on 2026-01-29. Act No. 21337 was promulgated on 2026-02-10
  and takes effect on 2026-08-11. The original's power and water infrastructure content
  (§15) appears in modified form in the Act's §18. The original's working-hours exception
  for certain R&D staff (§33) is not in that final text. Never write "passed as proposed"
  or "permanently abolished".
- **Follow-up candidates:** the Mobile Device Distribution Act repeal (in effect from
  2025-07-22; eligible users keep the 25% discount under the Telecommunications Business
  Act: "The law died. Did the discount?"); the deposit insurance limit (bill passed
  2024-12-27, KRW 100 million limit applied from 2025-09-01; tests passed versus applied
  dates); the EU common charger (different application dates for devices and laptops; not
  yet verified as an input test case).

## Korean dataset
The Seoul Economic Daily newsroom legislative tracking project is the first Korean dataset
and an entry point for reported promises and events. Facts about bills and clauses rest on
bill records and statute texts, not on the promise data. Overseas cases need no promise
text. Its brand, data/API and article redistribution rights are not cleared, so nothing
from it enters this repository until they are.

## Evidence logic
- The tool computes text differences. People may choose the material and point to
  evidence locations; they never draw lines or results by hand.
- A link to another bill or law is never confirmed from text similarity alone.
- A line is drawn only when it has evidence. It is confirmed only when its evidence passes
  the evidence gate (`research-data.md`). Otherwise it shows its unverified state and what
  is still needed.
- A same outcome reached through a separate law and an official transfer are different
  kinds of line and look different.
- Dates keep their kind (event, document publication, promulgation, effect, application)
  and are never estimated from one another.
- Control cases (no gap) stay in the data, so the tool does not look as if it only finds
  problems.

## Out of scope
Scoring politicians, parties or bills. Evaluative words. Translations as evidence.
