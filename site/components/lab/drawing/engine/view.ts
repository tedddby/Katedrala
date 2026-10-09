/**
 * The drawing's projection, shared by the WebGL shader, the 2D fallback, picking and the annotations so that
 * all of them agree to the pixel.
 *
 * Model space: x along the board (0 to its width), y up (a file hangs at y = -level), z across the board.
 * The view turns the model about the board line (the x axis) by `theta`, then projects orthographically:
 * at 0 the hanging elevation, at a quarter turn the plan of the board, at a half turn the standing elevation.
 */

export interface Camera {
  /** Screen x (CSS px) of model x = 0. */
  ox: number;
  /** Screen y (CSS px) of the board line (the ground line once turned over). */
  gy: number;
  /** CSS px per model unit (one level). */
  s: number;
  /** Turn about the board line, radians: 0 hanging, PI standing. */
  theta: number;
}

export interface Point {
  x: number;
  y: number;
  /** Toward the viewer, model units (larger is nearer). */
  depth: number;
}

export function project(cam: Camera, x: number, y: number, z: number, out: Point): Point {
  const c = Math.cos(cam.theta);
  const si = Math.sin(cam.theta);
  const yr = y * c - z * si;
  out.x = cam.ox + x * cam.s;
  out.y = cam.gy - yr * cam.s;
  out.depth = y * si + z * c;
  return out;
}

/** A rectangle on screen, CSS px. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The hanging model fills `box` from its top edge: the board on the top edge, `levels` below it. */
export function hangCamera(box: Box, width: number, levels: number): Camera {
  const s = Math.min(box.width / width, box.height / levels);
  return { ox: box.left + (box.width - width * s) / 2, gy: box.top, s, theta: 0 };
}

/** The standing model fills `box` from its bottom edge: the ground on the bottom edge. */
export function standCamera(box: Box, width: number, levels: number): Camera {
  const s = Math.min(box.width / width, box.height / levels);
  return {
    ox: box.left + (box.width - width * s) / 2,
    gy: box.top + box.height,
    s,
    theta: Math.PI,
  };
}

/** The plan of the board, centred in `box`. */
export function planCamera(box: Box, width: number, depth: number): Camera {
  const s = Math.min(box.width / width, box.height / depth);
  return {
    ox: box.left + (box.width - width * s) / 2,
    gy: box.top + box.height / 2,
    s,
    theta: Math.PI / 2,
  };
}

/**
 * The camera part way through the turn: hanging, plan and standing framings weighted by cos², sin² and cos²
 * of the turn (a partition of unity), so the board line travels down the sheet as the drawing turns over.
 */
export function turnCamera(
  hang: Camera,
  plan: Camera,
  stand: Camera,
  theta: number,
  out: Camera,
): Camera {
  const c2 = Math.cos(theta) ** 2;
  const s2 = 1 - c2;
  const first = theta <= Math.PI / 2;
  const a = first ? hang : stand;
  out.ox = a.ox * c2 + plan.ox * s2;
  out.gy = a.gy * c2 + plan.gy * s2;
  out.s = a.s * c2 + plan.s * s2;
  out.theta = theta;
  return out;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeInOutCubic = (v: number) => {
  const t = clamp01(v);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
/** Where `v` sits between `a` and `b`, clamped to [0, 1]. */
export const span = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
