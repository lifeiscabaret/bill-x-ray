import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEED_CODES } from "../../src/contract/types";
import en from "../../src/i18n/en.json";
import { t } from "../../src/i18n/t";
import { App, localToday } from "../../src/ui/App";
import { ErrorBoundary } from "../../src/ui/ErrorBoundary";
import { SAMPLE_IDS, bundledModules, loadSamples, type RawModules } from "../../src/ui/samples";

const root = join(import.meta.dirname, "../..");
const read = (name: string) => readFileSync(join(root, "tests/fixtures/samples", `${name}.json`), "utf8");
const US = "us-116-hr748";
const KR = "kr-semiconductor-special-act";
const BOTH: RawModules = { "a/us.json": read(US), "a/kr.json": read(KR) };
const ONLY_US: RawModules = { "a/us.json": read(US) };
const ONLY_KR: RawModules = { "a/kr.json": read(KR) };
const REFERENCE = "2026-11-24";

beforeEach(() => {
  delete document.documentElement.dataset.motion;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mode = (name: string) => screen.queryByRole("button", { name });
const heading = () => screen.getByRole("heading", { level: 1 });
const scanBoxes = (c: HTMLElement) => c.querySelectorAll(".scan-box");

describe("first scene", () => {
  it("opens on the US sample with the heading and the tagline", () => {
    const { container } = render(<App modules={BOTH} referenceDate={REFERENCE} />);
    expect(heading().textContent).toBe("Same number. Different body.");
    expect(screen.getByText("Follow the clause, not just the bill number.")).toBeTruthy();
    expect(mode("United States")!.getAttribute("aria-pressed")).toBe("true");
    expect(mode("Korea")!.getAttribute("aria-pressed")).toBe("false");
    expect(mode("Scan your own bill")!.getAttribute("aria-pressed")).toBe("false");
    expect(scanBoxes(container).length).toBe(1);
    expect(container.querySelector(".app__case")!.textContent).toBe("Synthetic fixture: same number, different body");
  });

  it("with no sample opens on Scan your own bill and keeps the heading and the tagline (D-020, D-015)", () => {
    const { container } = render(<App modules={{}} referenceDate={REFERENCE} />);
    expect(heading().textContent).toBe("Same number. Different body.");
    expect(screen.getByText("Follow the clause, not just the bill number.")).toBeTruthy();
    expect(mode("Scan your own bill")!.getAttribute("aria-pressed")).toBe("true");
    expect(mode("United States")).toBeNull();
    expect(mode("Korea")).toBeNull();
    expect(scanBoxes(container).length).toBe(0);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Scan your own bill");
  });

  it("with only the US sample the Korea button is absent", () => {
    render(<App modules={ONLY_US} referenceDate={REFERENCE} />);
    expect(mode("United States")).toBeTruthy();
    expect(mode("Korea")).toBeNull();
    expect(mode("Scan your own bill")).toBeTruthy();
  });

  it("with only the Korean sample the US button is absent and the app opens on Korea", () => {
    const { container } = render(<App modules={ONLY_KR} referenceDate={REFERENCE} />);
    expect(mode("United States")).toBeNull();
    expect(mode("Korea")!.getAttribute("aria-pressed")).toBe("true");
    expect(scanBoxes(container).length).toBe(1);
  });

  it("ignores a file with an unknown case id, one that is not JSON, and a second file for the same id", () => {
    const other = JSON.stringify({ ...JSON.parse(read(US)), caseId: "some-other-case" });
    const dup = JSON.stringify({ ...JSON.parse(read(US)), title: "Second file" });
    const samples = loadSamples(
      { "z/dup.json": dup, "b/other.json": other, "c/broken.json": "{ not json", "a/us.json": read(US) },
      REFERENCE,
    );
    expect(samples.map((s) => [s.caseId, s.file])).toEqual([[US, "a/us.json"]]);
  });

  it("renders both samples through the same components", async () => {
    const user = userEvent.setup();
    const { container } = render(<App modules={BOTH} referenceDate={REFERENCE} />);
    const shape = () => [".scanner", ".scan-box svg.connectors", ".scan-box .nodes", ".node", ".label", ".not-drawn"].map((s) => container.querySelectorAll(s).length > 0);
    expect(shape()).toEqual([true, true, true, true, true, true]); // the US fixture has an evidence-missing path
    await user.click(mode("Korea")!);
    expect(container.querySelector(".app__case")!.textContent).toBe("Synthetic fixture: different number");
    expect(shape().slice(0, 5)).toEqual([true, true, true, true, true]);
    await user.click(mode("United States")!);
    expect(container.querySelector(".app__case")!.textContent).toBe("Synthetic fixture: same number, different body");
  });

  it("starts the scanner afresh when the case changes", async () => {
    const user = userEvent.setup();
    render(<App modules={BOTH} referenceDate={REFERENCE} />);
    const range = () => screen.getByRole("slider", { name: "Scan the bill" }) as HTMLInputElement;
    fireEvent.change(range(), { target: { value: "2" } });
    expect(range().value).toBe("2");
    await user.click(mode("Korea")!);
    expect(range().value).toBe("0");
    await user.click(mode("United States")!);
    expect(range().value).toBe("0");
  });

  it("reads dates against the reference date it is given", () => {
    const { rerender } = render(<App modules={ONLY_US} referenceDate="2026-11-24" />);
    expect(screen.getByText(/Effective: 2999-01-01 \(Scheduled\)/)).toBeTruthy();
    rerender(<App modules={ONLY_US} referenceDate="3000-01-01" />);
    expect(screen.queryByText(/Scheduled/)).toBeNull();
  });
});

describe("a sample that did not pass its checks", () => {
  it("shows its issue list under the title and no scan", () => {
    const broken = JSON.parse(read(US));
    broken.documents[0].title = "";
    const { container } = render(<App modules={{ "a/us.json": JSON.stringify(broken) }} referenceDate={REFERENCE} />);
    expect(mode("United States")!.getAttribute("aria-pressed")).toBe("true"); // the sample loaded: its button exists
    const section = screen.getByRole("heading", { level: 2, name: "This sample did not pass its checks" }).closest("section")!;
    const lines = within(section).getAllByRole("listitem");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.textContent).toContain("documents[0]"); // the JSON path of the broken field
    expect(scanBoxes(container).length).toBe(0);
  });

  it("lists block issues only: a warning alone leaves the scan in place", () => {
    const warned = JSON.parse(read(US));
    warned.documents[0].sourceUrl = "https://example.org/synthetic;jsessionid=ABC123";
    const samples = loadSamples({ "a/us.json": JSON.stringify(warned) }, REFERENCE);
    expect(samples[0]!.issues.some((i) => i.severity === "warn")).toBe(true);
    expect(samples[0]!.blocked).toBe(false);
  });
});

describe("app shell", () => {
  it("puts the mode switcher first in the tab order, then the motion toggle, then the scanner", () => {
    const { container } = render(<App modules={BOTH} referenceDate={REFERENCE} />);
    const order = [...container.querySelectorAll<HTMLElement>("button, input, a[href], [tabindex]:not([tabindex='-1'])")].map(
      (el) => (el instanceof HTMLInputElement ? "range" : (el.textContent ?? "")),
    );
    expect(order.slice(0, 5)).toEqual(["United States", "Korea", "Scan your own bill", "Reduce motion", "range"]);
  });

  it("sets data-motion on the root element from the Reduce motion toggle", async () => {
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

  it("starts pressed when the page already asks for reduced motion", () => {
    document.documentElement.dataset.motion = "reduce";
    render(<App modules={{}} referenceDate={REFERENCE} />);
    expect(screen.getByRole("button", { name: "Reduce motion" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.motion).toBe("reduce");
  });

  it("takes today's local date, not the UTC date, as the reference date", () => {
    expect(localToday(new Date(2026, 10, 24, 23, 59))).toBe("2026-11-24");
    expect(localToday(new Date(2027, 0, 5, 0, 1))).toBe("2027-01-05");
  });

  it("makes no network request in any mode", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const wsSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", wsSpy);
    render(<App modules={BOTH} referenceDate={REFERENCE} />);
    for (const name of ["Korea", "Scan your own bill", "United States"]) {
      await user.click(mode(name)!);
      const next = screen.queryByRole("button", { name: "Show all" });
      if (next) await user.click(next);
    }
    await user.click(screen.getByRole("button", { name: "Reduce motion" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(wsSpy).not.toHaveBeenCalled();
  });
});

describe("error boundary", () => {
  function Boom(): never {
    throw new Error("synthetic failure while rendering");
  }

  it("shows one sentence instead of the case, and leaves what is outside it working", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <button type="button">Outside</button>
        <ErrorBoundary key="a">
          <Boom />
        </ErrorBoundary>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong reading this case");
    await user.click(screen.getByRole("button", { name: "Outside" })); // still works
    rerender(
      <>
        <button type="button">Outside</button>
        <ErrorBoundary key="b">
          <p>Fine</p>
        </ErrorBoundary>
      </>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Fine")).toBeTruthy();
  });
});

describe("strings and sources", () => {
  it("has a sentence for every need code, in the need group", () => {
    for (const code of NEED_CODES) expect(t(`need.${code}`)).not.toBe("");
    expect(Object.keys(en.need).sort()).toEqual([...NEED_CODES].sort());
  });

  it("reads the bundled cases from data/cases/, one entry per file, as raw text", () => {
    const dir = join(root, "data/cases");
    const files = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")) : [];
    expect(Object.keys(bundledModules).length).toBe(files.length);
    for (const text of Object.values(bundledModules)) expect(typeof text).toBe("string");
  });

  // The ids of the two samples are the only case-specific words src/ui/ may hold (samples.ts).
  const uiFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? uiFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
    );
  const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const ui = uiFiles(join(root, "src/ui")).map((f) => ({ f, code: readFileSync(f, "utf8") }));

  it("has no branch on jurisdiction and no case content in src/ui/", () => {
    expect(ui.length).toBeGreaterThan(8);
    const stripped = (code: string) => SAMPLE_IDS.reduce((s, id) => s.replaceAll(id, ""), code);
    const bad = ui.flatMap(({ f, code }) => {
      const c = stripped(code);
      const hits = [
        /jurisdiction/i.test(c) && "jurisdiction",
        /\b(?:H\.R\.|S\.)\s?\d{2,}/.test(c) && "bill number",
        /\bP\.L\.\s?\d/.test(c) && "public law number",
        /hr748|2205453|2215103|21337|116-94|116-136/.test(c) && "case number",
        /반도체|Semiconductor|CARES/i.test(c) && "case name",
      ].filter(Boolean);
      return hits.map((h) => `${f}: ${String(h)}`);
    });
    expect(bad).toEqual([]);
  });

  it("imports the case files in one place only, as raw text", () => {
    const globs = ui.filter(({ code }) => code.includes("import.meta.glob")).map(({ f }) => f);
    expect(globs.map((f) => f.split(/[\\/]/).pop())).toEqual(["samples.ts"]);
    const samples = ui.find(({ f }) => f.endsWith("samples.ts"))!.code;
    expect(samples).toMatch(/import\.meta\.glob\(\s*"@samples\/\*\.json",\s*\{\s*query: "\?raw",\s*import: "default",\s*eager: true,?\s*\}\s*\)/);
    // no other reach into the case folders
    for (const { f, code } of ui) expect(noComments(code), f).not.toMatch(/data\/cases|tests\/fixtures/);
  });

  it("imports the contract through its index only", () => {
    for (const { f, code } of ui) expect(code, f).not.toMatch(/from\s+["'](?:\.\.\/)+contract\/(?!index)/);
  });
});

describe("main.tsx", () => {
  async function boot(matches: boolean) {
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} }));
    await import("../../src/main");
  }

  it("sets data-motion to reduce when the system asks for reduced motion", async () => {
    await boot(true);
    expect(document.documentElement.dataset.motion).toBe("reduce");
  });

  it("sets data-motion to full otherwise", async () => {
    await boot(false);
    expect(document.documentElement.dataset.motion).toBe("full");
  });
});
