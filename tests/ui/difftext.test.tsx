import { cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { compareTexts, type CompareResult } from "../../src/compare/diff";
import { t } from "../../src/i18n/t";
import { DiffText } from "../../src/ui/DiffText";

afterEach(cleanup);

function show(result: CompareResult, lang?: string) {
  const view = render(<DiffText result={result} lang={lang} />);
  return { ...view, root: view.container };
}

describe("DiffText", () => {
  it("marks inserted text with <ins> and deleted text with <del>", () => {
    const { root } = show(compareTexts("the tax applies to every plan", "the tax applies to each plan"));
    expect(root.querySelector("ins")?.textContent).toContain("each");
    expect(root.querySelector("del")?.textContent).toContain("every");
  });

  it("gives each change a visually hidden word, so it reads without colour", () => {
    const { root } = show(compareTexts("one two", "one three"));
    const ins = root.querySelector("ins")!;
    const del = root.querySelector("del")!;
    expect(ins.querySelector(".sr-only")?.textContent).toBe(`${t("panel.inserted")} `);
    expect(del.querySelector(".sr-only")?.textContent).toBe(`${t("panel.deleted")} `);
    expect(t("panel.inserted")).toMatch(/insert/i);
    expect(t("panel.deleted")).toMatch(/delet/i);
    // in the flat text a reader hears: "... Deleted: two Inserted: three"
    expect(root.textContent).toContain(`${t("panel.deleted")} two`);
    expect(root.textContent).toContain(`${t("panel.inserted")} three`);
  });

  it("keeps equal text unmarked", () => {
    const { root } = show(compareTexts("same words here", "same words there"));
    expect(root.querySelector(".diff__text")?.textContent).toContain("same words ");
    expect(Array.from(root.querySelectorAll("ins, del")).some((n) => n.textContent?.includes("same"))).toBe(false);
  });

  it("renders a whitespace-only change as plain text, with no ins or del", () => {
    const { root } = show(compareTexts("alpha beta", "alpha  beta"));
    expect(root.querySelector("ins")).toBeNull();
    expect(root.querySelector("del")).toBeNull();
    expect(root.textContent).toContain("alpha");
    expect(root.textContent).toContain("beta");
    expect(root.querySelector(".sr-only")).toBeNull();
  });

  it("says there is no word-level difference when nothing is marked", () => {
    const { root } = show(compareTexts("alpha\nbeta", "alpha beta"));
    expect(root.textContent).toContain(t("panel.noDifference"));
    const { root: other } = show(compareTexts("alpha", "beta"));
    expect(other.textContent).not.toContain(t("panel.noDifference"));
  });

  it("shows the too-long message for too_long and for too_costly", () => {
    const tooLong = compareTexts("x".repeat(20_001), "y");
    expect(tooLong).toEqual({ ok: false, reason: "too_long" });
    const costly = compareTexts("a b c d e f", "f e d c b a", { maxEditLength: 1 });
    expect(costly).toEqual({ ok: false, reason: "too_costly" });
    for (const result of [tooLong, costly]) {
      const { root } = show(result);
      expect(root.textContent).toBe(t("panel.tooLong"));
      expect(root.querySelector("ins, del")).toBeNull();
      cleanup();
    }
  });

  it("sets lang on the compared text", () => {
    const { root } = show(compareTexts("가 나", "가 다"), "ko");
    expect(root.querySelector(".diff__text")?.getAttribute("lang")).toBe("ko");
  });

  it("reads back both texts: without the deleted parts it is the new text, without the inserted parts the old text up to spacing", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z ]{0,30}$/), fc.stringMatching(/^[a-z ]{0,30}$/), (a, b) => {
        const result = compareTexts(a, b);
        if (!result.ok) return true;
        const { root } = show(result);
        const text = root.querySelector(".diff__text")!;
        // leave out the hidden words, then compare with the two inputs
        const clone = text.cloneNode(true) as HTMLElement;
        clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
        const old = Array.from(clone.childNodes).filter((n) => n.nodeName !== "INS").map((n) => n.textContent).join("");
        const next = Array.from(clone.childNodes).filter((n) => n.nodeName !== "DEL").map((n) => n.textContent).join("");
        cleanup();
        const bare = (s: string) => s.replace(/\s+/g, "");
        return next === b && bare(old) === bare(a);
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});
