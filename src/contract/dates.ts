import type { Case, DateView, Issue, LegislativeEvent } from "./types";

// Parse stage 5: dates and legislative events (design "Dates", Requirement 5). Nothing here
// computes one date from another or from rule text, and nothing reads the clock: the
// reference date is an input.

type JsonPath = (string | number)[];

/** A parsed date: its precision and the first and last day it can mean (YYYY-MM-DD). */
export interface DateRange {
  precision: "day" | "month" | "year";
  earliest: string;
  latest: string;
}

const PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number) => (m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
const two = (n: number) => String(n).padStart(2, "0");

/**
 * Reads YYYY-MM-DD, YYYY-MM or YYYY as a real calendar date and keeps its precision.
 * Returns null for anything else, including `unknown` (the caller handles that) and a day
 * that does not exist, such as 2026-02-30. A missing month or day is never filled in: the
 * range only says which days the written date can mean.
 */
export function parsePartialDate(value: string): DateRange | null {
  const m = PATTERN.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  if (m[2] === undefined) return { precision: "year", earliest: `${m[1]}-01-01`, latest: `${m[1]}-12-31` };
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  if (m[3] === undefined) return { precision: "month", earliest: `${m[1]}-${m[2]}-01`, latest: `${m[1]}-${m[2]}-${two(daysIn(y, mo))}` };
  const d = Number(m[3]);
  if (d < 1 || d > daysIn(y, mo)) return null;
  return { precision: "day", earliest: value, latest: value };
}

/** `date_format` (block) for every event whose `eventDate` is not a date of the four allowed forms. */
export function checkEventDates(c: Case): Issue[] {
  return c.events.flatMap((e, i): Issue[] =>
    e.eventDate === "unknown" || parsePartialDate(e.eventDate) !== null
      ? []
      : [{
          path: ["events", i, "eventDate"], code: "date_format", severity: "block", params: { value: e.eventDate },
          message: `The date "${e.eventDate}" at events[${i}] must be YYYY-MM-DD, YYYY-MM, YYYY or unknown.`,
        }],
  );
}

const TIMED_KINDS: readonly LegislativeEvent["eventKind"][] = ["effective", "applied"];

/**
 * `past` when the latest possible day is on or before the reference date, `scheduled` when the
 * earliest possible day is after it, `too_coarse` when the reference date falls inside the
 * period. Only `effective` and `applied` events are judged; every other kind, an `unknown`
 * date and an unusable reference date give `unknown`.
 */
export function timingOf(e: Pick<LegislativeEvent, "eventKind" | "eventDate">, referenceDate: string): DateView["timing"] {
  if (!TIMED_KINDS.includes(e.eventKind)) return "unknown";
  const range = parsePartialDate(e.eventDate);
  const reference = parsePartialDate(referenceDate);
  if (!range || reference?.precision !== "day") return "unknown";
  if (range.latest <= referenceDate) return "past";
  if (range.earliest > referenceDate) return "scheduled";
  return "too_coarse";
}

/**
 * One DateView per event. Two events with the same documentId, versionId and kind but different
 * dates both stay; each gets a `date_conflict` warning that names the others (Req 5.7).
 * Expects events whose dates passed `checkEventDates`.
 */
export function deriveDates(c: Case, referenceDate: string): { dates: Record<string, DateView>; issues: Issue[] } {
  const dates: Record<string, DateView> = {};
  const issues: Issue[] = [];
  c.events.forEach((e, i) => {
    const others = c.events.filter(
      (o) => o !== e && o.documentId === e.documentId && o.versionId === e.versionId && o.eventKind === e.eventKind && o.eventDate !== e.eventDate,
    );
    dates[e.eventId] = { timing: timingOf(e, referenceDate), conflictWith: others.map((o) => o.eventId) };
    if (others.length > 0) {
      const names = others.map((o) => o.eventId).join(", ");
      const path: JsonPath = ["events", i, "eventDate"];
      issues.push({
        path, code: "date_conflict", severity: "warn", params: { eventId: e.eventId, conflictWith: names },
        message: `The event "${e.eventId}" has a different ${e.eventKind} date than "${names}" on the same version; both are kept.`,
      });
    }
  });
  return { dates, issues };
}
