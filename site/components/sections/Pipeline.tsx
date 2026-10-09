import type { CSSProperties } from "react";
import { Status } from "@/components/ui/Status";
import {
  formatParts,
  formatScore,
  measurementOf,
  moduleMeasurementOf,
  OTHER_MEMBERS,
} from "@/lib/demo/metrics";
import { REAL_EDGE, type Status as StatusValue } from "@/lib/site";
import evidence from "@/public/data/codeverse-evidence.json";

// Parse and Link show real output: the relationship the film traces in Katedrala's analysis of CodeVerse, read
// from the evidence the page is built with. Every value below comes from that file; none is typed here.
const realEdge = evidence.relationships.find((r) => r.id === evidence.realEdge);
if (realEdge === undefined || realEdge.id !== REAL_EDGE.id) {
  throw new Error("codeverse-evidence.json does not carry REAL_EDGE: rebuild it");
}
const symbolOf = (id: string) => {
  const symbol = evidence.symbols.find((s) => s.id === id);
  if (symbol === undefined) throw new Error(`codeverse-evidence.json has no symbol ${id}`);
  return symbol;
};
const caller = symbolOf(realEdge.source);
const callee = symbolOf(realEdge.target);
if (callee.file !== evidence.dependency.id) {
  throw new Error("REAL_EDGE does not end in the dependency codeverse-evidence.json describes");
}
const observed = realEdge.provenance[0]!;
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// Infer, Analyze and Explain preview v1 on the demonstration system: PaymentService and its module.
const payment = measurementOf("PaymentService");
const paymentModule = moduleMeasurementOf(payment.node.module);
// The four Gravity terms at two decimals, rounded so they add up to the score the Analyze pass shows.
const parts = formatParts(
  payment.terms.map((t) => t.contribution),
  payment.gravity,
);

interface Stage {
  readonly verb: string;
  readonly text: string;
  readonly status: StatusValue;
  /** What this pass adds to the document, in Katedrala's own vocabulary. */
  readonly artifact: readonly (readonly [string, string])[];
}

const STAGES: readonly Stage[] = [
  {
    verb: "Parse",
    text: "Each TypeScript and JavaScript file becomes symbols, imports, exports and references.",
    status: "available",
    artifact: [
      ["file", fileName(evidence.dependency.path)],
      ["symbols", evidence.dependency.symbolCount.toLocaleString("en-US")],
      [callee.kind, callee.name],
    ],
  },
  {
    verb: "Link",
    text: "Imports resolve through tsconfig paths, workspaces and package exports; references bind to their declarations. What cannot be bound is counted, never guessed.",
    status: "available",
    artifact: [
      ["edge", realEdge.kind],
      ["from", caller.name],
      ["to", callee.name],
      ["at", `${fileName(observed.file)}:${observed.line}`],
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
 * The hinge between the film and the demonstration: the five passes drawn as a hanging chain. The plate opens on
 * the board the film stood on, drawn flat and labelled "Source code"; each pass hangs from the one before, because
 * it works on that pass's output, so the document grows downward. Parse and Link run today: solid weights on taut
 * chains. Infer, Analyze and Explain are planned: open rings on dashed chains, a structure still in construction.
 * Every length of chain is as heavy as the passes hanging from it. No motion: it is the calm after the film.
 */
export function Pipeline() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="section hinge">
      <div className="frame">
        <div className="hinge-board ground-hatch bleed-x" aria-hidden="true">
          <span className="hinge-board-label">Source code</span>
        </div>
        <div className="hinge-body">
          {/* The first length of chain, from the board to Parse: it carries all five passes. */}
          <span className="hinge-hang" aria-hidden="true" />
          <div className="hinge-head">
            <h2 id="how-it-works-title" className="display">
              From source code to architecture.
            </h2>
            <p className="lede mt-6">
              Katedrala is designed as five passes. Each adds to the document and never rewrites
              what an earlier pass produced.
            </p>
          </div>
          <ol className="hinge-passes">
            {STAGES.map((stage, index) => {
              const below = STAGES[index + 1];
              return (
                <li
                  key={stage.verb}
                  className="hinge-pass"
                  data-status={stage.status}
                  // The length of chain under this pass holds the next one: drawn as that pass's status,
                  // as heavy as the passes below it.
                  data-chain={below?.status}
                  style={{ "--held": STAGES.length - 1 - index } as CSSProperties}
                >
                  <span className="hinge-chain" aria-hidden="true">
                    <span className="hinge-weight" />
                  </span>
                  <p className="hinge-number data">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="hinge-verb">{stage.verb}</h3>
                  <p className="hinge-text">{stage.text}</p>
                  <div className="hinge-status">
                    <Status status={stage.status} />
                  </div>
                  <dl className="hinge-artifact">
                    {stage.artifact.map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ol>
          <p className="footnote hinge-note">
            Parse and Link show Katedrala&rsquo;s real output for CodeVerse, the relationship traced
            in the film above. Infer, Analyze and Explain preview v1 on the demonstration system the
            rest of this page uses.
          </p>
        </div>
      </div>
    </section>
  );
}
