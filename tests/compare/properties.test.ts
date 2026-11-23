import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compareTexts, type Segment } from "../../src/compare/diff";

const joined = (segments: Segment[], skip: Segment["op"]) =>
  segments.filter((s) => s.op !== skip).map((s) => s.text).join("");

// Pieces chosen to hit the tokenizer: English words, Hangul, punctuation, digits, space runs,
// tabs, no-break and ideographic spaces, lone CR, CRLF, LF, and an astral character.
const piece = fc.constantFrom(
  "a", "tax", "Section", "748", "가", "나다", "근로시간", "특례", ".", ",", "§", "-",
  " ", "  ", "     ", "\t", "\n", "\r\n", "\r", "\n\n", "\u00a0", "\u3000", "😀",
);
const mixed = fc.array(piece, { maxLength: 40 }).map((a) => a.join(""));
const texts = fc.oneof(
  mixed,
  fc.string({ maxLength: 60 }),
  fc.string({ unit: "binary", maxLength: 40 }),
  fc.string({ unit: "grapheme", maxLength: 40 }),
);
const whitespaceHeavy = fc
  .array(fc.constantFrom("a", "가", " ", "  ", "\t", "\n", "\r\n"), { maxLength: 40 })
  .map((a) => a.join(""));

const RUNS = { numRuns: 200 };

describe("Property 10: comparison rebuilds both texts", () => {
  it("equal + delete rebuilds before, equal + insert rebuilds after", () => {
    fc.assert(
      fc.property(texts, texts, (before, after) => {
        const r = compareTexts(before, after);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(joined(r.segments, "insert")).toBe(before);
        expect(joined(r.segments, "delete")).toBe(after);
      }),
      RUNS,
    );
  });

  it("holds for whitespace runs, line breaks, Korean and English together", () => {
    fc.assert(
      fc.property(whitespaceHeavy, whitespaceHeavy, mixed, mixed, (b1, a1, b2, a2) => {
        for (const [before, after] of [[b1, a1], [b2, a2]] as const) {
          const r = compareTexts(before, after);
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          expect(joined(r.segments, "insert")).toBe(before);
          expect(joined(r.segments, "delete")).toBe(after);
        }
      }),
      RUNS,
    );
  });

  it("a text compared with itself gives only equal segments", () => {
    fc.assert(
      fc.property(texts, (t) => {
        const r = compareTexts(t, t);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.segments.every((s) => s.op === "equal")).toBe(true);
        expect(joined(r.segments, "insert")).toBe(t);
      }),
      RUNS,
    );
  });

  it("two runs give the same result", () => {
    fc.assert(
      fc.property(texts, texts, (before, after) => {
        expect(compareTexts(before, after)).toEqual(compareTexts(before, after));
      }),
      RUNS,
    );
  });

  it("no segment is empty", () => {
    fc.assert(
      fc.property(texts, texts, (before, after) => {
        const r = compareTexts(before, after);
        if (r.ok) expect(r.segments.every((s) => s.text.length > 0)).toBe(true);
      }),
      RUNS,
    );
  });
});
