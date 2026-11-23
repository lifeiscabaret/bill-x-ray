import { z } from "zod";
import {
  CHECK_STATES, EVENT_KINDS, PATH_KINDS, RECHECK_RESULTS, REVIEW_STATES, ROLES, SOURCE_KINDS,
} from "./types";
import type { Issue, IssueCode } from "./types";

// Structural schemas (parse stage 1). Unknown keys are dropped, not rejected: a typo in an
// optional field is lost, a typo in a required field is reported as missing.

const role = z.enum(ROLES);
const text = z.string();
const maybeText = z.string().nullable();
const provenance = z.array(z.string()).optional();

export const promiseSchema = z.object({
  statement: text,
  sourceTitle: text,
  publisher: text,
  sourceUrl: maybeText,
  date: text,
  ownOutlet: z.boolean().optional(),
  excerpt: maybeText.optional(),
  factSentence: maybeText.optional(),
});

export const documentVersionSchema = z.object({
  documentId: text,
  versionId: text,
  localEventLabel: maybeText,
  sourceUrl: maybeText,
  title: text,
  publisher: text,
  sourceKind: z.enum(SOURCE_KINDS),
  ownOutlet: z.boolean().optional(),
  factSentence: maybeText.optional(),
  language: text,
  pastedText: maybeText.optional(),
  provenance,
});

export const evidenceCheckSchema = z.object({
  state: z.enum(CHECK_STATES),
  url: maybeText,
  checkedBy: role.nullable(),
  checkedAt: maybeText,
  confirmedBy: role.nullable(),
  confirmedAt: maybeText,
  confirmedUrl: maybeText,
});

export const evidenceSchema = z.object({
  evidenceId: text,
  documentId: text,
  versionId: text,
  anchor: text,
  excerpt: text,
  translation: z.object({ text, language: text }).nullish(),
  check: evidenceCheckSchema,
  provenance,
});

export const eventSchema = z.object({
  eventId: text,
  documentId: text,
  versionId: text,
  eventKind: z.enum(EVENT_KINDS),
  eventDate: text,
  evidenceRefs: z.array(text),
});

const endpointSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("version"), documentId: text, versionId: text }),
  z.object({ type: z.literal("clause"), evidenceId: text }),
  z.object({ type: z.literal("promise") }),
]);

const absenceCheckSchema = z.object({
  documentId: text,
  versionId: text,
  scope: z.union([z.literal("whole_text"), z.object({ articles: z.array(text) })]),
  searchedFor: z.array(text),
  checkedBy: role.nullable(),
  checkedAt: maybeText,
  confirmedBy: role.nullable(),
  confirmedAt: maybeText,
});

export const pathSchema = z.object({
  pathId: text,
  from: endpointSchema,
  to: endpointSchema,
  kind: z.enum(PATH_KINDS),
  evidenceRefs: z.array(text),
  reviewState: z.enum(REVIEW_STATES),
  absenceCheck: absenceCheckSchema.nullish(),
  note: maybeText.optional(),
});

export const caseSchema = z.object({
  contractVersion: z.literal(1),
  caseId: text,
  title: text,
  jurisdiction: text,
  session: maybeText,
  promise: promiseSchema.nullish(),
  documents: z.array(documentVersionSchema),
  evidence: z.array(evidenceSchema),
  events: z.array(eventSchema),
  paths: z.array(pathSchema),
  provenance,
});

// parseCase validates the list records one by one, so one bad record does not hide the
// rest: this shell checks only the top-level fields and leaves the records unparsed.
export const caseShellSchema = caseSchema.extend({
  promise: z.unknown().optional(),
  documents: z.array(z.unknown()),
  evidence: z.array(z.unknown()),
  events: z.array(z.unknown()),
  paths: z.array(z.unknown()),
});

export const recheckSchema = z.object({
  recheckId: text,
  caseId: text,
  target: z.object({ researchId: maybeText, evidenceId: maybeText }),
  sourceUrl: text,
  anchor: text,
  excerpt: text,
  result: z.enum(RECHECK_RESULTS),
  checkedBy: role,
  checkedAt: text,
  confirm: z.object({ by: role, at: text, url: text, result: z.enum(RECHECK_RESULTS) }).nullable(),
  note: maybeText.optional(),
});

// ---- zod issues to contract issues ----

type JsonPath = (string | number)[];

/** `documents[2].title`; the empty path is `(input)`. */
export function formatPath(path: JsonPath): string {
  if (path.length === 0) return "(input)";
  return path.reduce<string>((s, p) => (typeof p === "number" ? `${s}[${p}]` : s ? `${s}.${p}` : p), "");
}

function typeOf(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

function lookup(root: unknown, path: readonly PropertyKey[]): { found: boolean; value?: unknown } {
  let cur = root;
  for (const key of path) {
    if (Array.isArray(cur) && typeof key === "number" && key in cur) cur = cur[key];
    else if (cur !== null && typeof cur === "object" && !Array.isArray(cur) && Object.hasOwn(cur, key)) {
      cur = (cur as Record<PropertyKey, unknown>)[key];
    } else return { found: false };
  }
  return { found: true, value: cur };
}

/**
 * Turns the zod issues for `element` into contract issues. `base` is the path of `element`
 * inside the whole input. A missing field keeps its own key in the path and resolves
 * through its parent (design property 11).
 */
export function schemaIssues(error: z.ZodError, element: unknown, base: JsonPath): Issue[] {
  return error.issues.map((zi): Issue => {
    const rel = zi.path.map((p) => (typeof p === "symbol" ? String(p) : p));
    const path = [...base, ...rel];
    const at = lookup(element, rel);
    const field = path.length ? String(path[path.length - 1]) : "";
    const where = formatPath(path);
    const received = at.found ? typeOf(at.value) : "missing";
    const direct = rel.length === 1; // a field of the record itself, not of something inside it
    let code: IssueCode;
    let params: Record<string, string> = {};
    let message: string;

    if (!at.found) {
      // A required field that is absent (zod reports it as a type, value or union error,
      // depending on the schema). title, publisher and eventKind have their own codes.
      code =
        base[0] === "documents" && direct && field === "title" ? "title_missing"
        : base[0] === "documents" && direct && field === "publisher" ? "publisher_missing"
        : base[0] === "events" && direct && field === "eventKind" ? "date_kind_missing"
        : "schema_required";
      params = { field };
      message = `Required field "${field}" is missing at ${where}.`;
    } else if (zi.code === "invalid_type") {
      code = "schema_type";
      params = { expected: zi.expected, received };
      message = `Expected ${zi.expected} at ${where}, received ${received}.`;
    } else if (zi.code === "invalid_value") {
      code = "schema_enum";
      const expected = zi.values.map(String).join(", ");
      params = { expected };
      message = `Value at ${where} must be one of: ${expected}.`;
    } else if (zi.code === "invalid_union") {
      // The discriminated union on `type`, with an unknown discriminator value.
      code = "schema_enum";
      message = `Value at ${where} is not an accepted type.`;
    } else if (zi.code === "invalid_format") {
      code = "schema_format";
      message = `Value at ${where} has the wrong format.`;
    } else {
      code = "schema_value";
      message = `Value at ${where} is not accepted.`;
    }
    return { path, code, severity: "block", ...(Object.keys(params).length ? { params } : {}), message };
  });
}
