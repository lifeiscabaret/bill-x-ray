// scan-screen 9, known defect from scan-screen 6: at the start of the scan, the label of a line
// that skips a column sat on the middle version node (hiding its name) and on top of the next
// label. Labels now sit in the gap between two columns, never on a column.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LANE, PAD, STEP, layoutScan, type Orientation, type ScanLayout } from "../../src/ui/layout";
import { buildModel, clause, doc, evidenceRow, pathOf, sameNumberModel, scanModelArb, version } from "../helpers/scanModel";

const along = (o: Orientation, p: { x: number; y: number }) => (o === "horizontal" ? p.x : p.y);
const across = (o: Orientation, p: { x: number; y: number }) => (o === "horizontal" ? p.y : p.x);

/** Column position of a coordinate along the reading direction (0 for the first version). */
const columnOf = (l: ScanLayout, p: { x: number; y: number }) => (along(l.orientation, p) - PAD) / STEP;

describe("labels sit in the gap between two columns", () => {
  for (const orientation of ["horizontal", "vertical"] as const) {
    describe(orientation, () => {
      const at = (scanned: number) => layoutScan(sameNumberModel(), { orientation, scanned });

      it("at the start of the scan the two labels are in different gaps and neither is on a version node", () => {
        const l = at(0);
        const [p1, p2] = l.labels;
        expect(l.labels.map((x) => x.pathId)).toEqual(["SYN-P1", "SYN-P2"]);
        expect(columnOf(l, p1!)).toBeCloseTo(0.5);
        expect(columnOf(l, p2!)).toBeCloseTo(1.5);
        const versionColumns = l.nodes.filter((n) => n.kind === "version").map((n) => columnOf(l, n));
        for (const label of l.labels) {
          for (const c of versionColumns) expect(Math.abs(columnOf(l, label) - c)).toBeGreaterThanOrEqual(0.5 - 1e-9);
        }
      });

      it("the label of a line between neighbours stays at its midpoint", () => {
        const l = at(3);
        const a = l.nodes.find((n) => n.id === "version:SYN-100#ih")!;
        const b = l.nodes.find((n) => n.id === "version:SYN-100#enr")!;
        const p1 = l.labels[0]!;
        expect(along(orientation, p1)).toBeCloseTo((along(orientation, a) + along(orientation, b)) / 2);
        expect(across(orientation, p1)).toBeCloseTo(across(orientation, a));
      });

      it("a label follows its line to the clause lane as the scanner moves on", () => {
        const l = at(3);
        const p2 = l.labels[1]!;
        expect(across(orientation, p2)).toBeCloseTo(PAD + LANE); // both ends are in lane 1 at the end
        const mid = at(1.5);
        // the line leaves the number track on its way to the lane: the label is between the two
        expect(across(orientation, mid.labels[1]!)).toBeGreaterThan(PAD);
        expect(across(orientation, mid.labels[1]!)).toBeLessThan(PAD + LANE);
      });
    });
  }

  it("a line that skips an even number of columns uses the later gap on a tie", () => {
    const model = buildModel({
      documents: [doc("A", "a"), doc("B", "b"), doc("C", "c"), doc("D", "d"), doc("E", "e")],
      evidence: [evidenceRow("E1", "A", "a"), evidenceRow("E2", "E", "e")],
      paths: [pathOf("P1", "same_outcome_separate_law", clause("E1"), clause("E2"))],
    });
    const l = layoutScan(model, { orientation: "horizontal", scanned: 0 });
    expect(columnOf(l, l.labels[0]!)).toBeCloseTo(2.5);
  });

  it("two lines in the same gap and on the same lane use the next nearest gap", () => {
    const model = buildModel({
      documents: [doc("A", "a"), doc("B", "b"), doc("C", "c")],
      evidence: [evidenceRow("E1", "A", "a"), evidenceRow("E2", "C", "c"), evidenceRow("E3", "A", "a"), evidenceRow("E4", "C", "c")],
      paths: [
        pathOf("P1", "carried", clause("E1"), clause("E2")),
        pathOf("P2", "carried", clause("E3"), clause("E4")),
      ],
    });
    const l = layoutScan(model, { orientation: "horizontal", scanned: 0 });
    expect(l.labels.map((x) => columnOf(l, x))).toEqual([expect.closeTo(1.5), expect.closeTo(0.5)]);
  });

  it("for any model and scanner value, a label of a line across columns is never on a column", () => {
    fc.assert(
      fc.property(scanModelArb, fc.double({ min: 0, max: 8, noNaN: true }), fc.constantFrom<Orientation>("horizontal", "vertical"), (model, scanned, orientation) => {
        const l = layoutScan(model, { orientation, scanned });
        const nodes = new Map(l.nodes.map((n) => [n.id, n]));
        const hasPromise = l.nodes.some((n) => n.kind === "promise");
        const first = hasPromise ? -1 : 0;
        for (const c of l.connectors) {
          const a = nodes.get(c.fromId)!;
          const b = nodes.get(c.toId)!;
          const label = l.labels.find((x) => x.pathId === c.pathId)!;
          const col = (along(orientation, label) - PAD) / STEP + first;
          if (a.column === b.column) expect(col).toBeCloseTo(a.column);
          else {
            // a gap centre: k + 0.5, between the two ends
            expect(Math.abs(col - Math.round(col))).toBeCloseTo(0.5);
            expect(col).toBeGreaterThan(Math.min(a.column, b.column));
            expect(col).toBeLessThan(Math.max(a.column, b.column));
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("the label of every drawable path is still there, once, in both orientations", () => {
    fc.assert(
      fc.property(scanModelArb, fc.double({ min: 0, max: 8, noNaN: true }), (model, scanned) => {
        const h = layoutScan(model, { orientation: "horizontal", scanned });
        const v = layoutScan(model, { orientation: "vertical", scanned });
        expect(v.labels.map((x) => x.pathId)).toEqual(h.labels.map((x) => x.pathId));
        expect(h.labels.map((x) => x.pathId)).toEqual(h.connectors.map((x) => x.pathId));
        for (const [i, label] of h.labels.entries()) {
          // the vertical layout is the horizontal one with its axes swapped
          expect(v.labels[i]).toMatchObject({ x: label.y, y: label.x });
        }
      }),
      { numRuns: 100 },
    );
  });
});

// A line from a version to a clause in the same column keeps its midpoint (no gap to choose).
describe("a line inside one column", () => {
  it("keeps the midpoint", () => {
    const model = buildModel({
      documents: [doc("A", "a"), doc("B", "b")],
      evidence: [evidenceRow("E1", "A", "a")],
      paths: [pathOf("P1", "carried", version("A", "a"), clause("E1"))],
    });
    const l = layoutScan(model, { orientation: "horizontal", scanned: 2 });
    const a = l.nodes.find((n) => n.id === "version:A#a")!;
    const e = l.nodes.find((n) => n.id === "clause:E1")!;
    expect(l.labels[0]).toMatchObject({ x: a.x, y: (a.y + e.y) / 2 });
  });
});
