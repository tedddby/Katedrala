import type { Metadata } from "next";
import graph from "@/public/data/codeverse-graph.json";
import { LINKS } from "@/lib/site";
import { buildModel, factsOf, type GraphData } from "@/components/lab/physical/model";
import { PhysicalStage } from "@/components/lab/physical/PhysicalStage";
import "@/components/lab/physical/physical.css";

export const metadata: Metadata = {
  title: "Hung from its foundations (lab: physical)",
  description:
    "A lab for the Katedrala hero: Katedrala's analysis of CodeVerse hung as a Gaudí chain model, then turned over.",
  robots: { index: false, follow: false },
};

/** Thousands with a comma, as everywhere on the page. */
const n = (value: number) => value.toLocaleString("en-US");

export default function PhysicalLab() {
  // Every number on this page is computed here, at build time, from the same file the stage simulates.
  const data = graph as unknown as GraphData;
  const model = buildModel(data);
  const facts = factsOf(model);
  const perLevel = Array.from(
    { length: facts.levels },
    (_, level) => model.nodes.filter((x) => x.level === level).length,
  );
  const heaviest = facts.heaviest[0]!;
  const crown = model.nodes.reduce((best, x) => (x.level > best.level ? x : best));

  return (
    <div className="phx">
      <header className="phx-nav">
        <a href="/" className="phx-wordmark" aria-label="Katedrala, home">
          KATEDRALA
        </a>
        <nav aria-label="Lab">
          <a href={LINKS.repository} className="phx-nav-link" rel="noopener">
            GitHub
          </a>
          <a href={LINKS.readme} className="phx-btn phx-btn--primary phx-btn--sm" rel="noopener">
            Get started
          </a>
        </nav>
      </header>

      <main id="main">
        <section id="phx-run" className="phx-run" aria-labelledby="phx-title">
          {/* The words come first, for the keyboard and for screen readers; the stage sticks behind them. */}
          <div className="phx-steps">
            <div className="phx-step phx-step--hero">
              <div className="phx-copy">
                <h1 id="phx-title" className="phx-display">
                  See what your code stands&nbsp;on.
                </h1>
                <p className="phx-lede">
                  Katedrala reads TypeScript and JavaScript and reconstructs the architecture inside
                  it, with evidence for every dependency.
                </p>
                <div className="phx-actions">
                  <a href={LINKS.readme} className="phx-btn phx-btn--primary" rel="noopener">
                    Get started
                  </a>
                  <a href={LINKS.repository} className="phx-btn phx-btn--secondary" rel="noopener">
                    View on GitHub
                    <ExternalMark />
                  </a>
                </div>
              </div>
            </div>

            <div className="phx-step">
              <div className="phx-copy">
                <h2 className="phx-heading">Hung from its foundations.</h2>
                <p className="phx-body">
                  Gaudí designed vaults upside down: chains hung from a plan of the building,
                  weighted, shaped by gravity. This is CodeVerse, hung the same way from
                  Katedrala&apos;s analysis
                  <span className="phx-still"> and drawn here already turned over</span>.
                </p>
                <dl className="phx-facts">
                  <div>
                    <dt>{n(facts.sourceFiles)} files</dt>
                    <dd>weights, heavy as their lines of code</dd>
                  </div>
                  <div>
                    <dt>{n(facts.chains)} dependencies</dt>
                    <dd>chains, each file hung from the files it needs at runtime</dd>
                  </div>
                  <div>
                    <dt>{facts.foundations} foundations</dt>
                    <dd>pinned to the plan, in {facts.anchorGroups} directory bays</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="phx-step">
              <div className="phx-copy">
                <h2 className="phx-heading">
                  <span className="phx-moving">Pull on any file.</span>
                  <span className="phx-still">Test any file.</span>
                </h2>
                <p className="phx-body">
                  Each chain is cut to the levels it spans, so a file hangs as deep as its longest
                  path to a foundation.{" "}
                  <span className="phx-moving phx-fine-pointer">
                    Drag a weight and everything hanging from it answers. Hover one to light what it
                    rests on and what it carries.
                  </span>
                  <span className="phx-moving phx-coarse-pointer">
                    Tap a weight to light what it rests on and what it carries; swipe it sideways to
                    pull it.
                  </span>
                  <span className="phx-still">
                    <span className="phx-fine-pointer">
                      Point at a file, or tab to the drawing and use the arrow keys, to light what
                      it rests on and what it carries.
                    </span>
                    <span className="phx-coarse-pointer">
                      Tap a file to light what it rests on and what it carries.
                    </span>
                  </span>
                </p>
              </div>
            </div>

            <div className="phx-step">
              <div className="phx-copy">
                <h2 className="phx-heading">Turn it over.</h2>
                <p className="phx-body">
                  Gaudí photographed the model and turned the picture upside down. Every chain in
                  tension becomes a member in compression: the same forces, reversed.
                </p>
              </div>
            </div>

            <div className="phx-step">
              <div className="phx-copy">
                <h2 className="phx-heading">The architecture stands.</h2>
                <p className="phx-body">
                  {facts.foundations} foundations on the ground, {facts.levels} levels,{" "}
                  {facts.entries} entry points that nothing rests on. <code>{heaviest.path}</code>{" "}
                  carries the most: {heaviest.reach} files rest on it.
                </p>
              </div>
            </div>

            <div className="phx-step phx-step--end">
              <div className="phx-copy">
                <h2 className="phx-heading">Read from source, not drawn by&nbsp;hand.</h2>
                <p className="phx-body">
                  Every member is a dependency Katedrala found in CodeVerse&apos;s code, with the
                  file and line it came from. Point it at your own repository.
                </p>
                <div className="phx-actions">
                  <a href={LINKS.readme} className="phx-btn phx-btn--primary" rel="noopener">
                    Get started
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="phx-sticky">
            <PhysicalStage
              runId="phx-run"
              describedBy="phx-alt"
              label={`Katedrala's analysis of CodeVerse as a hanging chain model: ${n(facts.sourceFiles)} source files, ${n(facts.chains)} runtime dependencies, ${facts.foundations} foundations`}
              titleLines={[
                `Katedrala's analysis of CodeVerse at ${facts.commit}`,
                `${n(facts.sourceFiles)} source files, ${n(facts.chains)} runtime dependencies, ${facts.levels} levels`,
                "Line weight: simulated force",
              ]}
            />
          </div>
        </section>

        <section className="phx-after" aria-labelledby="phx-alt-title">
          <div className="phx-after-inner">
            <h2 id="phx-alt-title" className="phx-subheading">
              What the model shows
            </h2>
            <p id="phx-alt" className="phx-body phx-measure">
              Katedrala&apos;s analysis of {facts.repository} at commit {facts.commit} found{" "}
              {n(facts.sourceFiles + facts.testFiles)} TypeScript and JavaScript files:{" "}
              {n(facts.sourceFiles)} source files with {n(facts.lines)} lines, and {facts.testFiles}{" "}
              test files. Between the source files run {n(facts.chains)} runtime dependencies.{" "}
              {facts.foundations} files depend on no other source file: they are the foundations.
              Above them the structure rises through {facts.levels} levels, 0 to {facts.levels - 1},
              to {facts.entries} entry points that nothing else depends on; {facts.isolated} file
              stands alone. The highest is <code>{crown.path}</code>, at level {crown.level}. The
              foundations that carry the most:{" "}
              {facts.heaviest.map((h, i) => (
                <span key={h.path}>
                  <code>{h.path}</code> ({h.reach} files rest on it)
                  {i < facts.heaviest.length - 2
                    ? ", "
                    : i === facts.heaviest.length - 2
                      ? " and "
                      : "."}
                </span>
              ))}
            </p>

            {/* Focusable: on a phone the table scrolls sideways, and the keyboard must reach it too. */}
            <div
              className="phx-levels-wrap"
              role="region"
              aria-label="Source files per level"
              tabIndex={0}
            >
              <table className="phx-levels">
                <caption>Source files per level</caption>
                <tbody>
                  <tr>
                    <th scope="row">Level</th>
                    {perLevel.map((_, level) => (
                      <td key={level}>{level}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Files</th>
                    {perLevel.map((count, level) => (
                      <td key={level}>{count}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="phx-notes">
              <p>
                <strong>Katedrala&apos;s analysis.</strong> Files, runtime dependencies, levels (the
                longest path down to a foundation) and reach (the files resting on a file) come from
                Katedrala&apos;s structure document of CodeVerse, lifted to files. Test files and
                type-only imports are left out of the model.
              </p>
              <p>
                <strong>The physical model is the page&apos;s.</strong> Mass follows lines of code
                (never less than 20 lines&apos; worth, so the solver stays stable), each chain is
                cut to the levels it spans, and a position-based simulation in your browser finds
                the form. Line weight is the simulated force in each chain: a picture of load, not
                one of Katedrala&apos;s metrics.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ExternalMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="phx-external">
      <path d="M3.5 2.5h6v6M9.5 2.5 2.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
