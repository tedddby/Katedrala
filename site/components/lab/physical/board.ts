import type { Built } from "./build";
import { planPoint } from "./plan";

/**
 * The drawing that does not move: the plan on the board (its bays), a footing with the hatching of a fixed support
 * under every anchor, and a level scale beside the structure. All in the board's frame, so it turns over with it.
 */

export interface BoardLines {
  readonly count: number;
  /** xyz of both ends per line. */
  readonly p0: Float32Array;
  readonly p1: Float32Array;
  /** Width (CSS px), opacity, tone (0 graphite, 1 chalk). */
  readonly width: Float32Array;
  readonly alpha: Float32Array;
  readonly tone: Float32Array;
}

export interface Anchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BoardLabels {
  readonly bays: readonly (Anchor & { readonly name: string; readonly anchors: number })[];
  readonly levels: readonly (Anchor & { readonly level: number })[];
  /** Where the level scale stands (x, z in the board's frame). */
  readonly scaleX: number;
}

export function boardDrawing(built: Built): { lines: BoardLines; labels: BoardLabels } {
  const { plan, model, rig, unit } = built;
  const lines: number[][] = [];
  const add = (a: number[], b: number[], width: number, alpha: number, tone: number) =>
    lines.push([...a, ...b, width, alpha, tone]);

  // Bays: annular sectors of the plan.
  const step = (4 * Math.PI) / 180;
  for (const bay of plan.bays) {
    const n = Math.max(2, Math.ceil((bay.a1 - bay.a0) / step));
    for (const r of [plan.inner, 1]) {
      for (let i = 0; i < n; i++) {
        const [x0, z0] = planPoint(plan, bay.a0 + ((bay.a1 - bay.a0) * i) / n, r);
        const [x1, z1] = planPoint(plan, bay.a0 + ((bay.a1 - bay.a0) * (i + 1)) / n, r);
        add([x0, 0, z0], [x1, 0, z1], 1, 0.9, 0);
      }
    }
    for (const a of [bay.a0, bay.a1]) {
      const [x0, z0] = planPoint(plan, a, plan.inner);
      const [x1, z1] = planPoint(plan, a, 1);
      add([x0, 0, z0], [x1, 0, z1], 1, 0.9, 0);
    }
  }

  // The board's edge, a margin outside the plan.
  {
    const n = 96;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = planPoint(plan, (Math.PI * 2 * i) / n, 1.16);
      const [x1, z1] = planPoint(plan, (Math.PI * 2 * (i + 1)) / n, 1.16);
      add([x0, 0, z0], [x1, 0, z1], 1, 0.55, 0);
    }
  }

  // Footings: a square under every anchor, hatched on the far side of the board like a fixed support.
  const side = plan.pitch * 0.46;
  const half = side / 2;
  for (let id = 0; id < rig.files; id++) {
    const x = plan.anchorX[id]!;
    const z = plan.anchorZ[id]!;
    if (Number.isNaN(x)) continue;
    // Square aligned with the ring's tangent.
    const a = Math.atan2(-z / plan.radiusZ, x / plan.radiusX);
    const tx = -Math.sin(a);
    const tz = -Math.cos(a);
    const nx = -tz;
    const nz = tx;
    const corner = (u: number, v: number) => [x + tx * u + nx * v, 0, z + tz * u + nz * v];
    const c00 = corner(-half, -half);
    const c10 = corner(half, -half);
    const c11 = corner(half, half);
    const c01 = corner(-half, half);
    const isolated = model.nodes[id]!.kind === "isolated";
    const alpha = isolated ? 0.5 : 0.85;
    add(c00, c10, 1, alpha, 1);
    add(c10, c11, 1, alpha, 1);
    add(c11, c01, 1, alpha, 1);
    add(c01, c00, 1, alpha, 1);
    for (let k = 0; k < 3; k++) {
      const u = -half + (side * (k + 0.5)) / 3;
      const p = corner(u, 0);
      add(p, [p[0]! - tx * side * 0.32, side * 0.55, p[2]! - tz * side * 0.32], 1, 0.75, 0);
    }
  }

  // The level scale, to the right of the plan: a tick per level, a longer one every five.
  const scaleX = plan.radiusX * 1.16 + 0.9;
  const depth = model.maxLevel * unit;
  add([scaleX, 0, 0], [scaleX, -depth, 0], 1, 0.9, 0);
  const levels: (Anchor & { level: number })[] = [];
  for (let level = 0; level <= model.maxLevel; level++) {
    const y = -level * unit;
    const major = level % 5 === 0 || level === model.maxLevel;
    add([scaleX, y, 0], [scaleX + (major ? 0.5 : 0.24), y, 0], 1, major ? 0.95 : 0.7, 0);
    if (major) levels.push({ x: scaleX + 0.75, y, z: 0, level });
  }

  const count = lines.length;
  const p0 = new Float32Array(count * 3);
  const p1 = new Float32Array(count * 3);
  const width = new Float32Array(count);
  const alpha = new Float32Array(count);
  const tone = new Float32Array(count);
  lines.forEach((l, i) => {
    p0.set(l.slice(0, 3), i * 3);
    p1.set(l.slice(3, 6), i * 3);
    width[i] = l[6]!;
    alpha[i] = l[7]!;
    tone[i] = l[8]!;
  });

  const bays = plan.bays.map((bay) => {
    const [x, z] = planPoint(plan, (bay.a0 + bay.a1) / 2, 1.3);
    return { x, y: 0, z, name: bay.name, anchors: bay.anchors.length };
  });

  return { lines: { count, p0, p1, width, alpha, tone }, labels: { bays, levels, scaleX } };
}
