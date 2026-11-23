// Data contract types (design.md "Data model" and "Results"). Field names follow work
// order §4. The const lists below exist so that the schema, the screen's string
// dictionary and the tests can check themselves against one list; there is no other logic.

export type PartialDate = string; // "YYYY-MM-DD" | "YYYY-MM" | "YYYY" | "unknown"
export type LanguageTag = string; // BCP 47: "en", "ko"

export const ROLES = ["A", "B"] as const;
export type Role = (typeof ROLES)[number]; // never a personal name (D-002)

export const SOURCE_KINDS = ["official", "news", "other"] as const;
export const CHECK_STATES = ["matched_official", "partial", "could_not_open", "not_checked", "mismatch"] as const;
export const REVIEW_STATES = ["confirmed", "unverified"] as const;
export const RECHECK_RESULTS = ["matched", "partial", "mismatch", "could_not_open", "not_found"] as const;

export const EVENT_KINDS = [
  "introduced", "committee_note", "amended", "passed", "discarded",
  "promulgated", "published", "effective", "applied", "postponed",
  "repealed", "struck_down", "other", "unknown",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const PATH_KINDS = [
  "next_version", // number track: same documentId, a later version
  "successor_document", // number track: a different document continues it
  "carried", // clause track: carried over or modified (Req 3.1)
  "transferred", // clause track: officially moved into another law
  "same_outcome_separate_law", // clause track
  "not_included", // clause track: not found in that version
] as const;
export type PathKind = (typeof PATH_KINDS)[number];

export interface Case {
  contractVersion: 1; // lets old files fail loudly after a change
  caseId: string; // stable file key, e.g. "us-116-hr748"
  title: string; // display title, English
  jurisdiction: string; // "US", "KR", "EU"
  session: string | null; // "116th Congress"
  promise?: PromiseRecord | null; // optional (Req 1.3)
  documents: DocumentVersion[]; // in reading order; the renderer never re-sorts by date
  evidence: Evidence[];
  events: LegislativeEvent[];
  paths: Path[];
  provenance?: string[]; // research row ids etc.; never evidence (Req 1.6)
}

export interface PromiseRecord {
  statement: string;
  sourceTitle: string;
  publisher: string;
  sourceUrl: string | null;
  date: PartialDate;
  ownOutlet?: boolean; // true for a Seoul Economic Daily article (D-016)
  excerpt?: string | null; // Seoul Economic Daily article only, at most 200 characters
  factSentence?: string | null; // our own sentence; other outlets use it instead of an excerpt
}

export interface DocumentVersion {
  documentId: string; // the number as the source writes it
  versionId: string; // "ih", "enr", "original", "alternative", "promulgated"
  localEventLabel: string | null; // the source's own stage label
  sourceUrl: string | null;
  title: string; // Req 1.2
  publisher: string; // Req 1.2
  sourceKind: (typeof SOURCE_KINDS)[number]; // Req 4.1, 4.3, 4.5
  ownOutlet?: boolean; // news only: true for a Seoul Economic Daily article (D-016)
  factSentence?: string | null; // news only: our own sentence (D-016)
  language: LanguageTag; // language of the original text
  pastedText?: string | null; // text the user pasted; Req 6.3, 6.4, Req 7
  provenance?: string[];
}

export interface Evidence {
  evidenceId: string;
  documentId: string;
  versionId: string;
  anchor: string; // clause location as the source writes it
  excerpt: string; // original language; "" on a version of news from another outlet (Req 4.7)
  translation?: { text: string; language: LanguageTag } | null; // display only (Req 4.3)
  check: EvidenceCheck;
  provenance?: string[];
}

export interface EvidenceCheck {
  // Req 4.2, 4.6
  state: (typeof CHECK_STATES)[number];
  url: string | null; // the URL the checker opened
  checkedBy: Role | null; // the one role the gate needs (D-008)
  checkedAt: PartialDate | null; // YYYY-MM-DD when set
  confirmedBy: Role | null; // optional second role of a D-002/D-006 recheck; the gate does not require it
  confirmedAt: PartialDate | null;
  confirmedUrl: string | null; // when set it must equal sourceUrl
}

export interface LegislativeEvent {
  eventId: string;
  documentId: string;
  versionId: string;
  eventKind: EventKind;
  eventDate: PartialDate;
  evidenceRefs: string[];
}

export type Endpoint =
  | { type: "version"; documentId: string; versionId: string }
  | { type: "clause"; evidenceId: string }
  | { type: "promise" };

export interface AbsenceCheck {
  documentId: string; // the version that was searched
  versionId: string;
  scope: "whole_text" | { articles: string[] };
  searchedFor: string[]; // terms or anchors looked for
  checkedBy: Role | null;
  checkedAt: PartialDate | null; // one role is enough (D-008)
  confirmedBy: Role | null;
  confirmedAt: PartialDate | null; // optional second role (D-002/D-006); not required
}

export interface Path {
  pathId: string;
  from: Endpoint;
  to: Endpoint;
  kind: PathKind;
  evidenceRefs: string[];
  reviewState: (typeof REVIEW_STATES)[number]; // the author's claim (Req 3.8)
  absenceCheck?: AbsenceCheck | null; // Req 3.5, kind "not_included" only
  note?: string | null; // record-state wording only
}

// Recheck records (data/verification/<caseId>.json)
export interface Recheck {
  recheckId: string;
  caseId: string;
  target: { researchId: string | null; evidenceId: string | null };
  sourceUrl: string; // official URL opened
  anchor: string; // as written on the page
  excerpt: string; // copied exactly, at most 300 characters
  result: (typeof RECHECK_RESULTS)[number];
  checkedBy: Role;
  checkedAt: string;
  confirm: { by: Role; at: string; url: string; result: Recheck["result"] } | null; // second role (D-002/D-006)
  note?: string | null; // record-state wording; no personal names
}

// ---- Results ----

// Block issues remove their record into `excluded`; warnings keep it (design "Severities").
export const BLOCK_ISSUE_CODES = [
  "schema_required", "schema_type", "schema_enum", "schema_format", "schema_value",
  "duplicate_id", "ref_unresolved", "title_missing", "publisher_missing", "url_invalid",
  "excerpt_too_long", "news_excerpt_not_allowed", "excerpt_not_in_pasted_text",
  "date_format", "date_kind_missing", "kind_endpoint_mismatch", "recheck_missing",
] as const;
export const WARN_ISSUE_CODES = [
  "url_missing", "url_lookalike_fixed", "url_session_token", "anchor_not_in_pasted_text",
  "date_conflict", "review_state_overclaim", "number_or_title_as_evidence", "check_record_ignored",
] as const;
export const ISSUE_CODES = [...BLOCK_ISSUE_CODES, ...WARN_ISSUE_CODES] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export interface Issue {
  path: (string | number)[]; // JSON path into the input, e.g. ["documents", 2, "sourceUrl"]
  code: IssueCode;
  severity: "block" | "warn";
  params?: Record<string, string>; // values for the i18n message
  message: string; // English fallback for scripts; the UI uses code + params
}

// One reason per failing line of the design's gate table.
export const GATE_REASONS = [
  "not_official_source", "source_url_missing", "source_url_invalid", "anchor_missing",
  "excerpt_missing", "excerpt_too_long", "not_checked", "partial", "could_not_open", "mismatch",
  "pasted_text_only", "checked_other_url", "checker_missing", "excerpt_not_in_pasted_text",
] as const;
export type GateReason = (typeof GATE_REASONS)[number];

// The six verification states of Req 4.2; `pasted_text_only` is computed, never stored.
export type EffectiveState = EvidenceCheck["state"] | "pasted_text_only";

export interface GateResult {
  pass: boolean;
  reasons: GateReason[];
  effectiveState: EffectiveState;
}

// What is still needed to confirm a path (Req 3.7). Status rules 1 to 6 of the design.
export const NEED_CODES = [
  "fix_reference", // rule 1: an endpoint or evidence reference does not resolve
  "add_evidence", // rule 2: no evidence rows
  "add_clause_evidence", // rule 3: only a title or number was offered as evidence
  "name_checked_version", // rule 4: the absence check does not name the `to` version
  "record_scope", // rule 4: whole text or listed articles
  "record_absence_checker", // rule 4: role and date of the absence check
  "add_evidence_from_checked_version", // rule 4: no evidence row from the searched version
  "evidence_from_both_documents", // rule 5
  "use_official_source", // rule 6, from gate reason not_official_source
  "add_official_url", // source_url_missing, source_url_invalid
  "add_anchor", // anchor_missing
  "add_excerpt", // excerpt_missing
  "shorten_excerpt", // excerpt_too_long
  "open_official_source", // not_checked, could_not_open, pasted_text_only
  "record_check", // checker_missing
  "resolve_mismatch", // mismatch, partial
  "check_same_url", // checked_other_url
] as const;
export type NeedCode = (typeof NEED_CODES)[number];

export interface Need {
  code: NeedCode;
  params?: Record<string, string>; // e.g. { evidenceId } for a need that belongs to one row
}

export type PathStatus = "confirmed" | "not_verified" | "evidence_missing" | "omission_not_verified";

export interface PathView {
  track: "number" | "clause"; // derived from kind (Req 2.1)
  status: PathStatus;
  drawable: boolean; // false for evidence_missing or unresolved endpoints (Req 3.3)
  needs: Need[]; // what is still needed (Req 3.7)
}

export interface DateView {
  timing: "past" | "scheduled" | "too_coarse" | "unknown";
  conflictWith: string[]; // eventIds
}

export type Origin = "bundled" | "user";

export interface ScanModel {
  case: Case; // records with block issues removed
  origin: Origin;
  referenceDate: string; // YYYY-MM-DD
  gate: Record<string, GateResult>; // by evidenceId
  paths: Record<string, PathView>; // by pathId
  dates: Record<string, DateView>; // by eventId
  excluded: { path: Issue["path"]; reason: IssueCode }[];
}

// An evidence row of a bundled sample and the check it carries (design "Origin"; D-009).
export interface BundledCheck {
  evidenceId: string;
  documentId: string;
  versionId: string;
  anchor: string;
  excerpt: string;
  sourceUrl: string | null; // the version's sourceUrl
  check: EvidenceCheck;
}

export interface ParseOptions {
  referenceDate: string; // YYYY-MM-DD; the app passes today's local date, tests a fixed one
  origin: Origin;
  bundledChecks?: readonly BundledCheck[];
}

// `model` is null only when the input is not a usable Case at all (stage 1 failed at the
// top level); otherwise it holds the Case without the records that carry a block issue.
export interface ParseResult {
  model: ScanModel | null;
  issues: Issue[];
}
