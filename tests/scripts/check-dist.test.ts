import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkDist, findCases, normalize, run, type DistFile, type Limits } from "../../scripts/check-dist";
import { readMatcher } from "../../scripts/check-repo";
import { parseCase, type Case } from "../../src/contract";
import { minimalCase } from "../contract/helpers";

// Synthetic strings only: no news text, no real names. Inputs that look like secrets, home
// folders or internal material are put together here from parts, so no committed file holds
// one literally and the private scanner and GitHub's secret scanning stay fully on. This is
// for a detector's own test inputs only. The internal-material names come from the
// publish-guard matcher at run time.
const root = join(import.meta.dirname, "..", "..");
const matcher = readMatcher(readFileSync(join(root, ".kiro", "hooks", "publish-guard.json"), "utf8"));
const internalName = matcher.split("|").find((p) => /^_?[A-Z][A-Z_]+_$/.test(p)) as string;
const temps: string[] = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "bx-dist-"));
  temps.push(d);
  return d;
};

const html = '<!doctype html><html><head><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';
const bundledCase = (): Case => ({ ...minimalCase(), title: "Example case" });
type Style = "double" | "single" | "template";
const literal = (c: Case, style: Style = "double"): string => {
  const json = JSON.stringify(c);
  if (style === "double") return JSON.stringify(json);
  const q = style === "single" ? "'" : "`";
  return q + json.replaceAll("\\", "\\\\").replaceAll(q, "\\" + q) + q;
};
const appJs = (extra = "", c: Case = bundledCase(), style: Style = "double"): string => `var e=${literal(c, style)};${extra}export{e as default};`;
const clean = (): Record<string, string> => ({ "index.html": html, "assets/app.js": appJs() });

function makeDist(files: Record<string, string | Buffer>): string {
  const d = tmp();
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(dirname(join(d, p)), { recursive: true });
    writeFileSync(join(d, p), content);
  }
  return d;
}
function runDist(files: Record<string, string | Buffer>, extra?: string[], limits?: Limits, expectedCases = 0) {
  const args = ["--dir", makeDist(files)];
  if (extra) {
    const f = join(tmp(), "patterns.txt");
    writeFileSync(f, extra.join("\n"));
    args.push("--extra-patterns", f);
  }
  return run(args, {}, { limits, expectedCases });
}
const file = (path: string, text: string | null): DistFile => ({ path, size: text?.length ?? 0, text });
const pure = (files: DistFile[], o: Partial<Parameters<typeof checkDist>[1]> = {}) => checkDist(files, { matcher, referenceDate: "2026-11-24", ...o });

// An invented news item of another outlet with an excerpt (Req 4.7, D-016).
function withNews(excerpt: string, ownOutlet?: boolean, factSentence: string | null = null): Case {
  const c = bundledCase();
  c.documents.push({
    documentId: "News 1", versionId: "n1", localEventLabel: null, sourceUrl: "https://example.net/n1", title: "Example report",
    publisher: "Example Outlet", sourceKind: "news", ownOutlet, factSentence, language: "en",
  });
  c.evidence.push({ evidenceId: "ev-news", documentId: "News 1", versionId: "n1", anchor: "para 1", excerpt, check: { ...c.evidence[0]!.check } });
  return c;
}

describe("check:dist clean runs", () => {
  it("passes a clean dist and prints the file list with the SHA-256 of index.html", () => {
    const r = runDist(clean());
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toContain("assets/app.js");
    expect(r.out).toContain(`index.html sha256 ${createHash("sha256").update(html).digest("hex")}`);
    expect(r.out).toContain("1 case(s) read back from the bundle");
  });

  it("passes the library strings of the allow-list and a source link of a bundled case", () => {
    const libs = 'var a="http://www.w3.org/2000/svg",b="https://react.dev/errors/31?args[]=x",c="https://example.org/bill-1-v1";';
    expect(runDist({ ...clean(), "assets/app.js": appJs(libs) }).code).toBe(0);
  });

  it("passes with no case in dist/ when data/cases/ is empty, and says that no patterns file was given", () => {
    const r = runDist({ "index.html": html, "assets/app.js": "console.log(1);" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("0 case(s)");
    expect(r.out).toContain("no extra-patterns file");
  });

  it("lets an own-outlet excerpt, and another outlet's item with a fact sentence only, through", () => {
    expect(parseCase(withNews("Invented words.", true), { referenceDate: "2026-11-24", origin: "bundled" }).issues.map((i) => i.code)).not.toContain("news_excerpt_not_allowed");
    expect(runDist({ ...clean(), "assets/app.js": appJs("", withNews("Invented words.", true)) }).code).toBe(0);
    expect(runDist({ ...clean(), "assets/app.js": appJs("", withNews("", false, "Our own sentence.")) }).code).toBe(0);
  });
});

// One failing input per rule. `bad` replaces or adds files in an otherwise clean dist.
const part = (...p: string[]) => p.join("");
const secretInputs: [string, string][] = [
  ["private_key", ["-----BEGIN", "RSA PRIVATE", "KEY-----"].join(" ")],
  ["api_key", part("api_", "key=", "q".repeat(12))],
  ["bearer_token", part("Bearer ", "Ab1".repeat(8))],
  ["access_key", part("AK", "IA", "ABCDEFGHIJKLMNOP")],
  ["access_key", part("gh", "p_", "Z".repeat(24))],
  ["access_key", part("sk", "-", "z".repeat(24))],
];
const homeInputs: string[] = [
  ["C:", "Users", "someone", "x.txt"].join("\\"),
  ["C:", "Users", "someone", "x.txt"].join("/"),
  ["", "Users", "someone", "x"].join("/"),
  ["", "home", "someone", "x"].join("/"),
];

describe("check:dist rules, each fails once", () => {
  type Case1 = { name: string; files: Record<string, string>; rule: string; code: string };
  const withJs = (extra: string): Record<string, string> => ({ ...clean(), "assets/app.js": appJs(extra) });
  const rows: Case1[] = [
    // (a) names
    { name: "source map", files: { ...clean(), "assets/app.js.map": "{}" }, rule: "a", code: "source_map" },
    { name: "environment file", files: { ...clean(), ".env.production": "X=1" }, rule: "a", code: "env_file" },
    { name: "environment file in a folder", files: { ...clean(), "assets/.env": "X=1" }, rule: "a", code: "env_file" },
    { name: "Markdown file", files: { ...clean(), "notes.md": "# x" }, rule: "a", code: "markdown_file" },
    { name: "JSON Lines file", files: { ...clean(), "rows.jsonl": "{}" }, rule: "a", code: "jsonl_file" },
    { name: "git bundle backup", files: { ...clean(), [part("backup.", "bundle")]: "x" }, rule: "a", code: "git_bundle" },
    { name: "git metadata folder", files: { ...clean(), ".git/config": "x" }, rule: "a", code: "git_metadata" },
    { name: "git metadata file", files: { ...clean(), ".gitignore": "x" }, rule: "a", code: "git_metadata" },
    { name: "internal-material name in a path (hook matcher)", files: { ...clean(), [`docs/a${internalName}b.txt`]: "x" }, rule: "a", code: "internal_folder" },
    { name: "internal folder", files: { ...clean(), [["research", "raw", "a.txt"].join("/")]: "x" }, rule: "a", code: "internal_folder" },
    { name: "index.html missing", files: { "assets/app.js": appJs() }, rule: "a", code: "index_missing" },
    // (b) secrets
    ...secretInputs.map(([code, s]): Case1 => ({ name: `secret ${code} ${s.length}`, files: withJs(`var k="${s}";`), rule: "b", code })),
    // (c) internal names, home folders
    { name: "internal-material name in text (hook matcher)", files: withJs(`var p="docs/a${internalName}b.txt";`), rule: "c", code: "internal_name" },
    ...homeInputs.map((h, i): Case1 => ({ name: `home path form ${i}`, files: withJs(`var p=${JSON.stringify(h)};`), rule: "c", code: "home_path" })),
    // (d) analytics
    ...["beacon.min.js", "cloudflareinsights", "googletagmanager", "google-analytics", "plausible", "hotjar"].map(
      (k): Case1 => ({ name: `analytics ${k}`, files: { ...clean(), "index.html": html.replace("</body>", `<!-- ${k.toUpperCase()} --></body>`) }, rule: "d", code: "analytics_beacon" }),
    ),
    // (e) other hosts
    { name: "script from another host", files: { ...clean(), "index.html": html.replace("/assets/app.js", "https://host.example.net/a.js") }, rule: "e", code: "external_script" },
    { name: "script from a protocol-relative URL", files: { ...clean(), "index.html": html.replace("/assets/app.js", "//host.example.net/a.js") }, rule: "e", code: "external_script" },
    { name: "link to another host", files: { ...clean(), "index.html": html.replace("<script", '<link rel="stylesheet" href="https://host.example.net/a.css"><script') }, rule: "e", code: "external_link" },
    { name: "@import from another host", files: { ...clean(), "assets/a.css": '@import url("https://host.example.net/a.css");' }, rule: "e", code: "external_style" },
    { name: "font url from another host", files: { ...clean(), "assets/a.css": "@font-face{src:url(//host.example.net/f.woff2)}" }, rule: "e", code: "external_style" },
    ...["fonts.googleapis", "unpkg", "jsdelivr", "cdnjs"].map((k): Case1 => ({ name: `CDN word ${k}`, files: withJs(`var u="${k}";`), rule: "e", code: "cdn_host" })),
    { name: "host in the bundle that is not a source link", files: withJs('var u="https://host.example.net/x";'), rule: "e", code: "foreign_host" },
    { name: "library URL with a different path", files: withJs('var u="http://www.w3.org/2000/svg/extra";'), rule: "e", code: "foreign_host" },
    // (f) news excerpt in case data
    { name: "other outlet's news excerpt in the case data", files: { ...clean(), "assets/app.js": appJs("", withNews("Invented words.")) }, rule: "f", code: "news_excerpt" },
    { name: "case data that is not a case", files: { ...clean(), "assets/app.js": appJs("", { contractVersion: 1, documents: [] } as unknown as Case) }, rule: "f", code: "case_unreadable" },
    // (g) sentinel
    { name: "fixture sentinel", files: { ...clean(), "assets/app.js": appJs("", minimalCase()) }, rule: "g", code: "fixture_sentinel" },
  ];

  it.each(rows)("fails: $name", ({ files, rule, code }) => {
    const r = runDist(files);
    expect(r.code).toBe(1);
    expect(r.err).toContain(`rule ${rule} (${code})`);
    expect(r.out).toBe("");
  });

  it("fails an extra pattern, naming only its line in the patterns file", () => {
    const sentence = "The invented committee deferred the invented measure to a later session.";
    const r = runDist(withJs(`var s="The invented  committee deferred\\nthe invented measure to a LATER session.";`), ["", "Some other invented line that is absent.", sentence]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("rule f (extra_pattern)");
    expect(r.err).toContain("line 3 of the patterns file");
    expect(r.err).not.toContain("line 2");
    expect(r.err.toLowerCase()).not.toContain("invented committee");
  });

  it("finds an extra pattern written with \\u escapes, and ignores blank lines", () => {
    const text = "가상의 위원회가 안건을 보류했다";
    const escaped = [...text].map((c) => (c === " " ? " " : "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))).join("");
    const r = runDist(withJs(`var s="${escaped}";`), ["", "", text]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("line 3 of the patterns file");
    expect(runDist(clean(), ["", "  ", text]).code).toBe(0);
  });

  it("(h) fails more files than the limit, and a file over the size limit", () => {
    expect(runDist({ ...clean(), "a.txt": "1", "b.txt": "2" }, undefined, { maxFiles: 3, maxBytes: 1e6 }).err).toContain("rule h (too_many_files)");
    const r = runDist({ ...clean(), "big.txt": "x".repeat(5000) }, undefined, { maxFiles: 10, maxBytes: 4000 });
    expect(r.err).toContain("big.txt: rule h (file_too_large)");
    expect(r.err).not.toContain("app.js: rule h");
  });

  it("(h) default limits are 20,000 files and 25 MiB", () => {
    const many = Array.from({ length: 20_001 }, (_, i) => file(`f${i}.txt`, null));
    expect(pure([file("index.html", html), ...many]).findings.map((f) => f.code)).toContain("too_many_files");
    expect(pure([file("index.html", html), { path: "big.bin", size: 25 * 1024 * 1024 + 1, text: null }]).findings.map((f) => f.code)).toContain("file_too_large");
    expect(pure([file("index.html", html), { path: "ok.bin", size: 25 * 1024 * 1024, text: null }]).findings).toEqual([]);
  });

  it("(a) fails a symbolic link without reading it", () => {
    const f = pure([file("index.html", html), { path: "link", size: 0, text: null, symlink: true }]).findings;
    expect(f.map((x) => x.code)).toEqual(["symlink"]);
  });

  it("(f) fails when data/cases/ holds more cases than the bundle shows", () => {
    const r = runDist(clean(), undefined, undefined, 2);
    expect(r.code).toBe(1);
    expect(r.err).toContain("rule f (case_data_not_found)");
    expect(runDist(clean(), undefined, undefined, 1).code).toBe(0);
  });

  it("uses the matcher it is given, so there is one list", () => {
    const f = pure([file("index.html", html), file("zzmark/a.txt", "x")], { matcher: "^zzmark/" }).findings;
    expect(f.map((x) => x.code)).toEqual(["internal_folder"]);
    expect(pure([file("index.html", html), file(`docs/a${internalName}b.txt`, "x")], { matcher: "^zzmark/" }).findings).toEqual([]);
  });

  it("does not take React-like words for internal material or secrets", () => {
    const text = 'var a={_internalRoot:1,__reactInternalInstance:2},b="Bearer",c="api key is required",d="apiKey";';
    expect(pure([file("index.html", html), file("assets/app.js", text)]).findings).toEqual([]);
  });
});

describe("check:dist case data read back from the bundle (data-contract 11.3)", () => {
  const found = (text: string, path = "assets/app.js") => findCases(file(path, text)).length;

  it.each<Style>(["double", "single", "template"])("finds the case JSON written as a %s-quoted string", (style) => {
    expect(found(appJs("", bundledCase(), style))).toBe(1);
    expect(runDist({ ...clean(), "assets/app.js": appJs("", withNews("Invented words."), style) }).err).toContain("(news_excerpt)");
  });

  it("finds a case whose non-ASCII text is written with \\u escapes", () => {
    const c = { ...bundledCase(), title: "가상 사례" };
    const escaped = literal(c).replace(/[^\x00-\x7f]/g, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
    expect(found(`var e=${escaped};`)).toBe(1);
  });

  it("finds a case in a .json file and ignores other strings and templates with expressions", () => {
    expect(found(JSON.stringify(bundledCase()), "data.json")).toBe(1);
    expect(found('var a="contractVersion",b=\'{"contractVersion":1}\';')).toBe(0);
    expect(found("var a=`${x}contractVersion`;")).toBe(0);
  });

  it("reads the hosts of the case's links from the found case, not from the code", () => {
    const f = pure([file("index.html", html), file("assets/app.js", appJs('var u="https://example.org/a",v="https://example.net/b";'))]).findings;
    expect(f.map((x) => x.code)).toEqual(["foreign_host"]);
  });
});

describe("check:dist output and usage", () => {
  const secrets = secretInputs.map(([, s]) => s).concat(homeInputs);

  it("never prints a secret, a host, a name or a pattern it found", () => {
    const bad = secrets.map((s, i) => `var k${i}=${JSON.stringify(s)};`).join("") + 'var u="https://host.example.net/x";' + `var n="docs/a${internalName}b.txt";`;
    const r = runDist({ ...clean(), "assets/app.js": appJs(bad) }, ["host.example.net", "q".repeat(12)]);
    expect(r.code).toBe(1);
    for (const s of [...secrets, "host.example.net", internalName, "Ab1Ab1"]) expect(r.err).not.toContain(s);
    expect(r.err).toMatch(/rule b/);
    expect(r.err).toMatch(/rule c/);
    expect(r.err).toMatch(/rule e/);
    expect(r.err).toMatch(/rule f \(extra_pattern\)/);
  });

  it("gives file, rule and line (and column) for a finding", () => {
    const r = runDist({ ...clean(), "assets/app.js": "var a=1;\nvar b=2;\n" + part("var k='", "AK", "IA", "ABCDEFGHIJKLMNOP", "';") });
    expect(r.err).toContain("assets/app.js:3:");
    expect(r.err).toContain("rule b (access_key)");
  });

  it("refuses an extra-patterns file inside the repository (exit 2)", () => {
    for (const p of [join(root, "package.json"), join(root, "tests", "not-there.txt")]) {
      const r = run(["--dir", makeDist(clean()), "--extra-patterns", p], {}, { expectedCases: 0 });
      expect(r.code).toBe(2);
      expect(r.err).toContain("inside the repository");
    }
    const viaEnv = run(["--dir", makeDist(clean())], { BILLXRAY_DIST_PATTERNS: join(root, "package.json") }, { expectedCases: 0 });
    expect(viaEnv.code).toBe(2);
  });

  it("takes the patterns file from BILLXRAY_DIST_PATTERNS and searches with it", () => {
    const f = join(tmp(), "p.txt");
    writeFileSync(f, "\uFEFFa distinctive invented phrase here\r\n");
    const r = run(["--dir", makeDist({ ...clean(), "assets/app.js": appJs('var s="A distinctive invented phrase here";') })], { BILLXRAY_DIST_PATTERNS: f }, { expectedCases: 0 });
    expect(r.code).toBe(1);
    expect(r.err).toContain("line 1 of the patterns file");
  });

  it("exits 2 for a usage error", () => {
    const d = makeDist(clean());
    const ok = (a: string[]) => run(a, {}, { expectedCases: 0 });
    expect(ok(["--nope"]).code).toBe(2);
    expect(ok(["--dir"]).code).toBe(2);
    expect(ok(["--dir", join(d, "missing")]).code).toBe(2);
    expect(ok(["--dir", d, "--extra-patterns", join(tmp(), "missing.txt")]).code).toBe(2);
    const short = join(tmp(), "short.txt");
    writeFileSync(short, "ok enough text\nx\n");
    const r = ok(["--dir", d, "--extra-patterns", short]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("line 2");
  });

  it("normalizes case, whitespace, backslashes and \\u escapes", () => {
    expect(normalize('A b\\n\\"c"\\u0041')).toBe('ab"c"a');
  });
});

describe("check:dist as a command", () => {
  const cmd = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/check-dist.ts", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });

  it("exits 0 on a clean dist, 1 on a finding, 2 on a usage error", { timeout: 120_000 }, () => {
    expect(cmd(["--dir", makeDist(clean())]).status).toBe(0);
    expect(cmd(["--dir", makeDist({ ...clean(), "assets/app.js.map": "{}" })]).status).toBe(1);
    expect(cmd(["--extra-patterns", join(root, "package.json")]).status).toBe(2);
  });
});
