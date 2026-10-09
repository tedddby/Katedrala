import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { LINKS, MILESTONES, MILESTONE_LABEL, type MilestoneState } from "@/lib/site";
import { counted } from "@/lib/text";

const FACTS = [
  {
    title: "MIT licensed",
    text: "Use it, change it and build on it, in open-source and commercial work alike.",
  },
  {
    title: "A formal contract",
    text: "The architecture document is specified in the repository, as TypeScript types and the JSON Schema generated from them.",
  },
  {
    title: "Recorded decisions",
    text: "Architecture decision records explain how the engine is built, and why.",
  },
  {
    title: "Built to extend",
    text: "Languages plug in through a typed adapter contract. TypeScript and JavaScript come first.",
  },
] as const;

const done = MILESTONES.filter((m) => m.state === "done").length;
const inProgress = MILESTONES.filter((m) => m.state === "in-progress").length;
const planned = MILESTONES.length - done - inProgress;
/** "4 of 15 milestones done, 1 in progress.": the in-progress clause only while something is in progress. */
const progress = `${done} of ${MILESTONES.length} milestones done${inProgress > 0 ? `, ${inProgress} in progress` : ""}.`;

/** Open source: what the project is made of, and an honest account of how far along it is. */
export function OpenSource() {
  return (
    <Section
      id="open-source"
      title="Read every line of it."
      lede="Katedrala is MIT licensed. Its engine, document contract, design decisions and roadmap all live in the repository."
    >
      <div className="grid-12 gap-y-14">
        <div className="col-span-12 lg:col-span-5">
          <dl className="grid gap-0">
            {FACTS.map((fact) => (
              <div key={fact.title} className="guarantee">
                <dt className="text-[0.9375rem] font-semibold text-ink">{fact.title}</dt>
                <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-soft">
                  {fact.text}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button href={LINKS.repository}>View on GitHub</Button>
            <Button href={LINKS.contributing} variant="secondary">
              Contribute
            </Button>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <h3 className="subheading">The road to v1.</h3>
          <p className="mt-3 text-[0.9375rem] text-ink-soft">
            {progress} Everything this page marks as planned for v1 is on this list.
          </p>
          <svg
            viewBox={`0 0 ${(MILESTONES.length - 1) * 24 + 12} 12`}
            className="mt-6 block h-3 w-full max-w-[22rem]"
            role="img"
            aria-label={[
              `${counted(done, "milestone")} done`,
              ...(inProgress > 0 ? [`${inProgress} in progress`] : []),
              `${planned} planned`,
            ].join(", ")}
          >
            <line
              x1={6}
              y1={6}
              x2={(MILESTONES.length - 1) * 24 + 6}
              y2={6}
              className="milestone-beam"
            />
            {MILESTONES.map((m, i) => (
              <MilestoneJoint key={m.name} state={m.state} x={i * 24 + 6} />
            ))}
          </svg>
          <ol className="milestones mt-6">
            {MILESTONES.map((m, i) => (
              <li key={m.name} className="milestone" data-state={m.state}>
                <span className="data text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="milestone-name">{m.name}</span>
                <span className="milestone-state">{MILESTONE_LABEL[m.state]}</span>
              </li>
            ))}
          </ol>
          <p className="footnote mt-5">
            From the{" "}
            <a href={LINKS.roadmap} rel="noopener" className="underline hover:text-ink">
              roadmap
            </a>{" "}
            in the repository.
          </p>
        </div>
      </div>
    </Section>
  );
}

/** A joint on the construction sequence: filled when done, half filled in progress, open when planned. */
function MilestoneJoint({ state, x }: { state: MilestoneState; x: number }) {
  return (
    <g transform={`translate(${x} 6)`} className="milestone-joint" data-state={state}>
      <circle r={4.5} />
      {state === "in-progress" && (
        <path d="M0 -4.5 A4.5 4.5 0 0 0 0 4.5 Z" className="milestone-joint-half" />
      )}
    </g>
  );
}
