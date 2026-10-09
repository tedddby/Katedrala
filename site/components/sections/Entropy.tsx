import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { EntropyStage } from "./EntropyStage";

/** Architectural Entropy: one score for structural disorder, recomputed as commits add dependencies. */
export function Entropy() {
  return (
    <Section
      id="entropy"
      title="Structure decays one dependency at a time."
      lede="Architectural Entropy will score disorder: cycles, dependencies against the grain, scattered coupling and propagation."
      aside={<Status status="planned" label="Katedrala heuristic, planned for v1" />}
    >
      <EntropyStage />
      <p className="footnote">
        Entropy is a Katedrala heuristic. Its factors come from established ideas: acyclic
        dependencies (Martin 2003), propagation cost (MacCormack, Rusnak and Baldwin 2006) and
        Shannon entropy (Shannon 1948). Their selection, normalization and weights are design
        choices, and the score has not been validated against maintenance outcomes.
      </p>
    </Section>
  );
}
