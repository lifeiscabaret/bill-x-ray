import type { Case, ParseOptions } from "../../src/contract";

// A small synthetic case: invented ids and wording, no real bill and no news text.
export function minimalCase(): Case {
  return {
    contractVersion: 1,
    caseId: "fixture-minimal",
    title: "Synthetic fixture",
    jurisdiction: "XX",
    session: null,
    documents: [
      {
        documentId: "Bill 1", versionId: "v1", localEventLabel: null, sourceUrl: "https://example.org/bill-1-v1",
        title: "Example Act (introduced)", publisher: "Example Parliament", sourceKind: "official", language: "en",
      },
      {
        documentId: "Bill 1", versionId: "v2", localEventLabel: "Passed", sourceUrl: null,
        title: "Example Act (passed)", publisher: "Example Parliament", sourceKind: "official", language: "en",
      },
    ],
    evidence: [
      {
        evidenceId: "ev-1", documentId: "Bill 1", versionId: "v1", anchor: "Sec. 1", excerpt: "Invented clause text.",
        check: {
          state: "not_checked", url: null, checkedBy: null, checkedAt: null,
          confirmedBy: null, confirmedAt: null, confirmedUrl: null,
        },
      },
    ],
    events: [
      { eventId: "evt-1", documentId: "Bill 1", versionId: "v1", eventKind: "introduced", eventDate: "2020-01-02", evidenceRefs: [] },
    ],
    paths: [
      {
        pathId: "p-1",
        from: { type: "version", documentId: "Bill 1", versionId: "v1" },
        to: { type: "version", documentId: "Bill 1", versionId: "v2" },
        kind: "next_version", evidenceRefs: ["ev-1"], reviewState: "unverified",
      },
    ],
  };
}

export const options: ParseOptions = { referenceDate: "2026-11-24", origin: "bundled", bundledChecks: [] };

/** True when `path` resolves in `input`; a missing last key resolves through its parent (property 11). */
export function resolves(input: unknown, path: readonly (string | number)[]): boolean {
  let cur = input;
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!;
    const isArr = Array.isArray(cur);
    if (cur === null || typeof cur !== "object") return false;
    const has = isArr ? typeof key === "number" && key >= 0 && key < (cur as unknown[]).length : typeof key === "string" && Object.hasOwn(cur, key);
    if (!has) return i === path.length - 1; // the parent is a container; only the last key may be missing
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return true;
}
