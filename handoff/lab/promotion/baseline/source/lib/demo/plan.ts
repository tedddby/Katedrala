/**
 * Plan view of the demonstration system for the architecture explorer: every module is a bay (its boundary),
 * bays sit in rows by their module load level, and members sit inside their bay ordered by their own level. With
 * this arrangement every dependency points down a row or stays inside its bay.
 */
import { MODULE_EDGES, measurementOf, moduleMeasurementOf } from "./metrics";
import { EDGES, MODULES, NODES, type DemoEdgeKind, type ModuleId } from "./system";

export const PLAN = {
  width: 1000,
  /** Margin above the first row and below the last. */
  margin: 24,
  rowHeight: 118,
  /**
   * Bays leave room for the largest member names the explorer sets (18 units, on a sheet narrow enough that it
   * magnifies the plan to keep names legible), so a name never runs past its module's boundary.
   */
  bayHeight: 80,
  memberGap: 168,
  bayPadding: 44,
  bayGap: 48,
  /** A bay's name sits this far in from the side of its corner, and its top this far below the bay's top. */
  labelInset: 10,
  labelTop: 6,
} as const;

export interface Bay {
  readonly id: ModuleId;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly members: readonly string[];
  /** The top corner the bay's name is set in: the left (start) or the right (end); see `labelCorner`. */
  readonly label: "start" | "end";
}

export interface PlanMember {
  readonly id: string;
  readonly module: ModuleId;
  readonly x: number;
  readonly y: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

const levels = [...new Set(MODULES.map((m) => moduleMeasurementOf(m.id).level))].sort(
  (a, b) => b - a,
);

/** Members and module joints sit a little below the middle of their bay, under the bay's name. */
const JOINT_DROP = 4;

const bays: Omit<Bay, "label">[] = [];
const members: PlanMember[] = [];

levels.forEach((level, row) => {
  const inRow = MODULES.filter((m) => moduleMeasurementOf(m.id).level === level);
  const widths = inRow.map((m) => {
    const count = NODES.filter((n) => n.module === m.id).length;
    return PLAN.bayPadding * 2 + (count - 1) * PLAN.memberGap + 60;
  });
  const total = widths.reduce((a, b) => a + b, 0) + PLAN.bayGap * (inRow.length - 1);
  let x = (PLAN.width - total) / 2;
  const y = PLAN.margin + row * PLAN.rowHeight;
  inRow.forEach((module, i) => {
    const ordered = NODES.filter((n) => n.module === module.id)
      .map((n) => n.id)
      .sort(
        (a, b) => measurementOf(b).level - measurementOf(a).level || (a < b ? -1 : a > b ? 1 : 0),
      );
    const width = widths[i]!;
    bays.push({
      id: module.id,
      name: module.name,
      x,
      y,
      width,
      height: PLAN.bayHeight,
      members: ordered,
    });
    ordered.forEach((id, j) => {
      members.push({
        id,
        module: module.id,
        x: x + PLAN.bayPadding + 30 + j * PLAN.memberGap,
        y: y + PLAN.bayHeight / 2 + JOINT_DROP,
      });
    });
    x += width + PLAN.bayGap;
  });
});

export const PLAN_HEIGHT = PLAN.margin * 2 + (levels.length - 1) * PLAN.rowHeight + PLAN.bayHeight;
export const PLAN_MEMBERS: readonly PlanMember[] = members;

/**
 * At module scale each module is one joint inside its bay, with its name beside it. Joints sit off their bay's
 * center (dx, in plan units) so that every line on the drawing reads as the dependency it is: each module edge
 * clears every other joint by at least 33 units and every name by at least 10 at every size the explorer sets
 * names (12.5 to 42 units), edges cross at 58 degrees or more, and the edges meeting at one joint are at least 27
 * degrees apart, so no two arrowheads land on each other.
 */
const MODULE_JOINT_PLACEMENT: Record<ModuleId, { readonly dx: number; readonly side: -1 | 1 }> = {
  gateway: { dx: -48, side: -1 },
  checkout: { dx: 112, side: 1 },
  orders: { dx: -216, side: -1 },
  auth: { dx: 152, side: -1 },
  billing: { dx: 50, side: 1 },
  payments: { dx: -34, side: -1 },
  users: { dx: -134, side: 1 },
  platform: { dx: 28, side: 1 },
};

export interface ModuleJoint {
  readonly id: ModuleId;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** Joint radius: heavier modules (more members) draw larger joints. */
  readonly radius: number;
  /** Which side of the joint the module's name is set on. */
  readonly side: -1 | 1;
}

/** The space between a module's joint and its name, in em: clear of the joint's focus ring. */
export const MODULE_NAME_GAP = 0.6;

export const MODULE_JOINTS: readonly ModuleJoint[] = bays.map((bay) => ({
  id: bay.id,
  name: bay.name,
  x: bay.x + bay.width / 2 + MODULE_JOINT_PLACEMENT[bay.id].dx,
  y: bay.y + bay.height / 2 + JOINT_DROP,
  radius: 7 + bay.members.length * 2.5,
  side: MODULE_JOINT_PLACEMENT[bay.id].side,
}));

export interface PlanEdge {
  readonly source: string;
  readonly target: string;
  readonly kind: DemoEdgeKind;
  /** Whether the dependency crosses a module boundary. */
  readonly crossing: boolean;
  /**
   * How far the edge bows off the straight line between its members, in plan units (0: straight; see
   * `edgeControl`). A straight line that would run through another member's joint would read as a dependency
   * on that member, so such an edge bends around it instead.
   */
  readonly bend: number;
}

/** The joint radius of a member at member scale, in plan units. */
export const MEMBER_JOINT_RADIUS = 6.5;
/** The least space, in plan units, between a member dependency and the joint of any member it does not join. */
const EDGE_CLEARANCE = 14;

/**
 * The control point of a quadratic edge from `a` to `b` that bows `bend` units off its chord: positive bends to
 * the right of the direction of travel on the sheet, negative to the left.
 */
export function edgeControl(a: Point, b: Point, bend: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: (a.x + b.x) / 2 - (dy / length) * bend, y: (a.y + b.y) / 2 + (dx / length) * bend };
}

const positionOf = new Map(members.map((m) => [m.id, m]));

/** Points along a member dependency as it is drawn, from its source to its target, ends excluded. */
function edgePoints(source: string, target: string, bend: number, samples = 64): Point[] {
  const a = positionOf.get(source)!;
  const b = positionOf.get(target)!;
  const c = edgeControl(a, b, bend);
  const points: Point[] = [];
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    points.push({
      x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
      y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
    });
  }
  return points;
}

/** The closest an edge with this bend comes to the joint of any member other than its own two. */
function clearance(source: string, target: string, bend: number): number {
  let closest = Infinity;
  for (const p of edgePoints(source, target, bend))
    for (const m of members)
      if (m.id !== source && m.id !== target)
        closest = Math.min(closest, Math.hypot(m.x - p.x, m.y - p.y) - MEMBER_JOINT_RADIUS);
  return closest;
}

/**
 * The least bend that keeps an edge clear of every other joint: away from the member it would cross, or over
 * it when that member sits on the line itself, as in a row of one module's members.
 */
function bendOf(source: string, target: string): number {
  if (clearance(source, target, 0) >= EDGE_CLEARANCE) return 0;
  const a = positionOf.get(source)!;
  const b = positionOf.get(target)!;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  // Which side of the line the nearest other joint lies on: positive on the right of the direction of travel.
  const side = (m: Point) => ((b.x - a.x) * (m.y - a.y) - (b.y - a.y) * (m.x - a.x)) / length;
  const offLine = (m: Point) => {
    const t = ((m.x - a.x) * (b.x - a.x) + (m.y - a.y) * (b.y - a.y)) / (length * length);
    return t <= 0 || t >= 1 ? Infinity : Math.abs(side(m));
  };
  const nearest = members
    .filter((m) => m.id !== source && m.id !== target)
    .reduce((best, m) => (offLine(m) < offLine(best) ? m : best));
  // Bend away from the nearest joint; one on the line itself is passed over the top.
  const over = edgeControl(a, b, 1).y < edgeControl(a, b, -1).y ? 1 : -1;
  const away = Math.abs(side(nearest)) < 1 ? over : -Math.sign(side(nearest));
  for (let size = 16; size <= 160; size += 8)
    for (const bend of [away * size, -away * size])
      if (clearance(source, target, bend) >= EDGE_CLEARANCE) return bend;
  return 0;
}

const moduleOf = new Map(NODES.map((n) => [n.id, n.module]));
export const PLAN_EDGES: readonly PlanEdge[] = EDGES.map((e) => ({
  source: e.source,
  target: e.target,
  kind: e.kind,
  crossing: moduleOf.get(e.source) !== moduleOf.get(e.target),
  bend: bendOf(e.source, e.target),
}));

/** Bay names are set in Martian Mono capitals: 0.69 em per letter, tracking included. */
const BAY_NAME_ADVANCE = 0.69;
/** The sizes the explorer sets bay names at, in plan units: on wide sheets, and at its legibility floor on phones. */
const BAY_NAME_SIZES = [11, 18] as const;
const EDGE_PATHS = PLAN_EDGES.map((e) => edgePoints(e.source, e.target, e.bend, 160));

/**
 * The top corner a bay's name is set in: the one fewer member dependencies run through at the sizes the explorer
 * sets names, so lines pass beside a name rather than through it; the left, where reading starts, when both are
 * as clear.
 */
function labelCorner(bay: Omit<Bay, "label">): Bay["label"] {
  const crossings = (corner: Bay["label"]) =>
    BAY_NAME_SIZES.reduce((sum, size) => {
      const width = bay.name.length * BAY_NAME_ADVANCE * size;
      const left =
        corner === "start" ? bay.x + PLAN.labelInset : bay.x + bay.width - PLAN.labelInset - width;
      const top = bay.y + PLAN.labelTop;
      const runsThrough = (p: Point) =>
        p.x > left - 2 && p.x < left + width + 2 && p.y > top - 2 && p.y < top + 0.8 * size + 2;
      return sum + EDGE_PATHS.filter((path) => path.some(runsThrough)).length;
    }, 0);
  return crossings("end") < crossings("start") ? "end" : "start";
}

export const BAYS: readonly Bay[] = bays.map((bay) => ({ ...bay, label: labelCorner(bay) }));

export interface PlanModuleEdge {
  readonly source: ModuleId;
  readonly target: ModuleId;
  /** Member dependencies the module dependency aggregates. */
  readonly count: number;
  /** Where the count is set on the edge, as a fraction of the way from its source joint to its target. */
  readonly countAt: number;
}

const jointOf = new Map(MODULE_JOINTS.map((j) => [j.id, j]));

/** The distance from `p` to the segment from `a` to `b`. */
function segmentDistance(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/**
 * Where along the middle of a module dependency its count can sit clearest of every other edge, joint and module
 * name, so the number reads as this line's and no other's. Names are taken at the largest size the explorer sets
 * them (42 units, on a 320px sheet) and about 0.52 em per letter.
 */
function countPosition(source: ModuleId, target: ModuleId): number {
  const a = jointOf.get(source)!;
  const b = jointOf.get(target)!;
  const name = 42;
  let best = { at: 0.5, clear: -Infinity };
  for (let i = 25; i <= 75; i++) {
    const at = i / 100;
    const p = { x: a.x + (b.x - a.x) * at, y: a.y + (b.y - a.y) * at };
    let clear = Infinity;
    for (const [s, t] of MODULE_EDGES)
      if (s !== source || t !== target)
        clear = Math.min(clear, segmentDistance(jointOf.get(s)!, jointOf.get(t)!, p));
    for (const j of MODULE_JOINTS) {
      const start = j.x + j.side * (j.radius + MODULE_NAME_GAP * name);
      const end = start + j.side * j.name.length * 0.52 * name;
      const dx = Math.max(Math.min(start, end) - p.x, 0, p.x - Math.max(start, end));
      const dy = Math.max(Math.abs(p.y - j.y) - 0.6 * name, 0);
      clear = Math.min(clear, Math.hypot(j.x - p.x, j.y - p.y) - j.radius, Math.hypot(dx, dy));
    }
    if (
      clear > best.clear + 1e-6 ||
      (clear > best.clear - 1e-6 && Math.abs(at - 0.5) < Math.abs(best.at - 0.5))
    )
      best = { at, clear };
  }
  return best.at;
}

export const PLAN_MODULE_EDGES: readonly PlanModuleEdge[] = MODULE_EDGES.map(
  ([source, target]) => ({
    source,
    target,
    count: EDGES.filter(
      (e) => moduleOf.get(e.source) === source && moduleOf.get(e.target) === target,
    ).length,
    countAt: countPosition(source, target),
  }),
);

export const EDGE_KINDS: readonly { kind: DemoEdgeKind; label: string }[] = [
  { kind: "calls", label: "calls" },
  { kind: "instantiates", label: "instantiates" },
  { kind: "accesses-data", label: "accesses data" },
];
