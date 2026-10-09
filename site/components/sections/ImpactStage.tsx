"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  LoadDrawing,
  type DrawingEdge,
  type DrawingMember,
} from "@/components/drawing/LoadDrawing";
import { MEMBERS, MEMBER_FRAME, MODULE_FRAME, MODULE_MEMBERS } from "@/lib/demo/layout";
import {
  MAX_EDGE_LOAD,
  MAX_LEVEL,
  MAX_MODULE_EDGE_LOAD,
  MAX_MODULE_LEVEL,
  MODULE_EDGES,
  edgeLoad,
  measurementOf,
  moduleEdgeLoad,
  moduleMeasurementOf,
} from "@/lib/demo/metrics";
import { IMPACT_TARGETS, impactOf, pathFrom, type Impact } from "@/lib/demo/impact";
import { EDGES, MODULES, NODES, moduleName } from "@/lib/demo/system";
import { counted, listed } from "@/lib/text";

/** The hero's drawing of the system: every member on its load level, line weight by the load it passes on. */
const members: DrawingMember[] = MEMBERS.map((member) => ({
  ...member,
  load: measurementOf(member.id).load,
  description: member.id,
}));
const edges: DrawingEdge[] = EDGES.map((e) => ({
  source: e.source,
  target: e.target,
  load: edgeLoad(e.source, e.target),
}));

/** Small screens draw the module-level reduction of the same system, as the hero does there. */
const modules: DrawingMember[] = MODULE_MEMBERS.map((member) => ({
  ...member,
  load: moduleMeasurementOf(member.id).load,
  description: `${member.label} module`,
}));
const moduleEdges: DrawingEdge[] = MODULE_EDGES.map(([source, target]) => ({
  source,
  target,
  load: moduleEdgeLoad(source, target),
}));
const moduleOf = new Map(NODES.map((n) => [n.id, n.module]));

export function ImpactStage() {
  const [target, setTarget] = useState("PaymentService");
  const [revealed, setRevealed] = useState(Number.POSITIVE_INFINITY);
  const selectId = useId();
  const impact = useMemo(() => impactOf(target), [target]);
  const firstRender = useRef(true);

  // Propagate ring by ring when the target changes: each step lights the members one dependency further away.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(Number.POSITIVE_INFINITY);
      return;
    }
    setRevealed(0);
    let ring = 0;
    const timer = window.setInterval(() => {
      ring += 1;
      setRevealed(ring);
      if (ring >= impact.maxDistance) window.clearInterval(timer);
    }, 220);
    return () => window.clearInterval(timer);
  }, [impact]);

  // Each lit member, and the dependency that carries the change on to it.
  const highlight = useMemo(() => {
    const lit = new Set<string>();
    const litEdges = new Set<string>();
    for (const [member, d] of impact.distance) {
      if (d > revealed) continue;
      lit.add(member);
      litEdges.add(`${member}>${impact.next.get(member)}`);
    }
    return { focus: target, members: lit, edges: litEdges };
  }, [impact, revealed, target]);

  // The same rings by module: a module lights with its first lit member, and a dependency between modules
  // lights when the path of a lit member crosses it.
  const moduleHighlight = useMemo(() => {
    const lit = new Set<string>();
    const litEdges = new Set<string>();
    for (const [member, d] of impact.distance) {
      if (d > revealed) continue;
      const from = moduleOf.get(member)!;
      const to = moduleOf.get(impact.next.get(member)!)!;
      lit.add(from);
      if (from !== to) litEdges.add(`${from}>${to}`);
    }
    return { focus: moduleOf.get(target)!, members: lit, edges: litEdges };
  }, [impact, revealed, target]);

  const { affected, entryPoints } = impact;
  const home = moduleName(moduleOf.get(target)!);

  return (
    <div>
      <div className="command-bar">
        <label htmlFor={selectId} className="data text-ink-faint">
          <span aria-hidden="true">$ </span>katedrala impact
        </label>
        <select
          id={selectId}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="command-select"
        >
          {IMPACT_TARGETS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      <div className="grid-12 mt-8 gap-y-10">
        <div className="col-span-12 lg:col-span-7">
          <div className="hidden sm:block">
            <LoadDrawing
              frame={MEMBER_FRAME}
              members={members}
              edges={edges}
              maxEdgeLoad={MAX_EDGE_LOAD}
              levels={MAX_LEVEL}
              title={describeMembers(impact)}
              settle={false}
              interactive={false}
              highlight={highlight}
            />
          </div>
          <div className="sm:hidden">
            <LoadDrawing
              frame={MODULE_FRAME}
              members={modules}
              edges={moduleEdges}
              maxEdgeLoad={MAX_MODULE_EDGE_LOAD}
              levels={MAX_MODULE_LEVEL}
              title={describeModules(impact)}
              labelSize={17}
              minLabelPx={12}
              settle={false}
              interactive={false}
              highlight={moduleHighlight}
            />
          </div>
          <p className="footnote mt-3">
            <span className="sm:hidden">Drawn by module. </span>Impact rises through everything that
            rests on the change. Demonstration system.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <p role="status" aria-atomic="true" className="sr-only">
            {summarize(impact)}
          </p>
          <dl className="impact-counts">
            <div>
              <dt>Members affected</dt>
              <dd className="data">{affected.length}</dd>
            </div>
            <div>
              <dt>Modules</dt>
              <dd className="data">{impact.modules.size}</dd>
            </div>
            <div>
              <dt>HTTP handlers</dt>
              <dd className="data">{entryPoints.length}</dd>
            </div>
          </dl>

          <h3 className="mt-8 text-[0.9375rem] font-semibold text-ink">
            Why each member is affected
          </h3>
          {affected.length === 0 ? (
            <p className="mt-3 text-[0.875rem] text-ink-soft">
              Nothing in the system depends on {target}.
            </p>
          ) : (
            <ol className="mt-3 grid gap-2">
              {affected.map(([id, d]) => (
                <li key={id} className="impact-path" data-visible={d <= revealed}>
                  <span className="data text-ink-faint">{d}</span>
                  <span className="data text-[0.75rem] leading-relaxed text-ink-soft">
                    {pathFrom(id, impact).map((step, i, all) => (
                      <span key={step}>
                        <span
                          className={
                            i === 0 ? "text-ink" : step === target ? "text-load" : undefined
                          }
                        >
                          {step}
                        </span>
                        {i < all.length - 1 && <span className="text-ink-faint"> → </span>}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="footnote mt-6">
            {target} is in the {home} module. Paths are the shortest dependency chains, with ties
            broken by name, so every run gives the same answer.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The affected members grouped by their distance from the change, nearest first. */
function tiers(impact: Impact): string {
  const byDistance = new Map<number, string[]>();
  for (const [member, distance] of impact.affected)
    byDistance.set(distance, [...(byDistance.get(distance) ?? []), member]);
  return [...byDistance]
    .map(
      ([distance, names]) =>
        `${distance === 1 ? "directly" : `${distance} steps away`}: ${names.join(", ")}`,
    )
    .join("; ");
}

/** The member drawing's text alternative: what depends on the change, and how far away. */
function describeMembers(impact: Impact): string {
  const n = impact.affected.length;
  if (n === 0)
    return `Load drawing of the demonstration system: nothing depends on ${impact.target}.`;
  return `Load drawing of the demonstration system: ${counted(n, "member")} ${n === 1 ? "depends" : "depend"} on ${impact.target}; ${tiers(impact)}.`;
}

/** The module drawing's text alternative: which modules the change reaches. */
function describeModules(impact: Impact): string {
  const names = MODULES.filter((module) => impact.modules.has(module.id)).map((m) => m.name);
  const home = moduleName(moduleOf.get(impact.target)!);
  if (names.length === 0)
    return `Load drawing of the demonstration system by module: nothing depends on ${impact.target}.`;
  return `Load drawing of the demonstration system by module: changing ${impact.target}, in ${home}, reaches ${counted(names.length, "module")}: ${listed(names)}.`;
}

/** What a screen reader hears when the target changes: one short sentence. */
function summarize(impact: Impact): string {
  const n = impact.affected.length;
  if (n === 0) return `Nothing in the demonstration system depends on ${impact.target}.`;
  const handlers = impact.entryPoints.length;
  return `Changing ${impact.target} affects ${counted(n, "member")} in ${counted(impact.modules.size, "module")}${
    handlers === 0 ? "" : `, including ${counted(handlers, "HTTP handler")}`
  }.`;
}
