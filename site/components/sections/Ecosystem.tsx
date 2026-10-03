import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { CODEVERSE_ANALYSIS, LINKS, type Status as StatusValue } from "@/lib/site";

const TOOLS: readonly { name: string; text: string; status: StatusValue }[] = [
  {
    name: "CodeVerse",
    text: "The architecture as a city you can fly through.",
    status: "planned",
  },
  {
    name: "CI pipelines",
    text: "Fail a build when a change breaks a rule.",
    status: "planned",
  },
  { name: "Editors", text: "Impact and violations inline, as you type.", status: "after-v1" },
  { name: "Exporters", text: "C4 diagrams, Structurizr DSL and GraphML.", status: "after-v1" },
  { name: "Your tools", text: "Read the document, validated by its schema.", status: "available" },
];

const CHAIN: readonly { name: string; text: string; status?: StatusValue }[] = [
  { name: "Your repository", text: "Any TypeScript or JavaScript codebase." },
  {
    name: "Katedrala",
    text: "Files, symbols and relationships today; modules and measures next.",
    status: "available",
  },
  {
    name: "Architecture document",
    text: "One versioned JSON document, one schema.",
    status: "available",
  },
  {
    name: "CodeVerse adapter",
    text: "Turns the document into a visualization model.",
    status: "planned",
  },
  {
    name: "CodeVerse",
    text: "Districts, buildings and arcs that show the architecture.",
    status: "planned",
  },
];

/** The ecosystem: tools stand on Katedrala's document the way members rest on a foundation. */
export function Ecosystem() {
  return (
    <Section
      id="ecosystem"
      title="Built to carry other tools."
      lede="Everything Katedrala finds goes into one versioned document with a published schema. Visualizations, CI checks, editors and exporters read the same structure instead of parsing code themselves."
    >
      <figure className="eco">
        <ul className="eco-tools">
          {TOOLS.map((tool) => (
            <li key={tool.name} className="eco-tool">
              <p className="text-[0.9375rem] font-semibold text-ink">{tool.name}</p>
              <p className="mt-1 text-[0.875rem] leading-snug text-ink-soft">{tool.text}</p>
              <div className="mt-3">
                <Status status={tool.status} />
              </div>
              <span aria-hidden="true" className="eco-column" />
            </li>
          ))}
        </ul>
        <div className="eco-beam" aria-hidden="true" />
        <figcaption className="eco-layers">
          <div className="eco-layer">
            <span className="text-[0.9375rem] font-semibold text-ink">Architecture document</span>
            <span className="data text-ink-faint">versioned, with a published JSON Schema</span>
          </div>
          <div className="eco-layer eco-foundation">
            <span className="text-[0.9375rem] font-semibold text-ink">Katedrala</span>
            <span className="data text-ink-faint">parse, link, infer, measure, explain</span>
          </div>
          <div className="eco-layer">
            <span className="text-[0.9375rem] font-semibold text-ink-soft">Your repository</span>
            <span className="data text-ink-faint">TypeScript and JavaScript first</span>
          </div>
          <div aria-hidden="true" className="ground-hatch h-3 border-t border-graphite" />
        </figcaption>
      </figure>

      <div className="grid-12 mt-24 gap-y-12">
        <div className="col-span-12 lg:col-span-6">
          <h3 className="subheading">Being built to power CodeVerse.</h3>
          <p className="mt-5 text-[1.0625rem] leading-relaxed text-ink-soft">
            CodeVerse turns a GitHub repository into a 3D city you can fly through: directories
            become districts, files become buildings, imports become arcs. With Katedrala
            underneath, the city will show the architecture as well: inferred modules, the
            components that carry the most load, cycles and broken rules.
          </p>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-faint">
            CodeVerse is a separate open-source project, and Katedrala does not depend on it.
            Katedrala already analyzes its source:{" "}
            {CODEVERSE_ANALYSIS.symbols.toLocaleString("en-US")} symbols and{" "}
            {CODEVERSE_ANALYSIS.relationships.toLocaleString("en-US")} relationships, the same
            document on every run.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button href={LINKS.codeverse} variant="secondary">
              Open CodeVerse
            </Button>
            <a
              href={LINKS.codeverseRepository}
              rel="noopener"
              className="text-[0.9375rem] text-ink-soft underline hover:text-ink"
            >
              CodeVerse on GitHub
            </a>
          </div>
        </div>

        <ol
          className="chain col-span-12 lg:col-span-5 lg:col-start-8"
          aria-label="From repository to CodeVerse"
        >
          {CHAIN.map((step) => (
            <li key={step.name} className="chain-step" data-status={step.status ?? "source"}>
              <svg aria-hidden="true" viewBox="0 0 10 10" className="chain-joint">
                <circle cx="5" cy="5" r="3.5" />
              </svg>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-[0.9375rem] font-semibold text-ink">{step.name}</span>
                {step.status !== undefined && <Status status={step.status} />}
              </div>
              <p className="col-start-2 mt-1 text-[0.875rem] leading-snug text-ink-soft">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
