"use client";

import { useMemo, useState } from "react";
import { OTHER_MEMBERS, formatScore, measurementOf } from "@/lib/demo/metrics";
import { EDGES } from "@/lib/demo/system";
import { rests } from "@/lib/text";
import { TermBar } from "@/components/ui/TermBar";

const CHOICES = [
  "Database",
  "PaymentService",
  "OrderService",
  "CheckoutController",
  "ApiGateway",
] as const;

const W = 560;
const H = 420;
const BASE_Y = 372;

/**
 * The tributary of a member: everything whose load it carries, stacked above it by distance, with the
 * dependencies between them. This is Gravity's main term (reach) made visible.
 */
function tributary(id: string) {
  const above = new Map<string, number>();
  const queue: [string, number][] = [[id, 0]];
  while (queue.length > 0) {
    const [current, distance] = queue.shift()!;
    for (const edge of EDGES) {
      if (edge.target === current && !above.has(edge.source) && edge.source !== id) {
        above.set(edge.source, distance + 1);
        queue.push([edge.source, distance + 1]);
      }
    }
  }
  const rows = new Map<number, string[]>();
  for (const [member, distance] of above)
    rows.set(distance, [...(rows.get(distance) ?? []), member].sort());
  const depth = Math.max(0, ...rows.keys());
  const step = depth === 0 ? 0 : Math.min(84, (BASE_Y - 40) / depth);
  const positions = new Map<string, { x: number; y: number }>([[id, { x: W / 2, y: BASE_Y }]]);
  for (const [distance, members] of rows) {
    members.forEach((member, i) => {
      positions.set(member, {
        x:
          W / 2 +
          (i - (members.length - 1) / 2) *
            Math.min(132, (W - 80) / Math.max(1, members.length - 1)),
        y: BASE_Y - distance * step,
      });
    });
  }
  const set = new Set([id, ...above.keys()]);
  const edges = EDGES.filter((e) => set.has(e.source) && set.has(e.target));
  return { positions, edges, count: above.size };
}

export function GravityStage() {
  const [selected, setSelected] = useState<string>("Database");
  const m = measurementOf(selected);
  const view = useMemo(() => tributary(selected), [selected]);
  const foundation = m.dependsOn.length === 0;

  return (
    <div>
      <div role="radiogroup" aria-label="Member" className="flex flex-wrap gap-2">
        {CHOICES.map((id) => {
          const gravity = measurementOf(id).gravity;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected === id}
              className="choice"
              onClick={() => setSelected(id)}
            >
              <span>{id}</span>
              <span className="data text-[0.75rem]">{formatScore(gravity)}</span>
            </button>
          );
        })}
      </div>

      <div className="grid-12 mt-8 gap-y-10">
        <figure className="col-span-12 lg:col-span-7">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full"
            role="img"
            aria-label={describe(selected, view.count)}
          >
            {view.edges.map((edge) => {
              const a = view.positions.get(edge.source)!;
              const b = view.positions.get(edge.target)!;
              const intoSelected = edge.target === selected;
              return (
                <line
                  key={`${edge.source}>${edge.target}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={intoSelected ? "tributary-edge is-into" : "tributary-edge"}
                />
              );
            })}
            {foundation && (
              <g aria-hidden="true">
                <path
                  d={`M ${W / 2} ${BASE_Y + 9} L ${W / 2 - 11} ${BASE_Y + 26} L ${W / 2 + 11} ${BASE_Y + 26} Z`}
                  className="drawing-support"
                />
                <line
                  x1={W / 2 - 70}
                  x2={W / 2 + 70}
                  y1={BASE_Y + 26}
                  y2={BASE_Y + 26}
                  className="drawing-ground"
                />
              </g>
            )}
            {[...view.positions].map(([id, p]) => {
              const isSelected = id === selected;
              const r = isSelected ? 7 + 2.2 * Math.sqrt(view.count + 1) : 5;
              return (
                <g
                  key={id}
                  className="tributary-member"
                  style={{ transform: `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)` }}
                >
                  <circle
                    r={r}
                    className={isSelected ? "tributary-joint is-selected" : "tributary-joint"}
                  />
                  <text
                    y={isSelected ? r + 22 : -11}
                    textAnchor="middle"
                    className="drawing-label"
                    style={{ fontSize: isSelected ? 14 : 11.5 }}
                  >
                    {id}
                  </text>
                </g>
              );
            })}
            {view.count === 0 && (
              <text x={W / 2} y={BASE_Y - 120} textAnchor="middle" className="tributary-empty">
                Nothing in the system rests on {selected}.
              </text>
            )}
          </svg>
          <figcaption className="mt-3 text-[0.8125rem] text-ink-faint">
            Everything that rests on {selected}, directly or through other members. Demonstration
            system.
          </figcaption>
        </figure>

        <div className="col-span-12 lg:col-span-5" aria-live="polite">
          <p className="data text-[0.875rem] text-ink">{selected}</p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className="text-[0.9375rem] text-ink-soft">Gravity</span>
            <span className="data text-[2rem] leading-none text-load">
              {formatScore(m.gravity)}
            </span>
          </p>
          <ol className="mt-6 grid gap-5">
            {m.terms.map((term) => (
              <li key={term.key}>
                <div className="flex items-baseline justify-between gap-4 text-[0.875rem]">
                  <span className="text-ink">{term.label}</span>
                  <span className="data text-ink-faint">
                    {rawLabel(term.key, term.raw)} × {term.weight.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <TermBar value={term.contribution / 0.4} />
                  <span className="data ml-auto text-ink">{formatScore(term.contribution)}</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-[0.8125rem] leading-relaxed text-ink-faint">
            Each term is normalized against the largest value possible for a system of this size,
            never against the largest value observed, so a score only moves when the member's own
            neighbourhood changes.
          </p>
        </div>
      </div>
    </div>
  );
}

function rawLabel(key: string, raw: number): string {
  switch (key) {
    case "reach":
      return `${raw} of ${OTHER_MEMBERS} ${rests(raw)} on it`;
    case "fan-in":
      return `${raw} direct`;
    case "spread":
      return `${raw} other module${raw === 1 ? "" : "s"}`;
    default:
      return `${raw.toFixed(1)} paths`;
  }
}

function describe(id: string, count: number): string {
  return count === 0
    ? `${id}: nothing in the demonstration system rests on it.`
    : `${id} carries ${count} members of the demonstration system, stacked above it by distance.`;
}
