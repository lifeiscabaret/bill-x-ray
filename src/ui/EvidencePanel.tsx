// Evidence panel (scan-screen 4.1, 4.2). Every word comes from en.json through t() and every
// fact from the ScanModel. It opens for one Selection (a version, a clause, a promise record
// or a path) and never decides a status: it shows what the contract computed.
import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { compareTexts } from "../compare/diff";
import type { DocumentVersion, Endpoint, Evidence, PathKind, ScanModel } from "../contract";
import { t } from "../i18n/t";
import { DiffText } from "./DiffText";
import type { Selection } from "./NodeLayer";

export interface EvidencePanelProps {
  model: ScanModel;
  selection: Selection;
  onClose: () => void;
}

// The paths whose two excerpts the panel compares (Req 3.1, 3.3).
const DIFF_KINDS: readonly PathKind[] = ["carried", "transferred", "same_outcome_separate_law"];

const docKey = (documentId: string, versionId: string) => JSON.stringify([documentId, versionId]);

// News from another outlet shows no excerpt, neither here nor translated (D-016).
const isOtherOutlet = (d: DocumentVersion | undefined) => d?.sourceKind === "news" && d.ownOutlet !== true;

/** Only http and https links are rendered as links; anything else reads "Not verified". */
function httpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag; // not a well-formed language tag: show it as written
  }
}

interface Lookup {
  docs: Map<string, DocumentVersion>;
  evidence: Map<string, Evidence>;
}

function lookupOf(model: ScanModel): Lookup {
  return {
    docs: new Map(model.case.documents.map((d) => [docKey(d.documentId, d.versionId), d])),
    evidence: new Map(model.case.evidence.map((e) => [e.evidenceId, e])),
  };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="panel__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function NotVerified() {
  return <span>{t("panel.notVerified")}</span>;
}

function SourceLink({ url }: { url: string | null }) {
  const href = httpUrl(url);
  if (href === null) return <NotVerified />;
  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" className="panel__link">
        {href}
      </a>{" "}
      <span className="panel__hint">{t("panel.newTab")}</span>
    </>
  );
}

// Each date with its kind and what the contract computed about its timing. A date the
// contract did not judge is never shown as past or in effect: it reads "Not verified".
function dateLines(model: ScanModel, d: DocumentVersion): string[] {
  const events = model.case.events.filter((e) => e.documentId === d.documentId && e.versionId === d.versionId);
  if (events.length === 0) return [t("timing.date", { kind: t("dateKind.unknown"), date: t("timing.unknown") })];
  return events.map((e) => {
    const kind = t(`dateKind.${e.eventKind}`);
    if (e.eventDate === "unknown") return t("timing.date", { kind, date: t("timing.unknown") });
    // The design times only effective and applied events; every other kind shows kind and date.
    if (e.eventKind !== "effective" && e.eventKind !== "applied") return t("timing.date", { kind, date: e.eventDate });
    const timing = model.dates[e.eventId]?.timing ?? "unknown";
    return t("timing.dateWithTiming", { kind, date: e.eventDate, timing: t(`timing.${timing}`) });
  });
}

function VersionDetails({ model, d, showTitle }: { model: ScanModel; d: DocumentVersion; showTitle: boolean }) {
  const other = isOtherOutlet(d);
  return (
    <dl className="panel__list">
      {showTitle ? (
        <Row label={t("panel.title")}>
          <span lang={d.language}>{d.title}</span>
        </Row>
      ) : null}
      <Row label={t(other ? "panel.outlet" : "panel.publisher")}>{d.publisher}</Row>
      <Row label={t("panel.number")}>{d.documentId}</Row>
      <Row label={t("panel.version")}>{d.versionId}</Row>
      {d.localEventLabel ? (
        <Row label={t("panel.stage")}>
          <span lang={d.language}>{d.localEventLabel}</span>
        </Row>
      ) : null}
      <Row label={t("panel.dates")}>
        <ul className="panel__dates">
          {dateLines(model, d).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </Row>
      <Row label={t("panel.originalLink")}>
        <SourceLink url={d.sourceUrl} />
      </Row>
      <Row label={t("panel.language")}>
        {languageName(d.language)} <span className="panel__hint">{d.language}</span>
      </Row>
      {other ? (
        <Row label={t("panel.factSentence")}>{d.factSentence ? d.factSentence : <NotVerified />}</Row>
      ) : null}
    </dl>
  );
}

// Who checked the row: shown only when the gate counted the check. A row with no gate entry,
// a failing gate or an ignored record (a user case, D-009) shows no check record at all.
function CheckedBy({ model, e }: { model: ScanModel; e: Evidence }) {
  const counted = model.gate[e.evidenceId]?.pass === true && e.check.checkedBy !== null && e.check.checkedAt !== null;
  if (!counted) return <NotVerified />;
  const { checkedBy, checkedAt, confirmedBy, confirmedAt } = e.check;
  return (
    <ul className="panel__dates">
      <li>{t("panel.checkedBy", { role: checkedBy ?? "", date: checkedAt ?? "" })}</li>
      {confirmedBy !== null && confirmedAt !== null ? (
        <li>{t("panel.confirmedBy", { role: confirmedBy, date: confirmedAt })}</li>
      ) : null}
    </ul>
  );
}

function ClauseDetails({ model, e, d }: { model: ScanModel; e: Evidence; d: DocumentVersion | undefined }) {
  const other = isOtherOutlet(d);
  return (
    <dl className="panel__list">
      <Row label={t("panel.anchor")}>
        <span lang={d?.language}>{e.anchor}</span>
      </Row>
      {other ? null : (
        <>
          <Row label={t("panel.excerpt")}>
            {e.excerpt === "" ? <NotVerified /> : <span lang={d?.language}>{e.excerpt}</span>}
          </Row>
          {e.translation ? (
            <Row label={t("panel.translation")}>
              <span lang={e.translation.language}>{e.translation.text}</span>
            </Row>
          ) : null}
        </>
      )}
      <Row label={t("panel.checkedHeading")}>
        <CheckedBy model={model} e={e} />
      </Row>
    </dl>
  );
}

function PromiseDetails({ model }: { model: ScanModel }) {
  const p = model.case.promise;
  if (!p) return <p>{t("panel.missing")}</p>;
  // Another outlet's article carries no excerpt: only the team's fact sentence (D-016).
  const text = p.ownOutlet === true ? (p.excerpt ?? p.factSentence) : p.factSentence;
  return (
    <dl className="panel__list">
      <Row label={t("panel.promiseStatement")}>{p.statement}</Row>
      <Row label={t("panel.promiseSource")}>
        {p.sourceTitle} {p.publisher}
      </Row>
      <Row label={t("panel.dates")}>{p.date === "unknown" ? <NotVerified /> : p.date}</Row>
      <Row label={t("panel.originalLink")}>
        <SourceLink url={p.sourceUrl} />
      </Row>
      {text ? <Row label={t("panel.factSentence")}>{text}</Row> : null}
    </dl>
  );
}

function EndpointBlock({ label, end, lookup }: { label: string; end: Endpoint; lookup: Lookup }) {
  let body: ReactNode;
  if (end.type === "promise") {
    body = <p>{t("kind.promise")}</p>;
  } else {
    const e = end.type === "clause" ? lookup.evidence.get(end.evidenceId) : undefined;
    const d =
      end.type === "version"
        ? lookup.docs.get(docKey(end.documentId, end.versionId))
        : e && lookup.docs.get(docKey(e.documentId, e.versionId));
    body = (
      <dl className="panel__list">
        <Row label={t("panel.title")}>{d ? <span lang={d.language}>{d.title}</span> : <NotVerified />}</Row>
        <Row label={t("panel.number")}>{d ? d.documentId : <NotVerified />}</Row>
        <Row label={t("panel.version")}>{d ? d.versionId : <NotVerified />}</Row>
        {end.type === "clause" ? (
          <Row label={t("panel.anchor")}>{e ? <span lang={d?.language}>{e.anchor}</span> : <NotVerified />}</Row>
        ) : null}
        <Row label={t("panel.originalLink")}>
          <SourceLink url={d?.sourceUrl ?? null} />
        </Row>
      </dl>
    );
  }
  return (
    <section className="panel__section">
      <h3>{label}</h3>
      {body}
    </section>
  );
}

function PathDiff({ from, to, lang }: { from: string; to: string; lang?: string }) {
  const result = useMemo(() => compareTexts(from, to), [from, to]);
  return (
    <section className="panel__section">
      <h3>{t("panel.difference")}</h3>
      <DiffText result={result} lang={lang} />
    </section>
  );
}

function PathDetails({ model, pathId, lookup }: { model: ScanModel; pathId: string; lookup: Lookup }) {
  const path = model.case.paths.find((p) => p.pathId === pathId);
  const view = model.paths[pathId];
  if (!path || !view) return <p>{t("panel.missing")}</p>;

  const clauseOf = (end: Endpoint) => {
    if (end.type !== "clause") return null;
    const e = lookup.evidence.get(end.evidenceId);
    return e ? { e, d: lookup.docs.get(docKey(e.documentId, e.versionId)) } : null;
  };
  const earlier = clauseOf(path.from);
  const later = clauseOf(path.to);
  const diffable =
    DIFF_KINDS.includes(path.kind) &&
    earlier !== null && later !== null &&
    !isOtherOutlet(earlier.d) && !isOtherOutlet(later.d) &&
    earlier.e.excerpt !== "" && later.e.excerpt !== "";
  const evidence = path.evidenceRefs.map((id) => lookup.evidence.get(id)).filter((e): e is Evidence => e !== undefined);

  return (
    <>
      <dl className="panel__list">
        <Row label={t("panel.track")}>{t(`kind.track.${view.track}`)}</Row>
        <Row label={t("panel.status")}>
          {view.status === "confirmed" ? t("panel.confirmed") : t(`status.${view.status}`)}
        </Row>
      </dl>
      {view.needs.length > 0 ? (
        <section className="panel__section">
          <h3>{t("panel.needs")}</h3>
          <ul>
            {view.needs.map((n, i) => {
              const need = t(`need.${n.code}`);
              const evidenceId = n.params?.evidenceId;
              return <li key={i}>{evidenceId ? t("panel.needWithRow", { need, evidenceId }) : need}</li>;
            })}
          </ul>
        </section>
      ) : null}
      <EndpointBlock label={t("panel.earlier")} end={path.from} lookup={lookup} />
      <EndpointBlock label={t("panel.later")} end={path.to} lookup={lookup} />
      {diffable ? <PathDiff from={earlier.e.excerpt} to={later.e.excerpt} lang={later.d?.language} /> : null}
      {evidence.length > 0 ? (
        <section className="panel__section">
          <h3>{t("panel.evidence")}</h3>
          {evidence.map((e) => (
            <ClauseDetails key={e.evidenceId} model={model} e={e} d={lookup.docs.get(docKey(e.documentId, e.versionId))} />
          ))}
        </section>
      ) : null}
    </>
  );
}

interface Resolved {
  type: "version" | "clause" | "promise" | "path" | "missing";
  heading: string;
  body: ReactNode;
}

function resolve(model: ScanModel, lookup: Lookup, selection: Selection): Resolved {
  const missing: Resolved = { type: "missing", heading: t("panel.missing"), body: null };
  if (selection.type === "path") {
    const path = model.case.paths.find((p) => p.pathId === selection.pathId);
    if (!path) return missing;
    // "Continued as {documentId}" names the document the path ends in.
    const target =
      path.to.type === "version"
        ? path.to.documentId
        : path.to.type === "clause"
          ? (lookup.evidence.get(path.to.evidenceId)?.documentId ?? "")
          : "";
    return {
      type: "path",
      heading: t(`kind.${path.kind}`, { documentId: target }),
      body: <PathDetails model={model} pathId={path.pathId} lookup={lookup} />,
    };
  }
  const ref = selection.ref;
  if (ref.type === "promise") {
    return model.case.promise
      ? { type: "promise", heading: t("kind.promise"), body: <PromiseDetails model={model} /> }
      : missing;
  }
  if (ref.type === "version") {
    const d = lookup.docs.get(docKey(ref.documentId, ref.versionId));
    return d ? { type: "version", heading: d.title, body: <VersionDetails model={model} d={d} showTitle={false} /> } : missing;
  }
  const e = lookup.evidence.get(ref.evidenceId);
  if (!e) return missing;
  const d = lookup.docs.get(docKey(e.documentId, e.versionId));
  return {
    type: "clause",
    heading: t("kind.endpoint.clause", { documentId: e.documentId, anchor: e.anchor }),
    body: (
      <>
        {d ? <VersionDetails model={model} d={d} showTitle /> : null}
        <ClauseDetails model={model} e={e} d={d} />
      </>
    ),
  };
}

const selectionKey = (s: Selection) => (s.type === "node" ? `node:${s.id}` : `path:${s.pathId}`);

export function EvidencePanel({ model, selection, onClose }: EvidencePanelProps) {
  const headingId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const key = selectionKey(selection);

  // On open (and when another item is selected) remember the focused item and move focus to
  // the heading. An item already focused inside the panel is not the opener.
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !panelRef.current?.contains(active)) {
      openerRef.current = active;
    }
    headingRef.current?.focus();
  }, [key]);

  const close = useCallback(() => {
    openerRef.current?.focus();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const lookup = useMemo(() => lookupOf(model), [model]);
  const view = resolve(model, lookup, selection);

  return (
    <aside className="panel" ref={panelRef} aria-labelledby={headingId} data-selection={key}>
      <div className="panel__top">
        <p className="panel__type">{view.type === "missing" ? null : t(`panel.type.${view.type}`)}</p>
        <button type="button" className="panel__close" onClick={close}>
          {t("panel.close")}
        </button>
      </div>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="panel__heading">
        {view.heading}
      </h2>
      {view.body}
    </aside>
  );
}
