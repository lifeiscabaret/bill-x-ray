// Repository check (data-contract 10, `npm run check:repo`).
// `checkRepo` is a pure function over the tracked file list and the .gitignore text; only
// `main` reads files and runs git. The internal-material patterns are not written here: they
// come from the `matcher` of the publish-guard hook, so there is one list (tasks.md 10.1).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export type RepoFinding = { path: string; code: "internal_material" | "env_file" | "kiro_ignored"; message: string };
export type RepoInput = {
  /** Tracked paths, repo-relative with forward slashes (`git ls-files`). */
  files: string[];
  /** Text of the root .gitignore. */
  gitignore: string;
  /** The publish-guard `matcher`: a regular expression over a path. */
  matcher: string;
  /** Probe paths that `git check-ignore --no-index` reported as ignored (runner only). */
  gitIgnored?: string[];
};

/** Reads the matcher of the hook named `publish-guard` from the text of its JSON file. */
export function readMatcher(hookJson: string): string {
  const hooks = (JSON.parse(hookJson) as { hooks?: { name?: string; matcher?: string }[] }).hooks ?? [];
  const matcher = hooks.find((h) => h.name === "publish-guard")?.matcher;
  if (!matcher) throw new Error("publish-guard has no matcher");
  return matcher;
}

type Rule = { re: RegExp; negate: boolean; dirOnly: boolean };

// shortcut: handles *, **, ? and the leading !, /, trailing / of .gitignore lines; no
// character classes or escapes. The runner also asks `git check-ignore`, which is exact.
function globToRegex(glob: string): string {
  return glob
    .replace(/[.+^${}()|\\[\]]/g, "\\$&")
    .replace(/\*\*\//g, "\u0001")
    .replace(/\/\*\*$/, "/\u0002")
    .replace(/\*\*/g, "\u0002")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0001/g, "(?:.*/)?")
    .replace(/\u0002/g, ".*");
}

function parseRules(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\s+$/, "");
    if (!line || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes("/");
    line = line.replace(/^\//, "");
    if (!line) continue;
    rules.push({ re: new RegExp(`^${anchored ? "" : "(?:.*/)?"}${globToRegex(line)}$`), negate, dirOnly });
  }
  return rules;
}

/** A probe ends with "/" when it is a folder. Git cannot re-include a path below an ignored folder. */
function ignoredByText(rules: Rule[], probe: string): boolean {
  const parts = probe.replace(/\/$/, "").split("/");
  for (let i = 1; i <= parts.length; i++) {
    const isDir = i < parts.length || probe.endsWith("/");
    const prefix = parts.slice(0, i).join("/");
    let ignored = false;
    for (const r of rules) if (r.re.test(prefix) && (isDir || !r.dirOnly)) ignored = !r.negate;
    if (ignored) return true;
  }
  return false;
}

/** `.kiro`, one file below it, and every tracked path below it with its folders (folders end in "/"). */
export function kiroProbes(files: string[]): string[] {
  const probes = new Set([".kiro/", ".kiro/x"]);
  for (const f of files.filter((p) => p.startsWith(".kiro/"))) {
    const parts = f.split("/");
    for (let i = 2; i < parts.length; i++) probes.add(parts.slice(0, i).join("/") + "/");
    probes.add(f);
  }
  return [...probes];
}

const isEnvFile = (path: string) => /(^|\/)\.env/.test(path);

export function checkRepo({ files, gitignore, matcher, gitIgnored = [] }: RepoInput): RepoFinding[] {
  const out: RepoFinding[] = [];
  const internal = new RegExp(matcher);
  for (const path of files) {
    if (isEnvFile(path)) out.push({ path, code: "env_file", message: "environment file is tracked" });
    else if (internal.test(path)) out.push({ path, code: "internal_material", message: "path looks like internal material (publish-guard matcher)" });
  }
  const rules = parseRules(gitignore);
  const flagged = kiroProbes(files).filter((p) => gitIgnored.includes(p) || ignoredByText(rules, p));
  for (const p of flagged) {
    if (flagged.some((q) => q !== p && q.endsWith("/") && p.startsWith(q))) continue; // report the top folder only
    out.push({ path: p.replace(/\/$/, ""), code: "kiro_ignored", message: ".kiro must stay committed but .gitignore hides it" });
  }
  return out;
}

const git = (root: string, args: string[], input?: string) =>
  execFileSync("git", args, { cwd: root, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

function main() {
  const root = join(import.meta.dirname, "..");
  const files = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
  const matcher = readMatcher(readFileSync(join(root, ".kiro", "hooks", "publish-guard.json"), "utf8"));
  let gitignore = "";
  try {
    gitignore = readFileSync(join(root, ".gitignore"), "utf8");
  } catch {
    // no .gitignore: nothing hides .kiro
  }
  let gitIgnored: string[] = [];
  try {
    gitIgnored = git(root, ["check-ignore", "--no-index", "--stdin", "-z"], kiroProbes(files).join("\0")).split("\0").filter(Boolean);
  } catch (e) {
    // exit 1 means none of the probes is ignored; anything else is a real failure
    if ((e as { status?: number }).status !== 1) throw e;
  }
  const findings = checkRepo({ files, gitignore, matcher, gitIgnored });
  for (const f of findings) console.error(`${f.path}: ${f.code}: ${f.message}`);
  if (findings.length > 0) {
    console.error(`check:repo: ${findings.length} finding(s) in ${files.length} tracked file(s)`);
    process.exit(1);
  }
  console.log(`check:repo: ${files.length} tracked file(s), 0 findings`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
