import { minimalCase } from "./helpers";
import type { Case, Recheck } from "../../src/contract";

// Synthetic fixtures for the recheck tests: invented ids and URLs on example.org.

export const URL1 = "https://example.org/bill-1-v1";

export function goodRecheck(): Recheck {
  return {
    recheckId: "rc-1", caseId: "fixture-minimal", target: { researchId: null, evidenceId: "ev-1" },
    sourceUrl: URL1, anchor: "Sec. 1", excerpt: "Invented clause text.", result: "matched",
    checkedBy: "A", checkedAt: "2026-11-24",
    confirm: { by: "B", at: "2026-11-24", url: URL1, result: "matched" },
    note: "Opened the page and found the clause.",
  };
}

/** The minimal case with ev-1 marked as matched on the official page, and a not_included path. */
export function checkedCase(): Case {
  const c = minimalCase();
  c.evidence[0]!.check = { state: "matched_official", url: URL1, checkedBy: "A", checkedAt: "2026-11-24", confirmedBy: null, confirmedAt: null, confirmedUrl: null };
  c.paths.push({
    pathId: "p-2", from: { type: "clause", evidenceId: "ev-1" }, to: { type: "version", documentId: "Bill 1", versionId: "v2" },
    kind: "not_included", evidenceRefs: ["ev-1"], reviewState: "unverified",
    absenceCheck: {
      documentId: "Bill 1", versionId: "v2", scope: "whole_text", searchedFor: ["invented term"],
      checkedBy: "A", checkedAt: "2026-11-24", confirmedBy: "B", confirmedAt: "2026-11-24",
    },
  });
  return c;
}
