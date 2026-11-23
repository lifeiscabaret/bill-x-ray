// Recheck worksheets for the 19 demo cases (data-contract 12; D-002, D-003, D-006, D-020).
//
// shortcut: a one-off helper, not the ingest (the ingest is postponed, D-020). It reads the
// research rows (read only), writes one worksheet per demo case into a folder outside this
// repository, and never imports from src/. Upgrade to the ingest's modules when they exist.
//
// Usage: npx tsx scripts/make-worksheet.ts --research <dir> --out <dir>
//   --research can also come from BILLXRAY_RESEARCH_DIR. Both folders must be outside the repo.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type Row = Record<string, unknown>;

/** The 19 cases of D-002 (18 gold cases) and D-006 (the Semiconductor Special Act). Demo cases first. */
export const DEMO_CASES: readonly string[] = [
  "B4-CASE-0001",
  "B3a-CASE-0001",
  "B4-CASE-0002",
  "B4-CASE-0003",
  "B4-CASE-0004",
  "B4-CASE-0005",
  "B4-CASE-0006",
  "B4-CASE-0007",
  "B3a-CASE-0002",
  "B3a-CASE-0003",
  "B3a-CASE-0004",
  "B3a-CASE-0006",
  "B3a-CASE-0009",
  "B3b-CASE-0011",
  "B3b-CASE-0012",
  "B3b-CASE-0013",
  "B3b-CASE-0014",
  "B3b-CASE-0015",
  "B3b-CASE-0017",
];

const EXCERPT_LIMIT = 300; // legal originals (research-data.md)
const LEDGER_FILE = "열람확인.jsonl";
const OFFICIAL_KINDS = new Set(["official_release", "official_law", "official_bill", "official_notice", "court"]);
const OFFICIAL_HOST = /(\.gov|\.gov\.cn|\.gov\.uk|\.go\.kr|\.go\.jp|\.europa\.eu)$/;

// ---------------------------------------------------------------------------
// Paths: nothing is read from or written into this repository.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Resolve symlinks of the nearest existing ancestor, so a link cannot hide a path inside the repo. */
function realish(p: string): string {
  let cur = resolve(p);
  const tail: string[] = [];
  while (!existsSync(cur)) {
    const up = dirname(cur);
    if (up === cur) break;
    tail.unshift(basename(cur));
    cur = up;
  }
  return join(realpathSync(cur), ...tail);
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(realish(parent), realish(child));
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}

export function assertOutsideRepo(label: string, path: string, repoRoot: string = REPO_ROOT): void {
  if (isInside(repoRoot, path)) throw new Error(`${label} is inside the repository: refused`);
}

// ---------------------------------------------------------------------------
// Reading the research rows (file access lives here and in main only).
// ---------------------------------------------------------------------------

export interface Research {
  byId: Map<string, Row>;
  byType: Map<string, Row[]>;
  ledger: Map<string, Row>;
  conflicts: string[];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function parseJsonl(text: string, label: string): Row[] {
  const rows: Row[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === "") return;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      throw new Error(`${label}:${i + 1}: not valid JSON`);
    }
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${label}:${i + 1}: not an object`);
    const row = v as Row;
    if (str(row.id) === "" || str(row.type) === "") throw new Error(`${label}:${i + 1}: row has no id or type`);
    rows.push(row);
  });
  return rows;
}

const subdirs = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
    : [];

export function readResearch(dir: string): Research {
  const res: Research = { byId: new Map(), byType: new Map(), ledger: new Map(), conflicts: [] };
  const rowsDir = join(dir, "jsonl");
  for (const mod of subdirs(rowsDir)) {
    for (const f of readdirSync(join(rowsDir, mod)).filter((n) => n.endsWith(".jsonl")).sort()) {
      for (const row of parseJsonl(readFileSync(join(rowsDir, mod, f), "utf8"), `${mod}/${f}`)) {
        const id = str(row.id);
        const seen = res.byId.get(id);
        if (seen) {
          // B3R and B4R repeat rows of other folders: one copy counts (research-ingest 6.1).
          if (JSON.stringify(seen) !== JSON.stringify(row)) res.conflicts.push(id);
          continue;
        }
        res.byId.set(id, row);
        const t = str(row.type);
        res.byType.set(t, [...(res.byType.get(t) ?? []), row]);
      }
    }
  }
  const ledgerDir = join(dir, "verify");
  for (const mod of subdirs(ledgerDir)) {
    const f = join(ledgerDir, mod, LEDGER_FILE);
    if (!existsSync(f)) continue;
    for (const row of parseJsonl(readFileSync(f, "utf8"), `${mod}/${LEDGER_FILE}`)) {
      if (!res.ledger.has(str(row.id))) res.ledger.set(str(row.id), row);
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export interface UrlInfo {
  url: string | null;
  changed: boolean;
}

/** Look-alike characters only (research-data.md): U+2236 for ":" and U+00B7 for ".". */
export function normalizeUrl(raw: unknown): UrlInfo {
  const s = str(raw).trim();
  if (s === "" || /^(unknown|null)$/i.test(s)) return { url: null, changed: false };
  const url = s.replace(/\u2236/g, ":").replace(/\u00b7/g, ".");
  return { url, changed: url !== s };
}

const hasToken = (url: string): boolean => /;jsessionid=/i.test(url);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Worksheet model
// ---------------------------------------------------------------------------

type PageClass = "official" | "news" | "non-official" | "unclassified" | "no URL";

interface Item {
  label: string; // R01, X1, N1
  kind: "research" | "extra" | "no-row";
  title: string;
  ids: string[]; // research ids, as written in the rows
  url: string | null;
  urlNote: string | null; // "candidate, ..." for extras
  cls: PageClass | null;
  anchor: string;
  excerptLine: string | null;
  ledger: string | null;
  notes: string[];
  usedBy: string[];
}

export interface Summary {
  caseId: string;
  file: string;
  officialRows: number;
  newsOrNoUrlRows: number;
  noResearchRows: number;
  hard: string[];
}

interface Extra {
  label: string;
  docIds: string[]; // research documents this item is about
  candidateDocs: string[]; // documents whose URL the research already names
  note: string;
}

// Rows with no research row (tasks.md 12.3). Candidate URLs only where a research row names them.
const EXTRAS: Record<string, Extra[]> = {
  "B4-CASE-0001": [
    {
      label: "Short title in section 1 of the enrolled text (BILLS-116hr748enr)",
      docIds: [],
      candidateDocs: [],
      note: "D-003. No research row exists and no research row names a URL for the enrolled text.",
    },
    {
      label: "P.L. 116-94, Division N, Title I, section 503 (PLAW-116publ94)",
      docIds: [],
      candidateDocs: ["B4R-DOC-0004"],
      note: "D-003. The research has a row for section 503(a) on this page, but the page showed no law text there. Use a page that shows the clause.",
    },
  ],
  "B3a-CASE-0001": [
    {
      label: "Original bill: clause rows",
      docIds: ["B3a-DOC-0001"],
      candidateDocs: ["B3a-DOC-0001"],
      note: "D-006. The research row quotes an official summary of the main contents, not the clauses. Read the clauses in the bill record.",
    },
    {
      label: "Committee alternative: no official URL in the research",
      docIds: ["B3a-DOC-0002"],
      candidateDocs: [],
      note: "D-006. Find the official bill record and record each clause you read.",
    },
    {
      label: "Working-hours exception for certain R&D staff (original bill)",
      docIds: [],
      candidateDocs: ["B3a-DOC-0001"],
      note: "D-006. Record the clause in the original, and in the Act's text record where that clause is not found. Say what you read; do not fill it in.",
    },
    {
      label: "Text page of the Act",
      docIds: ["B3a-DOC-0003"],
      candidateDocs: [],
      note: "D-006. The page the research opened shows the title but not the articles. Find a page that shows the articles.",
    },
  ],
};

function ledgerWord(l: Row | undefined): string {
  if (!l) return "not in ledger";
  const result = str(l.result);
  if (result === "열지 못함" || result === "URL 없음") return "could not open";
  switch (str(l.excerpt_match)) {
    case "일치":
      return "matched";
    case "부분":
      return "partial";
    case "불일치":
      return "mismatch";
    case "확인 불가":
      return "could not confirm";
    default:
      return "not in ledger";
  }
}

const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });
const chars = (s: string): number => Array.from(s).length;
const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

const SRC_ID = /\b[A-Za-z0-9]+-SRC-\d{4}\b/g;

export function buildWorksheets(
  res: Research,
  caseIds: readonly string[] = DEMO_CASES,
): { files: Map<string, string>; summaries: Summary[] } {
  const of = (t: string): Row[] => res.byType.get(t) ?? [];
  const docs = of("document");
  const docById = new Map(docs.map((d) => [str(d.id), d]));

  // A row marked "supersedes <id>" (or "replaces <id>") takes the place of the row it names.
  const replacedBy = new Map<string, string>();
  for (const d of docs) {
    for (const field of [d.format_notes, d.notes]) {
      const m = /\b(?:supersedes|replaces)\s+([A-Za-z0-9]+-DOC-\d{4})/.exec(str(field));
      if (m && m[1]) replacedBy.set(m[1], str(d.id));
    }
  }
  // B3R and B4R also re-issue some documents under a new id with the same content: one copy counts,
  // preferably the one an evidence row points to.
  const citedDocs = new Set(of("evidence").map((e) => str(e.document_id)));
  const sameDoc = new Map<string, string[]>();
  for (const d of docs) {
    const key = [d.case_id, d.identifier, d.stage_common, d.date, normalizeUrl(d.official_url).url].join("\u0001");
    sameDoc.set(key, [...(sameDoc.get(key) ?? []), str(d.id)]);
  }
  const canon = new Map<string, string>();
  for (const ids of sameDoc.values()) {
    const best = [...ids].sort((a, b) => Number(citedDocs.has(b)) - Number(citedDocs.has(a)) || natural(a, b))[0] as string;
    for (const id of ids) canon.set(id, best);
  }
  const resolveDoc = (id: string): string => {
    let cur = id;
    for (let i = 0; i < 10 && replacedBy.has(cur); i++) cur = replacedBy.get(cur) as string;
    return canon.get(cur) ?? cur;
  };

  // Source rows by normalized URL, to tell official pages from news.
  const sourcesByUrl = new Map<string, Row[]>();
  for (const s of of("source")) {
    const u = normalizeUrl(s.url).url;
    if (u) sourcesByUrl.set(u, [...(sourcesByUrl.get(u) ?? []), s]);
  }
  const kindOf = (id: string): string => str(res.byId.get(id)?.kind);

  const classify = (url: string | null, cited: string[]): { cls: PageClass; sourceIds: string[] } => {
    if (!url) return { cls: "no URL", sourceIds: [] };
    const matched = sourcesByUrl.get(url) ?? [];
    const kinds = [...matched.map((s) => str(s.kind)), ...cited.map(kindOf)];
    const sourceIds = matched.map((s) => str(s.id)).sort(natural);
    if (kinds.some((k) => k.startsWith("news"))) return { cls: "news", sourceIds };
    if (matched.some((s) => OFFICIAL_KINDS.has(str(s.kind)))) return { cls: "official", sourceIds };
    if (OFFICIAL_HOST.test(hostOf(url))) return { cls: "official", sourceIds };
    return { cls: matched.length > 0 ? "non-official" : "unclassified", sourceIds };
  };

  const files = new Map<string, string>();
  const summaries: Summary[] = [];

  for (const caseId of caseIds) {
    const caseRow = res.byId.get(caseId);
    const events = of("legal_event").filter((e, i, all) => {
      if (str(e.case_id) !== caseId) return false;
      const key = (x: Row): string => [x.case_id, x.event_type, x.date, resolveDoc(str(x.document_id))].join("\u0001");
      return all.findIndex((o) => key(o) === key(e)) === i; // a repeated event counts once
    });
    const relations = of("legal_relation").filter((r) => str(r.case_id) === caseId);
    const listed = new Set<string>();
    for (const r of [...events, ...relations]) {
      if (Array.isArray(r.evidence_ids)) r.evidence_ids.forEach((x) => listed.add(String(x)));
    }
    const usedBy = (evId: string): string[] => [
      ...relations
        .filter((r) => Array.isArray(r.evidence_ids) && r.evidence_ids.includes(evId))
        .map((r) => `${str(r.id)} (${str(r.relation_type)})`),
      ...events
        .filter((e) => Array.isArray(e.evidence_ids) && e.evidence_ids.includes(evId))
        .map((e) => `${str(e.id)} (${str(e.event_type)} ${str(e.date)})`),
    ];

    // Evidence rows of this case, each once. Rows that say the same thing on the same
    // (replacement) document are merged, keeping the row that sits on that document itself.
    const mine = of("evidence").filter((e) => {
      const d = docById.get(resolveDoc(str(e.document_id)));
      return (d && str(d.case_id) === caseId) || listed.has(str(e.id));
    });
    const groups = new Map<string, Row[]>();
    for (const e of mine) {
      const key = [resolveDoc(str(e.document_id)), str(e.clause_anchor), str(e.excerpt_original)].join("\u0001");
      groups.set(key, [...(groups.get(key) ?? []), e]);
    }

    const urlChanges: string[] = [];
    const noteUrl = (docId: string, raw: unknown, info: UrlInfo): void => {
      if (info.changed) urlChanges.push(`${docId} official_url: ${str(raw)} -> ${info.url}`);
    };
    const seenChange = new Set<string>();
    const logChange = (docId: string, raw: unknown, info: UrlInfo): void => {
      if (seenChange.has(docId)) return;
      seenChange.add(docId);
      noteUrl(docId, raw, info);
    };

    const items: Item[] = [];
    const evidenceDocs = new Set<string>();
    const sorted = [...groups.values()].sort((a, b) => natural(str(a[0]?.id), str(b[0]?.id)));
    for (const members of sorted) {
      const first = members[0] as Row;
      const docId = resolveDoc(str(first.document_id));
      const primary = members.find((m) => str(m.document_id) === docId) ?? first;
      const doc = docById.get(docId);
      evidenceDocs.add(docId);
      const info = normalizeUrl(doc?.official_url);
      if (doc) logChange(docId, doc.official_url, info);
      const cited = [...new Set(members.flatMap((m) => [...str(m.notes).matchAll(SRC_ID)].map((x) => x[0])))];
      const { cls, sourceIds } = classify(info.url, cited);
      const ledger = ledgerWord(res.ledger.get(str(primary.id)));
      const excerpt = str(primary.excerpt_original);
      const ids = [
        `evidence ${[str(primary.id), ...members.filter((m) => m !== primary).map((m) => str(m.id))].join(" = ")}`,
        `document ${docId}${docId !== str(first.document_id) ? ` (stands in for ${str(first.document_id)})` : ""}`,
        `source ${sourceIds.length ? sourceIds.join(", ") : "none matches this URL"}`,
      ];
      const notes: string[] = [];
      if (info.changed) notes.push("The URL had look-alike characters. They were normalized and the change is logged at the end.");
      if (info.url && hasToken(info.url)) notes.push("The URL carries a session token (;jsessionid=). It may stop working. Record the URL as you opened it.");
      if (cls === "news") notes.push("This row rests on news. No excerpt is printed. Find the clause on an official page.");
      if (cls === "non-official" || cls === "unclassified") notes.push("The research page is not shown to be an official original. No excerpt is printed. Find the official page.");
      if (cls === "no URL") notes.push("The research has no official URL for this row. Find the official page yourself. No URL is guessed here.");
      for (const c of cited) {
        const k = kindOf(c);
        if (k !== "" && !OFFICIAL_KINDS.has(k) && !k.startsWith("news")) {
          notes.push(`The research note says the excerpt came from ${c} (kind ${k}), not from the official page. Check it on the official page.`);
        }
      }
      if (ledger === "could not confirm") notes.push("The research opened the page but could not find the excerpt on it. The page may show metadata only.");
      if (ledger === "could not open") notes.push("The research could not open this page. Try it yourself and record what happens.");
      const dcase = str(doc?.case_id);
      if (dcase !== "" && dcase !== caseId) notes.push(`The document belongs to ${dcase}; this case uses the row through a path or date.`);
      let excerptLine: string | null;
      if (excerpt === "") excerptLine = "The research has no excerpt for this row.";
      else if (cls === "news" || cls === "non-official" || cls === "unclassified") excerptLine = "No excerpt is printed for this page.";
      else if (chars(excerpt) > EXCERPT_LIMIT) {
        excerptLine = `The research excerpt is ${chars(excerpt)} characters, longer than ${EXCERPT_LIMIT}. Copy the span you check, as the page writes it (${EXCERPT_LIMIT} characters at most).`;
      } else excerptLine = `> ${oneLine(excerpt)}`;
      items.push({
        label: `R${String(items.length + 1).padStart(2, "0")}`,
        kind: "research",
        title: str(primary.id),
        ids,
        url: info.url,
        urlNote: null,
        cls,
        anchor: str(primary.clause_anchor),
        excerptLine,
        ledger,
        notes,
        usedBy: members.flatMap((m) => usedBy(str(m.id))),
      });
    }

    // Rows with no research row: fixed items of tasks.md 12.3, then documents that have no evidence row.
    const extras = EXTRAS[caseId] ?? [];
    const extraDocs = new Set(extras.flatMap((x) => x.docIds));
    extras.forEach((x, i) => {
      const cand = x.candidateDocs.map((id) => ({ id, info: normalizeUrl(docById.get(resolveDoc(id))?.official_url) })).find((c) => c.info.url);
      const notes = [x.note];
      for (const id of x.docIds) {
        const doc = docById.get(resolveDoc(id));
        if (doc) logChange(resolveDoc(id), doc.official_url, normalizeUrl(doc.official_url));
      }
      if (cand) logChange(resolveDoc(cand.id), docById.get(resolveDoc(cand.id))?.official_url, cand.info);
      const seenPage = x.docIds.map((id) => normalizeUrl(docById.get(resolveDoc(id))?.official_url).url).find((u) => u);
      if (!cand && seenPage) notes.push(`The page the research opened (not a candidate): ${seenPage}`);
      items.push({
        label: `X${i + 1}`,
        kind: "extra",
        title: x.label,
        ids: x.docIds.length ? [`document ${x.docIds.map(resolveDoc).join(", ")}`] : ["no research row"],
        url: cand?.info.url ?? null,
        urlNote: cand ? `candidate from ${resolveDoc(cand.id)}, the person records the URL actually opened` : null,
        cls: null,
        anchor: "",
        excerptLine: null,
        ledger: null,
        notes,
        usedBy: [],
      });
    });
    const caseDocs = docs.filter((d) => str(d.case_id) === caseId && resolveDoc(str(d.id)) === str(d.id));
    for (const d of caseDocs) {
      const id = str(d.id);
      if (evidenceDocs.has(id) || extraDocs.has(id)) continue;
      const info = normalizeUrl(d.official_url);
      logChange(id, d.official_url, info);
      items.push({
        label: `N${items.filter((x) => x.kind === "no-row").length + 1}`,
        kind: "no-row",
        title: `${str(d.identifier)} (${str(d.stage_common)})`,
        ids: [`document ${id}`],
        url: info.url,
        urlNote: info.url ? "from the research document row, the person records the URL actually opened" : null,
        cls: null,
        anchor: "",
        excerptLine: null,
        ledger: null,
        notes: [info.url ? "The research has a document row but no evidence row for it." : "The research has a document row but no official URL and no evidence row for it."],
        usedBy: [],
      });
    }

    const research = items.filter((i) => i.kind === "research");
    const summary: Summary = {
      caseId,
      file: `recheck-${caseId}.md`,
      officialRows: research.filter((i) => i.cls === "official").length,
      newsOrNoUrlRows: research.filter((i) => i.cls !== "official").length,
      noResearchRows: items.length - research.length,
      hard: research
        .filter((i) => i.cls === "official" && (i.ledger === "could not confirm" || i.ledger === "could not open"))
        .map((i) => `${i.title}: ${i.ledger}`),
    };
    summaries.push(summary);
    files.set(summary.file, renderCase(caseId, caseRow, items, summary, events, res, urlChanges));
  }
  return { files, summaries };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const HOW_TO = `## How to record

Two people check each row against the official page. Roles are A and B. Write roles, never names.

1. Role A opens the official URL and fills part 1: the page's own wording of the anchor and the excerpt, the URL actually opened, the date and the result.
2. A different person (role B) opens the same URL without looking at part 1 and fills part 2.
3. Result words: \`matched\`, \`partial\`, \`mismatch\`, \`could_not_open\`, \`not_found\`.
   - \`matched\`: the excerpt is on the page word for word.
   - \`partial\`: part of it is there, or the wording differs.
   - \`mismatch\`: the page shows that clause with different words.
   - \`could_not_open\`: the page does not open.
   - \`not_found\`: the page opens but does not show the clause.
4. If a page does not open or does not show the clause, record that. Do not fill it in.
5. Use a page that shows the clause text. A page that shows only metadata cannot be matched.
6. Copy excerpts exactly as the page writes them, 300 characters at most. No news text, anywhere.
7. Every date carries its kind (introduced, passed, promulgated, effective, applied, and so on). Never work one date out from another.
8. The "research ledger" word on each row is what the research tool saw. It is a hint, not a result: open the page yourself.

The agent later writes the verification record from the signed worksheet in this shape:

\`\`\`json
{
  "recheckId": "",
  "caseId": "",
  "target": { "researchId": "", "evidenceId": "" },
  "sourceUrl": "",
  "anchor": "",
  "excerpt": "",
  "result": "matched",
  "checkedBy": "A",
  "checkedAt": "YYYY-MM-DD",
  "confirm": { "by": "B", "at": "YYYY-MM-DD", "url": "", "result": "matched" },
  "note": null
}
\`\`\`
`;

const part1Form = (): string[] => [
  "Part 1 (role A):",
  "- Role: ",
  "- Date (YYYY-MM-DD): ",
  "- URL opened: ",
  "- Result: ",
  "- Anchor as written: ",
  "- Excerpt as written (300 characters at most): ",
];

const part2Form = (): string[] => ["- Role: ", "- Date (YYYY-MM-DD): ", "- URL opened: ", "- Result: "];

function renderItem(it: Item): string[] {
  const out = [`### ${it.label}  ${it.title}`, ""];
  out.push(`- Research ids: ${it.ids.join(" · ")}`);
  if (it.cls) out.push(`- Page kind: ${it.cls}`);
  if (it.url) out.push(`- URL${it.urlNote ? ` (${it.urlNote})` : ""}: ${it.url}`);
  else out.push("- URL: none in the research");
  if (it.kind === "research") out.push(`- Clause anchor (research): ${it.anchor === "" ? "none" : oneLine(it.anchor)}`);
  if (it.excerptLine !== null) {
    const quoted = it.excerptLine.startsWith(">");
    out.push(`- Excerpt (research): ${quoted ? "" : it.excerptLine}`.trimEnd());
    if (quoted) out.push("", it.excerptLine, "");
  }
  if (it.ledger) out.push(`- Research ledger: ${it.ledger}`);
  if (it.usedBy.length) out.push(`- Used by: ${[...new Set(it.usedBy)].join("; ")}`);
  for (const n of it.notes) out.push(`- Note: ${n}`);
  out.push("", ...part1Form(), "");
  return out;
}

function renderCase(
  caseId: string,
  caseRow: Row | undefined,
  items: Item[],
  s: Summary,
  events: Row[],
  res: Research,
  urlChanges: string[],
): string {
  const out: string[] = [];
  out.push(`# Recheck worksheet: ${caseId}`, "");
  if (caseRow) {
    out.push(`${str(caseRow.title_en)} (${str(caseRow.title_local)}) · jurisdiction ${str(caseRow.jurisdiction)}`);
  } else out.push("The case row was not found in the research. Only the fixed items below are listed.");
  out.push(
    "",
    "Private: this file carries research ledger results. Never commit it and never copy it into the repository.",
    "",
    HOW_TO,
    "## This case",
    "",
    `- Evidence rows on an official page: ${s.officialRows}`,
    `- Evidence rows on news, a non-official page or no URL: ${s.newsOrNoUrlRows}`,
    `- No research row (listed below): ${s.noResearchRows}`,
    "",
  );

  const pages = new Map<string, string[]>();
  for (const it of items) if (it.url) pages.set(it.url, [...(pages.get(it.url) ?? []), it.label]);
  if (pages.size) {
    out.push("## Pages to open", "", "Open each page once and fill every row that points to it.", "");
    for (const [u, labels] of pages) out.push(`- ${u}  (${labels.join(", ")})`);
    out.push("");
  }

  const section = (title: string, list: Item[], intro: string): void => {
    if (!list.length) return;
    out.push(`## ${title}`, "", intro, "");
    for (const it of list) out.push(...renderItem(it));
  };
  const research = items.filter((i) => i.kind === "research");
  section("Part 1: evidence rows on official pages", research.filter((i) => i.cls === "official"), "Role A. One block per research evidence row.");
  section(
    "Part 1: rows on news, non-official pages or with no URL",
    research.filter((i) => i.cls !== "official"),
    "Role A. These rows cannot be rechecked from the research URL. Find the official page, record the URL you opened, and write what you find.",
  );
  section("Part 1: no research row", items.filter((i) => i.kind !== "research"), 'Role A. Marked "no research row": the research has nothing to compare, so record what the official page shows.');

  out.push("## Dates to read from the official record", "");
  out.push("Record the date the official page shows and the kind it gives. Keep every kind separate. Compute nothing from another date.", "");
  if (caseId === "B3a-CASE-0001") {
    const d = (kind: string): string => str(events.find((e) => str(e.event_type) === kind)?.date) || "unknown";
    out.push(
      `The research carries two dates for the discarded original bill: ${d("discarded_into_alternative")} (also the committee note date, ${d("committee_note")}) and ${d("passed")} (the plenary vote on the alternative). Record which date the National Assembly bill record shows for the original's disposition. Keep discarded, committee_note and passed as separate kinds.`,
      "",
    );
  }
  if (events.length === 0) out.push("The research has no event rows for this case.", "");
  for (const e of events) {
    const ev = Array.isArray(e.evidence_ids) ? e.evidence_ids.map(String) : [];
    out.push(
      `### ${str(e.id)}  ${str(e.event_type)}`,
      "",
      `- Research date: ${str(e.date)} (precision ${str(e.date_precision)})`,
      `- Document: ${str(e.document_id)}`,
      `- Evidence rows: ${ev.length ? ev.join(", ") : "none (no research row)"}`,
      "- Date on the official record: ",
      "- Kind as the record names it: ",
      "- URL opened: ",
      "",
    );
  }

  out.push("## Part 2: confirm (role B, a different person)", "", "Open the same page without looking at part 1. Fill in only what you see.", "");
  for (const it of items) {
    out.push(`### ${it.label}  ${it.title}`, "", `- Page: ${it.url ?? "find the official page (see part 1)"}`, ...part2Form(), "");
  }

  out.push("## URL changes (look-alike characters)", "");
  out.push(...(urlChanges.length ? urlChanges.map((c) => `- ${c}`) : ["- none"]));
  if (res.conflicts.length) out.push("", `Research rows with the same id and different content (the first copy was used): ${res.conflicts.join(", ")}`);
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[], env: Record<string, string | undefined>): { research?: string; out?: string } {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { research: get("--research") ?? env.BILLXRAY_RESEARCH_DIR, out: get("--out") };
}

export function run(args: { research?: string; out?: string }, repoRoot: string = REPO_ROOT): Summary[] {
  if (!args.research) throw new Error("missing --research <dir> (or BILLXRAY_RESEARCH_DIR)");
  if (!args.out) throw new Error("missing --out <dir>");
  assertOutsideRepo("--research folder", args.research, repoRoot);
  assertOutsideRepo("--out folder", args.out, repoRoot);
  const res = readResearch(args.research);
  const { files, summaries } = buildWorksheets(res);
  mkdirSync(args.out, { recursive: true });
  for (const [name, text] of files) writeFileSync(join(args.out, name), text, "utf8");
  return summaries;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const summaries = run(parseArgs(process.argv.slice(2), process.env));
    console.log("case | official rows | news or URL-less rows | no research row | file");
    for (const s of summaries) console.log(`${s.caseId} | ${s.officialRows} | ${s.newsOrNoUrlRows} | ${s.noResearchRows} | ${s.file}`);
    console.log(`worksheets written: ${summaries.length}`);
  } catch (e) {
    console.error(`make-worksheet: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
}
