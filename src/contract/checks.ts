import type { Case, DocumentVersion, EffectiveState, Evidence, Issue, Path } from "./types";

// Parse stage 3: semantic checks (design "Rules", "News excerpts", "Severities"). Every
// function is pure and returns issues whose paths index the arrays of the Case it was given.
// Block issues are removed from the model by parseCase; warnings keep their record.

type JsonPath = (string | number)[];

export const OFFICIAL_EXCERPT_LIMIT = 300; // official documents (research-data.md)
export const OTHER_EXCERPT_LIMIT = 200; // Seoul Economic Daily articles (D-016); any other non-official source

const block = (path: JsonPath, code: Issue["code"], message: string, params?: Record<string, string>): Issue => ({
  path, code, severity: "block", ...(params ? { params } : {}), message,
});
const warn = (path: JsonPath, code: Issue["code"], message: string, params?: Record<string, string>): Issue => ({
  path, code, severity: "warn", ...(params ? { params } : {}), message,
});

const versionKey = (documentId: string, versionId: string) => JSON.stringify([documentId, versionId]);
const label = (documentId: string, versionId: string) => `${documentId} / ${versionId}`;
const blank = (s: string | null | undefined) => s === null || s === undefined || s.trim() === "";
const length = (s: string) => [...s].length; // characters, not UTF-16 units

export function findDocument(c: Case, documentId: string, versionId: string): DocumentVersion | undefined {
  return c.documents.find((d) => d.documentId === documentId && d.versionId === versionId);
}

/**
 * The verification state the contract works with. `pasted_text_only` is never stored: it is
 * computed for a row that was not checked on the official page but whose excerpt occurs word
 * for word in the pasted text. It never passes the gate (Req 4.2).
 */
export function effectiveState(e: Evidence, doc: DocumentVersion | undefined): EffectiveState {
  const pasted = doc?.pastedText;
  if (e.check.state === "not_checked" && pasted && e.excerpt !== "" && pasted.includes(e.excerpt)) return "pasted_text_only";
  return e.check.state;
}

function duplicates<T>(items: T[], idOf: (item: T) => string, pathOf: (i: number) => JsonPath, display: (item: T) => string): Issue[] {
  const count = new Map<string, number>();
  for (const item of items) count.set(idOf(item), (count.get(idOf(item)) ?? 0) + 1);
  // Every holder of a repeated id is blocked: nothing picks one of them silently.
  return items.flatMap((item, i) =>
    count.get(idOf(item))! > 1
      ? [block(pathOf(i), "duplicate_id", `The id "${display(item)}" is used more than once.`, { id: display(item) })]
      : [],
  );
}

/** Checks that need no reference to be followed: ids, title and publisher, excerpts, pasted text. */
export function checkRecords(c: Case): Issue[] {
  const issues: Issue[] = [];

  issues.push(
    ...duplicates(c.documents, (d) => versionKey(d.documentId, d.versionId), (i) => ["documents", i, "versionId"], (d) => label(d.documentId, d.versionId)),
    ...duplicates(c.evidence, (e) => e.evidenceId, (i) => ["evidence", i, "evidenceId"], (e) => e.evidenceId),
    ...duplicates(c.events, (e) => e.eventId, (i) => ["events", i, "eventId"], (e) => e.eventId),
    ...duplicates(c.paths, (p) => p.pathId, (i) => ["paths", i, "pathId"], (p) => p.pathId),
  );

  c.documents.forEach((d, i) => {
    if (blank(d.title)) issues.push(block(["documents", i, "title"], "title_missing", `The version at documents[${i}] has no title.`));
    if (blank(d.publisher)) issues.push(block(["documents", i, "publisher"], "publisher_missing", `The version at documents[${i}] has no publisher.`));
  });

  c.evidence.forEach((e, i) => {
    const doc = findDocument(c, e.documentId, e.versionId);
    if (!doc) return; // an unresolved version is reported by checkReferences
    const at = ["evidence", i];
    if (doc.sourceKind === "news" && doc.ownOutlet !== true) {
      if (e.excerpt !== "") { // any text at all, whatever its length (D-016)
        issues.push(block([...at, "excerpt"], "news_excerpt_not_allowed", "An excerpt of another outlet's news item is not allowed; use the fact sentence."));
      }
    } else {
      const limit = doc.sourceKind === "official" ? OFFICIAL_EXCERPT_LIMIT : OTHER_EXCERPT_LIMIT;
      if (length(e.excerpt) > limit) {
        issues.push(block([...at, "excerpt"], "excerpt_too_long", `The excerpt has ${length(e.excerpt)} characters; the limit is ${limit}.`, { limit: String(limit), length: String(length(e.excerpt)) }));
      }
    }
    if (doc.pastedText) {
      if (e.excerpt !== "" && !doc.pastedText.includes(e.excerpt)) {
        issues.push(block([...at, "excerpt"], "excerpt_not_in_pasted_text", "The excerpt does not occur word for word in the pasted text."));
      }
      if (e.anchor !== "" && !doc.pastedText.includes(e.anchor)) {
        issues.push(warn([...at, "anchor"], "anchor_not_in_pasted_text", "The anchor does not occur in the pasted text."));
      }
    }
  });

  const p = c.promise;
  if (p && p.excerpt) { // non-empty: any text at all counts as an excerpt
    if (p.ownOutlet !== true) {
      issues.push(block(["promise", "excerpt"], "news_excerpt_not_allowed", "An excerpt of another outlet's news item is not allowed; use the fact sentence."));
    } else if (length(p.excerpt!) > OTHER_EXCERPT_LIMIT) {
      issues.push(block(["promise", "excerpt"], "excerpt_too_long", `The excerpt has ${length(p.excerpt!)} characters; the limit is ${OTHER_EXCERPT_LIMIT}.`, { limit: String(OTHER_EXCERPT_LIMIT), length: String(length(p.excerpt!)) }));
    }
  }

  return issues;
}

/**
 * Every reference must resolve to a record that is still in the Case (Req 6.2). parseCase
 * repeats this until nothing more is removed, so a record that points at a removed record is
 * removed too.
 */
export function checkReferences(c: Case): Issue[] {
  const issues: Issue[] = [];
  const unresolved = (path: JsonPath, field: string, value: string) =>
    issues.push(block(path, "ref_unresolved", `The ${field} "${value}" at ${path.join(".")} does not resolve to a record.`, { field, value }));
  const evidenceIds = new Set(c.evidence.map((e) => e.evidenceId));
  const documentIds = new Set(c.documents.map((d) => d.documentId));
  const versions = new Set(c.documents.map((d) => versionKey(d.documentId, d.versionId)));

  const version = (path: JsonPath, documentId: string, versionId: string) => {
    if (versions.has(versionKey(documentId, versionId))) return;
    if (documentIds.has(documentId)) unresolved([...path, "versionId"], "versionId", label(documentId, versionId));
    else unresolved([...path, "documentId"], "documentId", documentId);
  };

  c.evidence.forEach((e, i) => version(["evidence", i], e.documentId, e.versionId));

  c.events.forEach((e, i) => {
    version(["events", i], e.documentId, e.versionId);
    e.evidenceRefs.forEach((ref, j) => {
      if (!evidenceIds.has(ref)) unresolved(["events", i, "evidenceRefs", j], "evidenceId", ref);
    });
  });

  c.paths.forEach((p, i) => {
    for (const side of ["from", "to"] as const) {
      const end = p[side];
      const at = ["paths", i, side];
      if (end.type === "version") version(at, end.documentId, end.versionId);
      else if (end.type === "clause" && !evidenceIds.has(end.evidenceId)) unresolved([...at, "evidenceId"], "evidenceId", end.evidenceId);
      else if (end.type === "promise" && !c.promise) unresolved(at, "promise", "promise");
    }
    p.evidenceRefs.forEach((ref, j) => {
      if (!evidenceIds.has(ref)) unresolved(["paths", i, "evidenceRefs", j], "evidenceId", ref);
    });
    if (p.absenceCheck) version(["paths", i, "absenceCheck"], p.absenceCheck.documentId, p.absenceCheck.versionId);
  });

  return issues;
}

/** Why a path's endpoints do not fit its kind (design "Tracks and endpoints"), or null. Needs resolved references. */
function endpointMismatch(c: Case, p: Path): string | null {
  const { from, to } = p;
  const docOfClause = (e: typeof from) =>
    e.type === "clause" ? c.evidence.find((x) => x.evidenceId === e.evidenceId)?.documentId : undefined;
  switch (p.kind) {
    case "next_version":
      if (from.type !== "version" || to.type !== "version") return "both ends must be versions";
      if (from.documentId !== to.documentId) return "both versions must have the same documentId";
      return from.versionId === to.versionId ? "the versions must differ" : null;
    case "successor_document":
      if (from.type !== "version" || to.type !== "version") return "both ends must be versions";
      return from.documentId === to.documentId ? "the documentIds must differ" : null;
    case "carried":
      if (from.type === "version" || to.type !== "clause") return "from must be a clause or the promise, and to a clause";
      return null;
    case "transferred":
      if (from.type !== "clause" || to.type !== "clause") return "both ends must be clauses";
      return docOfClause(from) === docOfClause(to) ? "the two clauses must sit under different documentIds" : null;
    case "same_outcome_separate_law":
      if (from.type === "version" || to.type !== "clause") return "from must be a clause or the promise, and to a clause";
      return from.type === "clause" && docOfClause(from) === docOfClause(to) ? "the to clause must sit under a different documentId" : null;
    case "not_included":
      return from.type === "version" || to.type !== "version" ? "from must be a clause or the promise, and to a version" : null;
  }
}

export function checkPathKinds(c: Case): Issue[] {
  return c.paths.flatMap((p, i) => {
    const reason = endpointMismatch(c, p);
    return reason ? [block(["paths", i, "kind"], "kind_endpoint_mismatch", `The endpoints do not fit kind "${p.kind}": ${reason}.`, { kind: p.kind, reason })] : [];
  });
}
