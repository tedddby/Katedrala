import { CodeBlock } from "@/components/ui/CodeBlock";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { OTHER_MEMBERS, formatParts, formatScore, measurementOf } from "@/lib/demo/metrics";
import { EDGES, moduleName } from "@/lib/demo/system";
import { CODEVERSE_ANALYSIS, REAL_EDGE } from "@/lib/site";
import { counted, listed, rests } from "@/lib/text";

const payment = measurementOf("PaymentService");
const term = (key: string) => payment.terms.find((t) => t.key === key)!;
/** Every term's contribution as shown, rounded so the four add up to the score on the heading. */
const shown = formatParts(
  payment.terms.map((t) => t.contribution),
  payment.gravity,
);
const callers = payment.dependedOnBy;
// Say "call" only when every direct dependency on it is a call.
const verb = EDGES.filter((e) => e.target === payment.node.id).every((e) => e.kind === "calls")
  ? callers.length === 1
    ? "calls"
    : "call"
  : callers.length === 1
    ? "depends on"
    : "depend on";
const otherModules = [
  ...new Set(
    callers
      .map((id) => measurementOf(id).node.module)
      .filter((module) => module !== payment.node.module),
  ),
].map(moduleName);

const REASON: Record<string, string> = {
  reach: `${payment.transitiveDependents.length} of ${OTHER_MEMBERS} members ${rests(payment.transitiveDependents.length)} on it, directly or through other members.`,
  "fan-in": `${counted(callers.length, "member")} ${verb} it directly: ${listed(callers)}.`,
  spread: `Its callers sit in ${counted(term("spread").raw, "other module")}: ${listed(otherModules)}.`,
  brokerage: `Its betweenness is ${payment.betweenness.toFixed(1)}: summed over pairs of other members, the share of each pair's shortest dependency paths that pass through it.`,
};

/** Explainability: every number decomposes, every relationship points to its source. */
export function Evidence() {
  return (
    <Section
      id="evidence"
      title="Every conclusion has evidence."
      lede="Every relationship points to the lines of code it came from, and every score will break down into its measurements."
    >
      <div className="grid-12 gap-y-12">
        <div className="col-span-12 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="subheading">
              Why does PaymentService score {formatScore(payment.gravity)}?
            </h3>
            <Status status="planned" />
          </div>
          <ol className="mt-6 grid gap-4">
            {payment.terms.map((t, i) => (
              <li key={t.key} className="evidence-item">
                <svg aria-hidden="true" viewBox="0 0 12 12" className="evidence-mark">
                  <path
                    d="M1.5 6.5 4.5 9.5 10.5 2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <span className="evidence-text">{REASON[t.key]}</span>
                <span className="evidence-product data">
                  <span aria-hidden="true">→ </span>
                  <span className="sr-only">{t.label}: normalized </span>
                  {formatScore(t.normalized)} ×<span className="sr-only"> weight</span>{" "}
                  {t.weight.toFixed(2)}
                </span>
                <span className="evidence-value data">
                  <span className="text-ink-faint">= </span>
                  {shown[i]}
                </span>
              </li>
            ))}
          </ol>
          <p className="evidence-sum">
            <span className="evidence-sum-label">Gravity</span>
            <span className="evidence-value data">{formatScore(payment.gravity)}</span>
          </p>
          <p className="footnote mt-6">
            Demonstration system. Each reason adds its normalized value times its weight, rounded so
            the four add up to the score. Gravity is a draft Katedrala heuristic, planned for v1.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="subheading">One relationship, as Katedrala records it.</h3>
            <Status status="available" />
          </div>
          <CodeBlock
            label={`real output: CodeVerse at ${CODEVERSE_ANALYSIS.commit}`}
            language="json"
            code={JSON.stringify(REAL_EDGE, null, 2)}
          />
          <p className="mt-4 max-w-[60ch] text-[0.875rem] leading-relaxed text-ink-faint">
            From Katedrala's analysis of the open-source CodeVerse repository: a call from{" "}
            <code className="text-[0.875em] text-ink-soft">createAnalysisService</code> to{" "}
            <code className="text-[0.875em] text-ink-soft">graphCacheKey</code>, observed twice,
            each observation with its file, line, column, syntax and the rule that resolved it.
          </p>
        </div>
      </div>
    </Section>
  );
}
