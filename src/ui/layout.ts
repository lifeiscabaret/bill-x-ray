// Layout engine (scan-screen design, "Layout model"). Pure: no DOM, no React, no screen
// measuring. Positions are numbers in one coordinate box that the SVG layer and the HTML
// layer share, so the same model gives the same result in every browser.
import type { Endpoint, PathKind, PathStatus, ScanModel } from "../contract";

export type Orientation = "horizontal" | "vertical";

/** D-014: columns run left to right from this width up, and top to bottom below it. */
export const NARROW_BELOW_PX = 720;

export function orientationForWidth(widthPx: number): Orientation {
  return widthPx >= NARROW_BELOW_PX ? "horizontal" : "vertical";
}

// Spacing in coordinate-box units. STEP is the distance between columns along the reading
// direction, LANE the distance between lanes across it.
export const PAD = 48;
export const STEP = 180;
export const LANE = 88;

/** The line pattern of each kind (design, "Lines without colour"). Task 3 draws them. */
export type LinePattern =
  | "thick_solid"
  | "thick_solid_arrow"
  | "thin_solid"
  | "double"
  | "long_dash"
  | "dotted_open_end";

export const LINE_PATTERN: Record<PathKind, LinePattern> = {
  next_version: "thick_solid",
  successor_document: "thick_solid_arrow",
  carried: "thin_solid",
  transferred: "double",
  same_outcome_separate_law: "long_dash",
  not_included: "dotted_open_end",
};

export type NodeKind = "version" | "clause" | "promise";

export interface LayoutNode {
  id: string;
  kind: NodeKind;
  /** Index in the case file's document list; -1 for the promise node, which comes first. */
  column: number;
  /** The node's own lane once the scanner has passed it. Version nodes: 0. */
  lane: number;
  /** Where the node sits now: `lane` times the reveal of its column. A fraction mid-scan. */
  laneOffset: number;
  x: number;
  y: number;
  /** What the node stands for, so a component can look up the record. */
  ref: Endpoint;
}

export interface LayoutConnector {
  pathId: string;
  fromId: string;
  toId: string;
  kind: PathKind;
  status: PathStatus;
  pattern: LinePattern;
  /** SVG path data in the shared coordinate box. */
  d: string;
}

/** The label as string keys (en.json `kind.*`, `status.*`), so this module stays free of text. */
export interface LayoutLabel {
  pathId: string;
  kindKey: string;
  /** null for a confirmed path: it carries no status text (design table). */
  statusKey: string | null;
  /** Values for the kind string, e.g. `documentId` for "Continued as {documentId}". */
  params: Record<string, string>;
  x: number;
  y: number;
}

export interface ScanLayout {
  orientation: Orientation;
  /** Number of document versions: the scanner runs from 0 to this value. */
  columns: number;
  /** Number of lanes including the number track (lane 0). */
  lanes: number;
  width: number;
  height: number;
  /** Reading order: column, then lane. */
  nodes: LayoutNode[];
  connectors: LayoutConnector[];
  labels: LayoutLabel[];
}

export interface LayoutOptions {
  orientation: Orientation;
  /** Scanner value, 0 to the number of columns; values outside are clamped. */
  scanned: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** `clamp(s - c, 0, 1)`: how far the scanner has moved past column `c` (design, "Layout model"). */
export function reveal(scanned: number, column: number): number {
  return clamp01(scanned - column);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const versionId = (documentId: string, versionId: string) => `version:${documentId}#${versionId}`;
const clauseId = (evidenceId: string) => `clause:${evidenceId}`;
const PROMISE_ID = "promise";

// shortcut: two clause nodes of one chain in the same column share a spot and overlap; split
// them within the column when a real case needs it.
// shortcut: a path marked drawable whose endpoint does not resolve (the contract marks such a
// path not drawable) is skipped rather than drawn to nowhere.
export function layoutScan(model: ScanModel, options: LayoutOptions): ScanLayout {
  const { documents, evidence, paths } = model.case;
  const columns = documents.length;
  const s = Number.isFinite(options.scanned) ? Math.min(columns, Math.max(0, options.scanned)) : 0;

  const column = new Map<string, number>(); // node id -> column
  const versionRefs = new Map<string, Endpoint>();
  documents.forEach((d, i) => {
    const id = versionId(d.documentId, d.versionId);
    column.set(id, i);
    versionRefs.set(id, { type: "version", documentId: d.documentId, versionId: d.versionId });
  });
  const evidenceById = new Map(evidence.map((e) => [e.evidenceId, e]));

  // Resolves an endpoint to a node id and its column, or null when it points at nothing.
  const resolve = (e: Endpoint): { id: string; column: number } | null => {
    if (e.type === "promise") return { id: PROMISE_ID, column: -1 };
    if (e.type === "version") {
      const id = versionId(e.documentId, e.versionId);
      const c = column.get(id);
      return c === undefined ? null : { id, column: c };
    }
    const ev = evidenceById.get(e.evidenceId);
    const c = ev ? column.get(versionId(ev.documentId, ev.versionId)) : undefined;
    return c === undefined ? null : { id: clauseId(e.evidenceId), column: c };
  };

  const placed = paths.flatMap((p) => {
    if (!model.paths[p.pathId]?.drawable) return [];
    const from = resolve(p.from);
    const to = resolve(p.to);
    return from && to ? [{ path: p, from, to }] : [];
  });

  // Chains: clause and promise endpoints joined by a path share one lane. A version endpoint
  // stays on the number track and joins nothing.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    return p === id ? id : find(p);
  };
  const isLaned = (id: string) => !id.startsWith("version:");
  for (const { from, to } of placed) {
    for (const r of [from, to]) if (isLaned(r.id) && !parent.has(r.id)) parent.set(r.id, r.id);
    if (isLaned(from.id) && isLaned(to.id)) parent.set(find(from.id), find(to.id));
  }
  const laneOfRoot = new Map<string, number>();
  const lanedNodes: { id: string; column: number; ref: Endpoint }[] = [];
  const seen = new Set<string>();
  for (const { path, from, to } of placed) {
    for (const [r, ref] of [[from, path.from], [to, path.to]] as const) {
      if (!isLaned(r.id) || seen.has(r.id)) continue;
      seen.add(r.id);
      lanedNodes.push({ id: r.id, column: r.column, ref });
      const root = find(r.id);
      if (!laneOfRoot.has(root)) laneOfRoot.set(root, laneOfRoot.size + 1);
    }
  }
  const lanes = laneOfRoot.size + 1;

  // Coordinates: the promise column (-1) exists only when a promise node does.
  const minColumn = lanedNodes.some((n) => n.id === PROMISE_ID) ? -1 : 0;
  const horizontal = options.orientation === "horizontal";
  const at = (col: number, laneOffset: number) => {
    const along = round2(PAD + (col - minColumn) * STEP);
    const across = round2(PAD + laneOffset * LANE);
    return horizontal ? { x: along, y: across } : { x: across, y: along };
  };

  const nodes: LayoutNode[] = [
    ...documents.map((d, i): LayoutNode => ({
      id: versionId(d.documentId, d.versionId),
      kind: "version",
      column: i,
      lane: 0,
      laneOffset: 0,
      ...at(i, 0),
      ref: versionRefs.get(versionId(d.documentId, d.versionId))!,
    })),
    ...lanedNodes.map((n): LayoutNode => {
      const lane = laneOfRoot.get(find(n.id))!;
      const isPromise = n.id === PROMISE_ID;
      // A promise node starts in its own lane; only clause nodes move out of lane 0.
      const laneOffset = isPromise ? lane : lane * reveal(s, n.column);
      return {
        id: n.id,
        kind: isPromise ? "promise" : "clause",
        column: n.column,
        lane,
        laneOffset,
        ...at(n.column, laneOffset),
        ref: n.ref,
      };
    }),
  ].sort((a, b) => a.column - b.column || a.lane - b.lane);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const connectors: LayoutConnector[] = [];
  const labels: LayoutLabel[] = [];
  for (const { path, from, to } of placed) {
    const a = byId.get(from.id)!;
    const b = byId.get(to.id)!;
    const status = model.paths[path.pathId]!.status;
    connectors.push({
      pathId: path.pathId,
      fromId: a.id,
      toId: b.id,
      kind: path.kind,
      status,
      pattern: LINE_PATTERN[path.kind],
      d: curve(a, b, horizontal),
    });
    const params: Record<string, string> = {};
    if (path.kind === "successor_document") params.documentId = documentIdOf(path.to, evidenceById);
    labels.push({
      pathId: path.pathId,
      kindKey: `kind.${path.kind}`,
      statusKey: status === "confirmed" ? null : `status.${status}`,
      params,
      x: round2((a.x + b.x) / 2),
      y: round2((a.y + b.y) / 2),
    });
  }

  const far = (col: number) => round2(PAD + (col - minColumn) * STEP + PAD);
  const long = far(Math.max(columns - 1, minColumn));
  const wide = round2(PAD * 2 + (lanes - 1) * LANE);
  return {
    orientation: options.orientation,
    columns,
    lanes,
    width: horizontal ? long : wide,
    height: horizontal ? wide : long,
    nodes,
    connectors,
    labels,
  };
}

function documentIdOf(e: Endpoint, evidenceById: Map<string, { documentId: string }>): string {
  if (e.type === "version") return e.documentId;
  if (e.type === "clause") return evidenceById.get(e.evidenceId)?.documentId ?? "";
  return "";
}

// A straight line when both ends share the cross coordinate, else an S-curve whose control
// points sit halfway along the reading direction.
function curve(a: LayoutNode, b: LayoutNode, horizontal: boolean): string {
  const m = (p: number, q: number) => round2((p + q) / 2);
  if (horizontal) {
    if (a.y === b.y) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const mx = m(a.x, b.x);
    return `M ${a.x} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }
  if (a.x === b.x) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const my = m(a.y, b.y);
  return `M ${a.x} ${a.y} C ${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y}`;
}
