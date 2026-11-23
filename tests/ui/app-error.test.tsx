import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/ui/App";

// A scan view that cannot render: the error boundary around it must catch this (scan-screen 6.3).
vi.mock("../../src/ui/ScanView", () => ({
  ScanView: () => {
    throw new Error("synthetic failure while rendering");
  },
}));

afterEach(cleanup);

const read = (name: string) => readFileSync(join(import.meta.dirname, "../fixtures/samples", `${name}.json`), "utf8");

describe("app: a case that fails to render", () => {
  it("shows the error sentence and keeps the mode switcher working", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <App
        modules={{ "a/us.json": read("us-116-hr748"), "a/kr.json": read("kr-semiconductor-special-act") }}
        referenceDate="2026-11-24"
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong reading this case");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Same number. Different body.");
    await user.click(screen.getByRole("button", { name: "Scan your own bill" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Scan your own bill" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Korea" }));
    expect(screen.getByRole("alert")).toBeTruthy(); // a new case, a fresh boundary
  });
});
