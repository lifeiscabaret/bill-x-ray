// App shell (scan-screen 6.1): the heading and tagline, the mode switcher (first in tab order),
// the "Reduce motion" toggle, and one scan view for the chosen sample. It decides nothing about
// a case: it loads the samples, shows what `parseCase` returned and leaves the rest to ScanView.
import { useEffect, useId, useMemo, useState } from "react";
import { t } from "../i18n/t";
import { ErrorBoundary } from "./ErrorBoundary";
import { IssueList } from "./IssueList";
import { ScanView } from "./ScanView";
import { SAMPLE_MODE_KEY, bundledModules, loadSamples, type RawModules, type SampleId } from "./samples";

type Mode = SampleId | "own";

/** Today's date on this computer's clock, as YYYY-MM-DD: the reference date of every case. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export interface AppProps {
  /** Raw case files; the bundled `data/cases/` by default, a map of your own in tests. */
  modules?: RawModules;
  /** YYYY-MM-DD; today's local date by default. */
  referenceDate?: string;
}

export function App({ modules = bundledModules, referenceDate }: AppProps) {
  const today = useMemo(() => referenceDate ?? localToday(), [referenceDate]);
  const samples = useMemo(() => loadSamples(modules, today), [modules, today]);
  // With no sample the app opens on "Scan your own bill" (D-020, D-015).
  const [mode, setMode] = useState<Mode>(() => samples[0]?.caseId ?? "own");
  const [reduce, setReduce] = useState(() => document.documentElement.dataset.motion === "reduce");
  const ownId = useId();

  // `data-motion` on the root element is what the scanner and the stylesheet read.
  useEffect(() => {
    document.documentElement.dataset.motion = reduce ? "reduce" : "full";
  }, [reduce]);

  const sample = mode === "own" ? undefined : samples.find((s) => s.caseId === mode);

  return (
    <main className="app">
      <header className="app__header">
        <h1>{t("app.heading")}</h1>
        <p className="app__tagline">{t("app.tagline")}</p>
      </header>
      <nav className="app__modes" aria-label={t("app.modes")}>
        {samples.map((s) => (
          <button key={s.caseId} type="button" aria-pressed={sample === s} onClick={() => setMode(s.caseId)}>
            {t(SAMPLE_MODE_KEY[s.caseId])}
          </button>
        ))}
        <button type="button" aria-pressed={sample === undefined} onClick={() => setMode("own")}>
          {t("mode.own")}
        </button>
      </nav>
      <div className="app__options">
        <button type="button" aria-pressed={reduce} onClick={() => setReduce(!reduce)}>
          {t("app.reduceMotion")}
        </button>
      </div>
      {sample === undefined ? (
        // The form arrives in scan-screen 7.
        <section aria-labelledby={ownId}>
          <h2 id={ownId}>{t("mode.own")}</h2>
        </section>
      ) : sample.blocked || sample.model === null ? (
        <IssueList key={sample.caseId} issues={sample.issues} />
      ) : (
        <ErrorBoundary key={sample.caseId}>
          <h2 className="app__case">{sample.model.case.title}</h2>
          <ScanView model={sample.model} />
        </ErrorBoundary>
      )}
    </main>
  );
}
