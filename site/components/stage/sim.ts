/**
 * The hanging model's motion, simulated in real time (model space: the board is y = 0, gravity is -y).
 *
 * Scroll decides which levels are released; physics decides how they move. A released file falls freely until
 * its chains go taut (chains pull, they never push), is caught with a bounce, then swings sideways into its rest
 * position under the files it hangs from, like a pendulum. Every file follows the sway of what it hangs from, and
 * the jerk of a weight being caught travels up into its supports. Scrolling back reels files in to the file they
 * were released from. The foundations are fixed to the board.
 *
 * The rest positions come from model.ts (levels computed from Katedrala's document, horizontal placement drawn
 * there); this file only moves files towards them. It writes positions straight into the texture the GPU reads.
 * Once nothing moves (no breath, no swing, nothing landing or falling) it sleeps: the stage stops drawing and
 * the page stops spending frames until scroll releases or reels in a level.
 */
import { PLAN_MINOR, PLAN_RADIUS, PLAN_TURN, type HangingModel } from "./model";
import { INTRO, penReaches } from "./timeline";

/** Texture width: positions live in a 32-wide RGBA float texture (x, y, z, shown). */
export const POS_WIDTH = 32;

const G = 30; // gravity, model units / s^2: a level (1.1 units) falls in about 0.27 s
const KY = 420; // vertical chain stiffness: the catch bounces at about 3.3 Hz
const CY = 11; // its damping (one clear rebound)
const KH = 11; // horizontal pull back under the supports: a swing of about 1.9 s
const CH = 0.95; // its damping: a few swings, then still
const CAIR = 0.35; // air drag while falling
const KREEL = 70; // reeling a file back in (critically damped)
const REACT = 0.55; // how much of a caught weight's jerk its supports feel
const WIND = 0.028; // breathing amplitude per level, model units
/** Below this speed (model units / s, about 0.3 px/s on screen) every file counts as still. */
const REST_SPEED = 0.008;

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export interface SimInput {
  /** Levels released so far (0: only the board). */
  released: number;
  /** 0..1: breathing on. */
  wind: number;
  /** 0..1: blend to the exact rest form and stop (before the turn, and after it). */
  freeze: number;
}

export class HangingSim {
  readonly n: number;
  /** RGBA per file: x, y, z, shown (0 hidden, 1 drawn). Sized for the position texture. */
  readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly rest: Float32Array;
  private readonly level: Int32Array;
  private readonly primary: Int32Array;
  private readonly order: Int32Array;
  /** Supports of each file (lower levels) with normalized weights, CSR layout. */
  private readonly supStart: Int32Array;
  private readonly supIndex: Int32Array;
  private readonly supWeight: Float32Array;
  private readonly massRatio: Float32Array;
  private readonly delay: Float32Array;
  private readonly phase: Float32Array;
  private readonly releasedAt: Float32Array;
  private readonly falling: Uint8Array;
  private readonly appearAt: Float32Array;
  private readonly maxLevel: number;
  /** When the last file on the board has finished landing (seconds of simulated time). */
  private readonly landed: number;
  private time = 0;
  private settled = false;
  private asleep = false;
  private lastReleased = -1;
  private written = 0;

  constructor(model: HangingModel) {
    const n = model.n;
    this.n = n;
    this.maxLevel = model.maxLevel;
    const rows = Math.ceil(n / POS_WIDTH);
    this.pos = new Float32Array(POS_WIDTH * rows * 4);
    this.vel = new Float32Array(n * 3);
    this.rest = model.rest;
    this.level = model.level;
    this.primary = model.primary;
    this.order = Int32Array.from(
      [...Array(n).keys()].sort((p, q) => model.level[p]! - model.level[q]! || p - q),
    );

    const start: number[] = [0];
    const index: number[] = [];
    const weight: number[] = [];
    for (let v = 0; v < n; v++) {
      const L = model.level[v]!;
      const list: [number, number][] = [];
      for (const k of model.out[v]!) {
        const b = model.edgeB[k]!;
        if (model.level[b]! < L) list.push([b, 1 / (L - model.level[b]!)]);
      }
      const sum = list.reduce((s, [, w]) => s + w, 0);
      for (const [b, w] of list) {
        index.push(b);
        weight.push(w / sum);
      }
      start.push(index.length);
    }
    this.supStart = Int32Array.from(start);
    this.supIndex = Int32Array.from(index);
    this.supWeight = Float32Array.from(weight);
    this.massRatio = new Float32Array(index.length);
    for (let v = 0; v < n; v++) {
      for (let j = this.supStart[v]!; j < this.supStart[v + 1]!; j++) {
        const s = this.supIndex[j]!;
        this.massRatio[j] = Math.min(1, model.lines[v]! / Math.max(1, model.carried[s]!));
      }
    }
    this.delay = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.appearAt = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const h = hash01(model.paths[v]!);
      this.delay[v] = h * 0.16;
      this.phase[v] = h * Math.PI * 2;
    }
    // The foundations land on the plan just behind the pen that draws it (the board shader measures the pen's
    // progress round the ellipse the same way), so setting out the plan reads as one stroke.
    let landed = 0;
    for (let v = 0; v < n; v++) {
      if (model.level[v] !== 0) continue;
      const angle = Math.atan2(
        model.rest[v * 3 + 2]! / PLAN_MINOR,
        model.rest[v * 3]! / PLAN_RADIUS,
      );
      const q = ((((angle - PLAN_TURN) / (Math.PI * 2)) % 1) + 1) % 1;
      this.appearAt[v] = penReaches(q) + INTRO.landLag;
      landed = Math.max(landed, this.appearAt[v]! + 0.35);
    }
    this.landed = landed;
    this.releasedAt = new Float32Array(n).fill(-1);
    this.falling = new Uint8Array(n);
    // Everything starts on the board: hanging files are collapsed onto the board until released.
    for (let v = 0; v < n; v++) {
      const s = this.anchorOf(v);
      this.pos[v * 4] = this.rest[s * 3]!;
      this.pos[v * 4 + 1] = this.rest[s * 3 + 1]!;
      this.pos[v * 4 + 2] = this.rest[s * 3 + 2]!;
      this.pos[v * 4 + 3] = 0;
    }
  }

  /** The foundation a file is ultimately released from (following primaries down to the board). */
  private anchorOf(v: number): number {
    let s = v;
    while (this.level[s]! > 0 && this.primary[s]! >= 0) s = this.primary[s]!;
    return s;
  }

  /** Puts every file at rest, drawn (reduced motion, the 2D fallback, the standing structure). */
  settle(): void {
    for (let v = 0; v < this.n; v++) {
      this.pos[v * 4] = this.rest[v * 3]!;
      this.pos[v * 4 + 1] = this.rest[v * 3 + 1]!;
      this.pos[v * 4 + 2] = this.rest[v * 3 + 2]!;
      this.pos[v * 4 + 3] = 1;
      this.vel[v * 3] = 0;
      this.vel[v * 3 + 1] = 0;
      this.vel[v * 3 + 2] = 0;
      this.releasedAt[v] = 0;
      this.falling[v] = 0;
    }
    this.settled = true;
    this.written++;
  }

  /** Seconds of simulated time since the stage started (the opening runs on it). */
  get clock(): number {
    return this.time;
  }

  /** Bumped every time the positions change: the stage uploads them when it differs from what it sent. */
  get version(): number {
    return this.written;
  }

  /** True when nothing moves (the GPU copy is current and the frame can be skipped). */
  get still(): boolean {
    return this.settled || this.asleep;
  }

  step(dtRaw: number, input: SimInput): void {
    const dt = Math.min(dtRaw, 1 / 30);
    this.time += dt;
    if (input.freeze >= 1) {
      if (!this.settled) this.settle();
      return;
    }
    this.settled = false;
    // Asleep, nothing has changed what hangs: keep the positions (and skip the work) until scroll releases or reels
    // in a level, or the model starts to breathe or freeze.
    const nudged = input.released !== this.lastReleased || input.wind > 0 || input.freeze > 0;
    this.lastReleased = input.released;
    if (this.asleep && !nudged) return;
    this.asleep = false;
    this.written++;
    const sub = 2;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this.substep(h, input);
    if (!nudged && this.time > this.landed && this.resting()) this.asleep = true;
    if (input.freeze > 0) {
      // Fix the form for the photograph: blend to rest and bleed off the motion.
      const f = input.freeze * input.freeze;
      for (let v = 0; v < this.n; v++) {
        if (this.releasedAt[v]! < 0) continue;
        for (let c = 0; c < 3; c++) {
          this.pos[v * 4 + c] =
            this.pos[v * 4 + c]! + (this.rest[v * 3 + c]! - this.pos[v * 4 + c]!) * f;
          this.vel[v * 3 + c] = this.vel[v * 3 + c]! * (1 - f);
        }
      }
    }
  }

  /** Whether every file is still: none moving faster than REST_SPEED, none appearing, waiting to drop or reeling in. */
  private resting(): boolean {
    const { pos, vel, releasedAt, level } = this;
    const limit = REST_SPEED * REST_SPEED;
    for (let v = 0; v < this.n; v++) {
      const w = pos[v * 4 + 3]!;
      if (w > 0 && w < 1) return false;
      if (level[v]! > 0 && releasedAt[v]! > this.time) return false;
      const vx = vel[v * 3]!;
      const vy = vel[v * 3 + 1]!;
      const vz = vel[v * 3 + 2]!;
      if (vx * vx + vy * vy + vz * vz > limit) return false;
    }
    return true;
  }

  private substep(h: number, input: SimInput): void {
    const { pos, vel, rest, level, primary, supStart, supIndex, supWeight, massRatio } = this;
    const t = this.time;
    // A slow common sway with a little of each file's own: deeper files move more.
    const swayX = Math.sin(t * 0.52) * 0.8 + Math.sin(t * 1.31 + 0.7) * 0.2;
    const swayZ = Math.sin(t * 0.41 + 1.9) * 0.8 + Math.sin(t * 1.07 + 2.3) * 0.2;
    for (let i = 0; i < this.n; i++) {
      const v = this.order[i]!;
      const L = level[v]!;
      const o = v * 4;
      if (L === 0) {
        pos[o] = rest[v * 3]!;
        pos[o + 1] = rest[v * 3 + 1]!;
        pos[o + 2] = rest[v * 3 + 2]!;
        pos[o + 3] = Math.min(1, Math.max(0, (t - this.appearAt[v]!) / 0.35));
        continue;
      }
      const wantsDown = L <= input.released;
      if (wantsDown && this.releasedAt[v]! < 0) this.releasedAt[v] = t + this.delay[v]!;
      if (!wantsDown) this.releasedAt[v] = -1;
      const released = this.releasedAt[v]! >= 0 && t >= this.releasedAt[v]!;
      const s = primary[v]!;
      const so = s * 4;

      if (!released) {
        // Held at (or reeled back in to) the file it is released from.
        const kx = pos[so]! - pos[o]!;
        const ky = pos[so + 1]! - pos[o + 1]!;
        const kz = pos[so + 2]! - pos[o + 2]!;
        const c = 2 * Math.sqrt(KREEL);
        vel[v * 3] = vel[v * 3]! + (KREEL * kx - c * vel[v * 3]!) * h;
        vel[v * 3 + 1] = vel[v * 3 + 1]! + (KREEL * ky - c * vel[v * 3 + 1]!) * h;
        vel[v * 3 + 2] = vel[v * 3 + 2]! + (KREEL * kz - c * vel[v * 3 + 2]!) * h;
        pos[o] = pos[o]! + vel[v * 3]! * h;
        pos[o + 1] = pos[o + 1]! + vel[v * 3 + 1]! * h;
        pos[o + 2] = pos[o + 2]! + vel[v * 3 + 2]! * h;
        const near = kx * kx + ky * ky + kz * kz < 0.04;
        if (pos[so + 3]! < 0.5 || near) pos[o + 3] = Math.max(0, pos[o + 3]! - h / 0.12);
        this.falling[v] = 0;
        continue;
      }
      if (pos[o + 3]! === 0 && this.falling[v] === 0) {
        // Just released: start from where its support is now, moving with it.
        pos[o] = pos[so]!;
        pos[o + 1] = pos[so + 1]!;
        pos[o + 2] = pos[so + 2]!;
        vel[v * 3] = vel[s * 3]!;
        vel[v * 3 + 1] = vel[s * 3 + 1]!;
        vel[v * 3 + 2] = vel[s * 3 + 2]!;
        this.falling[v] = 1;
      }
      pos[o + 3] = Math.min(1, pos[o + 3]! + h / 0.08);

      // Where it wants to be: its rest position, carried by the sway of what it hangs from, plus the breath.
      let dx = 0;
      let dy = 0;
      let dz = 0;
      for (let j = supStart[v]!; j < supStart[v + 1]!; j++) {
        const b = supIndex[j]!;
        const w = supWeight[j]!;
        dx += (pos[b * 4]! - rest[b * 3]!) * w;
        dy += (pos[b * 4 + 1]! - rest[b * 3 + 1]!) * w;
        dz += (pos[b * 4 + 2]! - rest[b * 3 + 2]!) * w;
      }
      const breath = input.wind * WIND * (1 + 0.35 * Math.sin(t * 0.9 + this.phase[v]!));
      const tx = rest[v * 3]! + dx + breath * swayX;
      const ty = rest[v * 3 + 1]! + dy;
      const tz = rest[v * 3 + 2]! + dz + breath * swayZ;

      const yTaut = ty + G / KY;
      const vy = vel[v * 3 + 1]!;
      let ax: number;
      let ay: number;
      let az: number;
      if (pos[o + 1]! > yTaut) {
        // Slack: falling freely.
        ax = -CAIR * vel[v * 3]!;
        ay = -G - CAIR * vy;
        az = -CAIR * vel[v * 3 + 2]!;
      } else {
        // Taut: the chains catch it and pull it under its supports.
        this.falling[v] = 0;
        ax = KH * (tx - pos[o]!) - CH * vel[v * 3]!;
        ay = -G + KY * (yTaut - pos[o + 1]!) - CY * vy;
        az = KH * (tz - pos[o + 2]!) - CH * vel[v * 3 + 2]!;
        // The supports feel the dynamic part of the pull (the static part is the weight they already carry):
        // a weight being stopped on its way down jerks its supports down, a swing pulls them sideways.
        for (let j = supStart[v]!; j < supStart[v + 1]!; j++) {
          const b = supIndex[j]!;
          if (level[b] === 0) continue;
          const k = supWeight[j]! * massRatio[j]! * REACT * h;
          vel[b * 3] = vel[b * 3]! - ax * k;
          vel[b * 3 + 1] = vel[b * 3 + 1]! - ay * k;
          vel[b * 3 + 2] = vel[b * 3 + 2]! - az * k;
        }
      }
      vel[v * 3] = vel[v * 3]! + ax * h;
      vel[v * 3 + 1] = vy + ay * h;
      vel[v * 3 + 2] = vel[v * 3 + 2]! + az * h;
      pos[o] = pos[o]! + vel[v * 3]! * h;
      pos[o + 1] = pos[o + 1]! + vel[v * 3 + 1]! * h;
      pos[o + 2] = pos[o + 2]! + vel[v * 3 + 2]! * h;
    }
  }

  /** Skips the foundations' entrance (reduced motion, returning to a page already scrolled). */
  showBoard(): void {
    this.time = Math.max(this.time, INTRO.release + 0.5);
  }

  get levels(): number {
    return this.maxLevel;
  }
}
