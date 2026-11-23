import type { z } from "zod";
import {
  caseShellSchema, documentVersionSchema, evidenceSchema, eventSchema, pathSchema, promiseSchema,
  schemaIssues,
} from "./schema";
import type { Case, Issue, ParseOptions, ParseResult, ScanModel } from "./types";

/**
 * Parses one Case. Never throws for any JSON value: problems come back as issues.
 *
 * Stage 1 (structure) is done. A record that fails its schema is left out of `case` and
 * listed in `excluded`; if the top level itself is unusable, `model` is null. The other
 * stages (URLs, semantic checks, gate, dates, status) are added by later tasks, so `gate`,
 * `paths` and `dates` are still empty here.
 */
export function parseCase(input: unknown, options: ParseOptions): ParseResult {
  const shell = caseShellSchema.safeParse(input);
  if (!shell.success) return { model: null, issues: schemaIssues(shell.error, input, []) };

  const issues: Issue[] = [];
  const excluded: ScanModel["excluded"] = [];
  const s = shell.data;

  // Validates one record; a failing record is excluded and reports all of its issues.
  const record = <T>(schema: z.ZodType<T>, value: unknown, path: (string | number)[]): T | undefined => {
    const r = schema.safeParse(value);
    if (r.success) return r.data;
    const found = schemaIssues(r.error, value, path);
    issues.push(...found);
    excluded.push({ path, reason: found[0]!.code });
    return undefined;
  };
  const list = <T>(schema: z.ZodType<T>, name: string, items: unknown[]): T[] =>
    items.flatMap((item, i) => {
      const r = record(schema, item, [name, i]);
      return r === undefined ? [] : [r];
    });

  const promise = s.promise === undefined || s.promise === null ? s.promise : record(promiseSchema, s.promise, ["promise"]);

  const parsed: Case = {
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

  return {
    model: {
      case: parsed,
      origin: options.origin,
      referenceDate: options.referenceDate,
      gate: {},
      paths: {},
      dates: {},
      excluded,
    },
    issues,
  };
}
