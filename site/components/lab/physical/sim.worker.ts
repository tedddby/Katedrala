/**
 * The simulation, off the main thread. It builds Gaudí's model from Katedrala's analysis of CodeVerse, drops it,
 * lets it hang, and turns the board over when the page asks; every frame it hands back the particle positions and
 * the force in every segment.
 */
import { buildAll, type Built } from "./build";
import { DROP, FLIP, GRAVITY, SUBSTEPS } from "./config";
import type { GraphData } from "./model";
import {
  texRows,
  TEX_WIDTH,
  type FrameMessage,
  type FromWorker,
  type InitMessage,
  type ToWorker,
} from "./protocol";
import { settle } from "./rig";
import { Sim } from "./sim";

interface WorkerScope {
  postMessage(message: FromWorker, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;

/** Steadying before the photograph: damping (1/s) and the most frames it may take (more while the drop is on). */
const STEADY_DAMPING = 9;
const STEADY_MAX = 24;
const STEADY_MAX_DROP = 120;

let built: Built | null = null;
let sim: Sim | null = null;
let positionLength = 0;
let forceLength = 0;

/** Seconds since the drop began. */
let time = 0;
/** Per file: when its level is let go (seconds), or -1 once it hangs free (or never held). */
let release = new Float32Array(0);
let held = 0;

/** The board: angle about z through the pivot, angular velocity. */
let angle = 0;
let omega = 0;

let fixed = false;
/** Frames spent steadying a swinging model before its photograph is taken. */
let steadying = 0;
let fixedForces: Float32Array | null = null;
let fixedSent = false;
let quietFrames = 0;
let forceScale = 0;

function post(message: FromWorker, transfer: Transferable[] = []): void {
  scope.postMessage(message, transfer);
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    init(message).catch((error: unknown) => post({ type: "error", message: String(error) }));
  } else if (message.type === "frame") {
    try {
      frame(message);
    } catch (error) {
      post({ type: "error", message: String(error) });
    }
  }
};

async function init(message: InitMessage): Promise<void> {
  const response = await fetch(message.url);
  if (!response.ok) throw new Error(`could not load ${message.url}: ${response.status}`);
  const data = (await response.json()) as GraphData;
  built = buildAll(data, message.profile);
  const s = new Sim(built.rig.spec);
  sim = s;
  s.substeps = SUBSTEPS[message.profile];
  s.pivot[1] = built.pivotY;
  positionLength = TEX_WIDTH * texRows(s.n) * 4;
  forceLength = TEX_WIDTH * texRows(s.m);

  if (message.mode === "still") {
    // The settled form, once: a shorter, heavily damped run from the cut form.
    const t0 = performance.now();
    s.substeps = 6;
    settle(s, 480, 1 / 30, 0.08);
    const settleMs = performance.now() - t0;
    forceScale = percentile99(s.force);
    const positions = new Float32Array(positionLength);
    writePositions(positions);
    const forces = new Float32Array(forceLength);
    forces.set(s.force);
    post({ type: "still", positions, forces, forceScale, settleMs }, [
      positions.buffer,
      forces.buffer,
    ]);
    return;
  }

  // Live: the net starts folded under the board, every hanging weight held until its level is let go.
  const { rig, model } = built;
  for (let i = 0; i < s.n; i++) if (s.base[i] !== 0) s.x[i * 3 + 1] = s.x[i * 3 + 1]! * DROP.fold;
  s.prev.set(s.x);
  release = new Float32Array(rig.files).fill(-1);
  for (let i = 0; i < rig.files; i++) {
    if (s.base[i] === 0) continue;
    release[i] = DROP.start + DROP.perLevel * model.nodes[i]!.level;
    s.hold(i);
    held++;
  }
  s.damping = DROP.damping;
  post({ type: "ready" });
}

function frame(message: FrameMessage): void {
  const s = sim;
  if (s === null || built === null) return;
  const t0 = performance.now();
  const dt = Math.min(Math.max(message.dt, 1 / 240), 1 / 30);
  time += dt;

  // Let go of the weights whose level has come.
  if (held > 0) {
    for (let i = 0; i < release.length; i++) {
      const at = release[i]!;
      if (at >= 0 && time >= at) {
        s.letGo(i);
        release[i] = -1;
        held--;
      }
    }
  }

  // Before the board turns, the form is fixed (Gaudí's photograph). A model still swinging is steadied first, a
  // few frames of heavy damping spread over the frames rather than run at once, so the photograph is of the form
  // at rest and the stage never waits for it.
  const target = Math.min(Math.max(message.flip, 0), 1) * Math.PI;
  let steady = false;
  if (!fixed && target > 1e-3) {
    if (held > 0) letAllGo();
    const most = time < DROP.settleAfter + 0.5 ? STEADY_MAX_DROP : STEADY_MAX;
    if (steadying < most && fileSpeed2() > 0.0025) {
      steadying++;
      steady = true;
    } else {
      fixForm();
      steadying = 0;
    }
  } else if (!fixed) {
    steadying = 0;
  }

  // The board turns over: a critically damped spring towards the angle the page asks for, once the form is fixed.
  let alpha = 0;
  if (fixed) {
    const k = (2 * Math.PI * FLIP.frequency) ** 2;
    const c = 2 * 2 * Math.PI * FLIP.frequency;
    alpha = k * (target - angle) - c * omega;
    alpha = Math.min(Math.max(alpha, -FLIP.maxAlpha), FLIP.maxAlpha);
    omega += alpha * dt;
    angle += omega * dt;
    if (angle < 0) {
      angle = 0;
      omega = Math.max(0, omega);
    } else if (angle > Math.PI) {
      angle = Math.PI;
      omega = Math.min(0, omega);
    }
  }
  const turning = Math.abs(omega) > 1e-3 || Math.abs(target - angle) > 1e-3;

  // Back where it started, the model hangs free again.
  if (fixed && target <= 1e-3 && angle <= 2e-3 && Math.abs(omega) < 0.02) {
    s.release();
    fixed = false;
    fixedSent = false;
    quietFrames = 0;
    angle = 0;
    omega = 0;
  }
  if (fixed) {
    const standing = angle > Math.PI * 0.97 && Math.abs(omega) < 0.2;
    const goal = 2 * Math.PI * (standing ? FLIP.standing : FLIP.turning);
    s.shapeOmega += (goal - s.shapeOmega) * Math.min(1, dt * 3);
    s.damping = 1.6;
  } else if (steady) {
    s.damping = STEADY_DAMPING;
  } else {
    s.damping = time < DROP.settleAfter ? DROP.damping : DROP.settledDamping;
  }
  s.gravity[0] = -GRAVITY * Math.sin(angle);
  s.gravity[1] = -GRAVITY * Math.cos(angle);
  s.gravity[2] = 0;
  s.omega[2] = omega;
  s.alpha[2] = alpha;

  // A tug (files only; the board's own anchors do not move).
  // (Neither a tug nor a gust while the model is steadied for its photograph.)
  const drag = steady ? null : message.drag;
  if (
    drag !== null &&
    drag.particle >= 0 &&
    drag.particle < built.rig.files &&
    s.base[drag.particle] !== 0
  ) {
    s.dragParticle = drag.particle;
    s.dragTarget[0] = drag.x;
    s.dragTarget[1] = drag.y;
    s.dragTarget[2] = drag.z;
  } else {
    s.dragParticle = -1;
  }

  // The air a sweeping pointer moves.
  const air = steady ? null : message.air;
  s.airActive = air !== null;
  if (air !== null) {
    s.air[0] = air.ox;
    s.air[1] = air.oy;
    s.air[2] = air.oz;
    s.air[3] = air.dx;
    s.air[4] = air.dy;
    s.air[5] = air.dz;
    s.air[6] = air.vx;
    s.air[7] = air.vy;
    s.air[8] = air.vz;
    s.air[9] = air.radius;
  }

  // Sleep once nothing moves; wake on a tug, a gust, a turn or a drop still under way.
  const moving = held > 0 || drag !== null || air !== null || turning;
  if (moving) quietFrames = 0;
  else if (fileSpeed2() < 0.0009) quietFrames++;
  else quietFrames = 0;
  const awake = quietFrames < 40;
  if (awake) s.step(dt);

  // Line weights are scaled by the rest tension's 99th percentile, measured once the drop has calmed down.
  if (forceScale === 0 && !fixed && held === 0 && time > DROP.settleAfter + 0.8)
    forceScale = percentile99(s.force);

  const positions =
    message.positions !== null && message.positions.length === positionLength
      ? message.positions
      : new Float32Array(positionLength);
  writePositions(positions);
  const forces =
    message.forces !== null && message.forces.length === forceLength
      ? message.forces
      : new Float32Array(forceLength);
  forces.set(s.force);
  const transfer: Transferable[] = [positions.buffer, forces.buffer];
  let photograph: Float32Array | null = null;
  if (fixed && !fixedSent && fixedForces !== null) {
    photograph = new Float32Array(forceLength);
    photograph.set(fixedForces);
    transfer.push(photograph.buffer);
    fixedSent = true;
  }
  post(
    {
      type: "frame",
      positions,
      forces,
      angle,
      omega,
      awake: awake || moving,
      fixed,
      fixedForces: photograph,
      forceScale,
      stepMs: performance.now() - t0,
      time,
    },
    transfer,
  );
}

/** Every weight still held for the drop is let go at once. */
function letAllGo(): void {
  const s = sim!;
  for (let i = 0; i < release.length; i++) if (release[i]! >= 0) s.letGo(i);
  release.fill(-1);
  held = 0;
}

/**
 * Gaudí's photograph: the hanging form, at rest (the frames before it steadied the model). The chains become rigid
 * members tied to that form, and the forces they carried are kept for the line weights.
 */
function fixForm(): void {
  const s = sim!;
  s.dragParticle = -1;
  s.airActive = false;
  if (held > 0) letAllGo();
  fixedForces = Float32Array.from(s.force);
  if (forceScale === 0) forceScale = percentile99(s.force);
  s.freeze(2 * Math.PI * FLIP.turning, s.x);
  fixed = true;
  fixedSent = false;
}

/** Fastest file, squared (links of slack chains may drift a little forever; the weights tell when it is still). */
function fileSpeed2(): number {
  const s = sim!;
  const files = built!.rig.files;
  let max = 0;
  for (let i = 0, j = 0; i < files; i++, j += 3) {
    const v = s.v[j]! * s.v[j]! + s.v[j + 1]! * s.v[j + 1]! + s.v[j + 2]! * s.v[j + 2]!;
    if (v > max) max = v;
  }
  return max;
}

function writePositions(out: Float32Array): void {
  const x = sim!.x;
  const n = sim!.n;
  for (let i = 0, j = 0, o = 0; i < n; i++, j += 3, o += 4) {
    out[o] = x[j]!;
    out[o + 1] = x[j + 1]!;
    out[o + 2] = x[j + 2]!;
  }
}

function percentile99(force: Float32Array): number {
  const positive: number[] = [];
  for (const f of force) if (f > 0) positive.push(f);
  if (positive.length === 0) return 1;
  positive.sort((a, b) => a - b);
  return positive[Math.min(positive.length - 1, Math.floor(positive.length * 0.99))]!;
}
