import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { formatScore, measurementOf, OTHER_MEMBERS } from "@/lib/demo/metrics";
import type { Status as StatusValue } from "@/lib/site";

const payment = measurementOf("PaymentService");
const term = (key: string) => payment.terms.find((t) => t.key === key)!;

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
      ["file", "payment.service.ts"],
      ["class", "PaymentService"],
      ["import", "StripeClient"],
    ],
  },
  {
    verb: "Link",
    text: "Every import and reference resolves to the declaration it names, through tsconfig paths, workspaces and package exports.",
    status: "available",
    artifact: [
      ["edge", "instantiates"],
      ["to", "StripeClient"],
      ["from", "payment.service.ts:14"],
    ],
  },
  {
    verb: "Infer",
    text: "Components, modules and layers are discovered, each with a confidence and the evidence behind it.",
    status: "planned",
    artifact: [
      ["module", "payments"],
      ["members", "3"],
      ["layer", "service"],
    ],
  },
  {
    verb: "Analyze",
    text: "The dependency graph is measured: coupling, cycles, centrality, Gravity and Entropy.",
    status: "planned",
    artifact: [
      ["gravity", formatScore(payment.gravity)],
      ["reach", `${payment.transitiveDependents.length} of ${OTHER_MEMBERS}`],
      ["fan-in", String(payment.dependedOnBy.length)],
    ],
  },
  {
    verb: "Explain",
    text: "Every conclusion decomposes into the measurements and the lines of code it came from.",
    status: "planned",
    artifact: [
      ["reach", formatScore(term("reach").contribution)],
      ["spread", formatScore(term("spread").contribution)],
      ["brokerage", formatScore(term("brokerage").contribution)],
    ],
  },
];

/** The analysis as five passes along one beam; each pass reads only what the previous one produced. */
export function Pipeline() {
  return (
    <Section
      id="how-it-works"
      title="From source code to architecture."
      lede="Katedrala works in passes. Each pass reads only what the previous one produced, so every result traces back to a line of source."
    >
      <ol className="pipeline">
        {STAGES.map((stage, index) => (
          <li key={stage.verb} className="pipeline-stage" tabIndex={0}>
            <div className="pipeline-beam" aria-hidden="true">
              <span className="pipeline-joint" />
            </div>
            <p className="data text-ink-faint">{String(index + 1).padStart(2, "0")}</p>
            <h3 className="subheading mt-1">{stage.verb}</h3>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{stage.text}</p>
            <div className="mt-4">
              <Status status={stage.status} />
            </div>
            <dl className="pipeline-artifact">
              {stage.artifact.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-ink-faint">{key}</dt>
                  <dd className="truncate text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-[0.875rem] text-ink-faint">
        The artifacts follow one member of the demonstration system, PaymentService, through every
        pass.
      </p>
    </Section>
  );
}
