import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  DEMO_CASES,
  buildWorksheets,
  normalizeUrl,
  parseArgs,
  readResearch,
  run,
  type Research,
  type Row,
} from "../../scripts/make-worksheet";

// Synthetic rows only: no research text, no news text. Worksheets go to the OS temp folder.
const repoRoot = join(import.meta.dirname, "..", "..");
const temps: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "bx-ws-"));
  temps.push(d);
  return d;
};
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

function research(rows: Row[], ledger: Row[] = []): Research {
  const byId = new Map<string, Row>();
  const byType = new Map<string, Row[]>();
  for (const r of rows) {
    byId.set(String(r.id), r);
    byType.set(String(r.type), [...(byType.get(String(r.type)) ?? []), r]);
  }
  return { byId, byType, ledger: new Map(ledger.map((l) => [String(l.id), l])), conflicts: [] };
}

const kase = (id: string): Row => ({ type: "case", id, title_en: "Sample case", title_local: "Sample", jurisdiction: "US" });
const doc = (id: string, caseId: string, url: unknown, extra: Row = {}): Row => ({
  type: "document", id, case_id: caseId, doc_type: "statute", identifier: `Ident ${id}`, stage_common: "promulgated", date: "2020-01-01", official_url: url, ...extra,
});
const evi = (id: string, docId: string, excerpt: string, extra: Row = {}): Row => ({
  type: "evidence", id, document_id: docId, clause_anchor: "Sec. 1", excerpt_original: excerpt, ...extra,
});
const src = (id: string, kind: string, url: string): Row => ({ type: "source", id, kind, publisher: "Pub", title: "T", url });
const sheet = (rows: Row[], ledger: Row[] = [], caseId = "T-CASE-0001"): string => {
  const { files } = buildWorksheets(research(rows, ledger), [caseId]);
  return files.get(`recheck-${caseId}.md`) as string;
};

describe("make-worksheet: rows", () => {
  it("lists an official row with its ids, URL, anchor, excerpt and ledger word", () => {
    const text = sheet(
      [kase("T-CASE-0001"), doc("T-DOC-0001", "T-CASE-0001", "https://example.gov/law/1"), evi("T-EVI-0001", "T-DOC-0001", "Sample official clause."), src("T-SRC-0001", "official_law", "https://example.gov/law/1")],
      [{ id: "T-EVI-0001", type: "evidence", result: "열림", excerpt_match: "일치" }],
    );
    expect(text).toContain("evidence T-EVI-0001 · document T-DOC-0001 · source T-SRC-0001");
    expect(text).toContain("https://example.gov/law/1");
    expect(text).toContain("> Sample official clause.");
    expect(text).toContain("Research ledger: matched");
    expect(text).toContain("- Role: ");
  });

  it("marks a news-based row and prints no news text", () => {
    const newsText = "NEWS-ONLY-SENTENCE-FOR-TEST";
    const text = sheet([
      kase("T-CASE-0001"),
      doc("T-DOC-0001", "T-CASE-0001", "https://news.example.org/a/1"),
      src("T-SRC-0001", "news_contemporaneous", "https://news.example.org/a/1"),
      evi("T-EVI-0001", "T-DOC-0001", newsText),
      doc("T-DOC-0002", "T-CASE-0001", "https://example.gov/law/2"),
      evi("T-EVI-0002", "T-DOC-0002", newsText, { notes: "from T-SRC-0001" }),
    ]);
    expect(text).toContain("rests on news");
    expect(text).not.toContain(newsText);
  });

  it("marks a row with no official URL", () => {
    const text = sheet([kase("T-CASE-0001"), doc("T-DOC-0001", "T-CASE-0001", "unknown"), evi("T-EVI-0001", "T-DOC-0001", "Sample clause.")]);
    expect(text).toContain("no official URL");
    expect(text).toContain("- URL: none in the research");
  });

  it("normalizes look-alike characters and logs each change", () => {
    expect(normalizeUrl("https\u2236//www\u00b7example\u00b7gov/x")).toEqual({ url: "https://www.example.gov/x", changed: true });
    expect(normalizeUrl("null").url).toBeNull();
    const text = sheet([kase("T-CASE-0001"), doc("T-DOC-0001", "T-CASE-0001", "https\u2236//www\u00b7example.gov/x"), evi("T-EVI-0001", "T-DOC-0001", "Sample clause.")]);
    expect(text).toContain("- URL: https://www.example.gov/x");
    expect(text).toContain("T-DOC-0001 official_url: https\u2236//www\u00b7example.gov/x -> https://www.example.gov/x");
  });

  it("prints an excerpt of 300 characters and not one of 301", () => {
    const row = (n: number): string => sheet([kase("T-CASE-0001"), doc("T-DOC-0001", "T-CASE-0001", "https://example.gov/1"), evi("T-EVI-0001", "T-DOC-0001", "x".repeat(n))]);
    expect(row(300)).toContain("x".repeat(300));
    const long = row(301);
    expect(long).not.toContain("x".repeat(100));
    expect(long).toContain("301 characters, longer than 300");
  });

  it("lets a row marked supersedes replace the row it names, and counts a repeated row once", () => {
    const rows = [
      kase("T-CASE-0001"),
      doc("T-DOC-0001", "T-CASE-0001", null),
      doc("T-DOC-0002", "T-CASE-0001", "https://example.gov/new", { format_notes: "supersedes T-DOC-0001" }),
      evi("T-EVI-0001", "T-DOC-0001", "Sample clause."),
      evi("T-EVI-0002", "T-DOC-0002", "Sample clause."),
    ];
    const text = sheet(rows);
    expect(text).toContain("https://example.gov/new");
    expect((text.split("## Part 2")[0] as string).match(/^### R\d\d /gm)).toHaveLength(1);
    expect(text).toContain("T-EVI-0002 = T-EVI-0001");
  });

  it("lists a document with no evidence row as no research row, and the fixed items of a demo case", () => {
    const text = sheet([kase("B4-CASE-0001"), doc("B4-DOC-0001", "B4-CASE-0001", null)], [], "B4-CASE-0001");
    expect(text).toContain("### N1 ");
    expect(text).toContain("enrolled text (BILLS-116hr748enr)");
    const { summaries } = buildWorksheets(research([kase("B4-CASE-0001"), doc("B4-DOC-0001", "B4-CASE-0001", null)]), ["B4-CASE-0001"]);
    expect(summaries[0]).toMatchObject({ officialRows: 0, newsOrNoUrlRows: 0, noResearchRows: 3 });
  });

  it("starts with the how-to section and covers 19 cases by default", () => {
    expect(sheet([kase("T-CASE-0001")])).toMatch(/## How to record[\s\S]*could_not_open[\s\S]*do not fill it in/i);
    expect(DEMO_CASES).toHaveLength(19);
    expect(new Set(DEMO_CASES).size).toBe(19);
  });
});

describe("make-worksheet: files and folders", () => {
  it("refuses a research folder or an --out folder inside the repository, and creates nothing there", () => {
    const outside = tmp();
    const inside = join(repoRoot, "tests", "scripts", "zz-refused-out");
    expect(() => run({ research: join(repoRoot, "data"), out: outside })).toThrow(/inside the repository/);
    expect(() => run({ research: outside, out: inside })).toThrow(/inside the repository/);
    expect(existsSync(inside)).toBe(false);
  });

  it("reads rows from a folder, writes 19 worksheets outside the repository and nothing inside it", () => {
    const base = tmp();
    const dir = join(base, "r");
    mkdirSync(join(dir, "jsonl", "M1"), { recursive: true });
    mkdirSync(join(dir, "verify", "M1"), { recursive: true });
    const line = (r: Row): string => JSON.stringify(r);
    writeFileSync(join(dir, "jsonl", "M1", "case.jsonl"), line(kase("B4-CASE-0001")) + "\n");
    writeFileSync(join(dir, "jsonl", "M1", "document.jsonl"), line(doc("B4-DOC-0001", "B4-CASE-0001", "https://example.gov/1")) + "\n");
    writeFileSync(join(dir, "jsonl", "M1", "evidence.jsonl"), line(evi("B4-EVI-0001", "B4-DOC-0001", "Sample clause.")) + "\n");
    writeFileSync(join(dir, "verify", "M1", "열람확인.jsonl"), line({ id: "B4-EVI-0001", type: "evidence", result: "열림", excerpt_match: "부분" }) + "\n");
    expect(readResearch(dir).ledger.size).toBe(1);

    const out = join(base, "out");
    const before = readdirSync(repoRoot).sort();
    const summaries = run({ research: dir, out });
    expect(summaries).toHaveLength(19);
    expect(readdirSync(out)).toHaveLength(19);
    expect(readFileSync(join(out, "recheck-B4-CASE-0001.md"), "utf8")).toContain("Research ledger: partial");
    expect(readdirSync(repoRoot).sort()).toEqual(before);
  });

  it("reports a broken row by file and line without echoing it", () => {
    const dir = join(tmp(), "r");
    mkdirSync(join(dir, "jsonl", "M1"), { recursive: true });
    writeFileSync(join(dir, "jsonl", "M1", "case.jsonl"), "{not json SECRET-VALUE\n");
    expect(() => readResearch(dir)).toThrow(/M1\/case\.jsonl:1: not valid JSON$/);
  });

  it("takes --research from the environment when the flag is missing", () => {
    expect(parseArgs(["--out", "o"], { BILLXRAY_RESEARCH_DIR: "r" })).toEqual({ research: "r", out: "o" });
    expect(parseArgs(["--research", "x", "--out", "o"], { BILLXRAY_RESEARCH_DIR: "r" }).research).toBe("x");
  });
});
