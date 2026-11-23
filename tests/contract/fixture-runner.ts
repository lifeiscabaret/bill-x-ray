import { expect } from "vitest";
import { parseCase } from "../../src/contract";
import { richCase } from "../fixtures/contract/stage23";
import type { Fixture } from "../fixtures/contract/stage23";
import { options, resolves } from "./helpers";

const LISTS = ["documents", "evidence", "events", "paths"] as const;

/** Parses the rich case with the fixture's change and checks the issues and what was removed. */
export function runFixture(fx: Fixture) {
  const input = richCase();
  fx.mutate(input);
  const before = structuredClone(input);
  const { model, issues } = parseCase(input, options);
  expect(input, "the input is not changed").toEqual(before);
  expect(model).not.toBeNull();
  expect(issues.map((i) => [i.path, i.code, i.severity])).toEqual(fx.expect);
  for (const i of issues) {
    expect(resolves(input, i.path), JSON.stringify(i.path)).toBe(true);
    expect(i.message.length).toBeGreaterThan(0);
  }

  // A block issue removes its record, once, in the order the issues came; a warning keeps it.
  const recordOf = (path: (string | number)[]) => (path[0] === "promise" ? ["promise"] : path.slice(0, 2));
  const removed: { path: (string | number)[]; reason: string }[] = [];
  for (const i of issues) {
    if (i.severity !== "block") continue;
    const path = recordOf(i.path);
    if (!removed.some((r) => JSON.stringify(r.path) === JSON.stringify(path))) removed.push({ path, reason: i.code });
  }
  expect(model!.excluded).toEqual(removed);
  for (const list of LISTS) {
    const n = removed.filter((r) => r.path[0] === list).length;
    expect(model!.case[list]).toHaveLength((input[list] as unknown[]).length - n);
  }
  expect(model!.case.promise === undefined).toBe(removed.some((r) => r.path[0] === "promise") || input.promise === undefined);
  return { input, model: model!, issues };
}
