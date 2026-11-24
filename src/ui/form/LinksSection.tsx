// Section 5 of "Scan your own bill": links (scan-screen 8.1). A link has a kind from the
// contract's list (D-010), two ends and the clause rows that back it. The form decides nothing
// about it: the contract checks the kind against the ends and the evidence, and a link stays
// "Not verified" (D-009). There is no control here that marks a link as confirmed.
import { t } from "../../i18n/t";
import { Issues, RowButton, SelectField, versionName, type SectionProps } from "./fields";
import {
  LINK_KINDS, PROMISE_REF, fieldDomId, newLink, rowDomId, type LinkRow,
} from "./toCaseInput";

export function LinksSection({ state, setState, issuesOf, leftOut, focus }: SectionProps) {
  const choose = { value: "", text: t("form.choose") };
  const kindOptions = [choose, ...LINK_KINDS.map((k) => ({ value: k, text: t(`form.linkKindOption.${k}`) }))];

  // Every row a link end can point at: a version, a clause of a version, or the promise.
  const versionOptions = state.versions.map((v, i) => ({ value: v.id, text: versionName(v, i + 1) }));
  const clauseOptions = state.versions.flatMap((v, i) =>
    v.clauses.map((c, k) => ({
      value: c.id,
      text: c.anchor.trim() === "" ? t("form.clauseName", { v: i + 1, c: k + 1 }) : t("form.clauseNameWithAnchor", { v: i + 1, c: k + 1, anchor: c.anchor.trim() }),
    })),
  );
  const endOptions = [choose, ...versionOptions, ...clauseOptions, { value: PROMISE_REF, text: t("form.promiseEnd") }];
  const evidenceOptions = [choose, ...clauseOptions];

  const change = (id: string, patch: Partial<LinkRow>) =>
    setState((s) => ({ ...s, links: s.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));

  const add = () => {
    const id = `p${state.counter + 1}`;
    setState((s) => ({ ...s, counter: s.counter + 1, links: [...s.links, newLink(id)] }));
    focus(fieldDomId(id, "kind"));
  };
  const remove = (id: string) => {
    setState((s) => ({ ...s, links: s.links.filter((l) => l.id !== id) }));
    focus("own-add-link");
  };

  return (
    <>
      <p className="form__hint">{t("form.linksHint")}</p>
      {state.links.length === 0 ? <p>{t("form.noLinks")}</p> : null}
      <ol className="form__rows">
        {state.links.map((l, index) => {
          const n = index + 1;
          const row = rowDomId(l.id);
          const forLink = t("form.forLink", { n });
          return (
            <li key={l.id}>
              <fieldset id={row} className="form__row">
                <legend>{t("form.linkName", { n })}</legend>
                {leftOut.has(row) ? <p className="form__left-out">{t("form.leftOut")}</p> : null}
                <Issues id={row} issues={issuesOf(row)} />
                <SelectField id={fieldDomId(l.id, "kind")} label={t("form.linkKind")} value={l.kind} options={kindOptions} issues={issuesOf(fieldDomId(l.id, "kind"))} onChange={(kind) => change(l.id, { kind: kind as LinkRow["kind"] })} />
                <SelectField id={fieldDomId(l.id, "from")} label={t("form.linkFrom")} value={l.from} options={endOptions} issues={issuesOf(fieldDomId(l.id, "from"))} onChange={(from) => change(l.id, { from })} />
                <SelectField id={fieldDomId(l.id, "to")} label={t("form.linkTo")} value={l.to} options={endOptions} issues={issuesOf(fieldDomId(l.id, "to"))} onChange={(to) => change(l.id, { to })} />
                <h4>{t("form.linkEvidenceHeading")}</h4>
                {l.evidence.length === 0 ? <p>{t("form.noLinkEvidence")}</p> : null}
                <ul className="form__rows">
                  {l.evidence.map((e, k) => (
                    <li key={k} className="form__row form__row--inner">
                      <SelectField
                        id={fieldDomId(l.id, `evidence-${k}`)}
                        label={t("form.linkEvidence")}
                        value={e}
                        options={evidenceOptions}
                        issues={issuesOf(fieldDomId(l.id, `evidence-${k}`))}
                        onChange={(value) => change(l.id, { evidence: l.evidence.map((x, j) => (j === k ? value : x)) })}
                      />
                      <RowButton
                        text={t("form.removeLinkEvidence")}
                        row={t("form.forLinkEvidence", { l: n, e: k + 1 })}
                        onClick={() => {
                          change(l.id, { evidence: l.evidence.filter((_, j) => j !== k) });
                          focus(fieldDomId(l.id, "add-evidence"));
                        }}
                      />
                    </li>
                  ))}
                </ul>
                <Issues id={fieldDomId(l.id, "add-evidence")} issues={issuesOf(fieldDomId(l.id, "add-evidence"))} />
                <RowButton
                  id={fieldDomId(l.id, "add-evidence")}
                  text={t("form.addLinkEvidence")}
                  row={forLink}
                  onClick={() => {
                    change(l.id, { evidence: [...l.evidence, ""] });
                    focus(fieldDomId(l.id, `evidence-${l.evidence.length}`));
                  }}
                />
                <div className="form__buttons">
                  <RowButton text={t("form.removeLink")} row={forLink} onClick={() => remove(l.id)} />
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <button type="button" id="own-add-link" onClick={add}>
        {t("form.addLink")}
      </button>
    </>
  );
}
