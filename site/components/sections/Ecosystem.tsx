import type { CSSProperties } from "react";
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
    text: "Will fail a build when a change breaks a rule.",
    status: "planned",
  },
  { name: "Editors", text: "Impact and violations inline, as you type.", status: "after-v1" },
  { name: "Exporters", text: "C4 diagrams, Structurizr DSL and GraphML.", status: "after-v1" },
  {
    name: "Your tools",
    text: "Build on the versioned document format and its JSON Schema.",
    status: "available",
  },
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
    text: "Versioned JSON: the structure today, the full architecture in v1.",
    status: "available",
  },
  {
    name: "CodeVerse adapter",
    text: "Will turn the document into a visualization model.",
    status: "planned",
  },
  {
    name: "CodeVerse",
    text: "Districts, buildings and arcs that will show the architecture.",
    status: "planned",
  },
];

/**
 * Stacked on phones, every tool keeps its own column down to the beam: the columns of the tools above run past
 * it in lanes on its left (`--lane` apart, ecosystem.css), each drawn as it is drawn whole: solid when available,
 * dashed when planned for v1, and for after v1 only its two ends (under the capital and on the beam), as the
 * status mark draws only the square's corners. The lanes are this tool's background, one layer per lane.
 */
function lanesPast(index: number): CSSProperties {
  const last = index === TOOLS.length - 1;
  const layers = TOOLS.slice(0, index).flatMap((tool, lane) => {
    const x = `calc(${lane} * var(--lane) + var(--shaft-x))`;
    if (tool.status === "available") {
      return [
        {
          image: "linear-gradient(var(--color-ink) 0 0)",
          position: `${x} 0`,
          size: "var(--shaft-w) 100%",
          repeat: "no-repeat",
        },
      ];
    }
    if (tool.status === "planned") {
      return [
        {
          image: "var(--dash)",
          position: `${x} 100%`,
          size: "var(--shaft-w) var(--dash-period)",
          repeat: "no-repeat repeat",
        },
      ];
    }
    // After v1: nothing between the ends; the lower end stands on the beam, under the last tool.
    return last
      ? [
          {
            image: "linear-gradient(var(--color-ink-faint) 0 0)",
            position: `${x} 100%`,
            size: "var(--shaft-w) var(--end)",
            repeat: "no-repeat",
          },
        ]
      : [];
  });
  if (layers.length === 0) return { "--i": index } as CSSProperties;
  return {
    "--i": index,
    "--past-image": layers.map((l) => l.image).join(", "),
    "--past-position": layers.map((l) => l.position).join(", "),
    "--past-size": layers.map((l) => l.size).join(", "),
    "--past-repeat": layers.map((l) => l.repeat).join(", "),
  } as CSSProperties;
}

/**
 * The ecosystem as a structural elevation: tools stand as columns on the document beam, the document on
 * Katedrala, Katedrala on your repository, all on hatched ground. Each tool's status mark is the capital of its
 * column, and the column is drawn the way the mark is: solid, dashed, or only its ends.
 */
export function Ecosystem() {
  return (
    <Section
      id="ecosystem"
      className="eco-plate"
      title="Built to carry other tools."
      lede="Katedrala is an engine, not a visualization product: it produces one versioned document for other tools to build on."
    >
      <figure className="eco">
        <ul className="eco-tools">
          {TOOLS.map((tool, i) => (
            <li key={tool.name} className="eco-tool" data-status={tool.status} style={lanesPast(i)}>
              <p className="eco-tool-name">{tool.name}</p>
              <p className="eco-tool-text">{tool.text}</p>
              <div className="eco-capital">
                <Status status={tool.status} />
              </div>
            </li>
          ))}
        </ul>
        <div className="eco-beam" aria-hidden="true">
          {TOOLS.map((tool, i) => (
            <span
              key={tool.name}
              className="eco-joint"
              data-status={tool.status}
              style={{ "--i": i } as CSSProperties}
            />
          ))}
        </div>
        <figcaption className="eco-layers">
          <div className="eco-layer">
            <span className="text-[0.9375rem] font-semibold text-ink">Architecture document</span>
            <span className="data text-ink-faint">versioned, specified as JSON Schema</span>
          </div>
          <div className="eco-layer eco-foundation">
            <span className="text-[0.9375rem] font-semibold text-ink">Katedrala</span>
            <span className="data text-ink-faint">parse, link, infer, analyze, explain</span>
          </div>
          <div className="eco-layer">
            <span className="text-[0.9375rem] font-semibold text-ink-soft">Your repository</span>
            <span className="data text-ink-faint">TypeScript and JavaScript first</span>
          </div>
          <div aria-hidden="true" className="eco-ground ground-hatch" />
        </figcaption>
      </figure>

      <div className="grid-12 mt-24 gap-y-12">
        <div className="col-span-12 lg:col-span-6">
          <h3 className="subheading">Katedrala will power CodeVerse.</h3>
          <p className="mt-5 max-w-[60ch] text-[1.0625rem] leading-relaxed text-ink-soft">
            CodeVerse turns a GitHub repository into a 3D city you can fly through: directories
            become districts, files become buildings, imports become arcs. With Katedrala
            underneath, the city will show the architecture as well: inferred modules, the
            components that carry the most load, cycles and broken rules.
          </p>
          <p className="mt-4 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-faint">
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
              className="py-2.5 text-[0.9375rem] text-ink-soft underline hover:text-ink"
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
