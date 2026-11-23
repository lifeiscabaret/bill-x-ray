import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../vite.config";

const root = join(import.meta.dirname, "..");

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsFiles(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

// shortcut: comments are stripped with two regexes, not a parser; a "//" inside a
// string literal would hide the rest of that line. Upgrade if a false pass shows up.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("scaffold", () => {
  it("binds the dev server and preview to 127.0.0.1:4748", () => {
    for (const key of ["server", "preview"] as const) {
      expect(config[key]).toMatchObject({ host: "127.0.0.1", port: 4748, strictPort: true });
    }
    expect(config.build?.sourcemap).toBe(false);
  });

  it("index.html contains no http(s):// host", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    expect(html.match(/https?:\/\/[^\s"'<>]+/g) ?? []).toEqual([]);
  });

  it("src/contract, src/compare and src/ingest are pure (no node modules, no DOM)", () => {
    const bad: string[] = [];
    for (const dir of ["contract", "compare", "ingest"]) {
      for (const file of tsFiles(join(root, "src", dir))) {
        const code = stripComments(readFileSync(file, "utf8"));
        const nodeImport = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["'](?:node:[^"']*|fs(?:\/[^"']*)?|path(?:\/[^"']*)?)["']/;
        if (nodeImport.test(code)) bad.push(`${file}: node import`);
        if (/\b(?:document|window)\b/.test(code)) bad.push(`${file}: document or window`);
      }
    }
    expect(bad).toEqual([]);
  });
});
