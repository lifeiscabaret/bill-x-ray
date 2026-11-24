// scan-screen 9.1 and 9.3: orientation follows the screen width, both orientations give the
// same content, the Tab order is the one in the design, and the Reduce motion toggle sets
// data-motion on <html>. Layout positions are checked in layout.test.ts and labels.test.ts.
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/ui/App";
import { ScanView } from "../../src/ui/ScanView";
import type { Orientation } from "../../src/ui/layout";
import { WIDE_QUERY } from "../../src/ui/useOrientation";
import { differentNumberModel, sameNumberModel, scanModelArb } from "../helpers/scanModel";

const root = join(import.meta.dirname, "../..");
const read = (name: string) => readFileSync(join(root, "tests/fixtures/samples", `${name}.json`), "utf8");
const MODULES = { "a/us.json": read("us-116-hr748"), "a/kr.json": read("kr-semiconductor-special-act") };
const REFERENCE = "2026-11-24";

beforeEach(() => {
  delete document.documentElement.dataset.motion;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.motion;
});

/** A matchMedia that answers one width query and lets a test change the answer. */
function stubScreen(wide: boolean) {
  const listeners = new Set<() => void>();
  const asked: string[] = [];
  let matches = wide;
  vi.stubGlobal("matchMedia", (query: string) => {
    asked.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    };
  });
  return {
    asked,
    listeners,
    resize(nowWide: boolean) {
      matches = nowWide;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

const orientationOf = (c: HTMLElement) => c.querySelector<HTMLElement>(".nodes")?.dataset.orientation;

describe("orientation follows the screen width (9.1, D-014)", () => {
  it('asks matchMedia("(min-width: 720px)") and draws left to right when it matches', () => {
    const screenStub = stubScreen(true);
    const { container } = render(<ScanView model={sameNumberModel()} />);
    expect(WIDE_QUERY).toBe("(min-width: 720px)");
    expect(new Set(screenStub.asked)).toEqual(new Set(["(min-width: 720px)"]));
    expect(orientationOf(container)).toBe("horizontal");
  });

  it("draws top to bottom below 720 px and follows a change while the page is open", () => {
    const screenStub = stubScreen(false);
    const { container } = render(<ScanView model={sameNumberModel()} />);
    expect(orientationOf(container)).toBe("vertical");
    screenStub.resize(true);
    expect(orientationOf(container)).toBe("horizontal");
    screenStub.resize(false);
    expect(orientationOf(container)).toBe("vertical");
  });

  it("stops listening when the view goes away", () => {
    const screenStub = stubScreen(true);
    const { unmount } = render(<ScanView model={sameNumberModel()} />);
    expect(screenStub.listeners.size).toBe(1);
    unmount();
    expect(screenStub.listeners.size).toBe(0);
  });

  it("falls back to the wide layout where matchMedia does not exist", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { container } = render(<ScanView model={sameNumberModel()} />);
    expect(orientationOf(container)).toBe("horizontal");
  });

  it("puts the evidence panel after the scan in the page, so it sits below the scan on a narrow screen", async () => {
    stubScreen(false);
    const user = userEvent.setup();
    const { container } = render(<ScanView model={sameNumberModel()} />);
    await user.click(container.querySelector<HTMLElement>(".node")!);
    const parts = [...container.querySelector(".scan-view")!.children].map((e) => e.className);
    expect(parts).toEqual(["scan-view__main", "panel"]);
  });
});

/** What a viewer can read and reach: text, node ids, line ids and the kinds of control. */
function content(container: HTMLElement) {
  return {
    text: container.textContent,
    nodes: [...container.querySelectorAll<HTMLElement>("[data-node-id]")].map((e) => e.dataset.nodeId),
    labels: [...container.querySelectorAll<HTMLElement>(".label")].map((e) => `${e.dataset.pathId}|${e.getAttribute("aria-label")}|${e.textContent}`),
    lines: [...container.querySelectorAll<SVGElement>(".connector")].map((e) => `${e.dataset.pathId}|${e.dataset.pattern}|${e.dataset.status}`),
  };
}

function inBothOrientations(model: Parameters<typeof ScanView>[0]["model"]) {
  const out = {} as Record<Orientation, ReturnType<typeof content>>;
  for (const orientation of ["horizontal", "vertical"] as const) {
    const view = render(<ScanView model={model} orientation={orientation} />);
    expect(orientationOf(view.container)).toBe(orientation);
    out[orientation] = content(view.container);
    view.unmount();
  }
  return out;
}

describe("both orientations give the same content (9.3, D-014)", () => {
  it.each([
    ["same number", sameNumberModel],
    ["different number", differentNumberModel],
  ])("%s: same text, nodes, lines and labels", (_name, build) => {
    const { horizontal, vertical } = inBothOrientations(build());
    expect(horizontal.nodes.length).toBeGreaterThan(2);
    expect(horizontal.lines.length).toBeGreaterThan(1);
    expect(vertical).toEqual(horizontal);
  });

  it("holds for any model", () => {
    fc.assert(
      fc.property(scanModelArb, (model) => {
        const { horizontal, vertical } = inBothOrientations(model);
        expect(vertical).toEqual(horizontal);
      }),
      { numRuns: 25 },
    );
  }, 30_000);
});

describe("Tab order (9.3, design: Motion and focus)", () => {
  /** A short name for the element that has focus, by where it sits in the page. */
  function where(el: Element | null): string {
    if (!el) return "none";
    const h = el as HTMLElement;
    if (h.closest(".panel")) return `panel:${h.className || h.tagName.toLowerCase()}`;
    if (h.closest(".app__modes")) return "mode";
    if (h.closest(".app__options")) return "reduce-motion";
    if (h.classList.contains("scanner__range")) return "slider";
    if (h.closest(".scanner__buttons")) return "scanner-button";
    if (h.dataset.nodeId) return `node:${h.dataset.nodeId}`;
    if (h.classList.contains("label")) return `label:${h.dataset.pathId}`;
    if (h.classList.contains("not-drawn__open")) return "not-drawn";
    return `other:${h.tagName.toLowerCase()}.${h.className}`;
  }

  // Mode switcher, scanner, scanner buttons, nodes in reading order (column, then lane), path
  // labels, not-drawn list, panel. The "Reduce motion" toggle sits right after the mode buttons.
  const BEFORE_PANEL = [
    "mode", "mode", "mode",
    "reduce-motion",
    "slider",
    "scanner-button", "scanner-button", "scanner-button", "scanner-button",
    "node:version:Synthetic Bill 100#ih",
    "node:clause:syn-us-e1",
    "node:version:Synthetic Bill 100#enr",
    "node:version:Synthetic Law 7#law",
    "node:clause:syn-us-e2",
    "label:syn-us-p1",
    "label:syn-us-p2",
    "not-drawn",
  ];

  async function tabThrough(user: ReturnType<typeof userEvent.setup>, count: number) {
    const seen: string[] = [];
    for (let i = 0; i < count; i++) {
      await user.tab();
      seen.push(where(document.activeElement));
    }
    return seen;
  }

  it.each([true, false])("follows the design with the panel closed (wide screen: %s)", async (wide) => {
    stubScreen(wide);
    const user = userEvent.setup();
    render(<App modules={MODULES} referenceDate={REFERENCE} />);
    expect(await tabThrough(user, BEFORE_PANEL.length)).toEqual(BEFORE_PANEL);
  });

  it("ends in the panel when it is open, in either orientation", async () => {
    for (const wide of [true, false]) {
      stubScreen(wide);
      const user = userEvent.setup();
      const { container, unmount } = render(<App modules={MODULES} referenceDate={REFERENCE} />);
      await user.click(container.querySelector<HTMLElement>('[data-node-id="clause:syn-us-e1"]')!);
      const inPanel = container.querySelectorAll(
        '.panel :is(button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]))',
      ).length;
      expect(inPanel).toBeGreaterThan(1);
      (screen.getByRole("button", { name: "United States" }) as HTMLElement).focus();
      const seen = await tabThrough(user, BEFORE_PANEL.length - 1 + inPanel);
      expect(seen.slice(0, BEFORE_PANEL.length - 1)).toEqual(BEFORE_PANEL.slice(1));
      expect(seen.slice(BEFORE_PANEL.length - 1).every((s) => s.startsWith("panel:"))).toBe(true);
      unmount();
      cleanup();
    }
  });
});

describe("the Reduce motion toggle (9.2, 9.3)", () => {
  it("sets data-motion on <html> both ways", async () => {
    const user = userEvent.setup();
    render(<App modules={{}} referenceDate={REFERENCE} />);
    const toggle = screen.getByRole("button", { name: "Reduce motion" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.dataset.motion).toBe("full");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    await user.click(toggle);
    expect(document.documentElement.dataset.motion).toBe("full");
  });

  it("starts pressed when the operating system asks for reduced motion (main.tsx sets the attribute first)", () => {
    document.documentElement.dataset.motion = "reduce";
    render(<App modules={{}} referenceDate={REFERENCE} />);
    expect(screen.getByRole("button", { name: "Reduce motion" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.motion).toBe("reduce");
  });
});
