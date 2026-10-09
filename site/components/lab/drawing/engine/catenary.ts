/**
 * A chain of length L hanging between two points takes the shape of a catenary, y = a·cosh((x − x0)/a) + c,
 * in the vertical plane through both ends. These helpers solve its parameters on the CPU (once per chain per
 * frame) and sample it by arc length, the same way the vertex shader does, so a slack chain draws as an even
 * loop and a taut one as a straight line.
 *
 * Line record (16 floats, one instance of the line shader):
 *   [0..3]   P1.x, P1.y, P1.z, a         (a = 0: straight, drawn from P1 to P2)
 *   [4..7]   dirX, dirZ, x0, sA          (straight: P2.x, P2.y, P2.z, 0)
 *   [8..11]  sB, width, alpha, lit        (set by the caller; lit: the share of the line, from P1, in load blue)
 *   [12..15] r, g, b, depth fade         (set by the caller)
 */

export const RECORD = 16;

/** A straight line record from P1 to P2 (positions only; the caller sets width, alpha, lit and colour). */
export function straight(
  out: Float32Array,
  o: number,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
): void {
  out[o] = x1;
  out[o + 1] = y1;
  out[o + 2] = z1;
  out[o + 3] = 0;
  out[o + 4] = x2;
  out[o + 5] = y2;
  out[o + 6] = z2;
  out[o + 7] = 0;
  out[o + 8] = 0;
}

/**
 * The catenary parameter: the root u > 0 of sinh(u) = r·u, for r = span / h > 1. Newton's method inside a
 * bracket that always holds the root (f is convex and changes sign once), so a poor start, such as last frame's
 * answer for a chain that has since pulled taut, costs a few bisections instead of a wrong answer.
 */
function catenaryRoot(r: number, guess: number): number {
  let lo = 0;
  // sinh(u)/u passes r before 2·ln(2r) + 2 for every r > 1.
  let hi = 2 * Math.log(2 * r) + 2;
  let u =
    guess > lo && guess < hi
      ? guess
      : r < 3
        ? Math.sqrt(6 * (r - 1))
        : Math.log(2 * r) + Math.log(Math.log(2 * r));
  for (let i = 0; i < 60; i++) {
    const f = Math.sinh(u) - r * u;
    // A billionth of the chain's span: far below a device pixel at any scale the drawing reaches.
    if (Math.abs(f) <= 1e-9 * r * u) break;
    if (f > 0) hi = u;
    else lo = u;
    const df = Math.cosh(u) - r;
    const next = df > 0 ? u - f / df : Number.NaN;
    u = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return u;
}

/**
 * Solves the catenary of a chain of `length` between P1 and P2 into the record at `o`. `warm`, when given, keeps
 * the solution parameter per chain (index `k`) between frames: a moving chain changes little from one frame to
 * the next, so the solve usually restarts next to the answer.
 */
export function solveCatenary(
  out: Float32Array,
  o: number,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  length: number,
  warm?: Float64Array,
  k = 0,
): void {
  const hx = x2 - x1;
  const hz = z2 - z1;
  let h = Math.hypot(hx, hz);
  const v = y2 - y1;
  const d = Math.hypot(h, v);
  if (length <= d * (1 + 1e-4) || d < 1e-6) {
    straight(out, o, x1, y1, z1, x2, y2, z2);
    return;
  }
  const dirX = h > 1e-9 ? hx / h : 1;
  const dirZ = h > 1e-9 ? hz / h : 0;
  const span = Math.sqrt(length * length - v * v);
  // Nearly vertical slack: keep a hair of horizontal span so the loop stays a loop.
  h = Math.max(h, span / 4000);
  const u = catenaryRoot(span / h, warm !== undefined ? warm[k]! : 0);
  if (warm !== undefined) warm[k] = u;
  const a = h / (2 * u);
  const x0 = (h - a * Math.log((length + v) / (length - v))) / 2;
  const sA = a * Math.sinh(-x0 / a);
  const sB = a * Math.sinh((h - x0) / a);
  // A chain far from the vertex of its catenary is straight to well under a pixel, and the GPU's 32-bit floats
  // cannot hold its arc-length coordinates (they dwarf its length): draw it straight.
  if (!(Math.abs(sA) <= 64 * length && Math.abs(sB) <= 64 * length)) {
    straight(out, o, x1, y1, z1, x2, y2, z2);
    return;
  }
  out[o] = x1;
  out[o + 1] = y1;
  out[o + 2] = z1;
  out[o + 3] = a;
  out[o + 4] = dirX;
  out[o + 5] = dirZ;
  out[o + 6] = x0;
  out[o + 7] = sA;
  out[o + 8] = sB;
}

/**
 * Length of a chain of self-weight `w` (lines of code per level unit) between two points `h` apart
 * horizontally and `v` vertically, when its horizontal tension is `tension`: a catenary with a = H / w.
 * A heavily loaded chain is all but straight; a lightly loaded one sags.
 */
export function sagLength(h: number, v: number, tension: number, w: number): number {
  if (h < 1e-9) return Math.abs(v);
  const a = tension / w;
  if (a <= 1e-9) return Infinity;
  const x = Math.min(h / (2 * a), 12);
  const span = 2 * a * Math.sinh(x);
  return Math.sqrt(v * v + span * span);
}

/** The point at `t` (0 at P1, 1 at P2) along the chain, by arc length. */
export function sampleCatenary(
  rec: Float32Array,
  o: number,
  t: number,
  into: Float64Array | Float32Array,
  k: number,
): void {
  const a = rec[o + 3]!;
  const x1 = rec[o]!;
  const y1 = rec[o + 1]!;
  const z1 = rec[o + 2]!;
  if (a === 0) {
    into[k] = x1 + (rec[o + 4]! - x1) * t;
    into[k + 1] = y1 + (rec[o + 5]! - y1) * t;
    into[k + 2] = z1 + (rec[o + 6]! - z1) * t;
    return;
  }
  const sA = rec[o + 7]!;
  const sB = rec[o + 8]!;
  // Arc length from P1, and the height gained over it: sqrt(a² + s²) − sqrt(a² + sA²), in a form that does not
  // cancel when both terms are large.
  const ds = (sB - sA) * t;
  const s = sA + ds;
  const X = rec[o + 6]! + a * Math.asinh(s / a);
  const Y = (ds * (s + sA)) / (Math.sqrt(a * a + s * s) + Math.sqrt(a * a + sA * sA));
  into[k] = x1 + rec[o + 4]! * X;
  into[k + 1] = y1 + Y;
  into[k + 2] = z1 + rec[o + 5]! * X;
}
