import type { z } from "zod";
import { checkPathKinds, checkRecords, checkReferences } from "./checks";
import { gateCase, resolveChecks } from "./gate";
import {
  caseShellSchema, documentVersionSchema, evidenceSchema, eventSchema, pathSchema, promiseSchema,
  schemaIssues,
} from "./schema";
import type { Case, Issue, ParseOptions, ParseResult, ScanModel } from "./types";
import { normalizeCaseUrls } from "./urls";

const LISTS = ["documents", "evidence", "events", "paths"] as const;
type ListName = (typeof LISTS)[number];
type JsonPath = (string | number)[];

/**
 * Parses one Case. Never throws for any JSON value: problems come back as issues.
 *
 * Stage 1 (structure), stage 2 (URL normalization), stage 3 (semantic checks) and stage 4
 * (origin handling and the evidence gate, which fills `gate`) are done.
 * A record with a block issue is left out of `case` and listed in `excluded`; a warning keeps
 * it. A record that points at a removed record is removed too (`ref_unresolved`). If the top
 * level itself is unusable, `model` is null. The other stages (dates, status) are added by
 * later tasks, so `paths` and `dates` are still empty here.
 *
 * Issue paths always index the input, not the shortened lists: `at` keeps, for each list, the
 * input position of every record that is still in the Case.
 */
export function parseCase(input: unknown, options: ParseOptions): ParseResult {
  const shell = caseShellSchema.safeParse(input);
  if (!shell.success) return { model: null, issues: schemaIssues(shell.error, input, []) };

  const issues: Issue[] = [];
  const excluded: ScanModel["excluded"] = [];
  const s = shell.data;
  const at: Record<ListName, number[]> = { documents: [], evidence: [], events: [], paths: [] };

  // Validates one record; a failing record is excluded and reports all of its issues.
  const record = <T>(schema: z.ZodType<T>, value: unknown, path: JsonPath): T | undefined => {
    const r = schema.safeParse(value);
    if (r.success) return r.data;
    const found = schemaIssues(r.error, value, path);
    issues.push(...found);
    excluded.push({ path, reason: found[0]!.code });
    return undefined;
  };
  const list = <T>(schema: z.ZodType<T>, name: ListName, items: unknown[]): T[] =>
    items.flatMap((item, i) => {
      const r = record(schema, item, [name, i]);
      if (r === undefined) return [];
      at[name].push(i);
      return [r];
    });

  const promise = s.promise === undefined || s.promise === null ? s.promise : record(promiseSchema, s.promise, ["promise"]);

  let current: Case = {
    contractVersion: s.contractVersion,
    caseId: s.caseId,
    title: s.title,
    jurisdiction: s.jurisdiction,
    session: s.session,
    ...(promise === undefined ? {} : { promise }),
    documents: list(documentVersionSchema, "documents", s.documents),
    evidence: list(evidenceSchema, "evidence", s.evidence),
    events: list(eventSchema, "events", s.events),
    paths: list(pathSchema, "paths", s.paths),
    ...(s.provenance === undefined ? {} : { provenance: s.provenance }),
  };

  // Maps a path over the shortened lists to the same place in the input.
  const inputPath = (p: JsonPath): JsonPath =>
    (LISTS as readonly unknown[]).includes(p[0]) && typeof p[1] === "number"
      ? [p[0]!, at[p[0] as ListName][p[1]]!, ...p.slice(2)]
      : p;

  // Adds the issues; removes every record that has a block issue and lists it once in `excluded`.
  // Returns whether anything was removed.
  const apply = (found: Issue[]): boolean => {
    const mapped = found.map((i) => ({ ...i, path: inputPath(i.path) }));
    issues.push(...mapped);
    const gone: Record<ListName, Set<number>> = { documents: new Set(), evidence: new Set(), events: new Set(), paths: new Set() };
    let dropPromise = false;
    found.forEach((i, k) => {
      if (i.severity !== "block") return;
      const name = i.path[0];
      if (name === "promise") {
        if (!dropPromise) excluded.push({ path: ["promise"], reason: i.code });
        dropPromise = true;
      } else if ((LISTS as readonly unknown[]).includes(name) && typeof i.path[1] === "number") {
        if (!gone[name as ListName].has(i.path[1])) excluded.push({ path: mapped[k]!.path.slice(0, 2), reason: i.code });
        gone[name as ListName].add(i.path[1]);
      }
    });
    const removed = dropPromise || LISTS.some((l) => gone[l].size > 0);
    if (!removed) return false;
    const keep = <T>(name: ListName, items: readonly T[]) => items.filter((_, i) => !gone[name].has(i));
    const kept = { ...current, ...Object.fromEntries(LISTS.map((l) => [l, keep(l, current[l] as readonly unknown[])])) } as Case;
    if (dropPromise) delete kept.promise;
    for (const l of LISTS) at[l] = keep(l, at[l]);
    current = kept;
    return true;
  };

  // Stage 2: URLs.
  const urls = normalizeCaseUrls(current);
  current = urls.case;
  apply(urls.issues);

  // Stage 3: semantic checks. Reference checks repeat until no record is removed, because
  // removing a record can leave a reference to it unresolved.
  apply(checkRecords(current));
  while (apply(checkReferences(current)));
  apply(checkPathKinds(current));

  // Stage 4: origin handling, then the evidence gate for every row that is left.
  const origin = resolveChecks(current, options.origin, options.bundledChecks ?? []);
  current = origin.case;
  apply(origin.issues);
  const gate = gateCase(current);

  return {
    model: {
      case: current,
      origin: options.origin,
      referenceDate: options.referenceDate,
      gate,
      paths: {},
      dates: {},
      excluded,
    },
    issues,
  };
}
