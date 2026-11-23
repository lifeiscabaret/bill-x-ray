// Wording check for the interface (scan-screen 1, `npm run check:copy`).
// `checkCopy` is a pure function over file contents; only `main` reads files.
// TypeScript 7 ships no JavaScript API, so the parser is the dev-only alias `typescript5`
// (tech.md). Nothing else imports it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript5";

export type SourceText = { path: string; content: string };
export type Finding = { path: string; line: number; message: string };

// Evaluative words from .kiro/steering/ui-copy.md. English matches whole words and plurals
// ("believe" and "client" do not contain "lie" as a word). Korean has no word boundary
// before a particle (거짓말이다), so it matches the stem anywhere.
const LETTER = String.raw`[\p{L}\p{N}_]`;
const EVALUATIVE = [
  new RegExp(String.raw`(?<!${LETTER})(?:broken\s+promises?|lies|lie|failures?|tricks?|monsters?)(?!${LETTER})`, "giu"),
  /약속\s*파기|거짓말|실패|꼼수/gu,
];

const ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt"]);
const hasWords = (s: string) => /[\p{L}\p{N}]/u.test(s);

const lineOf = (content: string, index: number) => content.slice(0, index).split("\n").length;

function evaluative({ path, content }: SourceText): Finding[] {
  const out: Finding[] = [];
  for (const re of EVALUATIVE) {
    for (const m of content.matchAll(re)) {
      out.push({ path, line: lineOf(content, m.index), message: `evaluative word "${m[0]}" (ui-copy.md, Never)` });
    }
  }
  return out;
}

// shortcut: only string literals reached through ?:, &&, ||, ??, + and parentheses are
// found; strings built elsewhere (a const, a helper call) are not. Upgrade if one slips by.
function literalsIn(node: ts.Node): ts.Node[] {
  if (ts.isStringLiteralLike(node)) return hasWords(node.text) ? [node] : [];
  if (ts.isTemplateExpression(node)) {
    const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
    return parts.some(hasWords) ? [node] : [];
  }
  if (ts.isParenthesizedExpression(node)) return literalsIn(node.expression);
  if (ts.isConditionalExpression(node)) return [...literalsIn(node.whenTrue), ...literalsIn(node.whenFalse)];
  if (ts.isBinaryExpression(node)) return [...literalsIn(node.left), ...literalsIn(node.right)];
  return [];
}

function literals({ path, content }: SourceText): Finding[] {
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Finding[] = [];
  const add = (node: ts.Node, message: string) =>
    out.push({ path, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, message });
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && hasWords(node.text)) {
      add(node, `literal JSX text "${node.text.trim()}": use t()`);
    } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && ATTRIBUTES.has(node.name.text) && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      for (const lit of value ? literalsIn(value) : []) add(lit, `literal ${node.name.text} string: use t()`);
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const lit of literalsIn(node.expression)) add(lit, "literal string in JSX children: use t()");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const isJson = (p: string) => /^src\/i18n\/[^/]+\.json$/.test(p);
const isTsx = (p: string) => /^src\/ui\/.+\.tsx$/.test(p);

/** Paths are repo-relative with forward slashes. Files outside src/i18n and src/ui are ignored. */
export function checkCopy(files: SourceText[]): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    if (isJson(f.path)) out.push(...evaluative(f));
    else if (isTsx(f.path)) out.push(...evaluative(f), ...literals(f));
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

function walk(dir: string, keep: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p, keep);
    return keep(e.name) ? [p] : [];
  });
}

/** Reads the files the check covers under `root`, with repo-relative forward-slash paths. */
export function readCopyFiles(root: string): SourceText[] {
  const abs = [
    ...walk(join(root, "src", "i18n"), (n) => n.endsWith(".json")),
    ...walk(join(root, "src", "ui"), (n) => n.endsWith(".tsx")),
  ];
  return abs.map((p) => ({
    path: relative(root, p).split("\\").join("/"),
    content: readFileSync(p, "utf8"),
  }));
}

function main() {
  const root = join(import.meta.dirname, "..");
  const files = readCopyFiles(root);
  const findings = checkCopy(files);
  for (const f of findings) console.error(`${f.path}:${f.line}: ${f.message}`);
  if (findings.length > 0) {
    console.error(`check:copy: ${findings.length} finding(s) in ${files.length} file(s)`);
    process.exit(1);
  }
  console.log(`check:copy: ${files.length} file(s), 0 findings`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
