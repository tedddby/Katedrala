import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { LINKS, MILESTONES, MILESTONE_LABEL } from "@/lib/site";
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
/** The gauge's accessible name, in agreement with its counts: "4 milestones done, 1 in progress, 10 planned". */
const summary = [
  `${counted(done, "milestone")} done`,
  ...(inProgress > 0 ? [`${inProgress} in progress`] : []),
  `${planned} planned`,
].join(", ");
/**
 * The gauge's staff is built (chalk) from the ground up to the last of the milestones done without a gap, and
 * scaffolding (graphite) above it. Each row draws the stretch below its graduation and the stretch above it.
 */
const firstOpen = MILESTONES.findIndex((m) => m.state !== "done");
const builtTo = firstOpen === -1 ? MILESTONES.length : firstOpen;
const staff = (i: number) => (i < builtTo ? "built" : "scaffold");

/**
 * Open source: what the project is made of, and an honest account of how far along it is, drawn as the film's
 * level gauge standing on hatched ground: the project's own climb toward v1.
 */
export function OpenSource() {
  return (
    <Section
      id="open-source"
      title="Read every line of it."
      lede="Katedrala is MIT licensed. Its engine, document contract, design decisions and roadmap all live in the repository."
    >
      <div className="grid-12 gap-y-16">
        <div className="col-span-12 lg:col-span-5">
          <dl className="os-facts">
            {FACTS.map((fact) => (
              <div key={fact.title} className="os-fact">
                <dt className="text-[0.9375rem] font-semibold text-ink">{fact.title}</dt>
                <dd className="mt-1.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
                  {fact.text}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 flex flex-wrap gap-3">
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
          {/* The list keeps the roadmap's order, 01 to 15; the drawing stands it on the ground, 01 at the foot. */}
          <ol className="gauge" aria-label={summary}>
            {MILESTONES.map((m, i) => (
              <li
                key={m.name}
                className="gauge-row"
                data-state={m.state}
                data-staff={staff(i)}
                data-above={staff(i + 1)}
              >
                <span className="data gauge-number">{String(i + 1).padStart(2, "0")}</span>
                <span aria-hidden="true" className="gauge-tick" />
                <span className="gauge-name">{m.name}</span>
                <span className="gauge-state">{MILESTONE_LABEL[m.state]}</span>
              </li>
            ))}
          </ol>
          <div aria-hidden="true" className="gauge-ground ground-hatch" />
          <p className="footnote mt-4">
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
