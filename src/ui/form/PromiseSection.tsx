// Section 6 of "Scan your own bill": the optional promise (scan-screen 8.1). Every promise source
// is treated as another outlet's article: the form has no excerpt box and never says the source is
// one of ours, so no excerpt of an article can reach the screen through it (D-016).
import { t } from "../../i18n/t";
import { Issues, TextField, type SectionProps } from "./fields";
import { PROMISE_ROW, fieldDomId, rowDomId, type PromiseFields } from "./toCaseInput";

// shortcut: no "Seoul Economic Daily article" option for the promise (D-016). A later decision
// that adds one for versions adds it here too.
const FIELDS: readonly { key: keyof PromiseFields; label: string; hint?: string; multiline?: boolean }[] = [
  { key: "statement", label: "form.promiseStatement", hint: "form.promiseStatementHint", multiline: true },
  { key: "sourceTitle", label: "form.promiseSourceTitle" },
  { key: "publisher", label: "form.promisePublisher" },
  { key: "sourceUrl", label: "form.promiseSourceUrl" },
  { key: "date", label: "form.promiseDate", hint: "form.promiseDateHint" },
  { key: "factSentence", label: "form.promiseFactSentence", hint: "form.promiseFactSentenceHint", multiline: true },
];

export function PromiseSection({ state, setState, issuesOf, leftOut }: SectionProps) {
  const row = rowDomId(PROMISE_ROW);
  return (
    <fieldset id={row} className="form__row">
      <legend>{t("form.promiseLegend")}</legend>
      <p className="form__hint">{t("form.promiseHint")}</p>
      {leftOut.has(row) ? <p className="form__left-out">{t("form.leftOut")}</p> : null}
      <Issues id={row} issues={issuesOf(row)} />
      {FIELDS.map((f) => {
        const id = fieldDomId(PROMISE_ROW, f.key);
        return (
          <TextField
            key={f.key}
            id={id}
            label={t(f.label)}
            hint={f.hint ? t(f.hint) : undefined}
            multiline={f.multiline}
            value={state.promise[f.key]}
            issues={issuesOf(id)}
            onChange={(value) => setState((s) => ({ ...s, promise: { ...s.promise, [f.key]: value } }))}
          />
        );
      })}
    </fieldset>
  );
}
