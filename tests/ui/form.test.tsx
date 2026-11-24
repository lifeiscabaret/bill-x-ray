import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCase } from "../../src/contract";
import { EVENT_KINDS, ISSUE_CODES, SOURCE_KINDS } from "../../src/contract/types";
import en from "../../src/i18n/en.json";
import { t } from "../../src/i18n/t";
import { OwnBillForm } from "../../src/ui/form/OwnBillForm";
import {
  emptyForm, fieldFor, newClause, newDate, newVersion, toCaseInput, type FormState, type VersionRow,
} from "../../src/ui/form/toCaseInput";

const REFERENCE = "2026-11-24";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---- Helpers ----

const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const versionGroup = (n: number, label?: string) =>
  within(screen.getByRole("group", { name: label ? `Version ${n}: ${label}` : `Version ${n}` }));
const scanBoxes = (c: HTMLElement) => c.querySelectorAll(".scan-box");

/** The text of every message the field points at with aria-describedby. */
function described(el: HTMLElement): string {
  return (el.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" | ");
}

async function addVersion(user: ReturnType<typeof userEvent.setup>, fill?: Partial<Record<string, string>>) {
  await user.click(screen.getByRole("button", { name: "Add a version" }));
  const n = screen.getAllByRole("group").filter((g) => /^Version \d/.test(g.querySelector("legend")?.textContent ?? "")).length;
  const group = within(
    screen.getAllByRole("group").filter((g) => /^Version \d/.test(g.querySelector("legend")?.textContent ?? ""))[n - 1]!,
  );
  for (const [label, value] of Object.entries(fill ?? {})) set(group.getByLabelText(label), value!);
  return group;
}

const VALID = { Title: "Synthetic title", Publisher: "Synthetic publisher", "Source link": "https://example.org/a" };

// ---- The fields and their messages ----

describe("the form", () => {
  it("starts with the bill fields, no versions and no scan", () => {
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Scan your own bill");
    for (const label of ["Jurisdiction", "Session", "Bill number"]) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.getByText(t("form.noVersions"))).toBeTruthy();
    expect(scanBoxes(container).length).toBe(0);
    expect(screen.getByText(t("form.nothingToScan"))).toBeTruthy();
  });

  it("shows a broken source link's block message next to its field and keeps the version out of the scan", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, { ...VALID, "Source link": "not a link" });
    const url = group.getByLabelText("Source link");
    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect(described(url)).toBe(`Problem: ${t("issue.url_invalid")}`);
    // the message sits in the same field block as the input
    expect(url.closest(".form__field")!.textContent).toContain(t("issue.url_invalid"));
    // the other fields of the row carry no message
    expect(group.getByLabelText("Title").getAttribute("aria-invalid")).toBeNull();
    expect(group.getByText(t("form.leftOut"))).toBeTruthy();
    expect(scanBoxes(container).length).toBe(0);

    set(url, "https://example.org/a");
    expect(url.getAttribute("aria-invalid")).toBeNull();
    expect(described(url)).toBe("");
    expect(screen.queryByText(t("form.leftOut"))).toBeNull();
    expect(scanBoxes(container).length).toBe(1);
  });

  it("a warning keeps the version in the scan", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, { Title: "Synthetic title", Publisher: "Synthetic publisher" });
    const url = group.getByLabelText("Source link");
    expect(described(url)).toBe(`Note: ${t("issue.url_missing")}`);
    expect(url.getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByText(t("form.leftOut"))).toBeNull();
    expect(scanBoxes(container).length).toBe(1);
  });

  it("asks for a title and a publisher next to their fields", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user);
    expect(described(group.getByLabelText("Title"))).toBe(`Problem: ${t("issue.title_missing")}`);
    expect(described(group.getByLabelText("Publisher"))).toBe(`Problem: ${t("issue.publisher_missing")}`);
    expect(scanBoxes(container).length).toBe(0);
  });

  it("says when an excerpt is not in the pasted text, next to the excerpt, and leaves that clause out", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await addVersion(user, { ...VALID, "Pasted text": "alpha beta" });
    await user.click(screen.getByRole("button", { name: "Add a clause (version 1)" }));
    const clauses = within(screen.getByRole("group", { name: "Clauses of version 1" }));
    set(clauses.getByLabelText("Clause location"), "Sec. 1");
    const excerpt = clauses.getByLabelText("Excerpt");
    set(excerpt, "gamma");
    expect(described(excerpt)).toContain(t("issue.excerpt_not_in_pasted_text"));
    expect(excerpt.getAttribute("aria-invalid")).toBe("true");
    expect(described(clauses.getByLabelText("Clause location"))).toContain(t("issue.anchor_not_in_pasted_text"));
    expect(clauses.getByText(t("form.leftOut"))).toBeTruthy();
    set(excerpt, "alpha");
    expect(described(excerpt)).not.toContain(t("issue.excerpt_not_in_pasted_text"));
    expect(clauses.queryByText(t("form.leftOut"))).toBeNull();
  });

  it("names the character count and the limit of a long excerpt", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await addVersion(user, VALID);
    await user.click(screen.getByRole("button", { name: "Add a clause (version 1)" }));
    const clauses = within(screen.getByRole("group", { name: "Clauses of version 1" }));
    set(clauses.getByLabelText("Clause location"), "Sec. 1");
    set(clauses.getByLabelText("Excerpt"), "x".repeat(301));
    expect(described(clauses.getByLabelText("Excerpt"))).toContain("The excerpt has 301 characters; the limit here is 300.");
  });

  it("puts messages for a record that points at a left-out record on that record's row", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await addVersion(user, { ...VALID, "Source link": "nope" }); // the version is left out ...
    await user.click(screen.getByRole("button", { name: "Add a clause (version 1)" }));
    const clauses = within(screen.getByRole("group", { name: "Clauses of version 1" }));
    set(clauses.getByLabelText("Clause location"), "Sec. 1"); // ... so its clause cannot point at it
    expect(clauses.getByText(t("issue.ref_unresolved"))).toBeTruthy();
    expect(clauses.getByText(t("form.leftOut"))).toBeTruthy();
  });
});

// ---- Dates ----

describe("dates", () => {
  it("offers only the contract's date kinds", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, VALID);
    await user.click(group.getByRole("button", { name: "Add a date (version 1)" }));
    const kind = group.getByLabelText("Kind of date") as HTMLSelectElement;
    const values = [...kind.options].map((o) => o.value);
    expect(values).toEqual(["", ...EVENT_KINDS]);
    expect([...kind.options].slice(1).map((o) => o.textContent)).toEqual(EVENT_KINDS.map((k) => t(`dateKind.${k}`)));
    // the other choice lists are the contract's lists too
    const source = group.getByLabelText("Kind of source") as HTMLSelectElement;
    expect([...source.options].map((o) => o.value)).toEqual([...SOURCE_KINDS]);
  });

  it("takes only the dates the user knows: a blank row is not sent, a kind without a date stays unknown", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, VALID);
    await user.click(group.getByRole("button", { name: "Add a date (version 1)" }));
    expect(screen.queryAllByText(/^Problem:/).length).toBe(0);
    expect(container.querySelector(".scan-box")!.textContent).not.toContain("Effective");
    set(group.getByLabelText("Kind of date"), "effective");
    expect(screen.queryAllByText(/^Problem:/).length).toBe(0); // a kind with no date is allowed
    expect(container.querySelector(".scan-box")!.textContent).toContain(`Effective: ${t("timing.unknown")}`);
  });

  it("shows a bad date and a missing kind next to their own fields", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, VALID);
    await user.click(group.getByRole("button", { name: "Add a date (version 1)" }));
    set(group.getByLabelText("Date"), "2026-02-30");
    expect(described(group.getByLabelText("Kind of date"))).toBe(`Problem: ${t("issue.date_kind_missing")}`);
    set(group.getByLabelText("Kind of date"), "effective");
    expect(described(group.getByLabelText("Date"))).toContain(`Problem: ${t("issue.date_format")}`);
    expect(group.getByLabelText("Date").getAttribute("aria-invalid")).toBe("true");
    set(group.getByLabelText("Date"), "2026-12");
    expect(described(group.getByLabelText("Date"))).not.toContain(t("issue.date_format"));
  });

  it("shows a future effective date as scheduled, never as in effect", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, VALID);
    await user.click(group.getByRole("button", { name: "Add a date (version 1)" }));
    set(group.getByLabelText("Kind of date"), "effective");
    set(group.getByLabelText("Date"), "2099-01-01");
    const scan = container.querySelector(".scan-box")!.textContent!;
    expect(scan).toContain(t("timing.scheduled"));
    expect(scan).not.toMatch(/in effect/i);
  });
});

// ---- Buttons and the keyboard ----

describe("buttons by keyboard", () => {
  const legends = () =>
    screen.getAllByRole("group").map((g) => g.querySelector("legend")?.textContent ?? "").filter((l) => /^Version \d/.test(l));

  it("every add, remove and move button can be reached and pressed with Enter or Space", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    const add = screen.getByRole("button", { name: "Add a version" });
    add.focus();
    await user.keyboard("{Enter}");
    // focus moved to the new version's first field
    expect(document.activeElement!.id).toBe("own-v1-label");
    screen.getByRole("button", { name: "Add a version" }).focus();
    await user.keyboard(" ");
    expect(legends()).toEqual(["Version 1", "Version 2"]);
    set(screen.getAllByLabelText("Version label")[0]!, "First");
    set(screen.getAllByLabelText("Version label")[1]!, "Second");
    expect(legends()).toEqual(["Version 1: First", "Version 2: Second"]);

    // every button is in the tab order
    for (const b of screen.getAllByRole("button")) expect(b.tabIndex).toBeGreaterThanOrEqual(0);

    // move down with Enter, then move up with Space; focus stays on the pressed button
    const down = screen.getByRole("button", { name: "Move down (version 1)" });
    down.focus();
    await user.keyboard("{Enter}");
    expect(legends()).toEqual(["Version 1: Second", "Version 2: First"]);
    expect(document.activeElement).toBe(document.getElementById("own-v1-down"));
    const up = screen.getByRole("button", { name: "Move up (version 2)" });
    up.focus();
    await user.keyboard(" ");
    expect(legends()).toEqual(["Version 1: First", "Version 2: Second"]);
    expect(document.activeElement).toBe(document.getElementById("own-v1-up"));
    screen.getByRole("button", { name: "Move down (version 1)" }).focus();
    await user.keyboard("{Enter}");
    expect(legends()).toEqual(["Version 1: Second", "Version 2: First"]);

    // the first version cannot move up, the last cannot move down: nothing happens, focus stays
    const first = screen.getByRole("button", { name: "Move up (version 1)" });
    first.focus();
    await user.keyboard("{Enter}");
    expect(legends()).toEqual(["Version 1: Second", "Version 2: First"]);
    expect(document.activeElement).toBe(first);

    // remove: focus goes to "Add a version"
    screen.getByRole("button", { name: "Remove version (version 2)" }).focus();
    await user.keyboard("{Enter}");
    expect(legends()).toEqual(["Version 1: Second"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a version" }));
  });

  it("dates and clauses are added and removed by keyboard, and focus lands somewhere useful", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    await addVersion(user, VALID);

    screen.getByRole("button", { name: "Add a date (version 1)" }).focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByLabelText("Kind of date"));
    screen.getByRole("button", { name: "Remove date (version 1, date 1)" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByLabelText("Kind of date")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a date (version 1)" }));

    screen.getByRole("button", { name: "Add a clause (version 1)" }).focus();
    await user.keyboard(" ");
    expect(document.activeElement).toBe(screen.getByLabelText("Clause location"));
    screen.getByRole("button", { name: "Remove clause (version 1, clause 1)" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByLabelText("Clause location")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add a clause (version 1)" }));
  });
});

// ---- News from another outlet (D-016) ----

describe("news from another outlet", () => {
  it("takes a fact sentence and no excerpt, whatever was typed before", async () => {
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, VALID);
    await user.click(screen.getByRole("button", { name: "Add a clause (version 1)" }));
    const clauses = within(screen.getByRole("group", { name: "Clauses of version 1" }));
    set(clauses.getByLabelText("Clause location"), "Sec. 1");
    set(clauses.getByLabelText("Excerpt"), "an official passage");
    expect(group.getByLabelText("Pasted text")).toBeTruthy();
    expect(group.queryByLabelText("Fact sentence")).toBeNull();

    set(group.getByLabelText("Kind of source"), "news");
    expect(group.getByLabelText("Fact sentence")).toBeTruthy();
    expect(group.queryByLabelText("Pasted text")).toBeNull();
    expect(clauses.queryByLabelText("Excerpt")).toBeNull();
    expect(clauses.getByText(t("form.newsNoExcerpt"))).toBeTruthy();
    // nothing typed before reaches the contract as an excerpt of news
    expect(screen.queryByText(new RegExp(t("issue.news_excerpt_not_allowed").slice(0, 20)))).toBeNull();
    expect(screen.queryAllByText(/^Problem:/).length).toBe(0);

    set(group.getByLabelText("Kind of source"), "official");
    expect(clauses.getByLabelText("Excerpt")).toBeTruthy();
  });
});

// ---- Nothing is confirmed here (D-009) ----

describe("no confirmation", () => {
  it("has no control that marks anything as confirmed", async () => {
    const user = userEvent.setup();
    const { container } = render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, VALID);
    await user.click(group.getByRole("button", { name: "Add a date (version 1)" }));
    await user.click(screen.getByRole("button", { name: "Add a clause (version 1)" }));
    expect(container.querySelectorAll('input[type="checkbox"], input[type="radio"]').length).toBe(0);
    for (const b of container.querySelectorAll("button:not(.scan-view button)")) expect(b.textContent).not.toMatch(/confirm/i);
    for (const o of container.querySelectorAll("option")) expect(o.textContent).not.toMatch(/confirm/i);
    expect(container.textContent).not.toContain(t("panel.confirmed"));
  });

  it("builds only empty check records and sends no path", () => {
    const state = sampleState();
    const { input } = toCaseInput(state);
    for (const e of input.evidence as { check: Record<string, unknown> }[]) {
      expect(e.check).toEqual({ state: "not_checked", url: null, checkedBy: null, checkedAt: null, confirmedBy: null, confirmedAt: null, confirmedUrl: null });
    }
    expect(input.paths).toEqual([]);
    const parsed = parseCase(input, { referenceDate: REFERENCE, origin: "user" });
    expect(parsed.model!.origin).toBe("user");
    expect(Object.values(parsed.model!.gate).every((g) => !g.pass)).toBe(true);
  });
});

// ---- toCaseInput ----

function version(id: string, change: Partial<VersionRow> = {}): VersionRow {
  return { ...newVersion(id), title: "Synthetic title", publisher: "Synthetic publisher", sourceUrl: "https://example.org/a", ...change };
}
function sampleState(): FormState {
  const v1 = version("v1", { label: "Draft", dates: [{ ...newDate("d3"), kind: "introduced", date: "2026-01-02" }], clauses: [{ ...newClause("c4"), anchor: "Sec. 1", excerpt: "one two" }], pastedText: "one two three" });
  const v2 = version("v2", { documentNumber: "Number B", language: "", sourceKind: "news", factSentence: "A sentence.", pastedText: "ignored", clauses: [{ ...newClause("c5"), anchor: "Para 2", excerpt: "must not travel" }] });
  return { bill: { jurisdiction: " XX ", session: "", number: " Number A " }, versions: [v1, v2], counter: 5 };
}

describe("toCaseInput", () => {
  it("maps the fields to contract input with origin-neutral plain values", () => {
    const { input } = toCaseInput(sampleState());
    expect(input).toMatchObject({ contractVersion: 1, title: "Number A", session: null, paths: [] });
    expect(input.jurisdiction).toBe("XX");
    const [d1, d2] = input.documents as Record<string, unknown>[];
    expect(d1).toMatchObject({ documentId: "Number A", versionId: "v1", localEventLabel: "Draft", pastedText: "one two three", sourceKind: "official", language: "en" });
    // another number for one version; an empty language is "und"; news carries no pasted text
    expect(d2).toMatchObject({ documentId: "Number B", versionId: "v2", localEventLabel: null, factSentence: "A sentence.", pastedText: null, language: "und" });
    expect(d1).not.toHaveProperty("factSentence");
    expect(input.events).toEqual([{ eventId: "d3", documentId: "Number A", versionId: "v1", eventKind: "introduced", eventDate: "2026-01-02", evidenceRefs: [] }]);
  });

  it("sends no excerpt for news from another outlet, even if one was typed", () => {
    const { input } = toCaseInput(sampleState());
    const [e1, e2] = input.evidence as { excerpt: string; documentId: string }[];
    expect(e1!.excerpt).toBe("one two");
    expect(e2).toMatchObject({ excerpt: "", documentId: "Number B" });
    const parsed = parseCase(input, { referenceDate: REFERENCE, origin: "user" });
    expect(parsed.issues.filter((i) => i.severity === "block")).toEqual([]);
  });

  it("leaves out blank date and clause rows, and keeps ids from the rows", () => {
    const v = version("v1", { dates: [newDate("d1"), { ...newDate("d2"), kind: "effective" }], clauses: [newClause("c3")] });
    const { input } = toCaseInput({ ...emptyForm(), versions: [v], counter: 3 });
    expect(input.evidence).toEqual([]);
    expect(input.events).toEqual([{ eventId: "d2", documentId: "", versionId: "v1", eventKind: "effective", eventDate: "unknown", evidenceRefs: [] }]);
  });

  it("maps JSON paths to field ids, and a longer path to its row", () => {
    const { fields } = toCaseInput(sampleState());
    const id = (...path: (string | number)[]) => fieldFor(fields, path);
    expect(id("jurisdiction")).toBe("own-bill-jurisdiction");
    expect(id("session")).toBe("own-bill-session");
    expect(id("documents", 0, "sourceUrl")).toBe("own-v1-sourceUrl");
    expect(id("documents", 1, "title")).toBe("own-v2-title");
    expect(id("documents", 1, "versionId")).toBe("own-v2-label");
    expect(id("evidence", 1, "anchor")).toBe("own-c5-anchor");
    expect(id("evidence", 0, "check", "url")).toBe("own-c4"); // no field of its own: the row
    expect(id("events", 0, "eventKind")).toBe("own-d3-kind");
    expect(id("events", 0, "eventDate")).toBe("own-d3-date");
    expect(id("documents", 5, "title")).toBeNull();
    expect(id("paths", 0)).toBeNull();
    expect(id()).toBeNull();
  });

  it("puts every issue of any form state on a field or a row", () => {
    const text = fc.string({ maxLength: 12 });
    const state = fc.record({
      bill: fc.record({ jurisdiction: text, session: text, number: text }),
      versions: fc.array(
        fc.record({
          label: text, documentNumber: text, title: text, publisher: text, sourceUrl: fc.oneof(text, fc.constant("https://example.org/a")),
          language: text, sourceKind: fc.constantFrom(...SOURCE_KINDS), factSentence: text, pastedText: text,
          dates: fc.array(fc.record({ kind: fc.constantFrom("", ...EVENT_KINDS), date: fc.oneof(text, fc.constantFrom("2026", "2026-05", "2026-05-06")) }), { maxLength: 3 }),
          clauses: fc.array(fc.record({ anchor: text, excerpt: text }), { maxLength: 3 }),
        }),
        { maxLength: 3 },
      ),
    });
    fc.assert(
      fc.property(state, (s) => {
        let n = 0;
        const versions: VersionRow[] = s.versions.map((v, i) => ({
          ...v, id: `v${++n}-${i}`,
          dates: v.dates.map((d) => ({ ...d, id: `d${++n}` })),
          clauses: v.clauses.map((c) => ({ ...c, id: `c${++n}` })),
        }));
        const { input, fields } = toCaseInput({ bill: s.bill, versions, counter: n });
        const parsed = parseCase(input, { referenceDate: REFERENCE, origin: "user" });
        expect(parsed.model).not.toBeNull();
        for (const issue of parsed.issues) expect(fieldFor(fields, issue.path), JSON.stringify(issue.path)).not.toBeNull();
        // origin user: nothing is ever confirmed by what was typed
        expect(Object.values(parsed.model!.gate).some((g) => g.pass)).toBe(false);
        expect(Object.values(parsed.model!.paths).some((p) => p.status === "confirmed")).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

// ---- Strings ----

describe("issue strings", () => {
  it("has a sentence for every code in ISSUE_CODES", () => {
    for (const code of ISSUE_CODES) {
      expect(typeof (en.issue as Record<string, unknown>)[code], code).toBe("string");
      expect(t(`issue.${code}`).trim(), code).not.toBe("");
    }
  });
});

// ---- Network ----

describe("network", () => {
  it("makes no request while the form is used", async () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    const wsSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("XMLHttpRequest", xhrSpy);
    vi.stubGlobal("WebSocket", wsSpy);
    const user = userEvent.setup();
    render(<OwnBillForm referenceDate={REFERENCE} />);
    const group = await addVersion(user, { ...VALID, "Source link": "broken" });
    await user.click(group.getByRole("button", { name: "Add a date (version 1)" }));
    await user.click(screen.getByRole("button", { name: "Add a clause (version 1)" }));
    set(group.getByLabelText("Source link"), "https://example.org/a");
    await user.click(screen.getByRole("button", { name: "Remove version (version 1)" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(wsSpy).not.toHaveBeenCalled();
  });
});
