// "Scan your own bill": the bill, its versions and their clauses, the two texts to compare, the
// links and the promise, typed in by hand, started from a sample or imported from a JSON file.
// The form builds contract input with `toCaseInput`, parses it with origin "user" and shows every
// contract issue next to the field its JSON path points to. It decides nothing about a link and
// has no control that marks one confirmed (D-009). The scan below it is the same ScanView the
// samples use, with the difference between the two chosen texts in its comparison strip.
//
// The state lives in `sessionStorage` under "billxray.own" and is sent nowhere (scan-screen 8.3).
import { useEffect, useId, useMemo, useState, type ChangeEvent } from "react";
import { formatPath, parseCase, type Issue } from "../../contract";
import { t } from "../../i18n/t";
import { DiffText } from "../DiffText";
import { ErrorBoundary } from "../ErrorBoundary";
import { ScanView } from "../ScanView";
import { SAMPLE_MODE_KEY, type Sample } from "../samples";
import { CompareSection, optionName } from "./CompareSection";
import { LinksSection } from "./LinksSection";
import { PromiseSection } from "./PromiseSection";
import { Issues, RowButton, SelectField, TextField, versionName } from "./fields";
import { pickCompare } from "./compareChoice";
import { importCase, type ImportNote } from "./importCase";
import {
  BILL_FIELDS, DATE_KINDS, SOURCE_KIND_CHOICES, carriedChecks, emptyForm, fieldDomId, fieldFor, fromCase, isNews, newClause,
  newDate, newVersion, restoreForm, rowDomId, toCaseInput, withoutRows,
  type ClauseRow, type DateRow, type FormState, type SourceKind, type VersionRow,
} from "./toCaseInput";

export const SESSION_KEY = "billxray.own";

/** The form as kept for this browser session, or an empty one. */
function readSession(): FormState {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return (raw === null ? null : restoreForm(JSON.parse(raw))) ?? emptyForm();
  } catch {
    return emptyForm();
  }
}

/** What the last "Import JSON" did, shown above the form. */
type ImportState =
  | { kind: "none" }
  | { kind: "not_json" }
  | { kind: "unusable"; issues: readonly Issue[] }
  | { kind: "done"; notes: readonly ImportNote[] };

const SOURCE_OPTIONS = SOURCE_KIND_CHOICES.map((k) => ({ value: k, text: t(`form.sourceKindOption.${k}`) }));
const DATE_KIND_OPTIONS = [
  { value: "", text: t("form.chooseKind") },
  ...DATE_KINDS.map((k) => ({ value: k, text: t(`dateKind.${k}`) })),
];

export function OwnBillForm({ referenceDate, samples = [] }: { referenceDate: string; samples?: readonly Sample[] }) {
  const [state, setState] = useState<FormState>(readSession);
  const [imported, setImported] = useState<ImportState>({ kind: "none" });
  const [focusId, setFocusId] = useState<string | null>(null);
  const headingId = useId();

  // The form is kept for this browser session only. shortcut: a browser that refuses storage
  // (private mode, a full quota) just does not keep it; nothing else changes.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch {
      /* not kept */
    }
  }, [state]);

  // Only a form started from a sample, and only for rows still unchanged, has checks: they come
  // from the loaded sample itself, never from what is stored in the session (D-009).
  const carried = useMemo(() => {
    const model = samples.find((s) => s.caseId === state.copiedFrom)?.model;
    return model ? carriedChecks(model.case) : [];
  }, [samples, state.copiedFrom]);

  // Every change is parsed again; parseCase never throws for any JSON value.
  const { fields, parsed } = useMemo(() => {
    const built = toCaseInput(state);
    return { fields: built.fields, parsed: parseCase(built.input, { referenceDate, origin: "user", bundledChecks: carried }) };
  }, [state, referenceDate, carried]);

  const notes = imported.kind === "done" ? imported.notes : [];
  const { byField, unplaced, leftOut } = useMemo(() => {
    const byField = new Map<string, Issue[]>();
    const unplaced: Issue[] = [];
    for (const issue of parsed.issues) {
      const id = fieldFor(fields, issue.path);
      if (id === null) unplaced.push(issue);
      else byField.set(id, [...(byField.get(id) ?? []), issue]);
    }
    // The warnings the import kept (a saved check record that was ignored) sit next to their rows.
    for (const note of notes) if (note.fieldId !== null) byField.set(note.fieldId, [...(byField.get(note.fieldId) ?? []), note.issue]);
    // A record with a block issue is out of the scan; its row says so.
    const leftOut = new Set<string>();
    for (const e of parsed.model?.excluded ?? []) {
      const id = fieldFor(fields, e.path);
      if (id !== null) leftOut.add(id);
    }
    return { byField, unplaced, leftOut };
  }, [parsed, fields, notes]);
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
    // The version, its clauses and every link end that pointed at them go together.
    const gone = [id, ...(state.versions.find((v) => v.id === id)?.clauses.map((c) => c.id) ?? [])];
    setState((s) => withoutRows({ ...s, versions: s.versions.filter((v) => v.id !== id) }, gone));
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
    setState((s) => withoutRows(s, [id]));
    setVersion(v.id, (x) => ({ ...x, clauses: x.clauses.filter((c) => c.id !== id) }));
    setFocusId(fieldDomId(v.id, "add-clause"));
  };

  // ---- Start from a sample, Import JSON ----

  const startFrom = (sample: Sample) => {
    if (sample.model === null) return;
    setState({ ...fromCase(sample.model.case).state, copiedFrom: sample.caseId });
    setImported({ kind: "none" });
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // the same file can be chosen again
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setImported({ kind: "not_json" });
    reader.onload = () => {
      let value: unknown;
      try {
        value = JSON.parse(String(reader.result));
      } catch {
        setImported({ kind: "not_json" }); // nothing in the form changes
        return;
      }
      const result = importCase(value, referenceDate);
      if (!result.ok) {
        setImported({ kind: "unusable", issues: result.issues });
        return;
      }
      setState(result.state);
      setImported({ kind: "done", notes: result.notes });
    };
    reader.readAsText(file);
  };

  const model = parsed.model;
  const scanned = model !== null && model.case.documents.length > 0;
  const compare = useMemo(() => pickCompare(state), [state.versions, state.compare]); // eslint-disable-line react-hooks/exhaustive-deps
  const comparison =
    compare.result && compare.a && compare.b ? (
      <div className="compare-strip">
        <h4>{t("form.diffCaption", { a: optionName(compare.a), b: optionName(compare.b) })}</h4>
        <DiffText result={compare.result} lang={compare.a.lang} />
      </div>
    ) : null;
  const leftOutNotes = notes.filter((n) => n.fieldId === null);
  const section = (key: string) => `${headingId}-${key}`;
  const sectionProps = { state, setState, issuesOf, leftOut, focus: setFocusId };

  return (
    <section className="own-form" aria-labelledby={headingId}>
      <h2 id={headingId}>{t("mode.own")}</h2>

      {unplaced.length > 0 ? (
        <div className="form__unplaced">
          <h3>{t("form.otherIssues")}</h3>
          <Issues id="own-unplaced" issues={unplaced} />
        </div>
      ) : null}

      <section className="form__section" aria-labelledby={section("start")}>
        <h3 id={section("start")}>{t("form.startHeading")}</h3>
        <p className="form__hint">{t("form.startHint")}</p>
        {samples.some((s) => s.model !== null && !s.blocked) ? (
          <div className="form__buttons">
            {samples.flatMap((s) =>
              s.model !== null && !s.blocked ? [
                <button key={s.caseId} type="button" onClick={() => startFrom(s)}>
                  {t("form.startFrom", { name: t(SAMPLE_MODE_KEY[s.caseId]) })}
                </button>,
              ] : [],
            )}
          </div>
        ) : null}
        <div className="form__field">
          <label htmlFor="own-import">{t("form.importJson")}</label>
          <p id="own-import-hint" className="form__hint">{t("form.importHint")}</p>
          <input
            id="own-import"
            type="file"
            accept=".json,application/json"
            onChange={onFile}
            aria-describedby={imported.kind === "not_json" ? "own-import-hint own-import-issues" : "own-import-hint"}
            aria-invalid={imported.kind === "not_json" ? true : undefined}
          />
          {imported.kind === "not_json" ? (
            <p id="own-import-issues" role="alert" className="form__issue form__issue--block">
              <strong>{t("form.severity.block")}</strong> {t("issue.import_not_json")}
            </p>
          ) : null}
          {imported.kind === "unusable" ? (
            <div id="own-import-issues" role="alert">
              <p>{t("form.importUnusable")}</p>
              <ul className="form__issues">
                {imported.issues.map((i, n) => (
                  <li key={n} className={`form__issue form__issue--${i.severity}`}>
                    {`${formatPath(i.path)}: ${t(`issue.${i.code}`, i.params)}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {imported.kind === "done" ? <p role="status">{t("form.importDone")}</p> : null}
          {leftOutNotes.length > 0 ? (
            <div className="form__unplaced">
              <h4>{t("form.importLeftOut")}</h4>
              <ul className="form__issues">
                {leftOutNotes.map((n, k) => (
                  <li key={k} className={`form__issue form__issue--${n.issue.severity}`}>
                    <strong>{t(`form.severity.${n.issue.severity}`)}</strong>{" "}
                    {`${formatPath(n.issue.path)}: ${t(`issue.${n.issue.code}`, n.issue.params)}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="form__section" aria-labelledby={section("bill")}>
        <h3 id={section("bill")}>{t("form.billHeading")}</h3>
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

      <section className="form__section" aria-labelledby={section("versions")}>
        <h3 id={section("versions")}>{t("form.versionsHeading")}</h3>
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
        <section className="form__section" aria-labelledby={section("clauses")}>
          <h3 id={section("clauses")}>{t("form.clausesHeading")}</h3>
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

      {state.versions.length > 0 ? (
        <>
          <section className="form__section" aria-labelledby={section("compare")}>
            <h3 id={section("compare")}>{t("form.compareHeading")}</h3>
            <CompareSection {...sectionProps} />
          </section>
          <section className="form__section" aria-labelledby={section("links")}>
            <h3 id={section("links")}>{t("form.linksHeading")}</h3>
            <LinksSection {...sectionProps} />
          </section>
        </>
      ) : null}

      <section className="form__section" aria-labelledby={section("promise")}>
        <h3 id={section("promise")}>{t("form.promiseHeading")}</h3>
        <PromiseSection {...sectionProps} />
      </section>

      <section className="form__section" aria-labelledby={section("scan")}>
        <h3 id={section("scan")}>{t("form.scanHeading")}</h3>
        {scanned ? (
          <>
            <p className="form__banner" role="note">
              {t("form.banner")}
              {state.copiedFrom !== null ? ` ${t("form.bannerCopied")}` : ""}
            </p>
            <ErrorBoundary key={model.case.documents.length}>
              <ScanView key={model.case.documents.length} model={model} comparison={comparison} />
            </ErrorBoundary>
          </>
        ) : (
          <p>{t("form.nothingToScan")}</p>
        )}
      </section>
    </section>
  );
}
