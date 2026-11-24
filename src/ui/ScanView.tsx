// Scan view (scan-screen 5.2): the scanner, the two layers, the not-drawn list, the evidence
// panel and a slot for a comparison strip, for one ScanModel. It owns the scanner value and the
// selection; the layout, the lines, the nodes and the panel do the rest.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ScanModel } from "../contract";
import { t } from "../i18n/t";
import { ConnectorLayer, boxSize } from "./ConnectorLayer";
import { EvidencePanel } from "./EvidencePanel";
import { NodeLayer, type Selection } from "./NodeLayer";
import { NotDrawnList } from "./NotDrawnList";
import { Scanner } from "./Scanner";
import { layoutScan, type Orientation } from "./layout";
import { useOrientation } from "./useOrientation";

export interface ScanViewProps {
  model: ScanModel;
  /** Forces an orientation; by default it follows the screen width (`useOrientation`, D-014). */
  orientation?: Orientation;
  /** Where the comparison strip of "Scan your own bill" goes (scan-screen 8). */
  comparison?: ReactNode;
}

export const GLIDE_MS = 400;

const reducedMotion = () => document.documentElement.dataset.motion === "reduce";

export function ScanView({ model, orientation: forced, comparison }: ScanViewProps) {
  const detected = useOrientation();
  const orientation = forced ?? detected;
  const columns = model.case.documents.length;
  // `value` is what the slider shows (a whole number); `shown` is what the layout draws. They
  // are equal except while a button's 400 ms glide is under way.
  const [value, setValue] = useState(0);
  const [shown, setShown] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const shownNow = useRef(0);
  const frame = useRef<number | null>(null);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(() => stop, []);

  const clamp = (v: number) => Math.min(columns, Math.max(0, v));

  // Dragging and the arrow keys: the value follows the user at once.
  const jump = (v: number) => {
    stop();
    shownNow.current = clamp(v);
    setValue(clamp(v));
    setShown(clamp(v));
  };

  // The buttons: glide to the new value over 400 ms, or change at once under reduced motion.
  const glide = (v: number) => {
    const to = clamp(v);
    if (reducedMotion()) return jump(to);
    stop();
    setValue(to);
    const from = shownNow.current;
    const start = performance.now();
    // The frame's own timestamp can fall before `start` (it is the frame's start time), so the
    // clock is read again here and the progress is kept between 0 and 1.
    const tick = () => {
      const p = Math.min(1, Math.max(0, (performance.now() - start) / GLIDE_MS));
      shownNow.current = p >= 1 ? to : from + (to - from) * p;
      setShown(shownNow.current);
      frame.current = p < 1 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
  };

  const layout = useMemo(
    () => layoutScan(model, { orientation, scanned: Math.min(shown, columns) }),
    [model, orientation, shown, columns],
  );
  const { width, height } = boxSize(layout);
  const versionNames = useMemo(
    () =>
      model.case.documents.map((d) => t("kind.endpoint.version", { documentId: d.documentId, versionId: d.versionId })),
    [model],
  );

  // Escape while focus is outside the panel (on the scanner, a node, a label or the list)
  // closes it and leaves focus where it is. Focus inside the panel is the panel's own rule:
  // it returns to the item that opened it. Stopping the event here keeps the panel's
  // document-level listener from also moving focus.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || selection === null) return;
    event.stopPropagation();
    setSelection(null);
  };

  return (
    <section className="scan-view" aria-label={t("scanner.region")}>
      <div className="scan-view__main" onKeyDown={onKeyDown}>
        <Scanner value={value} versionNames={versionNames} onJump={jump} onGlide={glide} />
        {comparison ? <div className="scan-view__comparison">{comparison}</div> : null}
        <div className="scan-scroll">
          <div className="scan-box" data-scanned={String(Math.round(shown * 100) / 100)} style={{ width, height }}>
            <ConnectorLayer layout={layout} />
            <NodeLayer model={model} layout={layout} onSelect={setSelection} />
          </div>
        </div>
        <NotDrawnList model={model} onSelect={setSelection} />
      </div>
      {selection ? <EvidencePanel model={model} selection={selection} onClose={() => setSelection(null)} /> : null}
    </section>
  );
}
