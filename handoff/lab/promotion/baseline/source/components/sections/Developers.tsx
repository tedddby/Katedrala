import type { ReactNode } from "react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { COMMANDS } from "@/lib/demo/commands";
import { CODEVERSE_ANALYSIS, LINKS, type Status as StatusValue } from "@/lib/site";
import { CommandShowcase } from "./CommandShowcase";

const count = (value: number) => value.toLocaleString("en-US");

/**
 * The script of the README's "Get started" section, saved in a clone of Katedrala and pointed at a clone of
 * CodeVerse beside it, with part of what it printed.
 */
const LIBRARY = `import { analyzeStructure } from "@katedrala/engine";

const { document } = await analyzeStructure({ root: "../CodeVerse" });
console.log(document.repository.stats);
// CodeVerse at ${CODEVERSE_ANALYSIS.commit}: ${count(CODEVERSE_ANALYSIS.files)} files, ${count(CODEVERSE_ANALYSIS.symbols)} symbols, ${count(CODEVERSE_ANALYSIS.relationships)} edges`;

const GUARANTEES: readonly { title: string; text: ReactNode; status: StatusValue }[] = [
  {
    title: "Deterministic",
    text: "The same files, configuration and Katedrala version produce the same document, byte for byte. Two analyses of CodeVerse came out identical.",
    status: "available",
  },
  {
    title: "Versioned schemas",
    text: (
      <>
        The document format is specified as JSON Schema, generated from its TypeScript types and
        versioned in the repository. Today, <code className="data">analyzeStructure</code> returns
        the document's structural sections.
      </>
    ),
    status: "available",
  },
  {
    title: "Local",
    text: "Analysis runs on your machine. No network calls, no language model, nothing uploaded.",
    status: "available",
  },
  {
    title: "Made for CI",
    text: "Reports will be human-readable by default, with JSON or YAML for tools and an exit code that can fail a pull request.",
    status: "planned",
  },
];

/** Built for developers: the command line (planned for v1) and the library (available today). */
export function Developers() {
  return (
    <Section
      id="developers"
      title="One command per question."
      lede="From v1, each question below will be one command away, in your terminal or in CI."
      aside={<Status status="planned" />}
    >
      <CommandShowcase
        commands={COMMANDS}
        note={
          <p className="footnote mt-4">
            The command line is planned for v1, and this output previews its format. The analyze
            counts are real. The other values are computed from the demonstration system, with one
            hypothetical import added for validate, from OrderController to OrderRepository.
          </p>
        }
      />

      <div className="grid-12 mt-20 gap-y-10">
        <div className="col-span-12 lg:col-span-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="subheading">Or call the engine from code.</h3>
            <Status status="available" />
          </div>
          <CodeBlock label="analyze.mjs" language="typescript" code={LIBRARY} />
          <p className="footnote mt-4 text-balance">
            The engine runs today as a TypeScript library,{" "}
            <a
              href={LINKS.readme}
              rel="noopener"
              className="whitespace-nowrap underline hover:text-ink"
            >
              from a clone of the repository
            </a>
            . npm packages are planned for v1.
          </p>
        </div>
        <dl className="guarantees col-span-12 lg:col-span-5 lg:col-start-8">
          {GUARANTEES.map((item) => (
            <div key={item.title} className="guarantee">
              <dt className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="text-[0.9375rem] font-semibold text-ink">{item.title}</span>
                <Status status={item.status} />
              </dt>
              <dd className="mt-1.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-soft">
                {item.text}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
