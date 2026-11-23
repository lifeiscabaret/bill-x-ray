---
inclusion: fileMatch
fileMatchPattern: ["src/contract/**", "src/ingest/**", "scripts/**", "data/**"]
---
# Official legal sources

The app never calls these sources at runtime: there is no crawler and no automatic URL
interpretation (work order §3). This list defines what counts as an official original when
people or the research ingest check evidence.

Use official originals only. When a script uses an API, take endpoint paths, parameters
and field names from that source's official documentation. Never guess them.

| Country | Sources |
|---|---|
| Korea | 국회 의안정보시스템 and 열린국회정보 Open API (bills), 국가법령정보센터 Open API (statutes, history, articles), 관보 (gazette), government press releases |
| United States | Congress.gov API, GovInfo (bill text, Public Law, US Code, USLM XML), Federal Register (effective dates) |
| Japan | e-Gov 法令API, 衆議院・参議院 議案情報, 国会会議録 search API, 官報 |
| China | 国家法律法规数据库 (flk.npc.gov.cn), 全国人大 official site (decisions, gazette), 中国政府网 policy documents |

Japan and China appear in the research data; the P0 samples are the US and Korea.

## Pitfalls
- Effective dates often sit in supplementary provisions (부칙, 附則) or separate notices,
  not in the main text.
- Article numbers can change after amendments. Pin every document to its version and date.
- Some official pages show metadata but not the law text (for example GovInfo details
  pages, or 국가법령정보센터 pages with the article text hidden). Link evidence to a page
  that shows the clause, or the excerpt cannot be checked one to one.
- URLs that carry a session token (`;jsessionid=`) may stop working. Record them as they
  are and flag them.
- Encoding, traditional and simplified Chinese, and Japanese era dates (令和, 平成) need
  explicit conversion.
- Unofficial English translations are never evidence.

## Keys and rights
- API keys live in environment variables only. Never commit keys, .env files or sample keys
  that look real.
- The copyright status of statutes and each source's terms of use come from the B-5
  research once it passes review. Until then, store excerpts of these official sources
  within the length limits in `research-data.md` only. News from other outlets carries no
  excerpt (D-016).
