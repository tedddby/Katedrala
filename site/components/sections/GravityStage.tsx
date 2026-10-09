"use client";

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { fromKeyboard } from "@/components/drawing/chain-motion";
import {
  LoadDrawing,
  type DrawingArrival,
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
  termEvidenceOf,
  type GravityTerm,
  type TermKey,
} from "@/lib/demo/metrics";
import { EDGES, NODES, moduleName, type DemoEdgeKind } from "@/lib/demo/system";
import { counted, listed, rests } from "@/lib/text";

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
const moduleOf = new Map(NODES.map((node) => [node.id, node.module]));

/** How a dependency of each kind reads in a sentence, for one dependent and for several. */
const VERB: Record<DemoEdgeKind, readonly [string, string]> = {
  calls: ["calls", "call"],
  instantiates: ["instantiates", "instantiate"],
  "accesses-data": ["accesses data in", "access data in"],
  implements: ["implements", "implement"],
  imports: ["imports", "import"],
};

/** The verb for dependents of `id` in agreement with `count`: their own kind when they share one. */
function verbOf(id: string, dependents: readonly string[], count: number): string {
  const kinds = new Set(
    EDGES.filter((e) => e.target === id && dependents.includes(e.source)).map((e) => e.kind),
  );
  const [one, many] =
    kinds.size === 1 ? VERB[[...kinds][0]!] : (["depends on", "depend on"] as const);
  return count === 1 ? one : many;
}

/**
 * Why each term adds what it does, in a sentence with the term's own measurement: the reasons the Evidence
 * section once gave for one member, now for whichever member is measured.
 */
function reasonOf(id: string, key: TermKey): string {
  const m = measurementOf(id);
  const callers = [...m.dependedOnBy].sort();
  switch (key) {
    case "reach": {
      const n = m.transitiveDependents.length;
      return n === 0
        ? "Nothing in the demonstration system rests on it."
        : `${n} of ${OTHER_MEMBERS} members ${rests(n)} on it, directly or through other members.`;
    }
    case "fan-in":
      return callers.length === 0
        ? "No member depends on it directly."
        : `${counted(callers.length, "member")} ${verbOf(id, callers, callers.length)} it directly: ${listed(callers)}.`;
    case "spread": {
      const outside = callers.filter((u) => moduleOf.get(u) !== m.node.module);
      const modules = [...new Set(outside.map((u) => moduleName(moduleOf.get(u)!)))].sort();
      if (modules.length > 0)
        return `${counted(modules.length, "other module")} ${verbOf(id, outside, modules.length)} it: ${listed(modules)}.`;
      return callers.length === 0
        ? "No member depends on it, so no other module does."
        : `Only members of its own module, ${moduleName(m.node.module)}, depend on it.`;
    }
    default:
      return m.betweenness === 0
        ? "No shortest dependency path between two other members passes through it."
        : `Its betweenness is ${m.betweenness.toFixed(1)}: summed over pairs of other members, the share of each pair's shortest dependency paths that pass through it.`;
  }
}

/** What the drawing shows lit for a term, in a few words: the caption under the drawing. */
function captionOf(id: string, term: TermKey | null, lit: number): string {
  if (term === null) return `Only ${id} is lit. Demonstration system.`;
  if (lit === 0) {
    return {
      reach: `Nothing in the demonstration system rests on ${id}.`,
      "fan-in": `Nothing in the demonstration system depends on ${id} directly.`,
      spread: `No other module depends on ${id}. Demonstration system.`,
      brokerage: `No shortest dependency path passes through ${id}. Demonstration system.`,
    }[term];
  }
  return {
    reach: `Everything that rests on ${id}, directly or through other members. Demonstration system.`,
    "fan-in": `What depends on ${id} directly. Demonstration system.`,
    spread: `What depends on ${id} directly from other modules. Demonstration system.`,
    brokerage: `The shortest dependency paths between other members that pass through ${id}. Demonstration system.`,
  }[term];
}

export function GravityStage() {
  // The member measured, the term whose evidence the drawing lights (none when its toggle is released), and how
  // the last change arrives: load arriving level by level for a pointer choice of member, a crossfade between
  // terms, at once from the keyboard.
  const [view, setView] = useState<{
    member: Choice;
    term: TermKey | null;
    arrival: DrawingArrival;
  }>({ member: "Database", term: "reach", arrival: "cascade" });
  const { member: selected, term, arrival } = view;
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const m = measurementOf(selected);
  const shown = formatParts(
    m.terms.map((t) => t.contribution),
    m.gravity,
  );
  const laid = chain(m.terms.map((t) => t.contribution));
  const foundation = m.level === 0;
  const termOf = (key: TermKey | null) => m.terms.find((t) => t.key === key);

  const lit = useMemo(() => {
    const evidence = term === null ? { members: [], edges: [] } : termEvidenceOf(selected, term);
    return {
      members: evidence.members,
      highlight: {
        focus: selected,
        members: new Set(evidence.members),
        edges: new Set(evidence.edges),
      },
    };
  }, [selected, term]);

  // Small screens: what rests on the member and whatever the shown term lights, by load level, top down.
  const schedule = useMemo(() => {
    const listedIds = new Set([selected, ...m.transitiveDependents, ...lit.members]);
    const levels = [...new Set([...listedIds].map((id) => levelOf.get(id)!))].sort((a, b) => b - a);
    return levels.map((level) => ({
      level,
      members: [...listedIds].filter((id) => levelOf.get(id) === level).sort(),
    }));
  }, [selected, m.transitiveDependents, lit.members]);

  // On phones the schedule is the drawing: a member chosen by pointer arrives in it level by level too.
  const scheduleRef = useRef<HTMLOListElement>(null);
  const scheduled = useRef(selected);
  useLayoutEffect(() => {
    const changed = scheduled.current !== selected;
    scheduled.current = selected;
    const list = scheduleRef.current;
    if (!changed || arrival !== "cascade" || list === null || list.getClientRects().length === 0)
      return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rows = [...list.children].map((row, i) =>
      row.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        delay: Math.min(480, i * 60),
        duration: 220,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        fill: "backwards",
      }),
    );
    return () => rows.forEach((animation) => animation.cancel());
  }, [selected, arrival]);

  const choose = (next: Choice, how: DrawingArrival) =>
    setView((current) => ({ ...current, member: next, arrival: how }));
  const show = (key: TermKey, how: DrawingArrival) =>
    setView((current) => ({ ...current, term: current.term === key ? null : key, arrival: how }));

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
    choose(CHOICES[next]!, "instant");
    radios.current[next]?.focus();
  };

  const shownTerm = termOf(term);
  const status = `${selected}: gravity ${formatScore(m.gravity)}. ${
    shownTerm === undefined
      ? `Nothing is lit besides ${selected}.`
      : `${shownTerm.label} lights ${
          lit.members.length === 0
            ? "no other member"
            : `${counted(lit.members.length, "member")}: ${listed(lit.members)}`
        }.`
  }`;

  return (
    <div className="gravity grid-12 gap-y-10">
      {/* The drawing and its member choices: on wide screens to the right, the choices under the drawing; on
          phones first, the choices above the schedule they change. */}
      <div className="col-span-12 flex flex-col gap-8 lg:col-span-7 lg:col-start-6 lg:row-start-1">
        <div
          role="radiogroup"
          aria-label="Member to measure"
          className="choices lg:order-last"
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
              onClick={(event) => choose(id, fromKeyboard(event) ? "instant" : "cascade")}
            >
              <span>{id}</span>
              <span className="data text-[0.75rem]">{formatScore(measurementOf(id).gravity)}</span>
            </button>
          ))}
        </div>

        <figure>
          <div className="hidden sm:block">
            <LoadDrawing
              frame={MEMBER_FRAME}
              members={members}
              edges={edges}
              maxEdgeLoad={MAX_EDGE_LOAD}
              levels={MAX_LEVEL}
              title={describe(selected, term)}
              settle={false}
              interactive={false}
              highlight={lit.highlight}
              arrival={arrival}
            />
          </div>

          {/* Small screens: the drawing as a schedule of load levels, read top down, marked as it is lit. */}
          <div className="sm:hidden">
            <ol
              ref={scheduleRef}
              className="schedule"
              aria-label={
                lit.members.every((id) => m.transitiveDependents.includes(id))
                  ? `${selected} and what rests on it, by load level`
                  : `${selected}, what rests on it and what its ${shownTerm?.label.toLowerCase()} lights, by load level`
              }
              data-arrival={arrival}
            >
              {schedule.map(({ level, members: ids }) => (
                <li key={level} className="schedule-level">
                  <span className="schedule-level-label">
                    <span className="sr-only">Level </span>
                    {level === 0 ? "±0" : `+${level}`}
                  </span>
                  <ul className="schedule-members">
                    {ids.map((id) => {
                      const relation =
                        id === selected
                          ? "active"
                          : lit.highlight.members.has(id)
                            ? "lit"
                            : "quiet";
                      return (
                        <li key={id} className="schedule-member" data-relation={relation}>
                          <span className="schedule-joint" aria-hidden="true" />
                          {id}
                        </li>
                      );
                    })}
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
            {captionOf(selected, term, lit.members.length)}
          </figcaption>
        </figure>
      </div>

      {/* The readout: the score, why it is what it is, term by term, each with the evidence it lights. */}
      <div className="col-span-12 max-w-[40rem] lg:col-span-5 lg:col-start-1 lg:row-start-1">
        <p role="status" aria-atomic="true" className="sr-only">
          {status}
        </p>
        <p className="gravity-score">
          <span className="score-gauge text-load">{formatScore(m.gravity)}</span>{" "}
          <span className="text-[1rem] text-ink-soft">
            Gravity of <span className="data text-[0.9375rem] text-ink">{selected}</span>
          </span>
        </p>

        <h3 className="subheading mt-10">
          Why does {selected} score {formatScore(m.gravity)}?
        </h3>

        {/* Each term: what was measured, its normalized value times its weight, and what it adds, laid head to
            tail on the load line so the terms visibly close to the score; under it the reason, and the control
            that lights its evidence in the drawing. */}
        <TermLedger score={m.gravity} className="mt-6">
          {m.terms.map((t, i) => (
            <TermRow
              key={t.key}
              label={<span className="text-ink">{t.label}</span>}
              measured={rawLabel(t)}
              normalized={t.normalized}
              weight={t.weight}
              value={shown[i]!}
              from={laid[i]!.from}
              to={laid[i]!.to}
            >
              <div className="term-evidence">
                <p className="term-reason">{reasonOf(selected, t.key)}</p>
                <button
                  type="button"
                  className="term-show"
                  aria-pressed={term === t.key}
                  aria-label={`Show ${t.label.toLowerCase()} in the drawing`}
                  onClick={(event) => show(t.key, fromKeyboard(event) ? "instant" : "crossfade")}
                >
                  <span className="term-show-joint" aria-hidden="true" />
                  Show
                </button>
              </div>
            </TermRow>
          ))}
        </TermLedger>

        <p className="footnote mt-6">
          Each term adds its normalized value times its weight, rounded so the terms add up to the
          score. Reach, fan-in and brokerage are log shares,{" "}
          <span className="whitespace-nowrap">ln(1 + x) / ln(1 + max)</span>, against the most a
          system of {GRAVITY_SCALE.members} members allows: {GRAVITY_SCALE.reach} for reach and
          fan-in, {GRAVITY_SCALE.brokerage} for brokerage. Spread saturates as{" "}
          <span className="whitespace-nowrap">x / (x + {GRAVITY_SCALE.spread})</span>. No term
          depends on the largest value observed, so a score moves with what rests on the member and
          only slightly as the system grows.
        </p>
      </div>
    </div>
  );
}

function rawLabel(term: GravityTerm): string {
  switch (term.key) {
    case "reach":
      return `${term.raw} of ${OTHER_MEMBERS} ${rests(term.raw)} on it`;
    case "fan-in":
      return `${term.raw} direct`;
    case "spread":
      return counted(term.raw, "other module");
    default:
      return `betweenness ${term.raw.toFixed(1)}`;
  }
}

/**
 * The drawing's text alternative: for reach, who rests on the member, nearest first, by dependency steps; for
 * the other terms, which members their evidence lights.
 */
function describe(id: string, term: TermKey | null): string {
  const prefix = "Load drawing of the demonstration system";
  if (term === null) return `${prefix}: only ${id} is lit.`;
  if (term !== "reach") {
    const { members: litMembers } = termEvidenceOf(id, term);
    const label = measurementOf(id)
      .terms.find((t) => t.key === term)!
      .label.toLowerCase();
    return litMembers.length === 0
      ? `${prefix}: ${label} of ${id} lights no other member.`
      : `${prefix}: ${label} of ${id} lights ${counted(litMembers.length, "member")}: ${listed(litMembers)}.`;
  }
  const { affected } = impactOf(id);
  if (affected.length === 0) return `${prefix}: nothing rests on ${id}.`;
  const tiers = new Map<number, string[]>();
  for (const [member, distance] of affected)
    tiers.set(distance, [...(tiers.get(distance) ?? []), member]);
  const parts = [...tiers].map(
    ([distance, names]) =>
      `${distance === 1 ? "directly" : `${distance} steps away`}: ${names.join(", ")}`,
  );
  return `${prefix}: ${counted(affected.length, "member")} ${rests(affected.length)} on ${id}; ${parts.join("; ")}.`;
}
