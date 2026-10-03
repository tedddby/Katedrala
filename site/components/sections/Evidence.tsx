import { CodeBlock } from "@/components/ui/CodeBlock";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { OTHER_MEMBERS, formatScore, measurementOf } from "@/lib/demo/metrics";
import { moduleName } from "@/lib/demo/system";
import { REAL_EDGE } from "@/lib/site";
import { rests } from "@/lib/text";

const payment = measurementOf("PaymentService");
const term = (key: string) => payment.terms.find((t) => t.key === key)!;
const callers = payment.dependedOnBy.map((id) => measurementOf(id));

const REASONS = [
  {
    text: `${payment.transitiveDependents.length} of ${OTHER_MEMBERS} members ${rests(payment.transitiveDependents.length)} on it, directly or through other members.`,
    value: term("reach").contribution,
  },
  {
    text: `${payment.dependedOnBy.length} members call it directly: ${payment.dependedOnBy.join(", ")}.`,
    value: term("fan-in").contribution,
  },
  {
    text: `Its callers sit in ${term("spread").raw} other modules: ${[...new Set(callers.map((c) => moduleName(c.node.module)))].join(", ")}.`,
    value: term("spread").contribution,
  },
  {
    text: `It lies on ${payment.betweenness.toFixed(1)} of the shortest dependency paths between other members.`,
    value: term("brokerage").contribution,
  },
];

/** Explainability: every number decomposes, every relationship points to its source. */
export function Evidence() {
  return (
    <Section
      id="evidence"
      title="Every conclusion has evidence."
      lede="Katedrala never reports a verdict without its trail. Every score breaks down into measurements, and every relationship points to the lines of code it came from."
    >
      <div className="grid-12 gap-y-12">
        <div className="col-span-12 lg:col-span-6">
          <h3 className="subheading">
            Why does PaymentService score {formatScore(payment.gravity)}?
          </h3>
          <ol className="mt-6 grid gap-4">
            {REASONS.map((reason) => (
              <li key={reason.text} className="evidence-item">
                <svg aria-hidden="true" viewBox="0 0 12 12" className="mt-1 size-3 shrink-0">
                  <path
                    d="M1.5 6.5 4.5 9.5 10.5 2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                <span className="text-[0.9375rem] leading-relaxed text-ink-soft">
                  {reason.text}
                </span>
                <span className="data ml-auto pl-4 text-ink">+{formatScore(reason.value)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[0.8125rem] text-ink-faint">
            Demonstration system. Gravity is a draft Katedrala heuristic, planned for v1.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="subheading">One relationship, as Katedrala records it.</h3>
            <Status status="available" />
          </div>
          <CodeBlock
            label="real output: CodeVerse at 6b942bc"
            language="json"
            code={JSON.stringify(REAL_EDGE, null, 2)}
          />
          <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-faint">
            From Katedrala's analysis of the open-source CodeVerse repository: a call from{" "}
            <code className="text-ink-soft">createAnalysisService</code> to{" "}
            <code className="text-ink-soft">graphCacheKey</code>, observed twice, each observation
            with its file, line, column, syntax and the rule that resolved it.
          </p>
        </div>
      </div>
    </Section>
  );
}
