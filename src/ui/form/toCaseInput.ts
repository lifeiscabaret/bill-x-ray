// "Scan your own bill": the form state, its conversion to contract input and the map from a
// JSON path of that input to the id of the field it came from (scan-screen 7.2).
//
// Pure TypeScript, no DOM. The input always says `origin: "user"` when it is parsed, so a
// link in it can never be confirmed by anything the user types (D-009): there is no field for
// a check record here, and every evidence row carries an empty one.
//
// The form has no case content of its own. The bill fields below are described once, here, so
// that the component never needs to name them (the screen has no branch on the bill's country).
import { EVENT_KINDS, SOURCE_KINDS, formatPath, type EventKind } from "../../contract";

export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface BillFields {
  jurisdiction: string;
  session: string;
  number: string;
}

export interface DateRow {
  id: string;
  /** "" until the user chooses one of the contract's date kinds. */
  kind: EventKind | "";
  /** YYYY-MM-DD, YYYY-MM or YYYY; empty when the user does not know the date. */
  date: string;
}

export interface ClauseRow {
  id: string;
  anchor: string;
  excerpt: string;
}

export interface VersionRow {
  id: string;
  /** The source's own stage label ("localEventLabel"). */
  label: string;
  /** Only when this version has another number than the bill's. */
  documentNumber: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  language: string;
  sourceKind: SourceKind;
  /** News from another outlet: the team's own sentence instead of an excerpt (D-016). */
  factSentence: string;
  pastedText: string;
  dates: DateRow[];
  clauses: ClauseRow[];
}

export interface FormState {
  bill: BillFields;
  versions: VersionRow[];
  /** Last number used in a row id; ids are never reused, so a removed row's id stays free of confusion. */
  counter: number;
}

export const emptyForm = (): FormState => ({ bill: { jurisdiction: "", session: "", number: "" }, versions: [], counter: 0 });

/** The bill fields in the order they appear; `id` is the DOM id, `labelKey` the en.json key. */
export const BILL_FIELDS: readonly { key: keyof BillFields; id: string; labelKey: string }[] = [
  { key: "jurisdiction", id: "own-bill-jurisdiction", labelKey: "form.jurisdiction" },
  { key: "session", id: "own-bill-session", labelKey: "form.session" },
  { key: "number", id: "own-bill-number", labelKey: "form.billNumber" },
];

/** The date kinds the form offers: the contract's own list, nothing else (Req 5.2). */
export const DATE_KINDS: readonly EventKind[] = EVENT_KINDS;
export const SOURCE_KIND_CHOICES: readonly SourceKind[] = SOURCE_KINDS;

export const newVersion = (id: string): VersionRow => ({
  id, label: "", documentNumber: "", title: "", publisher: "", sourceUrl: "", language: "en",
  sourceKind: "official", factSentence: "", pastedText: "", dates: [], clauses: [],
});
export const newDate = (id: string): DateRow => ({ id, kind: "", date: "" });
export const newClause = (id: string): ClauseRow => ({ id, anchor: "", excerpt: "" });

/** The DOM id of a row, or of one field of a row. */
export const rowDomId = (rowId: string) => `own-${rowId}`;
export const fieldDomId = (rowId: string, field: string) => `own-${rowId}-${field}`;

/** Version rows whose source is news; anything else may carry an excerpt (D-016). */
export const isNews = (v: VersionRow) => v.sourceKind === "news";

type JsonPath = (string | number)[];

export interface CaseInput {
  /** What `parseCase` reads. Typed loosely on purpose: a half-filled form is not a valid Case. */
  input: Record<string, unknown>;
  /** formatPath(JSON path) to field id, for every field and every row of the input. */
  fields: Map<string, string>;
}

const orNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

// What the form sends as the check of every evidence row: nothing was checked (D-009).
const NO_CHECK = {
  state: "not_checked", url: null, checkedBy: null, checkedAt: null, confirmedBy: null, confirmedAt: null, confirmedUrl: null,
} as const;

export function toCaseInput(state: FormState): CaseInput {
  const fields = new Map<string, string>();
  const put = (path: JsonPath, id: string) => fields.set(formatPath(path), id);

  put(["jurisdiction"], BILL_FIELDS[0]!.id);
  put(["session"], BILL_FIELDS[1]!.id);
  put(["title"], BILL_FIELDS[2]!.id);
  put(["caseId"], BILL_FIELDS[2]!.id);

  const billNumber = state.bill.number.trim();
  const documents: unknown[] = [];
  const evidence: unknown[] = [];
  const events: unknown[] = [];

  state.versions.forEach((v, d) => {
    const documentId = v.documentNumber.trim() || billNumber;
    const news = isNews(v);
    const at = ["documents", d];
    put(at, rowDomId(v.id));
    for (const [key, field] of [
      ["documentId", "documentNumber"], ["versionId", "label"], ["localEventLabel", "label"], ["sourceUrl", "sourceUrl"],
      ["title", "title"], ["publisher", "publisher"], ["sourceKind", "sourceKind"], ["language", "language"],
      ["factSentence", "factSentence"], ["pastedText", "pastedText"],
    ] as const) put([...at, key], fieldDomId(v.id, field));
    documents.push({
      documentId,
      versionId: v.id,
      localEventLabel: orNull(v.label),
      sourceUrl: orNull(v.sourceUrl),
      title: v.title.trim(),
      publisher: v.publisher.trim(),
      sourceKind: v.sourceKind,
      // shortcut: every news version counts as another outlet's; no own-outlet box is offered (D-016).
      ...(news ? { factSentence: orNull(v.factSentence) } : {}),
      language: v.language.trim() || "und",
      // Pasted text only backs excerpts, and news carries none.
      pastedText: news ? null : orNull(v.pastedText),
    });

    // A row left completely blank is not sent: the user added it and has not used it yet.
    for (const c of v.clauses) {
      if (c.anchor.trim() === "" && c.excerpt.trim() === "") continue;
      const e = evidence.length;
      put(["evidence", e], rowDomId(c.id));
      for (const key of ["anchor", "excerpt"] as const) put(["evidence", e, key], fieldDomId(c.id, key));
      for (const key of ["documentId", "versionId", "check"] as const) put(["evidence", e, key], rowDomId(c.id));
      evidence.push({
        evidenceId: c.id,
        documentId,
        versionId: v.id,
        anchor: c.anchor.trim(),
        excerpt: news ? "" : c.excerpt.trim(),
        check: { ...NO_CHECK },
      });
    }

    for (const r of v.dates) {
      if (r.kind === "" && r.date.trim() === "") continue;
      const k = events.length;
      put(["events", k], rowDomId(r.id));
      put(["events", k, "eventKind"], fieldDomId(r.id, "kind"));
      put(["events", k, "eventDate"], fieldDomId(r.id, "date"));
      for (const key of ["documentId", "versionId", "evidenceRefs"] as const) put(["events", k, key], rowDomId(r.id));
      events.push({
        eventId: r.id,
        documentId,
        versionId: v.id,
        ...(r.kind === "" ? {} : { eventKind: r.kind }),
        // A kind without a date is a date the user does not know: it stays "unknown", never guessed.
        eventDate: r.date.trim() || "unknown",
        evidenceRefs: [],
      });
    }
  });

  return {
    input: {
      contractVersion: 1,
      caseId: "own-case",
      title: billNumber,
      jurisdiction: state.bill.jurisdiction.trim(),
      session: orNull(state.bill.session),
      documents,
      evidence,
      events,
      paths: [],
    },
    fields,
  };
}

/**
 * The field a contract issue belongs to: the longest prefix of its JSON path that the form
 * put on a field or a row, or null when the issue concerns nothing the form shows (a path
 * the form does not send, or the whole input).
 */
export function fieldFor(fields: ReadonlyMap<string, string>, path: readonly (string | number)[]): string | null {
  for (let n = path.length; n > 0; n--) {
    const id = fields.get(formatPath(path.slice(0, n)));
    if (id !== undefined) return id;
  }
  return null;
}
