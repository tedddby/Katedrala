import type { BoardLabels } from "./board";
import type { Built } from "./build";
import type { Profile } from "./config";
import { planPoint } from "./plan";

/**
 * Where the camera stands along the scroll, and when the board is turned over. The scroll only sets targets: the
 * stage eases the camera towards them, and the turn-over is an event the simulation plays out with its own spring
 * once the reader scrolls past it, so nothing is scrubbed frame by frame and nothing fights the reader.
 *
 * The camera never guesses a distance: every frame it fits the drawing (the board, the level scale and the hanging
 * form) into the frame the page leaves free for it, at the board's current angle. When the model turns sideways it
 * steps back, and it never crops the board or the ground.
 */

export interface CameraPose {
  /** Orbit around the structure (radians; 0 looks along -z at the open side of the plan). */
  readonly yaw: number;
  /** Elevation of the eye (radians; negative looks up from below). */
  readonly pitch: number;
  /** Distance as a multiple of the distance that just fits the drawing in its frame (1 fits, more leaves room). */
  readonly distance: number;
}

interface Key extends CameraPose {
  readonly at: number;
}

const DEG = Math.PI / 180;

/**
 * The turn-over is an event, as Gaudí's was: once the reader scrolls past the point where "Turn it over" comes into
 * view, the board is turned over, and the simulation's spring plays the turn out with the dynamics running; scroll
 * back above it and it turns back and hangs again. The gap between the two thresholds keeps a reader resting near
 * the point from turning it back and forth.
 */
export const FLIP_ON = 0.52;
export const FLIP_OFF = 0.47;
export function flipTarget(progress: number, turned: boolean): boolean {
  return turned ? progress > FLIP_OFF : progress >= FLIP_ON;
}

const DESKTOP: readonly Key[] = [
  // The hero: the model hangs beside the words, seen a little from below.
  { at: 0, yaw: -16 * DEG, pitch: -9 * DEG, distance: 1.0 },
  // Hung from its foundations: from well below, the plan overhead like a ceiling.
  { at: 0.2, yaw: -34 * DEG, pitch: -21 * DEG, distance: 1.0 },
  // Pull on any file: almost square on, so every weight is easy to reach.
  { at: 0.4, yaw: -8 * DEG, pitch: -5 * DEG, distance: 1.0 },
  // The turn-over: level with the pivot, to watch it turn.
  { at: FLIP_ON, yaw: 2 * DEG, pitch: 1 * DEG, distance: 1.02 },
  // Turned over: almost an elevation, as the photograph was turned.
  { at: 0.62, yaw: 10 * DEG, pitch: 5 * DEG, distance: 1.0 },
  // It stands, seen from above and to the right.
  { at: 0.8, yaw: 24 * DEG, pitch: 13 * DEG, distance: 1.0 },
  // The end: an elevation, almost square on.
  { at: 1, yaw: 6 * DEG, pitch: 5 * DEG, distance: 1.0 },
];

/** Phones keep the same flight, a little flatter (the frame is wide and short above the words). */
const MOBILE: readonly Key[] = DESKTOP.map((k) => ({ ...k, pitch: k.pitch * 0.8 }));

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function poseAt(progress: number, profile: Profile): CameraPose {
  const keys = profile === "mobile" ? MOBILE : DESKTOP;
  const p = Math.min(Math.max(progress, 0), 1);
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1]!.at) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const t = smooth(Math.min(Math.max((p - a.at) / (b.at - a.at), 0), 1));
  return {
    yaw: a.yaw + (b.yaw - a.yaw) * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    distance: a.distance + (b.distance - a.distance) * t,
  };
}

/** The standing structure's resting pose (reduced motion and the fallback show only this). */
export const END_PROGRESS = 0.86;
export function endPose(profile: Profile): CameraPose {
  return poseAt(END_PROGRESS, profile);
}

/** Vertical field of view, radians. */
export const FOV = 30 * DEG;

/** A rectangle of the stage in normalised device coordinates (y up). */
export interface ViewRect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/**
 * The part of the stage the drawing may use, from the stage's size in CSS pixels and where the words sit: beside
 * them on wide screens, above them on phones. Leaves room for the navigation and the title block.
 */
export function frameRect(
  profile: Profile,
  width: number,
  height: number,
  textRight: number,
  /** How far the structure stands (0 to 1): it then needs room for its notes, above the crown and under the ground. */
  standing = 0,
): ViewRect {
  const toX = (px: number) => (px / width) * 2 - 1;
  const toY = (px: number) => 1 - (px / height) * 2;
  if (profile === "mobile") {
    // Below the navigation and the three lines of the title block; above the words.
    const top = 124 + 40 * standing;
    const bottom = Math.max(top + 160, height * 0.6 - 22 * standing);
    return { x0: toX(18), x1: toX(width - 18), y0: toY(bottom), y1: toY(top) };
  }
  const left = Math.max(width * 0.44, Math.min(textRight + 40, width * 0.6));
  return {
    x0: toX(left),
    x1: toX(width - Math.min(120, width * 0.08)),
    y0: toY(height - 96 - 36 * standing),
    y1: toY(88 + 26 * standing),
  };
}

/** How far the structure stands, for the room its notes need: 0 while it hangs, 1 once it is turned over. */
export function standingOf(angle: number): number {
  return smooth(Math.min(Math.max((angle / Math.PI - 0.7) / 0.3, 0), 1));
}

/** Right edge of the words beside the stage (CSS px from the stage's left), so the drawing keeps clear of them. */
export function textRightOf(run: HTMLElement, stageLeft: number): number {
  let right = 0;
  for (const copy of run.querySelectorAll<HTMLElement>(".phx-copy")) {
    right = Math.max(right, copy.getBoundingClientRect().right - stageLeft);
  }
  return right;
}

/**
 * Points that bound the drawing, in the board's frame: the board's edge and the bay labels, the level scale and its
 * labels, and every weight of the cut form with room for the sag of its chains.
 */
export function hullOf(built: Built, labels: BoardLabels, profile: Profile): Float32Array {
  const { plan, rig, model, unit } = built;
  const points: number[] = [];
  for (let i = 0; i < 24; i++) {
    const [x, z] = planPoint(plan, (Math.PI * 2 * i) / 24, 1.16);
    points.push(x, 0, z);
  }
  for (const bay of labels.bays) points.push(bay.x, bay.y, bay.z);
  const depth = model.maxLevel * unit;
  // Room beyond the level scale for its labels ("level 15"): more on a phone, where a unit is fewer pixels.
  const room = profile === "mobile" ? 3.8 : 2.2;
  const sx = labels.scaleX;
  points.push(sx, 0, 0, sx + room, 0, 0, sx, -depth, 0, sx + room, -depth, 0);
  // Chains hang a little deeper than the cut form (slack and sag): about 6% at the bottom of the structure.
  for (let i = 0; i < rig.files; i++) {
    points.push(rig.target[i * 3]!, rig.target[i * 3 + 1]! * 1.06, rig.target[i * 3 + 2]!);
  }
  return Float32Array.from(points);
}

export interface Fit {
  /** Eye distance from the pivot. */
  readonly distance: number;
  /** Lens shift that centres the drawing in its frame, NDC. */
  readonly shiftX: number;
  readonly shiftY: number;
  /** Nearest and farthest depth of the drawing at that distance. */
  readonly near: number;
  readonly far: number;
}

/**
 * The distance at which the hull, turned by the board's angle about the pivot and seen from (yaw, pitch), just fits
 * the frame, times the pose's distance; and the lens shift that centres it there. Bisection on the distance: the
 * projected spans shrink as the eye steps back.
 */
export function fitView(
  hull: Float32Array,
  angle: number,
  pivotY: number,
  pose: CameraPose,
  aspect: number,
  rect: ViewRect,
  scratch: Float64Array,
): Fit {
  const n = hull.length / 3;
  const cy = Math.cos(pose.yaw);
  const sy = Math.sin(pose.yaw);
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  // Camera basis: e towards the eye, r to the right, u up (as three.js lookAt builds it with up = +y).
  const ex = cp * sy;
  const ey = sp;
  const ez = cp * cy;
  const ux = -sy * sp;
  const uy = cp;
  const uz = -cy * sp;
  const ky = 1 / Math.tan(FOV / 2);
  const kx = ky / aspect;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  let maxE = -Infinity;
  for (let i = 0; i < n; i++) {
    const bx = hull[i * 3]!;
    const by = hull[i * 3 + 1]! - pivotY;
    const bz = hull[i * 3 + 2]!;
    const wx = bx * ca - by * sa;
    const wy = bx * sa + by * ca;
    scratch[i * 3] = wx * cy - bz * sy;
    scratch[i * 3 + 1] = wx * ux + wy * uy + bz * uz;
    const e = wx * ex + wy * ey + bz * ez;
    scratch[i * 3 + 2] = e;
    if (e > maxE) maxE = e;
  }
  let x0 = 0;
  let x1 = 0;
  let y0 = 0;
  let y1 = 0;
  const project = (d: number) => {
    x0 = Infinity;
    x1 = -Infinity;
    y0 = Infinity;
    y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const depth = d - scratch[i * 3 + 2]!;
      const px = (kx * scratch[i * 3]!) / depth;
      const py = (ky * scratch[i * 3 + 1]!) / depth;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
  };
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  let lo = maxE + 0.5;
  let hi = lo + 400;
  for (let k = 0; k < 36; k++) {
    const mid = (lo + hi) / 2;
    project(mid);
    if (x1 - x0 <= w && y1 - y0 <= h) hi = mid;
    else lo = mid;
  }
  const d = hi * pose.distance;
  project(d);
  let near = Infinity;
  let far = -Infinity;
  for (let i = 0; i < n; i++) {
    const depth = d - scratch[i * 3 + 2]!;
    if (depth < near) near = depth;
    if (depth > far) far = depth;
  }
  return {
    distance: d,
    shiftX: (rect.x0 + rect.x1) / 2 - (x0 + x1) / 2,
    shiftY: (rect.y0 + rect.y1) / 2 - (y0 + y1) / 2,
    near,
    far,
  };
}
