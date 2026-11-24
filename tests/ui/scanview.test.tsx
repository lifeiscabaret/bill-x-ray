import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { ScanModel } from "../../src/contract/types";
import { NEED_CODES } from "../../src/contract/types";
import { ScanView } from "../../src/ui/ScanView";
import { layoutScan } from "../../src/ui/layout";
import { buildModel, clause, doc, evidenceRow, pathOf, version } from "../helpers/scanModel";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.motion;
});

const OFFICIAL = "https://example.org/official/page";
const reduceMotion = () => {
  document.documentElement.dataset.motion = "reduce";
};

/**
 * Synthetic: one number on two versions, a separate law, a clause path to it, and a third path
 * with no evidence that the contract marks not drawable.
 */
function model(): ScanModel {
  return buildModel({
    caseId: "synthetic-scan-view",
    title: "Synthetic fixture: scan view",
    documents: [
      doc("SYN-100", "ih", { title: "Synthetic introduced text", publisher: "Synthetic Gazette", sourceKind: "official", sourceUrl: OFFICIAL }),
      doc("SYN-100", "enr", { title: "Synthetic enrolled text", publisher: "Synthetic Gazette", sourceKind: "official", sourceUrl: OFFICIAL }),
      doc("SYN-LAW-7", "law", { title: "Synthetic separate law", publisher: "Synthetic Gazette", sourceKind: "official", sourceUrl: OFFICIAL }),
    ],
    evidence: [
      evidenceRow("SYN-E1", "SYN-100", "ih", { anchor: "Sec. 9(a)", excerpt: "Synthetic first excerpt." }),
      evidenceRow("SYN-E2", "SYN-LAW-7", "law", { anchor: "Div. N Sec. 5", excerpt: "Synthetic second excerpt." }),
      evidenceRow("SYN-E3", "SYN-100", "enr", { anchor: "Sec. 12" }),
    ],
    paths: [
      pathOf("SYN-P1", "next_version", version("SYN-100", "ih"), version("SYN-100", "enr")),
      pathOf("SYN-P2", "same_outcome_separate_law", clause("SYN-E1"), clause("SYN-E2")),
      pathOf("SYN-P3", "carried", clause("SYN-E3"), clause("SYN-E2")),
    ],
    views: {
      "SYN-P3": { status: "evidence_missing", drawable: false, needs: [{ code: "add_clause_evidence" }, { code: "add_evidence" }] },
    },
  });
}

const COLUMNS = 3;

function mount(m: ScanModel = model()) {
  const view = render(<ScanView model={m} />);
  const box = view.container.querySelector<HTMLElement>(".scan-box")!;
  const range = screen.getByRole("slider", { name: "Scan the bill" }) as HTMLInputElement;
  const node = (id: string) => view.container.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
  const scanned = () => box.getAttribute("data-scanned");
  /** Where every node sits: the state of the scan, as the screen shows it. */
  const positions = () =>
    [...view.container.querySelectorAll<HTMLElement>(".node")].map((n) => `${n.dataset.nodeId}@${n.style.left},${n.style.top}`);
  return { ...view, box, range, node, scanned, positions, user: userEvent.setup() };
}

const button = (name: string) => screen.getByRole("button", { name });

describe("scanner: the split state by keyboard and by buttons", () => {
  it("starts with every clause node on the number line", () => {
    const { node } = mount();
    const line = node("version:SYN-100#ih").style.top;
    expect(node("clause:SYN-E1").style.top).toBe(line);
    expect(node("clause:SYN-E2").style.top).toBe(line);
  });

  it("reaches the split state with the arrow keys, Home and End", async () => {
    const { range, node, scanned, user } = mount();
    const line = node("version:SYN-100#ih").style.top;
    range.focus();
    for (let i = 0; i < COLUMNS; i++) await user.keyboard("{ArrowRight}");
    expect(range.value).toBe(String(COLUMNS));
    expect(scanned()).toBe(String(COLUMNS));
    expect(node("clause:SYN-E1").style.top).not.toBe(line);
    expect(node("clause:SYN-E2").style.top).not.toBe(line);

    await user.keyboard("{Home}");
    expect(range.value).toBe("0");
    expect(node("clause:SYN-E1").style.top).toBe(line);
    await user.keyboard("{End}");
    expect(range.value).toBe(String(COLUMNS));
    expect(node("clause:SYN-E2").style.top).not.toBe(line);

    await user.keyboard("{ArrowLeft}");
    expect(range.value).toBe(String(COLUMNS - 1));
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(range.value).toBe("0"); // does not go below the start
  });

  it("gives the same state with the buttons as with the keys, step by step", async () => {
    reduceMotion();
    const keys = mount();
    keys.range.focus();
    const byKeys = [keys.positions()];
    for (let i = 0; i < COLUMNS; i++) {
      await keys.user.keyboard("{ArrowRight}");
      byKeys.push(keys.positions());
    }
    cleanup();

    const buttons = mount();
    const byButtons = [buttons.positions()];
    for (let i = 0; i < COLUMNS; i++) {
      await buttons.user.click(button("Scan next version"));
      byButtons.push(buttons.positions());
    }
    expect(byButtons).toEqual(byKeys);
    // a step moves nodes only when the scanner passes a column that holds a clause node (the
    // columns 1 and 3 of this model: the clause nodes sit in columns 0 and 2)
    expect(new Set(byKeys.map((p) => p.join("|"))).size).toBe(3);

    await buttons.user.click(button("Back"));
    expect(buttons.positions()).toEqual(byKeys[COLUMNS - 1]);
    await buttons.user.click(button("Reset"));
    expect(buttons.positions()).toEqual(byKeys[0]);
    await buttons.user.click(button("Show all"));
    expect(buttons.positions()).toEqual(byKeys[COLUMNS]);
    expect(buttons.range.value).toBe(String(COLUMNS));
  });

  it("Show all ends in the split state: the clause node has left the number line", async () => {
    reduceMotion();
    const { node, user } = mount();
    await user.click(button("Show all"));
    expect(node("clause:SYN-E1").style.top).not.toBe(node("version:SYN-100#ih").style.top);
  });

  it("keeps the number line straight at every step while the clause line splits (D-013)", async () => {
    reduceMotion();
    const { container, node, user } = mount();
    const heights = (pathId: string) =>
      container.querySelector(`.connector[data-path-id="${pathId}"] path.line`)!.getAttribute("d")!.match(/-?[\d.]+/g)!.map(Number).filter((_, i) => i % 2 === 1);
    const numberLineAt = Math.max(...heights("SYN-P1"));
    expect(Math.max(...heights("SYN-P2"))).toBe(numberLineAt); // together before the scan
    for (let step = 0; step <= COLUMNS; step++) {
      const tops = ["version:SYN-100#ih", "version:SYN-100#enr", "version:SYN-LAW-7#law"].map((id) => node(id).style.top);
      expect(new Set(tops).size).toBe(1);
      const numberLine = container.querySelector(`.connector[data-path-id="SYN-P1"] path.line`)!.getAttribute("d")!;
      expect(numberLine).toMatch(/^M [\d. ]+ L [\d. ]+$/); // a straight segment, no curve
      if (step < COLUMNS) await user.click(button("Scan next version"));
    }
    // the number line did not move, and the clause line now runs in a lane of its own
    expect(Math.max(...heights("SYN-P1"))).toBe(numberLineAt);
    expect(Math.min(...heights("SYN-P2"))).toBeGreaterThan(numberLineAt);
  });

  it("names the versions scanned in aria-valuetext", async () => {
    const { range, user } = mount();
    expect(range.getAttribute("aria-valuetext")).toBe("No version scanned yet");
    range.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(range.getAttribute("aria-valuetext")).toBe("2 of 3 versions scanned: SYN-100 (ih), SYN-100 (enr)");
  });
});

describe("scanner: motion", () => {
  it("under reduced motion the buttons change the state at once", async () => {
    reduceMotion();
    const { scanned, user } = mount();
    await user.click(button("Show all"));
    expect(scanned()).toBe(String(COLUMNS)); // no frame has been waited for
    await user.click(button("Reset"));
    expect(scanned()).toBe("0");
  });

  it("otherwise the buttons glide: the state is in between, then arrives", async () => {
    const { scanned, range, user } = mount();
    await user.click(button("Show all"));
    expect(range.value).toBe(String(COLUMNS)); // the slider shows the target at once
    expect(Number(scanned())).toBeLessThan(COLUMNS); // the drawing has not caught up
    await waitFor(() => expect(scanned()).toBe(String(COLUMNS)), { timeout: 2000 });
  });

  it("dragging moves the value at once, with no glide", () => {
    const { range, scanned, node } = mount();
    fireEvent.change(range, { target: { value: "2" } });
    expect(scanned()).toBe("2");
    expect(node("clause:SYN-E1").style.top).not.toBe(node("version:SYN-100#ih").style.top);
  });

  it("a drag during a glide stops it", async () => {
    const { range, scanned, user } = mount();
    await user.click(button("Show all"));
    fireEvent.change(range, { target: { value: "1" } });
    expect(scanned()).toBe("1");
    await new Promise((r) => setTimeout(r, 600));
    expect(scanned()).toBe("1");
  });
});

describe("scan view: the evidence panel", () => {
  it("mounts the panel only while it is open", async () => {
    const { node, user } = mount();
    expect(screen.queryByRole("complementary")).toBeNull();
    node("clause:SYN-E1").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("complementary")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("Enter on a node opens the panel with title, publisher, anchor and link; Escape returns focus to the node", async () => {
    const { node, user } = mount();
    const opener = node("clause:SYN-E1");
    opener.focus();
    await user.keyboard("{Enter}");
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Synthetic introduced text")).toBeTruthy();
    expect(within(panel).getByText("Synthetic Gazette")).toBeTruthy();
    expect(within(panel).getByText("Sec. 9(a)")).toBeTruthy();
    expect(within(panel).getAllByRole("link")[0]!.getAttribute("href")).toBe(OFFICIAL);
    expect(document.activeElement).toBe(within(panel).getByRole("heading", { level: 2 }));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("a version node and a path label open the panel too", async () => {
    const { node, container, user } = mount();
    await user.click(node("version:SYN-LAW-7#law"));
    expect(within(screen.getByRole("complementary")).getByRole("heading", { level: 2 }).textContent).toBe("Synthetic separate law");
    await user.click(container.querySelector<HTMLElement>('.label[data-path-id="SYN-P2"]')!);
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByRole("heading", { level: 2 }).textContent).toBe("Same outcome, separate law");
  });

  it("Escape on the scanner closes the panel and leaves focus on the scanner", async () => {
    const { node, range, user } = mount();
    node("clause:SYN-E1").focus();
    await user.keyboard("{Enter}");
    range.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(range);
  });

  it("Escape on another node, on a scanner button or on the list also leaves focus alone", async () => {
    const { node, user } = mount();
    node("clause:SYN-E1").focus();
    await user.keyboard("{Enter}");
    const other = node("clause:SYN-E2");
    other.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(other);

    node("clause:SYN-E1").focus();
    await user.keyboard("{Enter}");
    button("Reset").focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(button("Reset"));
  });

  it("Escape with no panel open does nothing and the Close button returns focus to the opener", async () => {
    const { range, node, user } = mount();
    range.focus();
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(range);

    const opener = node("version:SYN-100#ih");
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe("not-drawn list", () => {
  it("lists the evidence-missing path with its status and needs, and draws nothing for it", () => {
    const { container } = mount();
    const item = container.querySelector<HTMLElement>('.not-drawn__item[data-path-id="SYN-P3"]')!;
    expect(item).toBeTruthy();
    expect(within(item).getByText("Evidence missing")).toBeTruthy();
    expect(within(item).getByText("Add the clause itself; a title or a number is not evidence")).toBeTruthy();
    expect(within(item).getByText("Add an evidence row")).toBeTruthy();
    // no line, no label, no node for it inside the scan
    const box = container.querySelector(".scan-box")!;
    expect(box.querySelector('[data-path-id="SYN-P3"]')).toBeNull();
    expect(container.querySelectorAll(".connector").length).toBe(2);
    expect(container.querySelectorAll(".label").length).toBe(2);
    expect(box.querySelector('[data-node-id="clause:SYN-E3"]')).toBeNull();
  });

  it("lists a path whose status is evidence missing even if it is marked drawable, and still draws no line", () => {
    const m = model();
    m.paths["SYN-P3"] = { ...m.paths["SYN-P3"]!, drawable: true };
    const { container } = mount(m);
    expect(container.querySelector('.not-drawn__item[data-path-id="SYN-P3"]')).toBeTruthy();
    expect(container.querySelector('.connector[data-path-id="SYN-P3"]')).toBeNull();
    expect(container.querySelector('.label[data-path-id="SYN-P3"]')).toBeNull();
  });

  it("opens the panel for a listed path, with its status and what is still needed", async () => {
    const { container, user } = mount();
    await user.click(within(container.querySelector<HTMLElement>('.not-drawn__item[data-path-id="SYN-P3"]')!).getByRole("button"));
    const panel = screen.getByRole("complementary");
    expect(within(panel).getByText("Still needed")).toBeTruthy();
    expect(within(panel).getByText("Evidence missing")).toBeTruthy();
  });

  it("writes every need code in words", () => {
    const m = model();
    m.paths["SYN-P3"] = { ...m.paths["SYN-P3"]!, needs: NEED_CODES.map((code) => ({ code })) };
    const { container } = mount(m);
    const item = container.querySelector<HTMLElement>('.not-drawn__item[data-path-id="SYN-P3"]')!;
    expect(item.querySelectorAll(".not-drawn__needs li").length).toBe(NEED_CODES.length);
    expect(item.textContent).not.toMatch(/need\./);
  });

  it("shows a record the contract removed from the paths as one generic line with its position", () => {
    const m = model();
    m.excluded = [
      { path: ["paths", 4], reason: "ref_unresolved" },
      { path: ["documents", 0], reason: "url_invalid" },
      { path: ["paths", 4, "from"], reason: "ref_unresolved" },
    ];
    const { container } = mount(m);
    const lines = [...container.querySelectorAll(".not-drawn__item--unread")].map((li) => li.textContent);
    // positions are 1-based; a document is not a path; only the removed record itself counts
    expect(lines).toEqual(["Path 5 in the input: not drawn, the input could not be read"]);
    expect(container.querySelector(".not-drawn")!.textContent).not.toMatch(/ref_unresolved|url_invalid/);
  });

  it("is absent when every path is drawn", () => {
    const m = model();
    m.paths["SYN-P3"] = { ...m.paths["SYN-P3"]!, drawable: true, status: "not_verified" };
    const { container } = mount(m);
    expect(container.querySelector(".not-drawn")).toBeNull();
  });
});

describe("scan view: order and slots", () => {
  it("keeps the DOM order of the design: scanner, buttons, nodes, labels, list, panel", async () => {
    const m = model();
    const { container, node, user } = mount(m);
    const expected = (() => {
      const layout = layoutScan(m, { orientation: "horizontal", scanned: COLUMNS });
      return [
        "range",
        "Scan next version", "Back", "Show all", "Reset",
        ...layout.nodes.map((n) => `node:${n.id}`),
        ...layout.labels.filter((l) => m.paths[l.pathId]?.status !== "evidence_missing").map((l) => `label:${l.pathId}`),
        "list:SYN-P3",
      ];
    })();
    const order = () =>
      [...container.querySelectorAll<HTMLElement>("button, input, a[href], [tabindex]:not([tabindex='-1'])")]
        .map((el) => {
          if (el.closest(".panel")) return "panel";
          if (el instanceof HTMLInputElement) return "range";
          if (el.classList.contains("node")) return `node:${el.dataset.nodeId}`;
          if (el.classList.contains("label")) return `label:${el.dataset.pathId}`;
          if (el.classList.contains("not-drawn__open")) return `list:${el.closest<HTMLElement>("[data-path-id]")!.dataset.pathId}`;
          return el.textContent ?? "";
        })
        .filter((token, i, all) => token !== all[i - 1]);
    expect(order()).toEqual(expected);

    await user.click(node("version:SYN-100#ih"));
    expect(order()).toEqual([...expected, "panel"]);
  });

  it("puts a comparison strip between the scanner and the scan, and has none by default", () => {
    const { container } = mount();
    expect(container.querySelector(".scan-view__comparison")).toBeNull();
    cleanup();
    const view = render(<ScanView model={model()} comparison={<p>Synthetic strip</p>} />);
    const strip = view.container.querySelector(".scan-view__comparison")!;
    expect(strip.textContent).toBe("Synthetic strip");
    // the scan box sits in its scroll box (scan-screen 9), which is what follows the strip
    expect(strip.nextElementSibling?.classList.contains("scan-scroll")).toBe(true);
    expect(strip.nextElementSibling?.firstElementChild?.classList.contains("scan-box")).toBe(true);
    expect(strip.previousElementSibling?.classList.contains("scanner")).toBe(true);
  });

  it("sizes the scan box to its layers and keeps both inside it", () => {
    const { box } = mount();
    expect(box.style.width).not.toBe("");
    expect(box.querySelector("svg.connectors")).toBeTruthy();
    expect(box.querySelector(".nodes")).toBeTruthy();
  });

  it("draws the vertical layout from the same model when asked", () => {
    const view = render(<ScanView model={model()} orientation="vertical" />);
    expect(view.container.querySelector('.nodes[data-orientation="vertical"]')).toBeTruthy();
    expect(view.container.querySelectorAll(".node").length).toBe(5);
  });
});
