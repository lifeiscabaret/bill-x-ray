// Scanner (scan-screen 5.1): a native range input from 0 to the number of columns and four
// buttons that do the same without dragging (Req 6.2). Dragging and the arrow keys change the
// value at once (`onJump`); the buttons ask for the animated change (`onGlide`, 400 ms, or
// immediate under data-motion="reduce"). The owner of the value decides how to animate.
import { useId, type KeyboardEvent } from "react";
import { t } from "../i18n/t";

export interface ScannerProps {
  /** The committed value, a whole number from 0 to `versionNames.length`. */
  value: number;
  /** One name per column, in case-file order, for aria-valuetext. */
  versionNames: string[];
  onJump: (value: number) => void;
  onGlide: (value: number) => void;
}

export function Scanner({ value, versionNames, onJump, onGlide }: ScannerProps) {
  const id = useId();
  const columns = versionNames.length;
  const valueText =
    value === 0
      ? t("scanner.valueNone")
      : t("scanner.valueText", { count: value, total: columns, versions: versionNames.slice(0, value).join(", ") });

  // shortcut: the keys are handled here instead of left to the browser, because jsdom has no
  // default action for them and the tests must reach the split state by key. The result is the
  // one a native range input gives (one step per arrow, Home and End at the ends).
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowUp" ? value + 1
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? value - 1
      : event.key === "Home" ? 0
      : event.key === "End" ? columns
      : null;
    if (next === null) return;
    event.preventDefault();
    onJump(Math.min(columns, Math.max(0, next)));
  };

  return (
    <div className="scanner">
      <label htmlFor={id} className="scanner__label">
        {t("scanner.label")}
      </label>
      <input
        id={id}
        className="scanner__range"
        type="range"
        min={0}
        max={columns}
        step={1}
        value={value}
        aria-valuetext={valueText}
        onChange={(event) => onJump(Number(event.target.value))}
        onKeyDown={onKeyDown}
      />
      <div className="scanner__buttons">
        <button type="button" onClick={() => onGlide(Math.min(columns, value + 1))}>
          {t("scanner.next")}
        </button>
        <button type="button" onClick={() => onGlide(Math.max(0, value - 1))}>
          {t("scanner.back")}
        </button>
        <button type="button" onClick={() => onGlide(columns)}>
          {t("scanner.showAll")}
        </button>
        <button type="button" onClick={() => onGlide(0)}>
          {t("scanner.reset")}
        </button>
      </div>
    </div>
  );
}
