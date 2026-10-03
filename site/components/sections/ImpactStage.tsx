"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  LoadDrawing,
  type DrawingEdge,
  type DrawingMember,
} from "@/components/drawing/LoadDrawing";
import { MEMBERS, MEMBER_FRAME } from "@/lib/demo/layout";
import { MAX_EDGE_LOAD, MAX_LEVEL, edgeLoad, measurementOf } from "@/lib/demo/metrics";
import { IMPACT_TARGETS, impactOf, pathFrom } from "@/lib/demo/impact";
import { EDGES, NODES, moduleName } from "@/lib/demo/system";
import { counted } from "@/lib/text";

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
const nodeById = new Map(NODES.map((n) => [n.id, n]));

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

  const { affected, modules, entryPoints } = impact;

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
          <LoadDrawing
            frame={MEMBER_FRAME}
            members={members}
            edges={edges}
            maxEdgeLoad={MAX_EDGE_LOAD}
            levels={MAX_LEVEL}
            title={`Impact of changing ${target}: ${counted(affected.length, "member")} ${affected.length === 1 ? "depends" : "depend"} on it`}
            settle={false}
            interactive={false}
            highlight={highlight}
          />
          <p className="mt-3 text-[0.8125rem] text-ink-faint">
            Impact rises through everything that rests on the change. Demonstration system.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-5" aria-live="polite">
          <dl className="impact-counts">
            <div>
              <dt>Members affected</dt>
              <dd className="data">{affected.length}</dd>
            </div>
            <div>
              <dt>Modules</dt>
              <dd className="data">{modules.size}</dd>
            </div>
            <div>
              <dt>HTTP entry points</dt>
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
          <p className="mt-5 text-[0.8125rem] text-ink-faint">
            {moduleName(nodeById.get(target)!.module)} module member. Paths are the shortest
            dependency chains; ties are broken by name, so the answer is the same on every run.
          </p>
        </div>
      </div>
    </div>
  );
}
