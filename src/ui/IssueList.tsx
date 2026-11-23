// The block issues of a sample that did not pass its checks (scan-screen 6.2). Each line is
// the JSON path and the contract's own English message.
//
// shortcut: the message is the contract's English fallback, not an `issue.<code>` string;
// scan-screen 7 writes those strings and this list should move to them then.
import { useId } from "react";
import { formatPath, type Issue } from "../contract";
import { t } from "../i18n/t";

export function IssueList({ issues }: { issues: Issue[] }) {
  const headingId = useId();
  const blocking = issues.filter((i) => i.severity === "block");
  return (
    <section className="app__issues" aria-labelledby={headingId}>
      <h2 id={headingId}>{t("app.sampleFailed")}</h2>
      <ul>
        {blocking.map((i, n) => (
          <li key={n}>{t("app.issueAt", { where: formatPath(i.path), message: i.message })}</li>
        ))}
      </ul>
    </section>
  );
}
