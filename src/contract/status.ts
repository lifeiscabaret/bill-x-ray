import { parsePartialDate } from "./dates";
import type {
  Case, Evidence, GateReason, GateResult, Issue, Need, NeedCode, Path, PathKind, PathStatus, PathView,
} from "./types";

export { NEED_CODES } from "./types";

// Parse stage 6: one status per path (design "Path status", rules 1 to 7). Pure, no clock.
// The status reads the evidence gate only through `gate[evidenceId].pass`, and never reads a
// text, a similarity figure or src/compare/. A warning never raises a status (Req 6.6).

const NUMBER_KINDS: readonly PathKind[] = ["next_version", "successor_document"];

/** The track comes from the kind and is never stored (Req 2.1). Endpoint rules are in checks.ts. */
export const trackOf = (kind: PathKind): PathView["track"] => (NUMBER_KINDS.includes(kind) ? "number" : "clause");

/** What each failing gate line still needs. `excerpt_not_in_pasted_text` is a block issue, so it only shows on a direct call. */
const NEED_OF_REASON: Record<GateReason, NeedCode> = {
  not_official_source: "use_official_source",
  source_url_missing: "add_official_url",
  source_url_invalid: "add_official_url",
  anchor_missing: "add_anchor",
  excerpt_missing: "add_excerpt",
  excerpt_too_long: "shorten_excerpt",
  not_checked: "open_official_source",
  could_not_open: "open_official_source",
  pasted_text_only: "open_official_source",
  partial: "resolve_mismatch",
  mismatch: "resolve_mismatch",
  excerpt_not_in_pasted_text: "resolve_mismatch",
  checked_other_url: "check_same_url",
  checker_missing: "record_check",
};

export interface StatusResult extends PathView {
  /** Indexes into `path.evidenceRefs` of rows set aside because they only repeat a title or a number (rule 3). */
  setAside: number[];
  /** True when `reviewState` says confirmed and the derived status is not (rule 7). */
  overclaim: boolean;
}

const same = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

/** The needs of one row that does not pass, from the reasons the gate recorded for it. */
function rowNeeds(evidenceId: string, g: GateResult): Need[] {
  const codes = [...new Set(g.reasons.map((r) => NEED_OF_REASON[r]))];
  return codes.map((code) => ({ code, params: { evidenceId } }));
}

/**
 * Derives the status of one path. `gate` is the result of the evidence gate by `evidenceId`.
 * The rules run in the design's order and the first one that applies decides.
 */
export function deriveStatus(path: Path, c: Case, gate: Readonly<Record<string, GateResult>>): StatusResult {
  const track = trackOf(path.kind);
  const evidenceById = new Map<string, Evidence>(c.evidence.map((e) => [e.evidenceId, e]));
  const result = (status: PathStatus, drawable: boolean, needs: Need[], setAside: number[] = []): StatusResult => ({
    track, status, drawable, needs,
    setAside,
    // Rule 7: the claim is compared with the derived status, which stays as it is.
    overclaim: path.reviewState === "confirmed" && status !== "confirmed",
  });

  // Rule 1: an endpoint or an evidence reference does not resolve. A row with no gate result
  // cannot be judged, so it counts as unresolved too.
  const broken: Need[] = [];
  for (const side of ["from", "to"] as const) {
    const end = path[side];
    const found =
      end.type === "version" ? c.documents.some((d) => d.documentId === end.documentId && d.versionId === end.versionId)
      : end.type === "clause" ? evidenceById.has(end.evidenceId)
      : c.promise !== undefined && c.promise !== null;
    if (!found) broken.push({ code: "fix_reference", params: { field: side } });
  }
  for (const ref of new Set(path.evidenceRefs)) {
    if (!evidenceById.has(ref) || !Object.hasOwn(gate, ref)) broken.push({ code: "fix_reference", params: { evidenceId: ref } });
  }
  if (broken.length > 0) return result("not_verified", false, broken);

  // Rule 2: no evidence at all.
  if (path.evidenceRefs.length === 0) return result("evidence_missing", false, [{ code: "add_evidence" }]);

  // Rule 3: on the clause track a row whose excerpt is only its version's title or number is set aside.
  const setAside: number[] = [];
  const rows: Evidence[] = [];
  path.evidenceRefs.forEach((ref, j) => {
    const e = evidenceById.get(ref)!;
    const version = c.documents.find((d) => d.documentId === e.documentId && d.versionId === e.versionId);
    if (track === "clause" && version && (same(e.excerpt, version.title) || same(e.excerpt, version.documentId))) setAside.push(j);
    else if (!rows.includes(e)) rows.push(e);
  });
  if (rows.length === 0) return result("evidence_missing", false, [{ code: "add_clause_evidence" }], setAside);

  const passes = (e: Evidence) => gate[e.evidenceId]!.pass;
  const failingRows = rows.filter((e) => !passes(e));
  const failing = failingRows.flatMap((e) => rowNeeds(e.evidenceId, gate[e.evidenceId]!));
  // Confirmed needs every row to pass; the needs list only says what to do about the ones that do not.
  const allPass = failingRows.length === 0;

  // Rule 4: not included in the searched version.
  if (path.kind === "not_included") {
    const a = path.absenceCheck;
    const to = path.to;
    const needs: Need[] = [];
    if (!(a && to.type === "version" && a.documentId === to.documentId && a.versionId === to.versionId)) needs.push({ code: "name_checked_version" });
    if (!(a && (a.scope === "whole_text" || a.scope.articles.some((s) => s.trim() !== "")))) needs.push({ code: "record_scope" });
    // One role and a real day; a second role is not required (D-008).
    if (!(a && a.checkedBy !== null && a.checkedAt !== null && parsePartialDate(a.checkedAt)?.precision === "day")) needs.push({ code: "record_absence_checker" });
    const fromChecked = rows.some((e) => to.type === "version" && e.documentId === to.documentId && e.versionId === to.versionId && passes(e));
    if (!fromChecked) needs.push({ code: "add_evidence_from_checked_version" });
    needs.push(...failing);
    return needs.length === 0 && allPass ? result("confirmed", true, [], setAside) : result("omission_not_verified", true, needs, setAside);
  }

  // Rule 5: the same outcome through a separate law needs passing rows from both documents.
  // A promise start has no version and its source is news, which never passes the gate, so the
  // original side cannot be met (Req 3.6): such a path stays not verified, whatever else passes.
  if (path.kind === "same_outcome_separate_law") {
    const needs: Need[] = [];
    const documents = new Set(
      [path.from, path.to].flatMap((end) => (end.type === "clause" ? [evidenceById.get(end.evidenceId)!.documentId] : [])),
    );
    const covered = path.from.type !== "promise" && [...documents].every((id) => rows.some((e) => e.documentId === id && passes(e)));
    if (!covered) needs.push({ code: "evidence_from_both_documents" });
    needs.push(...failing);
    return needs.length === 0 && allPass ? result("confirmed", true, [], setAside) : result("not_verified", true, needs, setAside);
  }

  // Rule 6: every other kind is confirmed when every row passes.
  return allPass ? result("confirmed", true, [], setAside) : result("not_verified", true, failing, setAside);
}

/** Stage 6 for a whole Case: the `paths` of the ScanModel and the warnings of rules 3 and 7, with paths into `c`. */
export function deriveStatuses(c: Case, gate: Readonly<Record<string, GateResult>>): { paths: Record<string, PathView>; issues: Issue[] } {
  const entries: [string, PathView][] = [];
  const issues: Issue[] = [];
  c.paths.forEach((p, i) => {
    const { setAside, overclaim, ...view } = deriveStatus(p, c, gate);
    entries.push([p.pathId, view]); // fromEntries, so an id such as "__proto__" stays a plain key
    for (const j of setAside) {
      issues.push({
        path: ["paths", i, "evidenceRefs", j], code: "number_or_title_as_evidence", severity: "warn",
        params: { pathId: p.pathId, evidenceId: p.evidenceRefs[j]! },
        message: `Evidence "${p.evidenceRefs[j]}" of path "${p.pathId}" only repeats a title or a number, so it is set aside.`,
      });
    }
    if (overclaim) {
      issues.push({
        path: ["paths", i, "reviewState"], code: "review_state_overclaim", severity: "warn",
        params: { pathId: p.pathId, status: view.status },
        message: `Path "${p.pathId}" is recorded as confirmed, but its derived status is "${view.status}". The derived status is kept.`,
      });
    }
  });
  return { paths: Object.fromEntries(entries), issues };
}
