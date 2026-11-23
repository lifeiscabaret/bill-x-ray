import { describe, expect, it } from "vitest";
import { parseCase } from "../../src/contract";
import { fixLookalikes, hasSessionToken, isHttpUrl, isMissingUrl, normalizeCaseUrls } from "../../src/contract/urls";
import { richCase, urlFixtures } from "../fixtures/contract/stage23";
import { runFixture } from "./fixture-runner";
import { options } from "./helpers";

describe("URL fixtures (parse stage 2)", () => {
  it.each(urlFixtures.map((f) => [f.name, f] as const))("%s", (_name, fx) => {
    runFixture(fx);
  });

  it("every fixture gives the right code and severity (block removes the record, warn keeps it)", () => {
    const seen = new Set(urlFixtures.flatMap((f) => f.expect.map(([, code, severity]) => `${code}:${severity}`)));
    for (const key of ["url_lookalike_fixed:warn", "url_missing:warn", "url_invalid:block", "url_session_token:warn"]) {
      expect(seen.has(key), key).toBe(true);
    }
  });
});

describe("URL helpers", () => {
  it("treats null, empty and unknown as missing", () => {
    for (const v of [null, undefined, "", "  ", "unknown", "UNKNOWN"]) expect(isMissingUrl(v)).toBe(true);
    expect(isMissingUrl("https://example.org")).toBe(false);
  });

  it("replaces only U+2236 and U+00B7", () => {
    expect(fixLookalikes("https\u2236//example\u00B7org/a\u00B7b")).toBe("https://example.org/a.b");
    expect(fixLookalikes("https://example.org/x-y_z")).toBe("https://example.org/x-y_z");
  });

  it("accepts absolute http(s) URLs only", () => {
    for (const v of ["http://example.org", "https://example.org/a?b=1#c", "HTTPS://example.org:8443/x"]) expect(isHttpUrl(v), v).toBe(true);
    for (const v of ["", "example.org", "ftp://example.org", "https://", "https:///x", "https://a b.org", " https://example.org", "mailto:someone", "//example.org"]) {
      expect(isHttpUrl(v), v).toBe(false);
    }
  });

  it("finds a session token", () => {
    expect(hasSessionToken("https://example.org/a;jsessionid=1")).toBe(true);
    expect(hasSessionToken("https://example.org/a;JSESSIONID=1")).toBe(true);
    expect(hasSessionToken("https://example.org/a")).toBe(false);
  });
});

describe("normalizeCaseUrls", () => {
  it("fixes the four URL fields, reports old and new value, and keeps everything else", () => {
    const c = richCase();
    const colon = "\u2236";
    c.documents[0]!.sourceUrl = `https${colon}//example.org/a`;
    c.evidence[0]!.check = { ...c.evidence[0]!.check, url: `https${colon}//example.org/b`, confirmedUrl: `https${colon}//example.org/c` };
    c.promise!.sourceUrl = `https${colon}//example.org/d`;
    c.evidence[0]!.excerpt = `Kept as written\u00B7here${colon}`;
    const r = normalizeCaseUrls(c);
    expect(r.case.documents[0]!.sourceUrl).toBe("https://example.org/a");
    expect(r.case.evidence[0]!.check.url).toBe("https://example.org/b");
    expect(r.case.evidence[0]!.check.confirmedUrl).toBe("https://example.org/c");
    expect(r.case.promise!.sourceUrl).toBe("https://example.org/d");
    expect(r.case.evidence[0]!.excerpt).toBe(`Kept as written\u00B7here${colon}`);
    expect(r.issues.map((i) => i.code)).toEqual(Array(4).fill("url_lookalike_fixed"));
    expect(r.issues[0]!.params).toEqual({ from: `https${colon}//example.org/a`, to: "https://example.org/a" });
    expect(c.documents[0]!.sourceUrl).toBe(`https${colon}//example.org/a`); // the input is not changed
  });

  it("never repairs a missing or invalid value", () => {
    const c = richCase();
    c.documents[0]!.sourceUrl = "unknown";
    c.documents[1]!.sourceUrl = "ftp\u2236//example.org/x";
    const r = normalizeCaseUrls(c);
    expect(r.case.documents[0]!.sourceUrl).toBe("unknown");
    expect(r.case.documents[1]!.sourceUrl).toBe("ftp://example.org/x");
    expect(r.issues.map((i) => i.code)).toEqual(["url_missing", "url_lookalike_fixed", "url_invalid"]);
  });

  it("the model carries the fixed URL and the issue path points at the input, not at the shortened list", () => {
    const c = richCase();
    const broken = { ...c.documents[2]!, documentId: "Law 8", title: 5 }; // left out by stage 1
    const lookalike = { ...c.documents[2]!, documentId: "Law 9", sourceUrl: "https\u2236//example.org/x" };
    c.documents.unshift(broken as never, lookalike);
    const r = parseCase(c, options);
    expect(r.issues.map((i) => [i.path, i.code])).toEqual([
      [["documents", 0, "title"], "schema_type"],
      [["documents", 1, "sourceUrl"], "url_lookalike_fixed"],
    ]);
    expect(r.model!.case.documents[0]!.sourceUrl).toBe("https://example.org/x");
  });
});
