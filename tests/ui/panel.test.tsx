import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  DocumentVersion, EvidenceCheck, GateResult, LegislativeEvent, PathStatus, PathView, ScanModel,
} from "../../src/contract/types";
import { EVENT_KINDS, NEED_CODES } from "../../src/contract/types";
import en from "../../src/i18n/en.json";
import { t } from "../../src/i18n/t";
import { EvidencePanel } from "../../src/ui/EvidencePanel";
import type { Selection } from "../../src/ui/NodeLayer";
import { buildModel, clause, doc, evidenceRow, pathOf, version } from "../helpers/scanModel";

afterEach(cleanup);

const OFFICIAL = "https://example.org/official/page";
const CHECKED: EvidenceCheck = {
  state: "matched_official", url: OFFICIAL, checkedBy: "A", checkedAt: "2026-11-20",
  confirmedBy: "B", confirmedAt: "2026-11-21", confirmedUrl: OFFICIAL,
};
const PASS: GateResult = { pass: true, reasons: [], effectiveState: "matched_official" };
const FAIL: GateResult = { pass: false, reasons: ["excerpt_too_long"], effectiveState: "matched_official" };

const clauseSel = (evidenceId: string): Selection => ({ type: "node", id: `clause:${evidenceId}`, ref: clause(evidenceId) });
const versionSel = (documentId: string, versionId: string): Selection => ({
  type: "node", id: `version:${documentId}#${versionId}`, ref: version(documentId, versionId),
});
const pathSel = (pathId: string): Selection => ({ type: "path", pathId });

/** The panel opened by a stand-in button; the real nodes are wired in scan-screen 5. */
function Harness({ model, selection }: { model: ScanModel; selection: Selection }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open stand-in</button>
      {open ? <EvidencePanel model={model} selection={selection} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

async function openPanel(model: ScanModel, selection: Selection) {
  const user = userEvent.setup();
  render(<Harness model={model} selection={selection} />);
  await user.click(screen.getByRole("button", { name: "Open stand-in" }));
  return { user, panel: screen.getByRole("complementary") };
}

function withGate(model: ScanModel, gate: ScanModel["gate"]): ScanModel {
  return { ...model, gate };
}

function withEvents(model: ScanModel, events: LegislativeEvent[], timings: Record<string, DateView["timing"]>): ScanModel {
  return {
    ...model,
    case: { ...model.case, events },
    dates: Object.fromEntries(Object.entries(timings).map(([id, timing]) => [id, { timing, conflictWith: [] }])),
  };
}
type DateView = ScanModel["dates"][string];

/** One official version with one clause, the usual subject of the panel. */
function officialModel(over: Partial<DocumentVersion> = {}): ScanModel {
  return buildModel({
    documents: [doc("SYN-1", "enr", {
      title: "Synthetic Act title", publisher: "Synthetic Gazette", sourceKind: "official",
      sourceUrl: OFFICIAL, language: "ko", localEventLabel: "Synthetic stage", ...over,
    })],
    evidence: [evidenceRow("E1", "SYN-1", "enr", { anchor: "Sec. 9(a)", excerpt: "Synthetic original excerpt.", check: CHECKED })],
  });
}

describe("evidence panel: what it shows", () => {
  it("shows title, publisher, version, number and the original link for a version", async () => {
    const { panel } = await openPanel(officialModel(), versionSel("SYN-1", "enr"));
    expect(within(panel).getByRole("heading", { level: 2 }).textContent).toBe("Synthetic Act title");
    expect(within(panel).getByText("Synthetic Gazette")).toBeTruthy();
    expect(within(panel).getByText("enr")).toBeTruthy();
    expect(within(panel).getByText("SYN-1")).toBeTruthy();
    expect(within(panel).getByText("Synthetic stage").getAttribute("lang")).toBe("ko");
    expect(within(panel).getByText("Korean")).toBeTruthy(); // source language, in words
    expect(within(panel).getByRole("link").getAttribute("href")).toBe(OFFICIAL);
  });

  it("shows the clause with its version details, anchor, excerpt in its language and the link", async () => {
    const { panel } = await openPanel(officialModel(), clauseSel("E1"));
    expect(within(panel).getByText("Synthetic Act title")).toBeTruthy();
    expect(within(panel).getByText("Synthetic Gazette")).toBeTruthy();
    // the anchor is in the heading and in its own row
    expect(within(panel).getAllByText(/Sec\. 9\(a\)/).length).toBeGreaterThan(0);
    expect(within(panel).getByText("Synthetic original excerpt.").getAttribute("lang")).toBe("ko");
    expect(within(panel).getByRole("link").getAttribute("href")).toBe(OFFICIAL);
  });

  it("opens the original link in a new tab with rel noopener noreferrer", async () => {
    const { panel } = await openPanel(officialModel(), versionSel("SYN-1", "enr"));
    const a = within(panel).getByRole("link");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")?.split(/\s+/).sort()).toEqual(["noopener", "noreferrer"]);
  });

  it("renders a link only for http and https; any other value reads Not verified", async () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "not a url", null]) {
      const { panel } = await openPanel(officialModel({ sourceUrl: url }), versionSel("SYN-1", "enr"));
      expect(within(panel).queryByRole("link")).toBeNull();
      expect(within(panel).getAllByText(t("panel.notVerified")).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  const ev = (eventId: string, eventKind: LegislativeEvent["eventKind"], eventDate: string): LegislativeEvent => ({
    eventId, documentId: "SYN-1", versionId: "enr", eventKind, eventDate, evidenceRefs: [],
  });

  it("tags a timing only on effective and applied dates: future reads Scheduled, past reads Date has passed", async () => {
    const events = [ev("V1", "effective", "2026-08-11"), ev("V2", "applied", "2025-12-01"), ev("V3", "effective", "2026-01-01")];
    const model = withEvents(officialModel(), events, { V1: "scheduled", V2: "past", V3: "past" });
    const { panel } = await openPanel(model, versionSel("SYN-1", "enr"));
    expect(within(panel).getByText("Effective: 2026-08-11 (Scheduled)")).toBeTruthy();
    expect(within(panel).getByText("Applied: 2025-12-01 (Date has passed)")).toBeTruthy();
    // a same-day effective date comes out past and is never worded as in effect
    expect(within(panel).getByText("Effective: 2026-01-01 (Date has passed)")).toBeTruthy();
    expect(panel.textContent).not.toMatch(/in effect/i);
  });

  it("shows an effective date the contract did not judge as Not verified, and an unknown value too", async () => {
    const events = [ev("V1", "effective", "2025-03-01"), ev("V2", "applied", "unknown")];
    const model = withEvents(officialModel(), events, { V1: "unknown", V2: "unknown" });
    const { panel } = await openPanel(model, versionSel("SYN-1", "enr"));
    expect(within(panel).getByText("Effective: 2025-03-01 (Not verified)")).toBeTruthy();
    expect(within(panel).getByText("Applied: Not verified")).toBeTruthy();
  });

  it("shows only kind and date for every other kind, whatever model.dates holds", async () => {
    const kinds = EVENT_KINDS.filter((k) => k !== "effective" && k !== "applied" && k !== "unknown");
    for (const timing of ["past", "scheduled", "too_coarse", "unknown"] as const) {
      const events = kinds.map((k, i) => ev(`V${i}`, k, "2025-12-01"));
      const model = withEvents(officialModel(), events, Object.fromEntries(events.map((e) => [e.eventId, timing])));
      const { panel } = await openPanel(model, versionSel("SYN-1", "enr"));
      const items = Array.from(panel.querySelectorAll(".panel__dates li")).map((li) => li.textContent);
      expect(items).toHaveLength(kinds.length);
      for (const text of items) expect(text).toMatch(/^[^:()]+: 2025-12-01$/);
      cleanup();
    }
  });

  it("shows an unknown date value of any other kind as Not verified", async () => {
    const model = withEvents(officialModel(), [ev("V1", "passed", "unknown")], { V1: "unknown" });
    const { panel } = await openPanel(model, versionSel("SYN-1", "enr"));
    expect(within(panel).getByText("Passed: Not verified")).toBeTruthy();
  });
  it("shows Not verified for a version with no date", async () => {
    const { panel } = await openPanel(officialModel(), versionSel("SYN-1", "enr"));
    expect(within(panel).getByText("Date: Not verified")).toBeTruthy();
  });

  it("says so when the selected item is not in the case", async () => {
    const { panel } = await openPanel(officialModel(), clauseSel("NOPE"));
    expect(within(panel).getByRole("heading", { level: 2 }).textContent).toBe(t("panel.missing"));
  });
});

describe("evidence panel: focus", () => {
  it("moves focus to the heading on open", async () => {
    const { panel } = await openPanel(officialModel(), clauseSel("E1"));
    expect(document.activeElement).toBe(within(panel).getByRole("heading", { level: 2 }));
  });

  it("returns focus to the opener on Escape", async () => {
    const { user } = await openPanel(officialModel(), clauseSel("E1"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open stand-in" }));
  });

  it("returns focus to the opener on Close", async () => {
    const { user } = await openPanel(officialModel(), clauseSel("E1"));
    await user.click(screen.getByRole("button", { name: t("panel.close") }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open stand-in" }));
  });

  it("returns focus to the item that opened it when another item is selected meanwhile", async () => {
    const model = officialModel();
    function Two() {
      const [sel, setSel] = useState<Selection | null>(null);
      return (
        <>
          <button type="button" onClick={() => setSel(clauseSel("E1"))}>First</button>
          <button type="button" onClick={() => setSel(versionSel("SYN-1", "enr"))}>Second</button>
          {sel ? <EvidencePanel model={model} selection={sel} onClose={() => setSel(null)} /> : null}
        </>
      );
    }
    const user = userEvent.setup();
    render(<Two />);
    await user.click(screen.getByRole("button", { name: "First" }));
    await user.click(screen.getByRole("button", { name: "Second" }));
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Second" }));
  });
});

describe("evidence panel: translation", () => {
  const translated = (): ScanModel =>
    buildModel({
      documents: [doc("SYN-1", "enr", { sourceKind: "official", sourceUrl: OFFICIAL, language: "ko" })],
      evidence: [evidenceRow("E1", "SYN-1", "enr", {
        excerpt: "Synthetic original text.",
        translation: { text: "Synthetic translated text.", language: "en" },
      })],
    });

  it("labels the translation and keeps the original beside it", async () => {
    const { panel } = await openPanel(translated(), clauseSel("E1"));
    const label = within(panel).getByText("Translation");
    expect(label.tagName).toBe("DT");
    const row = label.closest(".panel__row")!;
    expect(within(row as HTMLElement).getByText("Synthetic translated text.").getAttribute("lang")).toBe("en");
    // the original is still there, in its own labelled row before the translation
    const original = within(panel).getByText("Synthetic original text.");
    expect(original.getAttribute("lang")).toBe("ko");
    expect(original.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("never shows a translation in place of a missing original", async () => {
    const model = translated();
    model.case.evidence[0]!.excerpt = "";
    const { panel } = await openPanel(model, clauseSel("E1"));
    const excerptRow = within(panel).getByText(t("panel.excerpt")).closest(".panel__row") as HTMLElement;
    expect(excerptRow.textContent).toContain(t("panel.notVerified"));
    expect(excerptRow.textContent).not.toContain("Synthetic translated text.");
  });

  it("shows no Translation row when there is no translation", async () => {
    const { panel } = await openPanel(officialModel(), clauseSel("E1"));
    expect(within(panel).queryByText("Translation")).toBeNull();
  });
});

describe("evidence panel: news from another outlet (D-016)", () => {
  const MARKER = "zqxexcerptmarker";
  const news = (over: Partial<DocumentVersion> = {}): ScanModel =>
    buildModel({
      documents: [doc("SYN-N", "news", {
        title: "Synthetic news title", publisher: "Synthetic outlet", sourceKind: "news",
        sourceUrl: "https://example.org/news/1", factSentence: "Synthetic fact sentence.", language: "en", ...over,
      })],
      evidence: [evidenceRow("EN", "SYN-N", "news", {
        anchor: "Para 2", excerpt: `${MARKER} verbatim news text`,
        translation: { text: `${MARKER} translated news text`, language: "ko" },
      })],
      paths: [pathOf("PN", "carried", clause("EN"), clause("EN"))],
    });

  it("shows outlet, date, title, link and the fact sentence for a version", async () => {
    const { panel } = await openPanel(news(), versionSel("SYN-N", "news"));
    expect(within(panel).getByRole("heading", { level: 2 }).textContent).toBe("Synthetic news title");
    expect(within(panel).getByText(t("panel.outlet"))).toBeTruthy();
    expect(within(panel).getByText("Synthetic outlet")).toBeTruthy();
    expect(within(panel).getByText("Date: Not verified")).toBeTruthy();
    expect(within(panel).getByRole("link").getAttribute("href")).toBe("https://example.org/news/1");
    expect(within(panel).getByText("Synthetic fact sentence.")).toBeTruthy();
  });

  it("shows a fact sentence and no excerpt for a clause, even when the data carries one", async () => {
    const { panel } = await openPanel(news(), clauseSel("EN"));
    expect(within(panel).getByText("Synthetic fact sentence.")).toBeTruthy();
    expect(within(panel).queryByText(t("panel.excerpt"))).toBeNull();
    expect(panel.textContent).not.toContain(MARKER);
  });

  it("shows no excerpt on a path between news clauses, and no difference text", async () => {
    const { panel } = await openPanel(news(), pathSel("PN"));
    expect(panel.textContent).not.toContain(MARKER);
    expect(within(panel).queryByText(t("panel.difference"))).toBeNull();
  });

  it("shows Not verified when the fact sentence is missing", async () => {
    const { panel } = await openPanel(news({ factSentence: null }), versionSel("SYN-N", "news"));
    const row = within(panel).getByText(t("panel.factSentence")).closest(".panel__row") as HTMLElement;
    expect(row.textContent).toContain(t("panel.notVerified"));
  });

  it("never prints any excerpt or translation of another outlet's news, for any text", async () => {
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[a-z]{14}$/), fc.constantFrom("version", "clause", "path"), async (text, which) => {
        const model = news();
        model.case.evidence[0]!.excerpt = text;
        model.case.evidence[0]!.translation = { text: `${text}x`, language: "ko" };
        const sel = which === "version" ? versionSel("SYN-N", "news") : which === "clause" ? clauseSel("EN") : pathSel("PN");
        const { panel } = await openPanel(model, sel);
        const shown = panel.textContent ?? "";
        cleanup();
        return !shown.includes(text);
      }),
      { numRuns: 40 },
    );
  }, 30_000);

  it("shows the excerpt of a Seoul Economic Daily article, which D-016 allows", async () => {
    const { panel } = await openPanel(news({ ownOutlet: true }), clauseSel("EN"));
    expect(panel.textContent).toContain(MARKER);
  });
});

describe("evidence panel: paths", () => {
  const pathModel = (status: PathStatus, needs: PathView["needs"] = []): ScanModel =>
    buildModel({
      documents: [
        doc("SYN-1", "ih", { title: "Synthetic bill", sourceKind: "official", sourceUrl: OFFICIAL }),
        doc("SYN-2", "law", { title: "Synthetic law", sourceKind: "official", sourceUrl: "https://example.org/law" }),
      ],
      evidence: [
        evidenceRow("E1", "SYN-1", "ih", { anchor: "Sec. 2", excerpt: "The tax is repealed for every plan." }),
        evidenceRow("E2", "SYN-2", "law", { anchor: "Sec. 503", excerpt: "The tax is repealed for each plan." }),
      ],
      paths: [pathOf("P1", "same_outcome_separate_law", clause("E1"), clause("E2"), { evidenceRefs: ["E1", "E2"] })],
      views: { P1: { status, needs } },
    });

  it("shows the kind, the status in words and what is still needed for a path that is not confirmed", async () => {
    const needs: PathView["needs"] = [
      { code: "open_official_source" },
      { code: "record_check", params: { evidenceId: "E2" } },
    ];
    const { panel } = await openPanel(pathModel("not_verified", needs), pathSel("P1"));
    expect(within(panel).getByRole("heading", { level: 2 }).textContent).toBe("Same outcome, separate law");
    const statusRow = within(panel).getByText(t("panel.status")).closest(".panel__row") as HTMLElement;
    expect(statusRow.textContent).toContain("Not verified");
    expect(within(panel).queryByText(t("panel.confirmed"))).toBeNull();
    expect(within(panel).getByText(t("panel.needs"))).toBeTruthy();
    expect(within(panel).getByText(t("need.open_official_source"))).toBeTruthy();
    expect(within(panel).getByText(`${t("need.record_check")} (row E2)`)).toBeTruthy();
  });

  it.each<[PathStatus, string]>([
    ["omission_not_verified", "Omission not verified"],
    ["evidence_missing", "Evidence missing"],
  ])("shows the status %s in words", async (status, text) => {
    const { panel } = await openPanel(pathModel(status, [{ code: "add_evidence" }]), pathSel("P1"));
    const statusRow = within(panel).getByText(t("panel.status")).closest(".panel__row") as HTMLElement;
    expect(statusRow.textContent).toContain(text);
    expect(within(panel).queryByText(t("panel.confirmed"))).toBeNull();
  });

  it("reads Confirmed only when the contract says confirmed, and then lists no needs", async () => {
    const { panel } = await openPanel(pathModel("confirmed"), pathSel("P1"));
    expect(within(panel).getByText(t("panel.confirmed"))).toBeTruthy();
    expect(within(panel).queryByText(t("panel.needs"))).toBeNull();
  });

  it("has a string for every need code in the need group, and none left under panel", () => {
    for (const code of NEED_CODES) expect(t(`need.${code}`).length).toBeGreaterThan(0);
    expect(Object.keys(en.need).sort()).toEqual([...NEED_CODES].sort());
    expect("need" in en.panel).toBe(false);
  });

  it("shows the clause location in the earlier and the later document", async () => {
    const { panel } = await openPanel(pathModel("not_verified"), pathSel("P1"));
    const earlier = within(panel).getByText(t("panel.earlier")).closest("section") as HTMLElement;
    const later = within(panel).getByText(t("panel.later")).closest("section") as HTMLElement;
    expect(within(earlier).getByText("Synthetic bill")).toBeTruthy();
    expect(within(earlier).getByText("Sec. 2")).toBeTruthy();
    expect(within(later).getByText("Synthetic law")).toBeTruthy();
    expect(within(later).getByText("Sec. 503")).toBeTruthy();
    expect(within(later).getByRole("link").getAttribute("href")).toBe("https://example.org/law");
  });

  it("shows the computed difference of the two excerpts for carried, transferred and same-outcome paths", async () => {
    for (const kind of ["carried", "transferred", "same_outcome_separate_law"] as const) {
      const model = pathModel("not_verified");
      model.case.paths[0]!.kind = kind;
      const { panel } = await openPanel(model, pathSel("P1"));
      const section = within(panel).getByText(t("panel.difference")).closest("section") as HTMLElement;
      expect(section.querySelector("ins")?.textContent).toContain("each");
      expect(section.querySelector("del")?.textContent).toContain("every");
      cleanup();
    }
  });

  it("shows no difference for number-track and not_included paths", async () => {
    const model = pathModel("not_verified");
    for (const kind of ["next_version", "successor_document", "not_included"] as const) {
      model.case.paths[0]!.kind = kind;
      const { panel } = await openPanel(model, pathSel("P1"));
      expect(within(panel).queryByText(t("panel.difference"))).toBeNull();
      cleanup();
    }
  });

  it("says the texts are too long to compare when the comparison is refused", async () => {
    const model = pathModel("not_verified");
    model.case.evidence[0]!.excerpt = "word ".repeat(5000);
    const { panel } = await openPanel(model, pathSel("P1"));
    expect(within(panel).getByText(t("panel.tooLong"))).toBeTruthy();
  });
});

describe("evidence panel: who checked it", () => {
  const checked = (gate: ScanModel["gate"], over: Partial<ScanModel> = {}): ScanModel => ({
    ...withGate(officialModel(), gate),
    ...over,
  });
  const ROLE_A = "Role A opened the official page on 2026-11-20";
  const ROLE_B = "Role B confirmed it on 2026-11-21";

  it("shows the role and date of a check the gate counted", async () => {
    const { panel } = await openPanel(checked({ E1: PASS }), clauseSel("E1"));
    expect(within(panel).getByText(ROLE_A)).toBeTruthy();
    expect(within(panel).getByText(ROLE_B)).toBeTruthy();
  });

  it("shows only the first role when no second role is recorded", async () => {
    const model = checked({ E1: PASS });
    model.case.evidence[0]!.check = { ...CHECKED, confirmedBy: null, confirmedAt: null };
    const { panel } = await openPanel(model, clauseSel("E1"));
    expect(within(panel).getByText(ROLE_A)).toBeTruthy();
    expect(panel.textContent).not.toContain("confirmed it");
  });

  it("shows no check for a user-case row whose stored record the gate ignored (D-009)", async () => {
    const model = checked({ E1: FAIL }, { origin: "user" });
    const { panel } = await openPanel(model, clauseSel("E1"));
    expect(panel.textContent).not.toContain("Role A");
    expect(panel.textContent).not.toContain("2026-11-20");
    expect(panel.textContent).not.toContain("Role B");
  });

  it("shows no check for a bundled row that fails for another reason", async () => {
    const { panel } = await openPanel(checked({ E1: FAIL }), clauseSel("E1"));
    expect(panel.textContent).not.toContain("Role A");
    expect(panel.textContent).not.toContain("2026-11-20");
    const row = within(panel).getByText(t("panel.checkedHeading")).closest(".panel__row") as HTMLElement;
    expect(row.textContent).toContain(t("panel.notVerified"));
  });

  it("shows no check when the row has no gate entry", async () => {
    const { panel } = await openPanel(checked({}), clauseSel("E1"));
    expect(panel.textContent).not.toContain("Role A");
    expect(panel.textContent).not.toContain("2026-11-20");
  });

  it("shows no check on a path's evidence list for a row that did not pass", async () => {
    const model = buildModel({
      documents: [doc("SYN-1", "enr", { sourceKind: "official", sourceUrl: OFFICIAL })],
      evidence: [evidenceRow("E1", "SYN-1", "enr", { check: CHECKED })],
      paths: [pathOf("P1", "not_included", clause("E1"), version("SYN-1", "enr"), { evidenceRefs: ["E1"] })],
    });
    const failing = withGate(model, { E1: FAIL });
    const { panel } = await openPanel(failing, pathSel("P1"));
    expect(panel.textContent).not.toContain("Role A");
    cleanup();
    const passing = withGate(model, { E1: PASS });
    const again = await openPanel(passing, pathSel("P1"));
    expect(within(again.panel).getByText(ROLE_A)).toBeTruthy();
  });
});

describe("evidence panel: wording and styles", () => {
  it("gives the difference text styles that do not depend on colour", () => {
    const css = readFileSync(join(import.meta.dirname, "../../src/ui/styles.css"), "utf8");
    expect(css).toMatch(/\.diff ins \{[^}]*text-decoration: underline/);
    expect(css).toMatch(/\.diff del \{[^}]*text-decoration: line-through/);
    expect(css).toMatch(/\.sr-only \{[^}]*clip-path/);
  });
});
