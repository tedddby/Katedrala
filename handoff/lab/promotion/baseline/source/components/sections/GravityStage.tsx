"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  LoadDrawing,
  type DrawingEdge,
  type DrawingMember,
} from "@/components/drawing/LoadDrawing";
import { TermLedger, TermRow, chain } from "@/components/ui/TermLedger";
import { impactOf } from "@/lib/demo/impact";
import { MEMBERS, MEMBER_FRAME } from "@/lib/demo/layout";
import {
  GRAVITY_SCALE,
  MAX_EDGE_LOAD,
  MAX_LEVEL,
  OTHER_MEMBERS,
  edgeLoad,
  formatParts,
  formatScore,
  measurementOf,
} from "@/lib/demo/metrics";
import { EDGES } from "@/lib/demo/system";
import { counted, rests } from "@/lib/text";

const CHOICES = [
  "Database",
  "PaymentService",
  "OrderService",
  "CheckoutController",
  "ApiGateway",
] as const;
type Choice = (typeof CHOICES)[number];

/** The hero's drawing of the system: every member on its load level, line weight by the load it passes on. */
const members: DrawingMember[] = MEMBERS.map((member) => ({
  ...member,
  load: measurementOf(member.id).load,
  description: member.id,
}));
const edges: DrawingEdge[] = EDGES.map((edge) => ({
  source: edge.source,
  target: edge.target,
  load: edgeLoad(edge.source, edge.target),
}));
const levelOf = new Map(MEMBERS.map((member) => [member.id, member.level]));

/**
 * The tributary of a member: everything whose load it carries, directly or through other members, and every
 * dependency that brings that load down to it. This is Gravity's main term (reach) made visible.
 */
function tributary(id: string) {
  const { affected } = impactOf(id);
  const resting = new Set(affected.map(([member]) => member));
  const carried = new Set([id, ...resting]);
  const paths = EDGES.filter((edge) => resting.has(edge.source) && carried.has(edge.target));
  // The same members by load level, top down to the member itself: the schedule small screens show.
  const base = levelOf.get(id)!;
  const top = Math.max(base, ...[...resting].map((member) => levelOf.get(member)!));
  const levels = Array.from({ length: top - base + 1 }, (_, i) => ({
    level: top - i,
    members: [...carried].filter((member) => levelOf.get(member) === top - i).sort(),
  }));
  return {
    affected,
    levels,
    highlight: {
      focus: id,
      members: resting,
      edges: new Set(paths.map((edge) => `${edge.source}>${edge.target}`)),
    },
  };
}

export function GravityStage() {
  const [selected, setSelected] = useState<Choice>("Database");
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const m = measurementOf(selected);
  const view = useMemo(() => tributary(selected), [selected]);
  const description = describe(selected, view.affected);
  const resting = view.affected.length;
  const shown = formatParts(
    m.terms.map((term) => term.contribution),
    m.gravity,
  );
  const laid = chain(m.terms.map((term) => term.contribution));
  const foundation = m.level === 0;

  // A radio group: one Tab stop, arrow keys move the choice and the focus together.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = CHOICES.length - 1;
    const i = CHOICES.indexOf(selected);
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? i === last
          ? 0
          : i + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? i === 0
            ? last
            : i - 1
          : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setSelected(CHOICES[next]!);
    radios.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Member to measure"
        className="flex flex-wrap gap-2"
        onKeyDown={onKeyDown}
      >
        {CHOICES.map((id, i) => (
          <button
            key={id}
            ref={(element) => {
              radios.current[i] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected === id}
            tabIndex={selected === id ? 0 : -1}
            className="choice"
            onClick={() => setSelected(id)}
          >
            <span>{id}</span>
            <span className="data text-[0.75rem]">{formatScore(measurementOf(id).gravity)}</span>
          </button>
        ))}
      </div>

      <div className="grid-12 mt-8 gap-y-10">
        <figure className="col-span-12 lg:col-span-7">
          <div className="hidden sm:block">
            <LoadDrawing
              frame={MEMBER_FRAME}
              members={members}
              edges={edges}
              maxEdgeLoad={MAX_EDGE_LOAD}
              levels={MAX_LEVEL}
              title={description}
              settle={false}
              interactive={false}
              highlight={view.highlight}
            />
          </div>

          {/* Small screens: the tributary as a schedule of load levels, read top down to the member. */}
          <div className="sm:hidden">
            <ol className="schedule" aria-label={`${selected} and what rests on it, by load level`}>
              {view.levels.map(({ level, members: ids }) => (
                <li key={level} className="schedule-level">
                  <span className="schedule-level-label">
                    <span className="sr-only">Level </span>
                    {level === 0 ? "±0" : `+${level}`}
                  </span>
                  <ul className="schedule-members">
                    {ids.map((id) => (
                      <li
                        key={id}
                        className="schedule-member"
                        data-relation={id === selected ? "active" : "carried"}
                      >
                        <span className="schedule-joint" aria-hidden="true" />
                        {id}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <div
              className={foundation ? "schedule-ground ground-hatch" : "schedule-base"}
              aria-hidden="true"
            />
          </div>

          <figcaption className="footnote mt-3">
            {resting === 0
              ? `Nothing in the demonstration system rests on ${selected}.`
              : `Everything that rests on ${selected}, directly or through other members. Demonstration system.`}
          </figcaption>
        </figure>

        <div className="col-span-12 max-w-[40rem] lg:col-span-5">
          <p role="status" aria-atomic="true" className="sr-only">
            {`${selected}: gravity ${formatScore(m.gravity)}, ${resting} of ${OTHER_MEMBERS} members ${rests(resting)} on it.`}
          </p>
          {/* The score first, as Entropy and Impact set their measured values, then whose it is. */}
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="data text-[2.75rem] leading-none text-load">
              {formatScore(m.gravity)}
            </span>{" "}
            <span className="text-[1rem] text-ink-soft">
              Gravity of <span className="data text-[0.9375rem] text-ink">{selected}</span>
            </span>
          </p>

          {/* Each term: what was measured, its normalized value times its weight, and what it adds, laid head
              to tail on the load line so the terms visibly close to the score. */}
          <TermLedger score={m.gravity} className="mt-6">
            {m.terms.map((term, i) => (
              <TermRow
                key={term.key}
                label={<span className="text-ink">{term.label}</span>}
                measured={rawLabel(term.key, term.raw)}
                normalized={term.normalized}
                weight={term.weight}
                value={shown[i]!}
                from={laid[i]!.from}
                to={laid[i]!.to}
              />
            ))}
          </TermLedger>

          <p className="footnote mt-6">
            Each term adds its normalized value times its weight, rounded so the terms add up to the
            score. Reach, fan-in and brokerage are log shares,{" "}
            <span className="whitespace-nowrap">ln(1 + x) / ln(1 + max)</span>, against the most a
            system of {GRAVITY_SCALE.members} members allows: {GRAVITY_SCALE.reach} for reach and
            fan-in, {GRAVITY_SCALE.brokerage} for brokerage. Spread saturates as{" "}
            <span className="whitespace-nowrap">x / (x + {GRAVITY_SCALE.spread})</span>. No term
            depends on the largest value observed, so a score moves with what rests on the member
            and only slightly as the system grows.
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
      return counted(raw, "other module");
    default:
      return `betweenness ${raw.toFixed(1)}`;
  }
}

/** The drawing's text alternative: who rests on the member, nearest first, by dependency steps. */
function describe(id: string, affected: readonly (readonly [string, number])[]): string {
  if (affected.length === 0)
    return `Load drawing of the demonstration system: nothing rests on ${id}.`;
  const tiers = new Map<number, string[]>();
  for (const [member, distance] of affected)
    tiers.set(distance, [...(tiers.get(distance) ?? []), member]);
  const parts = [...tiers].map(
    ([distance, names]) =>
      `${distance === 1 ? "directly" : `${distance} steps away`}: ${names.join(", ")}`,
  );
  return `Load drawing of the demonstration system: ${counted(affected.length, "member")} ${rests(affected.length)} on ${id}; ${parts.join("; ")}.`;
}
