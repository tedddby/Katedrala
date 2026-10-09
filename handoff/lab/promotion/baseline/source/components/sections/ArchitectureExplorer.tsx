"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  BAYS,
  EDGE_KINDS,
  edgeControl,
  MEMBER_JOINT_RADIUS,
  MODULE_JOINTS,
  MODULE_NAME_GAP,
  PLAN,
  PLAN_EDGES,
  PLAN_HEIGHT,
  PLAN_MEMBERS,
  PLAN_MODULE_EDGES,
} from "@/lib/demo/plan";
import { measurementOf, moduleMeasurementOf } from "@/lib/demo/metrics";
import { moduleName, type DemoEdgeKind, type ModuleId } from "@/lib/demo/system";
import { counted, listed } from "@/lib/text";

type Mode = "members" | "modules";
type ItemState = "rest" | "selected" | "dependency" | "dependent" | "dim";
interface Point {
  readonly x: number;
  readonly y: number;
}
interface Box extends Point {
  readonly width: number;
  readonly height: number;
}
interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}
interface Item extends Point {
  readonly id: string;
}
type Gesture =
  | {
      readonly kind: "press" | "pan";
      readonly id: number;
      readonly start: Point;
      readonly view: View;
    }
  | { readonly kind: "pinch"; readonly distance: number; readonly mid: Point; readonly view: View };

const MODES: readonly Mode[] = ["members", "modules"];
/** How far the plan magnifies, relative to the scale it opens at. */
const MAX_ZOOM = 3.2;
const ZOOM_STEP = 1.25;
/** Plan text never renders smaller than this, in CSS pixels. */
const LABEL_FLOOR = 11;
/**
 * The largest member name, in plan units, that still fits inside its bay (the plan's bays are sized for it) and
 * clears its neighbors, which sit 168 units apart.
 */
const MEMBER_LABEL_MAX = 18;
/** A pointer that moves this far, in CSS pixels, pans the plan instead of pressing what it started on. */
const PAN_THRESHOLD = 6;
/** Every member and module answers a press within this radius of its joint, in CSS pixels: a 44px target. */
const TARGET_RADIUS = 22;
/** Space kept between a focused item and the sheet's edge when the plan pans to show it, in CSS pixels. */
const REVEAL_MARGIN = 12;
/** Space between a joint and the end of every dependency that meets it, in CSS pixels. */
const EDGE_GAP = 6;

const memberById = new Map(PLAN_MEMBERS.map((m) => [m.id, m]));
const jointById = new Map(MODULE_JOINTS.map((j) => [j.id, j]));
const crossingCount = PLAN_EDGES.filter((e) => e.crossing).length;

/** Plan items in reading order: row by row, left to right. */
const readingOrder = (a: Item, b: Item) => a.y - b.y || a.x - b.x;
const MEMBER_ORDER: readonly Item[] = [...PLAN_MEMBERS].sort(readingOrder);
const MODULE_ORDER: readonly Item[] = [...MODULE_JOINTS].sort(readingOrder);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The scale a mode opens at, for a sheet `k` CSS pixels per plan unit wide. The whole plan fits unless member
 * names would have to outgrow their spacing to stay legible, as on a phone; then the member plan opens magnified
 * to the sheet's width and the sheet grows to its height, so it pans sideways only.
 */
function fitScale(mode: Mode, k: number): number {
  return mode === "members" ? Math.max(1, LABEL_FLOOR / (MEMBER_LABEL_MAX * k)) : 1;
}

/** The sheet's height in plan units: the whole height of the plan at the scale it opens at. */
const sheetHeight = (fit: number) => PLAN_HEIGHT * fit;

/** Keeps the plan covering the sheet: it can be magnified and moved, never pushed out of view. */
function bound(view: View, fit: number): View {
  const scale = clamp(view.scale, fit, fit * MAX_ZOOM);
  return {
    scale,
    x: clamp(view.x, PLAN.width * (1 - scale), 0),
    y: clamp(view.y, sheetHeight(fit) - PLAN_HEIGHT * scale, 0),
  };
}

/** The view a mode opens at: the whole plan, or the magnified plan centered on `focus` (its middle without one). */
function fitView(fit: number, focus?: Point): View {
  return bound({ scale: fit, x: PLAN.width / 2 - (focus?.x ?? PLAN.width / 2) * fit, y: 0 }, fit);
}

/**
 * Keyboard movement through the plan's items: Left and Right step through reading order and wrap, Up and Down
 * move to the nearest item in the row above or below, Home and End go to the first and last.
 */
function neighbor(items: readonly Item[], id: string, key: string): Item | undefined {
  const index = items.findIndex((item) => item.id === id);
  const current = items[index];
  if (current === undefined) return undefined;
  if (key === "ArrowRight") return items[(index + 1) % items.length];
  if (key === "ArrowLeft") return items[(index - 1 + items.length) % items.length];
  if (key === "Home") return items[0];
  if (key === "End") return items[items.length - 1];
  if (key !== "ArrowDown" && key !== "ArrowUp") return undefined;
  const rows = [...new Set(items.map((item) => item.y))].sort((a, b) => a - b);
  const row = rows[rows.indexOf(current.y) + (key === "ArrowDown" ? 1 : -1)];
  if (row === undefined) return undefined;
  return items
    .filter((item) => item.y === row)
    .reduce((best, item) =>
      Math.abs(item.x - current.x) < Math.abs(best.x - current.x) ? item : best,
    );
}

const NAVIGATION_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]);

export function ArchitectureExplorer() {
  const [mode, setMode] = useState<Mode>("members");
  const [kinds, setKinds] = useState<ReadonlySet<DemoEdgeKind>>(
    () => new Set(EDGE_KINDS.map((k) => k.kind)),
  );
  /** The selected member (member scale) or module (module scale). */
  const [selected, setSelected] = useState<string | null>(null);
  /** The item that holds the plan's one Tab stop. */
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  /** Set while input arrives faster than a transition could follow: wheel zoom and held keys. */
  const [instant, setInstant] = useState(false);
  /** CSS pixels per plan unit at the sheet's current width. */
  const [k, setK] = useState(1);

  const sheetRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const instantTimer = useRef<number | undefined>(undefined);
  const keysId = useId();

  const fit = fitScale(mode, k);
  const height = sheetHeight(fit);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const viewRef = useRef(view);
  viewRef.current = view;
  // Plan units per CSS pixel where each scale opens: labels and targets are sized in these to stay legible.
  const memberUnit = 1 / (k * fitScale("members", k));
  const moduleUnit = 1 / k;

  const items = mode === "members" ? MEMBER_ORDER : MODULE_ORDER;
  const activeId =
    active !== null && items.some((item) => item.id === active)
      ? active
      : (items.find((item) => item.id === selected) ?? items[0]!).id;

  const goInstant = useCallback(() => {
    setInstant(true);
    window.clearTimeout(instantTimer.current);
    instantTimer.current = window.setTimeout(() => setInstant(false), 160);
  }, []);
  useEffect(() => () => window.clearTimeout(instantTimer.current), []);

  // The sheet's width sets the label scale. On a phone the member plan cannot be read whole, so the plan opens at
  // module scale; members stay one tap away, magnified.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet === null) return;
    let first = true;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width === 0) return;
      const next = width / PLAN.width;
      setK(next);
      if (first) {
        first = false;
        if (fitScale("members", next) > 1) setMode("modules");
      }
    });
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);

  // A new sheet width can change the scale a mode opens at. The view keeps its zoom relative to that scale and the
  // plan point at the middle of the sheet, so a plan that fitted still fits. A change of mode sets its own view.
  // The view follows before the next paint and without a transition: a resize is not a gesture to animate, and
  // no frame may show the old view at the new scale.
  const fitBefore = useRef({ mode, fit });
  useLayoutEffect(() => {
    const before = fitBefore.current;
    fitBefore.current = { mode, fit };
    if (before.mode !== mode || before.fit === fit) return;
    goInstant();
    setView((v) => {
      const scale = (v.scale / before.fit) * fit;
      const cx = (PLAN.width / 2 - v.x) / v.scale;
      const cy = (sheetHeight(before.fit) / 2 - v.y) / v.scale;
      return bound(
        { scale, x: PLAN.width / 2 - cx * scale, y: sheetHeight(fit) / 2 - cy * scale },
        fit,
      );
    });
  }, [mode, fit, goInstant]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const f = fitRef.current;
      const x = cx ?? PLAN.width / 2;
      const y = cy ?? sheetHeight(f) / 2;
      const scale = clamp(v.scale * factor, f, f * MAX_ZOOM);
      const r = scale / v.scale;
      return bound({ scale, x: x - (x - v.x) * r, y: y - (y - v.y) * r }, f);
    });
  }, []);

  /** Pans just far enough to bring an item, label included, into view clear of the sheet's edges. */
  const reveal = useCallback(
    (at: Point, box: Box) => {
      setView((v) => {
        const f = fitRef.current;
        const margin = REVEAL_MARGIN / k;
        const span = (start: number, size: number, offset: number, extent: number) => {
          const from = offset + start * v.scale;
          const to = from + size * v.scale;
          if (to - from > extent - 2 * margin) return extent / 2 - (from + to) / 2;
          if (from < margin) return margin - from;
          if (to > extent - margin) return extent - margin - to;
          return 0;
        };
        const dx = span(at.x + box.x, box.width, v.x, PLAN.width);
        const dy = span(at.y + box.y, box.height, v.y, sheetHeight(f));
        return dx === 0 && dy === 0 ? v : bound({ ...v, x: v.x + dx, y: v.y + dy }, f);
      });
    },
    [k],
  );

  // Plain scrolling keeps scrolling the page; Ctrl or Cmd turns the wheel into zoom, applied as it arrives. A
  // native, non-passive listener is needed so the browser does not also zoom the whole page.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * PLAN.width;
      const y = ((event.clientY - rect.top) / rect.height) * sheetHeight(fitRef.current);
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      goInstant();
      zoomAt(Math.exp(-delta * 0.0015), x, y);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt, goInstant]);

  const changeMode = (next: Mode) => {
    if (next === mode) return;
    const nextFit = fitScale(next, k);
    if (next === "modules") {
      // The selection carries over: a selected member's module stays selected.
      const module = selected === null ? null : (memberById.get(selected)?.module ?? null);
      setSelected(module);
      setActive(module);
      setView(fitView(nextFit));
    } else {
      // Opening member scale from a selected module starts at that module's members.
      const bay = BAYS.find((b) => b.id === selected);
      setSelected(null);
      setActive(bay === undefined ? null : (bayFirstMember(bay.id) ?? null));
      setView(
        fitView(
          nextFit,
          bay === undefined ? undefined : { x: bay.x + bay.width / 2, y: bay.y + bay.height / 2 },
        ),
      );
    }
    setMode(next);
  };

  const toggleKind = (kind: DemoEdgeKind) =>
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  const related = useMemo(() => {
    if (selected === null) return null;
    if (mode === "members") {
      const shown = PLAN_EDGES.filter((e) => kinds.has(e.kind));
      return {
        out: new Set(shown.filter((e) => e.source === selected).map((e) => e.target)),
        inn: new Set(shown.filter((e) => e.target === selected).map((e) => e.source)),
      };
    }
    return {
      out: new Set<string>(
        PLAN_MODULE_EDGES.filter((e) => e.source === selected).map((e) => e.target),
      ),
      inn: new Set<string>(
        PLAN_MODULE_EDGES.filter((e) => e.target === selected).map((e) => e.source),
      ),
    };
  }, [selected, mode, kinds]);

  const stateOf = (id: string): ItemState => {
    if (related === null) return "rest";
    if (id === selected) return "selected";
    if (related.out.has(id)) return "dependency";
    if (related.inn.has(id)) return "dependent";
    return "dim";
  };
  const edgeStateOf = (source: string, target: string): ItemState => {
    if (related === null) return "rest";
    if (source === selected) return "dependency";
    if (target === selected) return "dependent";
    return "dim";
  };

  // Pointer input: one pointer presses or pans, two pinch. Panning and pinching apply as they move.
  const toSheet = (client: Point): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((client.x - rect.left) / rect.width) * PLAN.width,
      y: ((client.y - rect.top) / rect.height) * sheetHeight(fitRef.current),
    };
  };
  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (a === undefined || b === undefined) return;
    for (const id of pointers.current.keys()) svgRef.current?.setPointerCapture(id);
    gesture.current = {
      kind: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: toSheet({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
      view: viewRef.current,
    };
    suppressClick.current = true;
    setDragging(true);
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse") {
      if (event.button !== 0) return;
      // There is only one mouse: a press it never released over the plan is over.
      pointers.current.clear();
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      suppressClick.current = false;
      gesture.current = {
        kind: "press",
        id: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        view: viewRef.current,
      };
    } else if (pointers.current.size === 2) {
      startPinch();
    }
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    const svg = svgRef.current;
    if (g === null || svg === null) return;
    const f = fitRef.current;
    if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (a === undefined || b === undefined) return;
      const scale = clamp(
        (g.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(g.distance, 1),
        f,
        f * MAX_ZOOM,
      );
      // The plan point under the fingers' starting midpoint follows their midpoint.
      const mid = toSheet({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const px = (g.mid.x - g.view.x) / g.view.scale;
      const py = (g.mid.y - g.view.y) / g.view.scale;
      setView(bound({ scale, x: mid.x - px * scale, y: mid.y - py * scale }, f));
      return;
    }
    if (g.id !== event.pointerId) return;
    if (
      g.kind === "press" &&
      Math.hypot(event.clientX - g.start.x, event.clientY - g.start.y) < PAN_THRESHOLD
    )
      return;
    if (g.kind === "press") {
      gesture.current = { ...g, kind: "pan" };
      svg.setPointerCapture(event.pointerId);
      suppressClick.current = true;
      setDragging(true);
    }
    const rect = svg.getBoundingClientRect();
    setView(
      bound(
        {
          ...g.view,
          x: g.view.x + ((event.clientX - g.start.x) / rect.width) * PLAN.width,
          y: g.view.y + ((event.clientY - g.start.y) / rect.height) * sheetHeight(f),
        },
        f,
      ),
    );
  };
  const onPointerEnd = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    const g = gesture.current;
    if (g?.kind === "pinch") {
      // One finger stays down: carry on as a pan from where it is.
      const [rest] = [...pointers.current.entries()];
      gesture.current =
        rest === undefined
          ? null
          : {
              kind: "pan",
              id: rest[0],
              start: { x: rest[1].x, y: rest[1].y },
              view: viewRef.current,
            };
    } else if (g !== null && g.id === event.pointerId) {
      // A tap on empty paper clears the selection.
      if (
        g.kind === "press" &&
        event.type === "pointerup" &&
        !(event.target as Element).closest(".plan-member, .plan-module")
      )
        setSelected(null);
      gesture.current = null;
    }
    if (pointers.current.size === 0) setDragging(false);
  };

  const select = (id: string) => {
    if (!suppressClick.current) setSelected(id);
  };

  const onItemKeyDown = (event: KeyboardEvent<SVGGElement>, id: string, at: Point) => {
    if (event.repeat) goInstant();
    const onSheet = () => ({
      x: viewRef.current.x + at.x * viewRef.current.scale,
      y: viewRef.current.y + at.y * viewRef.current.scale,
    });
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(id);
    } else if (event.key === "Escape") {
      if (selected === null) return;
      event.preventDefault();
      setSelected(null);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      const p = onSheet();
      zoomAt(ZOOM_STEP, p.x, p.y);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      const p = onSheet();
      zoomAt(1 / ZOOM_STEP, p.x, p.y);
    } else if (event.key === "0") {
      event.preventDefault();
      setView(fitView(fit, at));
    } else if (NAVIGATION_KEYS.has(event.key)) {
      // A radio group: moving to an item selects it.
      event.preventDefault();
      const next = neighbor(items, id, event.key);
      if (next === undefined) return;
      setSelected(next.id);
      svgRef.current?.querySelector<SVGGElement>(`[data-id="${next.id}"]`)?.focus();
    }
  };
  const itemProps = (id: string, at: Point, label: string, hidden: boolean) => ({
    "data-id": id,
    role: "radio",
    tabIndex: !hidden && id === activeId ? 0 : -1,
    "aria-hidden": hidden,
    "aria-checked": selected === id,
    "aria-label": label,
    onClick: () => select(id),
    onKeyDown: (event: KeyboardEvent<SVGGElement>) => onItemKeyDown(event, id, at),
    onFocus: (event: FocusEvent<SVGGElement>) => {
      setActive(id);
      // Keyboard focus may land outside the magnified view, so the plan follows it. A press already shows
      // what it lands on, and panning under it would fight a drag that starts there.
      if (event.currentTarget.matches(":focus-visible")) reveal(at, event.currentTarget.getBBox());
    },
  });

  const home = fitView(fit);
  const atHome =
    Math.abs(view.scale - home.scale) < 0.001 &&
    Math.abs(view.x - home.x) < 0.5 &&
    Math.abs(view.y - home.y) < 0.5;
  const atMax = view.scale >= fit * MAX_ZOOM - 0.001;
  const atFit = view.scale <= fit + 0.001;
  // Sideways the plan pans once it is wider than the sheet; up and down only once it is magnified past the
  // scale it opens at. Until then a vertical swipe scrolls the page.
  const pannable = view.scale > 1.001 || !atFit;
  const memberHit = Math.max(16, TARGET_RADIUS * memberUnit);
  const moduleHit = (radius: number) => Math.max(radius + 6, TARGET_RADIUS * moduleUnit);

  return (
    <div className="grid-12 gap-y-6">
      <div className="explorer col-span-12 lg:col-span-9">
        <div className="explorer-toolbar">
          <div
            role="radiogroup"
            aria-label="Scale"
            className="segmented"
            onKeyDown={(event) => {
              const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
              if (step === undefined) return;
              event.preventDefault();
              const next = MODES[(MODES.indexOf(mode) + step + MODES.length) % MODES.length]!;
              changeMode(next);
              event.currentTarget
                .querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)
                ?.focus();
            }}
          >
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                data-mode={m}
                aria-checked={mode === m}
                tabIndex={mode === m ? 0 : -1}
                onClick={() => changeMode(m)}
              >
                {m === "members" ? "Members" : "Modules"}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Zoom" className="ml-auto flex gap-1">
            <button
              type="button"
              className="zoom-button"
              aria-label="Zoom in"
              aria-disabled={atMax}
              onClick={() => zoomAt(ZOOM_STEP)}
            >
              +
            </button>
            <button
              type="button"
              className="zoom-button"
              aria-label="Zoom out"
              aria-disabled={atFit}
              onClick={() => zoomAt(1 / ZOOM_STEP)}
            >
              −
            </button>
            <button
              type="button"
              className="zoom-button px-3"
              aria-label="Fit the plan"
              aria-disabled={atHome}
              onClick={() => setView(home)}
            >
              Fit
            </button>
          </div>
        </div>

        <div ref={sheetRef} className="explorer-sheet">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${PLAN.width} ${height}`}
            className={`block h-auto w-full select-none ${atFit ? "touch-pan-y" : "touch-none"} ${pannable ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
            style={{ "--member-unit": memberUnit, "--module-unit": moduleUnit } as CSSProperties}
            role="radiogroup"
            aria-label={`Architecture plan of the demonstration system, by ${mode === "members" ? "member" : "module"}`}
            aria-describedby={keysId}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerLeave={(event) => {
              // A mouse press that leaves the plan without panning ends there; a pan keeps its capture.
              if (
                event.pointerType === "mouse" &&
                !event.currentTarget.hasPointerCapture(event.pointerId)
              )
                onPointerEnd(event);
            }}
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
              {(["rest", "dependency", "dependent"] as const).map((state) => (
                <marker
                  key={`module-${state}`}
                  id={`arrow-module-${state}`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="3.6"
                  markerHeight="3.6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M0.5 1 7 4 0.5 7"
                    fill="none"
                    className={`plan-arrow plan-arrow-${state}`}
                    strokeWidth="1.6"
                  />
                </marker>
              ))}
            </defs>
            <g
              className={`plan-content ${dragging || instant ? "" : "is-animated"}`}
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            >
              <g aria-hidden="true">
                {BAYS.map((bay) => (
                  <g key={bay.id} className="plan-bay" data-mode={mode}>
                    <rect x={bay.x} y={bay.y} width={bay.width} height={bay.height} />
                  </g>
                ))}

                <g className="plan-edges" data-visible={mode === "members"}>
                  {PLAN_EDGES.map((edge) => {
                    const a = memberById.get(edge.source)!;
                    const b = memberById.get(edge.target)!;
                    const state =
                      mode === "members" ? edgeStateOf(edge.source, edge.target) : "rest";
                    return (
                      <path
                        key={`${edge.source}>${edge.target}`}
                        d={edgePath(a, b, edge.bend, MEMBER_JOINT_RADIUS + EDGE_GAP * memberUnit)}
                        className={`plan-edge kind-${edge.kind}`}
                        data-state={state}
                        data-filtered={!kinds.has(edge.kind)}
                        markerEnd={`url(#arrow-${state === "dim" ? "rest" : state})`}
                      />
                    );
                  })}
                </g>

                <g className="plan-edges" data-visible={mode === "modules"}>
                  {PLAN_MODULE_EDGES.map((edge) => {
                    const a = jointById.get(edge.source)!;
                    const b = jointById.get(edge.target)!;
                    const state =
                      mode === "modules" ? edgeStateOf(edge.source, edge.target) : "rest";
                    const gap = EDGE_GAP * moduleUnit;
                    const { x1, y1, x2, y2 } = trim(a, b, a.radius + gap, b.radius + gap);
                    return (
                      <g key={`${edge.source}>${edge.target}`}>
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          className="plan-edge plan-module-edge"
                          data-state={state}
                          style={{ "--count": edge.count } as CSSProperties}
                          markerEnd={`url(#arrow-module-${state === "dim" ? "rest" : state})`}
                        />
                        {/* The count is set in a break of its own line, as a dimension is. */}
                        {edge.count > 1 && (
                          <text
                            x={a.x + (b.x - a.x) * edge.countAt}
                            y={a.y + (b.y - a.y) * edge.countAt}
                            dy="0.36em"
                            textAnchor="middle"
                            className="plan-count"
                            data-state={state}
                          >
                            {edge.count}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/*
                 * Bay names sit in the top corner of their bay that the plan's lines leave clear, and above the
                 * edges, so a line that still meets a name passes behind its halo.
                 */}
                {BAYS.map((bay) => (
                  <g key={`label-${bay.id}`} className="plan-bay" data-mode={mode}>
                    <text
                      x={
                        bay.label === "start"
                          ? bay.x + PLAN.labelInset
                          : bay.x + bay.width - PLAN.labelInset
                      }
                      y={bay.y + PLAN.labelTop}
                      dy="0.8em"
                      textAnchor={bay.label}
                      className="plan-bay-label"
                    >
                      {bay.name}
                    </text>
                  </g>
                ))}
              </g>

              {PLAN_MEMBERS.map((member) => {
                const collapsed = mode === "modules";
                const at = collapsed ? jointById.get(member.module)! : member;
                return (
                  <g
                    key={member.id}
                    className="plan-member"
                    data-state={collapsed ? "rest" : stateOf(member.id)}
                    data-collapsed={collapsed}
                    style={{
                      transform: `translate(${at.x.toFixed(2)}px, ${at.y.toFixed(2)}px)`,
                    }}
                    {...itemProps(
                      member.id,
                      member,
                      `${member.id}, ${moduleName(member.module)} module`,
                      collapsed,
                    )}
                  >
                    <desc>{describeMember(member.id)}</desc>
                    <circle r={memberHit} className="plan-hit" />
                    <circle r={MEMBER_JOINT_RADIUS + 4 * memberUnit} className="plan-ring" />
                    <circle r={MEMBER_JOINT_RADIUS} className="plan-joint" />
                    <text y="12.5" dy="0.72em" textAnchor="middle" className="plan-label">
                      {member.id}
                    </text>
                  </g>
                );
              })}

              {MODULE_JOINTS.map((joint) => {
                const shown = mode === "modules";
                return (
                  <g
                    key={`m-${joint.id}`}
                    className="plan-module"
                    data-visible={shown}
                    data-state={shown ? stateOf(joint.id) : "rest"}
                    style={{ transform: `translate(${joint.x}px, ${joint.y}px)` }}
                    {...itemProps(
                      joint.id,
                      joint,
                      `${joint.name} module, ${counted(memberCount(joint.id), "member")}`,
                      !shown,
                    )}
                  >
                    <desc>{describeModule(joint.id)}</desc>
                    <circle r={moduleHit(joint.radius)} className="plan-hit" />
                    <circle r={joint.radius + 4 * moduleUnit} className="plan-ring" />
                    <circle r={joint.radius} className="plan-joint" />
                    <text
                      x={joint.side * joint.radius}
                      dx={`${joint.side * MODULE_NAME_GAP}em`}
                      dy="0.34em"
                      textAnchor={joint.side < 0 ? "end" : "start"}
                      className="plan-label"
                    >
                      {joint.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {mode === "members" && (
          <div role="group" aria-label="Relationship kinds" className="explorer-legend">
            {EDGE_KINDS.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                className="kind-toggle"
                aria-pressed={kinds.has(kind)}
                onClick={() => toggleKind(kind)}
              >
                <svg aria-hidden="true" viewBox="0 0 28 8" className="h-2 w-7">
                  <line x1="1" y1="4" x2="27" y2="4" className={`plan-edge-sample kind-${kind}`} />
                </svg>
                {label}
              </button>
            ))}
          </div>
        )}
        <p className="footnote mt-3">
          <span className="hint-pointer hint-mouse">
            Hold Ctrl or Cmd and scroll to zoom, then drag to pan.
          </span>
          <span className="hint-pointer hint-touch">
            Pinch or use + and − to zoom, then drag to pan.
          </span>
          <span id={keysId} className="hint-keyboard">
            {`Arrow keys select ${mode}, + and − zoom, 0 fits, Escape clears.`}
          </span>{" "}
          Demonstration system.
        </p>
      </div>

      <aside className="col-span-12 lg:col-span-3">
        {selected === null ? (
          <Summary mode={mode} />
        ) : mode === "members" ? (
          <MemberDetail id={selected} />
        ) : (
          <ModuleDetail id={selected as ModuleId} />
        )}
      </aside>
    </div>
  );
}

/**
 * A member dependency from joint to joint, stopping `gap` units short of each: straight, or a quadratic curve
 * where the plan bends it around another member.
 */
function edgePath(a: Point, b: Point, bend: number, gap: number): string {
  if (bend === 0) {
    const { x1, y1, x2, y2 } = trim(a, b, gap);
    return `M${x1} ${y1}L${x2} ${y2}`;
  }
  const c = edgeControl(a, b, bend);
  const start = trim(a, c, gap);
  const end = trim(c, b, gap);
  return `M${start.x1} ${start.y1}Q${c.x} ${c.y} ${end.x2} ${end.y2}`;
}

/** The segment from `a` to `b`, starting `start` units after `a` and ending `end` units before `b`. */
function trim(a: Point, b: Point, start: number, end = start) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  return { x1: a.x + ux * start, y1: a.y + uy * start, x2: b.x - ux * end, y2: b.y - uy * end };
}

function memberCount(id: ModuleId): number {
  return PLAN_MEMBERS.filter((m) => m.module === id).length;
}

function bayFirstMember(id: ModuleId): string | undefined {
  return MEMBER_ORDER.find((item) => memberById.get(item.id)?.module === id)?.id;
}

/** What a screen reader adds to a member's name when it is focused: its dependencies, both ways. */
function describeMember(id: string): string {
  const out = PLAN_EDGES.filter((e) => e.source === id).map((e) => e.target);
  const inn = PLAN_EDGES.filter((e) => e.target === id).map((e) => e.source);
  return `Depends on ${listed(out) || "nothing inside the system"}. ${inn.length === 0 ? "Nothing depends on it." : `Depended on by ${listed(inn)}.`}`;
}

function describeModule(id: ModuleId): string {
  const m = moduleMeasurementOf(id);
  const names = (ids: readonly ModuleId[]) => listed(ids.map((d) => moduleName(d)));
  return `Members: ${listed(m.members)}. Depends on ${names(m.dependsOn) || "no other module"}. ${m.dependedOnBy.length === 0 ? "No module depends on it." : `Depended on by ${names(m.dependedOnBy)}.`}`;
}

function Summary({ mode }: { mode: Mode }) {
  return (
    <div className="member-card">
      <p className="text-[0.9375rem] font-semibold text-ink">
        {mode === "members"
          ? `${counted(PLAN_MEMBERS.length, "member")}, ${counted(BAYS.length, "module")}`
          : counted(BAYS.length, "module")}
      </p>
      <p className="mt-2 max-w-[60ch] text-[0.8125rem] leading-relaxed text-ink-soft">
        {mode === "members"
          ? `${counted(PLAN_EDGES.length, "dependency", "dependencies")}, ${crossingCount} of them across a module boundary. Select a member to see what it depends on and what depends on it.`
          : `${counted(PLAN_MODULE_EDGES.length, "dependency", "dependencies")} between modules. Line weight and the numbers show how many member dependencies each one aggregates. Select a module to see its members.`}
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
                    <span className="text-ink-faint">
                      {e.kind === "accesses-data" ? "accesses data in" : e.kind}
                    </span>{" "}
                    {e.target}
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

/**
 * The scroller around the explorer's table alternative. Where the table is wider than its column (phones), it is
 * a named region the keyboard can reach and scroll; where the table fits, it takes no Tab stop. Focusable until
 * measured, so the table stays reachable without JavaScript.
 */
export function TableScroller({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(true);
  useEffect(() => {
    const scroller = ref.current;
    if (scroller === null) return;
    const update = () => setScrolls(scroller.scrollWidth - scroller.clientWidth > 1);
    update();
    // A closed table alternative has no size; opening it resizes the scroller, which measures it again.
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="mt-4 overflow-x-auto"
      {...(scrolls ? { tabIndex: 0, role: "region", "aria-label": label } : {})}
    >
      {children}
    </div>
  );
}

function ModuleDetail({ id }: { id: ModuleId }) {
  const m = moduleMeasurementOf(id);
  return (
    <div className="member-card">
      <p className="text-[0.9375rem] font-semibold text-ink">{m.name}</p>
      <dl className="mt-3 grid gap-y-3 text-[0.8125rem]">
        <div>
          <dt className="text-ink-faint">Members</dt>
          <dd className="data text-ink">
            {m.members.map((member) => (
              <span key={member} className="block">
                {member}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Depends on</dt>
          <dd className="text-ink">
            {m.dependsOn.map((d) => moduleName(d)).join(", ") || "nothing inside the system"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Depended on by</dt>
          <dd className="text-ink">
            {m.dependedOnBy.map((d) => moduleName(d)).join(", ") || "nothing"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
