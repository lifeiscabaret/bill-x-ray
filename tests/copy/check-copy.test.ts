import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkCopy, readCopyFiles } from "../../scripts/check-copy";

const json = (content: string) => [{ path: "src/i18n/en.json", content }];
const tsx = (content: string) => [{ path: "src/ui/Probe.tsx", content }];
const wrap = (body: string) => `export const Probe = () => (<div>${body}</div>);\n`;

// Each evaluative word, with the plural or inflected form the check must also catch.
const english = ["broken promise", "broken promises", "lie", "lies", "failure", "failures", "trick", "tricks", "monster", "monsters", "Broken Promise"];
const korean = ["약속 파기", "거짓말", "실패", "꼼수", "거짓말이다"];

describe("check:copy evaluative words", () => {
  it.each([...english, ...korean])("fails %s once in JSON and once in TSX", (word) => {
    const inJson = checkCopy(json(`{ "app": { "x": "A ${word} here" } }\n`));
    expect(inJson).toHaveLength(1);
    expect(inJson[0]).toMatchObject({ path: "src/i18n/en.json", line: 1 });
    const inTsx = checkCopy(tsx(`import { t } from "../i18n/t";\n// ${word}\nexport const A = () => <p>{t("a.b")}</p>;\n`));
    expect(inTsx).toHaveLength(1);
    expect(inTsx[0]).toMatchObject({ path: "src/ui/Probe.tsx", line: 2 });
  });

  it("does not match believe, client or other words that merely contain 'lie'", () => {
    const text = "believe client Client lien lied alien reliable familiar tricky monstrous failing";
    expect(checkCopy(json(`{ "a": { "b": "${text}" } }`))).toEqual([]);
  });

  it("reports the line of the match", () => {
    const found = checkCopy(json(`{\n  "a": {\n    "b": "Not a lie"\n  }\n}\n`));
    expect(found.map((f) => f.line)).toEqual([3]);
  });

  it("ignores files outside src/i18n and src/ui", () => {
    expect(checkCopy([{ path: "src/contract/x.ts", content: "lie" }, { path: "docs/a.md", content: "lie" }])).toEqual([]);
  });
});

describe("check:copy literal interface strings", () => {
  it("fails a literal JSX text", () => {
    const found = checkCopy(tsx(wrap("Scan the bill")));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("JSX text");
  });

  it.each(["aria-label", "title", "placeholder", "alt"])("fails a literal %s", (attr) => {
    expect(checkCopy(tsx(wrap(`<input ${attr}="Search" />`)))).toHaveLength(1);
    expect(checkCopy(tsx(wrap(`<input ${attr}={"Search"} />`)))).toHaveLength(1);
  });

  it("fails a literal reached through a condition or a JSX child expression", () => {
    expect(checkCopy(tsx(wrap(`<input title={on ? "Open" : t("a.b")} />`)))).toHaveLength(1);
    expect(checkCopy(tsx(wrap(`{"Open"}`)))).toHaveLength(1);
    expect(checkCopy(tsx(wrap("{ready && `Ready ${n}`}")))).toHaveLength(1);
  });

  it("passes t() calls, other attributes, empty alt, punctuation and whitespace", () => {
    const ok = wrap(
      `<h1>{t("app.heading")}</h1> <img alt="" src="x.svg" /> <input aria-label={t("a.b", { n: 1 })} className="scan" /> <i>—</i> <b>{" "}</b> <u>{label}</u>`,
    );
    expect(checkCopy(tsx(ok))).toEqual([]);
  });

  it("runs on the real src/ and finds nothing", () => {
    const files = readCopyFiles(fileURLToPath(new URL("../..", import.meta.url)));
    expect(files.some((f) => f.path === "src/i18n/en.json")).toBe(true);
    expect(checkCopy(files)).toEqual([]);
  });
});
