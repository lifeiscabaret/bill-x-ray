import type { Case, Issue } from "./types";

// Parse stage 2: URL normalization (design "URLs"). Only four fields are read or changed:
// documents[].sourceUrl, evidence[].check.url, evidence[].check.confirmedUrl and
// promise.sourceUrl. Nothing else in the Case is touched.

type JsonPath = (string | number)[];

/** `null`, empty and "unknown" mean a missing URL (research-data.md). */
export function isMissingUrl(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  const v = value.trim().toLowerCase();
  return v === "" || v === "unknown";
}

/** U+2236 becomes ":" and U+00B7 becomes "."; research rows carry these look-alikes. */
export function fixLookalikes(value: string): string {
  return value.replace(/\u2236/g, ":").replace(/\u00B7/g, ".");
}

/** An absolute http(s) URL with a host and no whitespace. */
export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\/[^\s/?#]+\S*$/i.test(value)) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "";
  } catch {
    return false;
  }
}

export function hasSessionToken(value: string): boolean {
  return /;jsessionid=/i.test(value);
}

function issue(path: JsonPath, code: Issue["code"], severity: Issue["severity"], message: string, params?: Record<string, string>): Issue {
  return { path, code, severity, ...(params ? { params } : {}), message };
}

/**
 * Normalizes one URL field. A missing value (and a malformed one) is reported, never
 * repaired. `nullIsMissing` is false where `null` only means "not recorded yet".
 */
function normalizeField(value: string | null, path: JsonPath, nullIsMissing: boolean): { value: string | null; issues: Issue[] } {
  const where = path.join(".");
  if (value === null) {
    return { value, issues: nullIsMissing ? [issue(path, "url_missing", "warn", `No URL at ${where}.`)] : [] };
  }
  if (isMissingUrl(value)) return { value, issues: [issue(path, "url_missing", "warn", `No URL at ${where}.`)] };
  const fixed = fixLookalikes(value);
  const issues: Issue[] = [];
  if (fixed !== value) {
    issues.push(issue(path, "url_lookalike_fixed", "warn", `Look-alike characters in the URL at ${where} were replaced.`, { from: value, to: fixed }));
  }
  if (!isHttpUrl(fixed)) {
    issues.push(issue(path, "url_invalid", "block", `The value at ${where} is not an absolute http(s) URL.`, { value: fixed }));
  } else if (hasSessionToken(fixed)) {
    issues.push(issue(path, "url_session_token", "warn", `The URL at ${where} carries a session token and may stop working.`));
  }
  return { value: fixed, issues };
}

/**
 * Stage 2. Returns a new Case (the input is not changed) and the URL issues. Paths index the
 * arrays of the Case it was given. Applying it to its own result changes nothing and
 * reports no `url_lookalike_fixed` again (design property 7).
 */
export function normalizeCaseUrls(c: Case): { case: Case; issues: Issue[] } {
  const issues: Issue[] = [];

  const documents = c.documents.map((d, i) => {
    const r = normalizeField(d.sourceUrl, ["documents", i, "sourceUrl"], true);
    issues.push(...r.issues);
    return r.value === d.sourceUrl ? d : { ...d, sourceUrl: r.value };
  });

  const evidence = c.evidence.map((e, i) => {
    // `check.url` is what the checker opened: null is normal until a check is recorded.
    const url = normalizeField(e.check.url, ["evidence", i, "check", "url"], e.check.state !== "not_checked");
    const confirmed = normalizeField(e.check.confirmedUrl, ["evidence", i, "check", "confirmedUrl"], false);
    issues.push(...url.issues, ...confirmed.issues);
    if (url.value === e.check.url && confirmed.value === e.check.confirmedUrl) return e;
    return { ...e, check: { ...e.check, url: url.value, confirmedUrl: confirmed.value } };
  });

  let promise = c.promise;
  if (promise) {
    const r = normalizeField(promise.sourceUrl, ["promise", "sourceUrl"], true);
    issues.push(...r.issues);
    if (r.value !== promise.sourceUrl) promise = { ...promise, sourceUrl: r.value };
  }

  return { case: { ...c, documents, evidence, ...(promise === undefined ? {} : { promise }) }, issues };
}
