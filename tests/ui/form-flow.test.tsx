// Scan your own bill, second half (scan-screen 8): compare, links, promise, Start from a sample,
// Import JSON, the copy kept in the browser session, and property 6.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCase } from "../../src/contract";
import { EVENT_KINDS, PATH_KINDS, SOURCE_KINDS } from "../../src/contract/types";
import { t } from "../../src/i18n/t";
import { ScanView } from "../../src/ui/ScanView";
import { layoutScan } from "../../src/ui/layout";
import { SESSION_KEY, OwnBillForm } from "../../src/ui/form/OwnBillForm";
import { loadSamples } from "../../src/ui/samples";
import {
  PROMISE_REF, carriedChecks, emptyForm, fromCase, restoreForm, toCaseInput, type FormState, type VersionRow,
} from "../../src/ui/form/toCaseInput";

const REFERENCE = "2026-11-24";
const root = join(import.meta.dirname, "../..");
const fixture = (name: string): Record<string, any> => JSON.parse(readFileSync(join(root, "tests/fixtures/samples", `${name}.json`), "utf8"));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

// ---- Helpers ----

const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
type User = ReturnType<typeof userEvent.setup>;

const versionGroups = () => screen.getAllByRole("group").filter((g) => /^Version \d/.test(g.querySelector("legend")?.textContent ?? ""));
const clauseGroup = (n: number) => within(screen.getByRole("group", { name: `Clauses of version ${n}` }));
const scanBoxes = (c: HTMLElement) => c.querySelectorAll(".scan-box");
const strip = (c: HTMLElement) => c.querySelector<HTMLElement>(".scan-view__comparison");
const node = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
const labels = (c: HTMLElement) => [...c.querySelectorAll(".label")].map((l) => l.textContent ?? "");
const stored = () => sessionStorage.getItem(SESSION_KEY);

function described(el: HTMLElement): string {
  return (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" | ");
}

/** Adds a version and fills the given labels by setting their values. */
async function addVersion(user: User, fill: Record<string, string> = {}) {
  await user.click(screen.getByRole("button", { name: "Add a version" }));
  const group = within(versionGroups().at(-1)!);
  for (const [label, value] of Object.entries({ Title: "Synthetic title", Publisher: "Synthetic publisher", ...fill })) set(group.getByLabelText(label), value);
  return group;
}
async function addClause(user: User, version: number, anchor: string, excerpt: string) {
  await user.click(screen.getByRole("button", { name: `Add a clause (version ${version})` }));
  const rows = clauseGroup(version).getAllByLabelText("Clause location");
  const at = rows.length - 1;
  set(rows[at]!, anchor);
  if (excerpt !== "") set(clauseGroup(version).getAllByLabelText("Excerpt")[at]!, excerpt);
}

const TEXT_1 = "The invented levy is repealed for later years. A second rule stays.";
const TEXT_2 = "The invented levy is repealed for all later years. A second rule stays.";

/** Two versions with different pasted text and one clause each. */
async function twoVersions(user: User) {
  await addVersion(user, { "Version label": "Introduced", "Pasted text": TEXT_1 });
  await addVersion(user, { "Version label": "Passed", "Pasted text": TEXT_2 });
  await addClause(user, 1, "Sec. 1", "The invented levy is repealed for later years.");
  await addClause(user, 2, "Sec. 9", "The invented levy is repealed for all later years.");
}

/** Adds a link and fills it; the contract draws it only once it has an evidence row. */
async function addLink(user: User, kind: string, from: string, to: string, evidence: string[] = []) {
  await user.click(screen.getByRole("button", { name: "Add a link" }));
  const link = within(screen.getAllByRole("group").filter((g) => /^Link \d/.test(g.querySelector("legend")?.textContent ?? "")).at(-1)!);
  await user.selectOptions(link.getByLabelText("Kind of link"), kind);
  await user.selectOptions(link.getByLabelText("From"), from);
  await user.selectOptions(link.getByLabelText("To"), to);
  for (const row of evidence) {
    await user.click(link.getByRole("button", { name: /^Add an evidence row/ }));
    await user.selectOptions(link.getAllByLabelText("Evidence row").at(-1)!, row);
  }
  return link;
}

// ---- Compare ----

describe("compare", () => {
  it("shows a sentence-level difference of two versions in the scan view at once, and opens two clause anchors", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await twoVersions(user);
    expect(scanBoxes(container).length).toBe(1);
    const s = strip(container)!;
    expect(s).toBeTruthy();
    expect(s.closest(".scan-view")).toBeTruthy(); // the strip sits inside the scan view
    expect([...s.querySelectorAll("ins")].map((e) => e.textContent).join(" ")).toContain("all");
    expect(s.querySelectorAll("del").length).toBe(0);
    expect(s.textContent).toContain("Difference between Version 1: Introduced and Version 2: Passed");
    expect(s.textContent).not.toMatch(/%|similar|score/i); // no similarity figure (D-012)

    // two clause anchors open the panel, one after the other (a link with evidence brings their nodes)
    await addLink(user, "carried", "Version 1, clause 1: Sec. 1", "Version 2, clause 1: Sec. 9", ["Version 1, clause 1: Sec. 1"]);
    const first = container.querySelectorAll<HTMLElement>('[data-node-id^="clause:"]');
    expect(first.length).toBe(2);
    await user.click(first[0]!);
    expect(container.querySelector(".panel")!.textContent).toContain("Sec. 1");
    await user.keyboard("{Escape}");
    expect(container.querySelector(".panel")).toBeNull();
    await user.click(first[1]!);
    expect(container.querySelector(".panel")!.textContent).toContain("Sec. 9");
    expect(container.querySelector(".panel")!.textContent).toContain(t("panel.notVerified"));
  });

  it("compares two clauses when asked, and follows the choice of either side", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await twoVersions(user);
    set(screen.getByLabelText("What to compare"), "clauses");
    expect(strip(container)!.textContent).toContain("Difference between Version 1, clause 1: Sec. 1 and Version 2, clause 1: Sec. 9");
    expect(strip(container)!.querySelector("ins")!.textContent).toContain("all");
    // the same text on both sides: no word-level difference
    set(screen.getByLabelText("Later text"), screen.getByLabelText<HTMLSelectElement>("Earlier text").value);
    expect(strip(container)!.textContent).toContain(t("panel.noDifference"));
    expect(strip(container)!.querySelectorAll("ins, del").length).toBe(0);
  });

  it("says the texts are too long to compare when the comparison gives up", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await addVersion(user, { "Pasted text": "a ".repeat(11_000) });
    await addVersion(user, { "Pasted text": "b ".repeat(11_000) });
    expect(strip(container)!.textContent).toContain(t("panel.tooLong"));
    expect(strip(container)!.querySelectorAll("ins, del").length).toBe(0);
  });

  it("asks for texts while fewer than two can be compared, and offers none for news from another outlet", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await addVersion(user, { "Pasted text": TEXT_1 });
    expect(screen.getByText(t("form.compareNeedVersions"))).toBeTruthy();
    expect(strip(container)).toBeNull();
    const news = await addVersion(user, { "Kind of source": "news" });
    expect(news.queryByLabelText("Pasted text")).toBeNull();
    expect(screen.getByText(t("form.compareNeedVersions"))).toBeTruthy();
    expect(strip(container)).toBeNull();
    // with a second official version the difference appears at once
    await addVersion(user, { "Pasted text": TEXT_2 });
    expect(strip(container)).toBeTruthy();
    const options = [...screen.getByLabelText("Earlier text").querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["Version 1", "Version 3"]);
  });
});

// ---- Links ----

describe("links", () => {
  it("offers exactly the contract's link kinds", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await addVersion(user);
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    const select = screen.getByLabelText<HTMLSelectElement>("Kind of link");
    expect([...select.options].map((o) => o.value)).toEqual(["", ...PATH_KINDS]);
  });

  it("shows a link without passing evidence as Not verified, and never as confirmed", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await twoVersions(user);
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    const link = within(screen.getByRole("group", { name: "Link 1" }));
    await user.selectOptions(link.getByLabelText("Kind of link"), "carried");
    await user.selectOptions(link.getByLabelText("From"), "Version 1, clause 1: Sec. 1");
    await user.selectOptions(link.getByLabelText("To"), "Version 2, clause 1: Sec. 9");
    await user.click(link.getByRole("button", { name: "Add an evidence row (link 1)" }));
    await user.selectOptions(link.getByLabelText("Evidence row"), "Version 1, clause 1: Sec. 1");
    const found = labels(container).filter((l) => l.includes("Carried into a later version"));
    expect(found.length).toBe(1);
    expect(found[0]).toContain("Not verified");
    expect(container.querySelectorAll('[data-end="filled"]').length).toBe(0);
    expect(container.textContent).not.toContain(t("panel.confirmed"));
    // the link line opens the panel with its status and what is still needed
    await user.click(container.querySelector<HTMLElement>(".label")!);
    expect(container.querySelector(".panel")!.textContent).toContain(t("panel.notVerified"));
  });

  it("shows a missing kind or end next to its field, and a kind that does not fit its ends", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await twoVersions(user);
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    const link = within(screen.getByRole("group", { name: "Link 1" }));
    // an empty link row is not sent: no message yet
    expect(described(link.getByLabelText("Kind of link"))).toBe("");
    await user.selectOptions(link.getByLabelText("To"), "Version 2, clause 1: Sec. 9");
    expect(described(link.getByLabelText("Kind of link"))).toBe(`Problem: ${t("issue.schema_required")}`);
    expect(described(link.getByLabelText("From"))).toBe(`Problem: ${t("issue.schema_required")}`);
    expect(link.getByText(t("form.leftOut"))).toBeTruthy();
    await user.selectOptions(link.getByLabelText("From"), "Version 1, clause 1: Sec. 1");
    await user.selectOptions(link.getByLabelText("Kind of link"), "next_version"); // needs two versions
    expect(described(link.getByLabelText("Kind of link"))).toBe(`Problem: ${t("issue.kind_endpoint_mismatch")}`);
    expect(container.querySelectorAll(".label").length).toBe(0); // nothing drawn for it
    await user.selectOptions(link.getByLabelText("Kind of link"), "carried");
    expect(described(link.getByLabelText("Kind of link"))).toBe("");
    // without an evidence row the line is not drawn; the not-drawn list says what it needs
    expect(labels(container).length).toBe(0);
    expect(container.querySelector(".not-drawn")!.textContent).toContain(t("status.evidence_missing"));
    await user.click(link.getByRole("button", { name: /^Add an evidence row/ }));
    await user.selectOptions(link.getByLabelText("Evidence row"), "Version 2, clause 1: Sec. 9");
    expect(labels(container).length).toBe(1);
  });

  it("keeps a link that starts at the promise Not verified, as the contract does", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await twoVersions(user);
    set(screen.getByLabelText("Promise statement"), "A promise in my own words.");
    await addLink(user, "same_outcome_separate_law", t("form.promiseEnd"), "Version 2, clause 1: Sec. 9", ["Version 2, clause 1: Sec. 9"]);
    const found = labels(container).filter((l) => l.includes("Same outcome, separate law"));
    expect(found.length).toBe(1);
    expect(found[0]).toContain("Not verified");
  });

  it("drops a link end when the row it pointed at is removed", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await twoVersions(user);
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    const link = within(screen.getByRole("group", { name: "Link 1" }));
    await user.selectOptions(link.getByLabelText("From"), "Version 1, clause 1: Sec. 1");
    expect(link.getByLabelText<HTMLSelectElement>("From").value).not.toBe("");
    await user.click(clauseGroup(1).getByRole("button", { name: "Remove clause (version 1, clause 1)" }));
    expect(link.getByLabelText<HTMLSelectElement>("From").value).toBe("");
    // a removed version takes its clauses' ends with it
    await user.selectOptions(link.getByLabelText("To"), "Version 2, clause 1: Sec. 9");
    await user.click(within(versionGroups()[1]!).getByRole("button", { name: "Remove version (version 2)" }));
    expect(link.getByLabelText<HTMLSelectElement>("To").value).toBe("");
  });
});

// ---- Promise ----

describe("promise", () => {
  it("needs a statement once any promise field is filled, next to the statement", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    const statement = screen.getByLabelText("Promise statement");
    expect(statement.getAttribute("aria-invalid")).toBeNull(); // nothing filled: nothing wrong
    await user.type(screen.getByLabelText("Promise source title"), "A source");
    expect(statement.getAttribute("aria-invalid")).toBe("true");
    expect(described(statement)).toContain(t("issue.schema_required"));
    expect(screen.getByText(t("form.leftOut"))).toBeTruthy();
    await user.type(statement, "In my own words.");
    expect(statement.getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByText(t("form.leftOut"))).toBeNull();
  });

  it("has no excerpt box and sends the source as another outlet's: no ownOutlet, excerpt null", async () => {
    render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = within(screen.getByRole("group", { name: "Promise (optional)" }));
    expect(group.queryByLabelText(/excerpt/i)).toBeNull();
    expect(group.getByLabelText("Promise fact sentence")).toBeTruthy(); // optional, in place of an excerpt
    const state: FormState = { ...emptyForm(), promise: { statement: "S", sourceTitle: "T", publisher: "P", sourceUrl: "", date: "2025", factSentence: "" } };
    const { input } = toCaseInput(state);
    expect(input.promise).toEqual({ statement: "S", sourceTitle: "T", publisher: "P", sourceUrl: null, date: "2025", excerpt: null, factSentence: null });
    expect(input.promise).not.toHaveProperty("ownOutlet");
    expect(toCaseInput(emptyForm()).input).not.toHaveProperty("promise");
  });

  it("shows a promise link problem next to the promise's link field", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await user.type(screen.getByLabelText("Promise statement"), "In my own words.");
    set(screen.getByLabelText("Promise source link"), "not a link");
    expect(described(screen.getByLabelText("Promise source link"))).toBe(`Problem: ${t("issue.url_invalid")}`);
    set(screen.getByLabelText("Promise source link"), "https://example.org/p");
    expect(described(screen.getByLabelText("Promise source link"))).toBe("");
  });

  it("never lets an excerpt of the promise through: a typed fact sentence is all it carries", () => {
    const state: FormState = { ...emptyForm(), promise: { statement: "S", sourceTitle: "", publisher: "", sourceUrl: "", date: "", factSentence: "Our sentence." } };
    const parsed = parseCase(toCaseInput(state).input, { referenceDate: REFERENCE, origin: "user" });
    expect(parsed.issues.filter((i) => i.severity === "block")).toEqual([]);
    expect(parsed.model!.case.promise).toMatchObject({ factSentence: "Our sentence.", excerpt: null, date: "unknown" });
    expect(parsed.model!.case.promise!.ownOutlet).toBeUndefined();
  });
});

// ---- Start from a sample ----

// A synthetic sample whose two clause rows carry a passing check, so that "keeps its check" is visible.
function checkedSample() {
  const raw = fixture("us-116-hr748");
  for (const e of raw.evidence) {
    const doc = raw.documents.find((d: any) => d.documentId === e.documentId && d.versionId === e.versionId);
    e.check = { state: "matched_official", url: doc.sourceUrl, checkedBy: "A", checkedAt: "2026-11-01", confirmedBy: null, confirmedAt: null, confirmedUrl: null };
  }
  return loadSamples({ "a/us.json": JSON.stringify(raw) }, REFERENCE);
}

describe("start from a sample", () => {
  it("copies the sample into the fields, with the row checks kept for unchanged rows", async () => {
    const user = userEvent.setup();
    const samples = checkedSample();
    expect(samples[0]!.model!.gate["syn-us-e1"]!.pass).toBe(true); // the sample's own rows pass
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} samples={samples} />);
    expect(screen.queryByRole("button", { name: "Start from Korea" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start from United States" }));
    expect(versionGroups().length).toBe(3);
    expect(within(versionGroups()[0]!).getByLabelText<HTMLInputElement>("Title").value).toBe("Synthetic Bill 100, introduced text");
    expect(within(versionGroups()[2]!).getByLabelText<HTMLInputElement>("Document number").value).toBe("Synthetic Law 7");
    expect(screen.getByLabelText<HTMLInputElement>("Bill number").value).toBe("Synthetic Bill 100");
    expect(scanBoxes(container).length).toBe(1);
    expect(screen.getByRole("note").textContent).toContain(t("form.bannerCopied"));

    const { rows } = fromCase(samples[0]!.model!.case);
    // an unchanged row keeps the sample's check: its panel names the role and the date
    await user.click(node(container, `clause:${rows.clauses[0]}`)!);
    expect(container.querySelector(".panel")!.textContent).toContain("Role A opened the official page on 2026-11-01");
    await user.keyboard("{Escape}");
    const confirmedLine = labels(container).find((l) => l.includes("Same outcome, separate law"))!;
    expect(confirmedLine).not.toContain("Not verified"); // both rows pass, so the sample's own status holds

    // editing the excerpt of one copied row drops that row's check, and the line falls back
    const excerpt = clauseGroup(1).getByLabelText<HTMLTextAreaElement>("Excerpt");
    set(excerpt, `${excerpt.value} More.`);
    await user.click(node(container, `clause:${rows.clauses[0]}`)!);
    expect(container.querySelector(".panel")!.textContent).not.toContain("opened the official page");
    await user.keyboard("{Escape}");
    expect(labels(container).find((l) => l.includes("Same outcome, separate law"))).toContain("Not verified");
    // the other row is unchanged and keeps its check
    await user.click(node(container, `clause:${rows.clauses[1]}`)!);
    expect(container.querySelector(".panel")!.textContent).toContain("Role A opened the official page on 2026-11-01");
  });

  it.each([
    ["anchor", (s: FormState) => ({ ...s, versions: s.versions.map((v, i) => (i === 0 ? { ...v, clauses: v.clauses.map((c) => ({ ...c, anchor: `${c.anchor} (a)` })) } : v)) })],
    ["excerpt", (s: FormState) => ({ ...s, versions: s.versions.map((v, i) => (i === 0 ? { ...v, clauses: v.clauses.map((c) => ({ ...c, excerpt: `${c.excerpt} x` })) } : v)) })],
    ["source link", (s: FormState) => ({ ...s, versions: s.versions.map((v, i) => (i === 0 ? { ...v, sourceUrl: `${v.sourceUrl}/x` } : v)) })],
    ["bill number", (s: FormState) => ({ ...s, bill: { ...s.bill, number: `${s.bill.number} 2` } })],
    ["document number", (s: FormState) => ({ ...s, versions: s.versions.map((v, i) => (i === 0 ? { ...v, documentNumber: "Other number" } : v)) })],
  ])("an edited %s drops the check of the copied row and no other", (_name, edit) => {
    const sample = checkedSample()[0]!.model!.case;
    const { state, rows } = fromCase(sample);
    const bundled = carriedChecks(sample);
    const run = (s: FormState) => parseCase(toCaseInput(s).input, { referenceDate: REFERENCE, origin: "user", bundledChecks: bundled }).model!.gate;
    const [first, second] = [rows.clauses[0]!, rows.clauses[1]!];
    const before = run(state);
    expect([before[first]!.pass, before[second]!.pass]).toEqual([true, true]);
    const after = run(edit(state));
    expect(after[first]?.pass ?? false).toBe(false);
    expect(after[second]!.pass).toBe(true); // the other row sits in a version with its own number and link
  });

  it("takes the checks from the loaded sample, never from the session copy", async () => {
    const user = userEvent.setup();
    const samples = checkedSample();
    render(<OwnBillForm referenceDate={REFERENCE} samples={samples} />);
    await user.click(screen.getByRole("button", { name: "Start from United States" }));
    expect(JSON.parse(stored()!).copiedFrom).toBe("us-116-hr748");
    expect(stored()).not.toMatch(/checkedBy|matched_official|check"/);
    cleanup();
    // the same session without the sample loaded: the rows are there, their checks are not
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    const { rows } = fromCase(samples[0]!.model!.case);
    await user.click(node(container, `clause:${rows.clauses[0]}`)!);
    expect(container.querySelector(".panel")!.textContent).not.toContain("opened the official page");
    expect(labels(container).every((l) => l.includes("Not verified"))).toBe(true);
  });

  it("copies the links and the promise too, with no excerpt", async () => {
    const user = userEvent.setup();
    const raw = fixture("us-116-hr748");
    raw.promise = { statement: "A statement.", sourceTitle: "Source", publisher: "Publisher", sourceUrl: "https://example.org/p", date: "2025-05", ownOutlet: true, excerpt: "Our own article text.", factSentence: "A fact." };
    const samples = loadSamples({ "a/us.json": JSON.stringify(raw) }, REFERENCE);
    render(<OwnBillForm referenceDate={REFERENCE} samples={samples} />);
    await user.click(screen.getByRole("button", { name: "Start from United States" }));
    expect(screen.getAllByRole("group", { name: /^Link \d/ }).length).toBe(3);
    expect(screen.getByLabelText<HTMLTextAreaElement>("Promise statement").value).toBe("A statement.");
    expect(screen.getByLabelText<HTMLTextAreaElement>("Promise fact sentence").value).toBe("A fact.");
    expect(screen.getByLabelText<HTMLInputElement>("Promise date").value).toBe("2025-05");
    expect(stored()).not.toContain("Our own article text.");
  });
});

// ---- Import JSON ----

async function importFile(contents: string, name = "case.json") {
  const input = screen.getByLabelText<HTMLInputElement>("Import JSON");
  fireEvent.change(input, { target: { files: [new File([contents], name, { type: "application/json" })] } });
}

describe("import JSON", () => {
  const importable = () => {
    const raw = fixture("kr-semiconductor-special-act");
    // a stored check record, and a promise with an excerpt and the own-outlet flag, as a file may carry
    raw.evidence[0].check = { state: "matched_official", url: raw.documents[0].sourceUrl, checkedBy: "A", checkedAt: "2026-11-01", confirmedBy: null, confirmedAt: null, confirmedUrl: null };
    raw.promise = { statement: "A statement.", sourceTitle: "Source", publisher: "Publisher", sourceUrl: null, date: "2025", ownOutlet: true, excerpt: "Article words.", factSentence: null };
    return raw;
  };

  it("fills the same fields and keeps no check record: the warning sits next to its clause row", async () => {
    const raw = importable();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await importFile(JSON.stringify(raw));
    await waitFor(() => expect(versionGroups().length).toBe(raw.documents.length));
    expect(screen.getByRole("status").textContent).toBe(t("form.importDone"));
    expect(within(versionGroups()[0]!).getByLabelText<HTMLInputElement>("Title").value).toBe(raw.documents[0].title);
    expect(screen.getByLabelText<HTMLInputElement>("Jurisdiction").value).toBe(raw.jurisdiction);
    expect(screen.getByLabelText<HTMLTextAreaElement>("Promise statement").value).toBe("A statement.");
    const row = clauseGroup(1).getAllByLabelText("Clause location")[0]!.closest("li")!;
    expect(row.textContent).toContain(`Note: ${t("issue.check_record_ignored")}`);
    // the stored check counts for nothing, and the promise carries no excerpt
    expect(container.querySelectorAll('[data-end="filled"]').length).toBe(0);
    expect(stored()).not.toMatch(/matched_official|Article words|ownOutlet/);
    expect(JSON.parse(stored()!).copiedFrom).toBeNull();
  });

  it("shows issue.import_not_json for text that is not JSON and changes nothing", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await user.type(screen.getByLabelText("Bill number"), "Kept 1");
    await addVersion(user);
    const before = stored();
    await importFile("{ this is not json");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(t("issue.import_not_json"));
    expect(screen.getByLabelText<HTMLInputElement>("Bill number").value).toBe("Kept 1");
    expect(versionGroups().length).toBe(1);
    expect(stored()).toBe(before);
  });

  it.each([["an empty list", "[]"], ["a number", "7"], ["null", "null"], ["an object that is no case", '{"a": 1}']])(
    "leaves the form as it was for %s, and says why",
    async (_name, contents) => {
      const user = userEvent.setup();
      render(<OwnBillForm referenceDate={REFERENCE} />);
      await user.type(screen.getByLabelText("Bill number"), "Kept 2");
      await importFile(contents);
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(t("form.importUnusable"));
      expect(screen.getByLabelText<HTMLInputElement>("Bill number").value).toBe("Kept 2");
    },
  );

  it("lists what the contract left out of the import, with its place in the file", async () => {
    const raw = fixture("us-116-hr748");
    raw.documents[1].title = ""; // a block issue: that version cannot be placed
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await importFile(JSON.stringify(raw));
    const heading = await screen.findByRole("heading", { name: t("form.importLeftOut") });
    expect(heading.parentElement!.textContent).toContain(`documents[1].title: ${t("issue.title_missing")}`);
    expect(versionGroups().length).toBe(2); // the other two versions are in the form
  });

  it("can import the same file twice", async () => {
    const raw = fixture("us-116-hr748");
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await importFile(JSON.stringify(raw));
    await waitFor(() => expect(versionGroups().length).toBe(3));
    await importFile(JSON.stringify(raw));
    await waitFor(() => expect(versionGroups().length).toBe(3));
  });
});

// ---- The copy in the browser session ----

describe("session storage", () => {
  it("keeps the form under billxray.own and brings it back", async () => {
    const user = userEvent.setup();
    expect(SESSION_KEY).toBe("billxray.own");
    const first = render(<OwnBillForm referenceDate={REFERENCE} />);
    await user.type(screen.getByLabelText("Bill number"), "Kept 3");
    await twoVersions(user);
    expect(JSON.parse(stored()!).bill.number).toBe("Kept 3");
    first.unmount();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    expect(screen.getByLabelText<HTMLInputElement>("Bill number").value).toBe("Kept 3");
    expect(versionGroups().length).toBe(2);
    expect(strip(container)).toBeTruthy(); // the scan and its comparison come back with it
  });

  it.each([["not JSON", "{ nope"], ["a number", "7"], ["no versions list", '{"bill": {}}'], ["a bad row id", '{"versions": [{"id": "x1"}], "links": []}'], ["the same row id twice", '{"versions": [{"id": "v1"}, {"id": "v1"}], "links": []}']])(
    "starts empty when the stored value is %s",
    (_name, value) => {
      sessionStorage.setItem(SESSION_KEY, value);
      render(<OwnBillForm referenceDate={REFERENCE} />);
      expect(screen.getByText(t("form.noVersions"))).toBeTruthy();
    },
  );

  it("sends nothing anywhere: no fetch, XMLHttpRequest or WebSocket call in any flow", async () => {
    const calls = vi.fn();
    vi.stubGlobal("fetch", calls);
    vi.stubGlobal("XMLHttpRequest", calls);
    vi.stubGlobal("WebSocket", calls);
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} samples={checkedSample()} />);
    await user.click(screen.getByRole("button", { name: "Start from United States" }));
    await importFile(JSON.stringify(fixture("us-116-hr748")));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    set(screen.getByLabelText("What to compare"), "clauses");
    await user.click(screen.getAllByRole("button", { name: "Scan next version" })[0]!);
    expect(calls).not.toHaveBeenCalled();
  });

  it("restores any form state exactly as stored, and nothing in it is a check record", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 6 }), { minLength: 12, maxLength: 12 }), fc.integer({ min: 0, max: 3 }), (words, n) => {
        let k = 0;
        const versions: VersionRow[] = Array.from({ length: n }, (_, i) => ({
          id: `v${++k}`, label: words[i]!, documentNumber: words[1]!, title: words[2]!, publisher: words[3]!, sourceUrl: words[4]!, language: words[5]!,
          sourceKind: SOURCE_KINDS[i % 3]!, factSentence: words[6]!, pastedText: words[7]!,
          dates: [{ id: `d${++k}`, kind: EVENT_KINDS[i]!, date: words[8]! }],
          clauses: [{ id: `c${++k}`, anchor: words[9]!, excerpt: words[10]! }],
        }));
        const state: FormState = {
          ...emptyForm(), versions, counter: k, bill: { jurisdiction: words[0]!, session: words[1]!, number: words[2]! },
          links: n > 0 ? [{ id: `p${++k}`, kind: "carried", from: PROMISE_REF, to: versions[0]!.id, evidence: ["", versions[0]!.clauses[0]!.id] }] : [],
          promise: { statement: words[3]!, sourceTitle: words[4]!, publisher: words[5]!, sourceUrl: words[6]!, date: words[7]!, factSentence: words[8]! },
          compare: { mode: "clauses", a: words[9]!, b: words[10]! },
          copiedFrom: n === 2 ? "us-116-hr748" : null,
        };
        state.counter = k;
        expect(restoreForm(JSON.parse(JSON.stringify(state)))).toEqual(state);
      }),
      { numRuns: 100 },
    );
  });
});

// ---- The whole case, typed ----

describe("a whole case entered by typing alone", () => {
  it("gives a difference, two anchors, a link that reads Not verified and a promise, without a sample or a file", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    await user.type(screen.getByLabelText("Jurisdiction"), "XX");
    await user.type(screen.getByLabelText("Session"), "Test session");
    await user.type(screen.getByLabelText("Bill number"), "Test Bill 1");

    for (const [n, label, text] of [[1, "Introduced", "Section 1 lowers the invented fee. Section 2 starts later."], [2, "Passed", "Section 1 lowers the invented fee by half. Section 2 starts later."]] as const) {
      await user.click(screen.getByRole("button", { name: "Add a version" }));
      const group = within(versionGroups()[n - 1]!);
      await user.type(group.getByLabelText("Version label"), label);
      await user.type(group.getByLabelText("Title"), `Test Bill 1, ${label}`);
      await user.type(group.getByLabelText("Publisher"), "Test Office");
      await user.type(group.getByLabelText("Source link"), `https://example.org/t${n}`);
      await user.type(group.getByLabelText("Pasted text"), text);
      await user.click(screen.getByRole("button", { name: `Add a clause (version ${n})` }));
      await user.type(clauseGroup(n).getByLabelText("Clause location"), "Section 1");
      await user.type(clauseGroup(n).getByLabelText("Excerpt"), n === 1 ? "Section 1 lowers the invented fee." : "Section 1 lowers the invented fee by half.");
    }
    expect(screen.queryAllByText(/^Problem:/).length).toBe(0);
    expect(scanBoxes(container).length).toBe(1);

    // a sentence-level difference, at once
    expect([...strip(container)!.querySelectorAll("ins")].map((e) => e.textContent).join("")).toContain("half");

    // a link, chosen by keyboard-reachable selects, reads Not verified
    await addLink(user, "carried", "Version 1, clause 1: Section 1", "Version 2, clause 1: Section 1", ["Version 1, clause 1: Section 1", "Version 2, clause 1: Section 1"]);
    expect(labels(container).filter((l) => l.includes("Carried into a later version") && l.includes("Not verified")).length).toBe(1);

    // a promise in the user's own words
    await user.type(screen.getByLabelText("Promise statement"), "A promise in my own words.");
    await user.type(screen.getByLabelText("Promise fact sentence"), "The article reports it.");
    expect(screen.queryAllByText(/^Problem:/).length).toBe(0);

    // two source anchors open
    const clauses = container.querySelectorAll<HTMLElement>('[data-node-id^="clause:"]');
    expect(clauses.length).toBe(2);
    for (const c of clauses) {
      await user.click(c);
      const panel = container.querySelector(".panel")!;
      expect(panel.textContent).toContain("Section 1");
      expect(panel.querySelector('a[href^="https:"]')).toBeTruthy(); // the original link
      await user.keyboard("{Escape}");
    }
    expect(screen.getByRole("note").textContent).toBe(t("form.banner"));
  }, 120_000);
});

// ---- Property 6 ----

describe("property 6: user cases stay unconfirmed", () => {
  it("for any form state with no row copied from a sample, no label reads as confirmed", () => {
    const text = fc.string({ maxLength: 8 });
    // Mostly well-formed rows, so that many generated links reach the screen as drawn lines.
    const row = fc.record({
      title: fc.oneof({ weight: 4, arbitrary: fc.constant("A title") }, { weight: 1, arbitrary: text }),
      publisher: fc.oneof({ weight: 4, arbitrary: fc.constant("A publisher") }, { weight: 1, arbitrary: text }),
      sourceUrl: fc.oneof({ weight: 4, arbitrary: fc.constant("https://example.org/a") }, { weight: 1, arbitrary: text }),
      label: text, documentNumber: fc.constantFrom("", "", "Other 1", "Other 2"), language: text,
      sourceKind: fc.constantFrom(...SOURCE_KINDS), factSentence: text, pastedText: fc.constantFrom("", "", "", "abc"),
      dates: fc.array(fc.record({ kind: fc.constantFrom("", ...EVENT_KINDS), date: fc.oneof(text, fc.constantFrom("2026", "2026-05-06", "2999-01-01")) }), { maxLength: 2 }),
      clauses: fc.array(fc.record({ anchor: fc.oneof({ weight: 4, arbitrary: fc.constant("Sec. 1") }, { weight: 1, arbitrary: text }), excerpt: text }), { maxLength: 3 }),
    });
    const link = fc.record({
      kind: fc.oneof({ weight: 12, arbitrary: fc.constantFrom(...PATH_KINDS) }, { weight: 1, arbitrary: fc.constant("" as const) }),
      from: fc.nat(), to: fc.nat(), evidence: fc.array(fc.nat(), { maxLength: 3 }),
    });
    const form = fc.record({
      bill: fc.record({ jurisdiction: text, session: text, number: fc.oneof(text, fc.constant("Bill 1")) }),
      versions: fc.array(row, { minLength: 1, maxLength: 3 }),
      links: fc.array(link, { maxLength: 4 }),
      promise: fc.record({ statement: text, sourceTitle: text, publisher: text, sourceUrl: text, date: text, factSentence: text }),
    });
    let drawn = 0; // lines that reached the screen over all runs: the property must not pass on an empty scan
    fc.assert(
      fc.property(form, (s) => {
        let n = 0;
        const versions: VersionRow[] = s.versions.map((v) => ({
          ...v, id: `v${++n}`,
          dates: v.dates.map((d) => ({ ...d, id: `d${++n}` })),
          clauses: v.clauses.map((c) => ({ ...c, id: `c${++n}` })),
        }));
        // Link ends are picked from the rows that exist, shaped by the kind so that many links fit
        // their kind (some do not, on purpose); evidence rows come from the clause rows.
        const vids = versions.map((v) => v.id);
        const cids = versions.flatMap((v) => v.clauses.map((c) => c.id));
        const of = (ids: string[], i: number) => ids[i % ids.length] ?? "";
        const ends = (kind: string, a: number, b: number): [string, string] =>
          kind === "next_version" || kind === "successor_document" ? [of(vids, a), of(vids, b)]
          : kind === "not_included" ? [a % 4 === 0 ? PROMISE_REF : of(cids, a), of(vids, b)]
          : [a % 4 === 0 ? PROMISE_REF : of(cids, a), of(cids, b)];
        const state: FormState = {
          ...emptyForm(), bill: s.bill, versions, promise: s.promise, counter: n,
          links: s.links.map((l, i) => {
            const [from, to] = ends(l.kind, l.from, l.to);
            return { id: `p${n + i + 1}`, kind: l.kind, from, to, evidence: l.evidence.map((e) => of(cids, e)) };
          }),
        };

        const { input } = toCaseInput(state);
        const parsed = parseCase(input, { referenceDate: REFERENCE, origin: "user", bundledChecks: [] });
        expect(parsed.model).not.toBeNull();
        const model = parsed.model!;
        expect(Object.values(model.gate).some((g) => g.pass)).toBe(false);
        expect(Object.values(model.paths).some((p) => p.status === "confirmed")).toBe(false);

        // the labels the screen draws: none without status text, none with a filled end
        const layout = layoutScan(model, { orientation: "horizontal", scanned: model.case.documents.length });
        expect(layout.labels.every((l) => l.statusKey !== null)).toBe(true);
        expect(layout.connectors.every((c) => c.status !== "confirmed")).toBe(true);
        drawn += layout.labels.length;
        if (model.case.documents.length === 0) return;
        const view = render(<ScanView model={model} />);
        expect(view.container.querySelectorAll('[data-end="filled"]').length).toBe(0);
        expect(view.container.textContent).not.toContain(t("panel.confirmed"));
        for (const l of labels(view.container)) expect(l).toMatch(/Not verified|Omission not verified/);
        view.unmount();
      }),
      { numRuns: 200 },
    );
    expect(drawn).toBeGreaterThan(20);
  }, 120_000);
});
