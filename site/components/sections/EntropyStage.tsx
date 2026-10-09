"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChainPath, fromKeyboard, type ChainMotion } from "@/components/drawing/chain-motion";
import { DEGRADATION, entropyOf } from "@/lib/demo/entropy";
import { MODULE_FRAME, MODULE_MEMBERS, type LabelSide, type PlacedMember } from "@/lib/demo/layout";
import { formatDelta, formatParts, formatScore } from "@/lib/demo/metrics";
import { EDGES, NODES, moduleName, type ModuleId } from "@/lib/demo/system";
import { listed } from "@/lib/text";
import { TermLedger, TermRow, chain } from "@/components/ui/TermLedger";

const BASE = EDGES.map((e) => [e.source, e.target] as const);
const moduleOf = new Map(NODES.map((n) => [n.id, n.module]));
const position = new Map(MODULE_MEMBERS.map((m) => [m.id, m]));
const baseModuleEdges = new Set(BASE.map(([s, t]) => `${moduleOf.get(s)}>${moduleOf.get(t)}`));

/** Joint radius and the support a foundation stands on, as in the load drawings. */
const JOINT = 9;
const SUPPORT = 14;
/** The ground line, under the foundation's support. */
const GROUND = MODULE_FRAME.ground + SUPPORT;

/** Edges start and end this far from a joint's center, so the arrowhead stops clear of the circle. */
const GAP = 13;
/** Module names at their largest drawn size (the narrowest phones, entropy.css), in drawing units. */
const NAME_SIZE = 20;
/**
 * Room an arc keeps from the joints it passes (beyond where arrowheads stop), from every name, and from the
 * other dependencies at its own joints; with less, it bends further or to the other side.
 */
const CLEAR = 10;
/** Bends tried, gentlest first: the control point's distance from the chord, as a share of its length. */
const BENDS = Array.from({ length: 19 }, (_, i) => 0.3 + 0.05 * i);

/** Each module name as a box around its glyphs at NAME_SIZE, where labelPlacement sets it. */
const NAME_BOXES = MODULE_MEMBERS.map((m) => {
  const width = m.label.length * NAME_SIZE * 0.52;
  const gap = JOINT + 7;
  const [x1, y1, x2, y2] =
    m.side === "right"
      ? [gap, -0.45 * NAME_SIZE, gap + width, 0.5 * NAME_SIZE]
      : m.side === "left"
        ? [-gap - width, -0.45 * NAME_SIZE, -gap, 0.5 * NAME_SIZE]
        : m.side === "above"
          ? [-width / 2, -gap - 0.75 * NAME_SIZE, width / 2, -gap + 0.2 * NAME_SIZE]
          : [-width / 2, JOINT + SUPPORT + 5, width / 2, JOINT + SUPPORT + 5 + 0.95 * NAME_SIZE];
  return { x1: m.x + x1, y1: m.y + y1, x2: m.x + x2, y2: m.y + y2 };
});

const STEPS = [
  { label: "base", message: "Clean structure" },
  ...DEGRADATION.map((commit, i) => ({ label: `+${i + 1}`, message: commit.message })),
];

/**
 * Every module dependency the drawing can show, drawn the same way at every step: the base dependencies first,
 * straight down their load path, then each commit's addition in order, as an arc routed around the joints,
 * the names and the dependencies already drawn at its ends. A dependency that climbs is an arc too.
 */
const PATHS = (() => {
  const curves = new Map<string, Curve>();
  for (const [s, t] of [...BASE, ...DEGRADATION.map((d) => d.edge)]) {
    const a = moduleOf.get(s)!;
    const b = moduleOf.get(t)!;
    const key = `${a}>${b}`;
    if (a === b || curves.has(key)) continue;
    const from = position.get(a)!;
    const to = position.get(b)!;
    const curved = !baseModuleEdges.has(key) || to.y < from.y;
    curves.set(key, curved ? route(from, to, [...curves.values()]) : chord(from, to));
  }
  return new Map([...curves].map(([key, curve]) => [key, pathOf(clip(curve))]));
})();

/**
 * Every module dependency the drawing can show, keyed `source>target`, with the step that first draws it: 0 for
 * the system as it was, otherwise the commit that adds it.
 */
const ARCS = (() => {
  const arcs = new Map<string, { source: ModuleId; target: ModuleId; from: number }>();
  const steps = [BASE, ...DEGRADATION.map((d) => [d.edge] as const)];
  steps.forEach((edges, from) => {
    for (const [s, t] of edges) {
      const a = moduleOf.get(s)!;
      const b = moduleOf.get(t)!;
      const key = `${a}>${b}`;
      if (a !== b && !arcs.has(key)) arcs.set(key, { source: a, target: b, from });
    }
  });
  return [...arcs].map(([key, arc]) => ({ key, ...arc, path: PATHS.get(key)! }));
})();

type ArcKind = "base" | "added" | "cycle";

const STATES = STEPS.map((_, step) => {
  const edges = [...BASE, ...DEGRADATION.slice(0, step).map((d) => d.edge)];
  const result = entropyOf(edges);
  const inCycle = new Set<string>(result.moduleCycles.flat());
  const cycleNames = [...inCycle].map((id) => moduleName(id as ModuleId)).sort();
  const drawn = ARCS.filter((arc) => arc.from <= step);
  const kinds = new Map<string, ArcKind>(
    drawn.map((arc) => [
      arc.key,
      inCycle.has(arc.source) && inCycle.has(arc.target)
        ? "cycle"
        : arc.from > 0
          ? "added"
          : "base",
    ]),
  );
  const added = drawn
    .filter((arc) => arc.from > 0)
    .map((arc) => `${moduleName(arc.source)} to ${moduleName(arc.target)}`);
  const shown = formatParts(
    result.factors.map((factor) => factor.contribution),
    result.score,
  );
  const laid = chain(result.factors.map((factor) => factor.contribution));
  // The text alternative: what the drawing shows at this step, naming the added dependencies and the cycle.
  const description = `Modules of the demonstration system on their load levels, Platform the foundation, after ${step} of ${DEGRADATION.length} commits: ${
    added.length === 0 ? "no dependency added" : `added ${listed(added)}`
  }; ${cycleNames.length === 0 ? "no module cycles" : `${listed(cycleNames)} are tangled in a cycle`}.`;
  return { result, kinds, inCycle, cycleNames, shown, laid, description };
});

/**
 * What each step does to the score, from the scores as the page shows them, so the column closes: the base
 * score, then each commit's change, adds up to the score after the last commit.
 */
const MOVES = STATES.map((state, step) =>
  step === 0
    ? formatScore(state.result.score)
    : formatDelta(STATES[step - 1]!.result.score, state.result.score),
);

/** Commits applied together drop their arcs one after another, never past this spread (ms). */
const DROP_SPREAD = 120;

export function EntropyStage() {
  // The step shown, the one before it and how the change arrives: a pointer choice drops arcs in as chains, a
  // keyboard step lands at once.
  const [view, setView] = useState<{ step: number; from: number; motion: ChainMotion }>({
    step: 0,
    from: 0,
    motion: "animate",
  });
  const { step, motion } = view;
  const commits = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const state = STATES[step]!;
  const { result } = state;
  const cycle = state.cycleNames.length > 0 ? listed(state.cycleNames) : null;

  const apply = (next: number, how: ChainMotion) =>
    setView((current) => ({ step: next, from: current.step, motion: how }));

  // The commits form a radio group: one Tab stop, arrow keys apply the next or previous commit.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = STEPS.length - 1;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? step === last
          ? 0
          : step + 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? step === 0
            ? last
            : step - 1
          : undefined;
    if (next === undefined) return;
    event.preventDefault();
    apply(next, "instant");
    commits.current[next]?.focus();
  };

  // Arcs that drop in together leave a short beat between them, in commit order.
  const dropping = ARCS.filter((arc) => arc.from > view.from && arc.from <= step);
  const beat = dropping.length > 1 ? Math.min(40, DROP_SPREAD / (dropping.length - 1)) : 0;

  return (
    <div className="grid-12 gap-y-10">
      {/* Drawn 1:1 with its frame, and on wide screens centered in its columns and held in view while the
          commits beside it are applied. */}
      <figure
        className="entropy-figure col-span-12 max-w-[30rem] lg:sticky lg:top-24 lg:col-span-6 lg:mx-auto lg:self-start"
        data-motion={motion}
      >
        <svg
          viewBox={`0 0 ${MODULE_FRAME.width} ${MODULE_FRAME.height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={state.description}
        >
          <defs>
            {(["base", "added", "cycle"] as const).map((kind) => (
              <marker
                key={kind}
                id={`${id}-arrow-${kind}`}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M0.5 1 7 4 0.5 7"
                  fill="none"
                  strokeWidth="1.2"
                  className={`entropy-arrow-${kind}`}
                />
              </marker>
            ))}
            <pattern
              id={`${id}-hatch`}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="7" className="drawing-hatch" />
            </pattern>
          </defs>
          {/* The ground the foundation stands on, hatched as in every load drawing. */}
          <g aria-hidden="true">
            <line
              x1={20}
              x2={MODULE_FRAME.width - 20}
              y1={GROUND}
              y2={GROUND}
              className="drawing-ground"
            />
            <rect
              x={20}
              y={GROUND}
              width={MODULE_FRAME.width - 40}
              height={10}
              fill={`url(#${id}-hatch)`}
              opacity={0.7}
            />
          </g>
          {/* Every arc is in the drawing from the start; the commits not yet applied hold theirs out of it. An
              arc taken out leaves in the style it was drawn in. */}
          {ARCS.map((arc) => {
            const kind =
              state.kinds.get(arc.key) ??
              STATES[view.from]!.kinds.get(arc.key) ??
              STATES[arc.from]!.kinds.get(arc.key)!;
            return (
              <ChainPath
                key={arc.key}
                d={arc.path}
                present={arc.from <= step}
                motion={motion}
                delay={Math.max(0, dropping.indexOf(arc)) * beat}
                className={`entropy-edge entropy-edge-${kind}`}
                markerEnd={`url(#${id}-arrow-${kind})`}
              />
            );
          })}
          {MODULE_MEMBERS.map((m) => (
            <g key={m.id} transform={`translate(${m.x} ${m.y})`}>
              {m.level === 0 && (
                <path
                  d={`M 0 ${JOINT * 0.4} L -8 ${SUPPORT} L 8 ${SUPPORT} Z`}
                  className="drawing-support"
                />
              )}
              <circle
                r={JOINT}
                className={state.inCycle.has(m.id) ? "entropy-joint is-cyclic" : "entropy-joint"}
              />
              <text {...labelPlacement(m.side)} className="drawing-label entropy-label">
                {m.label}
              </text>
            </g>
          ))}
        </svg>
        <figcaption className="footnote mt-3">
          Modules of the demonstration system. Arcs are dependencies added by the commits; lit
          modules are tangled in a cycle.
          {/* Two lines held on phones, the most the longest cycle takes, so the commits below never move
              as a cycle forms. */}
          <span className="mt-1 block min-h-[2lh] sm:min-h-0">
            {cycle === null ? (
              "No module is in a cycle."
            ) : (
              <>
                In a cycle: <span className="text-load">{cycle}</span>.
              </>
            )}
          </span>
        </figcaption>
      </figure>

      <div className="col-span-12 max-w-[40rem] lg:col-span-6 lg:col-start-7">
        {/* The score in the film's gauge numerals, in chalk: it is the state of the whole system, not a member
            under test. */}
        <div className="entropy-score" aria-live="polite" aria-atomic="true">
          <span className="score-gauge">{formatScore(result.score)}</span>{" "}
          <span className="text-[1rem] text-ink-soft">{result.rating} entropy</span>
        </div>

        {/* The commits sit right under the score they move: on a phone the drawing, the score and the
            commit just applied stay in one view. Each row carries what it did to the score, so the column
            adds up to the score above. */}
        <div
          role="radiogroup"
          aria-label="Commits applied"
          className="commit-log mt-6"
          onKeyDown={onKeyDown}
        >
          {STEPS.map((commit, i) => (
            <button
              key={commit.label}
              ref={(element) => {
                commits.current[i] = element;
              }}
              type="button"
              role="radio"
              aria-checked={step === i}
              tabIndex={step === i ? 0 : -1}
              className="commit"
              data-applied={i <= step}
              aria-label={`${commit.label} ${commit.message}, entropy ${MOVES[i]}`}
              onClick={(event) => apply(i, fromKeyboard(event) ? "instant" : "animate")}
            >
              <span className="commit-joint" aria-hidden="true" />
              <span className="data commit-step">{commit.label}</span>
              <span>{commit.message}</span>
              <span className="data commit-move">{MOVES[i]}</span>
            </button>
          ))}
        </div>

        <TermLedger score={result.score} className="entropy-terms mt-10">
          {result.factors.map((factor, i) => (
            <TermRow
              key={factor.key}
              label={<span className="text-ink">{factor.label}</span>}
              normalized={factor.normalized}
              weight={factor.weight}
              value={state.shown[i]!}
              from={state.laid[i]!.from}
              to={state.laid[i]!.to}
            >
              <p className="mt-1.5 text-[0.8125rem] text-ink-faint">{factor.evidence}</p>
            </TermRow>
          ))}
        </TermLedger>
        <p className="footnote mt-6">
          Each factor adds its normalized value times its weight, rounded so the factors add up to
          the score.
        </p>
      </div>
    </div>
  );
}

/** A module's name beside its joint on the side the layout gives it, as the hero's module drawing places it. */
function labelPlacement(side: LabelSide) {
  const gap = JOINT + 7;
  switch (side) {
    case "right":
      return { x: gap, dy: "0.34em", textAnchor: "start" as const };
    case "left":
      return { x: -gap, dy: "0.34em", textAnchor: "end" as const };
    case "above":
      return { y: -gap, textAnchor: "middle" as const };
    default:
      // Below a foundation: under its support and the hatched ground.
      return { y: JOINT + SUPPORT + 5, dy: "0.75em", textAnchor: "middle" as const };
  }
}

// Geometry. Every dependency is a quadratic curve from its dependent to what it depends on: a straight one has
// its control point on the chord. All of it runs once, when the module loads (PATHS).

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Curve {
  readonly from: Point;
  readonly control: Point;
  readonly to: Point;
}

function chord(a: Point, b: Point): Curve {
  return { from: a, control: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, to: b };
}

function at(c: Curve, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * c.from.x + 2 * u * t * c.control.x + t * t * c.to.x,
    y: u * u * c.from.y + 2 * u * t * c.control.y + t * t * c.to.y,
  };
}

/** The smallest t in [low, high] from which `test` holds (bisection; `test` holds at high and stays true). */
function first(test: (t: number) => boolean, low: number, high: number): number {
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (test(mid)) high = mid;
    else low = mid;
  }
  return high;
}

/**
 * The stretch of a curve outside both joints, as a curve of its own: it starts and ends GAP from the centers,
 * measured along the curve, so an arrowhead meets its joint along the line it arrives on.
 */
function clip(c: Curve): Curve {
  const away = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  const t0 = first((t) => away(at(c, t), c.from) >= GAP, 0, 0.5);
  const t1 = first((t) => away(at(c, t), c.to) < GAP, 0.5, 1);
  // De Casteljau: the sub-curve's points are the curve's blossom at (t0, t0), (t0, t1) and (t1, t1).
  const blossom = (u: number, v: number): Point => ({
    x: (1 - u) * (1 - v) * c.from.x + ((1 - u) * v + u * (1 - v)) * c.control.x + u * v * c.to.x,
    y: (1 - u) * (1 - v) * c.from.y + ((1 - u) * v + u * (1 - v)) * c.control.y + u * v * c.to.y,
  });
  return { from: blossom(t0, t0), control: blossom(t0, t1), to: blossom(t1, t1) };
}

/** The direction a curve leaves one of its ends in (toward its control point), as an angle in radians. */
function heading(c: Curve, end: Point): number {
  return Math.atan2(c.control.y - end.y, c.control.x - end.x);
}

/**
 * The least room a curve leaves, in drawing units: to the joints it passes (beyond where their arrowheads stop),
 * to every module name (its own ends' included, so it never leaves or reaches a joint through its name), to the
 * edges of the sheet, and at each end to the dependencies already drawn there (their gap a little way out,
 * so two lines never leave a joint as one).
 */
function room(c: Curve, placed: readonly Curve[]): number {
  const visible = clip(c);
  let least = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 40; i++) {
    const p = at(visible, i / 40);
    for (const m of MODULE_MEMBERS) {
      if (m !== c.from && m !== c.to)
        least = Math.min(least, Math.hypot(p.x - m.x, p.y - m.y) - GAP);
    }
    for (const box of NAME_BOXES) {
      const dx = Math.max(box.x1 - p.x, 0, p.x - box.x2);
      const dy = Math.max(box.y1 - p.y, 0, p.y - box.y2);
      least = Math.min(least, dx === 0 && dy === 0 ? 0 : Math.hypot(dx, dy));
    }
    least = Math.min(least, p.x, MODULE_FRAME.width - p.x, p.y, GROUND - p.y);
  }
  for (const end of [c.from, c.to]) {
    for (const other of placed) {
      if (other.from !== end && other.to !== end) continue;
      const turn = Math.abs(heading(c, end) - heading(other, end)) % (2 * Math.PI);
      const apart = Math.min(turn, 2 * Math.PI - turn);
      least = Math.min(least, 24 * Math.sin(Math.min(apart, Math.PI / 2)));
    }
  }
  return least;
}

/**
 * An arc for a dependency off the load path: the gentlest bend, to either side of the chord, that keeps CLEAR
 * of everything room() measures; where none does, the one with the most room. A plain bend can run through a
 * module that happens to sit near the chord and read as a dependency the system does not have.
 */
function route(a: PlacedMember, b: PlacedMember, placed: readonly Curve[]): Curve {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  let best: { curve: Curve; room: number } | undefined;
  for (const bend of BENDS) {
    for (const side of [1, -1]) {
      const offset = side * bend * length;
      const curve: Curve = {
        from: a,
        control: {
          x: (a.x + b.x) / 2 - (dy / length) * offset,
          y: (a.y + b.y) / 2 + (dx / length) * offset,
        },
        to: b,
      };
      const clearance = Math.min(CLEAR, room(curve, placed));
      if (best === undefined || clearance > best.room) best = { curve, room: clearance };
    }
    if (best!.room >= CLEAR) break;
  }
  return best!.curve;
}

function pathOf(c: Curve): string {
  const f = (n: number) => n.toFixed(1);
  const straight =
    Math.abs(
      (c.control.x - c.from.x) * (c.to.y - c.from.y) -
        (c.control.y - c.from.y) * (c.to.x - c.from.x),
    ) < 1e-6;
  return straight
    ? `M ${f(c.from.x)} ${f(c.from.y)} L ${f(c.to.x)} ${f(c.to.y)}`
    : `M ${f(c.from.x)} ${f(c.from.y)} Q ${f(c.control.x)} ${f(c.control.y)} ${f(c.to.x)} ${f(c.to.y)}`;
}
