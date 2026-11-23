import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Two import rules of the contract (design "Files", Requirement 2.4, 7.5, data-contract 6.4):
// 1. gate.ts and status.ts reach nothing in src/compare/, directly or through another file
//    of src/contract/, so a text difference can never decide a status.
// 2. Code under src/ and scripts/ imports the module only through src/contract/index.ts.
//    tests/ is not scanned: tests/ui and tests/helpers import src/contract/types, and the
//    contract's own tests import its files.

const root = join(import.meta.dirname, "..", "..");
const contractDir = join(root, "src", "contract");
const compareDir = join(root, "src", "compare");

// shortcut: comments are stripped with two regexes, not a parser (as in tests/scaffold.test.ts).
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Every module specifier of an import, a re-export or a dynamic import. */
function specifiers(source: string): string[] {
  const code = stripComments(source);
  const found = [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g)];
  return found.map((m) => m[1]!);
}

const resolveTs = (from: string, spec: string): string | null => {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return base; // a path that does not exist as a file still has a place, for the rule checks
};

const inside = (dir: string, path: string) => path === dir || path.startsWith(dir + sep);

/** The files a file reaches through relative imports, itself included. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const file = todo.pop()!;
    if (seen.has(file) || !existsSync(file) || !/\.tsx?$/.test(file)) continue;
    seen.add(file);
    for (const spec of specifiers(readFileSync(file, "utf8"))) {
      const target = resolveTs(file, spec);
      if (target) todo.push(target);
    }
  }
  return seen;
}

/** Files of `dir` (recursive) that are code. */
function codeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? codeFiles(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Specifiers of `source`, written in `file`, that name a file of src/contract/ other than its index. */
function deepContractImports(file: string, source: string): string[] {
  return specifiers(source).filter((spec) => {
    const target = resolveTs(file, spec);
    if (target === null || !inside(contractDir, target)) return false;
    return target !== contractDir && target !== join(contractDir, "index.ts") && target !== join(contractDir, "index");
  });
}

describe("gate.ts and status.ts do not import src/compare/", () => {
  it.each(["gate.ts", "status.ts"])("%s reaches no file of src/compare/", (name) => {
    const files = [...reachable(join(contractDir, name))];
    expect(files.length).toBeGreaterThan(1); // the walk really followed imports
    expect(files.filter((f) => inside(compareDir, f)).map((f) => relative(root, f))).toEqual([]);
  });

  it("the check can fail: a file that imports src/compare/ is reached", () => {
    const probe = join(contractDir, "gate.ts");
    const spec = "../compare/diff";
    expect(inside(compareDir, resolveTs(probe, spec)!)).toBe(true);
    expect(specifiers(`import { compareTexts } from "${spec}";`)).toEqual([spec]);
  });
});

describe("code outside src/contract/ imports only index.ts", () => {
  const outside = [...codeFiles(join(root, "src")), ...codeFiles(join(root, "scripts"))].filter((f) => !inside(contractDir, f));

  it("scans src/ui, src/compare and scripts/ (the scan is not empty)", () => {
    const names = outside.map((f) => relative(root, f).split(sep).join("/"));
    expect(names).toContain("scripts/check-dist.ts");
    expect(names.some((n) => n.startsWith("src/ui/"))).toBe(true);
    expect(names.some((n) => n.startsWith("src/compare/"))).toBe(true);
  });

  it("no file of src/ or scripts/ imports another file of the module", () => {
    const deep = outside.flatMap((f) => deepContractImports(f, readFileSync(f, "utf8")).map((s) => `${relative(root, f)}: ${s}`));
    expect(deep).toEqual([]);
  });

  it("at least one file imports the module through index.ts", () => {
    const users = outside.filter((f) => specifiers(readFileSync(f, "utf8")).some((s) => { const t = resolveTs(f, s); return t !== null && inside(contractDir, t); }));
    expect(users.length).toBeGreaterThan(0);
  });

  describe("the rule itself", () => {
    const ui = join(root, "src", "ui", "Probe.tsx");
    const script = join(root, "scripts", "probe.ts");
    it.each([
      [ui, `import type { Case } from "../contract/types";`],
      [ui, `import { parseCase } from "../contract/parse";`],
      [ui, `export * from "../contract/status";`],
      [ui, `const m = await import("../contract/gate");`],
      [ui, `import "../contract/urls";`],
      [script, `import { parseCase } from "../src/contract/parse";`],
      [script, `import { gateEvidence } from "../src/contract/gate.ts";`],
      [script, `const x = require("../src/contract/checks");`],
    ])("%s: a deep import is found: %s", (file, source) => {
      expect(deepContractImports(file, source)).toHaveLength(1);
    });

    it.each([
      [ui, `import type { Case } from "../contract";`],
      [ui, `import { parseCase } from "../contract/";`],
      [ui, `import { parseCase } from "../contract/index";`],
      [script, `import { parseCase } from "../src/contract";`],
      [script, `import { diff } from "../src/compare/diff";`],
      [ui, `// import { x } from "../contract/types";`],
      [ui, `import { z } from "zod";`],
    ])("%s: an index, other or commented import is not: %s", (file, source) => {
      expect(deepContractImports(file, source)).toEqual([]);
    });
  });
});
