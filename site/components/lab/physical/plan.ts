import type { Model } from "./model";

/**
 * The board, as on Gaudí's: a floor plan carrying the anchor points. The plan is a horseshoe of bays, open towards
 * the viewer like an apse: every directory group that holds a foundation is one bay, its arc in proportion to its
 * anchors, and its anchors stand in a grid of rows and columns inside the bay. Bays sit next to the bays they share
 * the most dependencies with. Coordinates: x along the plan, z across it (positive towards the viewer), the board
 * at y = 0, the plan centred on the origin.
 */

export interface Bay {
  readonly group: number;
  readonly name: string;
  /** Arc of the bay, radians (0 is +x, positive turns towards -z, away from the viewer). */
  readonly a0: number;
  readonly a1: number;
  /** Node ids anchored in this bay. */
  readonly anchors: readonly number[];
  /** Centre of the bay on the plan. */
  readonly cx: number;
  readonly cz: number;
}

export interface Plan {
  /** Semi-axes of the ring's outer edge. */
  readonly radiusX: number;
  readonly radiusZ: number;
  /** Inner edge as a share of the outer edge. */
  readonly inner: number;
  /** Where the horseshoe opens: the arc from `open0` to `open1` (radians) holds no bay. */
  readonly open0: number;
  readonly open1: number;
  readonly bays: readonly Bay[];
  /** Per node: x and z of its anchor point, or NaN for files that hang. */
  readonly anchorX: Float32Array;
  readonly anchorZ: Float32Array;
  /** Typical spacing between anchors (footings are drawn from it). */
  readonly pitch: number;
}

export interface PlanOptions {
  readonly radiusX: number;
  readonly radiusZ: number;
  /** Inner edge of the ring as a share of the outer edge (the band the anchors stand in). */
  readonly inner: number;
  /** Angle of the opening towards the viewer, radians. */
  readonly opening: number;
  /** Gap between neighbouring bays, radians. */
  readonly gap: number;
}

/** Point on the plan at angle `a` and relative radius `r` (1 is the outer edge). */
export function planPoint(
  plan: Pick<Plan, "radiusX" | "radiusZ">,
  a: number,
  r: number,
): [number, number] {
  return [Math.cos(a) * r * plan.radiusX, -Math.sin(a) * r * plan.radiusZ];
}

export function layoutPlan(model: Model, options: PlanOptions): Plan {
  const { nodes, chains, data } = model;
  const isAnchor = (id: number) =>
    nodes[id]!.kind === "foundation" || nodes[id]!.kind === "isolated";

  const anchorsByGroup = new Map<number, number[]>();
  for (const n of nodes) {
    if (!isAnchor(n.id)) continue;
    const list = anchorsByGroup.get(n.group) ?? [];
    list.push(n.id);
    anchorsByGroup.set(n.group, list);
  }
  // Within a bay, the anchors carrying the most stand at the middle of the bay's front row.
  for (const list of anchorsByGroup.values()) {
    list.sort(
      (a, b) => nodes[b]!.reach - nodes[a]!.reach || (nodes[a]!.path < nodes[b]!.path ? -1 : 1),
    );
  }
  const groups = [...anchorsByGroup.keys()];

  // Dependencies shared between two groups, in either direction.
  const weight = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const c of chains) {
    const a = nodes[c.dependent]!.group;
    const b = nodes[c.dependency]!.group;
    if (a === b) continue;
    weight.set(key(a, b), (weight.get(key(a, b)) ?? 0) + 1);
  }
  const w = (a: number, b: number) => weight.get(key(a, b)) ?? 0;
  const size = (g: number) => anchorsByGroup.get(g)!.length;

  // Greedy ordering along the horseshoe: start from the largest bay, then attach whichever remaining group is most
  // tied to an end of the row.
  const remaining = new Set(groups);
  const start = [...groups].sort((a, b) => size(b) - size(a) || a - b)[0]!;
  const order = [start];
  remaining.delete(start);
  while (remaining.size > 0) {
    let best = -1;
    let bestScore = -1;
    let atLeft = false;
    for (const g of [...remaining].sort((a, b) => a - b)) {
      const left = w(g, order[0]!);
      const right = w(g, order[order.length - 1]!);
      const score = Math.max(left, right) * 1000 + size(g);
      if (score > bestScore) {
        bestScore = score;
        best = g;
        atLeft = left > right;
      }
    }
    if (atLeft) order.unshift(best);
    else order.push(best);
    remaining.delete(best);
  }

  // The horseshoe: from one side of the opening, round the back, to the other side. The opening faces +z.
  const front = Math.PI / 2 + Math.PI; // angle pointing at +z in this parametrisation (z = -sin a)
  const open0 = front - options.opening / 2;
  const open1 = front + options.opening / 2;
  const span = Math.PI * 2 - options.opening;
  const MIN = 2;
  const total = order.reduce((s, g) => s + Math.max(MIN, size(g)), 0);
  const usable = span - options.gap * order.length;

  const anchorX = new Float32Array(nodes.length).fill(Number.NaN);
  const anchorZ = new Float32Array(nodes.length).fill(Number.NaN);
  const bays: Bay[] = [];
  const plan = { radiusX: options.radiusX, radiusZ: options.radiusZ };
  const rMid = (1 + options.inner) / 2;
  const meanRadius = ((options.radiusX + options.radiusZ) / 2) * rMid;
  const band = 1 - options.inner;
  let a = open1 + options.gap / 2;
  let pitchSum = 0;
  let pitchCount = 0;
  for (const g of order) {
    const arc = (usable * Math.max(MIN, size(g))) / total;
    const anchors = anchorsByGroup.get(g)!;
    const n = anchors.length;
    // Rows across the band, columns along the arc, cells as square as the bay allows (at most three rows).
    const arcLength = arc * meanRadius;
    const bandWidth = band * meanRadius;
    const rows = Math.max(
      1,
      Math.min(3, n, Math.round(Math.sqrt((n * bandWidth) / Math.max(arcLength, 1e-6)))),
    );
    const cols = Math.ceil(n / rows);
    anchors.forEach((id, i) => {
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? n - row * cols : cols;
      const col = i % cols;
      const offset = (cols - inRow) / 2;
      // Columns centred in the bay; row 0 on the inner edge (the face of the bay), later rows further out.
      const t = (col + offset + 0.5) / cols;
      const angle = a + arc * t;
      const r = rows === 1 ? rMid : options.inner + (band * (row + 0.5)) / rows;
      const [x, z] = planPoint(plan, angle, r);
      anchorX[id] = x;
      anchorZ[id] = z;
    });
    pitchSum += Math.min(arcLength / cols, bandWidth / rows) * n;
    pitchCount += n;
    const [cx, cz] = planPoint(plan, a + arc / 2, rMid);
    bays.push({ group: g, name: data.groups[g] ?? String(g), a0: a, a1: a + arc, anchors, cx, cz });
    a += arc + options.gap;
  }

  return {
    radiusX: options.radiusX,
    radiusZ: options.radiusZ,
    inner: options.inner,
    open0,
    open1,
    bays,
    anchorX,
    anchorZ,
    pitch: pitchSum / Math.max(1, pitchCount),
  };
}
