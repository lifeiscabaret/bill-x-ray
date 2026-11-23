import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as compare from "../../src/compare/diff";
import { compareTexts, MAX_CHARS, type Segment } from "../../src/compare/diff";

const join2 = (segments: Segment[], skip: Segment["op"]) =>
  segments.filter((s) => s.op !== skip).map((s) => s.text).join("");

function segmentsOf(before: string, after: string, limits?: compare.CompareLimits): Segment[] {
  const r = compareTexts(before, after, limits);
  if (!r.ok) throw new Error(`expected a result, got ${r.reason}`);
  return r.segments;
}

describe("compareTexts", () => {
  it("English: one changed word shows as one delete and one insert", () => {
    const s = segmentsOf("The fee is 10 percent.", "The fee is 15 percent.");
    expect(s.filter((x) => x.op === "delete").map((x) => x.text)).toEqual(["10"]);
    expect(s.filter((x) => x.op === "insert").map((x) => x.text)).toEqual(["15"]);
    expect(join2(s, "insert")).toBe("The fee is 10 percent.");
    expect(join2(s, "delete")).toBe("The fee is 15 percent.");
  });

  it("Korean: a changed sentence rebuilds both texts", () => {
    const before = "연구개발 인력의 근로시간 특례를 둔다.";
    const after = "연구개발 인력의 근로시간 특례를 두지 않는다.";
    const s = segmentsOf(before, after);
    expect(s.some((x) => x.op === "insert")).toBe(true);
    expect(join2(s, "insert")).toBe(before);
    expect(join2(s, "delete")).toBe(after);
  });

  it("mixed Korean and English text rebuilds both texts", () => {
    const before = "H.R. 748 제2조 repeal the 4980I tax";
    const after = "H.R. 748 제3조 repeal the excise 세금";
    const s = segmentsOf(before, after);
    expect(join2(s, "insert")).toBe(before);
    expect(join2(s, "delete")).toBe(after);
  });

  it("a text compared with itself gives only equal segments", () => {
    for (const t of ["", "same text", "같은 문장\r\n두 번째 줄  끝"]) {
      const s = segmentsOf(t, t);
      expect(s.every((x) => x.op === "equal")).toBe(true);
      expect(join2(s, "insert")).toBe(t);
    }
  });

  it("keeps a whitespace-only change as a segment", () => {
    const s = segmentsOf("a b", "a  b");
    expect(s.some((x) => x.op !== "equal")).toBe(true);
    expect(join2(s, "insert")).toBe("a b");
    expect(join2(s, "delete")).toBe("a  b");
  });

  it("two runs give the same result", () => {
    const a = "Section 2 repeals the tax. 제15조 전력 및 용수 기반시설";
    const b = "Section 2 repeals the excise tax. 제18조 전력 및 용수 기반 시설";
    expect(compareTexts(a, b)).toEqual(compareTexts(a, b));
  });

  it("an empty text against a text gives one insert, or one delete", () => {
    expect(segmentsOf("", "new")).toEqual([{ op: "insert", text: "new" }]);
    expect(segmentsOf("old", "")).toEqual([{ op: "delete", text: "old" }]);
  });
});

describe("compareTexts limits", () => {
  it("gives too_long above 20,000 characters, on either side", () => {
    const ok = "a".repeat(MAX_CHARS);
    const tooLong = "a".repeat(MAX_CHARS + 1);
    expect(compareTexts(ok, ok).ok).toBe(true);
    expect(compareTexts(tooLong, ok)).toEqual({ ok: false, reason: "too_long" });
    expect(compareTexts(ok, tooLong)).toEqual({ ok: false, reason: "too_long" });
  });

  it("gives too_long at a lowered maxChars", () => {
    expect(compareTexts("abcd", "abcd", { maxChars: 3 })).toEqual({ ok: false, reason: "too_long" });
    expect(compareTexts("abc", "abc", { maxChars: 3 }).ok).toBe(true);
  });

  it("gives too_costly when maxEditLength is lowered below the edits needed", () => {
    // "a b c" -> "x y z" needs more than one token edit.
    expect(compareTexts("a b c", "x y z", { maxEditLength: 1 })).toEqual({ ok: false, reason: "too_costly" });
    expect(compareTexts("a b c", "x y z", { maxEditLength: 100 }).ok).toBe(true);
  });

  it("gives too_costly when the timeout has already passed", () => {
    // jsdiff 9 stops once Date.now() is later than start + timeout; -1 makes that certain.
    expect(compareTexts("a b c", "x y z", { timeoutMs: -1 })).toEqual({ ok: false, reason: "too_costly" });
  });

  it("identical texts still compare under the lowest limit (jsdiff 9 returns before it checks)", () => {
    expect(compareTexts("a b c", "a b c", { maxEditLength: 0, timeoutMs: -1 }).ok).toBe(true);
  });
});

describe("src/compare rules", () => {
  it("exports no similarity figure and its result carries no extra field", () => {
    expect(Object.keys(compare).filter((k) => /similar|ratio|score|percent|distance/i.test(k))).toEqual([]);
    const r = compareTexts("a b", "a c");
    expect(Object.keys(r).sort()).toEqual(["ok", "segments"]);
  });

  it("imports nothing from src/contract", () => {
    const dir = join(import.meta.dirname, "..", "..", "src", "compare");
    const bad = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /from\s*["'][^"']*contract/.test(readFileSync(join(dir, f), "utf8")));
    expect(bad).toEqual([]);
  });
});
