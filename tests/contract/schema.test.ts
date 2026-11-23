import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  BLOCK_ISSUE_CODES, ISSUE_CODES, WARN_ISSUE_CODES, caseSchema, formatPath, parseCase, recheckSchema,
} from "../../src/contract";
import type { Case, Recheck } from "../../src/contract";
import { minimalCase, options, resolves } from "./helpers";

// Remove the value at `path` from a deep copy of `value`.
function without(value: unknown, path: (string | number)[]): unknown {
  const copy = structuredClone(value) as Record<string | number, unknown>;
  let cur = copy;
  for (const key of path.slice(0, -1)) cur = cur[key] as Record<string | number, unknown>;
  delete cur[path[path.length - 1]!];
  return copy;
}

// Every required field of the minimal case, with the code its removal must give.
const required: { path: (string | number)[]; code?: string }[] = [
  ...["contractVersion", "caseId", "title", "jurisdiction", "session", "documents", "evidence", "events", "paths"].map((k) => ({ path: [k] })),
  ...["documentId", "versionId", "localEventLabel", "sourceUrl", "sourceKind", "language"].map((k) => ({ path: ["documents", 0, k] })),
  { path: ["documents", 0, "title"], code: "title_missing" },
  { path: ["documents", 0, "publisher"], code: "publisher_missing" },
  ...["evidenceId", "documentId", "versionId", "anchor", "excerpt", "check"].map((k) => ({ path: ["evidence", 0, k] })),
  ...["state", "url", "checkedBy", "checkedAt", "confirmedBy", "confirmedAt", "confirmedUrl"].map((k) => ({ path: ["evidence", 0, "check", k] })),
  ...["eventId", "documentId", "versionId", "eventDate", "evidenceRefs"].map((k) => ({ path: ["events", 0, k] })),
  { path: ["events", 0, "eventKind"], code: "date_kind_missing" },
  ...["pathId", "from", "to", "kind", "evidenceRefs", "reviewState"].map((k) => ({ path: ["paths", 0, k] })),
  ...["type", "documentId", "versionId"].map((k) => ({ path: ["paths", 0, "from", k] })),
];

describe("contract types and schema", () => {
  it("the schema and the hand-written types describe the same Case and Recheck", () => {
    expectTypeOf<z.infer<typeof caseSchema>>().toEqualTypeOf<Case>();
    expectTypeOf<z.infer<typeof recheckSchema>>().toEqualTypeOf<Recheck>();
  });

  it("ISSUE_CODES lists every block and warn code once", () => {
    expect(new Set(ISSUE_CODES).size).toBe(ISSUE_CODES.length);
    expect(ISSUE_CODES.length).toBe(BLOCK_ISSUE_CODES.length + WARN_ISSUE_CODES.length);
  });

  it("formats JSON paths", () => {
    expect(formatPath(["documents", 2, "sourceUrl"])).toBe("documents[2].sourceUrl");
    expect(formatPath([])).toBe("(input)");
  });
});

describe("parseCase stage 1", () => {
  it("parses a minimal valid case without issues", () => {
    const input = minimalCase();
    const { model, issues } = parseCase(input, options);
    expect(issues).toEqual([]);
    expect(model?.case).toEqual(input);
    expect(model?.excluded).toEqual([]);
    expect(model?.origin).toBe("bundled");
    expect(model?.referenceDate).toBe("2026-11-24");
  });

  it("accepts the optional promise and provenance, and their absence", () => {
    const input = minimalCase();
    expect(parseCase(input, options).issues).toEqual([]);
    input.promise = { statement: "Invented statement.", sourceTitle: "t", publisher: "p", sourceUrl: "https://example.org/promise", date: "2020" };
    input.provenance = ["row-1"];
    input.documents[0]!.provenance = ["row-2"];
    const { model, issues } = parseCase(input, options);
    expect(issues).toEqual([]);
    expect(model?.case.promise?.statement).toBe("Invented statement.");
    expect(model?.case.provenance).toEqual(["row-1"]);
    expect(parseCase({ ...input, promise: null }, options).model?.case.promise).toBeNull();
  });

  it.each(required)("removing $path gives one structure issue at that path", ({ path, code }) => {
    const input = without(minimalCase(), path);
    const { model, issues } = parseCase(input, options);
    // Stage 3 also reports the references that now point at the removed record (ref_unresolved).
    const own = issues.filter((i) => i.code !== "ref_unresolved");
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ path, code: code ?? "schema_required", severity: "block" });
    expect(own[0]!.message).toContain(formatPath(path));
    expect(resolves(input, path)).toBe(true);
    if (path.length === 1) {
      expect(model).toBeNull();
      expect(issues).toHaveLength(1);
    } else {
      // the record is left out and listed first
      expect(model?.excluded[0]).toEqual({ path: path.slice(0, 2), reason: own[0]!.code });
    }
  });

  it("a bad record does not hide the others", () => {
    const input = minimalCase();
    input.documents.push({ ...input.documents[0]!, versionId: "v3" });
    (input.documents[2] as unknown as Record<string, unknown>).title = 5;
    const { model, issues } = parseCase(input, options);
    expect(issues).toMatchObject([{ path: ["documents", 2, "title"], code: "schema_type", params: { expected: "string", received: "number" } }]);
    expect(model?.case.documents.map((d) => d.versionId)).toEqual(["v1", "v2"]);
    expect(model?.excluded).toEqual([{ path: ["documents", 2], reason: "schema_type" }]);
  });

  it("reports wrong enum values, wrong roles and a wrong contract version", () => {
    const input = minimalCase() as unknown as Record<string, any>;
    input.evidence[0].check.checkedBy = "C";
    input.paths[0].kind = "similar_text";
    input.events[0].eventKind = "someday";
    const { issues } = parseCase(input, options);
    expect(issues.map((i) => [i.path.join("."), i.code])).toEqual([
      ["evidence.0.check.checkedBy", "schema_enum"],
      ["events.0.eventKind", "schema_enum"],
      ["paths.0.kind", "schema_enum"],
    ]);
    expect(parseCase({ ...minimalCase(), contractVersion: 2 }, options).issues[0]).toMatchObject({ path: ["contractVersion"], code: "schema_enum" });
  });

  it("reports an endpoint with an unknown type at its type field", () => {
    const input = minimalCase() as unknown as Record<string, any>;
    input.paths[0].to = { type: "page" };
    expect(parseCase(input, options).issues).toMatchObject([{ path: ["paths", 0, "to", "type"], code: "schema_enum" }]);
  });

  it("returns a null model and one issue for input that is not an object", () => {
    for (const bad of [null, 5, "text", [], true]) {
      const r = parseCase(bad, options);
      expect(r.model).toBeNull();
      expect(r.issues).toMatchObject([{ path: [], code: "schema_type", severity: "block" }]);
    }
  });

  it("accepts a role of A or B only in a recheck", () => {
    const recheck = {
      recheckId: "r-1", caseId: "fixture-minimal", target: { researchId: null, evidenceId: "ev-1" },
      sourceUrl: "https://example.org/x", anchor: "Sec. 1", excerpt: "Invented clause text.", result: "matched",
      checkedBy: "A", checkedAt: "2026-11-24", confirm: { by: "B", at: "2026-11-24", url: "https://example.org/x", result: "matched" },
    };
    expect(recheckSchema.safeParse(recheck).success).toBe(true);
    expect(recheckSchema.safeParse({ ...recheck, checkedBy: "C" }).success).toBe(false);
    expect(recheckSchema.safeParse({ ...recheck, confirm: null, note: null }).success).toBe(true);
  });
});
