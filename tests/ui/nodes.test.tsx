import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DateView, LegislativeEvent, PathKind, PathStatus, ScanModel } from "../../src/contract/types";
import { EVENT_KINDS, PATH_KINDS } from "../../src/contract/types";
import { t } from "../../src/i18n/t";
import { ConnectorLayer, NODE_SIZE, boxSize } from "../../src/ui/ConnectorLayer";
import { NodeLayer, firstChars, type Selection } from "../../src/ui/NodeLayer";
import { LINE_PATTERN, layoutScan, type Orientation } from "../../src/ui/layout";
import {
  buildModel, clause, differentNumberModel, doc, evidenceRow, pathOf, sameNumberModel, scanModelArb, version,
} from "../helpers/scanModel";

afterEach(cleanup);

const RUNS = { numRuns: 200 };
const FULL = 99; // clamped to the number of columns: the scanner at its end

// Wording from ui-copy.md, written out here so the tests do not depend on en.json's own text.
const KIND_TEXT: Record<PathKind, string> = {
  next_version: "Same number, next version",
  successor_document: "Continued as {documentId}",
  carried: "Carried into a later version",
  transferred: "Transferred to another law",
  same_outcome_separate_law: "Same outcome, separate law",
  not_included: "Not found in this final version",
};
const STATUS_TEXT: Record<Exclude<PathStatus, "confirmed">, string> = {
  not_verified: "Not verified",
  omission_not_verified: "Omission not verified",
  evidence_missing: "Evidence missing",
};

function mount(model: ScanModel, orientation: Orientation = "horizontal", onSelect: (s: Selection) => void = () => {}) {
  const layout = layoutScan(model, { orientation, scanned: FULL });
  const { width, height } = boxSize(layout);
  const view = render(
    <div className="scan-box" style={{ width, height }}>
      <ConnectorLayer layout={layout} />
      <NodeLayer model={model} layout={layout} onSelect={onSelect} />
    </div>,
  );
  return { ...view, layout, model };
}

const connectorOf = (root: HTMLElement, pathId: string) => root.querySelector(`.connector[data-path-id="${pathId}"]`);
const labelOf = (root: HTMLElement, pathId: string) => root.querySelector<HTMLElement>(`.label[data-path-id="${pathId}"]`);

/** A synthetic model with one path of each kind between two clause rows, in one status. */
function oneOfEachKind(status: PathStatus): ScanModel {
  const paths = PATH_KINDS.map((kind, i) => {
    const id = `K${i}`;
    if (kind === "next_version") return pathOf(id, kind, version("D1", "a"), version("D1", "b"));
    if (kind === "successor_document") return pathOf(id, kind, version("D1", "b"), version("D2", "c"));
    if (kind === "not_included") return pathOf(id, kind, clause("E1"), version("D2", "c"));
    return pathOf(id, kind, clause("E1"), clause("E2"));
  });
  return buildModel({
    documents: [doc("D1", "a"), doc("D1", "b"), doc("D2", "c")],
    evidence: [evidenceRow("E1", "D1", "a"), evidenceRow("E2", "D2", "c")],
    paths,
    views: Object.fromEntries(paths.map((p) => [p.pathId, { status, drawable: true }])),
  });
}

describe("property 4: the screen shows the contract's status", () => {
  it("each label's status text equals the status of its path, for any model", () => {
    fc.assert(
      fc.property(scanModelArb, fc.constantFrom<Orientation>("horizontal", "vertical"), (model, orientation) => {
        const { container, layout, unmount } = mount(model, orientation);
        try {
          const drawn = layout.labels.filter((l) => model.paths[l.pathId]!.status !== "evidence_missing");
          const labels = [...container.querySelectorAll<HTMLElement>(".label")];
          expect(labels.map((l) => l.dataset.pathId)).toEqual(drawn.map((l) => l.pathId));
          for (const el of labels) {
            const status = model.paths[el.dataset.pathId!]!.status;
            const shown = el.querySelector(".label__status")?.textContent ?? null;
            if (status === "confirmed") expect(shown).toBeNull();
            else expect(shown).toBe(STATUS_TEXT[status]);
          }
        } finally {
          unmount();
        }
      }),
      RUNS,
    );
  }, 60_000);

  it("a confirmed path carries no status text and the filled marker only", () => {
    const { container } = mount(oneOfEachKind("confirmed"));
    for (const kind of PATH_KINDS) {
      const i = PATH_KINDS.indexOf(kind);
      expect(labelOf(container, `K${i}`)!.querySelector(".label__status")).toBeNull();
      expect(connectorOf(container, `K${i}`)!.querySelectorAll('[data-end="filled"]')).toHaveLength(1);
      expect(connectorOf(container, `K${i}`)!.querySelector('[data-end="hollow"]')).toBeNull();
    }
  });
});

describe("property 5: no meaning by colour alone", () => {
  it("every label has text and every connector has its kind's pattern class, for any model", () => {
    fc.assert(
      fc.property(scanModelArb, (model) => {
        const { container, layout, unmount } = mount(model);
        try {
          for (const c of layout.connectors) {
            const el = connectorOf(container, c.pathId);
            if (c.status === "evidence_missing") {
              expect(el).toBeNull();
              continue;
            }
            expect(el!.classList.contains(`connector--${LINE_PATTERN[c.kind]}`)).toBe(true);
            expect(el!.getAttribute("data-pattern")).toBe(LINE_PATTERN[c.kind]);
            const label = labelOf(container, c.pathId)!;
            expect(label.querySelector(".label__kind")!.textContent!.trim()).not.toBe("");
            expect(label.getAttribute("aria-label")!.trim()).not.toBe("");
          }
        } finally {
          unmount();
        }
      }),
      RUNS,
    );
  }, 60_000);

  it("shows each kind with its own text and its own pattern, in every status that is drawn", () => {
    const patterns = new Set<string>();
    for (const status of ["confirmed", "not_verified", "omission_not_verified"] as const) {
      const { container, unmount } = mount(oneOfEachKind(status));
      PATH_KINDS.forEach((kind, i) => {
        const text = labelOf(container, `K${i}`)!.querySelector(".label__kind")!.textContent;
        expect(text).toBe(KIND_TEXT[kind].replace("{documentId}", "D2"));
        patterns.add(connectorOf(container, `K${i}`)!.getAttribute("data-pattern")!);
      });
      unmount();
    }
    expect(patterns.size).toBe(PATH_KINDS.length);
  });

  it("styles.css has a rule for every line pattern", () => {
    const css = readFileSync(join(import.meta.dirname, "../../src/ui/styles.css"), "utf8");
    for (const pattern of new Set(Object.values(LINE_PATTERN))) {
      expect(css).toContain(`.connector--${pattern} .line`);
    }
  });

  it("gives each status its own end marker: filled, or hollow with a question mark", () => {
    for (const status of ["not_verified", "omission_not_verified"] as const) {
      const { container, unmount } = mount(oneOfEachKind(status));
      PATH_KINDS.forEach((_, i) => {
        const c = connectorOf(container, `K${i}`)!;
        expect(c.querySelectorAll('[data-end="hollow"]')).toHaveLength(1);
        expect(c.querySelector('[data-end="hollow"] text')!.textContent).toBe("?");
        expect(c.querySelector('[data-end="filled"]')).toBeNull();
      });
      unmount();
    }
  });

  it("never carries the confirmed marker on an unconfirmed path, for any model", () => {
    fc.assert(
      fc.property(scanModelArb, (model) => {
        const { container, layout, unmount } = mount(model);
        try {
          for (const c of layout.connectors) {
            if (c.status === "confirmed") continue;
            expect(connectorOf(container, c.pathId)?.querySelector('[data-end="filled"]') ?? null).toBeNull();
          }
        } finally {
          unmount();
        }
      }),
      RUNS,
    );
  }, 60_000);

  it("does not draw a path whose status is evidence missing, even if it is marked drawable", () => {
    const { container } = mount(oneOfEachKind("evidence_missing"));
    expect(container.querySelectorAll(".connector")).toHaveLength(0);
    expect(container.querySelectorAll(".label")).toHaveLength(0);
  });

  it("hides the SVG from assistive technology and keeps text out of it except the markers", () => {
    const { container } = mount(oneOfEachKind("not_verified"));
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    for (const text of svg.querySelectorAll("text")) expect(text.textContent).toBe("?");
  });
});

describe("strings", () => {
  it("has a string for every path kind, status, date kind and timing", () => {
    for (const k of PATH_KINDS) expect(t(`kind.${k}`, { documentId: "X" })).not.toBe("");
    for (const s of Object.keys(STATUS_TEXT)) expect(t(`status.${s}`)).toBe(STATUS_TEXT[s as keyof typeof STATUS_TEXT]);
    for (const k of EVENT_KINDS) expect(t(`dateKind.${k}`)).not.toBe("");
    for (const k of ["past", "scheduled", "too_coarse", "unknown"] as const) expect(t(`timing.${k}`)).not.toBe("");
    expect(t("kind.not_included")).toBe("Not found in this final version");
  });

  it("never turns the omission label into a verdict", () => {
    const text = JSON.stringify([t("kind.not_included"), t("status.omission_not_verified")]).toLowerCase();
    for (const word of ["abolish", "gone for good", "repealed", "killed"]) expect(text).not.toContain(word);
  });
});

function withDates(model: ScanModel, events: LegislativeEvent[]): ScanModel {
  // Stands in for the contract's date stage (not built yet): the timing follows the model's
  // own reference date, which every test fixes.
  const dates: Record<string, DateView> = {};
  for (const e of events) {
    dates[e.eventId] = { timing: e.eventDate > model.referenceDate ? "scheduled" : "past", conflictWith: [] };
  }
  return { ...model, case: { ...model.case, events }, dates };
}
const event = (eventId: string, eventKind: LegislativeEvent["eventKind"], eventDate: string, versionId = "a"): LegislativeEvent => ({
  eventId, documentId: "D1", versionId, eventKind, eventDate, evidenceRefs: [],
});
const nodeOf = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;

describe("version nodes", () => {
  const base = () =>
    buildModel({
      documents: [doc("D1", "a", { localEventLabel: "Introduced in House" }), doc("D1", "b")],
      paths: [pathOf("P", "next_version", version("D1", "a"), version("D1", "b"))],
    });

  it("shows the document id, the stage label and each date with its kind", () => {
    const model = withDates(base(), [event("e1", "introduced", "2025-05-01"), event("e2", "passed", "2025-09-02")]);
    const { container } = mount(model);
    const text = nodeOf(container, "version:D1#a").textContent!;
    expect(text).toContain("D1");
    expect(text).toContain("Introduced in House");
    expect(text).toContain("Introduced: 2025-05-01");
    expect(text).toContain("Passed: 2025-09-02");
    expect(text).not.toContain("Scheduled");
  });

  it("reads a future effective date as Scheduled, against a fixed reference date", () => {
    const model = withDates(base(), [event("e1", "effective", "2026-08-11"), event("e2", "applied", "2025-12-31")]);
    expect(model.referenceDate).toBe("2026-01-01");
    const text = nodeOf(mount(model).container, "version:D1#a").textContent!;
    expect(text).toContain("Effective: 2026-08-11 (Scheduled)");
    expect(text).toContain("Applied: 2025-12-31");
    expect(text).not.toContain("Applied: 2025-12-31 (");
  });

  it("reads a date the contract has not judged as Not verified, never as past", () => {
    const model = { ...withDates(base(), [event("e1", "effective", "2025-03-01")]), dates: {} };
    expect(nodeOf(mount(model).container, "version:D1#a").textContent).toContain("Effective: 2025-03-01 (Not verified)");
  });

  it("reads an unknown date value and a version with no date as Not verified", () => {
    const unknown = withDates(base(), [event("e1", "effective", "unknown")]);
    expect(nodeOf(mount(unknown).container, "version:D1#a").textContent).toContain("Effective: Not verified");
    cleanup();
    const none = base();
    expect(nodeOf(mount(none).container, "version:D1#b").textContent).toContain("Date: Not verified");
  });

  it("marks the stage label with the document's language", () => {
    const model = buildModel({ documents: [doc("D1", "a", { localEventLabel: "발의", language: "ko" })] });
    const el = nodeOf(mount(model).container, "version:D1#a").querySelector(".node__stage")!;
    expect(el.getAttribute("lang")).toBe("ko");
  });
});

describe("clause nodes", () => {
  it("shows the anchor and the first 60 characters of the excerpt, in the excerpt's language", () => {
    const long = "가".repeat(80);
    const model = buildModel({
      documents: [doc("D1", "a", { language: "ko" }), doc("D2", "b")],
      evidence: [evidenceRow("E1", "D1", "a", { anchor: "제15조", excerpt: long }), evidenceRow("E2", "D2", "b")],
      paths: [pathOf("P", "carried", clause("E1"), clause("E2"))],
    });
    const node = nodeOf(mount(model).container, "clause:E1");
    const text = node.querySelector(".node__text")!;
    expect(node.textContent).toContain("제15조");
    expect(text.textContent).toBe(`${"가".repeat(60)}…`);
    expect(text.getAttribute("lang")).toBe("ko");
  });

  it("counts characters, not UTF-16 units", () => {
    expect(Array.from(firstChars("😀".repeat(70))).length).toBe(61); // 60 + the ellipsis
    expect(firstChars("short")).toBe("short");
  });

  it("shows the fact sentence and no excerpt for news from another outlet (D-016)", () => {
    const model = buildModel({
      documents: [doc("D1", "a", { sourceKind: "news", ownOutlet: false, factSentence: "Our own sentence about the event." }), doc("D2", "b")],
      evidence: [evidenceRow("E1", "D1", "a", { excerpt: "VERBATIM TEXT OF ANOTHER OUTLET" }), evidenceRow("E2", "D2", "b")],
      paths: [pathOf("P", "carried", clause("E1"), clause("E2"))],
    });
    const node = nodeOf(mount(model).container, "clause:E1");
    expect(node.textContent).toContain("Our own sentence about the event.");
    expect(node.textContent).not.toContain("VERBATIM");
  });

  it("reads a missing excerpt or fact sentence as Not verified", () => {
    const model = buildModel({
      documents: [doc("D1", "a", { sourceKind: "news", ownOutlet: false }), doc("D2", "b")],
      evidence: [evidenceRow("E1", "D1", "a", { excerpt: "" }), evidenceRow("E2", "D2", "b", { excerpt: "" })],
      paths: [pathOf("P", "carried", clause("E1"), clause("E2"))],
    });
    const { container } = mount(model);
    expect(nodeOf(container, "clause:E1").querySelector(".node__text")!.textContent).toBe("Not verified");
    expect(nodeOf(container, "clause:E2").querySelector(".node__text")!.textContent).toBe("Not verified");
  });
});

describe("promise node", () => {
  it("is a button of its own kind with the statement cut to 60 characters", () => {
    const model = buildModel({
      documents: [doc("D1", "a")],
      evidence: [evidenceRow("E1", "D1", "a")],
      paths: [pathOf("P", "carried", { type: "promise" }, clause("E1"))],
      hasPromise: true,
    });
    const node = nodeOf(mount(model).container, "promise");
    expect(node.classList.contains("node--promise")).toBe(true);
    expect(node.textContent).toContain("Promise record");
    expect(node.textContent).toContain("Synthetic statement.");
  });
});

describe("path labels", () => {
  it("spell out the whole line in the accessible name", () => {
    const model = sameNumberModel();
    const { container } = mount(model);
    expect(labelOf(container, "SYN-P2")!.getAttribute("aria-label")).toBe(
      "Clause path from SYN-100 Sec. SYN-E1 to SYN-LAW-7 Sec. SYN-E2: Same outcome, separate law. Not verified",
    );
    expect(labelOf(container, "SYN-P1")!.getAttribute("aria-label")).toBe(
      "Number path from SYN-100 (ih) to SYN-100 (enr): Same number, next version. Not verified",
    );
  });

  it("names the successor document in its text", () => {
    const { container } = mount(differentNumberModel());
    expect(labelOf(container, "SYN-P2")!.querySelector(".label__kind")!.textContent).toBe("Continued as SYN-ACT-3");
    expect(labelOf(container, "SYN-P4")!.querySelector(".label__kind")!.textContent).toBe("Not found in this final version");
    expect(labelOf(container, "SYN-P4")!.querySelector(".label__status")!.textContent).toBe("Omission not verified");
    expect(labelOf(container, "SYN-P3")!.querySelector(".label__status")).toBeNull();
  });
});

describe("selection and focus order", () => {
  it("calls onSelect from a click and from Enter on a node and a label", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { container } = mount(sameNumberModel(), "horizontal", onSelect);
    await user.click(nodeOf(container, "version:SYN-100#ih"));
    expect(onSelect).toHaveBeenLastCalledWith({ type: "node", id: "version:SYN-100#ih", ref: { type: "version", documentId: "SYN-100", versionId: "ih" } });
    labelOf(container, "SYN-P2")!.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith({ type: "path", pathId: "SYN-P2" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("puts nodes in reading order before the path labels, in both orientations", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      const { container, layout, unmount } = mount(differentNumberModel(), orientation);
      const buttons = [...container.querySelectorAll("button")].map((b) => b.dataset.nodeId ?? `path:${b.dataset.pathId}`);
      expect(buttons).toEqual([...layout.nodes.map((n) => n.id), ...layout.labels.map((l) => `path:${l.pathId}`)]);
      unmount();
    }
  });

  it("keeps every node box inside the scan box", () => {
    for (const orientation of ["horizontal", "vertical"] as const) {
      const { layout, container, unmount } = mount(differentNumberModel(), orientation);
      const { width, height } = boxSize(layout);
      const size = NODE_SIZE[orientation];
      for (const el of container.querySelectorAll<HTMLElement>(".node")) {
        expect(parseFloat(el.style.left) - size.w / 2).toBeGreaterThanOrEqual(0);
        expect(parseFloat(el.style.top) - size.h / 2).toBeGreaterThanOrEqual(0);
        expect(parseFloat(el.style.left) + size.w / 2).toBeLessThanOrEqual(width);
        expect(parseFloat(el.style.top) + size.h / 2).toBeLessThanOrEqual(height);
      }
      unmount();
    }
  });

  it("renders the same texts in both orientations", () => {
    const text = (o: Orientation) => {
      const { container, unmount } = mount(sameNumberModel(), o);
      const out = [...container.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent);
      unmount();
      return out;
    };
    expect(text("vertical")).toEqual(text("horizontal"));
  });
});
