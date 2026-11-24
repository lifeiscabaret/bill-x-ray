// The "Compare" section (scan-screen 8.1): which two texts of the form are compared. The
// comparison itself is `compareTexts` from src/compare; nothing is scored (D-012). Pure, no DOM.
import { compareTexts, type CompareResult } from "../../compare/diff";
import { isNews, type FormState } from "./toCaseInput";

export interface CompareOption {
  /** The id of the version row (mode "versions") or of the clause row (mode "clauses"). */
  id: string;
  /** Position of the version in the form, counted from 1; for a clause, the version it sits under. */
  version: number;
  /** Position of the clause within its version, counted from 1; null for a version. */
  clause: number | null;
  /** The text to compare: the pasted text of a version, or the excerpt of a clause. */
  text: string;
  /** The version's language, for `lang` on the shown text. */
  lang: string;
  /** What names the option next to its position: the version label, or the clause location. */
  name: string;
}

/** The texts the form can compare. News from another outlet has none to offer (D-016). */
export function compareOptions(state: FormState, mode: FormState["compare"]["mode"]): CompareOption[] {
  return state.versions.flatMap((v, i): CompareOption[] => {
    if (isNews(v)) return [];
    const lang = v.language.trim() || "und";
    if (mode === "versions") return [{ id: v.id, version: i + 1, clause: null, text: v.pastedText, lang, name: v.label.trim() }];
    return v.clauses.map((c, k) => ({ id: c.id, version: i + 1, clause: k + 1, text: c.excerpt, lang, name: c.anchor.trim() }));
  });
}

export interface ComparePick {
  options: CompareOption[];
  a: CompareOption | undefined;
  b: CompareOption | undefined;
  /** null until both texts have words in them. */
  result: CompareResult | null;
}

/**
 * The two texts the form compares now. A choice that no longer exists (a removed row) or was
 * never made falls back to the first text on offer for A and the next one for B, so two entered
 * versions show their difference at once.
 */
export function pickCompare(state: FormState): ComparePick {
  const { mode, a: wantA, b: wantB } = state.compare;
  const options = compareOptions(state, mode);
  const a = options.find((o) => o.id === wantA) ?? options[0];
  const b = options.find((o) => o.id === wantB) ?? options.find((o) => o !== a);
  const ready = a !== undefined && b !== undefined && a.text.trim() !== "" && b.text.trim() !== "";
  return { options, a, b, result: ready ? compareTexts(a.text, b.text) : null };
}
