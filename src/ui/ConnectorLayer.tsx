// Connector layer (scan-screen 3.1): SVG lines only, hidden from assistive technology. The
// kind of a path is its line pattern, the status is its end marker; colour is only extra
// (design, "Lines without colour"). The words live in NodeLayer's path labels.
import type { LayoutConnector, LayoutNode, Orientation, ScanLayout } from "./layout";

/**
 * Pixels per layout unit on each axis. `layoutScan` works in abstract units; the screen
 * gives them a size here, once, so the SVG layer and the HTML layer agree. The two axes are
 * scaled differently so that a node box fits between lanes and a label fits between nodes.
 */
export const SCALE: Record<Orientation, { x: number; y: number }> = {
  horizontal: { x: 1.85, y: 1.5 },
  vertical: { x: 1.25, y: 1.6 },
};

/** Node box in pixels. Fixed, so an end marker can sit just outside the box without measuring. */
export const NODE_SIZE: Record<Orientation, { w: number; h: number }> = {
  horizontal: { w: 176, h: 96 },
  vertical: { w: 100, h: 150 },
};

/** Size of the box both layers fill. The parent (`.scan-box`) takes this size. */
export function boxSize(layout: ScanLayout): { width: number; height: number } {
  const k = SCALE[layout.orientation];
  return { width: Math.round(layout.width * k.x), height: Math.round(layout.height * k.y) };
}

/** Position of a layout node in pixels. */
export function pixelOf(layout: Pick<ScanLayout, "orientation">, p: { x: number; y: number }) {
  const k = SCALE[layout.orientation];
  return { x: p.x * k.x, y: p.y * k.y };
}

const GAP_TO_MARK = 30; // status dot: distance from the box edge, along the line
const RING = 8; // open ring of "dotted, ends in an open circle"
const ARROW = { tip: 2, length: 12, half: 7 };
const STAGGER = 26; // lines that end at the same node: each later one puts its markers this much further back

type Entry = { x: number; y: number; ux: number; uy: number };

// Where the line enters the `to` node: a point on the box edge and the unit direction of travel.
// The line itself runs centre to centre under the opaque boxes; markers need the visible end.
function entry(layout: ScanLayout, from: LayoutNode, to: LayoutNode): Entry {
  const a = pixelOf(layout, from);
  const b = pixelOf(layout, to);
  const size = NODE_SIZE[layout.orientation];
  const horizontal = layout.orientation === "horizontal";
  const along = horizontal ? b.x - a.x : b.y - a.y;
  const cross = horizontal ? b.y - a.y : b.x - a.x;
  // Reading direction unless both ends share a position along it (then the line is across).
  const useAlong = Math.abs(along) >= 1 || Math.abs(cross) < 1;
  const sign = Math.sign(useAlong ? along : cross) || 1;
  const alongAxisIsX = horizontal === useAlong;
  const half = alongAxisIsX ? size.w / 2 : size.h / 2;
  return alongAxisIsX
    ? { x: b.x - sign * half, y: b.y, ux: sign, uy: 0 }
    : { x: b.x, y: b.y - sign * half, ux: 0, uy: sign };
}

const back = (e: Entry, d: number) => ({ x: e.x - e.ux * d, y: e.y - e.uy * d });

function Arrowhead({ e }: { e: Entry }) {
  const tip = back(e, ARROW.tip);
  const base = back(e, ARROW.tip + ARROW.length);
  const px = -e.uy * ARROW.half; // perpendicular to the direction of travel
  const py = e.ux * ARROW.half;
  const points = `${tip.x},${tip.y} ${base.x + px},${base.y + py} ${base.x - px},${base.y - py}`;
  return <polygon className="arrow" points={points} />;
}

function StatusMark({ status, at }: { status: LayoutConnector["status"]; at: { x: number; y: number } }) {
  if (status === "confirmed") return <circle className="end end--filled" data-end="filled" cx={at.x} cy={at.y} r={6} />;
  // not_verified and omission_not_verified: hollow with "?"
  return (
    <g className="end end--hollow" data-end="hollow">
      <circle cx={at.x} cy={at.y} r={9} />
      <text className="end__q" x={at.x} y={at.y}>?</text>
    </g>
  );
}

function Connector({ c, layout, byId, slot }: { c: LayoutConnector; layout: ScanLayout; byId: Map<string, LayoutNode>; slot: number }) {
  const k = SCALE[layout.orientation];
  const from = byId.get(c.fromId);
  const to = byId.get(c.toId);
  const e0 = from && to ? entry(layout, from, to) : null;
  // Two lines can enter one node at the same point; staggering keeps their markers apart.
  const e = e0 && { ...e0, x: e0.x - e0.ux * slot * STAGGER, y: e0.y - e0.uy * slot * STAGGER };
  return (
    <g
      className={`connector connector--${c.pattern}`}
      data-path-id={c.pathId}
      data-kind={c.kind}
      data-pattern={c.pattern}
      data-status={c.status}
    >
      <g transform={`scale(${k.x} ${k.y})`}>
        <path className="line" d={c.d} />
        {c.pattern === "double" ? <path className="line line--inner" d={c.d} /> : null}
      </g>
      {e && c.pattern === "thick_solid_arrow" ? <Arrowhead e={e} /> : null}
      {e && c.pattern === "dotted_open_end" ? (
        <circle className="ring" cx={back(e, RING).x} cy={back(e, RING).y} r={RING - 2} />
      ) : null}
      {e ? <StatusMark status={c.status} at={back(e, GAP_TO_MARK)} /> : null}
    </g>
  );
}

/**
 * One SVG over the whole scan box. A path whose status is `evidence_missing` is never drawn
 * (Req 4.2): the contract marks it not drawable, and this layer refuses it as well.
 */
export function ConnectorLayer({ layout }: { layout: ScanLayout }) {
  const { width, height } = boxSize(layout);
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const seen = new Map<string, number>(); // lines already drawn into each node
  const drawn = layout.connectors
    .filter((c) => c.status !== "evidence_missing")
    .map((c) => {
      const slot = seen.get(c.toId) ?? 0;
      seen.set(c.toId, slot + 1);
      return { c, slot };
    });
  return (
    <svg
      className="connectors"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
    >
      {drawn.map(({ c, slot }) => (
        <Connector key={c.pathId} c={c} layout={layout} byId={byId} slot={slot} />
      ))}
    </svg>
  );
}
