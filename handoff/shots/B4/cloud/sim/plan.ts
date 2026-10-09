/**
 * Plan view of the demonstration system for the architecture explorer: every module is a bay (its boundary), and
 * bays sit in rows by their module load level, so every dependency points down a row or stays inside its bay.
 * Members sit inside their bay in the order and at the places that let every dependency and every name read clearly
 * (authored below), and the names are placed for the size the explorer sets them at (`planLabels`).
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
/**
 * The order of a bay's members, left to right, where it is not the default (higher load levels first, then by
 * name), and how far each member sits off its evenly spaced place, in plan units. Both are authored, found by a
 * search over orders, places and the bends below that leaves no drawn dependency running through any member's or
 * bay's name at any size the explorer sets names (12.5 to 18 units), every dependency at least 14 units clear of
 * every joint it does not join, and members at least 120 units apart.
 */
const BAY_ORDER: Partial<Record<ModuleId, readonly string[]>> = {
  checkout: ["CheckoutService", "CheckoutController"],
  auth: ["SessionStore", "AuthService"],
  payments: ["StripeClient", "PaymentService", "PaymentRepository"],
};
const MEMBER_NUDGE: Readonly<Record<string, number>> = {
  ApiGateway: 32,
  CheckoutController: -8,
  CheckoutService: -8,
  OrderController: 36,
  OrderService: 20,
  OrderRepository: 12,
  AuthService: 24,
  SessionStore: 8,
  InvoiceService: -32,
  PaymentService: -32,
  PaymentRepository: -12,
  UserService: -20,
  UserRepository: -36,
  Database: 52,
  EventBus: 8,
};

const bays: Bay[] = [];
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
    const ordered =
      BAY_ORDER[module.id] ??
      NODES.filter((n) => n.module === module.id)
        .map((n) => n.id)
        .sort(
          (a, b) =>
            measurementOf(b).level - measurementOf(a).level || (a < b ? -1 : a > b ? 1 : 0),
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

/**
 * Bends set by hand, in plan units, where the least bend that clears the joints would run through a name: found
 * with the members' order and places above.
 */
const BEND: Readonly<Record<string, number>> = {
  "ApiGateway>CheckoutController": 24,
  "ApiGateway>OrderController": -24,
  "InvoiceService>UserService": 32,
  "OrderService>EventBus": 24,
  "OrderService>PaymentService": -8,
};

const moduleOf = new Map(NODES.map((n) => [n.id, n.module]));
export const PLAN_EDGES: readonly PlanEdge[] = EDGES.map((e) => ({
  source: e.source,
  target: e.target,
  kind: e.kind,
  crossing: moduleOf.get(e.source) !== moduleOf.get(e.target),
  bend: BEND[`${e.source}>${e.target}`] ?? bendOf(e.source, e.target),
}));

export const BAYS: readonly Bay[] = bays;

// --- Names on the member plan ------------------------------------------------------------------------------------

/**
 * Where a member's name is set: under its joint or over it, centered on the joint or hanging to one side of it
 * (`start` begins just left of the joint and runs right, `end` the reverse), or beside it on the right (`start`)
 * or the left (`end`), level with the joint. See `planLabels`.
 */
export interface MemberLabel {
  readonly side: "below" | "above" | "right" | "left";
  readonly align: "middle" | "start" | "end";
}

/** The corner of its bay a module's name is set in: on the left (start) or the right (end), at the top or bottom. */
export interface BayCorner {
  readonly x: "start" | "end";
  readonly row: "top" | "bottom";
}

/** The names on the plan at one size: where each member's name and each bay's name is set. */
export interface PlanLabels {
  readonly members: ReadonlyMap<string, MemberLabel>;
  readonly bays: ReadonlyMap<ModuleId, BayCorner>;
}

/** A name that hangs to one side starts or ends this far past the joint's center, in plan units. */
export const LABEL_ALIGN_INSET = 4;
/** Space between a joint and the end of every dependency that meets it, in CSS pixels. */
export const EDGE_GAP = 6;
/**
 * Name sizes, in plan units at a given number of plan units per CSS pixel (`unit`), as explorer.css sets them: never
 * under 11 CSS pixels, and on wide sheets member names at 12.5 units and bay names at 10.5.
 */
export const memberNameSize = (unit: number) => Math.max(12.5, 11 * unit);
export const bayNameSize = (unit: number) => Math.max(10.5, 11 * unit);

/**
 * How wide each member's name is, in em of the label face the explorer sets it in (Archivo at width 84, weight
 * 520), as the browser measures it; a name not listed is taken at 0.5 em a letter, wider than any listed. Bay
 * names are set in Martian Mono capitals: 0.69 em a letter with their tracking.
 */
const NAME_EM: Readonly<Record<string, number>> = {
  ApiGateway: 4.85,
  AuthService: 4.82,
  CheckoutController: 7.73,
  CheckoutService: 6.75,
  Database: 3.8,
  EventBus: 3.85,
  InvoiceService: 5.83,
  OrderController: 6.21,
  OrderRepository: 6.61,
  OrderService: 5.23,
  PaymentRepository: 7.83,
  PaymentService: 6.46,
  SessionStore: 5.3,
  StripeClient: 4.72,
  UserRepository: 6.2,
  UserService: 4.83,
};
const BAY_NAME_EM = 0.69;

interface Box {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

const grow = (box: Box, by: number, byY = by): Box => ({
  l: box.l - by,
  t: box.t - byY,
  r: box.r + by,
  b: box.b + byY,
});
const overlaps = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
/** A square around a point, `radius` from it on every side. */
const around = (p: Point, radius: number): Box => ({
  l: p.x - radius,
  t: p.y - radius,
  r: p.x + radius,
  b: p.y + radius,
});

/** Whether the segment from `p` to `q` enters a box (Liang and Barsky's clipping). */
function enters(p: Point, q: Point, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (denominator: number, numerator: number) => {
    if (denominator === 0) return numerator >= 0;
    const t = numerator / denominator;
    if (denominator < 0) {
      if (t > t1) return false;
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) return false;
      t1 = Math.min(t1, t);
    }
    return true;
  };
  return (
    clip(-dx, p.x - box.l) &&
    clip(dx, box.r - p.x) &&
    clip(-dy, p.y - box.t) &&
    clip(dy, box.b - p.y) &&
    t0 <= t1
  );
}

/**
 * A member's name as a box in plan units at `size`, from the text attributes the explorer sets: below, `y` 12.5 and
 * `dy` 0.72 em; above, `y` -14 and `dy` -0.25 em; beside, `x` the joint's radius and `dx` 0.5 em, `dy` 0.34 em. The
 * face's glyph box runs from 0.896 em over the baseline to 0.245 em under it.
 */
function nameBox(at: Point, name: string, label: MemberLabel, size: number): Box {
  const width = (NAME_EM[name] ?? 0.5 * name.length) * size;
  const baseline =
    label.side === "below"
      ? 12.5 + 0.72 * size
      : label.side === "above"
        ? -14 - 0.25 * size
        : 0.34 * size;
  const beside = MEMBER_JOINT_RADIUS + 0.5 * size;
  const left =
    label.side === "right"
      ? beside
      : label.side === "left"
        ? -beside - width
        : label.align === "middle"
          ? -width / 2
          : label.align === "start"
            ? -LABEL_ALIGN_INSET
            : LABEL_ALIGN_INSET - width;
  const top = baseline - 0.896 * size;
  return { l: at.x + left, t: at.y + top, r: at.x + left + width, b: at.y + top + 1.141 * size };
}

/**
 * A bay's name as a box at `size`, from the text attributes the explorer sets: at the top, `y` labelTop under the
 * bay's top and `dy` 0.8 em; at the bottom, `y` labelTop over its bottom and `dy` -0.2 em. The capitals' glyph box
 * runs from 1 em over the baseline to 0.18 em under it.
 */
function bayNameBox(bay: Omit<Bay, "members">, corner: BayCorner, size: number): Box {
  const width = bay.name.length * BAY_NAME_EM * size;
  const left =
    corner.x === "start" ? bay.x + PLAN.labelInset : bay.x + bay.width - PLAN.labelInset - width;
  const baseline =
    corner.row === "top"
      ? bay.y + PLAN.labelTop + 0.8 * size
      : bay.y + bay.height - PLAN.labelTop - 0.2 * size;
  return { l: left, t: baseline - size, r: left + width, b: baseline + 0.18 * size };
}

/**
 * Every member dependency as the explorer draws it at `unit`, as runs of straight segments: from `gap` past one
 * joint to `gap` short of the other, with the two barbs of its arrowhead (the marker's 7 by 7, in stroke widths).
 */
function drawnEdges(unit: number): Point[][] {
  const gap = MEMBER_JOINT_RADIUS + EDGE_GAP * unit;
  return PLAN_EDGES.map((edge) => {
    const a = positionOf.get(edge.source)!;
    const b = positionOf.get(edge.target)!;
    const c = edge.bend === 0 ? null : edgeControl(a, b, edge.bend);
    const unitFrom = (p: Point, q: Point) => {
      const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { x: (q.x - p.x) / length, y: (q.y - p.y) / length };
    };
    const out = unitFrom(a, c ?? b);
    const into = unitFrom(c ?? a, b);
    const start = { x: a.x + out.x * gap, y: a.y + out.y * gap };
    const end = { x: b.x - into.x * gap, y: b.y - into.y * gap };
    const run: Point[] = [];
    if (c === null) run.push(start, end);
    else
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        run.push({
          x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * c.x + t * t * end.x,
          y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * c.y + t * t * end.y,
        });
      }
    // The arrowhead: 0.81 of the marker back from its tip and 0.38 to each side, in marker widths.
    const stroke = edge.kind === "accesses-data" ? Math.max(2, 1.4 * unit) : Math.max(1.4, unit);
    const back = 0.81 * 7 * stroke;
    const side = 0.38 * 7 * stroke;
    const barb = (s: number) => ({
      x: end.x - into.x * back - into.y * side * s,
      y: end.y - into.y * back + into.x * side * s,
    });
    run.push(barb(1), end, barb(-1));
    return run;
  });
}

/** How many of the drawn dependencies run through a box. */
function crossings(box: Box, edges: readonly Point[][]): number {
  let count = 0;
  for (const run of edges) {
    for (let i = 0; i + 1 < run.length; i++) {
      if (enters(run[i]!, run[i + 1]!, box)) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

const LABEL_CHOICES: readonly { label: MemberLabel; preference: number }[] = [
  { label: { side: "below", align: "middle" }, preference: 0 },
  { label: { side: "above", align: "middle" }, preference: 0.3 },
  { label: { side: "below", align: "start" }, preference: 0.6 },
  { label: { side: "below", align: "end" }, preference: 0.6 },
  { label: { side: "above", align: "start" }, preference: 0.9 },
  { label: { side: "above", align: "end" }, preference: 0.9 },
  { label: { side: "right", align: "start" }, preference: 1.2 },
  { label: { side: "left", align: "end" }, preference: 1.2 },
];

/** The corners a bay's name can take, most preferred first: the top left, where reading starts. */
const CORNER_CHOICES: readonly { corner: BayCorner; preference: number }[] = [
  { corner: { x: "start", row: "top" }, preference: 0 },
  { corner: { x: "end", row: "top" }, preference: 0.1 },
  { corner: { x: "start", row: "bottom" }, preference: 0.6 },
  { corner: { x: "end", row: "bottom" }, preference: 0.7 },
];

/**
 * The names on the plan at one scale, `unit` plan units per CSS pixel: bay by bay, the bay's name in one of its
 * corners and each member's name in one of eight places, chosen together so that no drawn dependency runs through
 * a name, no name leaves its bay or covers another name or a joint, and otherwise the plainest places win (a name
 * under its joint, a bay's name at the top left). Each bay's names are independent of every other bay's (a name
 * never leaves its bay), so every combination is tried: at most 4 corners by 8 places for each of 3 members.
 */
function placeLabels(unit: number): PlanLabels {
  const size = memberNameSize(unit);
  const baySize = bayNameSize(unit);
  const edges = drawnEdges(unit);
  /** The focus ring around a joint, with its 2 px stroke and a pixel to spare. */
  const ring = MEMBER_JOINT_RADIUS + 4 * unit + 2 * unit;
  // Two names on one line keep a name's height apart, so they never read as one phrase; stacked, a third of it.
  const apartX = size;
  const apartY = size / 3;
  const memberLabels = new Map<string, MemberLabel>();
  const bayCorners = new Map<ModuleId, BayCorner>();
  for (const bay of BAYS) {
    const own = members.filter((m) => m.module === bay.id);
    const inside = grow({ l: bay.x, t: bay.y, r: bay.x + bay.width, b: bay.y + bay.height }, -2);
    const options = own.map((member) =>
      LABEL_CHOICES.map(({ label, preference }) => {
        const box = nameBox(member, member.id, label, size);
        let cost = preference + 10 * crossings(grow(box, 1.5), edges);
        if (box.l < inside.l || box.r > inside.r || box.t < inside.t || box.b > inside.b)
          cost += 100;
        for (const other of own)
          if (other !== member && overlaps(grow(box, 1), around(other, ring))) cost += 50;
        return { label, box, cost };
      }),
    );
    const corners = CORNER_CHOICES.map(({ corner, preference }) => {
      const box = bayNameBox(bay, corner, baySize);
      let cost = preference + 10 * crossings(grow(box, 1.5), edges);
      for (const member of own) if (overlaps(grow(box, 1), around(member, ring))) cost += 50;
      return { corner, box, cost };
    });
    let best = { cost: Infinity, corner: 0, picks: [] as number[] };
    const combinations = LABEL_CHOICES.length ** own.length;
    for (let c = 0; c < corners.length; c++) {
      for (let code = 0; code < combinations; code++) {
        const picks = own.map((_, i) => Math.floor(code / LABEL_CHOICES.length ** i) % LABEL_CHOICES.length);
        let cost = corners[c]!.cost;
        picks.forEach((pick, i) => {
          const option = options[i]![pick]!;
          cost += option.cost;
          if (overlaps(grow(option.box, apartX, apartY), corners[c]!.box)) cost += 50;
          for (let j = i + 1; j < picks.length; j++)
            if (overlaps(grow(option.box, apartX, apartY), options[j]![picks[j]!]!.box))
              cost += 50;
        });
        if (cost < best.cost - 1e-9) best = { cost, corner: c, picks };
      }
    }
    bayCorners.set(bay.id, corners[best.corner]!.corner);
    own.forEach((member, i) => memberLabels.set(member.id, options[i]![best.picks[i]!]!.label));
  }
  return { members: memberLabels, bays: bayCorners };
}

const placed = new Map<number, PlanLabels>();

/**
 * Where the plan's names are set at `unit` plan units per CSS pixel (the sheet's scale where the member plan opens).
 * Computed when first asked for at a scale (to a thousandth of a unit, so a phone's 18 units stay 18) and kept.
 */
export function planLabels(unit: number): PlanLabels {
  const key = Math.round(unit * 1000) / 1000;
  let labels = placed.get(key);
  if (labels === undefined) {
    labels = placeLabels(key);
    if (placed.size > 16) placed.clear();
    placed.set(key, labels);
  }
  return labels;
}


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
