import { diffWordsWithSpace } from "diff";

// Text comparison (data-contract 7, requirements 7.1 to 7.5). Pure: no DOM, no Node, and
// nothing from src/contract/. It returns segments only. There is no similarity figure (D-012).

export interface Segment {
  op: "equal" | "insert" | "delete";
  text: string;
}

export type CompareResult =
  | { ok: true; segments: Segment[] }
  | { ok: false; reason: "too_long" | "too_costly" };

export interface CompareLimits {
  /** Longest accepted input, in UTF-16 code units (`string.length`), checked for each text. */
  maxChars?: number;
  /** jsdiff `maxEditLength`: the most token edits it will look for before giving up. */
  maxEditLength?: number;
  /** jsdiff `timeout`: milliseconds after which it gives up. */
  timeoutMs?: number;
}

export const MAX_CHARS = 20_000;
// shortcut: 10,000 edits is a judgement, not a measured figure; the timeout is the real cap.
// Raise or lower it if a real pair of long clauses is refused or too slow.
export const MAX_EDIT_LENGTH = 10_000;
export const TIMEOUT_MS = 500;

/**
 * Word-level difference between two texts. Joining the `equal` and `delete` segments
 * rebuilds `before`; joining `equal` and `insert` rebuilds `after`. Same input, same output.
 *
 * `diffWordsWithSpace` keeps every space run and newline as a token, so nothing is dropped
 * (`diffWords` ignores whitespace and cannot guarantee the rebuild).
 * shortcut: the tokenizer splits on spaces and punctuation only. Each Korean syllable is
 * its own token, so Korean differences come out per syllable. Fine for P0; use
 * Intl.Segmenter later if word-level Korean is wanted.
 */
export function compareTexts(before: string, after: string, limits: CompareLimits = {}): CompareResult {
  const maxChars = limits.maxChars ?? MAX_CHARS;
  if (before.length > maxChars || after.length > maxChars) return { ok: false, reason: "too_long" };

  // jsdiff 9 returns undefined when maxEditLength or the timeout ends the run early.
  const changes = diffWordsWithSpace(before, after, {
    maxEditLength: limits.maxEditLength ?? MAX_EDIT_LENGTH,
    timeout: limits.timeoutMs ?? TIMEOUT_MS,
  });
  if (changes === undefined) return { ok: false, reason: "too_costly" };

  return {
    ok: true,
    segments: changes.map((c): Segment => ({
      op: c.added ? "insert" : c.removed ? "delete" : "equal",
      text: c.value,
    })),
  };
}
