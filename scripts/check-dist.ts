// Upload check for dist/ (data-contract 11; D-016, D-018). `npm run check:dist`
//
// Usage: tsx scripts/check-dist.ts [--dir <dist folder>] [--extra-patterns <file>]
//   --extra-patterns can also come from BILLXRAY_DIST_PATTERNS. The file holds one string per
//   line (sentences of other outlets' articles, personal names, retired brand names). It must
//   lie outside this repository. Exit 0 clean, 1 findings, 2 usage error.
//
// `checkDist` is a pure function over the files of a folder; only `readDist` and `run` touch
// the disk. A finding names file, rule and line (column in a minified file); for an extra
// pattern it names only the pattern's line number in the patterns file. No message carries
// the text it found or the pattern it matched, so the log can be pasted anywhere.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCase, type Case } from "../src/contract";
import { readMatcher } from "./check-repo";
import { assertOutsideRepo } from "./make-worksheet";

export type Rule = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
export interface Finding {
  file: string;
  rule: Rule;
  code: string;
  message: string;
  line?: number;
  col?: number;
  /** Extra-pattern findings only: the line of the patterns file. */
  patternLine?: number;
}
export interface DistFile {
  /** Relative to the dist folder, forward slashes. */
  path: string;
  size: number;
  /** null for a binary file or one over the size limit (rule h reports the latter). */
  text: string | null;
  symlink?: boolean;
}
export interface Limits {
  maxFiles: number;
  maxBytes: number;
}
export const LIMITS: Limits = { maxFiles: 20_000, maxBytes: 25 * 1024 * 1024 };

/**
 * Strings that libraries embed in the JS bundle. Each is an identifier or a message that the
 * app never fetches. A URL equals an entry, or starts with an entry that ends in "/".
 */
export const LIBRARY_URLS: readonly string[] = [
  "http://www.w3.org/2000/svg", // SVG namespace (React DOM creates SVG elements with it)
  "http://www.w3.org/1999/xlink", // xlink attribute namespace
  "http://www.w3.org/1998/Math/MathML", // MathML namespace
  "http://www.w3.org/XML/1998/namespace", // xml: attribute namespace
  "https://react.dev/errors/", // React's error decoder link, printed inside an error message only
  // zod's JSON Schema `$schema` identifiers, written into an output object, never fetched:
  "http://json-schema.org/draft-04/schema#",
  "http://json-schema.org/draft-07/schema#",
  "https://json-schema.org/draft/2020-12/schema",
];

/**
 * zod's IPv6 check builds the string `http://[${x}]` only to parse it with `new URL`. The match
 * is exempt only when the whole template literal is that and nothing else: a backtick, then
 * `http://[`, one identifier or property access in braces, `]`, and the closing backtick.
 */
const IPV6_CHECK_TEMPLATE = /^`http:\/\/\[\$\{[A-Za-z_$][\w$.]*\}\]`/;
const isIpv6CheckTemplate = (text: string, index: number): boolean => text[index - 1] === "`" && IPV6_CHECK_TEMPLATE.test(text.slice(index - 1));

const ANALYTICS = ["beacon.min.js", "cloudflareinsights", "googletagmanager", "google-analytics", "plausible", "hotjar"];
const CDN_HOSTS = ["fonts.googleapis", "fonts.gstatic", "unpkg", "jsdelivr", "cdnjs"];
const SENTINELS = ["Synthetic fixture"]; // development fixtures (tests/contract/helpers.ts)
const MIN_PATTERN = 3; // a shorter normalized pattern would hit almost anything

// Secret shapes (rule b). Each is a distinct code so a message never needs to quote the match.
const SECRETS: [string, RegExp][] = [
  ["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY/],
  ["api_key", /api[_-]?key["']?\s*[:=]\s*["']?[^\s"'&,;)]{6,}/i],
  ["bearer_token", /\bbearer\s+[A-Za-z0-9\-._~+/]{16,}=*/i],
  ["access_key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9]{20,}|\bAIza[0-9A-Za-z_-]{35}|\bxox[abprs]-[A-Za-z0-9-]{10,}/],
];
// Absolute paths into a personal computer's home folders: Windows, macOS, Linux (rule c).
const HOME_PATH = /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']|(?<![\w.-])\/(?:Users|home)\/[A-Za-z0-9._-]+/;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function locate(text: string, index: number): { line: number; col: number } {
  let line = 1;
  let last = -1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) {
    line++;
    last = i;
  }
  return { line, col: index - last };
}

/** Decodes \u escapes, drops backslashes and all whitespace, lower-cases. Patterns get the same treatment. */
export function normalize(s: string): string {
  return s
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})/g, (_, a: string | undefined, b: string | undefined) => {
      const cp = parseInt(a ?? b ?? "0", 16);
      return cp > 0x10ffff ? "" : String.fromCodePoint(cp);
    })
    .replace(/\\[nrt]/g, "")
    .replace(/\\/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

const isEscaped = (t: string, i: number): boolean => {
  let n = 0;
  while (i - 1 - n >= 0 && t[i - 1 - n] === "\\") n++;
  return n % 2 === 1;
};

/** The value of a JS string literal body, or null for a template literal with an expression. */
function decodeJsString(body: string, quote: string): string | null {
  if (quote === "`" && /(?<!\\)\$\{/.test(body)) return null;
  const simple: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0", "\n": "" };
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = body[++i] ?? "";
    if (n === "x") {
      out += String.fromCharCode(parseInt(body.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (n === "u" && body[i + 1] === "{") {
      const end = body.indexOf("}", i);
      out += String.fromCodePoint(parseInt(body.slice(i + 2, end), 16));
      i = end;
    } else if (n === "u") {
      out += String.fromCharCode(parseInt(body.slice(i + 1, i + 5), 16));
      i += 4;
    } else out += simple[n] ?? n;
  }
  return out;
}

interface FoundCase {
  file: string;
  line: number;
  col: number;
  value: unknown;
}
const looksLikeCase = (v: unknown): boolean =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "contractVersion" in v && Array.isArray((v as { documents?: unknown }).documents);

/** Index of the nearest unescaped `q` before (or after) `from`, or -1. */
function quoteBefore(t: string, q: string, from: number): number {
  for (let s = from; s > 0; ) {
    s = t.lastIndexOf(q, s - 1);
    if (s === -1 || !isEscaped(t, s)) return s;
  }
  return -1;
}
function quoteAfter(t: string, q: string, from: number): number {
  for (let e = from; ; e++) {
    e = t.indexOf(q, e);
    if (e === -1 || !isEscaped(t, e)) return e;
  }
}

/**
 * Reads case data back from a text file (data-contract 11.3). The case JSON text is a string
 * literal in the bundle (Vite's ?raw import) or a whole .json file. From each place the word
 * `contractVersion` appears, the enclosing literal is found for each quote character and kept
 * when it decodes to JSON that looks like a case.
 */
export function findCases(file: DistFile): FoundCase[] {
  const text = file.text;
  if (text === null) return [];
  const out: FoundCase[] = [];
  if (file.path.endsWith(".json")) {
    try {
      const value: unknown = JSON.parse(text);
      if (looksLikeCase(value)) return [{ file: file.path, line: 1, col: 1, value }];
    } catch {
      // not one JSON document: fall through to the literal search
    }
  }
  const seen = new Set<string>();
  for (let at = text.indexOf("contractVersion"); at !== -1; at = text.indexOf("contractVersion", at + 1)) {
    for (const q of ['"', "'", "`"]) {
      const start = quoteBefore(text, q, at);
      const end = start === -1 ? -1 : quoteAfter(text, q, at);
      if (start === -1 || end === -1 || seen.has(`${q}${start}`)) continue;
      try {
        const body = decodeJsString(text.slice(start + 1, end), q);
        const value: unknown = body === null ? null : JSON.parse(body);
        if (!looksLikeCase(value)) continue;
        seen.add(`${q}${start}`);
        out.push({ file: file.path, ...locate(text, start), value });
        break;
      } catch {
        // this quote character does not delimit a JSON string
      }
    }
  }
  return out;
}

function caseHosts(c: Case): string[] {
  const urls = [c.promise?.sourceUrl, ...c.documents.map((d) => d.sourceUrl), ...c.evidence.flatMap((e) => [e.check.url, e.check.confirmedUrl])];
  const hosts: string[] = [];
  for (const u of urls) {
    try {
      if (u) hosts.push(new URL(u).hostname.toLowerCase());
    } catch {
      // not a URL: no host to allow
    }
  }
  return hosts;
}

const libraryUrl = (u: string): boolean => LIBRARY_URLS.some((e) => u === e || (e.endsWith("/") && u.startsWith(e)));

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export interface CheckOptions {
  /** The `matcher` of the publish-guard hook: the one list of internal-material patterns. */
  matcher: string;
  /** Lines of the patterns file, blank lines included, so the index gives the line number. */
  extra?: readonly string[];
  referenceDate: string;
  /** Number of case files the repository holds; fewer cases found in dist/ is a finding. */
  expectedCases?: number;
  limits?: Limits;
}
export interface CheckResult {
  findings: Finding[];
  casesFound: number;
}

export function checkDist(files: readonly DistFile[], options: CheckOptions): CheckResult {
  const { matcher, extra = [], referenceDate, expectedCases = 0, limits = LIMITS } = options;
  const findings: Finding[] = [];
  const add = (f: Finding) => void findings.push(f);
  const internal = new RegExp(matcher);
  const patterns = extra.map((raw, i) => ({ line: i + 1, n: normalize(raw) })).filter((p) => p.n !== "");

  // (h) limits
  if (files.length > limits.maxFiles) add({ file: ".", rule: "h", code: "too_many_files", message: `more than ${limits.maxFiles} files` });
  if (!files.some((f) => f.path === "index.html")) add({ file: "index.html", rule: "a", code: "index_missing", message: "index.html is missing" });

  // (f) case data found in the bundle
  const cases: { found: FoundCase; model: Case | null }[] = [];
  const hosts = new Set<string>();
  for (const f of files) {
    for (const found of findCases(f)) {
      const result = parseCase(found.value, { referenceDate, origin: "bundled" });
      if (result.model) for (const h of caseHosts(result.model.case)) hosts.add(h);
      const news = result.issues.some((i) => i.code === "news_excerpt_not_allowed");
      cases.push({ found, model: result.model?.case ?? null });
      const at = { file: found.file, rule: "f" as const, line: found.line, col: found.col };
      if (news) add({ ...at, code: "news_excerpt", message: "case data carries an excerpt of another outlet's news (D-016)" });
      if (!result.model) add({ ...at, code: "case_unreadable", message: "case data does not parse as a case" });
    }
  }
  const caseIds = new Set(cases.map((c) => (c.model ? c.model.caseId : `${c.found.file}:${c.found.line}`)));
  if (caseIds.size < expectedCases) {
    add({ file: ".", rule: "f", code: "case_data_not_found", message: `${caseIds.size} case(s) found in dist/ but data/cases/ holds ${expectedCases}; the case text must stay in the bundle as a ?raw string (data-contract 11.3)` });
  }

  for (const f of files) {
    // (h) size, (a) names
    if (f.size > limits.maxBytes) add({ file: f.path, rule: "h", code: "file_too_large", message: `file is larger than ${limits.maxBytes} bytes; not read` });
    const segs = f.path.split("/");
    const base = segs[segs.length - 1]!.toLowerCase();
    const nameRules: [boolean, string, string][] = [
      [f.symlink === true, "symlink", "symbolic link"],
      [/\.map$/.test(base), "source_map", "source map"],
      [segs.some((s) => /^\.env/i.test(s)), "env_file", "environment file"],
      [/\.(md|markdown)$/.test(base), "markdown_file", "Markdown file"],
      [/\.jsonl$/.test(base), "jsonl_file", "JSON Lines file"],
      [/\.bundle$/.test(base), "git_bundle", "git bundle backup"],
      [segs.some((s) => /^\.git/i.test(s)), "git_metadata", "git metadata"],
      [internal.test(f.path) || internal.test(f.path.replaceAll("/", "\\")), "internal_folder", "path looks like internal material (publish-guard matcher)"],
    ];
    for (const [hit, code, what] of nameRules) if (hit) add({ file: f.path, rule: "a", code, message: `${what} must not be uploaded` });

    const text = f.text;
    if (text === null) continue;
    const lower = text.toLowerCase();
    const at = (index: number) => locate(text, index);
    const ext = (f.path.match(/\.([^./]+)$/)?.[1] ?? "").toLowerCase();

    // (b) secrets
    for (const [code, re] of SECRETS) {
      const m = re.exec(text);
      if (m) add({ file: f.path, rule: "b", code, message: "secret shape in a file that would be uploaded", ...at(m.index) });
    }
    // (c) internal names and home paths. Names are tested per token so the matcher's anchors work.
    for (const m of text.matchAll(/[^\s"'`<>()[\]{},;|*]{4,}/g)) {
      if (internal.test(m[0])) {
        add({ file: f.path, rule: "c", code: "internal_name", message: "internal material name (publish-guard matcher)", ...at(m.index) });
        break;
      }
    }
    const home = HOME_PATH.exec(text);
    if (home) add({ file: f.path, rule: "c", code: "home_path", message: "absolute path into a personal computer's home folder", ...at(home.index) });
    // (d) analytics, (g) sentinels
    for (const k of ANALYTICS) {
      const i = lower.indexOf(k);
      if (i !== -1) add({ file: f.path, rule: "d", code: "analytics_beacon", message: "analytics beacon or tracker", ...at(i) });
    }
    for (const k of SENTINELS) {
      const i = lower.indexOf(k.toLowerCase());
      if (i !== -1) add({ file: f.path, rule: "g", code: "fixture_sentinel", message: "development fixture marker", ...at(i) });
    }
    // (e) scripts, styles and fonts from other hosts
    const external = /^(?:https?:)?\/\//i;
    for (const m of text.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) {
      if (external.test(m[1]!)) add({ file: f.path, rule: "e", code: "external_script", message: "script loaded from another host", ...at(m.index) });
    }
    for (const m of text.matchAll(/<link\b[^>]*?\bhref\s*=\s*["']?([^"'\s>]+)/gi)) {
      if (external.test(m[1]!)) add({ file: f.path, rule: "e", code: "external_link", message: "link element to another host", ...at(m.index) });
    }
    if (["css", "html", "svg"].includes(ext)) {
      const m = /@import\s+(?:url\(\s*)?["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\//i.exec(text);
      if (m) add({ file: f.path, rule: "e", code: "external_style", message: "style or font loaded from another host", ...at(m.index) });
    }
    for (const k of CDN_HOSTS) {
      const i = lower.indexOf(k);
      if (i !== -1) add({ file: f.path, rule: "e", code: "cdn_host", message: "font or library host that serves scripts and styles", ...at(i) });
    }
    if (["js", "mjs", "cjs"].includes(ext)) {
      for (const m of text.matchAll(/\bhttps?:\/\/[^\s"'`\\<>)\]}]+/gi)) {
        let host = "";
        try {
          host = new URL(m[0]).hostname.toLowerCase();
        } catch {
          // unparsable: treated as a foreign host below
        }
        if (libraryUrl(m[0]) || isIpv6CheckTemplate(text, m.index) || (host !== "" && hosts.has(host))) continue;
        add({ file: f.path, rule: "e", code: "foreign_host", message: "bundle names a host that is neither a bundled source link nor on the library list", ...at(m.index) });
      }
    }
    // (f) extra patterns
    if (patterns.length > 0) {
      const n = normalize(text);
      for (const p of patterns) {
        if (n.includes(p.n)) add({ file: f.path, rule: "f", code: "extra_pattern", message: `text matches line ${p.line} of the patterns file`, patternLine: p.line });
      }
    }
  }
  findings.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : x.rule < y.rule ? -1 : x.rule > y.rule ? 1 : (x.line ?? 0) - (y.line ?? 0)));
  return { findings, casesFound: caseIds.size };
}

// ---------------------------------------------------------------------------
// Disk access and the command
// ---------------------------------------------------------------------------

/** Lists every file below `dir` (never following links) and reads the text of those within the limits. */
export function readDist(dir: string, limits: Limits = LIMITS): DistFile[] {
  const out: DistFile[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (out.length > limits.maxFiles) return; // enough to report rule h; do not read an endless tree
      const path = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isSymbolicLink()) out.push({ path, size: 0, text: null, symlink: true });
      else if (e.isDirectory()) walk(path);
      else if (e.isFile()) {
        const size = lstatSync(join(dir, path)).size;
        let text: string | null = null;
        if (size <= limits.maxBytes) {
          const buf = readFileSync(join(dir, path));
          if (!buf.subarray(0, 8192).includes(0)) text = buf.toString("utf8");
        }
        out.push({ path, size, text });
      }
    }
  };
  walk("");
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface RunResult {
  code: 0 | 1 | 2;
  out: string;
  err: string;
}

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface RunOptions {
  root?: string;
  limits?: Limits;
  /** Overrides the number of files counted in data/cases/ (tests). */
  expectedCases?: number;
}

export function run(argv: string[], env: Record<string, string | undefined>, o: RunOptions = {}): RunResult {
  const root = o.root ?? repoRoot;
  const limits = o.limits ?? LIMITS;
  const usage = (message: string): RunResult => ({ code: 2, out: "", err: `check:dist: ${message}\nusage: check:dist [--dir <dist folder>] [--extra-patterns <file>]\n` });
  const opts: { dir?: string; extra?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--dir" || a === "--extra-patterns") && argv[i + 1] !== undefined) opts[a === "--dir" ? "dir" : "extra"] = argv[++i];
    else return usage(`unknown or incomplete argument ${JSON.stringify(a)}`);
  }
  const dir = resolve(opts.dir ?? join(root, "dist"));
  const patternsPath = opts.extra ?? env.BILLXRAY_DIST_PATTERNS;
  if (patternsPath) {
    try {
      assertOutsideRepo("the extra-patterns file", patternsPath, root);
    } catch (e) {
      return usage((e as Error).message);
    }
    if (!existsSync(patternsPath)) return usage("the extra-patterns file does not exist");
  }
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) return usage("the dist folder does not exist (run npm run build first)");

  let extra: string[] = [];
  if (patternsPath) {
    extra = readFileSync(patternsPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
    const short = extra.findIndex((l) => l.trim() !== "" && normalize(l).length < MIN_PATTERN);
    if (short !== -1) return usage(`line ${short + 1} of the patterns file is shorter than ${MIN_PATTERN} characters`);
  }
  const matcher = readMatcher(readFileSync(join(root, ".kiro", "hooks", "publish-guard.json"), "utf8"));
  const casesDir = join(root, "data", "cases");
  const expectedCases = o.expectedCases ?? (existsSync(casesDir) ? readdirSync(casesDir).filter((n) => n.endsWith(".json")).length : 0);
  const files = readDist(dir, limits);
  const { findings, casesFound } = checkDist(files, { matcher, extra, referenceDate: today(), expectedCases, limits });

  let err = "";
  for (const f of findings) {
    const where = f.line !== undefined ? `:${f.line}:${f.col}` : "";
    err += `${f.file}${where}: rule ${f.rule} (${f.code}): ${f.message}\n`;
  }
  if (findings.length > 0) {
    err += `check:dist: ${findings.length} finding(s) in ${files.length} file(s)\n`;
    return { code: 1, out: "", err };
  }
  let out = files.map((f) => `${String(f.size).padStart(9)}  ${f.path}\n`).join("");
  const index = files.find((f) => f.path === "index.html");
  const sha = createHash("sha256").update(readFileSync(join(dir, index!.path))).digest("hex");
  out += `index.html sha256 ${sha}\n`;
  if (!patternsPath) out += "note: no extra-patterns file given, so other outlets' text and names were not searched\n";
  out += `check:dist: ${files.length} file(s), ${casesFound} case(s) read back from the bundle, 0 findings\n`;
  return { code: 0, out, err: "" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run(process.argv.slice(2), process.env);
  process.stdout.write(r.out);
  process.stderr.write(r.err);
  process.exitCode = r.code;
}
