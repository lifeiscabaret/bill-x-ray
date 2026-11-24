// "Scan your own bill": the form state, its conversion to contract input and the map from a
// JSON path of that input to the id of the field it came from (scan-screen 7.2, 8). It also
// holds the way back, `fromCase`, used by "Start from a sample" and "Import JSON" (scan-screen 8.2),
// and `restoreForm`, which reads the copy kept in the browser session (8.3).
//
// Pure TypeScript, no DOM. The input always says `origin: "user"` when it is parsed, so a
// link in it can never be confirmed by anything the user types (D-009): there is no field for
// a check record here, and every evidence row carries an empty one. The only checks a row can
// have are the sample's own, found by the contract for a row copied unchanged (`carriedChecks`).
//
// The form has no case content of its own. The bill fields below are described once, here, so
// that the component never needs to name them (the screen has no branch on the bill's country).
import {
  EVENT_KINDS, PATH_KINDS, SOURCE_KINDS, formatPath,
  type BundledCheck, type Case, type Endpoint, type EventKind, type PathKind,
} from "../../contract";

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

/** The value of a link end that means "the promise record"; any other value is a version or clause row id. */
export const PROMISE_REF = "promise";

export interface LinkRow {
  id: string;
  /** "" until the user chooses one of the contract's path kinds (D-010). */
  kind: PathKind | "";
  /** "", PROMISE_REF, or the id of a version row or a clause row. */
  from: string;
  to: string;
  /** Ids of the clause rows that back the link; "" is a row not chosen yet. */
  evidence: string[];
}

/** The optional promise. Every promise source counts as another outlet's article: no excerpt (D-016). */
export interface PromiseFields {
  statement: string;
  sourceTitle: string;
  publisher: string;
  sourceUrl: string;
  date: string;
  factSentence: string;
}

export interface CompareChoice {
  mode: "versions" | "clauses";
  /** Row ids; "" lets the form take the first (a) or the next (b) text on offer. */
  a: string;
  b: string;
}

export interface FormState {
  bill: BillFields;
  versions: VersionRow[];
  links: LinkRow[];
  promise: PromiseFields;
  compare: CompareChoice;
  /** The case id of the sample this form was started from, or null. The checks are never stored here. */
  copiedFrom: string | null;
  /** Last number used in a row id; ids are never reused, so a removed row's id stays free of confusion. */
  counter: number;
}

export const emptyPromise = (): PromiseFields => ({ statement: "", sourceTitle: "", publisher: "", sourceUrl: "", date: "", factSentence: "" });

export const emptyForm = (): FormState => ({
  bill: { jurisdiction: "", session: "", number: "" },
  versions: [],
  links: [],
  promise: emptyPromise(),
  compare: { mode: "versions", a: "", b: "" },
  copiedFrom: null,
  counter: 0,
});

/** The bill fields in the order they appear; `id` is the DOM id, `labelKey` the en.json key. */
export const BILL_FIELDS: readonly { key: keyof BillFields; id: string; labelKey: string }[] = [
  { key: "jurisdiction", id: "own-bill-jurisdiction", labelKey: "form.jurisdiction" },
  { key: "session", id: "own-bill-session", labelKey: "form.session" },
  { key: "number", id: "own-bill-number", labelKey: "form.billNumber" },
];

/** The date kinds the form offers: the contract's own list, nothing else (Req 5.2). */
export const DATE_KINDS: readonly EventKind[] = EVENT_KINDS;
export const SOURCE_KIND_CHOICES: readonly SourceKind[] = SOURCE_KINDS;
/** The link kinds the form offers: the contract's own list (D-010). */
export const LINK_KINDS: readonly PathKind[] = PATH_KINDS;

export const newVersion = (id: string): VersionRow => ({
  id, label: "", documentNumber: "", title: "", publisher: "", sourceUrl: "", language: "en",
  sourceKind: "official", factSentence: "", pastedText: "", dates: [], clauses: [],
});
export const newDate = (id: string): DateRow => ({ id, kind: "", date: "" });
export const newClause = (id: string): ClauseRow => ({ id, anchor: "", excerpt: "" });
export const newLink = (id: string): LinkRow => ({ id, kind: "", from: "", to: "", evidence: [] });

/** The DOM id of a row, or of one field of a row. */
export const rowDomId = (rowId: string) => `own-${rowId}`;
export const fieldDomId = (rowId: string, field: string) => `own-${rowId}-${field}`;
/** The id the promise fields hang on: a row of its own, named like the others. */
export const PROMISE_ROW = "promise";

/** Version rows whose source is news; anything else may carry an excerpt (D-016). */
export const isNews = (v: VersionRow) => v.sourceKind === "news";

/** The state without the given rows (removed versions or clauses), and without any link end that pointed at them. */
export function withoutRows(state: FormState, ids: readonly string[]): FormState {
  const gone = new Set(ids);
  return {
    ...state,
    links: state.links.map((l) => ({
      ...l,
      from: gone.has(l.from) ? "" : l.from,
      to: gone.has(l.to) ? "" : l.to,
      evidence: l.evidence.filter((e) => !gone.has(e)),
    })),
  };
}

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

/** The document number the form sends for a version: its own, or the bill's. */
const documentIdOf = (v: VersionRow, billNumber: string) => v.documentNumber.trim() || billNumber;

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
  const paths: unknown[] = [];

  state.versions.forEach((v, d) => {
    const documentId = documentIdOf(v, billNumber);
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
      // If a later decision adds one, versions and the promise get it together.
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

  // Links. A link end is a version row, a clause row or the promise; the contract decides whether
  // the kind fits the ends and whether the evidence rows resolve. Nothing here marks a link as
  // confirmed: `reviewState` is always "unverified" and there is no absence check (D-009).
  const endpoint = (ref: string): Endpoint => {
    if (ref === PROMISE_REF) return { type: "promise" };
    const version = state.versions.find((v) => v.id === ref);
    return version ? { type: "version", documentId: documentIdOf(version, billNumber), versionId: version.id } : { type: "clause", evidenceId: ref };
  };
  for (const l of state.links) {
    if (l.kind === "" && l.from === "" && l.to === "" && l.evidence.every((e) => e === "")) continue;
    const k = paths.length;
    put(["paths", k], rowDomId(l.id));
    put(["paths", k, "pathId"], rowDomId(l.id));
    put(["paths", k, "reviewState"], rowDomId(l.id));
    put(["paths", k, "kind"], fieldDomId(l.id, "kind"));
    put(["paths", k, "from"], fieldDomId(l.id, "from"));
    put(["paths", k, "to"], fieldDomId(l.id, "to"));
    put(["paths", k, "evidenceRefs"], fieldDomId(l.id, "add-evidence"));
    const refs: string[] = [];
    l.evidence.forEach((e, n) => {
      if (e === "") return;
      put(["paths", k, "evidenceRefs", refs.length], fieldDomId(l.id, `evidence-${n}`));
      refs.push(e);
    });
    paths.push({
      pathId: l.id,
      // A missing end or kind is left out, so the contract says it is needed, next to its field.
      ...(l.from === "" ? {} : { from: endpoint(l.from) }),
      ...(l.to === "" ? {} : { to: endpoint(l.to) }),
      ...(l.kind === "" ? {} : { kind: l.kind }),
      evidenceRefs: refs,
      reviewState: "unverified",
    });
  }

  // The promise: optional, and sent only when some field has text. A statement is needed then:
  // left out when empty, the contract reports it as missing next to its field.
  const p = state.promise;
  put(["promise"], rowDomId(PROMISE_ROW));
  for (const key of Object.keys(p)) put(["promise", key], fieldDomId(PROMISE_ROW, key));
  const hasPromise = Object.values(p).some((v) => v.trim() !== "");

  return {
    input: {
      contractVersion: 1,
      caseId: "own-case",
      title: billNumber,
      jurisdiction: state.bill.jurisdiction.trim(),
      session: orNull(state.bill.session),
      ...(hasPromise
        ? {
            promise: {
              ...(p.statement.trim() === "" ? {} : { statement: p.statement.trim() }),
              sourceTitle: p.sourceTitle.trim(),
              publisher: p.publisher.trim(),
              sourceUrl: orNull(p.sourceUrl),
              date: p.date.trim() || "unknown",
              // Every promise source is another outlet's article: no excerpt, no ownOutlet (D-016).
              // shortcut: a Seoul Economic Daily option would go here, with the one for versions.
              excerpt: null,
              factSentence: orNull(p.factSentence),
            },
          }
        : {}),
      documents,
      evidence,
      events,
      paths,
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

// ---- From a Case back to the form (Start from a sample, Import JSON) ----

/** The row id given to each record of a Case, parallel to its lists; "" for a record that found no place. */
export interface RowMap {
  versions: string[];
  events: string[];
  clauses: string[];
  links: string[];
}

/**
 * Fills the form from a Case. The bill number is the first version's document number; a version
 * with another number keeps it in "Document number". Row ids are numbered in a fixed order, so
 * the same Case always gives the same ids (`carriedChecks` relies on it). What the form has no
 * place for is not carried: check records, `reviewState`, absence checks, notes, translations,
 * `ownOutlet`, excerpts of the promise and of news versions, the case title and provenance.
 */
export function fromCase(source: Case): { state: FormState; rows: RowMap } {
  let counter = 0;
  const next = (prefix: string) => `${prefix}${++counter}`;
  const number = source.documents[0]?.documentId ?? "";
  const rows: RowMap = { versions: [], events: [], clauses: [], links: [] };

  const versions: VersionRow[] = source.documents.map((d) => {
    const news = d.sourceKind === "news";
    const id = next("v");
    rows.versions.push(id);
    return {
      ...newVersion(id),
      label: d.localEventLabel ?? "",
      documentNumber: d.documentId === number ? "" : d.documentId,
      title: d.title,
      publisher: d.publisher,
      sourceUrl: d.sourceUrl ?? "",
      language: d.language === "und" ? "" : d.language,
      sourceKind: d.sourceKind,
      factSentence: news ? (d.factSentence ?? "") : "",
      pastedText: news ? "" : (d.pastedText ?? ""),
    };
  });
  const versionAt = (documentId: string, versionId: string) =>
    source.documents.findIndex((d) => d.documentId === documentId && d.versionId === versionId);

  for (const e of source.events) {
    const at = versionAt(e.documentId, e.versionId);
    const id = at < 0 ? "" : next("d");
    rows.events.push(id);
    if (id !== "") versions[at]!.dates.push({ id, kind: e.eventKind, date: e.eventDate === "unknown" ? "" : e.eventDate });
  }

  const clauseOf = new Map<string, string>();
  for (const e of source.evidence) {
    const at = versionAt(e.documentId, e.versionId);
    const id = at < 0 ? "" : next("c");
    rows.clauses.push(id);
    if (id === "") continue;
    clauseOf.set(e.evidenceId, id);
    versions[at]!.clauses.push({ id, anchor: e.anchor, excerpt: source.documents[at]!.sourceKind === "news" ? "" : e.excerpt });
  }

  const ref = (end: Endpoint): string => {
    if (end.type === "promise") return PROMISE_REF;
    if (end.type === "clause") return clauseOf.get(end.evidenceId) ?? "";
    const at = versionAt(end.documentId, end.versionId);
    return at < 0 ? "" : rows.versions[at]!;
  };
  const links: LinkRow[] = source.paths.map((p) => {
    const id = next("p");
    rows.links.push(id);
    return {
      id,
      kind: p.kind,
      from: ref(p.from),
      to: ref(p.to),
      evidence: p.evidenceRefs.flatMap((r) => clauseOf.get(r) ?? []),
    };
  });

  const promise = source.promise;
  return {
    state: {
      bill: {
        jurisdiction: source.jurisdiction,
        session: source.session ?? "",
        number,
      },
      versions,
      links,
      promise: promise
        ? {
            statement: promise.statement,
            sourceTitle: promise.sourceTitle,
            publisher: promise.publisher,
            sourceUrl: promise.sourceUrl ?? "",
            date: promise.date === "unknown" ? "" : promise.date,
            factSentence: promise.factSentence ?? "",
          }
        : emptyPromise(),
      compare: { mode: "versions", a: "", b: "" },
      copiedFrom: null,
      counter,
    },
    rows,
  };
}

/**
 * The checks of a sample's evidence rows, keyed the way the form will send those rows once the
 * sample is copied in: row ids as `evidenceId` and `versionId`, trimmed anchor and excerpt, and
 * no excerpt for news. The contract finds an unchanged row by these fields and gives it the
 * sample's own check; any edit of one of them leaves the row without a check (D-009).
 */
export function carriedChecks(sample: Case): BundledCheck[] {
  const { rows } = fromCase(sample);
  return sample.evidence.flatMap((e, i) => {
    const at = sample.documents.findIndex((d) => d.documentId === e.documentId && d.versionId === e.versionId);
    const doc = sample.documents[at];
    if (!doc || rows.clauses[i] === "") return [];
    return [{
      evidenceId: rows.clauses[i]!,
      documentId: e.documentId.trim(),
      versionId: rows.versions[at]!,
      anchor: e.anchor.trim(),
      excerpt: doc.sourceKind === "news" ? "" : e.excerpt.trim(),
      sourceUrl: doc.sourceUrl,
      check: e.check,
    }];
  });
}

// ---- The copy kept in the browser session ----

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(choices: readonly T[], v: unknown): T | undefined => choices.find((c) => c === v);
const ID = /^[vdcp][1-9]\d*$/;

/**
 * Reads a form state back from parsed JSON, or returns null when it is not one. Nothing in the
 * stored value is trusted: every field is coerced to its type, every row id must look like one of
 * ours and be unique, and a value that fails any of this gives null (the form then starts empty).
 * There are no check records in a form state, so nothing stored can confirm a link.
 */
export function restoreForm(value: unknown): FormState | null {
  const s = obj(value);
  if (!Array.isArray(s.versions) || !Array.isArray(s.links)) return null;
  const seen = new Set<string>();
  const id = (v: unknown): string | null => {
    if (typeof v !== "string" || !ID.test(v) || seen.has(v)) return null;
    seen.add(v);
    return v;
  };
  let bad = false;
  const row = (v: unknown): string => {
    const found = id(v);
    if (found === null) bad = true;
    return found ?? "";
  };

  const versions = s.versions.map((raw): VersionRow => {
    const v = obj(raw);
    return {
      id: row(v.id),
      label: str(v.label),
      documentNumber: str(v.documentNumber),
      title: str(v.title),
      publisher: str(v.publisher),
      sourceUrl: str(v.sourceUrl),
      language: str(v.language),
      sourceKind: oneOf(SOURCE_KINDS, v.sourceKind) ?? "official",
      factSentence: str(v.factSentence),
      pastedText: str(v.pastedText),
      dates: list(v.dates).map((d): DateRow => ({ id: row(obj(d).id), kind: oneOf(EVENT_KINDS, obj(d).kind) ?? "", date: str(obj(d).date) })),
      clauses: list(v.clauses).map((c): ClauseRow => ({ id: row(obj(c).id), anchor: str(obj(c).anchor), excerpt: str(obj(c).excerpt) })),
    };
  });
  const links = s.links.map((raw): LinkRow => {
    const l = obj(raw);
    return {
      id: row(l.id),
      kind: oneOf(PATH_KINDS, l.kind) ?? "",
      from: str(l.from),
      to: str(l.to),
      evidence: list(l.evidence).map(str),
    };
  });
  if (bad) return null;

  const bill = obj(s.bill);
  const promise = obj(s.promise);
  const compare = obj(s.compare);
  const highest = Math.max(0, ...[...seen].map((x) => Number(x.slice(1))));
  return {
    bill: {
      jurisdiction: str(bill.jurisdiction),
      session: str(bill.session),
      number: str(bill.number),
    },
    versions,
    links,
    promise: {
      statement: str(promise.statement),
      sourceTitle: str(promise.sourceTitle),
      publisher: str(promise.publisher),
      sourceUrl: str(promise.sourceUrl),
      date: str(promise.date),
      factSentence: str(promise.factSentence),
    },
    compare: { mode: compare.mode === "clauses" ? "clauses" : "versions", a: str(compare.a), b: str(compare.b) },
    copiedFrom: typeof s.copiedFrom === "string" ? s.copiedFrom : null,
    counter: Math.max(highest, typeof s.counter === "number" && Number.isInteger(s.counter) ? s.counter : 0),
  };
}
