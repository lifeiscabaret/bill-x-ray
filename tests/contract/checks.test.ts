import { describe, expect, it } from "vitest";
import { parseCase } from "../../src/contract";
import { checkPathKinds, checkRecords, checkReferences, effectiveState } from "../../src/contract/checks";
import { checkFixtures, richCase, urlFixtures } from "../fixtures/contract/stage23";
import { runFixture } from "./fixture-runner";
import { options } from "./helpers";

describe("semantic check fixtures (parse stage 3)", () => {
  it.each(checkFixtures.map((f) => [f.name, f] as const))("%s", (_name, fx) => {
    runFixture(fx);
  });

  it("the rich case parses without issues", () => {
    const c = richCase();
    expect(parseCase(c, options)).toEqual({ model: expect.objectContaining({ case: c, excluded: [] }), issues: [] });
  });

  it("every rule of 3.1 and 3.2 has a fixture that triggers it", () => {
    const seen = new Set([...urlFixtures, ...checkFixtures].flatMap((f) => f.expect.map(([, code, severity]) => `${code}:${severity}`)));
    const rules = [
      "url_lookalike_fixed:warn", "url_missing:warn", "url_invalid:block", "url_session_token:warn",
      "duplicate_id:block", "ref_unresolved:block", "title_missing:block", "publisher_missing:block",
      "excerpt_too_long:block", "news_excerpt_not_allowed:block", "excerpt_not_in_pasted_text:block",
      "anchor_not_in_pasted_text:warn", "kind_endpoint_mismatch:block",
    ];
    for (const rule of rules) expect(seen.has(rule), rule).toBe(true);
  });

  it("the severity of each code matches the design's severity table", () => {
    const all = [...urlFixtures, ...checkFixtures].flatMap((f) => f.expect);
    for (const [, code, severity] of all) {
      const warns = ["url_missing", "url_lookalike_fixed", "url_session_token", "anchor_not_in_pasted_text"];
      expect(severity, code).toBe(warns.includes(code) ? "warn" : "block");
    }
  });
});

describe("removal and positions", () => {
  it("a warning keeps its record and a block removes it, whatever the position in the input", () => {
    const c = richCase();
    c.documents[0]!.pastedText = "Section one. Invented clause text."; // anchor warning on ev-1
    c.evidence.unshift({ ...c.evidence[1]!, evidenceId: "ev-0", excerpt: "x".repeat(301) }); // blocked, shifts every later index
    const { model, issues } = parseCase(c, options);
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      [["evidence", 0, "excerpt"], "excerpt_too_long"],
      [["evidence", 1, "anchor"], "anchor_not_in_pasted_text"],
    ]);
    expect(model!.case.evidence.map((e) => e.evidenceId)).toEqual(["ev-1", "ev-2"]);
    expect(model!.excluded).toEqual([{ path: ["evidence", 0], reason: "excerpt_too_long" }]);
  });

  it("a record that points at a removed record is removed in turn, down the chain", () => {
    const c = richCase();
    c.documents[2]!.title = ""; // Law 2 goes, then ev-2 (on it), then the path that cites ev-2
    c.paths[0]!.evidenceRefs = ["ev-1", "ev-2"];
    c.events[0]!.evidenceRefs = ["ev-2"];
    const { model, issues } = parseCase(c, options);
    expect(issues.map((i) => [i.path, i.code])).toEqual([
      [["documents", 2, "title"], "title_missing"],
      [["evidence", 1, "documentId"], "ref_unresolved"],
      [["events", 0, "evidenceRefs", 0], "ref_unresolved"],
      [["paths", 0, "evidenceRefs", 1], "ref_unresolved"],
    ]);
    expect(model!.case.paths).toEqual([]);
    expect(model!.case.events).toEqual([]);
    expect(model!.case.evidence.map((e) => e.evidenceId)).toEqual(["ev-1"]);
  });

  it("every stage function leaves a clean case alone", () => {
    const c = richCase();
    expect([checkRecords(c), checkReferences(c), checkPathKinds(c)]).toEqual([[], [], []]);
  });
});

describe("derived pasted_text_only state", () => {
  const withPasted = (state: "not_checked" | "matched_official" | "partial", pasted: string | null) => {
    const c = richCase();
    c.documents[0]!.pastedText = pasted;
    c.evidence[0]!.check.state = state;
    return effectiveState(c.evidence[0]!, c.documents[0]);
  };

  it("a row not checked on the official page whose excerpt is in the pasted text is pasted_text_only", () => {
    expect(withPasted("not_checked", "Sec. 1 Invented clause text.")).toBe("pasted_text_only");
  });

  it("keeps the stored state otherwise", () => {
    expect(withPasted("not_checked", null)).toBe("not_checked");
    expect(withPasted("not_checked", "")).toBe("not_checked");
    expect(withPasted("not_checked", "Other words.")).toBe("not_checked");
    expect(withPasted("matched_official", "Sec. 1 Invented clause text.")).toBe("matched_official");
    expect(withPasted("partial", "Sec. 1 Invented clause text.")).toBe("partial");
  });

  it("is not stored in the Case and does not change the parse result", () => {
    const c = richCase();
    c.documents[0]!.pastedText = "Sec. 1 Invented clause text.";
    const { model } = parseCase(c, options);
    expect(model!.case.evidence[0]!.check.state).toBe("not_checked");
  });

  it("an evidence row without a version resolves to its stored state", () => {
    const c = richCase();
    expect(effectiveState(c.evidence[0]!, undefined)).toBe("not_checked");
  });
});
