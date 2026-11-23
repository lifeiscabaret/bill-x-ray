import { describe, expect, it } from "vitest";
import { EVENT_KINDS, parseCase } from "../../src/contract";
import type { Case, EventKind, LegislativeEvent } from "../../src/contract";
import { checkEventDates, deriveDates, parsePartialDate, timingOf } from "../../src/contract/dates";
import { minimalCase, options, resolves } from "./helpers";

const REF = "2026-06-15"; // the fixed reference date of these tests

let counter = 0;
const event = (eventKind: EventKind, eventDate: string, extra: Partial<LegislativeEvent> = {}): LegislativeEvent => ({
  eventId: `evt-${++counter}`, documentId: "Bill 1", versionId: "v2", eventKind, eventDate, evidenceRefs: [], ...extra,
});

function parse(events: unknown[], referenceDate = REF) {
  const c = { ...minimalCase(), events } as unknown as Case;
  return { input: c, ...parseCase(c, { ...options, referenceDate }) };
}
const timingOfFirst = (kind: EventKind, date: string, referenceDate = REF) => {
  const e = event(kind, date);
  return parse([e], referenceDate).model!.dates[e.eventId]!.timing;
};

describe("parsePartialDate (5.1)", () => {
  it("keeps the precision and never fills in a missing month or day", () => {
    expect(parsePartialDate("2026-03-04")).toEqual({ precision: "day", earliest: "2026-03-04", latest: "2026-03-04" });
    expect(parsePartialDate("2026-03")).toEqual({ precision: "month", earliest: "2026-03-01", latest: "2026-03-31" });
    expect(parsePartialDate("2026")).toEqual({ precision: "year", earliest: "2026-01-01", latest: "2026-12-31" });
  });

  it("knows the length of each month, leap years included", () => {
    expect(parsePartialDate("2024-02")?.latest).toBe("2024-02-29");
    expect(parsePartialDate("2026-02")?.latest).toBe("2026-02-28");
    expect(parsePartialDate("1900-02")?.latest).toBe("1900-02-28");
    expect(parsePartialDate("2000-02")?.latest).toBe("2000-02-29");
    expect(parsePartialDate("2026-04")?.latest).toBe("2026-04-30");
    expect(parsePartialDate("2024-02-29")).not.toBeNull();
  });

  it.each([
    "2026-02-30", "2026-02-29", "2026-13", "2026-00", "2026-04-31", "2026-01-00", "2026-1-5", "20260105",
    " 2026", "2026 ", "26", "Unknown", "", "unknown ", "2026-03-04T10:00", "2026/03/04",
    "six months after promulgation", "공포 후 6개월",
  ])("rejects %j", (value) => {
    expect(parsePartialDate(value)).toBeNull();
  });
});

describe("date_format blocks a bad date (5.1)", () => {
  it("removes the event, lists it as excluded and keeps the others", () => {
    const good = event("passed", "2026-01-05");
    const bad = event("effective", "2026-02-30");
    const r = parse([good, bad]);
    const issue = r.issues.find((i) => i.code === "date_format")!;
    expect(issue).toMatchObject({ severity: "block", path: ["events", 1, "eventDate"], params: { value: "2026-02-30" } });
    expect(r.model!.case.events.map((e) => e.eventId)).toEqual([good.eventId]);
    expect(r.model!.excluded).toContainEqual({ path: ["events", 1], reason: "date_format" });
    expect(Object.keys(r.model!.dates)).toEqual([good.eventId]);
  });

  it("reports the input position when an earlier event was removed too", () => {
    const r = parse([event("passed", "x"), event("effective", "2026-13")]);
    expect(r.issues.filter((i) => i.code === "date_format").map((i) => i.path)).toEqual([["events", 0, "eventDate"], ["events", 1, "eventDate"]]);
    for (const i of r.issues) expect(resolves(r.input, i.path)).toBe(true);
  });

  it("accepts unknown, and the four allowed forms", () => {
    const r = parse(["unknown", "2026", "2026-03", "2026-03-04"].map((d) => event("passed", d)));
    expect(r.issues.filter((i) => i.severity === "block")).toEqual([]);
    expect(r.model!.case.events.map((e) => e.eventDate)).toEqual(["unknown", "2026", "2026-03", "2026-03-04"]);
  });

  it("checkEventDates reads the events it is given", () => {
    const c = { ...minimalCase(), events: [event("passed", "2026-5-1")] };
    expect(checkEventDates(c).map((i) => i.code)).toEqual(["date_format"]);
  });
});

describe("a date without a kind is blocked (5.4)", () => {
  it("blocks an event with no eventKind and gives it no date entry", () => {
    const { eventKind: _omit, ...noKind } = event("passed", "2026-01-05");
    const r = parse([noKind]);
    expect(r.issues.find((i) => i.code === "date_kind_missing")).toMatchObject({ severity: "block", path: ["events", 0, "eventKind"] });
    expect(r.model!.case.events).toEqual([]);
    expect(r.model!.dates).toEqual({});
  });

  it("blocks a kind that is not in the list", () => {
    const r = parse([{ ...event("passed", "2026-01-05"), eventKind: "in_force" }]);
    expect(r.issues.some((i) => i.severity === "block" && i.path[2] === "eventKind")).toBe(true);
    expect(r.model!.case.events).toEqual([]);
  });

  it("the kind list has the kinds of requirement 5.1", () => {
    for (const k of ["introduced", "passed", "promulgated", "published", "effective", "applied", "repealed", "postponed", "discarded", "other", "unknown"]) {
      expect(EVENT_KINDS).toContain(k);
    }
  });
});

describe("timing against the reference date (5.2)", () => {
  it("a future effective date is scheduled and never past", () => {
    expect(timingOfFirst("effective", "2026-08-11")).toBe("scheduled");
    expect(timingOfFirst("effective", "2026-06-16")).toBe("scheduled");
    expect(timingOfFirst("effective", "2027")).toBe("scheduled");
    expect(timingOfFirst("effective", "2026-07")).toBe("scheduled");
    expect(timingOfFirst("applied", "2026-12-01")).toBe("scheduled");
  });

  it("a date on or before the reference date is past", () => {
    expect(timingOfFirst("effective", "2026-06-15")).toBe("past");
    expect(timingOfFirst("effective", "2026-06-14")).toBe("past");
    expect(timingOfFirst("effective", "2026-05")).toBe("past");
    expect(timingOfFirst("applied", "2025")).toBe("past");
  });

  it("a year-only date that spans the reference date is too coarse", () => {
    expect(timingOfFirst("effective", "2026")).toBe("too_coarse");
    expect(timingOfFirst("applied", "2026")).toBe("too_coarse");
    expect(timingOfFirst("effective", "2026", "2026-01-01")).toBe("too_coarse");
    expect(timingOfFirst("effective", "2026", "2026-12-31")).toBe("past"); // the whole year is over on its last day
    expect(timingOfFirst("effective", "2026", "2025-12-31")).toBe("scheduled");
  });

  it("a month-only date that spans the reference date is too coarse", () => {
    expect(timingOfFirst("effective", "2026-06")).toBe("too_coarse");
    expect(timingOfFirst("effective", "2026-06", "2026-06-30")).toBe("past");
    expect(timingOfFirst("effective", "2026-06", "2026-05-31")).toBe("scheduled");
  });

  it("an unknown date is unknown", () => {
    expect(timingOfFirst("effective", "unknown")).toBe("unknown");
    expect(timingOfFirst("applied", "unknown")).toBe("unknown");
  });

  it("other kinds are not judged, whatever their date", () => {
    for (const kind of EVENT_KINDS.filter((k) => k !== "effective" && k !== "applied")) {
      expect(timingOfFirst(kind, "2030-01-01"), kind).toBe("unknown");
      expect(timingOfFirst(kind, "2020-01-01"), kind).toBe("unknown");
    }
  });

  it("an unusable reference date judges nothing", () => {
    for (const ref of ["", "unknown", "2026", "2026-06", "yesterday", "2026-02-30"]) {
      expect(timingOfFirst("effective", "2020-01-01", ref), ref).toBe("unknown");
    }
  });

  it("the same input gives the same timing on a different reference date (no clock)", () => {
    expect(timingOfFirst("effective", "2026-08-11", "2026-08-10")).toBe("scheduled");
    expect(timingOfFirst("effective", "2026-08-11", "2026-08-11")).toBe("past");
  });

  it("timingOf can be called on its own", () => {
    expect(timingOf({ eventKind: "effective", eventDate: "2030-01-01" }, REF)).toBe("scheduled");
  });
});

describe("no date is computed from another date or from a note (5.4)", () => {
  it.each(["six months after promulgation", "공포 후 6개월", "6 months after promulgation", "2026-02-10 + 6 months"])(
    "the note %j produces no date",
    (note) => {
      const promulgated = event("promulgated", "2026-02-10");
      const r = parse([promulgated, event("effective", note)]);
      expect(r.issues.find((i) => i.code === "date_format")).toBeDefined();
      expect(r.model!.case.events.map((e) => e.eventKind)).toEqual(["promulgated"]);
      expect(Object.keys(r.model!.dates)).toEqual([promulgated.eventId]);
    },
  );

  it("an effective event next to a promulgated date stays unknown when its own date is unknown", () => {
    const effective = event("effective", "unknown");
    const r = parse([event("promulgated", "2026-02-10"), effective]);
    expect(r.model!.case.events.map((e) => e.eventDate)).toEqual(["2026-02-10", "unknown"]);
    expect(r.model!.dates[effective.eventId]).toEqual({ timing: "unknown", conflictWith: [] });
  });

  it("a note on the path or the document adds no event", () => {
    const c = minimalCase();
    c.events = [event("promulgated", "2026-02-10")];
    c.paths[0]!.note = "Takes effect six months after promulgation.";
    c.documents[1]!.localEventLabel = "공포 후 6개월 시행";
    const r = parseCase(c, { ...options, referenceDate: REF });
    expect(r.model!.case.events).toHaveLength(1);
    expect(Object.keys(r.model!.dates)).toHaveLength(1);
  });
});

describe("date_conflict (5.3)", () => {
  it("keeps both events and names the other in each warning", () => {
    const a = event("effective", "2026-08-11", { eventId: "evt-a" });
    const b = event("effective", "2026-09-01", { eventId: "evt-b" });
    const r = parse([a, b]);
    expect(r.model!.case.events.map((e) => e.eventId)).toEqual(["evt-a", "evt-b"]);
    const warnings = r.issues.filter((i) => i.code === "date_conflict");
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.severity)).toEqual(["warn", "warn"]);
    expect(warnings[0]).toMatchObject({ path: ["events", 0, "eventDate"], params: { eventId: "evt-a", conflictWith: "evt-b" } });
    expect(warnings[1]).toMatchObject({ path: ["events", 1, "eventDate"], params: { eventId: "evt-b", conflictWith: "evt-a" } });
    expect(r.model!.dates["evt-a"]!.conflictWith).toEqual(["evt-b"]);
    expect(r.model!.dates["evt-b"]!.conflictWith).toEqual(["evt-a"]);
  });

  it("each of three events names the other two", () => {
    const r = parse(["2026", "2026-03", "2027"].map((d, i) => event("amended", d, { eventId: `e${i}` })));
    expect(r.model!.dates["e0"]!.conflictWith).toEqual(["e1", "e2"]);
    expect(r.model!.dates["e2"]!.conflictWith).toEqual(["e0", "e1"]);
  });

  it("keeps the timing of each conflicting event", () => {
    const r = parse([event("effective", "2026-01-01", { eventId: "p" }), event("effective", "2027-01-01", { eventId: "f" })]);
    expect(r.model!.dates["p"]!.timing).toBe("past");
    expect(r.model!.dates["f"]!.timing).toBe("scheduled");
  });

  it.each([
    ["the same date twice", event("effective", "2026-08-11"), event("effective", "2026-08-11")],
    ["a different kind", event("effective", "2026-08-11"), event("applied", "2026-09-01")],
    ["a different version", event("effective", "2026-08-11"), event("effective", "2026-09-01", { versionId: "v1" })],
  ])("no conflict for %s", (_name, a, b) => {
    const r = parse([a, b]);
    expect(r.issues.filter((i) => i.code === "date_conflict")).toEqual([]);
    expect(r.model!.case.events).toHaveLength(2);
    expect(Object.values(r.model!.dates).map((d) => d.conflictWith)).toEqual([[], []]);
  });

  it("an unblocked conflict never blocks or removes a record", () => {
    const r = parse([event("passed", "2026-01-05"), event("passed", "2026-01-06")]);
    expect(r.model!.excluded).toEqual([]);
  });

  it("deriveDates can be called on its own", () => {
    const c = { ...minimalCase(), events: [event("passed", "2026"), event("passed", "2027")] };
    expect(deriveDates(c, REF).issues.map((i) => i.code)).toEqual(["date_conflict", "date_conflict"]);
  });
});

describe("the dates map", () => {
  it("has one entry for each event in the model and none for removed ones", () => {
    const events = [event("passed", "2026-01-05"), event("effective", "bad"), event("effective", "2030-01-01")];
    const r = parse(events);
    expect(Object.keys(r.model!.dates).sort()).toEqual([events[0]!.eventId, events[2]!.eventId].sort());
  });

  it("is empty when the case has no events, and the reference date is passed through", () => {
    const r = parse([], "2031-01-02");
    expect(r.model!.dates).toEqual({});
    expect(r.model!.referenceDate).toBe("2031-01-02");
  });

  it("does not change the date strings of the events it keeps", () => {
    const r = parse([event("effective", "2026"), event("effective", "2026-08")]);
    expect(r.model!.case.events.map((e) => e.eventDate)).toEqual(["2026", "2026-08"]);
  });
});
