import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  LANE, LINE_PATTERN, NARROW_BELOW_PX, PAD, STEP, layoutScan, orientationForWidth, reveal,
  type LayoutNode, type ScanLayout,
} from "../../src/ui/layout";
import {
  buildModel, clause, differentNumberModel, doc, evidenceRow, pathOf, promise, sameNumberModel,
  scanModelArb,
} from "../helpers/scanModel";

const RUNS = { numRuns: 200 };
const node = (l: ScanLayout, id: string): LayoutNode => {
  const n = l.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};
const clauseNodes = (l: ScanLayout) => l.nodes.filter((n) => n.kind === "clause");

describe("orientation and reveal", () => {
  it("is horizontal from 720 px up and vertical below (D-014)", () => {
    expect(NARROW_BELOW_PX).toBe(720);
    expect(orientationForWidth(720)).toBe("horizontal");
    expect(orientationForWidth(719)).toBe("vertical");
    expect(orientationForWidth(360)).toBe("vertical");
  });

  it("reveal is clamp(s - c, 0, 1)", () => {
    expect(reveal(0, 2)).toBe(0);
    expect(reveal(2.5, 2)).toBe(0.5);
    expect(reveal(3, 2)).toBe(1);
    expect(reveal(9, 2)).toBe(1);
    expect(reveal(0, -1)).toBe(1);
  });
});

describe("same-number model (example expectations)", () => {
  const model = sameNumberModel();
  const at = (scanned: number, orientation: "horizontal" | "vertical" = "horizontal") =>
    layoutScan(model, { orientation, scanned });

  it("has one column per version in file order and two lanes", () => {
    const l = at(0);
    expect(l.columns).toBe(3);
    expect(l.lanes).toBe(2);
    expect(l.nodes.filter((n) => n.kind === "version").map((n) => n.id)).toEqual([
      "version:SYN-100#ih", "version:SYN-100#enr", "version:SYN-LAW-7#law",
    ]);
  });

  it("draws the drawable paths only, and puts no node on the one that is not drawn", () => {
    const l = at(1);
    expect(l.connectors.map((c) => c.pathId)).toEqual(["SYN-P1", "SYN-P2"]);
    expect(l.labels.map((x) => x.pathId)).toEqual(["SYN-P1", "SYN-P2"]);
    expect(l.nodes.some((n) => n.id === "clause:SYN-E3")).toBe(false);
  });

  it("keeps the clause nodes on the number line at 0 and splits them at the end", () => {
    const start = at(0);
    const numberY = node(start, "version:SYN-100#ih").y;
    expect(node(start, "clause:SYN-E1").y).toBe(numberY);
    expect(node(start, "clause:SYN-E2").y).toBe(numberY);
    const end = at(3);
    expect(node(end, "clause:SYN-E1")).toMatchObject({ lane: 1, laneOffset: 1, y: PAD + LANE });
    expect(node(end, "clause:SYN-E2")).toMatchObject({ lane: 1, laneOffset: 1, y: PAD + LANE });
    expect(node(end, "version:SYN-100#ih").y).toBe(numberY);
  });

  it("moves a node out only once the scanner has reached its column", () => {
    const mid = at(1.5);
    expect(node(mid, "clause:SYN-E1").laneOffset).toBe(1); // column 0 is fully passed
    expect(node(mid, "clause:SYN-E2").laneOffset).toBe(0); // column 2 is not reached
    expect(node(at(2.5), "clause:SYN-E2").laneOffset).toBe(0.5);
  });

  it("labels each drawn path with keys and no text of its own", () => {
    const l = at(0);
    expect(l.labels[0]).toMatchObject({ kindKey: "kind.next_version", statusKey: "status.not_verified", params: {} });
    expect(l.labels[1]).toMatchObject({ kindKey: "kind.same_outcome_separate_law", statusKey: "status.not_verified" });
    expect(l.connectors[1]).toMatchObject({ pattern: LINE_PATTERN.same_outcome_separate_law, fromId: "clause:SYN-E1", toId: "clause:SYN-E2" });
  });

  it("vertical swaps the axes: versions top to bottom, lanes left to right", () => {
    const h = at(3);
    const v = at(3, "vertical");
    for (const n of h.nodes) {
      expect(node(v, n.id)).toMatchObject({ x: n.y, y: n.x });
    }
    expect([v.width, v.height]).toEqual([h.height, h.width]);
    expect(node(v, "version:SYN-100#enr").y).toBe(PAD + STEP);
  });

  it("straight line on one lane, curve between lanes", () => {
    expect(at(0).connectors[1]!.d).toMatch(/^M [\d.]+ [\d.]+ L /);
    expect(at(3).connectors[1]!.d).toMatch(/^M [\d.]+ [\d.]+ L /); // both ends in lane 1
    expect(at(0).connectors[0]!.d).toMatch(/ L /);
  });
});

describe("different-number model (example expectations)", () => {
  const model = differentNumberModel();
  const end = layoutScan(model, { orientation: "horizontal", scanned: 3 });

  it("gives each chain its own lane in order of first appearance", () => {
    expect(end.lanes).toBe(3);
    expect(node(end, "clause:SYN-E1").lane).toBe(1);
    expect(node(end, "clause:SYN-E2").lane).toBe(1);
    expect(node(end, "clause:SYN-E3").lane).toBe(2);
  });

  it("keeps the number line straight and ends the not-included path on the final version", () => {
    const versions = end.nodes.filter((n) => n.kind === "version");
    expect(new Set(versions.map((n) => n.y)).size).toBe(1);
    const c = end.connectors.find((x) => x.pathId === "SYN-P4")!;
    expect(c).toMatchObject({ pattern: "dotted_open_end", toId: "version:SYN-ACT-3#promulgated" });
    expect(node(end, c.toId).lane).toBe(0);
  });

  it("names the continuing document and omits status text for a confirmed path", () => {
    const byId = Object.fromEntries(end.labels.map((x) => [x.pathId, x]));
    expect(byId["SYN-P1"]).toMatchObject({ kindKey: "kind.successor_document", params: { documentId: "SYN-ALT-2" } });
    expect(byId["SYN-P3"]!.statusKey).toBeNull();
    expect(byId["SYN-P4"]!.statusKey).toBe("status.omission_not_verified");
  });
});

describe("promise node", () => {
  const model = buildModel({
    documents: [doc("SYN-1", "a"), doc("SYN-2", "b")],
    evidence: [evidenceRow("SYN-E1", "SYN-2", "b")],
    paths: [pathOf("SYN-P1", "carried", promise, clause("SYN-E1"))],
    hasPromise: true,
  });

  it("starts in its own lane, before the first column", () => {
    const l = layoutScan(model, { orientation: "horizontal", scanned: 0 });
    expect(node(l, "promise")).toMatchObject({ kind: "promise", column: -1, lane: 1, laneOffset: 1, x: PAD });
    expect(node(l, "version:SYN-1#a").x).toBe(PAD + STEP);
    expect(node(l, "clause:SYN-E1").laneOffset).toBe(0);
  });
});

describe("property 1: drawn lines match drawable paths", () => {
  it("one connector and one label per drawable path, none for the others", () => {
    fc.assert(
      fc.property(scanModelArb, fc.double({ min: 0, max: 9, noNaN: true }), fc.constantFrom("horizontal", "vertical"), (model, scanned, orientation) => {
        const l = layoutScan(model, { orientation, scanned });
        const drawable = model.case.paths.filter((p) => model.paths[p.pathId]!.drawable).map((p) => p.pathId);
        expect(l.connectors.map((c) => c.pathId).sort()).toEqual([...drawable].sort());
        expect(l.labels.map((x) => x.pathId).sort()).toEqual([...drawable].sort());
      }),
      RUNS,
    );
  });
});

describe("property 2: same content in both orientations", () => {
  it("same node ids, connector ids and label texts", () => {
    fc.assert(
      fc.property(scanModelArb, fc.double({ min: 0, max: 9, noNaN: true }), (model, scanned) => {
        const h = layoutScan(model, { orientation: "horizontal", scanned });
        const v = layoutScan(model, { orientation: "vertical", scanned });
        expect(v.nodes.map((n) => n.id)).toEqual(h.nodes.map((n) => n.id));
        expect(v.connectors.map((c) => c.pathId)).toEqual(h.connectors.map((c) => c.pathId));
        const text = (l: ScanLayout) => l.labels.map(({ pathId, kindKey, statusKey, params }) => ({ pathId, kindKey, statusKey, params }));
        expect(text(v)).toEqual(text(h));
        expect(v.nodes.map((n) => n.laneOffset)).toEqual(h.nodes.map((n) => n.laneOffset));
      }),
      RUNS,
    );
  });
});

describe("property 3: the scanner splits monotonically", () => {
  it("never moves a clause node back toward lane 0", () => {
    fc.assert(
      fc.property(scanModelArb, fc.double({ min: 0, max: 9, noNaN: true }), fc.double({ min: 0, max: 9, noNaN: true }), (model, a, b) => {
        const [s1, s2] = a <= b ? [a, b] : [b, a];
        const early = layoutScan(model, { orientation: "horizontal", scanned: s1 });
        const late = layoutScan(model, { orientation: "horizontal", scanned: s2 });
        for (const n of clauseNodes(early)) {
          expect(node(late, n.id).laneOffset).toBeGreaterThanOrEqual(n.laneOffset);
        }
      }),
      RUNS,
    );
  });

  it("puts every clause node on lane 0 at 0 and in its own lane at the end", () => {
    fc.assert(
      fc.property(scanModelArb, (model) => {
        const start = layoutScan(model, { orientation: "horizontal", scanned: 0 });
        for (const n of clauseNodes(start)) expect(n.laneOffset).toBe(0);
        const end = layoutScan(model, { orientation: "horizontal", scanned: start.columns });
        for (const n of clauseNodes(end)) {
          expect(n.lane).toBeGreaterThanOrEqual(1);
          expect(n.laneOffset).toBe(n.lane);
        }
      }),
      RUNS,
    );
  });
});
