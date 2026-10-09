/**
 * Plan view of the demonstration system for the architecture explorer: every module is a bay (its boundary),
 * bays sit in rows by their module load level, and members sit inside their bay ordered by their own level. With
 * this arrangement every dependency points down a row or stays inside its bay.
 */
import { MODULE_EDGES, measurementOf, moduleMeasurementOf } from "./metrics.ts";
import { EDGES, MODULES, NODES, type DemoEdgeKind, type ModuleId } from "./system.ts";

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
  /** The corner the bay's name is set in: on the left (start) or the right (end); see `placeLabels`. */
  readonly label: "start" | "end";
  /** Whether that corner is at the bay's top or, where the members' names need the top, at its bottom. */
  readonly labelRow: "top" | "bottom";
}

type Corner = { readonly x: Bay["label"]; readonly row: Bay["labelRow"] };

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
/**
 * Authored nudges of a member off its place in its bay, in plan units. ApiGateway is alone in its bay and every
 * dependency it has leaves toward the left, so its joint sits left of the bay's middle: its name then hangs over
 * it to the right, and the bay's name takes the right-hand corner, both clear of those lines (see `placeLabels`).
 */
const MEMBER_NUDGE: Readonly<Record<string, number>> = { ApiGateway: -30 };

const bays: Omit<Bay, "label" | "labelRow">[] = [];
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
        x: x + PLAN.bayPadding + 30 + j * PLAN.memberGap + (MEMBER_NUDGE[id] ?? 0),
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
const EDGE_PATHS = PLAN_EDGES.map((e) => edgePoints(e.source, e.target, e.bend, 160));

/**
 * Where a member's name is set: under its joint or over it, centered on the joint or hanging to one side of it
 * (`start` begins just left of the joint and runs right, `end` the reverse). See `placeLabels`.
 */
export interface MemberLabel {
  readonly side: "below" | "above";
  readonly align: "middle" | "start" | "end";
}

/** A name that hangs to one side starts or ends this far past the joint's center, in plan units. */
export const LABEL_ALIGN_INSET = 4;
/** Member names are set in condensed Archivo: at most about 0.48 em per letter (measured: 0.39 to 0.49). */
const MEMBER_NAME_ADVANCE = 0.48;
/**
 * The scales the explorer draws the member plan at, in plan units: member names and bay names on a wide sheet, on
 * a tablet's, and on a phone's magnified plan (the names' legibility floor sets them there), with the plan units
 * per CSS pixel that go with each. A crossing on the phone's member plan, a magnified view one tap away from the
 * module plan it opens at, counts for less.
 */
const SCALES = [
  { member: 12.5, bay: 11, unit: 1, weight: 1 },
  { member: 15.7, bay: 15.7, unit: 1.43, weight: 1 },
  { member: 18, bay: 18, unit: 1.64, weight: 0.35 },
] as const;
/** Space between a joint and the end of every dependency that meets it, in CSS pixels (the explorer's EDGE_GAP). */
const EDGE_END_GAP = 6;

interface Box {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

/**
 * A member name's box in plan units, from the text attributes the explorer sets: below, `y` 12.5 and `dy` 0.72 em;
 * above, `y` -14 and `dy` -0.25 em (clear of the focus ring at every size); Archivo's glyph box runs from 0.896 em
 * over the baseline to 0.245 em under it.
 */
function memberLabelBox(at: Point, name: string, label: MemberLabel, size: number): Box {
  const width = name.length * MEMBER_NAME_ADVANCE * size;
  const top = label.side === "below" ? 12.5 - 0.176 * size : -14 - 1.146 * size;
  const [l, r] =
    label.align === "middle"
      ? [-width / 2, width / 2]
      : label.align === "start"
        ? [-LABEL_ALIGN_INSET, width - LABEL_ALIGN_INSET]
        : [LABEL_ALIGN_INSET - width, LABEL_ALIGN_INSET];
  return { l: at.x + l, t: at.y + top, r: at.x + r, b: at.y + top + 1.141 * size };
}

/**
 * A bay name's box in plan units, from the text attributes the explorer sets: at the top, `y` labelTop under the
 * bay's top and `dy` 0.8 em; at the bottom, `y` labelTop over its bottom and `dy` -0.2 em.
 */
function bayNameBox(bay: Omit<Bay, "label" | "labelRow">, corner: Corner, size: number): Box {
  const width = bay.name.length * BAY_NAME_ADVANCE * size;
  const left =
    corner.x === "start" ? bay.x + PLAN.labelInset : bay.x + bay.width - PLAN.labelInset - width;
  const top =
    corner.row === "top"
      ? bay.y + PLAN.labelTop - 2
      : bay.y + bay.height - PLAN.labelTop - 1.15 * size;
  return { l: left, t: top, r: left + width, b: top + 1.2 * size };
}

const overlaps = (a: Box, b: Box, margin = 1) =>
  a.l < b.r + margin && b.l < a.r + margin && a.t < b.b + margin && b.t < a.b + margin;
const inside = (p: Point, box: Box, margin = 1) =>
  p.x > box.l - margin && p.x < box.r + margin && p.y > box.t - margin && p.y < box.b + margin;

/** How many drawn dependencies run through a box, each counted once; the stretch hidden under a joint's gap is skipped. */
function edgesThrough(box: Box, unit: number): number {
  const gap = MEMBER_JOINT_RADIUS + EDGE_END_GAP * unit;
  return PLAN_EDGES.filter((edge, i) => {
    const a = positionOf.get(edge.source)!;
    const b = positionOf.get(edge.target)!;
    return EDGE_PATHS[i]!.some(
      (p) =>
        Math.hypot(p.x - a.x, p.y - a.y) > gap &&
        Math.hypot(p.x - b.x, p.y - b.y) > gap &&
        inside(p, box),
    );
  }).length;
}

const LABEL_CHOICES: readonly { label: MemberLabel; preference: number }[] = [
  { label: { side: "below", align: "middle" }, preference: 0 },
  { label: { side: "above", align: "middle" }, preference: 0.25 },
  { label: { side: "below", align: "start" }, preference: 0.5 },
  { label: { side: "below", align: "end" }, preference: 0.5 },
  { label: { side: "above", align: "start" }, preference: 0.75 },
  { label: { side: "above", align: "end" }, preference: 0.75 },
];

/**
 * What a name placement costs at every size the explorer sets names: a point for each dependency that runs through
 * it, much more for leaving its bay or touching the bay's name, another joint or another member's name, and a
 * small preference for the plain name under the joint.
 */
function labelCost(
  member: PlanMember,
  label: MemberLabel,
  bay: Omit<Bay, "label" | "labelRow">,
  corner: Corner,
  placed: ReadonlyMap<string, MemberLabel>,
): number {
  let cost = 0;
  for (const { member: size, bay: baySize, unit, weight } of SCALES) {
    const box = memberLabelBox(member, member.id, label, size);
    cost += weight * edgesThrough(box, unit);
    if (box.l < bay.x + 2 || box.r > bay.x + bay.width - 2 || box.t < bay.y + 2 || box.b > bay.y + bay.height - 2)
      cost += 100;
    if (overlaps(box, bayNameBox(bay, corner, baySize))) cost += 20;
    for (const other of members) {
      if (other.id === member.id) continue;
      const ring = MEMBER_JOINT_RADIUS + 6 * unit;
      if (overlaps(box, { l: other.x - ring, t: other.y - ring, r: other.x + ring, b: other.y + ring }))
        cost += 20;
      const theirs = placed.get(other.id);
      if (theirs !== undefined && overlaps(box, memberLabelBox(other, other.id, theirs, size), 4))
        cost += 20;
    }
  }
  return cost;
}

/** The corners a bay's name can take, most preferred first: the top left, where reading starts, then the top right. */
const CORNERS: readonly { corner: Corner; preference: number }[] = [
  { corner: { x: "start", row: "top" }, preference: 0 },
  { corner: { x: "end", row: "top" }, preference: 0.1 },
  { corner: { x: "start", row: "bottom" }, preference: 0.6 },
  { corner: { x: "end", row: "bottom" }, preference: 0.7 },
];

/**
 * Bay names and member names, placed together bay by bay so lines pass beside names rather than through them:
 * for each corner of the bay, every member takes its cheapest name placement (twice over, so neighbors see each
 * other's names), and the bay takes the corner whose name and members' names cost least in all, counting the
 * dependencies through its own name too. Ties keep names at the top left and under their joints.
 */
function placeLabels() {
  const corners = new Map<ModuleId, Corner>();
  const labels = new Map<string, MemberLabel>();
  for (const bay of bays) {
    const own = members.filter((m) => m.module === bay.id);
    let best: { cost: number; corner: Corner; picks: Map<string, MemberLabel> } | undefined;
    for (const { corner, preference } of CORNERS) {
      const picks = new Map<string, MemberLabel>();
      let cost =
        preference +
        SCALES.reduce(
          (sum, { bay: size, unit, weight }) =>
            sum + weight * edgesThrough(bayNameBox(bay, corner, size), unit),
          0,
        );
      for (let pass = 0; pass < 2; pass++) {
        for (const member of own) {
          const choice = LABEL_CHOICES.map(({ label, preference }) => ({
            label,
            cost: labelCost(member, label, bay, corner, new Map([...labels, ...picks])) + preference,
          })).reduce((a, b) => (b.cost < a.cost - 1e-9 ? b : a));
          picks.set(member.id, choice.label);
        }
      }
      for (const member of own)
        cost += labelCost(member, picks.get(member.id)!, bay, corner, new Map([...labels, ...picks]));
      if (best === undefined || cost < best.cost - 1e-9) best = { cost, corner, picks };
    }
    corners.set(bay.id, best!.corner);
    for (const [id, label] of best!.picks) labels.set(id, label);
  }
  return { corners, labels };
}

const PLACED = placeLabels();

export const BAYS: readonly Bay[] = bays.map((bay) => ({
  ...bay,
  label: PLACED.corners.get(bay.id)!.x,
  labelRow: PLACED.corners.get(bay.id)!.row,
}));

/** Where each member's name is set (see `placeLabels`). */
export const MEMBER_LABELS: ReadonlyMap<string, MemberLabel> = PLACED.labels;

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
export { labelCost, bayNameBox, edgesThrough, memberLabelBox, CORNERS, LABEL_CHOICES, EDGE_PATHS, SCALES };
