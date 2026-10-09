/**
 * The film's clock and its camera. The film is one pinned track; global progress P runs from 0 where the stage pins
 * to 1 where it lets go, and the clock maps it to an act and that act's local time t (0..1). Every beat of Act I is a
 * span of its local t (the BEAT table, the hanging-chain prototype's beats as they were). The WebGL stage, the
 * physics, the still drawing and the DOM choreography all read this one file, so captions, camera and structure never
 * drift apart. Pure functions, no three.js: the server uses it to size the track and place the anchors.
 */
import { ACT_TIMINGS } from "./acts/timing";
import type { ActId, ActTiming, CameraKey } from "./act";
import { LEVEL_HEIGHT, type HangingModel } from "./model";

/* ------------------------------------------------------------------------------------------------------------
 * Act I, "See what your code stands on.": its beats in local t.
 * ---------------------------------------------------------------------------------------------------------- */

export const BEAT = {
  /** The plan on the board: the hero frame. */
  plan: 0.04,
  /** The first level is released here; the last one at dropEnd. */
  dropStart: 0.07,
  dropEnd: 0.27,
  /** The whole model hangs and breathes. */
  hangEnd: 0.4,
  /** The camera circles it. */
  circleEnd: 0.555,
  /** Sway dies out: the form is fixed, as in Gaudí's photograph. */
  freezeEnd: 0.59,
  /** Turned over. */
  turnEnd: 0.69,
  /** Load runs down through the standing structure to its foundations. */
  waveEnd: 0.745,
  /**
   * The camera pushes into the base (a dolly zoom), then climbs the longest load path: 650 px of scroll at
   * 1440 x 900, two or three levels a wheel notch, so the level gauge can be read on the way up.
   */
  zoomEnd: 0.785,
  riseEnd: 0.895,
  /** Lands on the crown and holds it: the crown hold, long enough to read its caption, then Act II begins. */
  land: 0.93,
  end: 1,
} as const;

/**
 * The opening, in seconds from the stage's first frame, before any scroll. The pen starts on the first frame and
 * leaves it fast (ease-out), so ink is on the sheet at once; the plan is closed within a second and the first
 * weights drop a moment later.
 */
export const INTRO = {
  /** A pen draws the plan round the board. */
  penStart: 0,
  pen: 0.9,
  /** Each foundation lands on the plan this long after the pen has passed its place. */
  landLag: 0.05,
  /** Then the first weights are let go: the hero frame has the first level hanging. */
  release: 1.25,
} as const;

/**
 * Act I's timing. Its length is the prototype's pinned track (760vh less the frame on wide windows, 680vh on tall
 * ones), so its local t is exactly the prototype's progress. Space, Page Down and Page Up stop at one beat each,
 * with its caption fully in view (a page of scroll would otherwise skip most of a beat); wheel, touch and arrow
 * keys scroll freely. The anchor (#film-start) is the plan caption.
 */
export const HANG: ActTiming = {
  id: "hang",
  length: { wide: 6.6, tall: 5.8 },
  stops: [
    0,
    0.085,
    0.165,
    0.25,
    0.345,
    0.48,
    BEAT.turnEnd - 0.008,
    BEAT.waveEnd - 0.012,
    BEAT.zoomEnd + 0.004,
    BEAT.riseEnd,
    BEAT.land + 0.035,
    BEAT.end,
  ],
  anchor: 0.085,
};

/** The acts in order: Act I, then Acts II, III and the landing (acts/timing.ts). */
export const ACTS: readonly ActTiming[] = [HANG, ...ACT_TIMINGS];

/** Levels already hanging in the hero frame (released by the opening, not by scroll). */
export const HERO_LEVELS = 1;

/* ------------------------------------------------------------------------------------------------------------
 * The clock: global progress P to (act, local t), and back.
 * ---------------------------------------------------------------------------------------------------------- */

export type Framing = "wide" | "tall";

/** An act's span on the track, in viewports of pinned scroll from where the stage pins. */
export interface ActSpan {
  readonly id: ActId;
  readonly index: number;
  readonly from: number;
  readonly to: number;
  readonly length: number;
}

/** Where the film is: the act (its index in ACTS) and its local time. */
export interface ActPosition {
  index: number;
  id: ActId;
  t: number;
}

export interface Clock {
  readonly framing: Framing;
  readonly spans: readonly ActSpan[];
  /** Pinned scroll, in viewports: the track is one viewport longer (the frame itself). */
  readonly length: number;
  /** The act at global progress P (0..1, clamped) and its local time; spans are half open, the last one closed. */
  at(P: number, out?: ActPosition): ActPosition;
  /** Global progress of local time t (clamped to 0..1) of act `index`. */
  progressOf(index: number, t: number): number;
  /** Every act's page-key stops in global progress, ascending, without repeats. */
  readonly stops: readonly number[];
  /** Where act `index`'s anchor lands, in viewports of pinned scroll. */
  anchorOf(index: number): number;
}

/** The clock for one framing (lengths differ between wide windows and phones in portrait). */
export function clockOf(framing: Framing, acts: readonly ActTiming[] = ACTS): Clock {
  const spans: ActSpan[] = [];
  let at = 0;
  acts.forEach((act, index) => {
    const length = Math.max(1e-6, act.length[framing]);
    spans.push({ id: act.id, index, from: at, to: at + length, length });
    at += length;
  });
  const length = at;
  const progressOf = (index: number, t: number) => {
    const span = spans[Math.min(spans.length - 1, Math.max(0, index))]!;
    return (span.from + clamp01(t) * span.length) / length;
  };
  const stops: number[] = [];
  acts.forEach((act, index) => {
    for (const s of act.stops) {
      const P = progressOf(index, s);
      if (stops.length === 0 || P - stops[stops.length - 1]! > 1e-6) stops.push(P);
    }
  });
  stops.sort((a, b) => a - b);
  return {
    framing,
    spans,
    length,
    at(P, out = { index: 0, id: spans[0]!.id, t: 0 }) {
      const s = clamp01(P) * length;
      let i = 0;
      while (i < spans.length - 1 && s >= spans[i]!.to) i++;
      const span = spans[i]!;
      out.index = i;
      out.id = span.id;
      out.t = clamp01((s - span.from) / span.length);
      return out;
    },
    progressOf,
    stops,
    anchorOf(index) {
      const span = spans[index]!;
      return span.from + clamp01(acts[index]!.anchor) * span.length;
    },
  };
}

const clocks: Partial<Record<Framing, Clock>> = {};

/**
 * The act at global progress P (0..1) and its local time, for one framing: the clock of the film's acts, built once
 * per framing. Contiguous and monotone over [0, 1]; the stops of the page keys are `clockOf(framing).stops`.
 */
export function actAt(P: number, framing: Framing): ActPosition {
  return (clocks[framing] ??= clockOf(framing)).at(P);
}

/* ------------------------------------------------------------------------------------------------------------
 * Easing and Act I's shape over its local t.
 * ---------------------------------------------------------------------------------------------------------- */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Strong ease-in-out, the cubic-bezier(0.77, 0, 0.175, 1) family, for authored moves. */
export function easeInOut(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 16 * c ** 5 : 1 - (-2 * c + 2) ** 5 / 2;
}

/** Exponential ease-out for arrivals. */
export function easeOut(t: number): number {
  const c = clamp01(t);
  return c === 1 ? 1 : 1 - 2 ** (-10 * c);
}

/**
 * How far round the plan the pen has gone, t in [0, 1] of its time: a quadratic ease-out, the stroke of a hand that
 * starts with speed and slows to close the loop. Ink is visible from the first frame (a quintic ease-in-out left the
 * sheet blank for its first quarter).
 */
export function penOf(t: number): number {
  const c = clamp01(t);
  return 1 - (1 - c) * (1 - c);
}

/** When the pen reaches q (0..1 round the plan), in seconds after the stage's first frame. */
export function penReaches(q: number): number {
  // The inverse of penOf.
  return INTRO.penStart + (1 - Math.sqrt(1 - clamp01(q))) * INTRO.pen;
}

/** Act I's local t at which `level` (1..maxLevel) is released to drop (the hero's levels: before any scroll). */
export function releaseAt(level: number, maxLevel: number): number {
  if (level <= HERO_LEVELS) return -1;
  const span = Math.max(1, maxLevel - HERO_LEVELS - 1);
  return BEAT.dropStart + ((level - HERO_LEVELS - 1) / span) * (BEAT.dropEnd - BEAT.dropStart);
}

/** The deepest level released at Act I's local t (0 when only the board is set out). */
export function releasedLevel(t: number, maxLevel: number): number {
  let level = 0;
  for (let l = 1; l <= maxLevel; l++) if (t >= releaseAt(l, maxLevel)) level = l;
  return level;
}

/** 0 while the model sways, 1 once its form is fixed for the turn. */
export function freezeOf(t: number): number {
  return smoothstep(BEAT.circleEnd, BEAT.freezeEnd, t);
}

/** Fraction of the turn-over, eased: 0 hanging, 1 standing. */
export function turnOf(t: number): number {
  return easeInOut((t - BEAT.freezeEnd) / (BEAT.turnEnd - BEAT.freezeEnd));
}

/** The moment of the flip: every member is active, so the whole structure takes the load colour, briefly. */
export function flashOf(t: number): number {
  const mid = (BEAT.freezeEnd + BEAT.turnEnd) / 2;
  const span = (BEAT.turnEnd - BEAT.freezeEnd) * 0.62;
  const x = (t - mid) / span;
  return Math.abs(x) >= 1 ? 0 : (1 - x * x) ** 2;
}

/** The load wave: level of its front, from the crown (maxLevel) down to the ground (-2 when it has passed). */
export function waveFront(t: number, maxLevel: number): number {
  const k = clamp01((t - (BEAT.turnEnd - 0.012)) / (BEAT.waveEnd - BEAT.turnEnd));
  return maxLevel + 1 - k * (maxLevel + 3);
}

/** Breathing amplitude: only while the whole model hangs free. */
export function windOf(t: number): number {
  return smoothstep(BEAT.dropEnd - 0.02, BEAT.dropEnd + 0.05, t) * (1 - freezeOf(t));
}

/** Opacity of something shown between `a` and `b`, fading over `f` at each end. */
export function window01(t: number, a: number, b: number, f = 0.016): number {
  if (t <= a - f || t >= b + f) return 0;
  return Math.min(smoothstep(a - f, a + f, t), 1 - smoothstep(b - f, b + f, t));
}

/**
 * A monotone cubic (Fritsch-Carlson) track over several channels. Keys are `[p, ...values]`, sorted by p.
 * Consecutive equal values hold perfectly still; no channel overshoots its neighbouring keys.
 */
export class Track {
  private readonly ps: Float64Array;
  private readonly vs: Float64Array[];
  private readonly ms: Float64Array[];
  readonly width: number;

  constructor(keys: readonly (readonly number[])[]) {
    const k = keys.length;
    this.width = keys[0]!.length - 1;
    this.ps = Float64Array.from(keys, (key) => key[0]!);
    this.vs = [];
    this.ms = [];
    for (let c = 0; c < this.width; c++) {
      const v = Float64Array.from(keys, (key) => key[c + 1]!);
      const d = new Float64Array(Math.max(1, k - 1));
      for (let i = 0; i < k - 1; i++)
        d[i] = (v[i + 1]! - v[i]!) / Math.max(1e-9, this.ps[i + 1]! - this.ps[i]!);
      const m = new Float64Array(k);
      for (let i = 0; i < k; i++) {
        if (i === 0) m[i] = d[0]!;
        else if (i === k - 1) m[i] = d[k - 2]!;
        else m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
      }
      for (let i = 0; i < k - 1; i++) {
        if (d[i] === 0) {
          m[i] = 0;
          m[i + 1] = 0;
          continue;
        }
        const a = m[i]! / d[i]!;
        const b = m[i + 1]! / d[i]!;
        const s = a * a + b * b;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          m[i] = t * a * d[i]!;
          m[i + 1] = t * b * d[i]!;
        }
      }
      this.vs.push(v);
      this.ms.push(m);
    }
  }

  at(p: number, out: number[]): number[] {
    const ps = this.ps;
    const k = ps.length;
    let i = 0;
    if (p <= ps[0]!) i = -1;
    else if (p >= ps[k - 1]!) i = k;
    else while (i < k - 2 && p > ps[i + 1]!) i++;
    for (let c = 0; c < this.width; c++) {
      const v = this.vs[c]!;
      if (i === -1) out[c] = v[0]!;
      else if (i === k) out[c] = v[k - 1]!;
      else {
        const h = ps[i + 1]! - ps[i]!;
        const t = (p - ps[i]!) / h;
        const t2 = t * t;
        const t3 = t2 * t;
        const m = this.ms[c]!;
        out[c] =
          (2 * t3 - 3 * t2 + 1) * v[i]! +
          (t3 - 2 * t2 + t) * h * m[i]! +
          (-2 * t3 + 3 * t2) * v[i + 1]! +
          (t3 - t2) * h * m[i + 1]!;
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------------------------------------------------
 * Space. Model space (model.ts): the board is y = 0 and files hang below it. World space while hanging: the
 * board is lifted to y = height, so the lowest file is near the floor of the frame. The turn rotates the model
 * by pi about a horizontal axis through y = height / 2: the board lands on y = 0 as the ground and the crown
 * stands at y = height. The axis is the camera's line of sight at the turn (z on wide screens, x on tall ones),
 * so the model turns over in the picture plane, the way Gaudí turned his photograph of the hanging model over.
 * Every act after Act I films the standing structure (turn 1).
 * ---------------------------------------------------------------------------------------------------------- */

export function modelHeight(model: HangingModel): number {
  return model.maxLevel * LEVEL_HEIGHT;
}

/** The horizontal axis the model turns about: the camera looks along it during the turn. */
export function turnAxis(framing: Framing): "x" | "z" {
  return framing === "wide" ? "z" : "x";
}

/** The model-to-world matrix (column-major, three.js order) at turn fraction `turn`. */
export function modelMatrix(
  height: number,
  turn: number,
  axis: "x" | "z",
  out: Float32Array | number[],
): void {
  const a = Math.PI * turn;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const h2 = height / 2;
  // world = R (m + (0, h/2, 0)) + (0, h/2, 0)
  out.fill(0);
  if (axis === "x") {
    // R about x: y' = c y - s z, z' = s y + c z
    out[0] = 1;
    out[5] = c;
    out[6] = s;
    out[9] = -s;
    out[10] = c;
    out[12] = 0;
    out[13] = c * h2 + h2;
    out[14] = s * h2;
  } else {
    // R about z: x' = c x - s y, y' = s x + c y
    out[0] = c;
    out[1] = s;
    out[4] = -s;
    out[5] = c;
    out[10] = 1;
    out[12] = -s * h2;
    out[13] = c * h2 + h2;
  }
  out[15] = 1;
}

/** Where file v stands once the model is turned over (world space). */
export function standingOf(
  model: HangingModel,
  framing: Framing,
  v: number,
): [number, number, number] {
  const m = new Float32Array(16);
  modelMatrix(modelHeight(model), 1, turnAxis(framing), m);
  const x = model.rest[v * 3]!;
  const y = model.rest[v * 3 + 1]!;
  const z = model.rest[v * 3 + 2]!;
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ];
}

export interface CameraState {
  eye: [number, number, number];
  target: [number, number, number];
  /** Vertical field of view, degrees. */
  fov: number;
  /** Off-axis lens shift in normalized device units (moves the picture, keeps the perspective). */
  lensX: number;
  lensY: number;
}

export function emptyCamera(): CameraState {
  return { eye: [0, 0, 0], target: [0, 0, 0], fov: 30, lensX: 0, lensY: 0 };
}

/**
 * A camera from a key's values (everything after t: yaw, pitch, distance, target, fov, lens), as an orbit round its
 * target.
 */
export function cameraFrom(values: ArrayLike<number>, out: CameraState): CameraState {
  const yaw = values[0]!;
  const pitch = values[1]!;
  const dist = values[2]!;
  const tx = values[3]!;
  const ty = values[4]!;
  const tz = values[5]!;
  const cp = Math.cos(pitch);
  out.target[0] = tx;
  out.target[1] = ty;
  out.target[2] = tz;
  out.eye[0] = tx + dist * cp * Math.sin(yaw);
  out.eye[1] = ty + dist * Math.sin(pitch);
  out.eye[2] = tz + dist * cp * Math.cos(yaw);
  out.fov = values[6]!;
  out.lensX = values[7]!;
  out.lensY = values[8]!;
  return out;
}

/** Every file v stands on, down to the foundations, as indices. */
function supportsOf(model: HangingModel, v: number): number[] {
  const seen = new Uint8Array(model.n);
  const stack = [v];
  const out: number[] = [];
  while (stack.length > 0) {
    const u = stack.pop()!;
    for (const k of model.out[u]!) {
      const w = model.edgeB[k]!;
      if (seen[w] === 1 || w === v) continue;
      seen[w] = 1;
      out.push(w);
      stack.push(w);
    }
  }
  return out;
}

/**
 * Act I's camera keys, for one model and one framing, in its local t. Shots up to the turn are authored; the climb
 * and the crown hold are derived from the model: the climb follows the longest load path (smoothed) level by level,
 * the crown hold frames the crown with everything it stands on.
 */
export function hangCameraKeys(model: HangingModel, framing: Framing): CameraKey[] {
  const H = modelHeight(model);
  const wide = framing === "wide";
  // Yaw 0 looks along -z (x across the screen); tall screens look along -x so the narrow span fills them.
  const y0 = wide ? 0 : Math.PI / 2;
  const PI = Math.PI;

  // The climb: the longest load path standing, smoothed so the camera does not zigzag.
  const spine = model.spine.map((v) => standingOf(model, framing, v));
  const smooth = spine.map((_, i) => {
    let sx = 0;
    let sz = 0;
    let sw = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(spine.length - 1, i + 2); j++) {
      const w = 1 / (1 + Math.abs(i - j));
      sx += spine[j]![0] * w;
      sz += spine[j]![2] * w;
      sw += w;
    }
    return [sx / sw, spine[i]![1], sz / sw] as const;
  });

  // The crown hold: the crown and everything it stands on, framed whole.
  const lit = [model.crown, ...supportsOf(model, model.crown)].map((v) =>
    standingOf(model, framing, v),
  );
  let cx = 0;
  let cz = 0;
  for (const q of lit) {
    cx += q[0];
    cz += q[2];
  }
  cx /= lit.length;
  cz /= lit.length;

  const keys: CameraKey[] = wide
    ? [
        // The plan on its board, from above, down its long axis (the nave): the whole board sits in the seven
        // columns right of the headline, with a margin, at the reference aspect (lensFov keeps it there).
        [0.0, y0 - 1.0, 0.5, 46.6, 0, H - 1.8, 0, 32, 0.484, 0.053],
        [BEAT.plan, y0 - 0.9, 0.46, 46, 0, H - 2.1, 0, 32, 0.42, 0.04],
        // Down past the edge of the board, swinging round to face the nave as the weights drop.
        [0.1, y0 - 0.5, 0.12, 42, 0, H - 3.6, 0, 32, 0.26, 0],
        [0.17, y0 - 0.18, -0.03, 43, 0, H - 5.6, 0, 31, 0.18, 0],
        [BEAT.dropEnd, y0 + 0.08, -0.07, 45, 0, H - 7.8, 0, 31, 0.16, 0],
        // It hangs and breathes; the camera leans in.
        [BEAT.hangEnd, y0 + 0.36, -0.06, 40, 0, H - 7.6, 0, 31, 0.15, 0],
        // Around it, to stand side-on for the photograph.
        [0.475, y0 + 1.62, 0.05, 44, 0, H / 2 + 0.4, 0, 31, 0.1, 0],
        [BEAT.circleEnd, y0 + PI - 0.14, 0.02, 47, 0, H / 2, 0, 31, 0.08, 0],
        // Still for the photograph, then the turn in the picture plane.
        [BEAT.freezeEnd, y0 + PI - 0.14, 0.02, 47.5, 0, H / 2, 0, 31, 0.08, 0],
        // Half way over the model is at its widest across the frame: the camera gives it room.
        [(BEAT.freezeEnd + BEAT.turnEnd) / 2, y0 + PI - 0.12, 0.025, 57, 0, H / 2, 0, 31, 0.12, 0],
        [BEAT.turnEnd, y0 + PI - 0.1, 0.03, 46.5, 0, H / 2, 0, 31, 0.16, 0],
        // Load runs down; the camera rises a little to show the arches.
        [BEAT.waveEnd, y0 + PI + 0.16, 0.14, 48, 0, H / 2 - 0.8, 0, 32, 0.38, 0],
      ]
    : [
        // Phones: the whole plan across the width, below the headline and the actions.
        [0.0, y0 - 0.3, 0.6, 67.8, 0, H - 2.2, 0, 36, -0.032, -0.4],
        [BEAT.plan, y0 - 0.26, 0.54, 66, 0, H - 2.4, 0, 36, -0.02, -0.3],
        [0.1, y0 - 0.18, 0.1, 56, 0, H - 4.2, 0, 37, 0, -0.08],
        [0.17, y0 - 0.12, -0.03, 58, 0, H - 6, 0, 38, 0, 0.02],
        [BEAT.dropEnd, y0 + 0.08, -0.07, 62, 0, H - 7.8, 0, 38, 0, 0.04],
        [BEAT.hangEnd, y0 + 0.34, -0.05, 55, 0, H - 7.6, 0, 38, 0, 0.04],
        [0.475, y0 + 1.6, 0.05, 59, 0, H / 2 + 0.4, 0, 38, 0, 0.04],
        [BEAT.circleEnd, y0 + PI - 0.14, 0.02, 64, 0, H / 2, 0, 38, 0, 0.04],
        [BEAT.freezeEnd, y0 + PI - 0.14, 0.02, 65, 0, H / 2, 0, 38, 0, 0.04],
        [(BEAT.freezeEnd + BEAT.turnEnd) / 2, y0 + PI - 0.12, 0.025, 74, 0, H / 2, 0, 38, 0, 0.05],
        [BEAT.turnEnd, y0 + PI - 0.1, 0.03, 64, 0, H / 2, 0, 38, 0, 0.06],
        [BEAT.waveEnd, y0 + PI + 0.16, 0.14, 58, 0, H / 2 - 0.8, 0, 38, 0, 0.06],
      ];

  // The climb: a crane shot up the longest load path, level by level, beside the structure and circling it a
  // little as it rises, so the levels slide past one another; the path is lit, the structure stays in view.
  const steps = smooth.length;
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1);
    const t = BEAT.zoomEnd + k * (BEAT.riseEnd - BEAT.zoomEnd);
    const s = smooth[i]!;
    const yaw = y0 + PI + 0.35 + k * 1.25;
    const pitch = -0.1 + k * 0.04;
    const reach = wide ? 13 : 17;
    const fov = (wide ? 52 : 58) - k * 6;
    keys.push([t, yaw, pitch, reach, s[0], s[1] + 2, s[2], fov, wide ? 0.12 : 0, wide ? 0 : 0.04]);
  }
  // The crown hold: the crown with its whole load path in view, the caption beside it.
  const yawLand = y0 + PI + 2.1;
  if (wide) {
    keys.push(
      [BEAT.land, yawLand, 0.12, 44, cx, H * 0.47, cz, 34, 0.36, 0],
      [BEAT.end, yawLand + 0.22, 0.15, 46, cx, H * 0.47, cz, 34, 0.38, 0],
    );
  } else {
    // Phones: the crown and its load path between the bar and the caption at the foot of the frame.
    keys.push(
      [BEAT.land, yawLand, 0.12, 67, cx, H * 0.5, cz, 40, 0, 0.16],
      [BEAT.end, yawLand + 0.22, 0.15, 69, cx, H * 0.5, cz, 40, 0, 0.17],
    );
  }
  return keys.sort((a, b) => a[0] - b[0]);
}

/**
 * The still frame used under reduced motion and by the 2D fallback: the standing structure at three-quarters,
 * right of the headline on wide screens (its ground clear of the title block in the corner), below the headline
 * and the actions on phones.
 */
export function stillCamera(model: HangingModel, framing: Framing): CameraState {
  const H = modelHeight(model);
  const wide = framing === "wide";
  const yaw = (wide ? 0 : Math.PI / 2) + Math.PI + 0.42;
  const pitch = 0.14;
  const dist = wide ? 47 : 62;
  const target: [number, number, number] = [0, H / 2 - 0.6, 0];
  return {
    eye: [
      target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
      target[1] + dist * Math.sin(pitch),
      target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
    ],
    target,
    fov: wide ? 31 : 38,
    lensX: wide ? 0.3 : 0,
    lensY: wide ? 0.065 : -0.27,
  };
}

/**
 * A key plan: the standing structure seen steeply from above, its plan's long axis across the picture, centred. For
 * a small still drawing (the 2D fallback's setCamera); the levels read as rings of files rising towards the eye.
 */
export function planCamera(model: HangingModel): CameraState {
  const H = modelHeight(model);
  const pitch = 1.18;
  // The board's long axis fills about 70 percent of a 16:10 frame; narrower frames keep that width (lensFov).
  const dist = 44;
  const target: [number, number, number] = [0, H * 0.3, 0];
  return {
    eye: [target[0], target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(pitch)],
    target,
    fov: 28,
    lensX: 0,
    lensY: 0,
  };
}

/** The aspect ratio each framing's shots are composed for (1440 x 900, and 390 x 844). */
const REFERENCE_ASPECT: Record<Framing, number> = { wide: 1.6, tall: 0.462 };

/**
 * The vertical field of view for a screen narrower than the one a framing was composed for: the lens widens so
 * the picture keeps its width (a 4:3 laptop sees what a 16:10 one sees, with more room above and below).
 */
export function lensFov(fov: number, aspect: number, framing: Framing): number {
  const reference = REFERENCE_ASPECT[framing];
  if (aspect >= reference) return fov;
  return (Math.atan(Math.tan((fov * Math.PI) / 360) * (reference / aspect)) * 360) / Math.PI;
}

/**
 * Camera keys that hold one shot for a whole act: from the previous act's last key to the same key at t 1. For an
 * act that keeps the camera where it is (and for the typed stubs).
 */
export function holdKeys(from: CameraKey | null): CameraKey[] {
  if (from === null) throw new Error("holdKeys: the first act needs keys of its own");
  const values = from.slice(1) as number[];
  return [[0, ...values] as unknown as CameraKey, [1, ...values] as unknown as CameraKey];
}

/** The framing a frame of this size is composed in: wide from an aspect of 0.95 up, tall below it. */
export function framingOf(width: number, height: number): Framing {
  return width / Math.max(1, height) >= 0.95 ? "wide" : "tall";
}

/**
 * The window's framing, as the film's stylesheet chooses its layout (the same split, on the window's aspect): the
 * director and the still controller frame the drawing with it, so words and drawing are always composed for the same
 * framing. A frame capped in height (the still layout's, at 64rem) can be wider than the window it is in, so its own
 * aspect is not the measure.
 */
export const TALL_MEDIA = "(max-aspect-ratio: 949/1000)";
