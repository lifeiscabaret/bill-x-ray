import type { Case, Issue } from "../../../src/contract";
import { minimalCase } from "../../contract/helpers";

// Synthetic fixtures for parse stages 2 and 3 (URL normalization, semantic checks): invented
// ids, numbers and wording, example domains, no news text. Each fixture changes the rich case
// below and lists every issue parseCase must report, in order, as [path, code, severity].

export type Expected = [(string | number)[], Issue["code"], Issue["severity"]];
export interface Fixture {
  name: string;
  mutate: (c: any) => void;
  expect: Expected[];
}

const B = "block" as const;
const W = "warn" as const;

/** The minimal case plus a second law (Law 2), a clause on it and a promise record. Parses without issues. */
export function richCase(): Case {
  const c = minimalCase();
  c.documents.push({
    documentId: "Law 2", versionId: "l1", localEventLabel: null, sourceUrl: "https://example.org/law-2-l1",
    title: "Example Law", publisher: "Example Gazette", sourceKind: "official", language: "en",
  });
  c.evidence.push({
    evidenceId: "ev-2", documentId: "Law 2", versionId: "l1", anchor: "Art. 4", excerpt: "Another invented clause.",
    check: { state: "not_checked", url: null, checkedBy: null, checkedAt: null, confirmedBy: null, confirmedAt: null, confirmedUrl: null },
  });
  c.promise = {
    statement: "Invented statement.", sourceTitle: "Invented report", publisher: "Example Daily",
    sourceUrl: "https://example.org/promise", date: "2020",
  };
  return c;
}

const lookalikeColon = "\u2236";
const lookalikeDot = "\u00B7";
const opened = { state: "matched_official", checkedBy: "A", checkedAt: "2026-11-20" };
const newsDocument = {
  documentId: "News 1", versionId: "n1", localEventLabel: null, sourceUrl: "https://example.org/news-1",
  title: "Invented report", publisher: "Example Daily", sourceKind: "news", factSentence: "Invented fact.", language: "en",
};
const newsEvidence = (excerpt: string) => ({
  evidenceId: "ev-3", documentId: "News 1", versionId: "n1", anchor: "para 1", excerpt,
  check: { state: "not_checked", url: null, checkedBy: null, checkedAt: null, confirmedBy: null, confirmedAt: null, confirmedUrl: null },
});
const korean = (n: number) => "가".repeat(n); // Korean characters count once each

// ---- URL fixtures (stage 2) ----

export const urlFixtures: Fixture[] = [
  {
    name: "look-alike characters in a document sourceUrl",
    mutate: (c) => { c.documents[0].sourceUrl = `https${lookalikeColon}//example.org/bill${lookalikeDot}1-v1`; },
    expect: [[["documents", 0, "sourceUrl"], "url_lookalike_fixed", W]],
  },
  {
    name: "look-alike characters in check.url",
    mutate: (c) => { Object.assign(c.evidence[0].check, opened, { url: `https${lookalikeColon}//example.org/bill-1-v1` }); },
    expect: [[["evidence", 0, "check", "url"], "url_lookalike_fixed", W]],
  },
  {
    name: "look-alike characters in check.confirmedUrl",
    mutate: (c) => { Object.assign(c.evidence[0].check, opened, { url: "https://example.org/bill-1-v1", confirmedUrl: `https://example.org/a${lookalikeDot}b` }); },
    expect: [[["evidence", 0, "check", "confirmedUrl"], "url_lookalike_fixed", W]],
  },
  {
    name: "look-alike characters in promise.sourceUrl",
    mutate: (c) => { c.promise.sourceUrl = `https://example${lookalikeDot}org/p`; },
    expect: [[["promise", "sourceUrl"], "url_lookalike_fixed", W]],
  },
  ...([null, "", "unknown", "  Unknown "] as const).map((value): Fixture => ({
    name: `a document sourceUrl of ${JSON.stringify(value)} is missing`,
    mutate: (c) => { c.documents[1].sourceUrl = value; },
    expect: [[["documents", 1, "sourceUrl"], "url_missing", W]],
  })),
  {
    name: "promise.sourceUrl null is missing",
    mutate: (c) => { c.promise.sourceUrl = null; },
    expect: [[["promise", "sourceUrl"], "url_missing", W]],
  },
  {
    name: "check.url null after a recorded check is missing",
    mutate: (c) => { Object.assign(c.evidence[0].check, opened, { url: null }); },
    expect: [[["evidence", 0, "check", "url"], "url_missing", W]],
  },
  {
    name: "check.confirmedUrl written as an empty string is missing",
    mutate: (c) => { Object.assign(c.evidence[0].check, opened, { url: "https://example.org/bill-1-v1", confirmedUrl: "" }); },
    expect: [[["evidence", 0, "check", "confirmedUrl"], "url_missing", W]],
  },
  ...["ftp://example.org/x", "example.org/x", "https://", "https:///x", "not a url", "https://exa mple.org/x", "javascript:alert(1)"].map((value): Fixture => ({
    name: `the document sourceUrl ${JSON.stringify(value)} is invalid and the document is removed`,
    mutate: (c) => { c.documents[1].sourceUrl = value; },
    expect: [
      [["documents", 1, "sourceUrl"], "url_invalid", B],
      [["paths", 0, "to", "versionId"], "ref_unresolved", B],
    ],
  })),
  {
    name: "an invalid check.url removes the evidence row",
    mutate: (c) => { Object.assign(c.evidence[0].check, opened, { url: "example.org/x" }); },
    expect: [
      [["evidence", 0, "check", "url"], "url_invalid", B],
      [["paths", 0, "evidenceRefs", 0], "ref_unresolved", B],
    ],
  },
  {
    name: "an invalid check.confirmedUrl removes the evidence row",
    mutate: (c) => { Object.assign(c.evidence[0].check, opened, { url: "https://example.org/bill-1-v1", confirmedUrl: "ftp://example.org/x" }); },
    expect: [
      [["evidence", 0, "check", "confirmedUrl"], "url_invalid", B],
      [["paths", 0, "evidenceRefs", 0], "ref_unresolved", B],
    ],
  },
  {
    name: "an invalid promise.sourceUrl removes the promise",
    mutate: (c) => { c.promise.sourceUrl = "tel:+000"; },
    expect: [[["promise", "sourceUrl"], "url_invalid", B]],
  },
  {
    name: "a session token is flagged and the URL stays as written",
    mutate: (c) => { c.documents[0].sourceUrl = "https://example.org/a;jsessionid=ABC123?x=1"; },
    expect: [[["documents", 0, "sourceUrl"], "url_session_token", W]],
  },
];

// ---- Semantic check fixtures (stage 3) ----

const withPath = (kind: string, from: unknown, to: unknown) => (c: any) => {
  c.paths[0] = { ...c.paths[0], kind, from, to };
};
const version = (documentId: string, versionId: string) => ({ type: "version", documentId, versionId });
const clause = (evidenceId: string) => ({ type: "clause", evidenceId });
const promise = { type: "promise" };
const mismatch = (name: string, kind: string, from: unknown, to: unknown): Fixture => ({
  name, mutate: withPath(kind, from, to), expect: [[["paths", 0, "kind"], "kind_endpoint_mismatch", B]],
});

export const checkFixtures: Fixture[] = [
  // duplicate ids: every holder of the id is removed
  {
    name: "duplicate evidenceId",
    mutate: (c) => { c.evidence.push(structuredClone(c.evidence[0])); },
    expect: [
      [["evidence", 0, "evidenceId"], "duplicate_id", B],
      [["evidence", 2, "evidenceId"], "duplicate_id", B],
      [["paths", 0, "evidenceRefs", 0], "ref_unresolved", B],
    ],
  },
  {
    name: "duplicate documentId and versionId",
    mutate: (c) => { c.documents.push(structuredClone(c.documents[0])); },
    expect: [
      [["documents", 0, "versionId"], "duplicate_id", B],
      [["documents", 3, "versionId"], "duplicate_id", B],
      [["evidence", 0, "versionId"], "ref_unresolved", B],
      [["events", 0, "versionId"], "ref_unresolved", B],
      [["paths", 0, "from", "versionId"], "ref_unresolved", B],
    ],
  },
  {
    name: "duplicate eventId",
    mutate: (c) => { c.events.push(structuredClone(c.events[0])); },
    expect: [
      [["events", 0, "eventId"], "duplicate_id", B],
      [["events", 1, "eventId"], "duplicate_id", B],
    ],
  },
  {
    name: "duplicate pathId",
    mutate: (c) => { c.paths.push(structuredClone(c.paths[0])); },
    expect: [
      [["paths", 0, "pathId"], "duplicate_id", B],
      [["paths", 1, "pathId"], "duplicate_id", B],
    ],
  },
  // title and publisher
  ...(["", "   "] as const).map((value): Fixture => ({
    name: `a document title of ${JSON.stringify(value)} is missing`,
    mutate: (c) => { c.documents[1].title = value; },
    expect: [
      [["documents", 1, "title"], "title_missing", B],
      [["paths", 0, "to", "versionId"], "ref_unresolved", B],
    ],
  })),
  {
    name: "a blank publisher is missing",
    mutate: (c) => { c.documents[1].publisher = ""; },
    expect: [
      [["documents", 1, "publisher"], "publisher_missing", B],
      [["paths", 0, "to", "versionId"], "ref_unresolved", B],
    ],
  },
  // excerpt length
  { name: "an official excerpt of 300 characters is allowed", mutate: (c) => { c.evidence[0].excerpt = korean(300); }, expect: [] },
  {
    name: "an official excerpt of 301 characters is too long",
    mutate: (c) => { c.evidence[0].excerpt = korean(301); },
    expect: [
      [["evidence", 0, "excerpt"], "excerpt_too_long", B],
      [["paths", 0, "evidenceRefs", 0], "ref_unresolved", B],
    ],
  },
  {
    name: "an excerpt of 200 characters from a Seoul Economic Daily article is allowed",
    mutate: (c) => { c.documents.push({ ...newsDocument, ownOutlet: true }); c.evidence.push(newsEvidence(korean(200))); },
    expect: [],
  },
  {
    name: "an excerpt of 201 characters from a Seoul Economic Daily article is too long",
    mutate: (c) => { c.documents.push({ ...newsDocument, ownOutlet: true }); c.evidence.push(newsEvidence(korean(201))); },
    expect: [[["evidence", 2, "excerpt"], "excerpt_too_long", B]],
  },
  // news from another outlet
  ...([undefined, false] as const).map((ownOutlet): Fixture => ({
    name: `an excerpt on news from another outlet (ownOutlet ${String(ownOutlet)}) is not allowed`,
    mutate: (c) => { c.documents.push({ ...newsDocument, ownOutlet }); c.evidence.push(newsEvidence("Invented sentence of another outlet.")); },
    expect: [[["evidence", 2, "excerpt"], "news_excerpt_not_allowed", B]],
  })),
  ...([korean(1), "  ", korean(500)] as const).map((excerpt): Fixture => ({
    name: `an excerpt of ${excerpt.length} characters on news from another outlet is not allowed, whatever its length`,
    mutate: (c) => { c.documents.push(newsDocument); c.evidence.push(newsEvidence(excerpt)); },
    expect: [[["evidence", 2, "excerpt"], "news_excerpt_not_allowed", B]],
  })),
  ...([korean(1), korean(500)] as const).map((excerpt): Fixture => ({
    name: `a promise excerpt of ${excerpt.length} characters from another outlet is not allowed, whatever its length`,
    mutate: (c) => { c.promise.ownOutlet = false; c.promise.excerpt = excerpt; },
    expect: [[["promise", "excerpt"], "news_excerpt_not_allowed", B]],
  })),
  {
    name: "news from another outlet with an empty excerpt and a fact sentence is allowed",
    mutate: (c) => { c.documents.push(newsDocument); c.evidence.push(newsEvidence("")); },
    expect: [],
  },
  {
    name: "a promise excerpt from another outlet is not allowed",
    mutate: (c) => { c.promise.excerpt = "Invented sentence of another outlet."; },
    expect: [[["promise", "excerpt"], "news_excerpt_not_allowed", B]],
  },
  {
    name: "a promise excerpt of 200 characters from a Seoul Economic Daily article is allowed",
    mutate: (c) => { c.promise.ownOutlet = true; c.promise.excerpt = korean(200); },
    expect: [],
  },
  {
    name: "a promise excerpt of 201 characters from a Seoul Economic Daily article is too long",
    mutate: (c) => { c.promise.ownOutlet = true; c.promise.excerpt = korean(201); },
    expect: [[["promise", "excerpt"], "excerpt_too_long", B]],
  },
  // pasted text
  {
    name: "an excerpt that occurs in the pasted text is allowed",
    mutate: (c) => { c.documents[0].pastedText = "Sec. 1 Invented clause text. Sec. 2 More text."; },
    expect: [],
  },
  {
    name: "an excerpt that does not occur in the pasted text is blocked",
    mutate: (c) => { c.documents[0].pastedText = "Sec. 1 Other invented words."; },
    expect: [
      [["evidence", 0, "excerpt"], "excerpt_not_in_pasted_text", B],
      [["paths", 0, "evidenceRefs", 0], "ref_unresolved", B],
    ],
  },
  {
    name: "an anchor that does not occur in the pasted text only warns",
    mutate: (c) => { c.documents[0].pastedText = "Section one. Invented clause text."; },
    expect: [[["evidence", 0, "anchor"], "anchor_not_in_pasted_text", W]],
  },
  // references
  {
    name: "evidence on an unknown document",
    mutate: (c) => { c.evidence[0].documentId = "Nope"; },
    expect: [
      [["evidence", 0, "documentId"], "ref_unresolved", B],
      [["paths", 0, "evidenceRefs", 0], "ref_unresolved", B],
    ],
  },
  {
    name: "evidence on an unknown version",
    mutate: (c) => { c.evidence[0].versionId = "zz"; },
    expect: [
      [["evidence", 0, "versionId"], "ref_unresolved", B],
      [["paths", 0, "evidenceRefs", 0], "ref_unresolved", B],
    ],
  },
  {
    name: "an event on an unknown document",
    mutate: (c) => { c.events[0].documentId = "Nope"; },
    expect: [[["events", 0, "documentId"], "ref_unresolved", B]],
  },
  {
    name: "an event that cites an unknown evidenceId",
    mutate: (c) => { c.events[0].evidenceRefs = ["ev-1", "ev-9"]; },
    expect: [[["events", 0, "evidenceRefs", 1], "ref_unresolved", B]],
  },
  {
    name: "a path from an unknown version and to an unknown document",
    mutate: (c) => { c.paths[0].from = version("Bill 1", "zz"); c.paths[0].to = version("Nope", "v2"); },
    expect: [
      [["paths", 0, "from", "versionId"], "ref_unresolved", B],
      [["paths", 0, "to", "documentId"], "ref_unresolved", B],
    ],
  },
  {
    name: "a path from an unknown clause",
    mutate: withPath("carried", clause("ev-9"), clause("ev-2")),
    expect: [[["paths", 0, "from", "evidenceId"], "ref_unresolved", B]],
  },
  {
    name: "a path that cites an unknown evidenceId",
    mutate: (c) => { c.paths[0].evidenceRefs = ["ev-1", "ev-9"]; },
    expect: [[["paths", 0, "evidenceRefs", 1], "ref_unresolved", B]],
  },
  {
    name: "a path from the promise when the case has none",
    mutate: (c) => { delete c.promise; withPath("carried", promise, clause("ev-2"))(c); },
    expect: [[["paths", 0, "from"], "ref_unresolved", B]],
  },
  {
    name: "an absence check that names an unknown version",
    mutate: (c) => {
      withPath("not_included", clause("ev-1"), version("Bill 1", "v2"))(c);
      c.paths[0].absenceCheck = {
        documentId: "Bill 1", versionId: "zz", scope: "whole_text", searchedFor: ["term"],
        checkedBy: "A", checkedAt: "2026-11-20", confirmedBy: null, confirmedAt: null,
      };
    },
    expect: [[["paths", 0, "absenceCheck", "versionId"], "ref_unresolved", B]],
  },
  // kind and endpoint table: each kind with endpoints that fit parses without issues
  { name: "next_version between two versions of one document", mutate: withPath("next_version", version("Bill 1", "v1"), version("Bill 1", "v2")), expect: [] },
  { name: "successor_document between two documents", mutate: withPath("successor_document", version("Bill 1", "v2"), version("Law 2", "l1")), expect: [] },
  { name: "carried from a clause to a clause", mutate: withPath("carried", clause("ev-1"), clause("ev-2")), expect: [] },
  { name: "carried from the promise to a clause", mutate: withPath("carried", promise, clause("ev-2")), expect: [] },
  { name: "transferred between clauses of two documents", mutate: withPath("transferred", clause("ev-1"), clause("ev-2")), expect: [] },
  { name: "same_outcome_separate_law from a clause in another document", mutate: withPath("same_outcome_separate_law", clause("ev-1"), clause("ev-2")), expect: [] },
  { name: "same_outcome_separate_law from the promise", mutate: withPath("same_outcome_separate_law", promise, clause("ev-2")), expect: [] },
  { name: "not_included from a clause to a version", mutate: withPath("not_included", clause("ev-1"), version("Bill 1", "v2")), expect: [] },
  { name: "not_included from the promise to a version", mutate: withPath("not_included", promise, version("Law 2", "l1")), expect: [] },
  // kind and endpoint mismatches
  mismatch("next_version to another document", "next_version", version("Bill 1", "v1"), version("Law 2", "l1")),
  mismatch("next_version to the same version", "next_version", version("Bill 1", "v1"), version("Bill 1", "v1")),
  mismatch("next_version from a clause", "next_version", clause("ev-1"), version("Bill 1", "v2")),
  mismatch("successor_document within one document", "successor_document", version("Bill 1", "v1"), version("Bill 1", "v2")),
  mismatch("successor_document to a clause", "successor_document", version("Bill 1", "v1"), clause("ev-2")),
  mismatch("carried from a version", "carried", version("Bill 1", "v1"), clause("ev-2")),
  mismatch("carried to the promise", "carried", clause("ev-1"), promise),
  mismatch("carried to a version", "carried", clause("ev-1"), version("Bill 1", "v2")),
  mismatch("transferred from the promise", "transferred", promise, clause("ev-2")),
  mismatch("transferred within one document", "transferred", clause("ev-1"), clause("ev-1")),
  mismatch("same_outcome_separate_law within one document", "same_outcome_separate_law", clause("ev-1"), clause("ev-1")),
  mismatch("same_outcome_separate_law from a version", "same_outcome_separate_law", version("Bill 1", "v1"), clause("ev-2")),
  mismatch("not_included to a clause", "not_included", clause("ev-1"), clause("ev-2")),
  mismatch("not_included from a version", "not_included", version("Bill 1", "v1"), version("Law 2", "l1")),
];
