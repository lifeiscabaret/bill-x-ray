// Builders for ScanModel values that do not call parseCase, so layout and component tests do
// not wait for the contract's logic. Everything here is invented: ids, titles and texts are
// synthetic fixtures, not case data and not news text.
import fc from "fast-check";
import type {
  Case, DocumentVersion, Endpoint, Evidence, Path, PathKind, PathStatus, PathView, ScanModel,
} from "../../src/contract/types";
import { PATH_KINDS } from "../../src/contract/types";

export const REFERENCE_DATE = "2026-01-01";

export function doc(documentId: string, versionId: string, over: Partial<DocumentVersion> = {}): DocumentVersion {
  return {
    documentId,
    versionId,
    localEventLabel: null,
    sourceUrl: null,
    title: `Synthetic fixture ${documentId} ${versionId}`,
    publisher: "Synthetic publisher",
    sourceKind: "other",
    language: "en",
    ...over,
  };
}

export function evidenceRow(evidenceId: string, documentId: string, versionId: string, over: Partial<Evidence> = {}): Evidence {
  return {
    evidenceId,
    documentId,
    versionId,
    anchor: `Sec. ${evidenceId}`,
    excerpt: `Synthetic excerpt ${evidenceId}.`,
    check: { state: "not_checked", url: null, checkedBy: null, checkedAt: null, confirmedBy: null, confirmedAt: null, confirmedUrl: null },
    ...over,
  };
}

export const version = (documentId: string, versionId: string): Endpoint => ({ type: "version", documentId, versionId });
export const clause = (evidenceId: string): Endpoint => ({ type: "clause", evidenceId });
export const promise: Endpoint = { type: "promise" };

export function pathOf(pathId: string, kind: PathKind, from: Endpoint, to: Endpoint, over: Partial<Path> = {}): Path {
  return { pathId, from, to, kind, evidenceRefs: [], reviewState: "unverified", ...over };
}

const NUMBER_KINDS: readonly PathKind[] = ["next_version", "successor_document"];

export function viewOf(kind: PathKind, over: Partial<PathView> = {}): PathView {
  return {
    track: NUMBER_KINDS.includes(kind) ? "number" : "clause",
    status: "not_verified",
    drawable: true,
    needs: [],
    ...over,
  };
}

export interface ModelParts {
  caseId?: string;
  title?: string;
  documents: DocumentVersion[];
  evidence?: Evidence[];
  paths?: Path[];
  hasPromise?: boolean;
  /** Overrides of the contract's view of one path, by pathId. Unlisted paths are drawable, not_verified. */
  views?: Record<string, Partial<PathView>>;
}

export function buildModel(parts: ModelParts): ScanModel {
  const paths = parts.paths ?? [];
  const caseValue: Case = {
    contractVersion: 1,
    caseId: parts.caseId ?? "synthetic-case",
    title: parts.title ?? "Synthetic fixture",
    jurisdiction: "XX",
    session: null,
    ...(parts.hasPromise
      ? { promise: { statement: "Synthetic statement.", sourceTitle: "Synthetic fixture", publisher: "Synthetic publisher", sourceUrl: null, date: "unknown" } }
      : {}),
    documents: parts.documents,
    evidence: parts.evidence ?? [],
    events: [],
    paths,
  };
  return {
    case: caseValue,
    origin: "bundled",
    referenceDate: REFERENCE_DATE,
    gate: {},
    paths: Object.fromEntries(paths.map((p) => [p.pathId, viewOf(p.kind, parts.views?.[p.pathId])])),
    dates: {},
    excluded: [],
  };
}

// ---- Two hand-made models shaped like the samples ----

/**
 * Same number, different body. Versions "ih" and "enr" share a number; a separate law has
 * another. A clause in "ih" has the same outcome in the separate law; a second clause path
 * has no evidence and is not drawn.
 */
export function sameNumberModel(): ScanModel {
  return buildModel({
    caseId: "synthetic-same-number",
    title: "Synthetic fixture: same number",
    documents: [doc("SYN-100", "ih"), doc("SYN-100", "enr"), doc("SYN-LAW-7", "law")],
    evidence: [evidenceRow("SYN-E1", "SYN-100", "ih"), evidenceRow("SYN-E2", "SYN-LAW-7", "law"), evidenceRow("SYN-E3", "SYN-100", "enr")],
    paths: [
      pathOf("SYN-P1", "next_version", version("SYN-100", "ih"), version("SYN-100", "enr")),
      pathOf("SYN-P2", "same_outcome_separate_law", clause("SYN-E1"), clause("SYN-E2")),
      pathOf("SYN-P3", "carried", clause("SYN-E3"), clause("SYN-E2")),
    ],
    views: { "SYN-P3": { status: "evidence_missing", drawable: false } },
  });
}

/**
 * Different number. Original bill, committee alternative and Act under three numbers. One
 * clause is carried in the Act, one is not found in it; the Act is the final version.
 */
export function differentNumberModel(): ScanModel {
  return buildModel({
    caseId: "synthetic-different-number",
    title: "Synthetic fixture: different number",
    documents: [doc("SYN-ORIG-1", "original"), doc("SYN-ALT-2", "alternative"), doc("SYN-ACT-3", "promulgated")],
    evidence: [
      evidenceRow("SYN-E1", "SYN-ORIG-1", "original"),
      evidenceRow("SYN-E2", "SYN-ACT-3", "promulgated"),
      evidenceRow("SYN-E3", "SYN-ORIG-1", "original"),
    ],
    paths: [
      pathOf("SYN-P1", "successor_document", version("SYN-ORIG-1", "original"), version("SYN-ALT-2", "alternative")),
      pathOf("SYN-P2", "successor_document", version("SYN-ALT-2", "alternative"), version("SYN-ACT-3", "promulgated")),
      pathOf("SYN-P3", "carried", clause("SYN-E1"), clause("SYN-E2"), { reviewState: "confirmed" }),
      pathOf("SYN-P4", "not_included", clause("SYN-E3"), version("SYN-ACT-3", "promulgated")),
    ],
    views: { "SYN-P3": { status: "confirmed" }, "SYN-P4": { status: "omission_not_verified" } },
  });
}

// ---- Arbitrary ----

const STATUSES: readonly PathStatus[] = ["confirmed", "not_verified", "evidence_missing", "omission_not_verified"];

/**
 * Bounded: 1 to 8 versions, 0 to 12 evidence rows, 0 to 10 paths. Endpoints always resolve
 * and fit the path kind. Whether a path is drawable and its status vary independently,
 * because the layout trusts `drawable` and must not assume a relation to the status.
 */
export const scanModelArb: fc.Arbitrary<ScanModel> = fc
  .record({
    versions: fc.integer({ min: 1, max: 8 }),
    sharedNumbers: fc.boolean(),
    evidenceDocs: fc.array(fc.nat(), { maxLength: 12 }),
    hasPromise: fc.boolean(),
    seeds: fc.array(
      fc.record({
        kind: fc.constantFrom(...PATH_KINDS),
        a: fc.nat(),
        b: fc.nat(),
        fromPromise: fc.boolean(),
        drawable: fc.boolean(),
        status: fc.constantFrom(...STATUSES),
      }),
      { maxLength: 10 },
    ),
  })
  .map(({ versions, sharedNumbers, evidenceDocs, hasPromise, seeds }) => {
    const documents = Array.from({ length: versions }, (_, i) =>
      doc(sharedNumbers ? "ARB-N" : `ARB-${i}`, `v${i}`),
    );
    const evidence = evidenceDocs.map((n, i) => {
      const d = documents[n % versions]!;
      return evidenceRow(`ARB-E${i}`, d.documentId, d.versionId);
    });
    const ver = (n: number) => {
      const d = documents[n % versions]!;
      return version(d.documentId, d.versionId);
    };
    const paths: Path[] = [];
    const views: Record<string, Partial<PathView>> = {};
    seeds.forEach((sd, i) => {
      const hasEvidence = evidence.length > 0;
      const kind: PathKind = !hasEvidence && !NUMBER_KINDS.includes(sd.kind) ? "next_version" : sd.kind;
      const ev = (n: number) => clause(evidence[n % evidence.length]!.evidenceId);
      let from: Endpoint;
      let to: Endpoint;
      if (NUMBER_KINDS.includes(kind)) [from, to] = [ver(sd.a), ver(sd.b)];
      else if (kind === "not_included") [from, to] = [ev(sd.a), ver(sd.b)];
      else {
        from = sd.fromPromise && hasPromise ? promise : ev(sd.a);
        to = ev(sd.b);
      }
      const pathId = `ARB-P${i}`;
      paths.push(pathOf(pathId, kind, from, to));
      views[pathId] = { drawable: sd.drawable, status: sd.status };
    });
    return buildModel({ documents, evidence, paths, views, hasPromise });
  });
