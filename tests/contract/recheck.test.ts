import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crossCheckRechecks, parseCase, parseRecheck, RECHECK_REASONS, type Case, type Recheck } from "../../src/contract";
import { minimalCase, options } from "./helpers";
import { checkedCase, goodRecheck, URL1 } from "./recheck-fixtures";

// Synthetic records only: invented ids, URLs on example.org, invented names.

const reasons = (issues: { code: string; params?: Record<string, string> }[]) => issues.map((i) => i.params?.reason ?? i.code);

describe("parseRecheck", () => {
  it("accepts an empty list and a good record", () => {
    expect(parseRecheck([])).toEqual({ rechecks: [], issues: [] });
    const r = parseRecheck([goodRecheck()]);
    expect(r.issues).toEqual([]);
    expect(r.rechecks).toEqual([goodRecheck()]);
  });

  it("accepts a record without a second part and without a note", () => {
    const r: Recheck = { ...goodRecheck(), confirm: null, note: null };
    expect(parseRecheck([r]).issues).toEqual([]);
  });

  it.each([null, {}, "x", 3])("a file that is not a list (%j) is one block issue and no records", (input) => {
    const r = parseRecheck(input);
    expect(r.rechecks).toEqual([]);
    expect(r.issues.map((i) => [i.code, i.severity, i.path])).toEqual([["schema_type", "block", []]]);
  });

  it("a missing required field is a block issue at the record's position; the record is left out", () => {
    const { sourceUrl: _drop, ...broken } = goodRecheck();
    const r = parseRecheck([goodRecheck(), broken]);
    expect(r.rechecks).toHaveLength(1);
    expect(r.issues.map((i) => [i.code, i.path])).toEqual([["schema_required", [1, "sourceUrl"]]]);
  });

  it("a role other than A or B is refused, in both parts", () => {
    const first = { ...goodRecheck(), checkedBy: "Alex" };
    const second = { ...goodRecheck(), confirm: { by: "C", at: "2026-11-24", url: URL1, result: "matched" } };
    const r = parseRecheck([first, second]);
    expect(r.issues.map((i) => [i.code, i.path])).toEqual([["schema_enum", [0, "checkedBy"]], ["schema_enum", [1, "confirm", "by"]]]);
  });

  it("fixes look-alike characters in sourceUrl and confirm.url and warns for each", () => {
    const lookalike = "https\u2236//example\u00B7org/bill-1-v1";
    const rec: Recheck = { ...goodRecheck(), sourceUrl: lookalike, confirm: { by: "B", at: "2026-11-24", url: lookalike, result: "matched" } };
    const r = parseRecheck([rec]);
    expect(r.rechecks[0]!.sourceUrl).toBe("https://example.org/bill-1-v1");
    expect(r.rechecks[0]!.confirm!.url).toBe("https://example.org/bill-1-v1");
    expect(r.issues.map((i) => [i.code, i.severity, i.path])).toEqual([
      ["url_lookalike_fixed", "warn", [0, "sourceUrl"]],
      ["url_lookalike_fixed", "warn", [0, "confirm", "url"]],
    ]);
    expect(r.issues[0]!.params).toEqual({ from: lookalike, to: "https://example.org/bill-1-v1" });
  });

  it("an invalid URL blocks, a missing one warns, a session token warns", () => {
    const bad = parseRecheck([{ ...goodRecheck(), sourceUrl: "ftp://example.org/x" }]);
    expect(bad.issues.map((i) => [i.code, i.severity])).toEqual([["url_invalid", "block"]]);
    const missing = parseRecheck([{ ...goodRecheck(), sourceUrl: "unknown" }]);
    expect(missing.issues.map((i) => [i.code, i.severity])).toEqual([["url_missing", "warn"]]);
    const session = parseRecheck([{ ...goodRecheck(), sourceUrl: `${URL1};jsessionid=abc` }]);
    expect(session.issues.map((i) => [i.code, i.severity])).toEqual([["url_session_token", "warn"]]);
  });

  it("an excerpt of 300 characters passes and one of 301 blocks (characters, not UTF-16 units)", () => {
    expect(parseRecheck([{ ...goodRecheck(), excerpt: "가".repeat(300) }]).issues).toEqual([]);
    expect(parseRecheck([{ ...goodRecheck(), excerpt: "😀".repeat(300) }]).issues).toEqual([]);
    const r = parseRecheck([{ ...goodRecheck(), excerpt: "가".repeat(301) }]);
    expect(r.issues.map((i) => [i.code, i.severity, i.path])).toEqual([["excerpt_too_long", "block", [0, "excerpt"]]]);
  });

  it.each(["2026", "2026-11", "unknown", "", "2026-02-30", "24 Nov 2026"])("a check date of %j is not a real day", (value) => {
    const rec: Recheck = { ...goodRecheck(), checkedAt: value, confirm: { by: "B", at: value, url: URL1, result: "matched" } };
    expect(parseRecheck([rec]).issues.map((i) => [i.code, i.path])).toEqual([["date_format", [0, "checkedAt"]], ["date_format", [0, "confirm", "at"]]]);
  });

  it("a repeated recheckId is a block issue on the second record", () => {
    const r = parseRecheck([goodRecheck(), goodRecheck()]);
    expect(r.issues.map((i) => [i.code, i.path])).toEqual([["duplicate_id", [1, "recheckId"]]]);
  });

  describe("names in a note", () => {
    const names = ["Zorblax Quimby", "Wen Ta-Lo"];
    const withNote = (note: string) => parseRecheck([{ ...goodRecheck(), note }], { personalNames: names });

    it("blocks a note with a listed name, whatever the case and spacing, and never prints the name", () => {
      for (const note of ["Checked by Zorblax Quimby.", "zorblaxquimby opened it", "ZORBLAX   QUIMBY", "wen ta-lo and A"]) {
        const r = withNote(note);
        expect(r.issues.map((i) => [i.code, i.severity, i.path])).toEqual([["schema_value", "block", [0, "note"]]]);
        const text = JSON.stringify(r.issues).toLowerCase();
        expect(text).not.toContain("zorblax");
        expect(text).not.toContain("ta-lo");
      }
    });

    it("passes a note with no listed name, and a note when no list is given", () => {
      expect(withNote("Role A opened the page; role B confirmed.").issues).toEqual([]);
      expect(parseRecheck([{ ...goodRecheck(), note: "Checked by Zorblax Quimby." }]).issues).toEqual([]);
      expect(parseRecheck([{ ...goodRecheck(), note: "Checked by Zorblax Quimby." }], { personalNames: [] }).issues).toEqual([]);
    });

    it("ignores blank entries in the list", () => {
      expect(parseRecheck([goodRecheck()], { personalNames: ["", "  "] }).issues).toEqual([]);
    });
  });

  it("never throws for any JSON value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const r = parseRecheck(v, { personalNames: ["Zorblax Quimby"] });
        expect(Array.isArray(r.rechecks)).toBe(true);
      }),
      { numRuns: 300 },
    );
  }, 30_000);

  it("never throws for a good record with one place replaced by any JSON value", () => {
    const keys = ["recheckId", "caseId", "target", "sourceUrl", "anchor", "excerpt", "result", "checkedBy", "checkedAt", "confirm", "note"] as const;
    fc.assert(
      fc.property(fc.constantFrom(...keys), fc.jsonValue(), (key, v) => {
        parseRecheck([{ ...goodRecheck(), [key]: v }], { personalNames: ["Zorblax Quimby"] });
      }),
      { numRuns: 300 },
    );
  }, 30_000);
});

describe("crossCheckRechecks (two roles, D-002 and D-006)", () => {
  it("the fixture case parses clean as bundled data, so the tests below start from a valid case", () => {
    const r = parseCase(checkedCase(), options);
    expect(r.issues).toEqual([]);
    expect(r.model!.gate["ev-1"]!.pass).toBe(true);
  });

  it("passes when the record is complete", () => {
    expect(crossCheckRechecks(checkedCase(), [goodRecheck()])).toEqual([]);
  });

  it("asks for nothing when no evidence row is matched_official, and no absence check is present", () => {
    const c = minimalCase();
    expect(crossCheckRechecks(c, [])).toEqual([]);
    for (const state of ["partial", "could_not_open", "not_checked", "mismatch"] as const) {
      const d = checkedCase();
      d.evidence[0]!.check = { ...d.evidence[0]!.check, state };
      d.paths = d.paths.filter((p) => p.kind !== "not_included");
      expect(crossCheckRechecks(d, [])).toEqual([]);
    }
  });

  it("a missing record is recheck_missing (block) with reason no_record, pointing at the row", () => {
    const issues = crossCheckRechecks(checkedCase(), []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "recheck_missing", severity: "block", path: ["evidence", 0], params: { reason: "no_record", id: "ev-1" } });
  });

  it("a record of another case or for another row does not count", () => {
    expect(reasons(crossCheckRechecks(checkedCase(), [{ ...goodRecheck(), caseId: "fixture-other" }]))).toEqual(["no_record"]);
    expect(reasons(crossCheckRechecks(checkedCase(), [{ ...goodRecheck(), target: { researchId: "R-1", evidenceId: "ev-9" } }]))).toEqual(["no_record"]);
    expect(reasons(crossCheckRechecks(checkedCase(), [{ ...goodRecheck(), target: { researchId: "R-1", evidenceId: null } }]))).toEqual(["no_record"]);
  });

  // One failing line per row of the loading condition; each is recheck_missing with its reason.
  const failures: [string, (r: Recheck) => Recheck, string[]][] = [
    ["the first role's result is not matched", (r) => ({ ...r, result: "partial" }), ["result_not_matched"]],
    ["the first role could not open the page", (r) => ({ ...r, result: "could_not_open" }), ["result_not_matched"]],
    ["there is no second part", (r) => ({ ...r, confirm: null }), ["confirm_missing"]],
    ["the second role's result is not matched", (r) => ({ ...r, confirm: { ...r.confirm!, result: "mismatch" } }), ["confirm_not_matched"]],
    ["the same role opened twice (A and A)", (r) => ({ ...r, confirm: { ...r.confirm!, by: "A" } }), ["same_role"]],
    // the row says A checked it, so a record that says B is also a role mismatch
    ["the same role opened twice (B and B)", (r) => ({ ...r, checkedBy: "B" }), ["same_role", "role_mismatch"]],
    ["the first role opened another page", (r) => ({ ...r, sourceUrl: "https://example.org/other" }), ["url_mismatch"]],
    ["the second role opened another page", (r) => ({ ...r, confirm: { ...r.confirm!, url: "https://example.org/other" } }), ["confirm_url_mismatch"]],
    ["the first role's URL differs only by a trailing slash", (r) => ({ ...r, sourceUrl: `${URL1}/` }), ["url_mismatch"]],
    ["two failures at once are two issues", (r) => ({ ...r, result: "mismatch", confirm: { ...r.confirm!, by: "A" } }), ["result_not_matched", "same_role"]],
    // The record vouches for the row's exact words: plain string equality, nothing normalized.
    ["the anchor differs", (r) => ({ ...r, anchor: "Sec. 2" }), ["anchor_mismatch"]],
    ["the anchor differs by a trailing space", (r) => ({ ...r, anchor: "Sec. 1 " }), ["anchor_mismatch"]],
    ["the anchor differs by case", (r) => ({ ...r, anchor: "sec. 1" }), ["anchor_mismatch"]],
    ["the excerpt differs", (r) => ({ ...r, excerpt: "Another invented clause." }), ["excerpt_mismatch"]],
    ["the excerpt differs by one doubled space", (r) => ({ ...r, excerpt: "Invented  clause text." }), ["excerpt_mismatch"]],
    ["the excerpt differs by a no-break space", (r) => ({ ...r, excerpt: "Invented\u00A0clause text." }), ["excerpt_mismatch"]],
    ["the excerpt is empty", (r) => ({ ...r, excerpt: "" }), ["excerpt_mismatch"]],
    ["anchor and excerpt both differ, two issues in this order", (r) => ({ ...r, anchor: "x", excerpt: "y" }), ["anchor_mismatch", "excerpt_mismatch"]],
  ];

  // The row is changed instead of the record: roles and dates the row carries must be the record's.
  const rowChanges: [string, (c: Case) => void, string[]][] = [
    ["the row names another checking role", (c) => { c.evidence[0]!.check.checkedBy = "B"; }, ["role_mismatch"]],
    ["the row names another confirming role", (c) => { c.evidence[0]!.check.confirmedBy = "A"; c.evidence[0]!.check.confirmedAt = "2026-11-24"; }, ["role_mismatch"]],
    ["the row names another check date", (c) => { c.evidence[0]!.check.checkedAt = "2026-11-23"; }, ["date_mismatch"]],
    ["the row names another confirm date", (c) => { c.evidence[0]!.check.confirmedBy = "B"; c.evidence[0]!.check.confirmedAt = "2026-11-23"; }, ["date_mismatch"]],
    ["a role and a date both differ, role first", (c) => { c.evidence[0]!.check.checkedBy = "B"; c.evidence[0]!.check.checkedAt = "2026-11-23"; }, ["role_mismatch", "date_mismatch"]],
    ["the row's excerpt was edited after the recheck", (c) => { c.evidence[0]!.excerpt = "Edited invented clause."; }, ["excerpt_mismatch"]],
    ["the row's anchor was edited after the recheck", (c) => { c.evidence[0]!.anchor = "Sec. 1(a)"; }, ["anchor_mismatch"]],
  ];
  it.each(failures)("%s", (_name, change, expected) => {
    const issues = crossCheckRechecks(checkedCase(), [change(goodRecheck())]);
    expect(reasons(issues)).toEqual(expected);
    for (const i of issues) expect(i).toMatchObject({ code: "recheck_missing", severity: "block", path: ["evidence", 0] });
  });

  it.each(rowChanges)("%s", (_name, change, expected) => {
    const c = checkedCase();
    change(c);
    const issues = crossCheckRechecks(c, [goodRecheck()]);
    expect(reasons(issues)).toEqual(expected);
    for (const i of issues) expect(i).toMatchObject({ code: "recheck_missing", severity: "block", path: ["evidence", 0] });
  });

  describe("roles and dates on the row", () => {
    it("a row that names the same roles and dates as the record passes", () => {
      const c = checkedCase();
      c.evidence[0]!.check = { ...c.evidence[0]!.check, checkedBy: "A", checkedAt: "2026-11-24", confirmedBy: "B", confirmedAt: "2026-11-24", confirmedUrl: URL1 };
      expect(crossCheckRechecks(c, [goodRecheck()])).toEqual([]);
    });

    it("a row that carries no role and no date is not a mismatch", () => {
      const c = checkedCase();
      c.evidence[0]!.check = { ...c.evidence[0]!.check, checkedBy: null, checkedAt: null, confirmedBy: null, confirmedAt: null };
      expect(crossCheckRechecks(c, [goodRecheck()])).toEqual([]);
    });

    it("a row that names a confirming role when the record has no second part is only confirm_missing", () => {
      const c = checkedCase();
      c.evidence[0]!.check = { ...c.evidence[0]!.check, confirmedBy: "B", confirmedAt: "2026-11-24" };
      expect(reasons(crossCheckRechecks(c, [{ ...goodRecheck(), confirm: null }]))).toEqual(["confirm_missing"]);
    });
  });

  it("any added character in the record's excerpt or anchor is a mismatch", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (extra) => {
        const r = goodRecheck();
        const found = reasons(crossCheckRechecks(checkedCase(), [{ ...r, excerpt: r.excerpt + extra, anchor: extra + r.anchor }]));
        expect(found).toEqual(["anchor_mismatch", "excerpt_mismatch"]);
      }),
      { numRuns: 200 },
    );
  });

  it("every reason of RECHECK_REASONS is reached by a test of this file", () => {
    const reached = new Set<string>();
    for (const [, change] of failures) for (const i of crossCheckRechecks(checkedCase(), [change(goodRecheck())])) reached.add(i.params!.reason!);
    for (const [, change] of rowChanges) {
      const c = checkedCase();
      change(c);
      for (const i of crossCheckRechecks(c, [goodRecheck()])) reached.add(i.params!.reason!);
    }
    for (const i of crossCheckRechecks(checkedCase(), [])) reached.add(i.params!.reason!);
    const c = checkedCase();
    c.paths[1]!.absenceCheck!.confirmedBy = null;
    for (const i of crossCheckRechecks(c, [goodRecheck()])) reached.add(i.params!.reason!);
    c.paths[1]!.absenceCheck!.confirmedBy = "A";
    for (const i of crossCheckRechecks(c, [goodRecheck()])) reached.add(i.params!.reason!);
    expect([...reached].sort()).toEqual([...RECHECK_REASONS].sort());
  });

  describe("URLs are compared after the contract's normalization, never as raw strings", () => {
    it("look-alike characters on either side do not break equality", () => {
      const lookalike = "https\u2236//example\u00B7org/bill-1-v1";
      const rec: Recheck = { ...goodRecheck(), sourceUrl: lookalike, confirm: { by: "B", at: "2026-11-24", url: lookalike, result: "matched" } };
      expect(lookalike).not.toBe(URL1);
      expect(crossCheckRechecks(checkedCase(), [rec])).toEqual([]);
      const c = checkedCase();
      c.documents[0]!.sourceUrl = lookalike;
      expect(crossCheckRechecks(c, [goodRecheck()])).toEqual([]);
    });

    it("a row whose version has no source URL cannot be matched by any recheck", () => {
      const c = checkedCase();
      c.documents[0]!.sourceUrl = null;
      expect(reasons(crossCheckRechecks(c, [goodRecheck()])).sort()).toEqual(["confirm_url_mismatch", "url_mismatch"]);
    });

    it("an empty or unknown URL in the record never equals anything", () => {
      const rec: Recheck = { ...goodRecheck(), sourceUrl: "unknown", confirm: { by: "B", at: "2026-11-24", url: "", result: "matched" } };
      expect(reasons(crossCheckRechecks(checkedCase(), [rec])).sort()).toEqual(["confirm_url_mismatch", "url_mismatch"]);
    });
  });

  it("two records for one row are duplicate_id, never a silent pick", () => {
    const issues = crossCheckRechecks(checkedCase(), [goodRecheck(), { ...goodRecheck(), recheckId: "rc-2" }]);
    expect(issues.map((i) => [i.code, i.severity, i.params?.id])).toEqual([["duplicate_id", "block", "ev-1"]]);
  });

  it("every matched_official row needs its own record", () => {
    const c = checkedCase();
    c.evidence.push({ ...c.evidence[0]!, evidenceId: "ev-2", anchor: "Sec. 2" });
    const issues = crossCheckRechecks(c, [goodRecheck()]);
    expect(issues.map((i) => [i.path, i.params?.reason, i.params?.id])).toEqual([[["evidence", 1], "no_record", "ev-2"]]);
  });

  it("the same role twice never passes, for any role", () => {
    fc.assert(
      fc.property(fc.constantFrom("A", "B"), fc.constantFrom("matched", "partial"), (role, result) => {
        const rec: Recheck = { ...goodRecheck(), checkedBy: role, confirm: { by: role, at: "2026-11-24", url: URL1, result } };
        expect(reasons(crossCheckRechecks(checkedCase(), [rec]))).toContain("same_role");
      }),
      { numRuns: 200 },
    );
  });

  describe("the absence check of a not_included path", () => {
    const withAbsence = (patch: Partial<NonNullable<Case["paths"][number]["absenceCheck"]>>): Case => {
      const c = checkedCase();
      c.paths[1]!.absenceCheck = { ...c.paths[1]!.absenceCheck!, ...patch };
      return c;
    };
    it("passes with two different roles, in either order", () => {
      expect(crossCheckRechecks(withAbsence({ checkedBy: "B", confirmedBy: "A" }), [goodRecheck()])).toEqual([]);
    });
    it("a second role is required", () => {
      const issues = crossCheckRechecks(withAbsence({ confirmedBy: null, confirmedAt: null }), [goodRecheck()]);
      expect(issues.map((i) => [i.code, i.severity, i.path, i.params?.reason, i.params?.id])).toEqual([
        ["recheck_missing", "block", ["paths", 1, "absenceCheck"], "absence_role_missing", "p-2"],
      ]);
    });
    it("a first role is required too", () => {
      expect(reasons(crossCheckRechecks(withAbsence({ checkedBy: null }), [goodRecheck()]))).toEqual(["absence_role_missing"]);
    });
    it("the same role twice fails", () => {
      expect(reasons(crossCheckRechecks(withAbsence({ confirmedBy: "A" }), [goodRecheck()]))).toEqual(["absence_same_role"]);
    });
    it("an absence check on a path of another kind, or no absence check at all, asks for nothing", () => {
      const c = checkedCase();
      c.paths[1]!.absenceCheck = null;
      expect(crossCheckRechecks(c, [goodRecheck()])).toEqual([]);
      const d = checkedCase();
      d.paths[1]!.kind = "carried";
      d.paths[1]!.absenceCheck!.confirmedBy = null;
      expect(crossCheckRechecks(d, [goodRecheck()])).toEqual([]);
    });
  });
});
