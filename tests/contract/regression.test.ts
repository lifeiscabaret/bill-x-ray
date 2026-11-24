import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCase } from "../../src/contract";
import type { Issue, Origin } from "../../src/contract";
import { resolves } from "./helpers";

// Regression fixtures (data-contract 8.1, 8.2). Every pair in tests/fixtures/contract/ is
// <name>.json (the input case) and <name>.expected.json (what parseCase must give). The runner
// takes whatever pairs the folder holds, so a new pair needs no code change. The expected files
// are written from the requirements and the design, never copied from the output. The clock is
// never read: each expected file names its reference date and the origin it is parsed with.

const DIR = join(import.meta.dirname, "..", "fixtures", "contract");

interface Expected {
  description: string;
  covers: string[];
  origin: Origin;
  referenceDate: string;
  issues: { path: (string | number)[]; code: Issue["code"]; severity: Issue["severity"] }[];
  paths: Record<string, { kind: string; track: string; status: string; drawable: boolean; needs: string[] }>;
  gate?: Record<string, { pass: boolean; reasons: string[] }>;
  dates?: Record<string, string>;
  normalized?: { path: (string | number)[]; value: string }[];
  excluded: { path: (string | number)[]; reason: string }[];
}

const files = readdirSync(DIR);
const names = files.filter((f) => f.endsWith(".json") && !f.endsWith(".expected.json")).map((f) => f.slice(0, -".json".length)).sort();
const read = (file: string) => JSON.parse(readFileSync(join(DIR, file), "utf8")) as unknown;

// The ten cases of work order §4 and Requirements 8.1 and 8.2. A deleted pair fails here.
const REQUIRED = [
  "same-number-different-version", "different-number-successor", "path-without-evidence", "missing-publisher-and-source",
  "future-effective-date", "transfer-and-separate-law", "translation-as-evidence", "lookalike-urls",
  "similar-texts-no-relation", "confirmed-claim-failing-evidence",
];

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (items: unknown[]) => items.map((x) => JSON.stringify(x)).sort(byKey);
const valueAt = (root: unknown, path: (string | number)[]) =>
  path.reduce<unknown>((cur, key) => (cur as Record<string | number, unknown>)[key], root);

describe("regression fixtures: the folder", () => {
  it("holds the ten named pairs", () => {
    for (const name of REQUIRED) expect(names, name).toContain(name);
  });

  it("has an expected file for every input and an input for every expected file", () => {
    const expectedNames = files.filter((f) => f.endsWith(".expected.json")).map((f) => f.slice(0, -".expected.json".length)).sort();
    expect(expectedNames).toEqual(names);
  });
});

for (const name of names) {
  describe(`regression fixture: ${name}`, () => {
    const input = read(`${name}.json`) as Record<string, unknown>;
    const expected = read(`${name}.expected.json`) as Expected;
    const before = structuredClone(input);
    const options = { referenceDate: expected.referenceDate, origin: expected.origin, bundledChecks: [] };
    const { model, issues } = parseCase(input, options);

    it("is synthetic and says what it covers", () => {
      expect(input.caseId).toMatch(/^fixture-/);
      expect(input.title).toBe("Synthetic fixture");
      expect(expected.description.length).toBeGreaterThan(0);
      expect(expected.covers.length).toBeGreaterThan(0);
      expect(["bundled", "user"]).toContain(expected.origin);
      expect(expected.referenceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("parses to a model, leaves the input unchanged and gives the same result twice", () => {
      expect(model).not.toBeNull();
      expect(input).toEqual(before);
      expect(parseCase(structuredClone(before), options)).toEqual({ model, issues });
      expect(model!.origin).toBe(expected.origin);
      expect(model!.referenceDate).toBe(expected.referenceDate);
    });

    it("reports exactly the expected issues, each at a place in the input", () => {
      expect(sorted(issues.map((i) => ({ path: i.path, code: i.code, severity: i.severity })))).toEqual(sorted(expected.issues));
      for (const i of issues) expect(resolves(input, i.path), JSON.stringify(i.path)).toBe(true);
    });

    it("gives every path that is left the expected status, track, drawable flag and needs", () => {
      expect(Object.keys(model!.paths).sort()).toEqual(Object.keys(expected.paths).sort());
      for (const [pathId, want] of Object.entries(expected.paths)) {
        const got = model!.paths[pathId]!;
        const path = model!.case.paths.find((p) => p.pathId === pathId)!;
        expect(path.kind, `${pathId} kind`).toBe(want.kind);
        expect(got.status, `${pathId} status`).toBe(want.status);
        expect(got.track, `${pathId} track`).toBe(want.track);
        expect(got.drawable, `${pathId} drawable`).toBe(want.drawable);
        expect(got.needs.map((n) => n.code).sort(), `${pathId} needs`).toEqual([...want.needs].sort());
        // a status that is not confirmed always says what is still needed (Req 3.7)
        if (want.status !== "confirmed") expect(want.needs.length).toBeGreaterThan(0);
      }
    });

    it("lists the removed records", () => {
      expect(sorted(model!.excluded)).toEqual(sorted(expected.excluded));
    });

    if (expected.gate) {
      it("gives every evidence row the expected gate result", () => {
        expect(Object.keys(model!.gate).sort()).toEqual(Object.keys(expected.gate!).sort());
        for (const [evidenceId, want] of Object.entries(expected.gate!)) {
          expect(model!.gate[evidenceId]!.pass, `${evidenceId} pass`).toBe(want.pass);
          expect(model!.gate[evidenceId]!.reasons, `${evidenceId} reasons`).toEqual(want.reasons);
        }
      });
    }

    if (expected.dates) {
      it("gives the listed events the expected timing", () => {
        for (const [eventId, timing] of Object.entries(expected.dates!)) expect(model!.dates[eventId]!.timing, eventId).toBe(timing);
        expect(Object.keys(model!.dates).sort()).toEqual(Object.keys(expected.dates!).sort());
      });
    }

    if (expected.normalized) {
      it("holds the normalized URLs", () => {
        for (const n of expected.normalized!) expect(valueAt(model!.case, n.path), JSON.stringify(n.path)).toBe(n.value);
      });
    }
  });
}
