import type { BundledCheck, Case, DocumentVersion, Evidence, EvidenceCheck } from "../../src/contract";
import { minimalCase } from "./helpers";

// Synthetic cases for the gate and origin tests: invented ids, wording and dates.

export const SOURCE_URL = "https://example.org/bill-1-v1";

export const matchedCheck = (extra: Partial<EvidenceCheck> = {}): EvidenceCheck => ({
  state: "matched_official", url: SOURCE_URL, checkedBy: "A", checkedAt: "2026-11-20",
  confirmedBy: null, confirmedAt: null, confirmedUrl: null, ...extra,
});

/** A case whose only evidence row ("ev-1", on Bill 1 / v1) passes the gate. */
export function gatedCase(): Case {
  const c = minimalCase();
  c.evidence[0]!.check = matchedCheck();
  return c;
}

export const clone = <T>(value: T): T => structuredClone(value);

export function withEvidence(change: Partial<Evidence> | ((e: Evidence) => void)): Case {
  const c = gatedCase();
  if (typeof change === "function") change(c.evidence[0]!);
  else Object.assign(c.evidence[0]!, change);
  return c;
}

export function withVersion(change: Partial<DocumentVersion>): Case {
  const c = gatedCase();
  Object.assign(c.documents[0]!, change);
  return c;
}

/** The sample row that `gatedCase()`'s evidence is a copy of. */
export function bundledOf(c: Case): BundledCheck {
  const e = c.evidence[0]!;
  const v = c.documents.find((d) => d.documentId === e.documentId && d.versionId === e.versionId)!;
  return {
    evidenceId: e.evidenceId, documentId: e.documentId, versionId: e.versionId, anchor: e.anchor,
    excerpt: e.excerpt, sourceUrl: v.sourceUrl, check: clone(e.check),
  };
}
