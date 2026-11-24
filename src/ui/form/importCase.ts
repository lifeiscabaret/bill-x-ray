// "Import JSON" (scan-screen 8.2): a parsed JSON value becomes form fields. The value goes through
// `parseCase` with origin "user", so a check record inside it counts for nothing (D-009); what is
// left of the case is put into the form with `fromCase`. Pure, no DOM: the file is read by the component.
import { parseCase, type Issue } from "../../contract";
import { fromCase, rowDomId, type FormState } from "./toCaseInput";

/** A contract message about the imported file. `fieldId` is the row it sits next to, or null when it has none. */
export interface ImportNote {
  fieldId: string | null;
  issue: Issue;
}

export type ImportResult =
  | { ok: true; state: FormState; notes: ImportNote[] }
  | { ok: false; issues: Issue[] };

const LISTS = ["documents", "events", "evidence", "paths"] as const;

/**
 * Fills the form from a parsed JSON value, or says why not (`ok: false`: the value is not a usable
 * case at all; the form stays as it was). Only two kinds of message are kept for the screen: the
 * contract's `check_record_ignored` warning, next to its clause row, and every message about a
 * record that could not be placed in the form (it was left out of the case), without a row.
 * Other messages about the kept records come back by themselves when the form is parsed.
 */
export function importCase(value: unknown, referenceDate: string): ImportResult {
  const parsed = parseCase(value, { referenceDate, origin: "user" });
  if (parsed.model === null) return { ok: false, issues: parsed.issues };

  const { state, rows } = fromCase(parsed.model.case);
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  const rowIds: Record<(typeof LISTS)[number], string[]> = { documents: rows.versions, events: rows.events, evidence: rows.clauses, paths: rows.links };

  // The input position of each record that stayed in the case, in order: the records of
  // `model.case` are exactly the input's records minus the excluded ones.
  const left = new Set(parsed.model.excluded.map((e) => (e.path.length === 2 ? `${String(e.path[0])}:${String(e.path[1])}` : String(e.path[0]))));
  const rowAt: Record<string, (string | undefined)[]> = {};
  for (const name of LISTS) {
    const items = Array.isArray(raw[name]) ? (raw[name] as unknown[]) : [];
    let kept = 0;
    rowAt[name] = items.map((_, i) => (left.has(`${name}:${i}`) ? undefined : rowIds[name][kept++]));
  }
  const promiseKept = parsed.model.case.promise !== undefined && parsed.model.case.promise !== null;

  const notes: ImportNote[] = [];
  for (const issue of parsed.issues) {
    const [name, index] = issue.path;
    let fieldId: string | null | undefined; // undefined: the record is in the form and its own parse will speak
    if (name === "promise") fieldId = promiseKept ? undefined : null;
    else if (typeof name === "string" && name in rowAt && typeof index === "number") {
      const row = rowAt[name]![index];
      fieldId = row === undefined || row === "" ? null : rowDomId(row);
    } else fieldId = null;
    if (issue.code === "check_record_ignored" && typeof fieldId === "string") notes.push({ fieldId, issue });
    else if (fieldId === null) notes.push({ fieldId: null, issue });
  }
  return { ok: true, state, notes };
}
