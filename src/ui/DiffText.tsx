// Difference text (scan-screen 4.3). It only renders what compareTexts returned; the
// comparison itself lives in src/compare. Inserted and deleted text read without colour:
// <ins> is underlined, <del> is struck through, and each carries a visually hidden word.
import type { CompareResult } from "../compare/diff";
import { t } from "../i18n/t";

export interface DiffTextProps {
  result: CompareResult;
  /** Language of the compared texts, for `lang` on the rendered text. */
  lang?: string;
}

const isBlank = (text: string) => text.trim() === "";

export function DiffText({ result, lang }: DiffTextProps) {
  if (!result.ok) {
    // too_long and too_costly say the same thing to the reader: this pair cannot be compared here.
    return <p className="diff diff--refused">{t("panel.tooLong")}</p>;
  }
  const marked = result.segments.some((s) => s.op !== "equal" && !isBlank(s.text));
  return (
    <div className="diff">
      <p className="diff__text" lang={lang}>
        {result.segments.map((s, i) => {
          if (s.op === "equal") return s.text;
          // A whitespace-only change carries no markup: new spacing reads as plain text and
          // old spacing is dropped, so the unmarked text is always the new text's spacing.
          if (isBlank(s.text)) return s.op === "insert" ? s.text : null;
          return s.op === "insert" ? (
            <ins key={i}>
              <span className="sr-only">{t("panel.inserted")} </span>
              {s.text}
            </ins>
          ) : (
            <del key={i}>
              <span className="sr-only">{t("panel.deleted")} </span>
              {s.text}
            </del>
          );
        })}
      </p>
      {marked ? null : <p className="diff__none">{t("panel.noDifference")}</p>}
    </div>
  );
}
