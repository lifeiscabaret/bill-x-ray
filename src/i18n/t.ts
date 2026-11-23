import en from "./en.json";

export type Params = Record<string, string | number>;

function lookup(key: string): string | undefined {
  let node: unknown = en;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, part)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

// Under Vitest a missing key is a test failure; in the app it shows the key instead of
// crashing the screen. `process` does not exist in the browser, hence the typeof guard.
const underVitest = () => typeof process !== "undefined" && Boolean(process.env?.VITEST);

/** Looks up a dotted key in en.json and replaces `{name}` placeholders from `params`. */
export function t(key: string, params: Params = {}): string {
  const text = lookup(key);
  if (text === undefined) {
    if (underVitest()) throw new Error(`Missing interface string: ${key}`);
    return key;
  }
  // A placeholder with no value in `params` stays as written, so the gap is visible.
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}
