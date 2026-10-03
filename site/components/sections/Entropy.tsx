import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { EntropyStage } from "./EntropyStage";

/** Architectural Entropy: one score for structural disorder, recomputed as commits add dependencies. */
export function Entropy() {
  return (
    <Section
      id="entropy"
      title="Structure decays one dependency at a time."
      lede="Architectural Entropy scores the disorder in a dependency graph: cycles, dependencies that run against the grain, and coupling scattered across modules. Apply the commits and watch it rise."
      aside={<Status status="planned" label="Katedrala heuristic, planned for v1" />}
    >
      <EntropyStage />
      <p className="measure mt-12 text-[0.875rem] leading-relaxed text-ink-faint">
        Entropy is a Katedrala heuristic. Its factors come from established ideas: acyclic
        dependencies (Martin 2003), propagation cost (MacCormack, Rusnak and Baldwin 2006) and
        Shannon entropy (Shannon 1948). Their selection, normalization and weights are design
        choices, and the score has not been validated against maintenance outcomes.
      </p>
    </Section>
  );
}
