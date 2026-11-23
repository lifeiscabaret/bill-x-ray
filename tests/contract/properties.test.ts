import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHECK_STATES, EVENT_KINDS, PATH_KINDS, SOURCE_KINDS, parseCase } from "../../src/contract";
import type { Case } from "../../src/contract";
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
