import { CodeBlock } from "@/components/ui/CodeBlock";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { COMMANDS } from "@/lib/demo/commands";
import { CODEVERSE_ANALYSIS } from "@/lib/site";
import { CommandShowcase } from "./CommandShowcase";

const LIBRARY = `import { analyzeStructure } from "@katedrala/engine";

const { document } = await analyzeStructure({ root: "." });
const { files, symbols, edges } = document.repository.stats;
// CodeVerse at ${CODEVERSE_ANALYSIS.commit}: ${CODEVERSE_ANALYSIS.files} files, ${CODEVERSE_ANALYSIS.symbols} symbols, ${CODEVERSE_ANALYSIS.relationships} edges`;

const GUARANTEES = [
  {
    title: "Deterministic",
    text: "The same repository produces the same document, byte for byte. Two analyses of CodeVerse came out identical.",
    status: "available",
  },
  {
    title: "Versioned schemas",
    text: "Every document Katedrala writes validates against a published JSON Schema, so tools can rely on its shape.",
    status: "available",
  },
  {
    title: "Local",
    text: "Analysis runs on your machine. No network calls, no language model, nothing uploaded.",
    status: "available",
  },
  {
    title: "Made for CI",
    text: "Human-readable reports by default, JSON or YAML for tools, and an exit code that can fail a pull request.",
    status: "planned",
  },
] as const;

/** Built for developers: the command line (planned for v1) and the library (available today). */
export function Developers() {
  return (
    <Section
      id="developers"
      title="One command per question."
      lede="Analyze a repository, measure its health, trace the impact of a change, enforce your rules and compare revisions, from the terminal or in CI."
      aside={<Status status="planned" />}
    >
      <CommandShowcase
        commands={COMMANDS}
        note={
          <p className="mt-4 text-[0.8125rem] text-ink-faint">
            The command line ships with v1, and the output shows its planned format. The analyze
            counts are real; the other values are computed from the demonstration system.
          </p>
        }
      />

      <div className="grid-12 mt-20 gap-y-10">
        <div className="col-span-12 lg:col-span-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="subheading">Or call the engine from code.</h3>
            <Status status="available" />
          </div>
          <CodeBlock label="analyze.ts" language="typescript" code={LIBRARY} />
          <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-faint">
            The engine runs today as a TypeScript library, from a clone of the repository. npm
            packages ship with v1.
          </p>
        </div>
        <dl className="guarantees col-span-12 lg:col-span-5 lg:col-start-8">
          {GUARANTEES.map((item) => (
            <div key={item.title} className="guarantee">
              <dt className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-[0.9375rem] font-semibold text-ink">{item.title}</span>
                <Status status={item.status} />
              </dt>
              <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-soft">{item.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
