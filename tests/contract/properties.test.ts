import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseCase } from "../../src/contract";
import { minimalCase, options, resolves } from "./helpers";

// Every path of a value, as a list of key lists (containers and leaves).
function allPaths(v: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  if (v === null || typeof v !== "object") return [prefix];
  const kids = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v);
  return [prefix, ...kids.flatMap((k) => allPaths((v as Record<string | number, unknown>)[k], [...prefix, k]))];
}

// A valid case with one place replaced by arbitrary JSON, or removed.
const damagedCase = fc
  .tuple(fc.nat(), fc.jsonValue(), fc.boolean())
  .map(([n, value, remove]) => {
    const input = minimalCase() as unknown;
    const paths = allPaths(input).filter((p) => p.length > 0);
    const path = paths[n % paths.length]!;
    let cur = input as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) cur = cur[key] as Record<string | number, unknown>;
    if (remove) delete cur[path[path.length - 1]!];
    else cur[path[path.length - 1]!] = value;
    return input;
  });

describe("parseCase on arbitrary input", () => {
  it("never throws for any JSON value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        const r = parseCase(input, options);
        expect(Array.isArray(r.issues)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

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
