// scan-screen 9.2: under data-motion="reduce" the stylesheet has no transitions or animations.
// jsdom does not run the CSS cascade faithfully, so the check reads the stylesheet itself:
// one closing rule switches every kind of motion off with !important, and no other rule may
// use !important on motion or come after it. A declaration without !important then always loses.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CSS = readFileSync(join(import.meta.dirname, "../../src/ui/styles.css"), "utf8");

interface Rule {
  selector: string;
  decls: { prop: string; value: string; important: boolean }[];
  atRule: string | null;
}

/** A small reader for this stylesheet: plain rules and one level of @media. No other nesting. */
export function readRules(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  let at: string | null = null;
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    const close = text.indexOf("}", i);
    if (open === -1 || (close !== -1 && close < open)) {
      // a "}" that closes an @media block
      at = null;
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    const head = text.slice(i, open).trim();
    if (/^@(media|supports)/.test(head)) {
      at = head;
      i = open + 1;
      continue;
    }
    const end = text.indexOf("}", open);
    const body = text.slice(open + 1, end);
    const decls = body
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const colon = d.indexOf(":");
        const value = d.slice(colon + 1).trim();
        return { prop: d.slice(0, colon).trim().toLowerCase(), value: value.replace(/\s*!important$/, ""), important: /!important$/.test(value) };
      });
    rules.push({ selector: head, decls, atRule: at });
    i = end + 1;
  }
  return rules;
}

const isMotion = (prop: string) => /^(transition|animation)(-|$)/.test(prop) || prop === "scroll-behavior";
const RULES = readRules(CSS);
const OVERRIDE_START = ':root[data-motion="reduce"]';
const isOverride = (r: Rule) => r.selector.split(",").every((s) => s.trim().startsWith(OVERRIDE_START));
const overrideAt = RULES.findIndex(isOverride);

afterEach(() => {
  delete document.documentElement.dataset.motion;
});

describe("reduced motion in the stylesheet (9.2)", () => {
  it("reads the stylesheet into rules", () => {
    expect(RULES.length).toBeGreaterThan(80);
    expect(RULES.some((r) => r.selector === ".node" && r.decls.some((d) => d.prop === "position"))).toBe(true);
  });

  it('has one data-motion="reduce" rule that turns off transitions, animations and smooth scrolling', () => {
    expect(RULES.filter(isOverride).length).toBe(1);
    const rule = RULES[overrideAt]!;
    expect(rule.atRule).toBeNull();
    const selectors = rule.selector.split(",").map((s) => s.trim());
    expect(selectors).toEqual([`${OVERRIDE_START} *`, `${OVERRIDE_START} *::before`, `${OVERRIDE_START} *::after`]);
    const by = Object.fromEntries(rule.decls.map((d) => [d.prop, d]));
    for (const prop of ["transition", "animation"]) {
      expect(by[prop], prop).toMatchObject({ value: "none", important: true });
    }
    expect(by["scroll-behavior"]).toMatchObject({ value: "auto", important: true });
  });

  it("is the last rule of the file", () => {
    expect(overrideAt).toBe(RULES.length - 1);
  });

  it("is the only place with !important on motion, and nothing after it declares motion", () => {
    const loud = RULES.flatMap((r, index) =>
      isOverride(r) ? [] : r.decls.filter((d) => isMotion(d.prop) && d.important).map((d) => `${r.selector} { ${d.prop} }`).concat(
        index > overrideAt ? r.decls.filter((d) => isMotion(d.prop)).map((d) => `${r.selector} { ${d.prop} } (after the override)`) : [],
      ),
    );
    expect(loud).toEqual([]);
  });

  it("matches every element under data-motion=reduce and none under full", () => {
    const probe = document.createElement("div");
    probe.innerHTML = "<p><span></span></p>";
    document.body.append(probe);
    try {
      for (const s of ["div", "p", "span"]) {
        const el = probe.querySelector(s) ?? probe;
        document.documentElement.dataset.motion = "reduce";
        expect(el.matches(`${OVERRIDE_START} *`), s).toBe(true);
        document.documentElement.dataset.motion = "full";
        expect(el.matches(`${OVERRIDE_START} *`), s).toBe(false);
      }
    } finally {
      probe.remove();
    }
  });

  it("has no keyframes or motion that the reduce rule does not reach (every motion declaration is an element rule)", () => {
    // A motion declaration inside @keyframes would be read as a rule with a percentage selector.
    expect(CSS).not.toMatch(/@keyframes/);
    expect(RULES.filter((r) => /^\d+%|^from$|^to$/.test(r.selector))).toEqual([]);
  });
});
