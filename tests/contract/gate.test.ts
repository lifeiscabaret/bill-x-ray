import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GATE_REASONS, parseCase } from "../../src/contract";
import type { Case, GateReason } from "../../src/contract";
import { gateEvidence } from "../../src/contract/gate";
import { clone, gatedCase, matchedCheck, SOURCE_URL, withEvidence, withVersion } from "./gate-fixtures";
import { options } from "./helpers";

const gateOf = (c: Case) => gateEvidence(c.evidence[0]!, c.documents[0]!);
const reasonsOf = (c: Case) => gateOf(c).reasons;
const parsed = (c: Case) => parseCase(c, options);
const rowOf = (c: Case) => parsed(c).model!.gate["ev-1"];

describe("the gate passes a complete row", () => {
  it("passes with one role and no second check", () => {
    expect(gateOf(gatedCase())).toEqual({ pass: true, reasons: [], effectiveState: "matched_official" });
  });
  it("passes through parseCase and fills ScanModel.gate, with no issues", () => {
    const r = parsed(gatedCase());
    expect(r.issues).toEqual([]);
    expect(r.model!.gate).toEqual({ "ev-1": { pass: true, reasons: [], effectiveState: "matched_official" } });
  });
  it("passes with the second role set, and with a role B alone", () => {
    expect(gateOf(withEvidence({ check: matchedCheck({ confirmedBy: "B", confirmedAt: "2026-11-21", confirmedUrl: SOURCE_URL }) })).pass).toBe(true);
    expect(gateOf(withEvidence({ check: matchedCheck({ checkedBy: "B" }) })).pass).toBe(true);
  });
  it("accepts an excerpt of 300 characters on an official version", () => {
    expect(reasonsOf(withEvidence({ excerpt: "x".repeat(300) }))).toEqual([]);
  });
  it("counts Korean characters one by one", () => {
    expect(reasonsOf(withEvidence({ excerpt: "가".repeat(300) }))).toEqual([]);
    expect(reasonsOf(withEvidence({ excerpt: "가".repeat(301) }))).toEqual(["excerpt_too_long"]);
  });
  it("compares URLs after look-alike normalization", () => {
    const c = withEvidence({ check: matchedCheck({ url: "https\u2236//example\u00B7org/bill-1-v1" }) });
    expect(reasonsOf(c)).toEqual([]);
  });
});

// One fixture per failing reason code. `through` says whether parseCase keeps the row: a row
// with a block issue leaves the model before the gate (the gate is still run on it directly).
const reasonFixtures: { reason: GateReason; why: string; build: () => Case; expected: GateReason[]; through: boolean }[] = [
  { reason: "not_official_source", why: "sourceKind other", build: () => withVersion({ sourceKind: "other" }), expected: ["not_official_source"], through: true },
  { reason: "source_url_missing", why: "sourceUrl null (the opened URL then differs too)", build: () => withVersion({ sourceUrl: null }), expected: ["source_url_missing", "checked_other_url"], through: true },
  { reason: "source_url_missing", why: "sourceUrl 'unknown'", build: () => withVersion({ sourceUrl: "unknown" }), expected: ["source_url_missing", "checked_other_url"], through: true },
  { reason: "source_url_invalid", why: "not an http(s) URL", build: () => { const c = withVersion({ sourceUrl: "ftp://example.org/x" }); c.evidence[0]!.check.url = "ftp://example.org/x"; return c; }, expected: ["source_url_invalid"], through: false },
  { reason: "anchor_missing", why: "empty anchor", build: () => withEvidence({ anchor: "" }), expected: ["anchor_missing"], through: true },
  { reason: "anchor_missing", why: "blank anchor", build: () => withEvidence({ anchor: "   " }), expected: ["anchor_missing"], through: true },
  { reason: "excerpt_missing", why: "empty excerpt", build: () => withEvidence({ excerpt: "" }), expected: ["excerpt_missing"], through: true },
  { reason: "excerpt_too_long", why: "301 characters on an official version", build: () => withEvidence({ excerpt: "x".repeat(301) }), expected: ["excerpt_too_long"], through: false },
  { reason: "excerpt_too_long", why: "201 characters on a non-official version", build: () => { const c = withVersion({ sourceKind: "other" }); c.evidence[0]!.excerpt = "x".repeat(201); return c; }, expected: ["not_official_source", "excerpt_too_long"], through: false },
  { reason: "not_checked", why: "state not_checked", build: () => withEvidence({ check: matchedCheck({ state: "not_checked" }) }), expected: ["not_checked"], through: true },
  { reason: "partial", why: "state partial", build: () => withEvidence({ check: matchedCheck({ state: "partial" }) }), expected: ["partial"], through: true },
  { reason: "could_not_open", why: "state could_not_open", build: () => withEvidence({ check: matchedCheck({ state: "could_not_open" }) }), expected: ["could_not_open"], through: true },
  { reason: "mismatch", why: "state mismatch", build: () => withEvidence({ check: matchedCheck({ state: "mismatch" }) }), expected: ["mismatch"], through: true },
  {
    reason: "pasted_text_only", why: "not checked, excerpt found in the pasted text",
    build: () => { const c = withVersion({ pastedText: "Before. Invented clause text. After." }); c.evidence[0]!.check = matchedCheck({ state: "not_checked", url: null, checkedBy: null, checkedAt: null }); return c; },
    expected: ["pasted_text_only", "checker_missing"], through: true,
  },
  { reason: "checked_other_url", why: "check.url differs from sourceUrl", build: () => withEvidence({ check: matchedCheck({ url: "https://example.org/other" }) }), expected: ["checked_other_url"], through: true },
  { reason: "checked_other_url", why: "confirmedUrl differs from sourceUrl", build: () => withEvidence({ check: matchedCheck({ confirmedBy: "B", confirmedAt: "2026-11-21", confirmedUrl: "https://example.org/other" }) }), expected: ["checked_other_url"], through: true },
  { reason: "checked_other_url", why: "matched but no URL recorded", build: () => withEvidence({ check: matchedCheck({ url: null }) }), expected: ["checked_other_url"], through: true },
  { reason: "checker_missing", why: "checkedBy null", build: () => withEvidence({ check: matchedCheck({ checkedBy: null }) }), expected: ["checker_missing"], through: true },
  { reason: "checker_missing", why: "checkedAt null", build: () => withEvidence({ check: matchedCheck({ checkedAt: null }) }), expected: ["checker_missing"], through: true },
  { reason: "checker_missing", why: "checkedAt 'unknown'", build: () => withEvidence({ check: matchedCheck({ checkedAt: "unknown" }) }), expected: ["checker_missing"], through: true },
  { reason: "checker_missing", why: "checkedAt is only a month", build: () => withEvidence({ check: matchedCheck({ checkedAt: "2026-11" }) }), expected: ["checker_missing"], through: true },
  { reason: "checker_missing", why: "checkedAt is not a calendar day", build: () => withEvidence({ check: matchedCheck({ checkedAt: "2026-02-30" }) }), expected: ["checker_missing"], through: true },
  { reason: "checker_missing", why: "only confirmedBy is set", build: () => withEvidence({ check: matchedCheck({ checkedBy: null, checkedAt: null, confirmedBy: "B", confirmedAt: "2026-11-21", confirmedUrl: SOURCE_URL }) }), expected: ["checker_missing"], through: true },
  { reason: "excerpt_not_in_pasted_text", why: "pasted text lacks the excerpt", build: () => withVersion({ pastedText: "A text without the clause." }), expected: ["excerpt_not_in_pasted_text"], through: false },
];

describe("one fixture per failing reason code", () => {
  it("covers every reason code of the gate table", () => {
    expect(new Set(reasonFixtures.map((f) => f.reason))).toEqual(new Set(GATE_REASONS));
  });

  for (const f of reasonFixtures) {
    it(`${f.reason}: ${f.why}`, () => {
      const c = f.build();
      const g = gateOf(c);
      expect(g.pass).toBe(false);
      expect(g.reasons).toEqual(f.expected);
      expect(g.reasons).toContain(f.reason);
      const row = rowOf(c);
      if (f.through) expect(row).toEqual(g);
      else expect(row).toBeUndefined(); // a block issue removed the row first (design "Severities")
    });
  }

  it("lists every failing reason of a row, in the order of the gate table", () => {
    const c = withVersion({ sourceKind: "other", sourceUrl: null });
    Object.assign(c.evidence[0]!, { anchor: "", excerpt: "" });
    c.evidence[0]!.check = matchedCheck({ state: "mismatch", url: "https://example.org/x", checkedBy: null });
    expect(reasonsOf(c)).toEqual([
      "not_official_source", "source_url_missing", "anchor_missing", "excerpt_missing", "mismatch", "checked_other_url", "checker_missing",
    ]);
  });
});

describe("a valid check record is not enough (scan-screen 4 shows roles and dates only when pass is true)", () => {
  // Every row below carries a check record that counts on its own: matched_official, the URL
  // opened equals the source URL, one role and a date. Each fails one rule outside the record.
  const outside: [string, () => Case][] = [
    ["not an official source", () => withVersion({ sourceKind: "other" })],
    ["news of the newspaper's own", () => withVersion({ sourceKind: "news", ownOutlet: true })],
    ["no anchor", () => withEvidence({ anchor: "" })],
    ["no excerpt", () => withEvidence({ excerpt: "" })],
    ["an excerpt over the limit", () => withEvidence({ excerpt: "x".repeat(301) })],
    ["an excerpt that is not in the pasted text", () => withVersion({ pastedText: "A text without the clause." })],
    ["an invalid source URL", () => { const c = withVersion({ sourceUrl: "ftp://example.org/x" }); c.evidence[0]!.check.url = "ftp://example.org/x"; return c; }],
  ];
  for (const [what, build] of outside) {
    it(`keeps pass false: ${what}`, () => {
      const c = build();
      const check = c.evidence[0]!.check;
      expect(check).toMatchObject({ state: "matched_official", checkedBy: "A", checkedAt: "2026-11-20" });
      expect(gateOf(c).pass).toBe(false);
    });
  }
  it("passes only when the check record counts: each of its own failures turns pass off", () => {
    expect(gateOf(gatedCase()).pass).toBe(true);
    for (const change of [
      { state: "partial" }, { url: "https://example.org/other" }, { confirmedUrl: "https://example.org/other" },
      { checkedBy: null }, { checkedAt: null },
    ] as const) {
      expect(gateOf(withEvidence({ check: matchedCheck(change) })).pass).toBe(false);
    }
  });
});

describe("translation, news and provenance", () => {
  it("never accepts a translation as evidence: an empty original fails whatever the translation says", () => {
    const c = withEvidence({ excerpt: "", translation: { text: "Invented clause text.", language: "en" } });
    expect(reasonsOf(c)).toEqual(["excerpt_missing"]);
    expect(rowOf(c)!.pass).toBe(false);
  });
  it("gives the same result with and without a translation", () => {
    const plain = gateOf(gatedCase());
    const withTranslation = gateOf(withEvidence({ translation: { text: "Some other words entirely.", language: "ko" } }));
    expect(withTranslation).toEqual(plain);
    const failing = withEvidence({ check: matchedCheck({ state: "partial" }) });
    const failingWith = withEvidence({ check: matchedCheck({ state: "partial" }), translation: { text: "x", language: "en" } });
    expect(gateOf(failingWith)).toEqual(gateOf(failing));
  });
  it("never reads provenance", () => {
    const c = withEvidence({ provenance: ["B3a-EVI-0001", "matched_official", "load_as_is"], check: matchedCheck({ state: "not_checked" }) });
    c.documents[0]!.provenance = ["verified_opened"];
    expect(reasonsOf(c)).toEqual(["not_checked"]);
    expect(reasonsOf(withEvidence({ provenance: ["anything"] }))).toEqual([]);
  });

  const news = (own: boolean | undefined, excerpt: string): Case => {
    const c = withVersion({ sourceKind: "news", publisher: "Example Daily", ...(own === undefined ? {} : { ownOutlet: own }) });
    c.evidence[0]!.excerpt = excerpt;
    return c;
  };
  it("never passes news from another outlet, with or without an excerpt", () => {
    for (const own of [undefined, false]) {
      const without = news(own, "");
      expect(gateOf(without).pass).toBe(false);
      expect(gateOf(without).reasons).toContain("not_official_source");
      expect(rowOf(without)!.pass).toBe(false); // an empty excerpt is allowed, so the row stays and fails

      const withText = news(own, "Short synthetic words.");
      expect(gateOf(withText).pass).toBe(false);
      expect(gateOf(withText).reasons).toContain("not_official_source");
      const r = parsed(withText);
      expect(r.issues.map((i) => i.code)).toContain("news_excerpt_not_allowed");
      expect(r.model!.gate["ev-1"]).toBeUndefined(); // the excerpt is blocked, so the row never reaches the gate
    }
  });
  it("never passes the newspaper's own news, even when everything else is complete", () => {
    const c = news(true, "Short synthetic words.");
    expect(gateOf(c).pass).toBe(false);
    expect(gateOf(c).reasons).toEqual(["not_official_source"]);
    expect(rowOf(c)).toMatchObject({ pass: false, reasons: ["not_official_source"] });
  });
});

describe("pasted text", () => {
  it("ends a row that was not checked on the official page at pasted_text_only, and never passes it", () => {
    const c = withVersion({ pastedText: "Before. Invented clause text. After." });
    c.evidence[0]!.check = matchedCheck({ state: "not_checked" });
    expect(gateOf(c)).toMatchObject({ pass: false, effectiveState: "pasted_text_only" });
    expect(rowOf(c)).toMatchObject({ pass: false, effectiveState: "pasted_text_only" });
  });
  it("keeps not_checked when the excerpt is not in the pasted text", () => {
    const c = withVersion({ pastedText: "Something else." });
    c.evidence[0]!.check = matchedCheck({ state: "not_checked" });
    expect(gateOf(c).effectiveState).toBe("not_checked");
  });
  it("lets a row matched on the official page pass when its excerpt is in the pasted text", () => {
    expect(gateOf(withVersion({ pastedText: "Before. Invented clause text. After." })).pass).toBe(true);
  });
});

describe("the gate is a function of the row and its version only", () => {
  it("does not change when the translation or provenance change (200 runs)", () => {
    const text = fc.string({ maxLength: 40 });
    fc.assert(
      fc.property(text, text, fc.array(text, { maxLength: 3 }), (t, lang, prov) => {
        const base = gatedCase();
        const noisy = clone(base);
        noisy.evidence[0]!.translation = { text: t, language: lang };
        noisy.evidence[0]!.provenance = prov;
        expect(gateOf(noisy)).toEqual(gateOf(base));
      }),
      { numRuns: 200 },
    );
  });
  it("has reasons exactly when it does not pass (200 runs)", () => {
    const states = fc.constantFrom(...(["matched_official", "partial", "could_not_open", "not_checked", "mismatch"] as const));
    const roles = fc.constantFrom(...([null, "A", "B"] as const));
    fc.assert(
      fc.property(states, roles, fc.constantFrom(null, "2026-11-20", "2026-11"), fc.string({ maxLength: 5 }), (state, by, at, anchor) => {
        const c = withEvidence({ anchor, check: matchedCheck({ state, checkedBy: by, checkedAt: at }) });
        const g = gateOf(c);
        expect(g.pass).toBe(g.reasons.length === 0);
        if (g.pass) expect(state).toBe("matched_official");
      }),
      { numRuns: 200 },
    );
  });
});
