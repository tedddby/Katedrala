import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { ImpactStage } from "./ImpactStage";

/** Change impact: the structural blast radius of a change, with the path behind every affected member. */
export function Impact() {
  return (
    <Section
      id="impact"
      title="Know what a change will touch before you make it."
      lede="Katedrala traces dependency paths outward from a component to estimate the structural blast radius of a change, and shows the path behind every member it reaches."
      aside={<Status status="planned" />}
    >
      <ImpactStage />
    </Section>
  );
}
