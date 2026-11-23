// Node layer (scan-screen 3.2): focusable HTML buttons for version nodes, clause nodes and
// path labels. Every word comes from en.json through t(); every fact comes from the model.
// Opening the evidence panel is task 5: this layer only calls `onSelect`.
import type { ReactNode } from "react";
import type { DocumentVersion, Endpoint, Evidence, ScanModel } from "../contract";
import { t } from "../i18n/t";
import { NODE_SIZE, SCALE, boxSize, pixelOf } from "./ConnectorLayer";
import type { LayoutLabel, LayoutNode, ScanLayout } from "./layout";

export type Selection =
  | { type: "node"; id: string; ref: Endpoint }
  | { type: "path"; pathId: string };

export interface NodeLayerProps {
  model: ScanModel;
  layout: ScanLayout;
  onSelect: (selection: Selection) => void;
}

export const EXCERPT_CHARS = 60;

/** The first `max` characters (code points, not UTF-16 units), with an ellipsis when cut. */
export function firstChars(text: string, max = EXCERPT_CHARS): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : text;
}

const docKey = (documentId: string, versionId: string) => JSON.stringify([documentId, versionId]);

// News from another outlet shows the team's fact sentence, never an excerpt (D-016).
const isOtherOutlet = (d: DocumentVersion | undefined) => d?.sourceKind === "news" && d.ownOutlet !== true;

// shortcut: a version node lists every date it has and the box has a fixed size, so a version
// with more than three dates spills below its box. Cap the list and point to the panel then.
function dateLines(model: ScanModel, d: DocumentVersion): string[] {
  const events = model.case.events.filter((e) => e.documentId === d.documentId && e.versionId === d.versionId);
  // A version with no date at all says so: a missing value reads "Not verified" (Req 4.4).
  if (events.length === 0) {
    return [t("timing.date", { kind: t("dateKind.unknown"), date: t("timing.unknown") })];
  }
  return events.map((e) => {
    const kind = t(`dateKind.${e.eventKind}`);
    const dateKnown = e.eventDate !== "unknown";
    const date = dateKnown ? e.eventDate : t("timing.unknown");
    // The contract computes the timing from the reference date. A date it did not judge is
    // never shown as past or in effect: it reads "Not verified".
    const timing = model.dates[e.eventId]?.timing ?? "unknown";
    const note = timing === "scheduled" || timing === "too_coarse" || (timing === "unknown" && dateKnown);
    return note
      ? t("timing.dateWithTiming", { kind, date, timing: t(`timing.${timing}`) })
      : t("timing.date", { kind, date });
  });
}

function VersionNode({ model, d }: { model: ScanModel; d: DocumentVersion }) {
  return (
    <>
      <strong className="node__title">{d.documentId}</strong>
      {d.localEventLabel ? (
        <span className="node__stage" lang={d.language}>
          {d.localEventLabel}
        </span>
      ) : null}
      {dateLines(model, d).map((line, i) => (
        <span className="node__date" key={i}>
          {line}
        </span>
      ))}
    </>
  );
}

function ClauseNode({ e, d }: { e: Evidence; d: DocumentVersion | undefined }) {
  const other = isOtherOutlet(d);
  const text = other ? (d?.factSentence ?? "") : e.excerpt;
  return (
    <>
      <strong className="node__title">{e.anchor}</strong>
      <span className="node__doc">{e.documentId}</span>
      {text === "" ? (
        <span className="node__text">{t("timing.unknown")}</span>
      ) : (
        // The excerpt is in the document's language. Our own fact sentence is written by the
        // team: the contract records no language for it, so it inherits the page's.
        <span className="node__text" lang={other ? undefined : d?.language}>
          {firstChars(text)}
        </span>
      )}
    </>
  );
}

function PromiseNode({ model }: { model: ScanModel }) {
  const statement = model.case.promise?.statement ?? "";
  return (
    <>
      <strong className="node__title">{t("kind.promise")}</strong>
      <span className="node__text">{statement === "" ? t("timing.unknown") : firstChars(statement)}</span>
    </>
  );
}

function NodeButton({ model, layout, n, docs, evidence, onSelect }: {
  model: ScanModel;
  layout: ScanLayout;
  n: LayoutNode;
  docs: Map<string, DocumentVersion>;
  evidence: Map<string, Evidence>;
  onSelect: NodeLayerProps["onSelect"];
}) {
  const p = pixelOf(layout, n);
  const size = NODE_SIZE[layout.orientation];
  let body: ReactNode = null;
  if (n.ref.type === "version") {
    const d = docs.get(docKey(n.ref.documentId, n.ref.versionId));
    body = d ? <VersionNode model={model} d={d} /> : null;
  } else if (n.ref.type === "clause") {
    const e = evidence.get(n.ref.evidenceId);
    body = e ? <ClauseNode e={e} d={docs.get(docKey(e.documentId, e.versionId))} /> : null;
  } else {
    body = <PromiseNode model={model} />;
  }
  return (
    <button
      type="button"
      className={`node node--${n.kind}`}
      data-node-id={n.id}
      style={{ left: p.x, top: p.y, width: size.w, height: size.h }}
      onClick={() => onSelect({ type: "node", id: n.id, ref: n.ref })}
    >
      {body}
    </button>
  );
}

function PathLabel({ model, l, pos, onSelect, describe }: {
  model: ScanModel;
  l: LayoutLabel;
  pos: { x: number; y: number };
  onSelect: NodeLayerProps["onSelect"];
  describe: (e: Endpoint) => string;
}) {
  const path = model.case.paths.find((p) => p.pathId === l.pathId);
  const kind = t(l.kindKey, l.params);
  const status = l.statusKey === null ? null : t(l.statusKey);
  // The accessible name spells out the whole line: track, both ends, kind and status.
  const name = path
    ? t("kind.pathName", {
        track: t(`kind.track.${model.paths[l.pathId]?.track ?? "clause"}`),
        from: describe(path.from),
        to: describe(path.to),
        label: status === null ? kind : t("kind.labelWithStatus", { kind, status }),
      })
    : kind;
  return (
    <button
      type="button"
      className="label"
      data-path-id={l.pathId}
      aria-label={name}
      style={{ left: pos.x, top: pos.y }}
      onClick={() => onSelect({ type: "path", pathId: l.pathId })}
    >
      <span className="label__kind">{kind}</span>
      {status === null ? null : <span className="label__status">{status}</span>}
    </button>
  );
}

/**
 * Nodes in reading order (column, then lane), then the path labels: the tab order of the
 * design. A label of a path whose status is `evidence_missing` is not drawn, like its line.
 */
export function NodeLayer({ model, layout, onSelect }: NodeLayerProps) {
  const docs = new Map(model.case.documents.map((d) => [docKey(d.documentId, d.versionId), d]));
  const evidence = new Map(model.case.evidence.map((e) => [e.evidenceId, e]));
  const { width, height } = boxSize(layout);
  const k = SCALE[layout.orientation];

  const describe = (e: Endpoint): string => {
    if (e.type === "promise") return t("kind.promise");
    if (e.type === "version") return t("kind.endpoint.version", { documentId: e.documentId, versionId: e.versionId });
    const ev = evidence.get(e.evidenceId);
    return ev ? t("kind.endpoint.clause", { documentId: ev.documentId, anchor: ev.anchor }) : t("timing.unknown");
  };

  return (
    <div className="nodes" data-orientation={layout.orientation} style={{ width, height }}>
      {layout.nodes.map((n) => (
        <NodeButton key={n.id} model={model} layout={layout} n={n} docs={docs} evidence={evidence} onSelect={onSelect} />
      ))}
      {layout.labels
        .filter((l) => model.paths[l.pathId]?.status !== "evidence_missing")
        .map((l) => (
          <PathLabel
            key={l.pathId}
            model={model}
            l={l}
            pos={{ x: l.x * k.x, y: l.y * k.y }}
            onSelect={onSelect}
            describe={describe}
          />
        ))}
    </div>
  );
}
