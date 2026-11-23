/// <reference types="vite/client" />
// Sample loading (scan-screen 6.2). The case files in data/cases/ are read as raw text with
// Vite's `?raw` query, so the case text stays in the bundle as one string literal and
// `npm run check:dist` can read it back from dist/ (data-contract 11.3). Each string is
// parsed here, unchanged, and goes through `parseCase` with origin "bundled".
//
// Do not import the same files a second time as objects, and do not split, join or encode the
// strings: check:dist would no longer find the case data and would fail.
import { parseCase, type Issue, type ScanModel } from "../contract";

/** The case ids of the two samples; a sample button exists only for an id that loaded (D-015). */
export const SAMPLE_IDS = ["us-116-hr748", "kr-semiconductor-special-act"] as const;
export type SampleId = (typeof SAMPLE_IDS)[number];

/** File path to raw JSON text. `@samples` is data/cases/, or the synthetic fixtures in fixtures mode. */
export type RawModules = Record<string, string>;

export const bundledModules: RawModules = import.meta.glob("@samples/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The en.json key of each sample's mode button. */
export const SAMPLE_MODE_KEY: Record<SampleId, string> = {
  "us-116-hr748": "mode.us",
  "kr-semiconductor-special-act": "mode.kr",
};

export interface Sample {
  caseId: SampleId;
  file: string;
  /** null only when the file is not a usable case at all. */
  model: ScanModel | null;
  issues: Issue[];
  /** True when the sample has a block issue (or no model): the screen lists the issues, not a scan. */
  blocked: boolean;
}

const isSampleId = (id: unknown): id is SampleId => SAMPLE_IDS.some((known) => known === id);

/**
 * Parses every file of `modules` and keeps those whose `caseId` is one of the two sample ids.
 * Files are read in file-name order; when two files carry the same id the first one wins.
 *
 * shortcut: a file that is not valid JSON, or has no known caseId, is skipped without a
 * message here (`npm run validate:data` reports it). Show it when the case picker of P1 lands.
 */
export function loadSamples(modules: RawModules, referenceDate: string): Sample[] {
  const samples = new Map<SampleId, Sample>();
  for (const file of Object.keys(modules).sort()) {
    let value: unknown;
    try {
      value = JSON.parse(modules[file]!);
    } catch {
      continue;
    }
    const caseId = typeof value === "object" && value !== null ? (value as { caseId?: unknown }).caseId : undefined;
    if (!isSampleId(caseId) || samples.has(caseId)) continue;
    const { model, issues } = parseCase(value, { referenceDate, origin: "bundled" });
    samples.set(caseId, { caseId, file, model, issues, blocked: model === null || issues.some((i) => i.severity === "block") });
  }
  return SAMPLE_IDS.flatMap((id) => samples.get(id) ?? []);
}
