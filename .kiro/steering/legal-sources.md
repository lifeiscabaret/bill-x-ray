---
inclusion: fileMatch
fileMatchPattern: ["**/*adapter*", "**/*ingest*", "**/*source*", "**/*gate*"]
---
# Official legal sources

Use official originals only. Take endpoint paths, parameters and field names from each source's official documentation. Never guess them.

| Country | Sources |
|---|---|
| Korea | 국회 의안정보시스템 and 열린국회정보 Open API (bills), 국가법령정보센터 Open API (statutes, history, articles), 관보 (gazette), government press releases |
| United States | Congress.gov API, GovInfo (bill text, Public Law, US Code, USLM XML), Federal Register (effective dates) |
| Japan | e-Gov 法令API, 衆議院・参議院 議案情報, 国会会議録 search API, 官報 |
| China | 国家法律法规数据库 (flk.npc.gov.cn), 全国人大 official site (decisions, gazette), 中国政府网 policy documents |

## Pitfalls
- Effective dates often sit in supplementary provisions (부칙, 附則) or separate notices, not in the main text.
- Article numbers can change after amendments. Pin every document to its version and date.
- Encoding, traditional and simplified Chinese, and Japanese era dates (令和, 平成) need explicit conversion.
- Unofficial English translations are never evidence.

## Keys and rights
- API keys live in environment variables only. Never commit keys, .env files or sample keys that look real.
- The copyright status of statutes and each source's terms of use come from the B-5 research once it passes review. Until then, store excerpts within the length limits only.
