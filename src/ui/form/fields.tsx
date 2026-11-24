// The small pieces every section of "Scan your own bill" is built from: a text field, a choice,
// a button whose full name says which row it belongs to, and the messages of one field or row.
import type { Dispatch, SetStateAction } from "react";
import type { Issue } from "../../contract";
import { t } from "../../i18n/t";
import type { FormState, VersionRow } from "./toCaseInput";

/** What a section of the form needs from the form: the state, a way to change it, and the messages. */
export interface SectionProps {
  state: FormState;
  setState: Dispatch<SetStateAction<FormState>>;
  issuesOf: (id: string) => readonly Issue[];
  /** Ids of the rows the contract left out of the scan. */
  leftOut: ReadonlySet<string>;
  /** Moves focus to the element with this id after the next render. */
  focus: (id: string) => void;
}

/** The messages of one field or row: severity in words, then the sentence for the code. */
export function Issues({ id, issues }: { id: string; issues: readonly Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul id={`${id}-issues`} className="form__issues">
      {issues.map((i, n) => (
        <li key={n} className={`form__issue form__issue--${i.severity}`}>
          <strong>{t(`form.severity.${i.severity}`)}</strong> {t(`issue.${i.code}`, i.params)}
        </li>
      ))}
    </ul>
  );
}

export const describedBy = (id: string, hint: string | undefined, issues: readonly Issue[]) =>
  [hint ? `${id}-hint` : "", issues.length > 0 ? `${id}-issues` : ""].filter(Boolean).join(" ") || undefined;
export const invalid = (issues: readonly Issue[]) => (issues.some((i) => i.severity === "block") ? true : undefined);

export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  issues: readonly Issue[];
  hint?: string;
  multiline?: boolean;
}

export function TextField({ id, label, value, onChange, issues, hint, multiline }: TextFieldProps) {
  const aria = { "aria-describedby": describedBy(id, hint, issues), "aria-invalid": invalid(issues) };
  return (
    <div className="form__field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className="form__hint">
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <textarea id={id} rows={4} value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} {...aria} />
      ) : (
        <input id={id} type="text" value={value} spellCheck={false} onChange={(e) => onChange(e.target.value)} {...aria} />
      )}
      <Issues id={id} issues={issues} />
    </div>
  );
}

export interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  issues: readonly Issue[];
  /** Value and visible text of each option, after an optional empty first option. */
  options: readonly { value: string; text: string }[];
  hint?: string;
}

export function SelectField({ id, label, value, onChange, issues, options, hint }: SelectFieldProps) {
  return (
    <div className="form__field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p id={`${id}-hint`} className="form__hint">
          {hint}
        </p>
      ) : null}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy(id, hint, issues)}
        aria-invalid={invalid(issues)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
      <Issues id={id} issues={issues} />
    </div>
  );
}

/** A button whose visible text is short and whose full name says which row it belongs to. */
export function RowButton({ id, text, row, onClick }: { id?: string; text: string; row: string; onClick: () => void }) {
  return (
    <button type="button" id={id} onClick={onClick}>
      {text}{" "}
      <span className="sr-only">{row}</span>
    </button>
  );
}

/** The name of a version in the form: its position, and its label when it has one. */
export const versionName = (v: VersionRow, n: number) =>
  v.label.trim() === "" ? t("form.versionName", { n }) : t("form.versionNameWithLabel", { n, label: v.label.trim() });
