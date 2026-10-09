import type { Layout, Structure } from "../model";
import { KIND_FOUNDATION, KIND_ISOLATED, jitter } from "../model";

/**
 * The hang, simulated. The form itself comes from the force density solve in `layout` (exact equilibrium);
 * this is how the weights get there: released level by level just under the files they hang from, they fall
 * on chains that pull but never push (Verlet integration with one-sided distance constraints), swing, and
 * come to rest on that form.
 *
 * The final pull onto the form is a spring that strengthens a moment after each release: it hides the
 * stretch a few constraint iterations leave in a deep net, so the drawing always lands on the exact form.
 * Once every weight is hanging, the air thickens (the drag rises) so the swinging dies in about a second, and
 * the model is declared at rest on the form a moment later at the latest.
 */

export const HELD = 0;
export const FREE = 1;
export const PINNED = 2;

export interface SimOptions {
  /** Level units per second squared. */
  readonly gravity: number;
  /** Velocity lost per second (air on the model). */
  readonly drag: number;
  readonly iterations: number;
  /** When the first level is released, and the delay between levels (seconds). */
  readonly releaseStart: number;
  readonly releaseStep: number;
  /** Spring onto the form (1/s²) and how long after release it reaches full strength (s). */
  readonly hold: number;
  readonly holdRamp: number;
}

export const DEFAULT_SIM: SimOptions = {
  gravity: 42,
  drag: 2.4,
  iterations: 8,
  releaseStart: 0.3,
  releaseStep: 0.14,
  hold: 46,
  holdRamp: 1.3,
};

/** Extra drag once every weight hangs, per second, reached over the hold ramp. */
const LATE_DRAG = 7;

export class HangingSim {
  readonly n: number;
  readonly pos: Float64Array;
  readonly prev: Float64Array;
  readonly invMass: Float64Array;
  readonly state: Uint8Array;
  readonly releaseAt: Float64Array;
  /** Lines of code of every file hung so far (0 before release): the weights the chains carry right now. */
  readonly weight: Float64Array;
  /** Chains in solving order: nearer the board first, a hanging net converges from its supports down. */
  readonly order: Int32Array;
  time = 0;
  /** Largest speed in the last step, level units per second. */
  speed = Infinity;
  /** Consecutive quiet steps. */
  quiet = 0;
  /** Bumped whenever a file is released (the loads change). */
  releases = 0;
  /** When a weight was last pushed by hand. */
  private pushedAt = -Infinity;

  private readonly s: Structure;
  private readonly l: Layout;
  private readonly options: SimOptions;

  constructor(s: Structure, l: Layout, options: SimOptions = DEFAULT_SIM) {
    this.s = s;
    this.l = l;
    this.options = options;
    const n = s.n;
    this.n = n;
    this.pos = new Float64Array(n * 3);
    this.prev = new Float64Array(n * 3);
    this.invMass = new Float64Array(n);
    this.state = new Uint8Array(n);
    this.releaseAt = new Float64Array(n);
    this.weight = new Float64Array(n);
    for (let v = 0; v < n; v++) {
      const k = s.kind[v]!;
      if (k === KIND_FOUNDATION || k === KIND_ISOLATED) {
        this.state[v] = PINNED;
        this.weight[v] = s.lines[v]!;
        for (let a = 0; a < 3; a++)
          this.pos[v * 3 + a] = this.prev[v * 3 + a] = l.target[v * 3 + a]!;
      } else {
        this.state[v] = HELD;
        this.invMass[v] = 1 / (0.3 + Math.sqrt(s.lines[v]!) / 6);
        this.releaseAt[v] =
          options.releaseStart + (s.level[v]! - 1) * options.releaseStep + jitter(v, 7) * 0.06;
      }
    }
    const chains = Array.from({ length: s.chainCount }, (_, c) => c);
    chains.sort((a, b) => s.level[s.dependency[a]!]! - s.level[s.dependency[b]!]! || a - b);
    this.order = Int32Array.from(chains);
  }

  /** Time of the last release. */
  get lastRelease(): number {
    return this.options.releaseStart + (this.s.maxLevel - 1) * this.options.releaseStep + 0.06;
  }

  get settled(): boolean {
    const end = this.lastRelease + this.options.holdRamp;
    return (
      (this.time > end && this.quiet > 24) || this.time > Math.max(end + 1.1, this.pushedAt + 1.8)
    );
  }

  /** Every weight on its place in the form, at rest (the still drawing, or a skip ahead). */
  finish(): void {
    const { pos, prev, state } = this;
    for (let v = 0; v < this.n; v++) {
      if (state[v] === PINNED) continue;
      for (let a = 0; a < 3; a++) pos[v * 3 + a] = prev[v * 3 + a] = this.l.target[v * 3 + a]!;
      state[v] = FREE;
      this.releaseAt[v] = -10;
      this.weight[v] = this.s.lines[v]!;
    }
    this.time = Math.max(this.time, this.lastRelease + this.options.holdRamp + 1);
    this.quiet = 1000;
    this.speed = 0;
    this.releases++;
  }

  private release(v: number) {
    const { s, pos, prev } = this;
    let x = 0;
    let y = 0;
    let z = 0;
    let count = 0;
    for (const c of s.out[v]!) {
      const u = s.dependency[c]!;
      if (this.state[u] === HELD) continue;
      x += pos[u * 3]!;
      y += pos[u * 3 + 1]!;
      z += pos[u * 3 + 2]!;
      count++;
    }
    if (count === 0) {
      x = this.l.target[v * 3]!;
      y = this.l.target[v * 3 + 1]! + 1;
      z = this.l.target[v * 3 + 2]!;
    } else {
      x /= count;
      y /= count;
      z /= count;
    }
    // Let go just under the files it hangs from, a little off their line, so its chains fall in loops and pull
    // straight as it drops.
    x += (jitter(v, 1) - 0.5) * 0.3;
    z += (jitter(v, 2) - 0.5) * 0.3;
    y -= 0.04;
    pos[v * 3] = prev[v * 3] = x;
    pos[v * 3 + 1] = prev[v * 3 + 1] = y;
    pos[v * 3 + 2] = prev[v * 3 + 2] = z;
    this.state[v] = FREE;
    this.weight[v] = s.lines[v]!;
    this.releases++;
  }

  /** One step of `dt` seconds. */
  step(dt: number): void {
    const { s, pos, prev, invMass, state } = this;
    const { target, rest } = this.l;
    this.time += dt;
    for (let v = 0; v < this.n; v++)
      if (state[v] === HELD && this.time >= this.releaseAt[v]!) this.release(v);

    // Thick air once everything hangs, thin again for a moment after a push so the weights can swing.
    const late = Math.min(1, Math.max(0, (this.time - this.lastRelease) / this.options.holdRamp));
    const calm = Math.min(1, Math.max(0, (this.time - this.pushedAt) / 1.5));
    const keep = Math.exp(-(this.options.drag + LATE_DRAG * late * late * calm * calm) * dt);
    const g = this.options.gravity * dt * dt;
    const hold = this.options.hold * dt * dt;
    for (let v = 0; v < this.n; v++) {
      if (state[v] !== FREE) continue;
      const i = v * 3;
      const ramp = Math.min(
        1,
        Math.max(0, (this.time - this.releaseAt[v]! - 0.25) / this.options.holdRamp),
      );
      const k = hold * ramp * ramp;
      for (let a = 0; a < 3; a++) {
        const p = pos[i + a]!;
        const vel = (p - prev[i + a]!) * keep;
        prev[i + a] = p;
        pos[i + a] = p + vel + (target[i + a]! - p) * k;
      }
      pos[i + 1] = pos[i + 1]! - g * (1 - ramp);
    }

    const order = this.order;
    const count = order.length;
    for (let it = 0; it < this.options.iterations; it++) {
      const forward = it % 2 === 0;
      for (let k = 0; k < count; k++) {
        const c = order[forward ? k : count - 1 - k]!;
        const a = s.dependent[c]!;
        const b = s.dependency[c]!;
        if (state[a] === HELD || state[b] === HELD) continue;
        const wa = invMass[a]!;
        const wb = invMass[b]!;
        const w = wa + wb;
        if (w === 0) continue;
        const ia = a * 3;
        const ib = b * 3;
        const dx = pos[ia]! - pos[ib]!;
        const dy = pos[ia + 1]! - pos[ib + 1]!;
        const dz = pos[ia + 2]! - pos[ib + 2]!;
        const d2 = dx * dx + dy * dy + dz * dz;
        const r = rest[c]!;
        if (d2 <= r * r) continue; // a chain pulls, it never pushes
        const d = Math.sqrt(d2);
        const f = (d - r) / (d * w);
        pos[ia] = pos[ia]! - dx * f * wa;
        pos[ia + 1] = pos[ia + 1]! - dy * f * wa;
        pos[ia + 2] = pos[ia + 2]! - dz * f * wa;
        pos[ib] = pos[ib]! + dx * f * wb;
        pos[ib + 1] = pos[ib + 1]! + dy * f * wb;
        pos[ib + 2] = pos[ib + 2]! + dz * f * wb;
      }
    }

    let speed = 0;
    for (let v = 0; v < this.n; v++) {
      if (state[v] !== FREE) continue;
      const i = v * 3;
      const m = Math.max(
        Math.abs(pos[i]! - prev[i]!),
        Math.abs(pos[i + 1]! - prev[i + 1]!),
        Math.abs(pos[i + 2]! - prev[i + 2]!),
      );
      if (m > speed) speed = m;
    }
    this.speed = speed / dt;
    this.quiet = this.speed < 0.03 ? this.quiet + 1 : 0;
  }

  /** Nudge a weight sideways (level units per second). */
  push(v: number, vx: number, vz: number, dt: number): void {
    if (this.state[v] !== FREE) return;
    this.prev[v * 3] = this.prev[v * 3]! - vx * dt;
    this.prev[v * 3 + 2] = this.prev[v * 3 + 2]! - vz * dt;
    this.quiet = 0;
    this.pushedAt = this.time;
  }

  /** Run until still (or `maxSteps`), without drawing. */
  settle(dt: number, maxSteps: number): number {
    let steps = 0;
    while (steps < maxSteps && !this.settled) {
      this.step(dt);
      steps++;
    }
    return steps;
  }
}
