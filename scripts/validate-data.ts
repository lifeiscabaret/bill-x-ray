// Data check (data-contract 9, `npm run validate:data`; Requirement 9.1).
//
// Usage: tsx scripts/validate-data.ts [--research <dir>]
//   --research can also come from BILLXRAY_RESEARCH_DIR. The folder must lie outside this
//   repository. If it holds a names list (NAMES_FILE: one personal name per line, blank lines and
//   lines starting with # ignored), no recheck note may contain one of those names. Without a
//   folder or without the list the name check is skipped and the script says so in one line.
//   Exit 0 when nothing blocks (also when both data folders are empty), 1 on a block issue,
//   2 on a usage error.
//
// `validateData` is a pure function over the text of the files; only `readFolder` and `run`
// touch the disk. Parsing and the cross-check live in src/contract/ and are reached through its
// index. A case in data/cases/ is parsed as bundled data with today's local date as the
// reference date, and every matched_official evidence row needs a complete two-role recheck
// in data/verification/ (D-002, D-006, D-020).
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crossCheckRechecks, formatPath, parseCase, parseRecheck, type Issue, type Recheck } from "../src/contract";
import { assertOutsideRepo } from "./make-worksheet";

/** The names list inside the private research folder. */
export const NAMES_FILE = "validate-data-names.txt";
const MIN_NAME = 3; // characters; shorter lines would match inside ordinary words (as in check:dist)

export interface DataFile {
  /** Repo-relative path with forward slashes, as printed. */
  name: string;
  text: string;
}

export interface Finding {
  file: string;
  path: Issue["path"];
  code: Issue["code"];
  severity: Issue["severity"];
  message: string;
}

export interface ValidateInput {
  cases: DataFile[];
  verification: DataFile[];
  /** Entries of the folders that are not a .json file: reported, never read. */
  strays?: string[];
}

export interface ValidateOptions {
  referenceDate: string;
  personalNames?: readonly string[];
}

const readJson = (f: DataFile): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(f.text.replace(/^\uFEFF/, "")) };
  } catch {
    return { ok: false };
  }
};

export function validateData(input: ValidateInput, o: ValidateOptions): Finding[] {
  const findings: Finding[] = [];
  const add = (file: string, issues: readonly Issue[]) => {
    for (const i of issues) findings.push({ file, path: i.path, code: i.code, severity: i.severity, message: i.message });
  };
  const notJson = (file: string): Issue => ({ path: [], code: "schema_format", severity: "block", message: "The file is not valid JSON." });

  for (const name of input.strays ?? []) {
    add(name, [{ path: [], code: "schema_format", severity: "block", message: "Only .json files belong in this folder." }]);
  }

  const rechecks: Recheck[] = [];
  for (const f of input.verification) {
    const json = readJson(f);
    if (!json.ok) {
      add(f.name, [notJson(f.name)]);
      continue;
    }
    const r = parseRecheck(json.value, { personalNames: o.personalNames });
    add(f.name, r.issues);
    rechecks.push(...r.rechecks);
  }

  for (const f of input.cases) {
    const json = readJson(f);
    if (!json.ok) {
      add(f.name, [notJson(f.name)]);
      continue;
    }
    const r = parseCase(json.value, { referenceDate: o.referenceDate, origin: "bundled", bundledChecks: [] });
    add(f.name, r.issues);
    if (r.model) add(f.name, crossCheckRechecks(r.model.case, rechecks));
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Disk access and the command
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The .json files of a data folder, in name order. Dot files (.gitkeep) are ignored. */
export function readFolder(root: string, folder: "cases" | "verification"): { files: DataFile[]; strays: string[] } {
  const dir = join(root, "data", folder);
  const files: DataFile[] = [];
  const strays: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (e.name.startsWith(".")) continue;
    const name = `data/${folder}/${e.name}`;
    if (e.isFile() && e.name.endsWith(".json")) files.push({ name, text: readFileSync(join(dir, e.name), "utf8") });
    else strays.push(name);
  }
  return { files, strays };
}

const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface RunResult {
  code: 0 | 1 | 2;
  out: string;
  err: string;
}

export interface RunOptions {
  root?: string;
  /** The reference date (YYYY-MM-DD); the command passes today's local date. */
  today?: string;
}

export function run(argv: string[], env: Record<string, string | undefined>, o: RunOptions = {}): RunResult {
  const root = o.root ?? repoRoot;
  const usage = (message: string): RunResult => ({ code: 2, out: "", err: `validate:data: ${message}\nusage: validate:data [--research <dir>]\n` });
  let research: string | undefined = env.BILLXRAY_RESEARCH_DIR || undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--research" && argv[i + 1] !== undefined) research = argv[++i];
    else return usage(`unknown or incomplete argument ${JSON.stringify(argv[i])}`);
  }

  let names: string[] | undefined;
  let skipped = "";
  if (research === undefined) {
    skipped = "no research folder given (--research or BILLXRAY_RESEARCH_DIR)";
  } else {
    try {
      assertOutsideRepo("the research folder", research, root);
    } catch (e) {
      return usage((e as Error).message);
    }
    if (!existsSync(research) || !lstatSync(research).isDirectory()) return usage("the research folder does not exist");
    const file = join(research, NAMES_FILE);
    if (!existsSync(file)) {
      skipped = "the research folder has no names list";
    } else {
      const lines = readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
      const short = lines.findIndex((l) => l.trim() !== "" && !l.trim().startsWith("#") && l.replace(/\s+/g, "").length < MIN_NAME);
      if (short !== -1) return usage(`line ${short + 1} of the names list is shorter than ${MIN_NAME} characters`);
      names = lines.map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
    }
  }

  for (const folder of ["cases", "verification"]) {
    const dir = join(root, "data", folder);
    if (!existsSync(dir) || !lstatSync(dir).isDirectory()) return usage(`the folder data/${folder} does not exist`);
  }
  const cases = readFolder(root, "cases");
  const verification = readFolder(root, "verification");
  const findings = validateData(
    { cases: cases.files, verification: verification.files, strays: [...verification.strays, ...cases.strays] },
    { referenceDate: o.today ?? today(), personalNames: names },
  );

  const lines = findings.map((f) => `${f.file}: ${formatPath(f.path)}: ${f.code} (${f.severity}): ${f.message}\n`);
  const blocks = findings.filter((f) => f.severity === "block").length;
  const summary =
    `validate:data: ${cases.files.length} case file(s), ${verification.files.length} verification file(s), ` +
    `${blocks} block issue(s), ${findings.length - blocks} warning(s)\n`;
  const note = skipped ? `validate:data: name check skipped: ${skipped}\n` : "";
  if (blocks > 0) return { code: 1, out: "", err: lines.join("") + note + summary };
  return { code: 0, out: lines.join("") + note + summary, err: "" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run(process.argv.slice(2), process.env);
  process.stdout.write(r.out);
  process.stderr.write(r.err);
  process.exitCode = r.code;
}
