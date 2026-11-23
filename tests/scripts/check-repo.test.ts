import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkRepo, kiroProbes, readMatcher } from "../../scripts/check-repo";

// This file carries literal internal-material names on purpose (data-contract 10.4): the
// check reads its patterns from the hook, and these paths prove the real list catches them.
const root = join(import.meta.dirname, "..", "..");
const matcher = readMatcher(readFileSync(join(root, ".kiro", "hooks", "publish-guard.json"), "utf8"));
const clean = ["README.md", ".gitignore", "package.json", "src/app.ts", ".kiro/hooks/ui-wording-check.json", ".kiro/steering/tech.md", "data/cases/a.json"];
const run = (files: string[], gitignore = "node_modules/\n", gitIgnored?: string[]) => checkRepo({ files, gitignore, matcher, gitIgnored });

const internalNames = [
  "docs/_HANDOVER_notes.md",
  "docs/_WORK_ORDER_notes.md",
  "data/research/raw/rows.jsonl",
  "data/research/review/p.md",
  "data/research/meta/m.json",
  "data/research/verify/v.json",
  "data/research/jsonl/j.jsonl",
  "_internal/plan.md",
  "docs/_internal/plan.md",
  "docs/a_검수.md",
  "logs/RUN_LOG_1.md",
  "logs/RUN_PROMPT_1.md",
  "logs/VERIFY_LOG_1.md",
  "docs/a_다음작업.md",
  "docs/열람확인.csv",
  "docs/a_표본확인_목록.csv",
  "docs/00_설계_및_실행가이드.md",
  "docs/00_읽어주세요.md",
];

describe("check:repo internal material", () => {
  it("passes a clean file list", () => {
    expect(run(clean)).toEqual([]);
  });

  it.each(internalNames)("fails a tracked path %s", (path) => {
    expect(run([...clean, path])).toEqual([{ path, code: "internal_material", message: expect.any(String) }]);
  });

  it("fails the same name written with backslashes", () => {
    expect(run(["docs\\_HANDOVER_notes.md"])).toHaveLength(1);
  });

  it("does not fail paths that only look similar", () => {
    const similar = ["docs/research-notes.md", "src/internal.ts", "src/contract/environment.ts", "docs/handover.md", "data/research.json"];
    expect(run(similar)).toEqual([]);
  });

  it("uses the matcher it is given, so there is one list", () => {
    const custom = { files: ["zzz/a.md", "docs/_HANDOVER_notes.md"], gitignore: "", matcher: "^zzz/" };
    expect(checkRepo(custom).map((f) => f.path)).toEqual(["zzz/a.md"]);
  });

  it("reads the matcher from the hook file and refuses a hook without one", () => {
    expect(matcher.length).toBeGreaterThan(20);
    expect(() => readMatcher('{"hooks":[{"name":"other","matcher":"x"}]}')).toThrow();
    expect(() => readMatcher('{"hooks":[]}')).toThrow();
  });
});

describe("check:repo environment files", () => {
  it.each([".env", ".env.local", ".env.example", "config/.env.production"])("fails a tracked %s", (path) => {
    expect(run([...clean, path])).toEqual([{ path, code: "env_file", message: expect.any(String) }]);
  });
});

describe("check:repo .gitignore and .kiro", () => {
  const files = [...clean, ".kiro/specs/data-contract/tasks.md"];

  it.each([".kiro", ".kiro/", "/.kiro/", "**/.kiro", ".kiro/*", ".k*", ".*", "*", ".kiro/hooks/\n.kiro/specs/"])("fails a .gitignore with %j", (text) => {
    const found = run(files, `node_modules/\n${text}\n`);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.code === "kiro_ignored" && f.path.startsWith(".kiro"))).toBe(true);
  });

  it("names the hidden subfolder", () => {
    expect(run(files, ".kiro/hooks/\n")).toEqual([{ path: ".kiro/hooks", code: "kiro_ignored", message: expect.any(String) }]);
    expect(run(files, ".kiro/steering/\n").map((f) => f.path)).toEqual([".kiro/steering"]);
  });

  it("reports the top folder once, not every file below it", () => {
    expect(run(files, ".kiro/\n")).toEqual([{ path: ".kiro", code: "kiro_ignored", message: expect.any(String) }]);
  });

  it("fails when git reports a probe as ignored although the text looks fine", () => {
    expect(run(files, "node_modules/\n", [".kiro/specs/"]).map((f) => f.path)).toEqual([".kiro/specs"]);
  });

  it.each([
    "# .kiro is not ignored\nnode_modules/\n",
    ".kiro-old/\n",
    "kiro/\n",
    "docs/.kiro/\n",
    ".kirox\n",
    ".*\n!.kiro/\n",
    "",
  ])("passes a .gitignore with %j", (text) => {
    expect(run(files, text)).toEqual([]);
  });

  it("probes .kiro, a file below it, and every tracked path with its folders", () => {
    expect(kiroProbes(files)).toEqual([".kiro/", ".kiro/x", ".kiro/hooks/", ".kiro/hooks/ui-wording-check.json", ".kiro/steering/", ".kiro/steering/tech.md", ".kiro/specs/", ".kiro/specs/data-contract/", ".kiro/specs/data-contract/tasks.md"]);
  });

  it("passes this repository's own .gitignore", () => {
    expect(run(files, readFileSync(join(root, ".gitignore"), "utf8"))).toEqual([]);
  });
});

describe("check:repo on this repository", () => {
  it("exits 0", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-repo.ts"], { cwd: root, encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("0 findings");
  }, 30_000); // starts tsx and git; slow when the whole suite runs in parallel
});
