// "Scan your own bill" (scan-screen 7): the bill, its versions and their clauses, typed in by
// hand. The form builds contract input with `toCaseInput`, parses it with origin "user" and
// shows every contract issue next to the field its JSON path points to. It decides nothing about
// a link and has no control that marks one confirmed (D-009). The scan below it is the same
// ScanView the samples use.
//
// Sections 4 to 6 (compare, links, promise), JSON import and the session copy are scan-screen 8.
import { useEffect, useId, useMemo, useState } from "react";
import { parseCase, type Issue } from "../../contract";
import { t } from "../../i18n/t";
import { ErrorBoundary } from "../ErrorBoundary";
import { ScanView } from "../ScanView";
import {
  BILL_FIELDS, DATE_KINDS, SOURCE_KIND_CHOICES, emptyForm, fieldDomId, fieldFor, isNews, newClause, newDate, newVersion,
  rowDomId, toCaseInput, type ClauseRow, type DateRow, type FormState, type SourceKind, type VersionRow,
} from "./toCaseInput";

// ---- Small pieces ----

/** The messages of one field or row: severity in words, then the sentence for the code. */
function Issues({ id, issues }: { id: string; issues: readonly Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul id={`${id}-issues`} className="form__issues">
      {issues.map((i, n) => (
        <li key={n} className={`form__issue form__issue--${i.severity}`}>
          <strong>{t(`form.severity.${i.severity}`)}</strong> {t(`issue.${i.code}`, i.params)}
        </li>
      ))}
    </ul>
  );
}

const describedBy = (id: string, hint: string | undefined, issues: readonly Issue[]) =>
  [hint ? `${id}-hint` : "", issues.length > 0 ? `${id}-issues` : ""].filter(Boolean).join(" ") || undefined;
const invalid = (issues: readonly Issue[]) => (issues.some((i) => i.severity === "block") ? true : undefined);

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  issues: readonly Issue[];
  hint?: string;
  multiline?: boolean;
}

function TextField({ id, label, value, onChange, issues, hint, multiline }: TextFieldProps) {
  const aria = { "aria-describedby": describedBy(id, hint, issues), "aria-invalid": invalid(issues) };
  return (
    <div className="form__field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className="form__hint">
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <textarea id={id} rows={4} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} {...aria} />
      ) : (
        <input id={id} type="text" value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} {...aria} />
      )}
      <Issues id={id} issues={issues} />
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  issues: readonly Issue[];
  /** Value and visible text of each option, after an optional empty first option. */
  options: readonly { value: string; text: string }[];
}

function SelectField({ id, label, value, onChange, issues, options }: SelectFieldProps) {
  return (
    <div className="form__field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy(id, undefined, issues)}
        aria-invalid={invalid(issues)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
      <Issues id={id} issues={issues} />
    </div>
  );
}

/** A button whose visible text is short and whose full name says which row it belongs to. */
function RowButton({ id, text, row, onClick }: { id?: string; text: string; row: string; onClick: () => void }) {
  return (
    <button type="button" id={id} onClick={onClick}>
      {text}{" "}
      <span className="sr-only">{row}</span>
    </button>
  );
}

// ---- The form ----

const SOURCE_OPTIONS = SOURCE_KIND_CHOICES.map((k) => ({ value: k, text: t(`form.sourceKindOption.${k}`) }));
const DATE_KIND_OPTIONS = [
  { value: "", text: t("form.chooseKind") },
  ...DATE_KINDS.map((k) => ({ value: k, text: t(`dateKind.${k}`) })),
];

export function OwnBillForm({ referenceDate }: { referenceDate: string }) {
  const [state, setState] = useState<FormState>(emptyForm);
  const [focusId, setFocusId] = useState<string | null>(null);
  const headingId = useId();

  // Every change is parsed again; parseCase never throws for any JSON value.
  const { fields, parsed } = useMemo(() => {
    const built = toCaseInput(state);
    return { fields: built.fields, parsed: parseCase(built.input, { referenceDate, origin: "user" }) };
  }, [state, referenceDate]);

  const { byField, unplaced, leftOut } = useMemo(() => {
    const byField = new Map<string, Issue[]>();
    const unplaced: Issue[] = [];
    for (const issue of parsed.issues) {
      const id = fieldFor(fields, issue.path);
      if (id === null) unplaced.push(issue);
      else byField.set(id, [...(byField.get(id) ?? []), issue]);
    }
    // A record with a block issue is out of the scan; its row says so.
    const leftOut = new Set<string>();
    for (const e of parsed.model?.excluded ?? []) {
      const id = fieldFor(fields, e.path);
      if (id !== null) leftOut.add(id);
    }
    return { byField, unplaced, leftOut };
  }, [parsed, fields]);
  const issuesOf = (id: string): readonly Issue[] => byField.get(id) ?? [];

  // After an action that removes or moves the focused button, focus goes to a named element.
  useEffect(() => {
    if (focusId === null) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  const setVersion = (id: string, change: (v: VersionRow) => VersionRow) =>
    setState((s) => ({ ...s, versions: s.versions.map((v) => (v.id === id ? change(v) : v)) }));

  const addVersion = () => {
    const id = `v${state.counter + 1}`;
    setState((s) => ({ ...s, counter: s.counter + 1, versions: [...s.versions, newVersion(id)] }));
    setFocusId(fieldDomId(id, "label"));
  };
  const removeVersion = (id: string) => {
    setState((s) => ({ ...s, versions: s.versions.filter((v) => v.id !== id) }));
    setFocusId("own-add-version");
  };
  const moveVersion = (id: string, by: -1 | 1, button: string) => {
    setState((s) => {
      const from = s.versions.findIndex((v) => v.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= s.versions.length) return s;
      const versions = [...s.versions];
      [versions[from], versions[to]] = [versions[to]!, versions[from]!];
      return { ...s, versions };
    });
    setFocusId(button);
  };

  const addDate = (v: VersionRow) => {
    const id = `d${state.counter + 1}`;
    setState((s) => ({ ...s, counter: s.counter + 1 }));
    setVersion(v.id, (x) => ({ ...x, dates: [...x.dates, newDate(id)] }));
    setFocusId(fieldDomId(id, "kind"));
  };
  const changeDate = (v: VersionRow, id: string, change: Partial<DateRow>) =>
    setVersion(v.id, (x) => ({ ...x, dates: x.dates.map((d) => (d.id === id ? { ...d, ...change } : d)) }));
  const removeDate = (v: VersionRow, id: string) => {
    setVersion(v.id, (x) => ({ ...x, dates: x.dates.filter((d) => d.id !== id) }));
    setFocusId(fieldDomId(v.id, "add-date"));
  };

  const addClause = (v: VersionRow) => {
    const id = `c${state.counter + 1}`;
    setState((s) => ({ ...s, counter: s.counter + 1 }));
    setVersion(v.id, (x) => ({ ...x, clauses: [...x.clauses, newClause(id)] }));
    setFocusId(fieldDomId(id, "anchor"));
  };
  const changeClause = (v: VersionRow, id: string, change: Partial<ClauseRow>) =>
    setVersion(v.id, (x) => ({ ...x, clauses: x.clauses.map((c) => (c.id === id ? { ...c, ...change } : c)) }));
  const removeClause = (v: VersionRow, id: string) => {
    setVersion(v.id, (x) => ({ ...x, clauses: x.clauses.filter((c) => c.id !== id) }));
    setFocusId(fieldDomId(v.id, "add-clause"));
  };

  const versionName = (v: VersionRow, n: number) =>
    v.label.trim() === "" ? t("form.versionName", { n }) : t("form.versionNameWithLabel", { n, label: v.label.trim() });
  const model = parsed.model;
  const scanned = model !== null && model.case.documents.length > 0;

  return (
    <section className="own-form" aria-labelledby={headingId}>
      <h2 id={headingId}>{t("mode.own")}</h2>

      {unplaced.length > 0 ? (
        <div className="form__unplaced">
          <h3>{t("form.otherIssues")}</h3>
          <Issues id="own-unplaced" issues={unplaced} />
        </div>
      ) : null}

      <section className="form__section" aria-labelledby={`${headingId}-bill`}>
        <h3 id={`${headingId}-bill`}>{t("form.billHeading")}</h3>
        {BILL_FIELDS.map((f) => (
          <TextField
            key={f.id}
            id={f.id}
            label={t(f.labelKey)}
            value={state.bill[f.key]}
            issues={issuesOf(f.id)}
            onChange={(value) => setState((s) => ({ ...s, bill: { ...s.bill, [f.key]: value } }))}
          />
        ))}
      </section>

      <section className="form__section" aria-labelledby={`${headingId}-versions`}>
        <h3 id={`${headingId}-versions`}>{t("form.versionsHeading")}</h3>
        {state.versions.length === 0 ? <p>{t("form.noVersions")}</p> : null}
        <ol className="form__rows">
          {state.versions.map((v, index) => {
            const n = index + 1;
            const row = rowDomId(v.id);
            const forVersion = t("form.forVersion", { n });
            const news = isNews(v);
            const field = (name: string) => fieldDomId(v.id, name);
            return (
              <li key={v.id}>
                <fieldset id={row} className="form__row">
                  <legend>{versionName(v, n)}</legend>
                  {leftOut.has(row) ? <p className="form__left-out">{t("form.leftOut")}</p> : null}
                  <Issues id={row} issues={issuesOf(row)} />
                  <div className="form__buttons">
                    <RowButton id={field("up")} text={t("form.moveUp")} row={forVersion} onClick={() => moveVersion(v.id, -1, field("up"))} />
                    <RowButton id={field("down")} text={t("form.moveDown")} row={forVersion} onClick={() => moveVersion(v.id, 1, field("down"))} />
                    <RowButton text={t("form.removeVersion")} row={forVersion} onClick={() => removeVersion(v.id)} />
                  </div>
                  <TextField id={field("label")} label={t("form.label")} hint={t("form.labelHint")} value={v.label} issues={issuesOf(field("label"))} onChange={(label) => setVersion(v.id, (x) => ({ ...x, label }))} />
                  <TextField id={field("documentNumber")} label={t("form.documentNumber")} hint={t("form.documentNumberHint")} value={v.documentNumber} issues={issuesOf(field("documentNumber"))} onChange={(documentNumber) => setVersion(v.id, (x) => ({ ...x, documentNumber }))} />
                  <TextField id={field("title")} label={t("form.title")} value={v.title} issues={issuesOf(field("title"))} onChange={(title) => setVersion(v.id, (x) => ({ ...x, title }))} />
                  <TextField id={field("publisher")} label={t("form.publisher")} value={v.publisher} issues={issuesOf(field("publisher"))} onChange={(publisher) => setVersion(v.id, (x) => ({ ...x, publisher }))} />
                  <TextField id={field("sourceUrl")} label={t("form.sourceUrl")} value={v.sourceUrl} issues={issuesOf(field("sourceUrl"))} onChange={(sourceUrl) => setVersion(v.id, (x) => ({ ...x, sourceUrl }))} />
                  <TextField id={field("language")} label={t("form.language")} hint={t("form.languageHint")} value={v.language} issues={issuesOf(field("language"))} onChange={(language) => setVersion(v.id, (x) => ({ ...x, language }))} />
                  <SelectField id={field("sourceKind")} label={t("form.sourceKind")} value={v.sourceKind} options={SOURCE_OPTIONS} issues={issuesOf(field("sourceKind"))} onChange={(sourceKind) => setVersion(v.id, (x) => ({ ...x, sourceKind: sourceKind as SourceKind }))} />
                  {news ? (
                    <TextField id={field("factSentence")} label={t("form.factSentence")} hint={t("form.factSentenceHint")} multiline value={v.factSentence} issues={issuesOf(field("factSentence"))} onChange={(factSentence) => setVersion(v.id, (x) => ({ ...x, factSentence }))} />
                  ) : (
                    <TextField id={field("pastedText")} label={t("form.pastedText")} hint={t("form.pastedTextHint")} multiline value={v.pastedText} issues={issuesOf(field("pastedText"))} onChange={(pastedText) => setVersion(v.id, (x) => ({ ...x, pastedText }))} />
                  )}

                  <h4>{t("form.datesHeading")}</h4>
                  {v.dates.length === 0 ? <p>{t("form.noDates")}</p> : null}
                  <ul className="form__rows">
                    {v.dates.map((d, k) => (
                      <li key={d.id} id={rowDomId(d.id)} className="form__row form__row--inner">
                        {leftOut.has(rowDomId(d.id)) ? <p className="form__left-out">{t("form.leftOut")}</p> : null}
                        <Issues id={rowDomId(d.id)} issues={issuesOf(rowDomId(d.id))} />
                        <SelectField id={fieldDomId(d.id, "kind")} label={t("form.dateKind")} value={d.kind} options={DATE_KIND_OPTIONS} issues={issuesOf(fieldDomId(d.id, "kind"))} onChange={(kind) => changeDate(v, d.id, { kind: kind as DateRow["kind"] })} />
                        <TextField id={fieldDomId(d.id, "date")} label={t("form.date")} hint={t("form.dateHint")} value={d.date} issues={issuesOf(fieldDomId(d.id, "date"))} onChange={(date) => changeDate(v, d.id, { date })} />
                        <RowButton text={t("form.removeDate")} row={t("form.forDate", { v: n, d: k + 1 })} onClick={() => removeDate(v, d.id)} />
                      </li>
                    ))}
                  </ul>
                  <RowButton id={field("add-date")} text={t("form.addDate")} row={forVersion} onClick={() => addDate(v)} />
                </fieldset>
              </li>
            );
          })}
        </ol>
        <button type="button" id="own-add-version" onClick={addVersion}>
          {t("form.addVersion")}
        </button>
      </section>

      {state.versions.length > 0 ? (
        <section className="form__section" aria-labelledby={`${headingId}-clauses`}>
          <h3 id={`${headingId}-clauses`}>{t("form.clausesHeading")}</h3>
          {state.versions.map((v, index) => {
            const n = index + 1;
            const news = isNews(v);
            return (
              <fieldset key={v.id} className="form__row">
                <legend>{t("form.clausesOf", { n })}</legend>
                {v.clauses.length === 0 ? <p>{t("form.noClauses")}</p> : null}
                {news ? <p className="form__hint">{t("form.newsNoExcerpt")}</p> : null}
                <ul className="form__rows">
                  {v.clauses.map((c, k) => {
                    const row = rowDomId(c.id);
                    return (
                      <li key={c.id} id={row} className="form__row form__row--inner">
                        {leftOut.has(row) ? <p className="form__left-out">{t("form.leftOut")}</p> : null}
                        <Issues id={row} issues={issuesOf(row)} />
                        <TextField id={fieldDomId(c.id, "anchor")} label={t("form.anchor")} hint={t("form.anchorHint")} value={c.anchor} issues={issuesOf(fieldDomId(c.id, "anchor"))} onChange={(anchor) => changeClause(v, c.id, { anchor })} />
                        {news ? null : (
                          <TextField id={fieldDomId(c.id, "excerpt")} label={t("form.excerpt")} hint={t("form.excerptHint")} multiline value={c.excerpt} issues={issuesOf(fieldDomId(c.id, "excerpt"))} onChange={(excerpt) => changeClause(v, c.id, { excerpt })} />
                        )}
                        <RowButton text={t("form.removeClause")} row={t("form.forClause", { v: n, c: k + 1 })} onClick={() => removeClause(v, c.id)} />
                      </li>
                    );
                  })}
                </ul>
                <RowButton id={fieldDomId(v.id, "add-clause")} text={t("form.addClause")} row={t("form.forVersion", { n })} onClick={() => addClause(v)} />
              </fieldset>
            );
          })}
        </section>
      ) : null}

      <section className="form__section" aria-labelledby={`${headingId}-scan`}>
        <h3 id={`${headingId}-scan`}>{t("form.scanHeading")}</h3>
        {scanned ? (
          <ErrorBoundary key={model.case.documents.length}>
            <ScanView key={model.case.documents.length} model={model} />
          </ErrorBoundary>
        ) : (
          <p>{t("form.nothingToScan")}</p>
        )}
      </section>
    </section>
  );
}
