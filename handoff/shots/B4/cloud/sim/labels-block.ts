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

const grow = (box: Box, by: number): Box => ({
  l: box.l - by,
  t: box.t - by,
  r: box.r + by,
  b: box.b + by,
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
          if (overlaps(grow(option.box, 1), corners[c]!.box)) cost += 50;
          for (let j = i + 1; j < picks.length; j++)
            if (overlaps(grow(option.box, 2), options[j]![picks[j]!]!.box)) cost += 50;
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
 * Computed when first asked for at a scale, to a hundredth of a unit, and kept.
 */
export function planLabels(unit: number): PlanLabels {
  const key = Math.round(unit * 100) / 100;
  let labels = placed.get(key);
  if (labels === undefined) {
    labels = placeLabels(key);
    if (placed.size > 16) placed.clear();
    placed.set(key, labels);
  }
  return labels;
}
