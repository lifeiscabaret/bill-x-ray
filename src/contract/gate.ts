import { effectiveState, OFFICIAL_EXCERPT_LIMIT, OTHER_EXCERPT_LIMIT } from "./checks";
import type {
  BundledCheck, Case, DocumentVersion, Evidence, EvidenceCheck, GateReason, GateResult, Issue, Origin,
} from "./types";
import { fixLookalikes, isHttpUrl, isMissingUrl } from "./urls";

// Parse stage 4: the evidence gate and origin handling (design "Evidence gate" and "Origin").
// The gate reads only the version, the anchor, the excerpt and the check record. It never
// reads `translation` or `provenance`, and nothing from src/compare/.
//
// What the screen may say about "who checked it": a row's check counts if and only if its
// GateResult has `pass: true`. The role and the date are then `check.checkedBy` and
// `check.checkedAt` of the same row in `ScanModel.case.evidence`. For a user case that record
// has already been blanked or replaced by the sample's own (`resolveChecks`), so the model never
// shows a role or a date that the gate did not use.

const chars = (s: string) => [...s].length; // characters, not UTF-16 units

/** The URL as the gate compares it: look-alikes fixed, `null` when missing. */
const urlOf = (value: string | null | undefined): string | null =>
  isMissingUrl(value) ? null : fixLookalikes(value!);

/** `YYYY-MM-DD` that is a real calendar day. A year alone, a month or "unknown" is not a check date. */
function isCheckDate(value: string | null): boolean {
  const m = value === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1000) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/**
 * Gate for one evidence row: passes only when every line of the design's gate table holds;
 * each failing line adds its reason, in table order. One recorded role is enough (D-008);
 * `confirmedBy` and `confirmedAt` are never required.
 */
export function gateEvidence(e: Evidence, version: DocumentVersion | undefined): GateResult {
  const reasons: GateReason[] = [];
  const official = version?.sourceKind === "official";

  // 1. An official version.
  if (!official) reasons.push("not_official_source");

  // 2. A usable source URL.
  const sourceUrl = urlOf(version?.sourceUrl);
  if (sourceUrl === null) reasons.push("source_url_missing");
  else if (!isHttpUrl(sourceUrl)) reasons.push("source_url_invalid");

  // 3. An anchor.
  if (e.anchor.trim() === "") reasons.push("anchor_missing");

  // 4. An excerpt within its limit.
  if (e.excerpt.trim() === "") reasons.push("excerpt_missing");
  else if (chars(e.excerpt) > (official ? OFFICIAL_EXCERPT_LIMIT : OTHER_EXCERPT_LIMIT)) reasons.push("excerpt_too_long");

  // 5. Matched on the official page. `pasted_text_only` is computed, never stored.
  const state = effectiveState(e, version);
  if (state !== "matched_official") reasons.push(state);

  // 6. The page that was opened is the source page. A matched row with no recorded URL fails too.
  const opened = urlOf(e.check.url);
  const second = urlOf(e.check.confirmedUrl);
  if ((opened !== null && opened !== sourceUrl) || (opened === null && state === "matched_official") || (second !== null && second !== sourceUrl)) {
    reasons.push("checked_other_url");
  }

  // 7. One role and a check date. `confirmedBy` alone does not do.
  if (e.check.checkedBy === null || !isCheckDate(e.check.checkedAt)) reasons.push("checker_missing");

  // 8. Pasted text, when present, holds the excerpt word for word.
  if (version?.pastedText && e.excerpt !== "" && !version.pastedText.includes(e.excerpt)) reasons.push("excerpt_not_in_pasted_text");

  return { pass: reasons.length === 0, reasons, effectiveState: state };
}

/** The gate for every evidence row of a Case, by `evidenceId`. */
export function gateCase(c: Case): Record<string, GateResult> {
  return Object.fromEntries(
    c.evidence.map((e) => [e.evidenceId, gateEvidence(e, c.documents.find((d) => d.documentId === e.documentId && d.versionId === e.versionId))]),
  );
}

// ---- Origin (D-009) ----

const BLANK_CHECK: EvidenceCheck = {
  state: "not_checked", url: null, checkedBy: null, checkedAt: null,
  confirmedBy: null, confirmedAt: null, confirmedUrl: null,
};

const hasRecord = (c: EvidenceCheck): boolean =>
  c.state !== "not_checked" || [c.url, c.checkedBy, c.checkedAt, c.confirmedBy, c.confirmedAt, c.confirmedUrl].some((v) => v !== null);

const sameCheck = (a: EvidenceCheck, b: EvidenceCheck): boolean =>
  a.state === b.state && a.url === b.url && a.checkedBy === b.checkedBy && a.checkedAt === b.checkedAt &&
  a.confirmedBy === b.confirmedBy && a.confirmedAt === b.confirmedAt && a.confirmedUrl === b.confirmedUrl;

/**
 * The sample row this row is an unchanged copy of: `documentId`, `versionId`, `anchor`,
 * `excerpt` and the version's `sourceUrl` all equal. The `evidenceId` may differ, because a
 * copy can be renamed; a sample row with the same id wins when several fit.
 */
function unchangedCopy(e: Evidence, version: DocumentVersion | undefined, bundled: readonly BundledCheck[]): BundledCheck | undefined {
  const url = urlOf(version?.sourceUrl);
  const fits = bundled.filter(
    (b) => b.documentId === e.documentId && b.versionId === e.versionId && b.anchor === e.anchor && b.excerpt === e.excerpt && urlOf(b.sourceUrl) === url,
  );
  return fits.find((b) => b.evidenceId === e.evidenceId) ?? fits[0];
}

/**
 * Origin handling. `bundled`: check records are used as written. `user`: a stored check record
 * is ignored (`check_record_ignored`, a warning) and the row is left unchecked, unless the row
 * is an unchanged copy of a sample row. Then the sample's own check record is used, never the
 * one stored in the user's file, so editing the record while keeping the clause changes nothing.
 * Any edit of the five fields drops the check. Paths index the arrays of the Case it was given.
 */
export function resolveChecks(c: Case, origin: Origin, bundled: readonly BundledCheck[]): { case: Case; issues: Issue[] } {
  if (origin === "bundled") return { case: c, issues: [] };
  const issues: Issue[] = [];
  const evidence = c.evidence.map((e, i) => {
    const copy = unchangedCopy(e, c.documents.find((d) => d.documentId === e.documentId && d.versionId === e.versionId), bundled);
    const check = copy ? copy.check : BLANK_CHECK;
    if (hasRecord(e.check) && !sameCheck(e.check, check)) {
      issues.push({
        path: ["evidence", i, "check"], code: "check_record_ignored", severity: "warn", params: { evidenceId: e.evidenceId },
        message: `The stored check record of "${e.evidenceId}" is ignored: a case entered by a user cannot confirm a link by itself.`,
      });
    }
    return sameCheck(e.check, check) ? e : { ...e, check: { ...check } };
  });
  return { case: { ...c, evidence }, issues };
}
