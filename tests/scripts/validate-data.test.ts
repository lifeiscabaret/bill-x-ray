import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { NAMES_FILE, run, validateData } from "../../scripts/validate-data";
import type { Case, Recheck } from "../../src/contract";
import { checkedCase, goodRecheck } from "../contract/recheck-fixtures";

// Synthetic data only: invented case, ids, URLs on example.org and an invented name.
const repoRoot = join(import.meta.dirname, "..", "..");
const TODAY = "2026-11-24";
const temps: string[] = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "bx-validate-"));
  temps.push(d);
  return d;
};

type Files = Record<string, unknown>;
/** A repository root in a temporary folder with the two data folders and a .gitkeep in each. */
function makeRoot(cases: Files = {}, verification: Files = {}): string {
  const root = tmp();
  for (const [folder, files] of [["cases", cases], ["verification", verification]] as const) {
    const dir = join(root, "data", folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitkeep"), "");
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
    }
  }
  return root;
}
const go = (root: string, argv: string[] = [], env: Record<string, string | undefined> = {}) => run(argv, env, { root, today: TODAY });
const lines = (r: { out: string; err: string }) => (r.out + r.err).split("\n").filter(Boolean);
const good = (): { cases: Files; verification: Files } => ({ cases: { "fixture-minimal.json": checkedCase() }, verification: { "fixture-minimal.json": [goodRecheck()] } });

describe("validate:data on empty folders", () => {
  it("exits 0 and says so when both folders hold only .gitkeep", () => {
    const r = go(makeRoot());
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(lines(r)).toContain("validate:data: 0 case file(s), 0 verification file(s), 0 block issue(s), 0 warning(s)");
  });

  it("exits 0 on this repository's own folders, through the real command", () => {
    const r = spawnSync("npx", ["tsx", "scripts/validate-data.ts"], { cwd: repoRoot, encoding: "utf8", shell: true });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("0 case file(s), 0 verification file(s)");
  }, 120_000);
});

describe("validate:data on data", () => {
  it("passes a case whose matched_official row has a complete two-role recheck", () => {
    const { cases, verification } = good();
    const r = go(makeRoot(cases, verification));
    expect(r.code).toBe(0);
    expect(lines(r).at(-1)).toContain("1 case file(s), 1 verification file(s), 0 block issue(s), 0 warning(s)");
  });

  it("a case with a matched_official row and no verification file exits 1 with recheck_missing, file and JSON path", () => {
    const r = go(makeRoot(good().cases));
    expect(r.code).toBe(1);
    expect(lines(r)[0]).toBe(
      'data/cases/fixture-minimal.json: evidence[0]: recheck_missing (block): Evidence "ev-1" is marked matched_official but has no recheck record.',
    );
  });

  // Each loading condition fails once, through the files and the exit code.
  const failures: [string, (r: Recheck) => Recheck | null, string][] = [
    ["the first role's result is not matched", (r) => ({ ...r, result: "partial" }), "is \"partial\", not \"matched\""],
    ["no second part", (r) => ({ ...r, confirm: null }), "second role's part is missing"],
    ["the second role's result is not matched", (r) => ({ ...r, confirm: { ...r.confirm!, result: "mismatch" } }), "second role's result"],
    ["the same role twice", (r) => ({ ...r, confirm: { ...r.confirm!, by: "A" } }), "same role"],
    ["the first role opened another page", (r) => ({ ...r, sourceUrl: "https://example.org/other" }), "first role did not open"],
    ["the second role opened another page", (r) => ({ ...r, confirm: { ...r.confirm!, url: "https://example.org/other" } }), "second role did not open"],
    ["the record names another case", (r) => ({ ...r, caseId: "fixture-other" }), "has no recheck record"],
    ["the record's excerpt is not the row's excerpt", (r) => ({ ...r, excerpt: "Invented clause text. " }), "excerpt differs from the row's excerpt"],
    ["the record's anchor is not the row's anchor", (r) => ({ ...r, anchor: "Sec. 2" }), "anchor differs from the row's anchor"],
  ];
  it.each(failures)("%s: exit 1", (_name, change, text) => {
    const { cases } = good();
    const r = go(makeRoot(cases, { "fixture-minimal.json": [change(goodRecheck())] }));
    expect(r.code).toBe(1);
    const found = lines(r).filter((l) => l.includes("recheck_missing"));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("data/cases/fixture-minimal.json: evidence[0]: recheck_missing (block)");
    expect(found[0]).toContain(text);
  });

  it("an absence check with one role fails, and the line points into the case file", () => {
    const c: Case = checkedCase();
    c.paths[1]!.absenceCheck!.confirmedBy = null;
    const r = go(makeRoot({ "fixture-minimal.json": c }, good().verification));
    expect(r.code).toBe(1);
    expect(lines(r)[0]).toContain("data/cases/fixture-minimal.json: paths[1].absenceCheck: recheck_missing (block)");
  });

  it("a block issue of the case itself exits 1 (301-character excerpt)", () => {
    const c = checkedCase();
    c.evidence[0]!.excerpt = "x".repeat(301);
    const r = go(makeRoot({ "fixture-minimal.json": c }, good().verification));
    expect(r.code).toBe(1);
    expect(r.err).toContain("data/cases/fixture-minimal.json: evidence[0].excerpt: excerpt_too_long (block)");
  });

  it("a block issue of a recheck record exits 1 and names the verification file", () => {
    const r = go(makeRoot(good().cases, { "fixture-minimal.json": [{ ...goodRecheck(), excerpt: "x".repeat(301) }] }));
    expect(r.code).toBe(1);
    expect(r.err).toContain("data/verification/fixture-minimal.json: [0].excerpt: excerpt_too_long (block)");
  });

  it("a warning alone exits 0 and is still printed (look-alike URL in a recheck, fixed before comparing)", () => {
    const lookalike = "https\u2236//example\u00B7org/bill-1-v1";
    const rec: Recheck = { ...goodRecheck(), sourceUrl: lookalike };
    const r = go(makeRoot(good().cases, { "fixture-minimal.json": [rec] }));
    expect(r.code).toBe(0);
    expect(lines(r)[0]).toContain("data/verification/fixture-minimal.json: [0].sourceUrl: url_lookalike_fixed (warn)");
    expect(lines(r).at(-1)).toContain("0 block issue(s), 1 warning(s)");
  });

  it("a file that is not valid JSON, in either folder, exits 1", () => {
    const r = go(makeRoot({ "a.json": "{ not json" }, { "b.json": "[1," }));
    expect(r.code).toBe(1);
    expect(lines(r).filter((l) => l.includes("schema_format (block): The file is not valid JSON."))).toHaveLength(2);
  });

  it("a verification file that is not a list exits 1", () => {
    const r = go(makeRoot({}, { "a.json": {} }));
    expect(r.code).toBe(1);
    expect(r.err).toContain("data/verification/a.json: (input): schema_type (block)");
  });

  it("a stray file that is not .json exits 1; dot files are ignored", () => {
    const root = makeRoot();
    writeFileSync(join(root, "data", "cases", "notes.txt"), "x");
    writeFileSync(join(root, "data", "cases", ".DS_Store"), "x");
    const r = go(root);
    expect(r.code).toBe(1);
    expect(lines(r).filter((l) => l.includes("schema_format"))).toEqual(["data/cases/notes.txt: (input): schema_format (block): Only .json files belong in this folder."]);
  });

  it("a Byte Order Mark at the start of a file is accepted", () => {
    const { cases } = good();
    const r = go(makeRoot({ "fixture-minimal.json": "\uFEFF" + JSON.stringify(cases["fixture-minimal.json"]) }, { "fixture-minimal.json": "\uFEFF" + JSON.stringify([goodRecheck()]) }));
    expect(r.code).toBe(0);
  });

  it("validateData is pure: the same text gives the same findings", () => {
    const input = { cases: [{ name: "c.json", text: JSON.stringify(checkedCase()) }], verification: [] };
    const a = validateData(input, { referenceDate: TODAY });
    expect(a).toEqual(validateData(input, { referenceDate: TODAY }));
    expect(a.map((f) => f.code)).toEqual(["recheck_missing"]);
  });
});

describe("the name check", () => {
  const NAME = "Zorblax Quimby"; // invented
  const noted = (note: string) => makeRoot(good().cases, { "fixture-minimal.json": [{ ...goodRecheck(), note }] });
  const research = (content?: string): string => {
    const d = tmp();
    if (content !== undefined) writeFileSync(join(d, NAMES_FILE), content);
    return d;
  };

  it("is skipped with one line when no research folder is given, and does not fail", () => {
    const r = go(noted(`Checked by ${NAME}.`));
    expect(r.code).toBe(0);
    expect(lines(r).filter((l) => l.includes("name check skipped"))).toEqual([
      "validate:data: name check skipped: no research folder given (--research or BILLXRAY_RESEARCH_DIR)",
    ]);
  });

  it("is skipped with one line when the research folder has no names list", () => {
    const r = go(noted(`Checked by ${NAME}.`), ["--research", research()]);
    expect(r.code).toBe(0);
    expect(lines(r).filter((l) => l.includes("name check skipped"))).toEqual(["validate:data: name check skipped: the research folder has no names list"]);
  });

  it("blocks a note with a listed name (flag or environment variable) and never prints the name", () => {
    const dir = research(`# comment\n\n${NAME}\n`);
    for (const r of [go(noted(`Checked by ${NAME}.`), ["--research", dir]), go(noted(`checked by ${NAME.toUpperCase()}.`), [], { BILLXRAY_RESEARCH_DIR: dir })]) {
      expect(r.code).toBe(1);
      expect(r.err).toContain("data/verification/fixture-minimal.json: [0].note: schema_value (block)");
      expect(r.err).not.toContain("name check skipped");
      expect((r.out + r.err).toLowerCase()).not.toContain("zorblax");
    }
  });

  it("passes a note with no listed name and prints no skip line", () => {
    const r = go(noted("Role A opened it; role B confirmed."), ["--research", research(`${NAME}\n`)]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("skipped");
  });
});

describe("usage errors exit 2", () => {
  const usage = (r: { code: number; err: string }, text: string) => {
    expect(r.code).toBe(2);
    expect(r.err).toContain(`validate:data: ${text}`);
    expect(r.err).toContain("usage: validate:data [--research <dir>]");
  };

  it("an unknown argument", () => usage(go(makeRoot(), ["--bogus"]), 'unknown or incomplete argument "--bogus"'));
  it("--research without a value", () => usage(go(makeRoot(), ["--research"]), 'unknown or incomplete argument "--research"'));
  it("a research folder that does not exist", () => usage(go(makeRoot(), ["--research", join(tmp(), "missing")]), "the research folder does not exist"));
  it("a research folder inside the repository", () => {
    const r = run(["--research", join(repoRoot, "docs")], {}, { root: repoRoot, today: TODAY });
    usage(r, "the research folder is inside the repository: refused");
  });
  it("a names list with a line shorter than 3 characters (the line, not its text, is named)", () => {
    const d = tmp();
    writeFileSync(join(d, NAMES_FILE), `${"Zorblax Quimby"}\nAb\n`);
    const r = go(makeRoot(), ["--research", d]);
    usage(r, "line 2 of the names list is shorter than 3 characters");
    expect(r.err).not.toContain("Ab");
  });
  it("a missing data folder", () => {
    const root = tmp();
    mkdirSync(join(root, "data", "cases"), { recursive: true });
    usage(go(root), "the folder data/verification does not exist");
  });

  it("the real command exits 2 on a bad argument and writes nothing to stdout", () => {
    const r = spawnSync("npx", ["tsx", "scripts/validate-data.ts", "--bogus"], { cwd: repoRoot, encoding: "utf8", shell: true });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
  }, 120_000);
});
