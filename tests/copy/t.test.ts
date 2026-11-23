import { describe, expect, it, vi } from "vitest";
import en from "../../src/i18n/en.json";
import { t } from "../../src/i18n/t";

describe("en.json", () => {
  it("has the eleven groups and the first-screen copy", () => {
    expect(Object.keys(en)).toEqual(["app", "mode", "scanner", "kind", "status", "need", "issue", "dateKind", "timing", "panel", "form"]);
    expect(t("app.heading")).toBe("Same number. Different body.");
    expect(t("app.tagline")).toBe("Follow the clause, not just the bill number.");
  });
});

describe("t", () => {
  it("throws on a missing key under Vitest", () => {
    expect(() => t("app.nope")).toThrow("app.nope");
    expect(() => t("app")).toThrow(); // a group is not a string
  });

  it("returns the key outside Vitest", () => {
    vi.stubEnv("VITEST", "");
    try {
      expect(t("app.nope")).toBe("app.nope");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
