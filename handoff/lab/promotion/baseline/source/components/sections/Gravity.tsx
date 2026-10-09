import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { GravityStage } from "./GravityStage";

/** Architectural Gravity: how much of a system rests on a member, decomposed into its measured terms. */
export function Gravity() {
  return (
    <Section
      id="gravity"
      title="Some members hold up more of the system than others."
      lede="Architectural Gravity will measure how much rests on each member, from the dependency graph and module boundaries."
      aside={<Status status="planned" label="Katedrala heuristic, planned for v1" />}
    >
      <GravityStage />
      <p className="footnote">
        Gravity is a Katedrala heuristic, not an established metric. Three of its four terms are
        established measures: reach is the visibility fan-in behind the propagation cost of
        MacCormack, Rusnak and Baldwin (2006), fan-in is afferent coupling (Martin 1994), and
        brokerage is betweenness centrality (Freeman 1977; computed with Brandes 2001). Cross-module
        spread is Katedrala's own. The weights are design choices and will be documented with the
        method in milestone 6.
      </p>
    </Section>
  );
}
