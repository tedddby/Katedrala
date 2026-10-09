import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import {
  formatParts,
  formatScore,
  measurementOf,
  moduleMeasurementOf,
  OTHER_MEMBERS,
} from "@/lib/demo/metrics";
import { EDGES } from "@/lib/demo/system";
import type { Status as StatusValue } from "@/lib/site";

// Every artifact is read from the demonstration system: PaymentService, its module, and the one dependency it
// creates by instantiating a class.
const payment = measurementOf("PaymentService");
const paymentModule = moduleMeasurementOf(payment.node.module);
const created = EDGES.find((e) => e.source === payment.node.id && e.kind === "instantiates")!;
// The four Gravity terms at two decimals, rounded so they add up to the score the Analyze pass shows.
const parts = formatParts(
  payment.terms.map((t) => t.contribution),
  payment.gravity,
);

interface Stage {
  readonly verb: string;
  readonly text: string;
  readonly status: StatusValue;
  /** What this pass produces for one member of the demonstration system, in Katedrala's own vocabulary. */
  readonly artifact: readonly (readonly [string, string])[];
}

const STAGES: readonly Stage[] = [
  {
    verb: "Parse",
    text: "Each TypeScript and JavaScript file becomes symbols, imports, exports and references.",
    status: "available",
    artifact: [
      ["file", payment.node.file.slice(payment.node.file.lastIndexOf("/") + 1)],
      ["class", payment.node.id],
      ["import", created.target],
    ],
  },
  {
    verb: "Link",
    text: "Imports resolve through tsconfig paths, workspaces and package exports; references bind to their declarations. What cannot be bound is counted, never guessed.",
    status: "available",
    artifact: [
      ["edge", created.kind],
      ["from", created.source],
      ["to", created.target],
    ],
  },
  {
    verb: "Infer",
    text: "Components will be derived from directories and packages; modules and layers will be inferred, each with a confidence and its evidence.",
    status: "planned",
    artifact: [
      ["module", paymentModule.id],
      ["members", String(paymentModule.members.length)],
      ["layer", payment.node.role],
    ],
  },
  {
    verb: "Analyze",
    text: "The dependency graph will be measured for coupling, cycles, centrality, Gravity and Entropy.",
    status: "planned",
    artifact: [
      ["gravity", formatScore(payment.gravity)],
      ["reach", `${payment.transitiveDependents.length} of ${OTHER_MEMBERS}`],
      ["fan-in", String(payment.dependedOnBy.length)],
    ],
  },
  {
    verb: "Explain",
    text: "Every conclusion will decompose into the measurements and the lines of code it came from.",
    status: "planned",
    artifact: payment.terms.map((t, i) => [t.key, `+${parts[i]}`] as const),
  },
];

/**
 * The analysis as five passes along one beam. Each pass adds to the document and never rewrites what an earlier
 * pass produced; Parse and Link run today, the rest are planned.
 */
export function Pipeline() {
  return (
    <Section
      id="how-it-works"
      title="From source code to architecture."
      lede="Katedrala is designed as five passes. Each adds to the document and never rewrites what an earlier pass produced."
    >
      <ol className="pipeline">
        {STAGES.map((stage, index) => (
          <li key={stage.verb} className="pipeline-stage">
            <div className="pipeline-beam" aria-hidden="true">
              <span className="pipeline-joint" />
            </div>
            <p className="pipeline-number data text-ink-faint">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="pipeline-verb subheading mt-1">{stage.verb}</h3>
            <p className="pipeline-text mt-3 text-[0.9375rem] leading-relaxed text-ink-soft md:max-xl:mt-0">
              {stage.text}
            </p>
            <div className="pipeline-status mt-4 md:max-xl:mt-3">
              <Status status={stage.status} />
            </div>
            <dl className="pipeline-artifact">
              {stage.artifact.map(([key, value]) => (
                <div key={key} className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-ink-faint">{key}</dt>
                  <dd className="ml-auto min-w-0 text-right text-ink [overflow-wrap:anywhere]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      <p className="footnote">
        The artifacts follow one member of the demonstration system, PaymentService, through every
        pass.
      </p>
    </Section>
  );
}
