// The one place that reads the screen width (scan-screen 9.1, D-014). `layoutScan` never
// measures anything: it is told the orientation, and this hook asks the browser which one.
import { useSyncExternalStore } from "react";
import { NARROW_BELOW_PX, type Orientation } from "./layout";

/** True from 720 px up: the scan runs left to right. Below it the scan runs top to bottom. */
export const WIDE_QUERY = `(min-width: ${NARROW_BELOW_PX}px)`;

// shortcut: a browser without matchMedia (or a test without a stub) gets the wide layout.
const list = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null;

function subscribe(onChange: () => void): () => void {
  const m = list();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

const current = (): Orientation => (list()?.matches === false ? "vertical" : "horizontal");

export function useOrientation(): Orientation {
  return useSyncExternalStore(subscribe, current, () => "horizontal");
}
