"use client";

import { useMemo, useState } from "react";
import { DEGRADATION, entropyOf } from "@/lib/demo/entropy";
import { MODULE_FRAME, MODULE_MEMBERS } from "@/lib/demo/layout";
import { formatScore } from "@/lib/demo/metrics";
import { EDGES, NODES, type ModuleId } from "@/lib/demo/system";
import { TermBar } from "@/components/ui/TermBar";

const BASE = EDGES.map((e) => [e.source, e.target] as const);
const moduleOf = new Map(NODES.map((n) => [n.id, n.module]));
const position = new Map(MODULE_MEMBERS.map((m) => [m.id, m]));
const baseModuleEdges = new Set(BASE.map(([s, t]) => `${moduleOf.get(s)}>${moduleOf.get(t)}`));

const STATES = Array.from({ length: DEGRADATION.length + 1 }, (_, step) => {
  const edges = [...BASE, ...DEGRADATION.slice(0, step).map((d) => d.edge)];
  const result = entropyOf(edges);
  const moduleEdges = new Map<string, { source: ModuleId; target: ModuleId; added: boolean }>();
  for (const [s, t] of edges) {
    const a = moduleOf.get(s)!;
    const b = moduleOf.get(t)!;
    if (a === b) continue;
    const key = `${a}>${b}`;
    if (!moduleEdges.has(key))
      moduleEdges.set(key, { source: a, target: b, added: !baseModuleEdges.has(key) });
  }
  const inCycle = new Set<string>(result.moduleCycles.flat());
  return { result, moduleEdges: [...moduleEdges.values()], inCycle };
});

export function EntropyStage() {
  const [step, setStep] = useState(0);
  const state = STATES[step]!;
  const { result } = state;

  return (
    <div className="grid-12 gap-y-10">
      <figure className="col-span-12 lg:col-span-7">
        <svg
          viewBox={`0 0 ${MODULE_FRAME.width} ${MODULE_FRAME.height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Module drawing after ${step} of ${DEGRADATION.length} commits: ${result.moduleCycles.length === 0 ? "no module cycles" : `${result.moduleCycles[0]!.length} modules tangled in a cycle`}.`}
        >
          <defs>
            {(["base", "added", "cycle"] as const).map((kind) => (
              <marker
                key={kind}
                id={`entropy-arrow-${kind}`}
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
          </defs>
          <line
            x1={20}
            x2={MODULE_FRAME.width - 20}
            y1={MODULE_FRAME.ground + 14}
            y2={MODULE_FRAME.ground + 14}
            className="drawing-ground"
          />
          {state.moduleEdges.map((edge) => {
            const a = position.get(edge.source)!;
            const b = position.get(edge.target)!;
            const cyclic = state.inCycle.has(edge.source) && state.inCycle.has(edge.target);
            const kind = cyclic ? "cycle" : edge.added ? "added" : "base";
            const upward = b.y < a.y;
            const path = upward || edge.added ? arc(a, b) : straight(a, b);
            return (
              <path
                key={`${edge.source}>${edge.target}`}
                d={path}
                className={`entropy-edge entropy-edge-${kind}`}
                markerEnd={`url(#entropy-arrow-${kind})`}
              />
            );
          })}
          {MODULE_MEMBERS.map((m) => (
            <g key={m.id} transform={`translate(${m.x} ${m.y})`}>
              <circle
                r={9}
                className={state.inCycle.has(m.id) ? "entropy-joint is-cyclic" : "entropy-joint"}
              />
              <text
                y={m.side === "below" ? 30 : -16}
                textAnchor="middle"
                className="drawing-label"
                style={{ fontSize: 15 }}
              >
                {m.label}
              </text>
            </g>
          ))}
        </svg>
        <figcaption className="mt-3 text-[0.8125rem] text-ink-faint">
          Modules of the demonstration system. Arcs are dependencies added by the commits; lit
          modules are tangled in a cycle.
        </figcaption>
      </figure>

      <div className="col-span-12 lg:col-span-5">
        <div className="flex items-baseline gap-4" aria-live="polite">
          <span className="data text-[2.75rem] leading-none text-ink">
            {formatScore(result.score)}
          </span>
          <span className="text-[1rem] text-ink-soft">{result.rating} entropy</span>
        </div>
        <ul className="mt-6 grid gap-4">
          {result.factors.map((factor) => (
            <li key={factor.key}>
              <div className="flex items-baseline justify-between gap-4 text-[0.875rem]">
                <span className="text-ink">{factor.label}</span>
                <span className="data text-ink-faint">
                  {formatScore(factor.normalized)} × {factor.weight.toFixed(2)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <TermBar value={factor.contribution / 0.3} />
                <span className="data ml-auto text-ink">{formatScore(factor.contribution)}</span>
              </div>
              <p className="mt-1 text-[0.8125rem] text-ink-faint">{factor.evidence}</p>
            </li>
          ))}
        </ul>

        <ol className="commit-log mt-8" aria-label="Commits">
          <li>
            <button
              type="button"
              className="commit"
              aria-pressed={step === 0}
              onClick={() => setStep(0)}
            >
              <span className="data text-ink-faint">base</span>
              <span>Clean structure</span>
            </button>
          </li>
          {DEGRADATION.map((commit, i) => (
            <li key={commit.message}>
              <button
                type="button"
                className="commit"
                aria-pressed={step === i + 1}
                data-applied={step >= i + 1}
                onClick={() => setStep(i + 1)}
              >
                <span className="data text-ink-faint">+{i + 1}</span>
                <span>{commit.message}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function straight(a: { x: number; y: number }, b: { x: number; y: number }) {
  const { x1, y1, x2, y2 } = trim(a, b, 13);
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/** A dependency drawn as an arc: it does not follow the load path down to the foundations. */
function arc(a: { x: number; y: number }, b: { x: number; y: number }) {
  const { x1, y1, x2, y2 } = trim(a, b, 13);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(70, length * 0.35);
  return `M ${x1} ${y1} Q ${mx - (dy / length) * bend} ${my + (dx / length) * bend} ${x2} ${y2}`;
}

function trim(a: { x: number; y: number }, b: { x: number; y: number }, gap: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x1: a.x + (dx / length) * gap,
    y1: a.y + (dy / length) * gap,
    x2: b.x - (dx / length) * gap,
    y2: b.y - (dy / length) * gap,
  };
}
