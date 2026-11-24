// Section 4 of "Scan your own bill": which two texts to compare (scan-screen 8.1). The difference
// itself is drawn in the scan view, in its comparison strip, as soon as two texts are there.
import { t } from "../../i18n/t";
import { SelectField, type SectionProps } from "./fields";
import { pickCompare, type CompareOption } from "./compareChoice";

const MODES = ["versions", "clauses"] as const;

/** "Version 2: Enrolled text" or "Version 2, clause 1: Sec. 5": the position, then what names it. */
export const optionName = (o: CompareOption): string =>
  o.clause === null
    ? o.name === "" ? t("form.versionName", { n: o.version }) : t("form.versionNameWithLabel", { n: o.version, label: o.name })
    : o.name === "" ? t("form.clauseName", { v: o.version, c: o.clause }) : t("form.clauseNameWithAnchor", { v: o.version, c: o.clause, anchor: o.name });

export function CompareSection({ state, setState, issuesOf }: SectionProps) {
  const { options, a, b } = pickCompare(state);
  const texts = options.map((o) => ({ value: o.id, text: optionName(o) }));
  const pick = (side: "a" | "b") => (value: string) => setState((s) => ({ ...s, compare: { ...s.compare, [side]: value } }));
  return (
    <>
      <p className="form__hint">{t("form.compareHint")}</p>
      <SelectField
        id="own-compare-mode"
        label={t("form.compareMode")}
        value={state.compare.mode}
        options={MODES.map((m) => ({ value: m, text: t(`form.compareModeOption.${m}`) }))}
        issues={issuesOf("own-compare-mode")}
        onChange={(mode) => setState((s) => ({ ...s, compare: { mode: mode === "clauses" ? "clauses" : "versions", a: "", b: "" } }))}
      />
      {options.length < 2 ? (
        <p>{t(state.compare.mode === "versions" ? "form.compareNeedVersions" : "form.compareNeedClauses")}</p>
      ) : (
        <>
          <SelectField id="own-compare-a" label={t("form.compareEarlier")} value={a?.id ?? ""} options={texts} issues={issuesOf("own-compare-a")} onChange={pick("a")} />
          <SelectField id="own-compare-b" label={t("form.compareLater")} value={b?.id ?? ""} options={texts} issues={issuesOf("own-compare-b")} onChange={pick("b")} />
        </>
      )}
    </>
  );
}
