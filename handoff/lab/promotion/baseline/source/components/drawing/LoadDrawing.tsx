"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DrawingFrame, LabelSide } from "@/lib/demo/layout";

export interface DrawingMember {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly level: number;
  readonly side: LabelSide;
  /** Load the member carries; sets the joint size. */
  readonly load: number;
  /** One-line accessible name, e.g. "PaymentService, Payments module". */
  readonly description: string;
  /** Accessible description read after the name: what the member's card says about it. */
  readonly detail?: string;
}

export interface DrawingEdge {
  /** The dependent: it rests on `target`. */
  readonly source: string;
  readonly target: string;
  /** Load passed along this member; sets the line weight. */
  readonly load: number;
}

interface LoadDrawingProps {
  readonly frame: DrawingFrame;
  readonly members: readonly DrawingMember[];
  readonly edges: readonly DrawingEdge[];
  readonly maxEdgeLoad: number;
  readonly levels: number;
  /** Accessible name of the drawing. */
  readonly title: string;
  /** Card for the member under test, rendered inside the figure. Omit when the page shows it elsewhere. */
  readonly renderCard?: (id: string) => ReactNode;
  readonly idleCard?: ReactNode;
  /** Controlled selection; omit both to let the drawing keep its own. */
  readonly active?: string | null;
  /** Called when a click, tap, Enter, Space, arrow key or Escape changes the selection. */
  readonly onActiveChange?: (id: string | null) => void;
  /** Member tested while nothing is selected or previewed: its load path is the drawing's resting state. */
  readonly resting?: string | null;
  /** Called when the member under test changes: a mouse preview, else the selection; null at rest. */
  readonly onTestedChange?: (id: string | null) => void;
  readonly labelSize?: number;
  /** Smallest rendered size of any text in the drawing, in CSS px; text grows in drawing units below it. */
  readonly minLabelPx?: number;
  readonly className?: string;
  /** Play the settle when the drawing first comes into view (the page has one such moment). Default true. */
  readonly settle?: boolean;
  /** Members respond to pointer and keyboard. Default true; false for drawings driven by other controls. */
  readonly interactive?: boolean;
  /** Explicit lighting that replaces the tested-member relations: lit members and edges carry the load color. */
  readonly highlight?: {
    readonly focus: string | null;
    readonly members: ReadonlySet<string>;
    readonly edges: ReadonlySet<string>;
  };
}

/**
 * How a member or a dependency relates to the member under test: `carried` rests on it (the load it carries,
 * drawn in load blue), `support` is what it rests on, down to the foundations.
 */
type Relation = "active" | "carried" | "support" | "dim" | "rest";

/** Distance below the lowest level where the ground line runs; foundations stand on supports above it. */
const SUPPORT = 14;
/** Level labels never set smaller than this, in drawing units. */
const LEVEL_LABEL = 11;
/** Rendered radius of a member's touch target on coarse pointers, in CSS px (a 44px target). */
const TOUCH_RADIUS = 22;

export function LoadDrawing({
  frame,
  members,
  edges,
  maxEdgeLoad,
  levels,
  title,
  renderCard,
  idleCard,
  active: controlledActive,
  onActiveChange,
  resting = null,
  onTestedChange,
  labelSize = 13,
  minLabelPx = 11,
  className,
  settle = true,
  interactive = true,
  highlight,
}: LoadDrawingProps) {
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const controlled = controlledActive !== undefined;
  const selected = controlled ? controlledActive : ownSelected;
  // A mouse or pen hovering a member previews it without changing the selection.
  const [preview, setPreview] = useState<string | null>(null);
  // Roving tab stop: the member that last had focus.
  const [focused, setFocused] = useState<string | null>(null);
  const tested = interactive ? (preview ?? selected) : selected;
  const shown = tested ?? resting;

  const select = useCallback(
    (id: string | null) => {
      if (!controlled) setOwnSelected(id);
      onActiveChange?.(id);
    },
    [controlled, onActiveChange],
  );

  // Before paint, so a card shown elsewhere on the page changes in the same frame as the drawing.
  useLayoutEffect(() => {
    onTestedChange?.(tested);
  }, [tested, onTestedChange]);

  const figureRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const memberRefs = useRef(new Map<string, SVGGElement>());
  const edgeRefs = useRef(new Map<string, SVGLineElement>());
  const hatchId = useId();
  const scale = useDrawingScale(svgRef, frame.width);
  const coarse = useCoarsePointer(interactive);

  // Reading order: top level first, left to right. Sets the DOM order and what arrow keys step through.
  const order = useMemo(
    () => [...members].sort((a, b) => b.level - a.level || a.x - b.x),
    [members],
  );

  const adjacency = useMemo(() => {
    const down = new Map<string, string[]>();
    const up = new Map<string, string[]>();
    for (const edge of edges) {
      down.set(edge.source, [...(down.get(edge.source) ?? []), edge.target]);
      up.set(edge.target, [...(up.get(edge.target) ?? []), edge.source]);
    }
    return { down, up };
  }, [edges]);

  const relation = useMemo(() => {
    if (shown === null) return null;
    const walk = (start: string, next: Map<string, string[]>): Set<string> => {
      const seen = new Set<string>();
      const stack = [...(next.get(start) ?? [])];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        stack.push(...(next.get(id) ?? []));
      }
      return seen;
    };
    return { carried: walk(shown, adjacency.up), support: walk(shown, adjacency.down) };
  }, [shown, adjacency]);

  const memberRelation = (id: string): Relation => {
    if (highlight !== undefined) {
      if (id === highlight.focus) return "active";
      if (highlight.members.has(id)) return "carried";
      return highlight.focus === null ? "rest" : "dim";
    }
    if (shown === null || relation === null) return "rest";
    if (id === shown) return "active";
    if (relation.carried.has(id)) return "carried";
    if (relation.support.has(id)) return "support";
    // At rest every member stays legible; only a member someone is testing dims what it does not touch.
    return tested === null ? "rest" : "dim";
  };

  const edgeRelation = (edge: DrawingEdge): Relation => {
    if (highlight !== undefined) {
      if (highlight.edges.has(`${edge.source}>${edge.target}`)) return "carried";
      return highlight.focus === null ? "rest" : "dim";
    }
    if (shown === null || relation === null) return "rest";
    // Load coming down to the member under test, then on from it to the ground.
    const bearing = (id: string) => id === shown || relation.carried.has(id);
    const supporting = (id: string) => id === shown || relation.support.has(id);
    if (relation.carried.has(edge.source) && bearing(edge.target)) return "carried";
    if (supporting(edge.source) && relation.support.has(edge.target)) return "support";
    return tested === null ? "rest" : "dim";
  };

  // Line weight in proportion to the load carried: the heaviest member is drawn about five times the lightest.
  const strokeWidth = useCallback((load: number) => 0.8 + 5 * (load / maxEdgeLoad), [maxEdgeLoad]);
  const radius = (load: number) => 3.6 + 1.9 * Math.sqrt(load);
  const groundY = frame.ground + SUPPORT;
  const labelUnits = Math.max(labelSize, minLabelPx * scale);
  const levelUnits = Math.max(LEVEL_LABEL, minLabelPx * scale);
  const touchUnits = coarse ? TOUCH_RADIUS * scale : 0;

  const known = (id: string | null): id is string =>
    id !== null && members.some((m) => m.id === id);
  const tabStop = known(focused)
    ? focused
    : known(selected)
      ? selected
      : known(resting)
        ? resting
        : order[0]?.id;

  /** Arrow keys: left and right read through the members, up and down climb the load-path levels. */
  const neighbor = (from: DrawingMember, key: string): DrawingMember | undefined => {
    const at = order.indexOf(from);
    switch (key) {
      case "ArrowRight":
        return order[(at + 1) % order.length];
      case "ArrowLeft":
        return order[(at - 1 + order.length) % order.length];
      case "Home":
        return order[0];
      case "End":
        return order[order.length - 1];
      case "ArrowUp":
      case "ArrowDown": {
        const up = key === "ArrowUp";
        const beyond = order.filter((m) => (up ? m.level > from.level : m.level < from.level));
        if (beyond.length === 0) return undefined;
        const level = up
          ? Math.min(...beyond.map((m) => m.level))
          : Math.max(...beyond.map((m) => m.level));
        return beyond
          .filter((m) => m.level === level)
          .reduce((best, m) => (Math.abs(m.x - from.x) < Math.abs(best.x - from.x) ? m : best));
      }
      default:
        return undefined;
    }
  };

  const onMemberKeyDown = (event: React.KeyboardEvent<SVGGElement>, member: DrawingMember) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPreview(null);
      select(member.id);
      return;
    }
    if (event.key === "Escape") {
      if (selected === null && preview === null) return;
      event.preventDefault();
      setPreview(null);
      select(null);
      return;
    }
    if (!NAVIGATION_KEYS.has(event.key)) return;
    event.preventDefault();
    const next = neighbor(member, event.key);
    if (next === undefined) return;
    setPreview(null);
    select(next.id);
    setFocused(next.id);
    memberRefs.current.get(next.id)?.focus();
  };

  useSettle(figureRef, members, edges, memberRefs, edgeRefs, strokeWidth, settle);

  return (
    <figure
      ref={figureRef}
      className={`drawing relative ${className ?? ""}`}
      data-settle={settle ? "pending" : "done"}
      data-interactive={interactive}
      data-resting={interactive && tested === null && resting !== null ? "" : undefined}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        className="block h-auto w-full overflow-visible"
        role={interactive ? "radiogroup" : "img"}
        aria-label={title}
        onPointerLeave={
          interactive
            ? (event) => {
                if (event.pointerType !== "touch") setPreview(null);
              }
            : undefined
        }
        onClick={
          interactive
            ? (event) => {
                // A click or tap on the bare sheet returns the drawing to rest.
                if ((event.target as Element).closest(".drawing-member") !== null) return;
                setPreview(null);
                select(null);
              }
            : undefined
        }
      >
        <defs>
          <pattern
            id={hatchId}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="7" className="drawing-hatch" />
          </pattern>
        </defs>

        {/* Load-path levels: every member sits on the level above the highest member it rests on. */}
        <g aria-hidden="true">
          {Array.from({ length: levels + 1 }, (_, level) => {
            const y = frame.ground - level * frame.step;
            return (
              <g key={level}>
                <line x1={28} x2={frame.width - 8} y1={y} y2={y} className="drawing-level" />
                <text
                  x={0}
                  y={y + levelUnits * 0.34}
                  className="drawing-level-label"
                  style={{ fontSize: levelUnits }}
                >
                  {level === 0 ? "±0" : `+${level}`}
                </text>
              </g>
            );
          })}
          <line x1={28} x2={frame.width - 8} y1={groundY} y2={groundY} className="drawing-ground" />
          <rect
            x={28}
            y={groundY}
            width={frame.width - 36}
            height={10}
            fill={`url(#${hatchId})`}
            opacity={0.7}
          />
        </g>

        <g aria-hidden="true">
          {edges.map((edge) => {
            const from = members.find((m) => m.id === edge.source)!;
            const to = members.find((m) => m.id === edge.target)!;
            const key = `${edge.source}>${edge.target}`;
            return (
              <line
                key={key}
                ref={(el) => {
                  if (el) edgeRefs.current.set(key, el);
                  else edgeRefs.current.delete(key);
                }}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeWidth={strokeWidth(edge.load)}
                className="drawing-edge"
                data-relation={edgeRelation(edge)}
                data-load={edge.load}
              />
            );
          })}
        </g>

        <g>
          {order.map((member) => {
            const r = radius(member.load);
            const foundation = member.level === 0;
            return (
              <g
                key={member.id}
                ref={(el) => {
                  if (el) memberRefs.current.set(member.id, el);
                  else memberRefs.current.delete(member.id);
                }}
                transform={`translate(${member.x} ${member.y})`}
                className="drawing-member"
                data-relation={memberRelation(member.id)}
                {...(interactive
                  ? {
                      role: "radio",
                      tabIndex: member.id === tabStop ? 0 : -1,
                      "aria-checked": selected === member.id,
                      "aria-label": member.description,
                      onPointerEnter: (event: React.PointerEvent<SVGGElement>) => {
                        if (event.pointerType !== "touch") setPreview(member.id);
                      },
                      onFocus: () => setFocused(member.id),
                      onClick: () => select(member.id),
                      onKeyDown: (event: React.KeyboardEvent<SVGGElement>) =>
                        onMemberKeyDown(event, member),
                    }
                  : { "aria-hidden": true })}
              >
                {interactive && member.detail !== undefined && <desc>{member.detail}</desc>}
                {foundation && (
                  <path
                    d={`M 0 ${r * 0.4} L ${-8} ${SUPPORT} L ${8} ${SUPPORT} Z`}
                    className="drawing-support"
                    aria-hidden="true"
                  />
                )}
                <circle r={Math.max(r + 9, touchUnits)} className="drawing-hit" />
                {interactive && (
                  <circle
                    r={r + 4.5 * scale}
                    className="drawing-focus"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle r={r} className="drawing-joint" />
                <MemberLabel member={member} radius={r} size={labelUnits} />
              </g>
            );
          })}
        </g>
      </svg>

      {renderCard !== undefined && (
        <div className="drawing-card">{tested === null ? idleCard : renderCard(tested)}</div>
      )}
    </figure>
  );
}

const NAVIGATION_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"]);

function MemberLabel({
  member,
  radius,
  size,
}: {
  member: DrawingMember;
  radius: number;
  size: number;
}) {
  const gap = 7;
  const props =
    member.side === "right"
      ? { x: radius + gap, y: size * 0.34, textAnchor: "start" as const }
      : member.side === "left"
        ? { x: -radius - gap, y: size * 0.34, textAnchor: "end" as const }
        : member.side === "above"
          ? { x: 0, y: -radius - gap, textAnchor: "middle" as const }
          : { x: 0, y: radius + gap + size + SUPPORT - 2, textAnchor: "middle" as const };
  return (
    <text {...props} className="drawing-label" style={{ fontSize: size }}>
      {member.label}
    </text>
  );
}

/**
 * Drawing units per CSS pixel at the drawing's rendered width (1 until measured, as on the server), so text
 * and touch targets can keep a fixed on-screen size however small the drawing is drawn.
 */
function useDrawingScale(svgRef: React.RefObject<SVGSVGElement | null>, width: number): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const measure = () => {
      const rendered = svg.getBoundingClientRect().width;
      // A drawing hidden at this breakpoint has no width; keep the last scale.
      if (rendered > 0) setScale(Math.round((width / rendered) * 100) / 100);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef, width]);
  return scale;
}

function useCoarsePointer(enabled: boolean): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const query = window.matchMedia("(any-pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [enabled]);
  return coarse;
}

/**
 * The signature motion: members start scattered and settle under a damped spring onto their load-path level,
 * foundations first; each dependency appears once its dependent has landed on its support. Skipped entirely
 * (final drawing at once) under prefers-reduced-motion. The server-rendered drawing is already the final state.
 */
function useSettle(
  figureRef: React.RefObject<HTMLElement | null>,
  members: readonly DrawingMember[],
  edges: readonly DrawingEdge[],
  memberRefs: React.RefObject<Map<string, SVGGElement>>,
  edgeRefs: React.RefObject<Map<string, SVGLineElement>>,
  strokeWidth: (load: number) => number,
  enabled: boolean,
) {
  useEffect(() => {
    const figure = figureRef.current;
    if (figure === null || !enabled) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      figure.dataset.settle = "done";
      return;
    }
    // If hydration came so late that the CSS failsafe already showed the finished drawing, never scatter it again.
    const failsafe = memberRefs.current
      .values()
      .next()
      .value?.getAnimations()
      .find(
        (animation) =>
          animation instanceof CSSAnimation && animation.animationName === "drawing-failsafe",
      );
    if (failsafe?.playState === "finished") {
      figure.dataset.settle = "done";
      return;
    }

    // Deterministic scatter: the same chaos every visit.
    const hash = (text: string, salt: number) => {
      let h = 2166136261 ^ salt;
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
      return ((h >>> 0) % 10000) / 10000;
    };
    const width = Math.max(...members.map((m) => m.x)) + 60;
    const floor = Math.max(...members.map((m) => m.y));
    const state = new Map(
      members.map((m) => {
        // Spread across the whole sheet: chaos, not a pile at the top edge.
        const x = 40 + hash(m.id, 1) * (width - 80);
        const y = 30 + hash(m.id, 2) * (floor - 70);
        return [
          m.id,
          { x, y, vx: 0, vy: 0, start: m.level * 90 + hash(m.id, 3) * 60, landed: -1, target: m },
        ];
      }),
    );

    const place = (id: string, x: number, y: number) => {
      memberRefs.current
        .get(id)
        ?.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    };
    for (const [id, s] of state) place(id, s.x, s.y);
    for (const line of edgeRefs.current.values()) {
      line.style.opacity = "0";
    }
    figure.dataset.settle = "running";

    let frame = 0;
    let begin = -1;
    let previous = -1;
    const omega = 2 * Math.PI * 2;
    const zeta = 0.62;

    const tick = (now: number) => {
      if (begin < 0) {
        begin = now;
        previous = now;
      }
      const t = now - begin;
      let dt = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      let moving = false;

      // Fixed sub-steps keep the spring stable on slow frames.
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        dt -= h;
        for (const s of state.values()) {
          if (t < s.start || s.landed >= 0) continue;
          const ax = -omega * omega * (s.x - s.target.x) - 2 * zeta * omega * s.vx;
          const ay = -omega * omega * (s.y - s.target.y) - 2 * zeta * omega * s.vy;
          s.vx += ax * h;
          s.vy += ay * h;
          s.x += s.vx * h;
          s.y += s.vy * h;
        }
      }

      for (const [id, s] of state) {
        if (s.landed < 0) {
          const settled =
            t >= s.start &&
            Math.hypot(s.x - s.target.x, s.y - s.target.y) < 1.2 &&
            Math.hypot(s.vx, s.vy) < 14;
          if (settled) {
            s.landed = t;
            s.x = s.target.x;
            s.y = s.target.y;
          } else {
            moving = true;
          }
        }
        place(id, s.x, s.y);
      }

      for (const edge of edges) {
        const line = edgeRefs.current.get(`${edge.source}>${edge.target}`);
        const a = state.get(edge.source);
        const b = state.get(edge.target);
        if (line === undefined || a === undefined || b === undefined) continue;
        line.setAttribute("x1", a.x.toFixed(2));
        line.setAttribute("y1", a.y.toFixed(2));
        line.setAttribute("x2", b.x.toFixed(2));
        line.setAttribute("y2", b.y.toFixed(2));
        const connected = a.landed >= 0 && b.landed >= 0 ? Math.max(a.landed, b.landed) : -1;
        const progress = connected < 0 ? 0 : Math.min(1, (t - connected) / 260);
        const eased = 1 - Math.pow(1 - progress, 3);
        line.style.opacity = eased.toFixed(3);
        line.setAttribute(
          "stroke-width",
          (0.5 + (strokeWidth(edge.load) - 0.5) * eased).toFixed(2),
        );
        if (progress < 1) moving = true;
      }

      if (moving) {
        frame = requestAnimationFrame(tick);
      } else {
        for (const line of edgeRefs.current.values()) line.style.removeProperty("opacity");
        figure.dataset.settle = "done";
      }
    };

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          start();
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(figure);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const s of state.values()) place(s.target.id, s.target.x, s.target.y);
      for (const edge of edges) {
        const line = edgeRefs.current.get(`${edge.source}>${edge.target}`);
        if (line === undefined) continue;
        line.style.removeProperty("opacity");
        line.setAttribute("stroke-width", strokeWidth(edge.load).toFixed(2));
      }
      figure.dataset.settle = "done";
    };
  }, [figureRef, members, edges, memberRefs, edgeRefs, strokeWidth, enabled]);
}
