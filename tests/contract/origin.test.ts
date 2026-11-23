import { describe, expect, it } from "vitest";
import { parseCase } from "../../src/contract";
import type { BundledCheck, Case, ParseOptions } from "../../src/contract";
import { bundledOf, clone, gatedCase, matchedCheck } from "./gate-fixtures";

const user = (bundledChecks?: BundledCheck[]): ParseOptions => ({
  referenceDate: "2026-11-24", origin: "user", ...(bundledChecks ? { bundledChecks } : {}),
});
const ignoredWarnings = (r: ReturnType<typeof parseCase>) => r.issues.filter((i) => i.code === "check_record_ignored");
const BLANK = { state: "not_checked", url: null, checkedBy: null, checkedAt: null, confirmedBy: null, confirmedAt: null, confirmedUrl: null };

describe("origin bundled", () => {
  it("uses the check record as written, with or without bundledChecks", () => {
    for (const bundled of [undefined, [], [bundledOf(gatedCase())]]) {
      const r = parseCase(gatedCase(), { referenceDate: "2026-11-24", origin: "bundled", ...(bundled ? { bundledChecks: bundled } : {}) });
      expect(r.model!.origin).toBe("bundled");
      expect(r.model!.gate["ev-1"]!.pass).toBe(true);
      expect(r.model!.case.evidence[0]!.check).toEqual(matchedCheck());
      expect(ignoredWarnings(r)).toEqual([]);
    }
  });
});

describe("origin user: a stored check record is ignored", () => {
  it("leaves the row unchecked, warns, and the gate fails with no bundled checks", () => {
    for (const bundled of [undefined, []]) {
      const r = parseCase(gatedCase(), user(bundled));
      expect(ignoredWarnings(r)).toEqual([
        expect.objectContaining({ path: ["evidence", 0, "check"], severity: "warn", params: { evidenceId: "ev-1" } }),
      ]);
      expect(r.model!.case.evidence[0]!.check).toEqual(BLANK);
      expect(r.model!.gate["ev-1"]).toMatchObject({ pass: false, effectiveState: "not_checked" });
      expect(r.model!.gate["ev-1"]!.reasons).toEqual(["not_checked", "checker_missing"]);
    }
  });
  it("ignores the record whatever it says, including both roles and a second URL", () => {
    const c = gatedCase();
    c.evidence[0]!.check = matchedCheck({ confirmedBy: "B", confirmedAt: "2026-11-21", confirmedUrl: "https://example.org/bill-1-v1" });
    const r = parseCase(c, user());
    expect(r.model!.gate["ev-1"]!.pass).toBe(false);
    expect(r.model!.case.evidence[0]!.check).toEqual(BLANK);
  });
  it("ends at pasted_text_only, not at a pass, when the excerpt is in the pasted text", () => {
    const c = gatedCase();
    c.documents[0]!.pastedText = "Before. Invented clause text. After.";
    expect(parseCase(c, user()).model!.gate["ev-1"]).toMatchObject({ pass: false, effectiveState: "pasted_text_only" });
  });
  it("is silent for a row with no stored record", () => {
    const c = gatedCase();
    c.evidence[0]!.check = clone(BLANK) as Case["evidence"][0]["check"];
    const r = parseCase(c, user());
    expect(r.issues).toEqual([]);
    expect(r.model!.gate["ev-1"]!.pass).toBe(false);
  });
  it("does not change the input", () => {
    const c = gatedCase();
    const before = clone(c);
    parseCase(c, user([bundledOf(c)]));
    expect(c).toEqual(before);
  });
  it("reports the warning at the row's place in the input when an earlier row was removed", () => {
    const c = gatedCase();
    c.evidence.unshift({ ...clone(c.evidence[0]!), evidenceId: "ev-0", anchor: "Sec. 0", excerpt: "x".repeat(301) }); // blocked: too long
    c.paths[0]!.evidenceRefs = ["ev-1"];
    const r = parseCase(c, user());
    expect(r.issues.filter((i) => i.code === "excerpt_too_long").map((i) => i.path)).toEqual([["evidence", 0, "excerpt"]]);
    expect(ignoredWarnings(r).map((i) => i.path)).toEqual([["evidence", 1, "check"]]);
  });
});

describe("origin user: an unchanged copy of a sample keeps its check", () => {
  const sample = () => bundledOf(gatedCase());

  it("keeps the sample's check record and passes, with no warning", () => {
    const r = parseCase(gatedCase(), user([sample()]));
    expect(ignoredWarnings(r)).toEqual([]);
    expect(r.model!.gate["ev-1"]).toEqual({ pass: true, reasons: [], effectiveState: "matched_official" });
    expect(r.model!.case.evidence[0]!.check).toEqual(matchedCheck());
  });
  it("keeps the check when only the evidenceId was renamed", () => {
    const c = gatedCase();
    c.evidence[0]!.evidenceId = "my-ev";
    c.paths[0]!.evidenceRefs = ["my-ev"];
    expect(parseCase(c, user([sample()])).model!.gate["my-ev"]!.pass).toBe(true);
  });
  it("keeps the check when the copy brings a blank record (the sample's record is used)", () => {
    const c = gatedCase();
    c.evidence[0]!.check = clone(BLANK) as Case["evidence"][0]["check"];
    const r = parseCase(c, user([sample()]));
    expect(r.model!.gate["ev-1"]!.pass).toBe(true);
    expect(ignoredWarnings(r)).toEqual([]);
  });
  it("uses the sample's record, not an edited one, and warns", () => {
    const c = gatedCase();
    c.evidence[0]!.check = matchedCheck({ checkedBy: "B", checkedAt: "2027-01-01" });
    const r = parseCase(c, user([sample()]));
    expect(r.model!.case.evidence[0]!.check).toEqual(matchedCheck());
    expect(ignoredWarnings(r)).toHaveLength(1);
  });
  it("cannot be forged by putting a matched record on a row that is not a copy", () => {
    const c = gatedCase();
    c.evidence[0]!.anchor = "Sec. 9";
    expect(parseCase(c, user([sample()])).model!.gate["ev-1"]!.pass).toBe(false);
  });

  // Any edit of the five fields drops the check.
  const edits: [string, (c: Case) => void][] = [
    ["anchor", (c) => { c.evidence[0]!.anchor = "Sec. 1(a)"; }],
    ["excerpt", (c) => { c.evidence[0]!.excerpt = "Invented clause text, changed."; }],
    ["excerpt by one space", (c) => { c.evidence[0]!.excerpt += " "; }],
    ["versionId", (c) => { c.evidence[0]!.versionId = "v2"; }],
    ["documentId", (c) => {
      c.documents.push({ ...clone(c.documents[0]!), documentId: "Bill 2" });
      c.evidence[0]!.documentId = "Bill 2";
    }],
    ["the version's sourceUrl", (c) => { c.documents[0]!.sourceUrl = "https://example.org/bill-1-v1-moved"; }],
    ["the version's sourceUrl to missing", (c) => { c.documents[0]!.sourceUrl = null; }],
  ];
  for (const [what, edit] of edits) {
    it(`an edited ${what} loses the check`, () => {
      const c = gatedCase();
      edit(c);
      const r = parseCase(c, user([sample()]));
      const g = r.model!.gate["ev-1"]!;
      expect(g.pass).toBe(false);
      expect(g.effectiveState).toBe("not_checked");
      expect(r.model!.case.evidence[0]!.check).toEqual(BLANK);
      expect(ignoredWarnings(r)).toHaveLength(1);
    });
  }
  it("is not affected by other edits: a changed title or translation keeps the check", () => {
    const c = gatedCase();
    c.documents[0]!.title = "Another title";
    c.evidence[0]!.translation = { text: "A translation.", language: "ko" };
    expect(parseCase(c, user([sample()])).model!.gate["ev-1"]!.pass).toBe(true);
  });
  it("prefers the sample row with the same evidenceId when several fit", () => {
    const other: BundledCheck = { ...sample(), evidenceId: "other", check: matchedCheck({ state: "partial" }) };
    expect(parseCase(gatedCase(), user([other, sample()])).model!.gate["ev-1"]!.pass).toBe(true);
  });
});
