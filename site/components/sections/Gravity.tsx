import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { GravityStage } from "./GravityStage";

/** Architectural Gravity: how much of a system rests on a member, decomposed into its measured terms. */
export function Gravity() {
  return (
    <Section
      id="gravity"
      title="Some components hold up more of the system than others."
      lede="Architectural Gravity measures how much of a system rests on a component, from the shape of its dependency graph alone."
      aside={<Status status="planned" label="Katedrala heuristic, planned for v1" />}
    >
      <GravityStage />
      <p className="measure mt-12 text-[0.875rem] leading-relaxed text-ink-faint">
        Gravity is a Katedrala heuristic, not an established metric. It combines established graph
        measures: reachability, as in the propagation cost of MacCormack, Rusnak and Baldwin (2006),
        and betweenness centrality (Freeman 1977; computed with Brandes 2001). The weights are
        design choices, documented with the method.
      </p>
    </Section>
  );
}
