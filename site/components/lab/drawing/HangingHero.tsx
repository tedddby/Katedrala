import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { LINKS } from "@/lib/site";
import graph from "@/public/data/codeverse-graph.json";
import {
  BOARD_MARGIN,
  BOARD_SLAB,
  LINE_WEIGHT_MAX,
  MEDIUM_SPEC,
  WIDE_SPEC,
  factsOf,
  fmt,
  lineWeight,
} from "./facts";
import type { Facts } from "./facts";
import { HangingModel } from "./HangingModel";
import type { GraphDocument } from "./model";
import css from "./hanging.module.css";

const facts = factsOf(graph as unknown as GraphDocument);

/**
 * The hero as a hanging-chain model: Katedrala's real analysis of CodeVerse, hung from its foundations the way
 * Gaudí hung the Colònia Güell church from its plan, then turned over by the scroll.
 */
export function HangingHero() {
  const f = facts;
  const heaviest = f.heaviest[0]!;
  const weights = f.sourceFiles - f.foundations - f.isolated;
  const hangData = (
    <p className={css.captionData}>
      {fmt(weights)} files as weights, by lines of code. {fmt(f.chains)} runtime dependencies as
      chains.
    </p>
  );
  return (
    <HangingModel
      board={<Board facts={f} />}
      copy={
        <>
          <h1 id="hm-title" className={css.title}>
            Find the form inside your&nbsp;code.
          </h1>
          <p className={css.lede}>
            Katedrala reads TypeScript and JavaScript and reconstructs the architecture inside it,
            with the evidence behind every&nbsp;dependency.
          </p>
          <div className={css.actions}>
            <Button href={LINKS.readme}>
              Get started<span className="sr-only"> on GitHub</span>
            </Button>
            <Button href={LINKS.repository} variant="secondary">
              View on GitHub
            </Button>
          </div>
        </>
      }
      captions={
        <>
          <Caption at="hang" mode="motion" title="Hung from its foundations.">
            <p>
              Gaudí found his vaults by hanging weighted chains from a plan. Here CodeVerse hangs
              from its {f.foundations} foundations, the source files that depend on no&nbsp;other.
            </p>
            {hangData}
          </Caption>
          <Caption at="turn" mode="motion" title="Turn it over.">
            <p>
              Gaudí photographed the hanging model and turned the picture upside down. Every chain
              in tension becomes an arch in&nbsp;compression.
            </p>
          </Caption>
          <Caption at="plan" mode="motion" title="The plan.">
            <p>
              Seen from above, the board is the floor plan of CodeVerse: one bay per top-level
              directory, as wide as its&nbsp;code.
            </p>
            <p className={css.captionData}>
              {f.groups} directories, {fmt(f.totalLines)} lines of source.
            </p>
          </Caption>
          <Caption at="intro" mode="still" title="Found by hanging it.">
            <p>
              Gaudí found his vaults by hanging weighted chains from a plan, then turning the model
              over. CodeVerse is drawn the same way: hung from its {f.foundations} foundations, the
              source files that depend on no other, then turned&nbsp;over.
            </p>
            {hangData}
          </Caption>
          <Caption at="stand" mode="both" title="The architecture stands.">
            <p>
              {f.levels} levels, from {f.foundations} foundations at level 0 up to {f.crown.path} at
              level {f.crown.level}. It rests on {f.crown.restsOn} of the files beneath&nbsp;it.
            </p>
          </Caption>
          <Caption at="test" mode="both" title="Test any member.">
            <p>
              {heaviest.reach} source files rest on {heaviest.path}, directly or through others.
              Hover or tap a file to light its load&nbsp;path.
            </p>
          </Caption>
        </>
      }
      titleBlock={<TitleBlock facts={f} />}
      description={<Description facts={f} />}
    />
  );
}

function Caption({
  at,
  mode,
  title,
  children,
}: {
  at: "hang" | "turn" | "plan" | "intro" | "stand" | "test";
  /** Shown in the scrolled sequence ("motion"), in the still layout ("still"), or in both. */
  mode: "motion" | "still" | "both";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={css.caption} data-at={at} data-mode={mode}>
      <h2 className={css.captionTitle}>{title}</h2>
      <div className={css.captionBody}>{children}</div>
    </div>
  );
}

/** The drawing's title block: what it is, where it comes from, what the line weight means. */
function TitleBlock({ facts: f }: { facts: Facts }) {
  const samples = [10, 100, 1000].map((load) => ({
    load,
    wide: lineWeight(load, f.maxChainLoad, LINE_WEIGHT_MAX.wide),
    narrow: lineWeight(load, f.maxChainLoad, LINE_WEIGHT_MAX.narrow),
  }));
  // The owner is dropped on a phone's narrow strip, so the commit always shows in full.
  const slash = f.repository.lastIndexOf("/");
  const owner = slash > 0 ? f.repository.slice(0, slash + 1) : "";
  const name = f.repository.slice(slash + 1);
  return (
    <aside className={css.titleBlock} aria-label="Title block" data-hm="title-block">
      <div className={css.tbHead}>
        <p className={css.tbTitle}>Katedrala&rsquo;s real analysis of CodeVerse</p>
        <p className={css.tbSource}>
          {owner === "" ? null : <span className={css.tbOwner}>{owner}</span>}
          {name} at {f.commit}
        </p>
      </div>
      <dl className={css.tbRows}>
        <div>
          <dt>View</dt>
          <dd className={css.tbView}>
            <span data-hm="view" className={css.tbViewName}>
              Elevation, hanging
            </span>
            <span data-hm="angle" className={css.tbAngle} />
          </dd>
        </div>
        <div className={css.tbStatusRow}>
          <dt>Members</dt>
          <dd data-hm="status">
            {fmt(f.sourceFiles)} files, {fmt(f.chains)} chains
          </dd>
        </div>
        <div className={css.tbWeightRow}>
          <dt>Line weight</dt>
          <dd>
            <span className={css.tbLegend}>
              {samples.map((sample) => (
                <span key={sample.load} className={css.tbSample}>
                  <svg viewBox="0 0 22 8" aria-hidden="true" className={css.tbStroke}>
                    <line
                      x1="1"
                      y1="4"
                      x2="21"
                      y2="4"
                      className={css.tbStrokeWide}
                      style={{ strokeWidth: sample.wide } as CSSProperties}
                    />
                    <line
                      x1="1"
                      y1="4"
                      x2="21"
                      y2="4"
                      className={css.tbStrokeNarrow}
                      style={{ strokeWidth: sample.narrow } as CSSProperties}
                    />
                  </svg>
                  {fmt(sample.load)}
                </span>
              ))}
            </span>
            <span className={css.tbUnit}>lines of code carried</span>
          </dd>
        </div>
      </dl>
    </aside>
  );
}

/** The text alternative: what the structure shows, in words and numbers. */
function Description({ facts: f }: { facts: Facts }) {
  const perLevel = f.perLevel.map((count, level) => `level ${level}, ${count}`).join("; ");
  return (
    <div id="hm-description" className="sr-only">
      <p>
        Katedrala&rsquo;s structure analysis of {f.repository} at commit {f.commit} ({f.generator}),
        drawn as a hanging chain model and then turned over. Real output, not a demonstration.
      </p>
      <p>
        {fmt(f.files)} files: {fmt(f.sourceFiles)} source files and {fmt(f.testFiles)} test files.{" "}
        {fmt(f.dependencies)} file-to-file dependencies, of which {fmt(f.chains)} are runtime
        dependencies between source files; those are the chains. Each source file is a weight in
        proportion to its lines of code, and the line weight of a chain shows the lines of code it
        carries.
      </p>
      <p>
        {f.foundations} foundations, source files that depend on no other source file, are pinned to
        the board, which becomes the ground once the model is turned over. The structure has{" "}
        {f.levels} levels, 0 to {f.maxLevel}: a file&rsquo;s level is its longest chain of runtime
        dependencies down to a foundation. Source files per level: {perLevel}. Level 0 includes{" "}
        {f.isolated} isolated file.
      </p>
      <p>
        {f.entries} entry points: source files no other source file depends on. The highest file is{" "}
        {f.crown.path} at level {f.crown.level}; it rests on {f.crown.restsOn} source files,
        directly or through others.
      </p>
      <p>
        The heaviest foundations, by the number of source files resting on them directly or through
        others: {f.heaviest.map((h) => `${h.path}, ${h.reach}`).join("; ")}.
      </p>
      <p id="hm-keys">
        To test a member, focus the drawing: the arrow keys move between files, Home selects the
        heaviest foundation, End the highest file, Escape clears. The selected file, what it rests
        on and what rests on it are announced.
      </p>
    </div>
  );
}

/**
 * The board line and its anchors, drawn on the server where the hanging model will hang, so the structure is
 * on screen from the first paint. Pixel sizes hold at any scale (non-scaling strokes, zero-length round caps).
 */
function Board({ facts: f }: { facts: Facts }) {
  const plans = [
    { key: "wide", spec: WIDE_SPEC, anchors: f.anchors.wide, className: css.boardWide },
    { key: "medium", spec: MEDIUM_SPEC, anchors: f.anchors.medium, className: css.boardMedium },
  ] as const;
  const levels = f.maxLevel + 0.5;
  return (
    <>
      {plans.map(({ key, spec, anchors, className }) => {
        const x0 = -BOARD_MARGIN;
        const x1 = spec.width + BOARD_MARGIN;
        return (
          <svg
            key={key}
            className={className}
            viewBox={`${x0} 0 ${x1 - x0} ${levels}`}
            preserveAspectRatio="xMidYMin meet"
          >
            <g className={css.boardLines}>
              <line x1={x0} y1={0} x2={x1} y2={0} className={css.boardLine} />
              <line x1={x0} y1={-BOARD_SLAB} x2={x1} y2={-BOARD_SLAB} className={css.boardSlab} />
              <line x1={x0} y1={0} x2={x0} y2={-BOARD_SLAB} className={css.boardSlab} />
              <line x1={x1} y1={0} x2={x1} y2={-BOARD_SLAB} className={css.boardSlab} />
            </g>
            {anchors.map((a, i) => (
              <g key={i}>
                <line
                  x1={a.x}
                  y1={0}
                  x2={a.x}
                  y2={0}
                  className={css.pinRing}
                  style={{ strokeWidth: a.r * 2 }}
                />
                <line
                  x1={a.x}
                  y1={0}
                  x2={a.x}
                  y2={0}
                  className={css.pinFace}
                  style={{ strokeWidth: Math.max(0.5, a.r * 2 - 2.5) }}
                />
              </g>
            ))}
          </svg>
        );
      })}
    </>
  );
}
