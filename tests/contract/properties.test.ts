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
