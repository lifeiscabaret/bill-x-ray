import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHECK_STATES, EVENT_KINDS, PATH_KINDS, SOURCE_KINDS, parseCase } from "../../src/contract";
import type { Case, DocumentVersion, Endpoint, Evidence, EvidenceCheck, Origin, Path } from "../../src/contract";
import { isMissingUrl, normalizeCaseUrls } from "../../src/contract/urls";
import { richCase } from "../fixtures/contract/stage23";
import { minimalCase, options, resolves } from "./helpers";

// Every path of a value, as a list of key lists (containers and leaves).
function allPaths(v: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  if (v === null || typeof v !== "object") return [prefix];
  const kids = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v);
  return [prefix, ...kids.flatMap((k) => allPaths((v as Record<string | number, unknown>)[k], [...prefix, k]))];
}

// A valid case with one place replaced by arbitrary JSON, or removed.
const damaged = (base: () => unknown) => fc
  .tuple(fc.nat(), fc.jsonValue(), fc.boolean())
  .map(([n, value, remove]) => {
    const input = base();
    const paths = allPaths(input).filter((p) => p.length > 0);
    const path = paths[n % paths.length]!;
    let cur = input as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) cur = cur[key] as Record<string | number, unknown>;
    if (remove) delete cur[path[path.length - 1]!];
    else cur[path[path.length - 1]!] = value;
    return input;
  });
const damagedCase = damaged(minimalCase);
const damagedRichCase = damaged(richCase);

// Generated cases of bounded size (up to 4 documents, 4 evidence rows, 3 events, 4 paths). The strings
// are short and drawn from a small alphabet that includes the two look-alike characters, so ids
// collide, references resolve and break, and URLs are fixed, missing and malformed.
const LOOKALIKES = ["\u2236", "\u00B7"];
const str = fc.string({ unit: fc.constantFrom("a", "b", "1", "/", ":", ".", "-", " ", ";", ...LOOKALIKES), maxLength: 8 });
const id = fc.constantFrom("a", "b", "c");
const url = fc.oneof(
  str, fc.constant(null), fc.constant(""), fc.constant("unknown"),
  fc.constantFrom("https://example.org/a", "https\u2236//example\u00B7org/a;jsessionid=1", "ftp\u2236//example.org"),
);
const role = fc.constantFrom("A", "B");
const maybe = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: null });
const endpoint = fc.oneof(
  fc.record({ type: fc.constant("version" as const), documentId: id, versionId: id }),
  fc.record({ type: fc.constant("clause" as const), evidenceId: id }),
  fc.record({ type: fc.constant("promise" as const) }),
);
const generatedCase: fc.Arbitrary<Case> = fc.record({
  contractVersion: fc.constant(1 as const),
  caseId: str, title: str, jurisdiction: str, session: maybe(str),
  promise: fc.option(
    fc.record({ statement: str, sourceTitle: str, publisher: str, sourceUrl: url, date: str, excerpt: maybe(str), ownOutlet: fc.boolean() }, { requiredKeys: ["statement", "sourceTitle", "publisher", "sourceUrl", "date"] }),
    { nil: undefined },
  ),
  documents: fc.array(fc.record({
    documentId: id, versionId: id, localEventLabel: maybe(str), sourceUrl: url, title: str, publisher: str,
    sourceKind: fc.constantFrom(...SOURCE_KINDS), language: str, pastedText: maybe(str), ownOutlet: fc.boolean(),
  }, { requiredKeys: ["documentId", "versionId", "localEventLabel", "sourceUrl", "title", "publisher", "sourceKind", "language"] }), { maxLength: 4 }),
  evidence: fc.array(fc.record({
    evidenceId: id, documentId: id, versionId: id, anchor: str, excerpt: str,
    check: fc.record({
      state: fc.constantFrom(...CHECK_STATES), url, checkedBy: maybe(role), checkedAt: maybe(str),
      confirmedBy: maybe(role), confirmedAt: maybe(str), confirmedUrl: url,
    }),
  }), { maxLength: 4 }),
  events: fc.array(fc.record({
    eventId: id, documentId: id, versionId: id, eventKind: fc.constantFrom(...EVENT_KINDS), eventDate: str,
    evidenceRefs: fc.array(id, { maxLength: 2 }),
  }), { maxLength: 3 }),
  paths: fc.array(fc.record({
    pathId: id, from: endpoint, to: endpoint, kind: fc.constantFrom(...PATH_KINDS), evidenceRefs: fc.array(id, { maxLength: 2 }),
    reviewState: fc.constantFrom("confirmed" as const, "unverified" as const),
  }), { maxLength: 4 }),
}, { requiredKeys: ["contractVersion", "caseId", "title", "jurisdiction", "session", "documents", "evidence", "events", "paths"] });

describe("parseCase on arbitrary input", () => {
  it("never throws for any JSON value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        const r = parseCase(input, options);
        expect(Array.isArray(r.issues)).toBe(true);
      }),
      { numRuns: 500 },
    );
  }, 30_000);

  it("never throws for a valid case with one place damaged", () => {
    fc.assert(fc.property(damagedCase, (input) => void parseCase(input, options)), { numRuns: 500 });
  });
});

describe("property 11: issues point at the input", () => {
  const check = (input: unknown) => {
    const { model, issues } = parseCase(input, options);
    for (const issue of issues) expect(resolves(input, issue.path), `${JSON.stringify(issue.path)}`).toBe(true);
    for (const e of model?.excluded ?? []) expect(resolves(input, e.path)).toBe(true);
  };

  it("holds for any JSON value", () => {
    fc.assert(fc.property(fc.jsonValue(), check), { numRuns: 500 });
  });

  it("holds for a valid case with one place damaged", () => {
    fc.assert(fc.property(damagedCase, check), { numRuns: 500 });
  });
});

describe("property 11 on rich and generated cases", () => {
  const check = (input: unknown) => {
    const { model, issues } = parseCase(input, options);
    for (const issue of issues) expect(resolves(input, issue.path), `${JSON.stringify(issue.path)}`).toBe(true);
    for (const e of model?.excluded ?? []) expect(resolves(input, e.path)).toBe(true);
  };

  it("holds for a rich valid case with one place damaged", () => {
    fc.assert(fc.property(damagedRichCase, check), { numRuns: 500 });
  });

  it("holds for generated cases, and each removed record is listed once", () => {
    fc.assert(
      fc.property(generatedCase, (input) => {
        check(input);
        const { model } = parseCase(input, options);
        const keys = model!.excluded.map((e) => JSON.stringify(e.path));
        expect(new Set(keys).size).toBe(keys.length);
        for (const list of ["documents", "evidence", "events", "paths"] as const) {
          const removed = model!.excluded.filter((e) => e.path[0] === list).length;
          expect(model!.case[list]).toHaveLength(input[list].length - removed);
        }
      }),
      { numRuns: 500 },
    );
  }, 30_000);
});

describe("property 7: normalization touches URLs only", () => {
  const URL_FIELD = "<url>";
  // The case with its four kinds of URL field blanked out: whatever is left must not change.
  const withoutUrls = (c: Case) => ({
    ...c,
    documents: c.documents.map((d) => ({ ...d, sourceUrl: URL_FIELD })),
    evidence: c.evidence.map((e) => ({ ...e, check: { ...e.check, url: URL_FIELD, confirmedUrl: URL_FIELD } })),
    ...(c.promise ? { promise: { ...c.promise, sourceUrl: URL_FIELD } } : {}),
  });

  it("changes nothing outside the four URL fields", () => {
    fc.assert(
      fc.property(generatedCase, (c) => {
        expect(withoutUrls(normalizeCaseUrls(c).case)).toEqual(withoutUrls(c));
      }),
      { numRuns: 500 },
    );
  }, 30_000);

  it("changes a URL field only by replacing the two look-alike characters", () => {
    fc.assert(
      fc.property(generatedCase, (c) => {
        const n = normalizeCaseUrls(c).case;
        const fields = (x: Case) => [
          ...x.documents.map((d) => d.sourceUrl),
          ...x.evidence.flatMap((e) => [e.check.url, e.check.confirmedUrl]),
          ...(x.promise ? [x.promise.sourceUrl] : []),
        ];
        const after = fields(n);
        fields(c).forEach((v, i) => {
          const w = after[i];
          if (v === null || isMissingUrl(v)) expect(w).toBe(v);
          else expect(w).toBe(v.replace(/\u2236/g, ":").replace(/\u00B7/g, "."));
          if (w !== null && !isMissingUrl(w)) expect(w).not.toMatch(/[\u2236\u00B7]/);
        });
      }),
      { numRuns: 500 },
    );
  }, 30_000);

  it("applying it twice equals applying it once, and the second pass fixes nothing", () => {
    fc.assert(
      fc.property(generatedCase, (c) => {
        const once = normalizeCaseUrls(c);
        const twice = normalizeCaseUrls(once.case);
        expect(twice.case).toEqual(once.case);
        expect(twice.issues.filter((i) => i.code === "url_lookalike_fixed")).toEqual([]);
        // the same other issues, because the checks look at the normalized value
        expect(twice.issues.map((i) => [i.path, i.code])).toEqual(once.issues.filter((i) => i.code !== "url_lookalike_fixed").map((i) => [i.path, i.code]));
      }),
      { numRuns: 500 },
    );
  }, 30_000);
});

describe("property 8: no new dates", () => {
  // Event dates drawn from valid dates of every precision, `unknown`, near misses and free text.
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  const eventDate = fc.oneof(
    fc.tuple(fc.integer({ min: 1900, max: 2100 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }), fc.constantFrom("day", "month", "year"))
      .map(([y, m, d, p]) => (p === "year" ? pad(y, 4) : p === "month" ? `${pad(y, 4)}-${pad(m, 2)}` : `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`)),
    fc.constant("unknown"), fc.constantFrom("2026-02-30", "2026-1-5", "six months after promulgation", "공포 후 6개월"), str,
  );
  const events = fc.array(fc.record({
    eventId: id, documentId: id, versionId: id, eventKind: fc.constantFrom(...EVENT_KINDS), eventDate,
    evidenceRefs: fc.array(id, { maxLength: 2 }),
  }), { maxLength: 5 });
  const reference = fc.oneof(fc.constant("2026-06-15"), eventDate);

  it("every date in the model appears in the input, and every entry belongs to an event of the model", () => {
    fc.assert(
      fc.property(generatedCase, events, reference, (base, evs, referenceDate) => {
        const input = { ...base, events: evs };
        const { model } = parseCase(input, { ...options, referenceDate });
        const inputDates = new Set(evs.map((e) => e.eventDate));
        for (const e of model!.case.events) expect(inputDates.has(e.eventDate)).toBe(true);
        expect(Object.keys(model!.dates).sort()).toEqual(model!.case.events.map((e) => e.eventId).sort());
        // a kept event is an input event, field for field; the reference date is the one given
        expect(model!.referenceDate).toBe(referenceDate);
        for (const e of model!.case.events) expect(evs).toContainEqual(e);
      }),
      { numRuns: 200 },
    );
  }, 30_000);
});

describe("property 9: future dates are never past", () => {
  const two = (n: number) => String(n).padStart(2, "0");
  // A date of any precision, and the first day it can mean (an independent oracle).
  const partial = fc.tuple(fc.integer({ min: 1990, max: 2060 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }), fc.constantFrom("day", "month", "year"))
    .map(([y, m, d, p]) => ({
      text: p === "year" ? `${y}` : p === "month" ? `${y}-${two(m)}` : `${y}-${two(m)}-${two(d)}`,
      earliest: p === "year" ? `${y}-01-01` : p === "month" ? `${y}-${two(m)}-01` : `${y}-${two(m)}-${two(d)}`,
    }));
  const referenceDay = fc.tuple(fc.integer({ min: 1990, max: 2060 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
    .map(([y, m, d]) => `${y}-${two(m)}-${two(d)}`);

  it("an effective or applied event whose earliest possible day is after the reference date is scheduled", () => {
    fc.assert(
      fc.property(partial, referenceDay, fc.constantFrom("effective" as const, "applied" as const), (date, referenceDate, eventKind) => {
        fc.pre(date.earliest > referenceDate);
        const c: Case = { ...minimalCase(), events: [{ eventId: "e", documentId: "Bill 1", versionId: "v1", eventKind, eventDate: date.text, evidenceRefs: [] }] };
        const { model } = parseCase(c, { ...options, referenceDate });
        expect(model!.dates["e"]!.timing).toBe("scheduled");
      }),
      { numRuns: 200 },
    );
  }, 30_000);
});

// ---- Properties 1 to 6 (data-contract 8.3) ----
//
// Cases come from `structuredCase`: invented ids and wording, at most 8 versions, 12 evidence rows
// and 10 paths, built so that every kind of path and every status shows up often (the generator
// test below checks that). Each property runs 200 times with an explicit timeout, because other
// chats run their tests at the same time.

type G = fc.GeneratorValue;
const roll = (g: G, n: number) => g(fc.integer, { min: 0, max: n - 1 });
const pick = <T>(g: G, items: readonly T[]): T => items[roll(g, items.length)]!;

const DOC_IDS = ["D1", "D2", "D3"];
const VERSION_IDS = ["v1", "v2", "v3"];
const PAIRS = DOC_IDS.flatMap((documentId) => VERSION_IDS.map((versionId) => ({ documentId, versionId })));
const NUMBER_KINDS: readonly string[] = ["next_version", "successor_document"];

const passingCheck = (url: string, by: "A" | "B" = "A"): EvidenceCheck => ({
  state: "matched_official", url, checkedBy: by, checkedAt: "2026-11-20", confirmedBy: null, confirmedAt: null, confirmedUrl: null,
});
const emptyCheck = (): EvidenceCheck => ({
  state: "not_checked", url: null, checkedBy: null, checkedAt: null, confirmedBy: null, confirmedAt: null, confirmedUrl: null,
});

function buildCase(g: G): Case {
  const picked = g(fc.shuffledSubarray, PAIRS, { minLength: 1, maxLength: 8 });
  const documents: DocumentVersion[] = picked.map(({ documentId, versionId }) => {
    const k = roll(g, 20); // 0 to 17 official, 18 news, 19 other
    const sourceKind = k < 18 ? "official" : k === 18 ? "news" : "other";
    const u = roll(g, 30);
    return {
      documentId, versionId, localEventLabel: null,
      sourceUrl: u === 0 ? null : u === 1 ? "ftp://example.org/x" : `https://example.org/${documentId}-${versionId}`,
      title: `Invented ${documentId} ${versionId}`, publisher: "Example Parliament", sourceKind, language: "en",
      ...(sourceKind === "news" ? { ownOutlet: g(fc.boolean), factSentence: "Invented fact." } : {}),
    };
  });

  const evidence: Evidence[] = [];
  const evidenceCount = roll(g, 13); // 0 to 12
  for (let i = 0; i < evidenceCount; i++) {
    const d = roll(g, 15) === 0 ? undefined : pick(g, documents); // now and then a row on a version that does not exist
    const url = d?.sourceUrl?.startsWith("https://") ? d.sourceUrl : "https://example.org/other";
    const x = roll(g, 20);
    let excerpt = `Invented clause ${i}`;
    if (!d || x === 0) excerpt = "";
    else if (x === 1) excerpt = d.documentId; // a shared number offered as evidence
    else if (x === 2) excerpt = d.title; // a title offered as evidence
    else if (d.sourceKind === "news" && d.ownOutlet !== true && roll(g, 2) === 0) excerpt = "";
    const s = roll(g, 10);
    const other = pick(g, ["not_checked", "could_not_open", "mismatch"] as const);
    const check: EvidenceCheck =
      s <= 7 ? passingCheck(url, pick(g, ["A", "B"] as const))
      : s === 8 ? passingCheck("https://example.org/other") // another page than the source
      : roll(g, 3) === 0 ? { ...passingCheck(url), checkedBy: null } // no role recorded
      : roll(g, 2) === 0 ? { ...passingCheck(url), state: "partial" }
      : { ...passingCheck(url), state: other };
    evidence.push({
      evidenceId: `e${i}`, documentId: d?.documentId ?? "D9", versionId: d?.versionId ?? "v1",
      anchor: roll(g, 12) === 0 ? "" : `Sec. ${i}`, excerpt, check,
    });
  }
  // Some versions carry pasted text that holds every excerpt and anchor; now and then it does not.
  const withText = documents.map((d) => {
    if (roll(g, 5) !== 0) return d;
    const rows = evidence.filter((e) => e.documentId === d.documentId && e.versionId === d.versionId);
    const text = roll(g, 8) === 0 ? "Invented unrelated text." : ["Invented text.", ...rows.flatMap((e) => [e.anchor, e.excerpt])].join(" | ");
    return { ...d, pastedText: text };
  });

  const hasPromise = roll(g, 2) === 0;
  const versionEnd = (d: DocumentVersion): Endpoint => ({ type: "version", documentId: d.documentId, versionId: d.versionId });
  const clauseEnd = (e?: Evidence): Endpoint => ({ type: "clause", evidenceId: e?.evidenceId ?? "e-none" });
  const docOf = (end: Endpoint) =>
    end.type === "version" ? end.documentId : end.type === "clause" ? evidence.find((e) => e.evidenceId === end.evidenceId)?.documentId : undefined;

  const paths: Path[] = [];
  const pathCount = roll(g, 11); // 0 to 10
  for (let i = 0; i < pathCount; i++) {
    const kind = pick(g, PATH_KINDS);
    const a = pick(g, documents);
    const sameDoc = documents.filter((x) => x.documentId === a.documentId && x.versionId !== a.versionId);
    const otherDoc = documents.filter((x) => x.documentId !== a.documentId);
    const fromClause: Endpoint = hasPromise && roll(g, 10) === 0 ? { type: "promise" } : clauseEnd(evidence.length ? pick(g, evidence) : undefined);
    const toClause = (from: Endpoint): Endpoint => {
      const fromDoc = docOf(from);
      const far = evidence.filter((e) => e.documentId !== fromDoc);
      return clauseEnd(far.length && roll(g, 8) !== 0 ? pick(g, far) : evidence.length ? pick(g, evidence) : undefined);
    };
    let from: Endpoint;
    let to: Endpoint;
    if (kind === "next_version") [from, to] = [versionEnd(a), versionEnd(sameDoc.length ? pick(g, sameDoc) : pick(g, documents))];
    else if (kind === "successor_document") [from, to] = [versionEnd(a), versionEnd(otherDoc.length ? pick(g, otherDoc) : pick(g, documents))];
    else if (kind === "carried") [from, to] = [fromClause, clauseEnd(evidence.length ? pick(g, evidence) : undefined)];
    else if (kind === "not_included") [from, to] = [fromClause, versionEnd(pick(g, documents))];
    else [from, to] = [fromClause, toClause(fromClause)];

    // Rows from the documents the path touches, and usually the clause rows at its ends.
    const docs = [docOf(from), docOf(to)];
    const pool = roll(g, 6) === 0 ? evidence : evidence.filter((e) => docs.includes(e.documentId));
    const refs = new Set(g(fc.shuffledSubarray, pool.map((e) => e.evidenceId), { maxLength: Math.min(4, pool.length) }));
    if (roll(g, 6) !== 0) for (const end of [from, to]) if (end.type === "clause") refs.add(end.evidenceId);

    const path: Path = { pathId: `p${i}`, from, to, kind, evidenceRefs: [...refs], reviewState: pick(g, ["confirmed", "unverified"] as const) };
    if (kind === "not_included") {
      const named = roll(g, 8) !== 0 && to.type === "version";
      const scope = roll(g, 4);
      path.absenceCheck = {
        documentId: named && to.type === "version" ? to.documentId : "D9", versionId: named && to.type === "version" ? to.versionId : "v1",
        scope: scope === 0 ? { articles: [""] } : scope === 1 ? { articles: ["Sec. 1"] } : "whole_text",
        searchedFor: ["invented term"], checkedBy: roll(g, 8) === 0 ? null : "A", checkedAt: roll(g, 8) === 0 ? null : "2026-11-22",
        confirmedBy: null, confirmedAt: null,
      };
    }
    paths.push(path);
  }

  const events = Array.from({ length: roll(g, 3) }, (_, i) => {
    const d = pick(g, documents);
    return {
      eventId: `ev${i}`, documentId: d.documentId, versionId: d.versionId, eventKind: pick(g, EVENT_KINDS),
      eventDate: pick(g, ["2026-01-15", "2027", "2025-07", "unknown"]), evidenceRefs: [],
    };
  });

  return {
    contractVersion: 1, caseId: "fixture-generated", title: "Synthetic fixture", jurisdiction: "XX", session: null,
    ...(hasPromise ? { promise: { statement: "Invented statement.", sourceTitle: "Invented report", publisher: "Example Daily", sourceUrl: "https://example.org/report", date: "2020", factSentence: "Invented fact." } } : {}),
    documents: withText, evidence, events, paths,
  };
}

const structuredCase = fc.gen().map(buildCase);
const RUNS = { numRuns: 200 };
const TIMEOUT = 60_000;
const ORIGINS: Origin[] = ["bundled", "user"];
const STATUSES = ["confirmed", "not_verified", "evidence_missing", "omission_not_verified"];
const parseAs = (input: Case, origin: Origin) => parseCase(input, { ...options, origin, bundledChecks: [] }).model!;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
// An evidence row of a clause path that only repeats its version's title or number is set aside (Req 2.3).
const repeatsTitleOrNumber = (c: Case, e: Evidence) => {
  const v = c.documents.find((d) => d.documentId === e.documentId && d.versionId === e.versionId);
  return v !== undefined && [v.title, v.documentId].some((t) => norm(t) === norm(e.excerpt));
};
const rowsOf = (m: { case: Case }, p: Path) => p.evidenceRefs.map((id) => m.case.evidence.find((e) => e.evidenceId === id)!);
/** The rows a path rests on: all of them, except the ones set aside on the clause track. */
const resting = (m: { case: Case }, p: Path) => rowsOf(m, p).filter((e) => NUMBER_KINDS.includes(p.kind) || !repeatsTitleOrNumber(m.case, e));

describe("the generator of structured cases", () => {
  const sample = fc.sample(structuredCase, { numRuns: 400, seed: 20261124 });

  it("stays within 8 versions, 12 evidence rows and 10 paths", () => {
    for (const c of sample) {
      expect(c.documents.length).toBeLessThanOrEqual(8);
      expect(c.evidence.length).toBeLessThanOrEqual(12);
      expect(c.paths.length).toBeLessThanOrEqual(10);
    }
  });

  it("reaches every status and every kind of confirmed path, so the properties are not empty", () => {
    const models = sample.map((c) => parseAs(c, "bundled"));
    const views = models.flatMap((m) => m.case.paths.map((p) => ({ kind: p.kind, status: m.paths[p.pathId]!.status })));
    for (const status of STATUSES) expect(views.some((v) => v.status === status), status).toBe(true);
    for (const kind of PATH_KINDS) expect(views.filter((v) => v.kind === kind && v.status === "confirmed").length, kind).toBeGreaterThanOrEqual(5);
    expect(views.filter((v) => v.status === "confirmed").length).toBeGreaterThanOrEqual(100);
  });

  it("gives confirmed paths as a bundled case that a user case does not keep", () => {
    const lost = sample.filter((c) => Object.values(parseAs(c, "bundled").paths).some((v) => v.status === "confirmed")
      && Object.values(parseAs(c, "user").paths).every((v) => v.status !== "confirmed"));
    expect(lost.length).toBeGreaterThanOrEqual(50);
  });
});

describe("property 1: one status and one track per path", () => {
  it("every path in the model has exactly one view, with one status and the track of its kind", () => {
    fc.assert(
      fc.property(structuredCase, (input) => {
        for (const origin of ORIGINS) {
          const m = parseAs(input, origin);
          const ids = m.case.paths.map((p) => p.pathId);
          expect(new Set(ids).size).toBe(ids.length);
          expect(Object.keys(m.paths).sort()).toEqual([...ids].sort());
          for (const p of m.case.paths) {
            const v = m.paths[p.pathId]!;
            expect(STATUSES).toContain(v.status);
            expect(v.track).toBe(NUMBER_KINDS.includes(p.kind) ? "number" : "clause");
            expect(Object.keys(v).sort()).toEqual(["drawable", "needs", "status", "track"]);
            if (v.status === "evidence_missing") expect(v.drawable).toBe(false);
            // what is still needed is listed for every status that is not confirmed (Req 3.7)
            expect(v.needs.length > 0).toBe(v.status !== "confirmed");
          }
          // every input path is either in the model or listed once as removed
          const removed = m.excluded.filter((e) => e.path[0] === "paths").length;
          expect(ids.length + removed).toBe(input.paths.length);
        }
      }),
      RUNS,
    );
  }, TIMEOUT);
});

describe("property 2: no confirmed path rests on failing evidence", () => {
  it("every row a confirmed path rests on passes the gate", () => {
    fc.assert(
      fc.property(structuredCase, (input) => {
        for (const origin of ORIGINS) {
          const m = parseAs(input, origin);
          for (const p of m.case.paths) {
            if (m.paths[p.pathId]!.status !== "confirmed") continue;
            const rows = resting(m, p);
            expect(rows.length, `${p.pathId} rests on some row`).toBeGreaterThan(0);
            for (const e of rows) expect(m.gate[e.evidenceId]!.pass, `${p.pathId} / ${e.evidenceId}`).toBe(true);
          }
        }
      }),
      RUNS,
    );
  }, TIMEOUT);

  it("a confirmed not_included path names the searched version and has one role; a confirmed separate-law path has passing rows from both documents", () => {
    fc.assert(
      fc.property(structuredCase, (input) => {
        const m = parseAs(input, "bundled");
        for (const p of m.case.paths) {
          if (m.paths[p.pathId]!.status !== "confirmed") continue;
          const rows = resting(m, p);
          if (p.kind === "not_included") {
            expect(p.to.type).toBe("version");
            const to = p.to as Extract<Endpoint, { type: "version" }>;
            expect(p.absenceCheck).toMatchObject({ documentId: to.documentId, versionId: to.versionId });
            expect(p.absenceCheck!.checkedBy).not.toBeNull();
            expect(p.absenceCheck!.checkedAt).not.toBeNull();
            expect(rows.some((e) => e.documentId === to.documentId && e.versionId === to.versionId && m.gate[e.evidenceId]!.pass)).toBe(true);
          }
          if (p.kind === "same_outcome_separate_law") {
            expect(p.from.type).not.toBe("promise");
            for (const end of [p.from, p.to]) {
              if (end.type !== "clause") continue;
              const documentId = m.case.evidence.find((e) => e.evidenceId === end.evidenceId)!.documentId;
              expect(rows.some((e) => e.documentId === documentId && m.gate[e.evidenceId]!.pass), documentId).toBe(true);
            }
          }
        }
      }),
      RUNS,
    );
  }, TIMEOUT);
});

describe("property 3: failing evidence never confirms", () => {
  it("adding a row that fails the gate to every path leaves no path confirmed", () => {
    fc.assert(
      fc.property(structuredCase, (input) => {
        const before = parseAs(input, "bundled");
        // a row on an official version with a link and no pasted text, so that nothing else removes it
        const host = before.case.documents.find((d) => d.sourceKind === "official" && d.sourceUrl !== null && !d.pastedText);
        fc.pre(host !== undefined);
        const added: Evidence = {
          evidenceId: "x-failing", documentId: host!.documentId, versionId: host!.versionId, anchor: "Sec. 99",
          excerpt: "Invented added clause.", check: { ...passingCheck(host!.sourceUrl!), state: "could_not_open" },
        };
        const next: Case = {
          ...input,
          evidence: [...input.evidence, added],
          paths: input.paths.map((p) => ({ ...p, evidenceRefs: [...p.evidenceRefs, added.evidenceId] })),
        };
        const after = parseAs(next, "bundled");
        expect(after.gate["x-failing"]!.pass).toBe(false);
        for (const p of after.case.paths) expect(after.paths[p.pathId]!.status, p.pathId).not.toBe("confirmed");
        // a path that was not confirmed before is not confirmed now: the status never rises
        for (const p of before.case.paths) {
          if (before.paths[p.pathId]!.status !== "confirmed") expect(after.paths[p.pathId]?.status).not.toBe("confirmed");
        }
      }),
      RUNS,
    );
  }, TIMEOUT);
});

describe("property 4: a shared number is not a clause link", () => {
  it("a clause path whose only evidence repeats a title or a number is never confirmed", () => {
    fc.assert(
      fc.property(structuredCase, (input) => {
        // every row now offers its version's number or title, with a complete passing check, and no version has pasted text
        const documents = input.documents.map(({ pastedText: _dropped, ...d }) => d);
        const evidence = input.evidence.map((e, i) => {
          const d = documents.find((x) => x.documentId === e.documentId && x.versionId === e.versionId);
          return d ? { ...e, excerpt: i % 2 === 0 ? d.documentId : d.title, anchor: "Sec. 1", check: passingCheck(d.sourceUrl ?? "https://example.org/x") } : e;
        });
        for (const origin of ORIGINS) {
          const m = parseAs({ ...input, documents, evidence }, origin);
          for (const p of m.case.paths) {
            const v = m.paths[p.pathId]!;
            if (v.track !== "clause") continue;
            expect(v.status, p.pathId).not.toBe("confirmed");
            expect(v.status, p.pathId).toBe("evidence_missing");
            expect(v.drawable).toBe(false);
          }
        }
      }),
      RUNS,
    );
  }, TIMEOUT);
});

describe("property 5: texts do not decide links", () => {
  // Every version gets a pasted text (or none) that still holds all of its excerpts and anchors.
  const retext = (c: Case, make: ((parts: string[]) => string) | null): Case => ({
    ...c,
    documents: c.documents.map(({ pastedText: _dropped, ...d }) => {
      if (make === null) return d;
      const rows = c.evidence.filter((e) => e.documentId === d.documentId && e.versionId === d.versionId);
      return { ...d, pastedText: make(rows.flatMap((e) => [e.anchor, e.excerpt]).filter((s) => s !== "")) };
    }),
  });
  const summary = (c: Case, origin: Origin) => {
    const m = parseAs(c, origin);
    return Object.fromEntries(Object.entries(m.paths).map(([id, v]) => [id, [v.status, v.track, v.drawable]]));
  };

  it("changing or removing pastedText, while every excerpt stays inside it, leaves every path status unchanged", () => {
    fc.assert(
      fc.property(structuredCase, fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 }), (input, head, tail, filler) => {
        const a = retext(input, (parts) => `${head} ${parts.join(" ")} ${tail}`);
        const b = retext(input, (parts) => `${filler} ${[...parts].reverse().join(` ${filler} `)}`);
        const none = retext(input, null);
        for (const origin of ORIGINS) {
          const want = summary(none, origin);
          expect(summary(a, origin)).toEqual(want);
          expect(summary(b, origin)).toEqual(want);
        }
      }),
      RUNS,
    );
  }, TIMEOUT);
});

describe("property 6: user cases cannot confirm by themselves", () => {
  it("a user case with empty bundledChecks has no confirmed path", () => {
    fc.assert(
      fc.property(structuredCase, (input) => {
        const m = parseAs(input, "user");
        for (const v of Object.values(m.paths)) expect(v.status).not.toBe("confirmed");
        for (const g of Object.values(m.gate)) expect(g.pass).toBe(false);
      }),
      RUNS,
    );
  }, TIMEOUT);
});

describe("property 11 re-run on the structured cases", () => {
  const check = (input: unknown, origin: Origin) => {
    const { model, issues } = parseCase(input, { ...options, origin, bundledChecks: [] });
    for (const issue of issues) expect(resolves(input, issue.path), JSON.stringify(issue.path)).toBe(true);
    for (const e of model?.excluded ?? []) expect(resolves(input, e.path), JSON.stringify(e.path)).toBe(true);
  };
  // The case with one place replaced by arbitrary JSON, or removed.
  const damagedStructured = fc.tuple(structuredCase, fc.nat(), fc.jsonValue(), fc.boolean()).map(([input, n, value, remove]) => {
    const places = allPaths(input).filter((p) => p.length > 0);
    const path = places[n % places.length]!;
    let cur = input as unknown as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) cur = cur[key] as Record<string | number, unknown>;
    if (remove) delete cur[path[path.length - 1]!];
    else cur[path[path.length - 1]!] = value;
    return input as unknown;
  });

  it("holds for the structured cases and for the ones with one place damaged, in both origins", () => {
    fc.assert(fc.property(structuredCase, (input) => { for (const o of ORIGINS) check(input, o); }), RUNS);
    fc.assert(fc.property(damagedStructured, (input) => { for (const o of ORIGINS) check(input, o); }), RUNS);
  }, TIMEOUT);
});
