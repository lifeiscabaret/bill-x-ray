import { describe, expect, it } from "vitest";
import {
  deriveStatus, deriveStatuses, GATE_REASONS, NEED_CODES, parseCase, PATH_KINDS, trackOf,
  type Case, type Evidence, type GateReason, type GateResult, type NeedCode, type Path, type PathKind,
} from "../../src/contract";
import { gateCase } from "../../src/contract/gate";
import { options } from "./helpers";

// Synthetic cases: invented ids, wording and dates. Bill A has versions v1 to v3, Bill B is a
// separate law. Every evidence row passes the gate until a test changes it.

const url = (id: string) => `https://example.org/${id}`;
const doc = (documentId: string, versionId: string, extra: Partial<Case["documents"][number]> = {}): Case["documents"][number] => ({
  documentId, versionId, localEventLabel: null, sourceUrl: url(`${documentId}-${versionId}`.replace(/\W+/g, "-")),
  title: `${documentId} ${versionId} title`, publisher: "Example Parliament", sourceKind: "official", language: "en", ...extra,
});
const row = (evidenceId: string, d: Case["documents"][number], excerpt: string): Evidence => ({
  evidenceId, documentId: d.documentId, versionId: d.versionId, anchor: `Sec. ${evidenceId}`, excerpt,
  check: {
    state: "matched_official", url: d.sourceUrl, checkedBy: "A", checkedAt: "2026-11-20",
    confirmedBy: null, confirmedAt: null, confirmedUrl: null,
  },
});

function baseCase(): Case {
  const [a1, a2, a3, b] = [doc("Bill A", "v1"), doc("Bill A", "v2"), doc("Bill A", "v3"), doc("Bill B", "enr")];
  return {
    contractVersion: 1, caseId: "fixture-status", title: "Status fixture", jurisdiction: "XX", session: null,
    promise: { statement: "Invented promise.", sourceTitle: "Invented item", publisher: "Example Outlet", sourceUrl: url("promise"), date: "2026-01-01" },
    documents: [a1, a2, a3, b],
    evidence: [row("a1", a1, "Invented clause one."), row("a2", a2, "Invented clause two."), row("a3", a3, "Invented clause three."), row("b1", b, "Invented separate clause.")],
    events: [],
    paths: [],
  };
}

const version = (documentId: string, versionId: string) => ({ type: "version", documentId, versionId }) as const;
const clause = (evidenceId: string) => ({ type: "clause", evidenceId }) as const;

/** A path of each kind that is confirmed on `baseCase()`. */
const confirmedPath: Record<PathKind, Path> = {
  next_version: { pathId: "p", from: version("Bill A", "v1"), to: version("Bill A", "v2"), kind: "next_version", evidenceRefs: ["a1"], reviewState: "unverified" },
  successor_document: { pathId: "p", from: version("Bill A", "v2"), to: version("Bill B", "enr"), kind: "successor_document", evidenceRefs: ["b1"], reviewState: "unverified" },
  carried: { pathId: "p", from: clause("a1"), to: clause("a2"), kind: "carried", evidenceRefs: ["a1", "a2"], reviewState: "unverified" },
  transferred: { pathId: "p", from: clause("a2"), to: clause("b1"), kind: "transferred", evidenceRefs: ["a2", "b1"], reviewState: "unverified" },
  same_outcome_separate_law: { pathId: "p", from: clause("a1"), to: clause("b1"), kind: "same_outcome_separate_law", evidenceRefs: ["a1", "b1"], reviewState: "unverified" },
  not_included: {
    pathId: "p", from: clause("a1"), to: version("Bill A", "v2"), kind: "not_included", evidenceRefs: ["a2"], reviewState: "unverified",
    absenceCheck: {
      documentId: "Bill A", versionId: "v2", scope: "whole_text", searchedFor: ["invented term"],
      checkedBy: "A", checkedAt: "2026-11-20", confirmedBy: null, confirmedAt: null,
    },
  },
};

function caseWith(path: Path, change: (c: Case) => void = () => {}): Case {
  const c = baseCase();
  c.paths = [structuredClone(path)];
  change(c);
  return c;
}
const derive = (c: Case, index = 0) => deriveStatus(c.paths[index]!, c, gateCase(c));
const codes = (r: { needs: { code: NeedCode }[] }) => r.needs.map((n) => n.code);
const fail = (c: Case, evidenceId: string, state: Evidence["check"]["state"] = "not_checked") => {
  c.evidence.find((e) => e.evidenceId === evidenceId)!.check.state = state;
};

describe("track and kind (6.2)", () => {
  it.each([
    ["next_version", "number"], ["successor_document", "number"], ["carried", "clause"],
    ["transferred", "clause"], ["same_outcome_separate_law", "clause"], ["not_included", "clause"],
  ] as const)("%s is on the %s track, derived from the kind", (kind, track) => {
    expect(trackOf(kind)).toBe(track);
    expect(derive(caseWith(confirmedPath[kind])).track).toBe(track);
  });

  it("the table above covers every kind", () => {
    expect(Object.keys(confirmedPath).sort()).toEqual([...PATH_KINDS].sort());
  });
});

describe("every kind is confirmed with passing evidence, and only then (rule 6)", () => {
  it.each(PATH_KINDS)("%s: confirmed, drawable, nothing needed", (kind) => {
    expect(derive(caseWith(confirmedPath[kind]))).toMatchObject({ status: "confirmed", drawable: true, needs: [], setAside: [], overclaim: false });
  });

  it.each(["next_version", "successor_document", "carried", "transferred"] as const)("%s: one failing row is not verified and names that row", (kind) => {
    const path = confirmedPath[kind];
    const c = caseWith(path, (x) => fail(x, path.evidenceRefs[0]!));
    expect(derive(c)).toMatchObject({
      status: "not_verified", drawable: true, needs: [{ code: "open_official_source", params: { evidenceId: path.evidenceRefs[0] } }],
    });
  });

  it("one failing row among passing rows keeps the path from confirming", () => {
    const c = caseWith(confirmedPath.carried, (x) => fail(x, "a2", "mismatch"));
    expect(derive(c)).toMatchObject({ status: "not_verified", needs: [{ code: "resolve_mismatch", params: { evidenceId: "a2" } }] });
  });

  it("a row that fails for several reasons lists each need once", () => {
    const c = caseWith(confirmedPath.next_version, (x) => {
      x.evidence[0]!.anchor = "";
      x.evidence[0]!.check = { ...x.evidence[0]!.check, state: "could_not_open", checkedBy: null };
    });
    expect(codes(derive(c)).sort()).toEqual(["add_anchor", "open_official_source", "record_check"]);
  });

  // The need each gate reason asks for, written out here and not read from status.ts.
  const needOf: Record<GateReason, NeedCode> = {
    not_official_source: "use_official_source", source_url_missing: "add_official_url", source_url_invalid: "add_official_url",
    anchor_missing: "add_anchor", excerpt_missing: "add_excerpt", excerpt_too_long: "shorten_excerpt",
    not_checked: "open_official_source", partial: "resolve_mismatch", could_not_open: "open_official_source",
    mismatch: "resolve_mismatch", pasted_text_only: "open_official_source", checked_other_url: "check_same_url",
    checker_missing: "record_check", excerpt_not_in_pasted_text: "resolve_mismatch",
  };

  it("the table covers every gate reason", () => {
    expect(Object.keys(needOf).sort()).toEqual([...GATE_REASONS].sort());
  });

  it.each(GATE_REASONS)("gate reason %s asks for the matching need, and every need is a known code", (reason) => {
    const c = caseWith(confirmedPath.next_version);
    const gate: Record<string, GateResult> = { ...gateCase(c), a1: { pass: false, reasons: [reason], effectiveState: "not_checked" } };
    const r = deriveStatus(c.paths[0]!, c, gate);
    expect(r.status).toBe("not_verified");
    expect(r.needs).toEqual([{ code: needOf[reason], params: { evidenceId: "a1" } }]);
    expect(NEED_CODES).toContain(needOf[reason]);
  });

  it("reads only gate[id].pass: a pass with leftover reasons confirms, a fail with no reasons does not", () => {
    const c = caseWith(confirmedPath.next_version);
    const pass = { ...gateCase(c), a1: { pass: true, reasons: ["not_checked"], effectiveState: "not_checked" } as GateResult };
    expect(deriveStatus(c.paths[0]!, c, pass).status).toBe("confirmed");
    const none = { ...gateCase(c), a1: { pass: false, reasons: [], effectiveState: "matched_official" } as GateResult };
    expect(deriveStatus(c.paths[0]!, c, none)).toMatchObject({ status: "not_verified", needs: [] });
  });
});

describe("rule 1: an endpoint or an evidence reference does not resolve", () => {
  const cases: [string, (c: Case) => void, string][] = [
    ["a version endpoint", (c) => { c.paths[0]!.to = version("Bill A", "v9"); }, "to"],
    ["the from endpoint", (c) => { c.paths[0]!.from = version("Bill Z", "v1"); }, "from"],
  ];
  it.each(cases)("%s that does not exist: not verified, not drawable, fix_reference", (_name, change, field) => {
    expect(derive(caseWith(confirmedPath.next_version, change))).toMatchObject({
      status: "not_verified", drawable: false, needs: [{ code: "fix_reference", params: { field } }],
    });
  });

  it("a clause endpoint that does not exist", () => {
    const c = caseWith(confirmedPath.carried, (x) => { x.paths[0]!.to = clause("ghost"); });
    expect(derive(c)).toMatchObject({ status: "not_verified", drawable: false, needs: [{ code: "fix_reference", params: { field: "to" } }] });
  });

  it("a promise endpoint when the case has no promise", () => {
    const c = caseWith({ ...confirmedPath.carried, from: { type: "promise" } }, (x) => { delete x.promise; });
    expect(derive(c)).toMatchObject({ status: "not_verified", drawable: false, needs: [{ code: "fix_reference", params: { field: "from" } }] });
  });

  it("an evidence reference that does not exist", () => {
    const c = caseWith(confirmedPath.next_version, (x) => { x.paths[0]!.evidenceRefs = ["a1", "ghost"]; });
    expect(derive(c)).toMatchObject({ status: "not_verified", drawable: false, needs: [{ code: "fix_reference", params: { evidenceId: "ghost" } }] });
  });

  it("an evidence row that has no gate result cannot be judged", () => {
    const c = caseWith(confirmedPath.next_version);
    const gate = gateCase(c);
    delete gate.a1;
    expect(deriveStatus(c.paths[0]!, c, gate)).toMatchObject({ status: "not_verified", drawable: false, needs: [{ code: "fix_reference", params: { evidenceId: "a1" } }] });
  });

  it("comes before rule 2: a broken endpoint with no evidence still asks for the reference", () => {
    const c = caseWith(confirmedPath.next_version, (x) => { x.paths[0]!.to = version("Bill A", "v9"); x.paths[0]!.evidenceRefs = []; });
    expect(derive(c)).toMatchObject({ status: "not_verified", drawable: false, needs: [{ code: "fix_reference", params: { field: "to" } }] });
  });

  it("is a status the contract can give a recorded confirmed path too", () => {
    const c = caseWith({ ...confirmedPath.next_version, reviewState: "confirmed" }, (x) => { x.paths[0]!.to = version("Bill A", "v9"); });
    expect(derive(c)).toMatchObject({ status: "not_verified", overclaim: true });
  });
});

describe("rule 2: no evidence", () => {
  it.each(PATH_KINDS)("%s with an empty evidenceRefs is evidence missing, not drawable", (kind) => {
    const c = caseWith({ ...confirmedPath[kind], evidenceRefs: [] });
    expect(derive(c)).toMatchObject({ status: "evidence_missing", drawable: false, needs: [{ code: "add_evidence" }] });
  });
});

describe("rule 3: a title or a number is not clause evidence", () => {
  it("a row whose excerpt is its version's title is set aside, and the path stays unconfirmed when nothing is left", () => {
    const c = caseWith(confirmedPath.carried, (x) => { x.paths[0]!.evidenceRefs = ["a1"]; x.evidence[0]!.excerpt = "Bill A v1 title"; });
    expect(derive(c)).toMatchObject({ status: "evidence_missing", drawable: false, needs: [{ code: "add_clause_evidence" }], setAside: [0] });
  });

  it("a row whose excerpt is its documentId is set aside", () => {
    const c = caseWith(confirmedPath.same_outcome_separate_law, (x) => { x.evidence[3]!.excerpt = "Bill B"; });
    expect(derive(c)).toMatchObject({ setAside: [1] });
  });

  it("case and spacing do not hide it", () => {
    const c = caseWith(confirmedPath.carried, (x) => { x.paths[0]!.evidenceRefs = ["a1"]; x.evidence[0]!.excerpt = "  bill   A  "; });
    expect(derive(c)).toMatchObject({ status: "evidence_missing", setAside: [0] });
  });

  it("a set-aside row neither confirms nor blocks: the rows that are left decide", () => {
    const c = caseWith(confirmedPath.carried, (x) => { x.evidence[0]!.excerpt = "Bill A"; });
    expect(derive(c)).toMatchObject({ status: "confirmed", setAside: [0] });
    const failing = caseWith(confirmedPath.carried, (x) => { x.evidence[0]!.excerpt = "Bill A"; fail(x, "a2"); });
    expect(derive(failing)).toMatchObject({ status: "not_verified", setAside: [0] });
  });

  it("a set-aside row does not count as passing evidence for a separate law", () => {
    const c = caseWith(confirmedPath.same_outcome_separate_law, (x) => { x.evidence[3]!.excerpt = "Bill B"; });
    const r = derive(c);
    expect(r.status).toBe("not_verified");
    expect(codes(r)).toEqual(["evidence_from_both_documents"]);
  });

  it("a set-aside row does not count as the checked version's evidence for not_included", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { x.evidence[1]!.excerpt = "Bill A v2 title"; });
    expect(derive(c)).toMatchObject({ status: "evidence_missing", needs: [{ code: "add_clause_evidence" }], setAside: [0] });
  });

  it("the number track keeps such a row: a version path may rest on the title page", () => {
    const c = caseWith(confirmedPath.next_version, (x) => { x.evidence[0]!.excerpt = "Bill A"; });
    expect(derive(c)).toMatchObject({ status: "confirmed", setAside: [] });
  });

  it("parseCase reports one number_or_title_as_evidence warning at the evidenceRefs position", () => {
    const input = caseWith(confirmedPath.carried, (x) => { x.evidence[0]!.excerpt = "Bill A"; });
    const r = parseCase(input, options);
    const w = r.issues.filter((i) => i.code === "number_or_title_as_evidence");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ path: ["paths", 0, "evidenceRefs", 0], severity: "warn", params: { pathId: "p", evidenceId: "a1" } });
    expect(r.model!.paths.p!.status).toBe("confirmed");
  });
});

describe("rule 4: not_included and its absence check", () => {
  const absence = (c: Case) => c.paths[0]!.absenceCheck!;

  it("confirmed with the version named, a scope, one role and a date, and a passing row from that version", () => {
    expect(derive(caseWith(confirmedPath.not_included))).toMatchObject({ status: "confirmed", drawable: true, needs: [] });
  });

  it("a list of articles is a scope too", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { absence(x).scope = { articles: ["Sec. 2"] }; });
    expect(derive(c).status).toBe("confirmed");
  });

  it("a second role is not required (D-008)", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { Object.assign(absence(x), { confirmedBy: null, confirmedAt: null }); });
    expect(derive(c).status).toBe("confirmed");
  });

  it("no absence check: omission not verified, still drawable, and every missing item is listed", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { x.paths[0]!.absenceCheck = null; });
    expect(derive(c)).toMatchObject({ status: "omission_not_verified", drawable: true });
    expect(codes(derive(c))).toEqual(["name_checked_version", "record_scope", "record_absence_checker"]);
  });

  it("an absence check of another version: name_checked_version only", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { absence(x).versionId = "v3"; });
    expect(derive(c)).toMatchObject({ status: "omission_not_verified", needs: [{ code: "name_checked_version" }] });
  });

  it("an absence check of another document: name_checked_version", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { absence(x).documentId = "Bill B"; absence(x).versionId = "enr"; });
    expect(codes(derive(c))).toEqual(["name_checked_version"]);
  });

  it("an empty list of articles is no scope", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { absence(x).scope = { articles: [] }; });
    expect(derive(c)).toMatchObject({ status: "omission_not_verified", needs: [{ code: "record_scope" }] });
    const blank = caseWith(confirmedPath.not_included, (x) => { absence(x).scope = { articles: ["  "] }; });
    expect(codes(derive(blank))).toEqual(["record_scope"]);
  });

  it.each([
    ["no role", { checkedBy: null }],
    ["no date", { checkedAt: null }],
    ["a year instead of a day", { checkedAt: "2026" }],
    ["a day that does not exist", { checkedAt: "2026-02-30" }],
    ["unknown", { checkedAt: "unknown" }],
  ] as const)("%s: record_absence_checker", (_name, change) => {
    const c = caseWith(confirmedPath.not_included, (x) => { Object.assign(absence(x), change); });
    expect(derive(c)).toMatchObject({ status: "omission_not_verified", needs: [{ code: "record_absence_checker" }] });
  });

  it("a second role alone is not a checker", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { Object.assign(absence(x), { checkedBy: null, checkedAt: null, confirmedBy: "B", confirmedAt: "2026-11-21" }); });
    expect(codes(derive(c))).toEqual(["record_absence_checker"]);
  });

  it("passing evidence only from another version of the document does not do", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { x.paths[0]!.evidenceRefs = ["a3"]; });
    expect(derive(c)).toMatchObject({ status: "omission_not_verified", needs: [{ code: "add_evidence_from_checked_version" }] });
  });

  it("a failing row from the checked version: row need, and the version still has no passing row", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { fail(x, "a2"); });
    expect(derive(c)).toMatchObject({
      status: "omission_not_verified",
      needs: [{ code: "add_evidence_from_checked_version" }, { code: "open_official_source", params: { evidenceId: "a2" } }],
    });
  });

  it("every row must pass, not only one from the checked version", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { x.paths[0]!.evidenceRefs = ["a2", "a1"]; fail(x, "a1", "mismatch"); });
    expect(derive(c)).toMatchObject({ status: "omission_not_verified", needs: [{ code: "resolve_mismatch", params: { evidenceId: "a1" } }] });
  });

  it("passing rows from the checked version and another version both confirm", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { x.paths[0]!.evidenceRefs = ["a2", "a1"]; });
    expect(derive(c).status).toBe("confirmed");
  });

  it("never confirms on a recorded absence check alone", () => {
    const c = caseWith(confirmedPath.not_included, (x) => { fail(x, "a2"); });
    expect(derive(c).status).not.toBe("confirmed");
  });
});

describe("rule 5: the same outcome through a separate law", () => {
  it("confirmed with passing rows from both documents", () => {
    expect(derive(caseWith(confirmedPath.same_outcome_separate_law))).toMatchObject({ status: "confirmed", needs: [] });
  });

  it("rows from the from document only: not verified, evidence_from_both_documents", () => {
    const c = caseWith(confirmedPath.same_outcome_separate_law, (x) => { x.paths[0]!.evidenceRefs = ["a1"]; });
    expect(derive(c)).toMatchObject({ status: "not_verified", drawable: true, needs: [{ code: "evidence_from_both_documents" }] });
  });

  it("rows from the separate law only", () => {
    const c = caseWith(confirmedPath.same_outcome_separate_law, (x) => { x.paths[0]!.evidenceRefs = ["b1"]; });
    expect(codes(derive(c))).toEqual(["evidence_from_both_documents"]);
  });

  it("two passing rows from one document are not enough", () => {
    const c = caseWith(confirmedPath.same_outcome_separate_law, (x) => { x.paths[0]!.evidenceRefs = ["a1", "a2"]; });
    expect(codes(derive(c))).toEqual(["evidence_from_both_documents"]);
  });

  it("a row of the separate law that fails: both-documents need and the row's own need", () => {
    const c = caseWith(confirmedPath.same_outcome_separate_law, (x) => { fail(x, "b1", "could_not_open"); });
    expect(derive(c)).toMatchObject({
      status: "not_verified",
      needs: [{ code: "evidence_from_both_documents" }, { code: "open_official_source", params: { evidenceId: "b1" } }],
    });
  });

  it("a failing extra row blocks it although both documents are covered", () => {
    const c = caseWith(confirmedPath.same_outcome_separate_law, (x) => { x.paths[0]!.evidenceRefs = ["a1", "b1", "a2"]; fail(x, "a2"); });
    expect(derive(c)).toMatchObject({ status: "not_verified", needs: [{ code: "open_official_source", params: { evidenceId: "a2" } }] });
  });

  it("a promise start never confirms, even when every row of the separate law passes (Req 3.6)", () => {
    const path: Path = { ...confirmedPath.same_outcome_separate_law, from: { type: "promise" }, evidenceRefs: ["b1"] };
    expect(derive(caseWith(path))).toMatchObject({ status: "not_verified", drawable: true, needs: [{ code: "evidence_from_both_documents" }] });
    const both = caseWith({ ...path, evidenceRefs: ["a1", "b1"] });
    expect(derive(both)).toMatchObject({ status: "not_verified", needs: [{ code: "evidence_from_both_documents" }] });
  });

  it("a promise start still lists the need of each failing row", () => {
    const path: Path = { ...confirmedPath.same_outcome_separate_law, from: { type: "promise" }, evidenceRefs: ["b1", "a1"] };
    const c = caseWith(path, (x) => { fail(x, "b1", "could_not_open"); fail(x, "a1", "mismatch"); });
    expect(derive(c)).toMatchObject({
      status: "not_verified",
      needs: [
        { code: "evidence_from_both_documents" },
        { code: "open_official_source", params: { evidenceId: "b1" } },
        { code: "resolve_mismatch", params: { evidenceId: "a1" } },
      ],
    });
  });

  it("carried and not_included keep a promise start as before", () => {
    expect(derive(caseWith({ ...confirmedPath.carried, from: { type: "promise" } })).status).toBe("confirmed");
    expect(derive(caseWith({ ...confirmedPath.not_included, from: { type: "promise" } })).status).toBe("confirmed");
  });

  it("an official transfer is a different kind: the same single-document evidence confirms transferred but not same_outcome_separate_law", () => {
    const transferred = caseWith({ ...confirmedPath.transferred, evidenceRefs: ["a2"] });
    expect(derive(transferred).status).toBe("confirmed");
    const separate = caseWith({ ...confirmedPath.same_outcome_separate_law, evidenceRefs: ["a1"] });
    expect(derive(separate).status).toBe("not_verified");
  });
});

describe("rule 7: a recorded confirmed that the evidence does not back (review_state_overclaim)", () => {
  const confirmedClaim = (kind: PathKind): Path => ({ ...confirmedPath[kind], reviewState: "confirmed" });

  it("a recorded confirmed whose evidence fails stays derived and warns", () => {
    const input = caseWith(confirmedClaim("carried"), (x) => { fail(x, "a2", "mismatch"); });
    const r = parseCase(input, options);
    expect(r.model!.paths.p).toMatchObject({ status: "not_verified", drawable: true });
    expect(r.model!.case.paths[0]!.reviewState).toBe("confirmed"); // the claim is kept as written
    const w = r.issues.filter((i) => i.code === "review_state_overclaim");
    expect(w).toEqual([expect.objectContaining({ path: ["paths", 0, "reviewState"], severity: "warn", params: { pathId: "p", status: "not_verified" } })]);
  });

  it.each(PATH_KINDS)("%s: a claim of confirmed with no passing evidence is derived, not taken", (kind) => {
    const input = caseWith(confirmedClaim(kind), (x) => { for (const e of x.evidence) fail(x, e.evidenceId); });
    const r = parseCase(input, options);
    expect(r.model!.paths.p!.status).not.toBe("confirmed");
    expect(r.issues.filter((i) => i.code === "review_state_overclaim")).toHaveLength(1);
  });

  it("the derived status is not raised by the claim, whatever the status", () => {
    const missing = parseCase(caseWith({ ...confirmedClaim("next_version"), evidenceRefs: [] }), options);
    expect(missing.model!.paths.p).toMatchObject({ status: "evidence_missing", drawable: false });
    const omission = parseCase(caseWith({ ...confirmedClaim("not_included"), absenceCheck: null }), options);
    expect(omission.model!.paths.p!.status).toBe("omission_not_verified");
    expect(omission.issues.map((i) => i.code)).toContain("review_state_overclaim");
  });

  it("no warning when the claim and the derived status agree, or when the claim is unverified", () => {
    const agree = parseCase(caseWith(confirmedClaim("carried")), options);
    expect(agree.issues.map((i) => i.code)).not.toContain("review_state_overclaim");
    expect(agree.model!.paths.p!.status).toBe("confirmed");
    const unverified = parseCase(caseWith(confirmedPath.carried), options);
    expect(unverified.issues).toEqual([]);
    expect(unverified.model!.paths.p!.status).toBe("confirmed"); // a path is confirmed by evidence, not by being marked
  });
});

describe("parseCase stage 6 (6.3)", () => {
  it("fills paths by pathId, one view each, and leaves the case unchanged", () => {
    const input = baseCase();
    input.paths = [
      { ...structuredClone(confirmedPath.next_version), pathId: "p1" },
      { ...structuredClone(confirmedPath.carried), pathId: "p2", evidenceRefs: [] },
    ];
    const r = parseCase(input, options);
    expect(Object.keys(r.model!.paths)).toEqual(["p1", "p2"]);
    expect(r.model!.paths.p1).toEqual({ track: "number", status: "confirmed", drawable: true, needs: [] });
    expect(r.model!.paths.p2).toEqual({ track: "clause", status: "evidence_missing", drawable: false, needs: [{ code: "add_evidence" }] });
    expect(r.model!.case.paths).toHaveLength(2);
    expect(r.issues).toEqual([]);
  });

  it("a view carries only track, status, drawable and needs", () => {
    const r = parseCase(caseWith({ ...confirmedPath.carried, reviewState: "confirmed" }, (x) => { x.evidence[0]!.excerpt = "Bill A"; }), options);
    expect(Object.keys(r.model!.paths.p!).sort()).toEqual(["drawable", "needs", "status", "track"]);
  });

  it("deriveStatuses gives the same views as parseCase", () => {
    const c = caseWith(confirmedPath.same_outcome_separate_law);
    expect(deriveStatuses(c, gateCase(c)).paths).toEqual(parseCase(c, options).model!.paths);
  });

  it("a user case with no bundled check confirms nothing", () => {
    const input = baseCase();
    input.paths = Object.values(confirmedPath).map((p, i) => ({ ...structuredClone(p), pathId: `p${i}` }));
    const r = parseCase(input, { ...options, origin: "user" });
    expect(Object.values(r.model!.paths).map((v) => v.status)).not.toContain("confirmed");
  });

  it("warnings never change a status: a session-token URL leaves a confirmed path confirmed", () => {
    const c = caseWith(confirmedPath.next_version, (x) => {
      const d = x.documents[0]!;
      d.sourceUrl = `${d.sourceUrl};jsessionid=ABC`;
      x.evidence[0]!.check.url = d.sourceUrl;
    });
    const r = parseCase(c, options);
    expect(new Set(r.issues.map((i) => i.code))).toEqual(new Set(["url_session_token"])); // on the version and on the check URL
    expect(r.model!.paths.p!.status).toBe("confirmed");
  });

  it("a stored check record that is ignored warns and leaves the path unconfirmed", () => {
    const r = parseCase(caseWith(confirmedPath.next_version), { ...options, origin: "user" });
    expect(r.issues.map((i) => i.code)).toContain("check_record_ignored");
    expect(r.model!.paths.p!.status).toBe("not_verified");
  });

  it("issue paths of stage 6 index the input when an earlier path was removed", () => {
    const input = baseCase();
    input.paths = [
      { ...structuredClone(confirmedPath.next_version), pathId: "gone", evidenceRefs: ["ghost"] },
      { ...structuredClone(confirmedPath.carried), pathId: "kept", reviewState: "confirmed" },
    ];
    fail(input, "a2");
    const r = parseCase(input, options);
    expect(r.issues.find((i) => i.code === "review_state_overclaim")!.path).toEqual(["paths", 1, "reviewState"]);
  });
});

describe("a path dropped for an unresolved reference stays listed in excluded (rule 1, in parseCase)", () => {
  it("an evidence reference that does not exist: no view, one excluded entry with ref_unresolved", () => {
    const input = baseCase();
    input.paths = [{ ...structuredClone(confirmedPath.next_version), pathId: "p", evidenceRefs: ["ghost"] }];
    const r = parseCase(input, options);
    expect(r.model!.paths).toEqual({});
    expect(r.model!.case.paths).toEqual([]);
    expect(r.model!.excluded).toEqual([{ path: ["paths", 0], reason: "ref_unresolved" }]);
    expect(r.issues).toEqual([expect.objectContaining({ code: "ref_unresolved", severity: "block", path: ["paths", 0, "evidenceRefs", 0] })]);
  });

  it("an endpoint that does not exist", () => {
    const input = baseCase();
    input.paths = [{ ...structuredClone(confirmedPath.carried), to: clause("ghost") }];
    expect(parseCase(input, options).model!.excluded).toEqual([{ path: ["paths", 0], reason: "ref_unresolved" }]);
  });

  it("two broken references in one path give one entry", () => {
    const input = baseCase();
    input.paths = [{ ...structuredClone(confirmedPath.next_version), to: version("Bill A", "v9"), evidenceRefs: ["ghost", "ghost2"] }];
    const r = parseCase(input, options);
    expect(r.model!.excluded).toEqual([{ path: ["paths", 0], reason: "ref_unresolved" }]);
    expect(r.issues.filter((i) => i.code === "ref_unresolved").length).toBeGreaterThan(1);
  });

  it("a path that pointed at a row removed for another reason follows it, and keeps its input position", () => {
    const input = baseCase();
    input.paths = [
      { ...structuredClone(confirmedPath.next_version), pathId: "ok" },
      { ...structuredClone(confirmedPath.carried), pathId: "follows", evidenceRefs: ["a1", "a2"] },
    ];
    input.evidence[1]!.excerpt = "x".repeat(301); // a2 is blocked: excerpt_too_long
    const r = parseCase(input, options);
    expect(Object.keys(r.model!.paths)).toEqual(["ok"]);
    expect(r.model!.excluded).toEqual([
      { path: ["evidence", 1], reason: "excerpt_too_long" },
      { path: ["paths", 1], reason: "ref_unresolved" },
    ]);
  });

  it("the position is the input position even when an earlier path was removed too", () => {
    const input = baseCase();
    input.paths = [
      { ...structuredClone(confirmedPath.next_version), pathId: "first", evidenceRefs: ["ghost"] },
      { ...structuredClone(confirmedPath.carried), pathId: "second", from: clause("ghost2") },
      { ...structuredClone(confirmedPath.carried), pathId: "third" },
    ];
    const r = parseCase(input, options);
    expect(Object.keys(r.model!.paths)).toEqual(["third"]);
    expect(r.model!.excluded).toEqual([
      { path: ["paths", 0], reason: "ref_unresolved" },
      { path: ["paths", 1], reason: "ref_unresolved" },
    ]);
  });

  it("deriveStatus on a direct call still gives not_verified, not drawable, fix_reference (covered by rule 1 above)", () => {
    const c = caseWith(confirmedPath.next_version, (x) => { x.paths[0]!.evidenceRefs = ["ghost"]; });
    expect(derive(c)).toMatchObject({ status: "not_verified", drawable: false, needs: [{ code: "fix_reference", params: { evidenceId: "ghost" } }] });
  });
});
