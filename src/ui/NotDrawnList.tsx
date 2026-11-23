// Not-drawn list (scan-screen 5.3, Req 4.2): every path that gets no line, with its status and
// what it still needs. Nothing here is a line. A path is listed when the contract marks it not
// drawable, or when its status is "evidence missing" (the layers refuse to draw those even if
// the contract says drawable). A record the contract removed for a block issue in the paths
// list shows as one generic line with its position; the form (scan-screen 7) shows the detail.
import { useId } from "react";
import type { Endpoint, ScanModel } from "../contract";
import { t } from "../i18n/t";
import type { Selection } from "./NodeLayer";

export interface NotDrawnListProps {
  model: ScanModel;
  onSelect: (selection: Selection) => void;
}

function describe(model: ScanModel, e: Endpoint): string {
  if (e.type === "promise") return t("kind.promise");
  if (e.type === "version") return t("kind.endpoint.version", { documentId: e.documentId, versionId: e.versionId });
  const ev = model.case.evidence.find((row) => row.evidenceId === e.evidenceId);
  return ev ? t("kind.endpoint.clause", { documentId: ev.documentId, anchor: ev.anchor }) : t("timing.unknown");
}

export function NotDrawnList({ model, onSelect }: NotDrawnListProps) {
  const headingId = useId();
  const items = model.case.paths.filter((p) => {
    const view = model.paths[p.pathId];
    return view !== undefined && (!view.drawable || view.status === "evidence_missing");
  });
  // The position is 1-based: the n-th path of the input, as a person counts it.
  const unread = model.excluded.flatMap((x) =>
    x.path.length === 2 && x.path[0] === "paths" && typeof x.path[1] === "number" ? [x.path[1] + 1] : [],
  );
  if (items.length === 0 && unread.length === 0) return null;

  return (
    <section className="not-drawn" aria-labelledby={headingId}>
      <h2 id={headingId} className="not-drawn__heading">
        {t("scanner.notDrawn")}
      </h2>
      <p className="not-drawn__intro">{t("scanner.notDrawnIntro")}</p>
      <ul className="not-drawn__list">
        {items.map((p) => {
          const view = model.paths[p.pathId]!;
          const kind = t(`kind.${p.kind}`, {
            documentId: p.to.type === "version" ? p.to.documentId : "",
          });
          const name = t("scanner.notDrawnItem", { kind, from: describe(model, p.from), to: describe(model, p.to) });
          return (
            <li key={p.pathId} className="not-drawn__item" data-path-id={p.pathId}>
              <button type="button" className="not-drawn__open" onClick={() => onSelect({ type: "path", pathId: p.pathId })}>
                {name}
              </button>
              <p className="not-drawn__status">
                {view.status === "confirmed" ? t("panel.confirmed") : t(`status.${view.status}`)}
              </p>
              {view.needs.length > 0 ? (
                <ul className="not-drawn__needs">
                  {view.needs.map((n, i) => {
                    const need = t(`need.${n.code}`);
                    const evidenceId = n.params?.evidenceId;
                    return <li key={i}>{evidenceId ? t("panel.needWithRow", { need, evidenceId }) : need}</li>;
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
        {unread.map((position) => (
          <li key={`unread-${position}`} className="not-drawn__item not-drawn__item--unread">
            {t("scanner.excluded", { position })}
          </li>
        ))}
      </ul>
    </section>
  );
}
