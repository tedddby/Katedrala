"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  BAYS,
  EDGE_KINDS,
  PLAN,
  PLAN_EDGES,
  PLAN_HEIGHT,
  PLAN_MEMBERS,
  PLAN_MODULE_EDGES,
  type Bay,
} from "@/lib/demo/plan";
import { measurementOf } from "@/lib/demo/metrics";
import { moduleName, type DemoEdgeKind } from "@/lib/demo/system";

type Mode = "members" | "modules";
interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

const FIT: View = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 0.6;
const MAX_SCALE = 3.2;
const memberById = new Map(PLAN_MEMBERS.map((m) => [m.id, m]));
const bayById = new Map<string, Bay>(BAYS.map((b) => [b.id, b]));
const bayCenter = (id: string) => {
  const bay = bayById.get(id)!;
  return { x: bay.x + bay.width / 2, y: bay.y + bay.height / 2 + 6 };
};
const crossingCount = PLAN_EDGES.filter((e) => e.crossing).length;

export function ArchitectureExplorer() {
  const [mode, setMode] = useState<Mode>("members");
  const [kinds, setKinds] = useState<ReadonlySet<DemoEdgeKind>>(
    () => new Set(EDGE_KINDS.map((k) => k.kind)),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>(FIT);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; view: View } | null>(null);

  // On a phone the member plan is too dense to read at full width, so the plan opens at module scale; members
  // stay one tap away.
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setMode("modules");
  }, []);

  const zoomAt = useCallback((factor: number, cx = PLAN.width / 2, cy = PLAN_HEIGHT / 2) => {
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  // Plain scrolling keeps scrolling the page; Ctrl or Cmd turns the wheel into zoom. A native, non-passive
  // listener is needed so the browser does not also zoom the whole page.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * PLAN.width;
      const y = ((event.clientY - rect.top) / rect.height) * PLAN_HEIGHT;
      zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, x, y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest(".plan-member, .plan-module")) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (d === null || d.id !== event.pointerId || svg === null) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((event.clientX - d.x) / rect.width) * PLAN.width;
    const dy = ((event.clientY - d.y) / rect.height) * PLAN_HEIGHT;
    setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
  };
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id === event.pointerId) {
      drag.current = null;
      setDragging(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = 40 / view.scale;
    const keys: Record<string, () => void> = {
      "+": () => zoomAt(1.2),
      "=": () => zoomAt(1.2),
      "-": () => zoomAt(1 / 1.2),
      "0": () => setView(FIT),
      ArrowLeft: () => setView((v) => ({ ...v, x: v.x + step })),
      ArrowRight: () => setView((v) => ({ ...v, x: v.x - step })),
      ArrowUp: () => setView((v) => ({ ...v, y: v.y + step })),
      ArrowDown: () => setView((v) => ({ ...v, y: v.y - step })),
      Escape: () => setSelected(null),
    };
    const action = keys[event.key];
    if (action !== undefined && event.target === event.currentTarget) {
      event.preventDefault();
      action();
    }
  };

  const related = useMemo(() => {
    if (selected === null || mode !== "members") return null;
    const out = new Set(
      PLAN_EDGES.filter((e) => e.source === selected && kinds.has(e.kind)).map((e) => e.target),
    );
    const inn = new Set(
      PLAN_EDGES.filter((e) => e.target === selected && kinds.has(e.kind)).map((e) => e.source),
    );
    return { out, inn };
  }, [selected, mode, kinds]);

  const toggleKind = (kind: DemoEdgeKind) =>
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind) && next.size > 1) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const memberState = (id: string) => {
    if (related === null) return "rest";
    if (id === selected) return "selected";
    if (related.out.has(id)) return "dependency";
    if (related.inn.has(id)) return "dependent";
    return "dim";
  };

  const edgeState = (source: string, target: string) => {
    if (related === null) return "rest";
    if (source === selected) return "dependency";
    if (target === selected) return "dependent";
    return "dim";
  };

  return (
    <div className="grid-12 gap-y-6">
      <div className="col-span-12 lg:col-span-9">
        <div className="explorer-toolbar">
          <div role="group" aria-label="Scale" className="segmented">
            {(["members", "modules"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setSelected(null);
                }}
              >
                {m === "members" ? "Members" : "Modules"}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Relationship kinds" className="flex flex-wrap gap-2">
            {EDGE_KINDS.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                className="kind-toggle"
                aria-pressed={kinds.has(kind)}
                disabled={mode === "modules"}
                onClick={() => toggleKind(kind)}
              >
                <svg aria-hidden="true" viewBox="0 0 28 8" className="h-2 w-7">
                  <line x1="1" y1="4" x2="27" y2="4" className={`plan-edge-sample kind-${kind}`} />
                </svg>
                {label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Zoom" className="ml-auto flex gap-1">
            <button
              type="button"
              className="zoom-button"
              aria-label="Zoom in"
              onClick={() => zoomAt(1.25)}
            >
              +
            </button>
            <button
              type="button"
              className="zoom-button"
              aria-label="Zoom out"
              onClick={() => zoomAt(1 / 1.25)}
            >
              −
            </button>
            <button type="button" className="zoom-button px-3" onClick={() => setView(FIT)}>
              Fit
            </button>
          </div>
        </div>

        <div
          className="explorer-sheet"
          tabIndex={0}
          role="group"
          aria-label="Architecture plan of the demonstration system. Use plus and minus to zoom, arrow keys to pan, Tab to reach members."
          onKeyDown={onKeyDown}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${PLAN.width} ${PLAN_HEIGHT}`}
            className={`block h-auto w-full select-none ${view.scale > 1 ? "touch-none" : "touch-pan-y"} ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <defs>
              {(["rest", "dependency", "dependent"] as const).map((state) => (
                <marker
                  key={state}
                  id={`arrow-${state}`}
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
                    className={`plan-arrow plan-arrow-${state}`}
                    strokeWidth="1.2"
                  />
                </marker>
              ))}
              {/* Module edges are heavier, so their heads are sized smaller relative to the stroke. */}
              <marker
                id="arrow-module"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="3.6"
                markerHeight="3.6"
                orient="auto-start-reverse"
              >
                <path d="M0.5 1 7 4 0.5 7" fill="none" className="plan-arrow" strokeWidth="1.6" />
              </marker>
            </defs>
            <g
              className={`plan-content ${dragging ? "" : "is-animated"}`}
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            >
              {BAYS.map((bay) => (
                <g key={bay.id} className="plan-bay" data-mode={mode}>
                  <rect x={bay.x} y={bay.y} width={bay.width} height={bay.height} />
                </g>
              ))}

              <g className="plan-edges" data-visible={mode === "members"}>
                {PLAN_EDGES.filter((e) => kinds.has(e.kind)).map((edge) => {
                  const a = memberById.get(edge.source)!;
                  const b = memberById.get(edge.target)!;
                  const state = edgeState(edge.source, edge.target);
                  const markerState = state === "dim" ? "rest" : state;
                  const { x1, y1, x2, y2 } = trim(a, b, 13);
                  return (
                    <line
                      key={`${edge.source}>${edge.target}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className={`plan-edge kind-${edge.kind}`}
                      data-state={state}
                      markerEnd={`url(#arrow-${markerState})`}
                    />
                  );
                })}
              </g>

              <g className="plan-edges" data-visible={mode === "modules"}>
                {PLAN_MODULE_EDGES.map((edge) => {
                  const a = bayCenter(edge.source);
                  const b = bayCenter(edge.target);
                  const { x1, y1, x2, y2 } = trim(a, b, 22);
                  return (
                    <g key={`${edge.source}>${edge.target}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        className="plan-edge plan-module-edge kind-calls"
                        style={{ "--count": edge.count } as CSSProperties}
                        markerEnd="url(#arrow-module)"
                      />
                      {edge.count > 1 && (
                        <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 4} className="plan-count">
                          {edge.count}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* Bay names sit above the edges, so a crossing edge passes behind the name's halo. */}
              {BAYS.map((bay) => (
                <g key={`label-${bay.id}`} className="plan-bay" data-mode={mode} aria-hidden="true">
                  <text x={bay.x + 10} y={bay.y + 15} className="plan-bay-label">
                    {bay.name}
                  </text>
                </g>
              ))}

              {PLAN_MEMBERS.map((member) => {
                const center = bayCenter(member.module);
                const collapsed = mode === "modules";
                return (
                  <g
                    key={member.id}
                    className="plan-member"
                    data-state={memberState(member.id)}
                    data-collapsed={collapsed}
                    style={{
                      transform: `translate(${(collapsed ? center.x : member.x).toFixed(2)}px, ${(collapsed ? center.y : member.y).toFixed(2)}px)`,
                    }}
                    tabIndex={collapsed ? -1 : 0}
                    role="button"
                    aria-hidden={collapsed}
                    aria-pressed={selected === member.id}
                    aria-label={`${member.id}, ${moduleName(member.module)} module`}
                    onClick={() => setSelected((s) => (s === member.id ? null : member.id))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelected((s) => (s === member.id ? null : member.id));
                      }
                      if (event.key === "Escape") setSelected(null);
                    }}
                  >
                    <circle r="16" className="plan-hit" />
                    <circle r="6.5" className="plan-joint" />
                    <text y="26" textAnchor="middle" className="plan-label">
                      {member.id}
                    </text>
                  </g>
                );
              })}

              {BAYS.map((bay) => {
                const c = bayCenter(bay.id);
                return (
                  <g
                    key={`m-${bay.id}`}
                    className="plan-module"
                    data-visible={mode === "modules"}
                    style={{ transform: `translate(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px)` }}
                    aria-hidden={mode !== "modules"}
                  >
                    <circle r={7 + bay.members.length * 2.5} className="plan-joint" />
                    <text
                      y={-18 - bay.members.length * 2.5}
                      textAnchor="middle"
                      className="plan-label"
                    >
                      {bay.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <p className="mt-3 text-[0.8125rem] text-ink-faint">
          <span className="hint-mouse">Drag to pan. Hold Ctrl or Cmd and scroll to zoom.</span>
          <span className="hint-touch">Zoom with + and −, then drag to pan.</span> Demonstration
          system.
        </p>
      </div>

      <aside className="col-span-12 lg:col-span-3" aria-live="polite">
        {selected === null || mode === "modules" ? (
          <Summary mode={mode} />
        ) : (
          <MemberDetail id={selected} />
        )}
      </aside>
    </div>
  );
}

function trim(a: { x: number; y: number }, b: { x: number; y: number }, gap: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  return { x1: a.x + ux * gap, y1: a.y + uy * gap, x2: b.x - ux * gap, y2: b.y - uy * gap };
}

function Summary({ mode }: { mode: Mode }) {
  return (
    <div className="member-card">
      <p className="text-[0.9375rem] font-semibold text-ink">
        {mode === "members" ? "16 members, 8 modules" : "8 modules"}
      </p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
        {mode === "members"
          ? `${PLAN_EDGES.length} dependencies, ${crossingCount} of them across a module boundary. Select a member to see what it depends on and what depends on it.`
          : `${PLAN_MODULE_EDGES.length} dependencies between modules. Line weight and the numbers show how many member dependencies each one aggregates.`}
      </p>
    </div>
  );
}

function MemberDetail({ id }: { id: string }) {
  const m = measurementOf(id);
  const out = PLAN_EDGES.filter((e) => e.source === id);
  const inn = PLAN_EDGES.filter((e) => e.target === id);
  const crossings = [...out, ...inn].filter((e) => e.crossing).length;
  return (
    <div className="member-card">
      <p className="data text-[0.875rem] text-ink">{id}</p>
      <p className="data mt-1 break-all text-[0.75rem] text-ink-faint">{m.node.file}</p>
      <dl className="mt-3 grid gap-y-3 text-[0.8125rem]">
        <div>
          <dt className="text-ink-faint">Module</dt>
          <dd className="text-ink">{moduleName(m.node.module)}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Depends on</dt>
          <dd className="text-ink">
            {out.length === 0
              ? "nothing inside the system"
              : out.map((e) => (
                  <span key={e.target} className="block">
                    {e.target} <span className="text-ink-faint">{e.kind.replace("-", " ")}</span>
                  </span>
                ))}
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Depended on by</dt>
          <dd className="text-ink">
            {inn.length === 0
              ? "nothing"
              : inn.map((e) => (
                  <span key={e.source} className="block">
                    {e.source}
                  </span>
                ))}
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Boundaries crossed</dt>
          <dd className="data text-ink">{crossings}</dd>
        </div>
      </dl>
    </div>
  );
}
