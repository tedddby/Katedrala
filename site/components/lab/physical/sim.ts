/**
 * Position-based dynamics for a hanging-chain model (small-step XPBD: many substeps, one constraint pass each).
 *
 * Particles are the weights (files) and the links of every chain; segments join them. While the model hangs, a
 * segment is a length of chain: it pulls when it is stretched and goes slack when it is not, so a chain carries
 * tension only, and a slack chain folds and falls. When the form is fixed (Gaudí fixed his with a photograph), the
 * segments become rigid members that push as well as pull, and every particle is tied to the fixed form by a spring:
 * turned over, the structure stands in compression and still gives a little when you tug it.
 *
 * Everything runs in the board's frame (anchors never move). Gravity, the inertial forces of turning the board over
 * (Euler, centrifugal, Coriolis) and the air the pointer moves are supplied in that frame by the caller. No
 * allocation per step.
 */

export interface SimSpec {
  readonly count: number;
  /** Inverse mass per particle; 0 pins it to the board. */
  readonly invMass: Float32Array;
  /** Initial positions, xyz per particle. */
  readonly position: Float32Array;
  readonly segA: Uint32Array;
  readonly segB: Uint32Array;
  /** Rest length per segment (a chain's length shared among its links). */
  readonly rest: Float32Array;
  /** Per particle: how far below the board it can possibly hang (its shortest chain path), or Infinity. */
  readonly depthLimit: Float32Array;
  /** Particles that collide with each other (the weights), and their radii (per particle). */
  readonly colliders: Uint32Array;
  readonly radius: Float32Array;
}

export class Sim {
  readonly n: number;
  readonly m: number;
  readonly x: Float32Array;
  readonly prev: Float32Array;
  readonly v: Float32Array;
  /** Inverse masses in use (a held particle has 0 here and its own value in `base`). */
  readonly w: Float32Array;
  readonly base: Float32Array;
  readonly segA: Uint32Array;
  readonly segB: Uint32Array;
  readonly rest: Float32Array;
  readonly lim: Float32Array;
  readonly radius: Float32Array;
  readonly colliders: Uint32Array;
  /** Last substep's Lagrange multiplier per segment (mass x length). */
  readonly lambda: Float32Array;
  /** Smoothed force per segment, in model units (mass x length / s^2). Positive is tension, negative compression. */
  readonly force: Float32Array;
  /** The fixed form, once fixed. */
  readonly pose: Float32Array;

  /** Gravity in the board's frame. */
  readonly gravity = new Float32Array([0, -98, 0]);
  /** Angular velocity and acceleration of the board, in its own frame, about `pivot`. */
  readonly omega = new Float32Array(3);
  readonly alpha = new Float32Array(3);
  readonly pivot = new Float32Array(3);

  /** True while the model hangs free (chains); false once its form is fixed (rigid members, tied to the pose). */
  hanging = true;
  /** Natural frequency (rad/s) of the springs that tie particles to the fixed form. */
  shapeOmega = 0;
  /** Velocity damping, 1/s. */
  damping = 1.2;
  substeps = 8;

  /** A particle being tugged, its target and the stiffness of the tug (natural frequency, rad/s). */
  dragParticle = -1;
  readonly dragTarget = new Float32Array(3);
  dragOmega = 16;

  /**
   * Air moved by the pointer: a gust along the pointer's ray (origin xyz, unit direction xyz), moving at a velocity
   * (xyz, units/s), with a radius. Drag pulls every particle near the ray towards the air's velocity, harder the
   * lighter it is, so a quick sweep stirs the chains and barely moves the heavy weights.
   */
  airActive = false;
  readonly air = new Float32Array(10);
  /** Drag coefficient (mass/s) and the fastest relaxation rate it may reach (1/s). */
  airDrag = 2.4;
  airMaxRate = 14;

  /** Largest squared speed in the last step: the caller lets the model sleep when it is still. */
  maxSpeed2 = 0;

  private readonly order: Uint32Array;
  private readonly maxRadius: number;

  constructor(spec: SimSpec) {
    this.n = spec.count;
    this.m = spec.segA.length;
    this.x = Float32Array.from(spec.position);
    this.prev = Float32Array.from(spec.position);
    this.v = new Float32Array(this.n * 3);
    this.w = Float32Array.from(spec.invMass);
    this.base = Float32Array.from(spec.invMass);
    this.segA = spec.segA;
    this.segB = spec.segB;
    this.rest = spec.rest;
    this.lim = spec.depthLimit;
    this.radius = spec.radius;
    this.colliders = spec.colliders;
    this.lambda = new Float32Array(this.m);
    this.force = new Float32Array(this.m);
    this.pose = Float32Array.from(spec.position);
    this.order = Uint32Array.from(spec.colliders);
    let r = 0;
    for (const i of spec.colliders) r = Math.max(r, spec.radius[i]!);
    this.maxRadius = r;
  }

  /** Fix a form: the chains become rigid members and every particle is tied to the form by a spring. */
  freeze(shapeOmega: number, form: Float32Array): void {
    this.pose.set(form);
    this.hanging = false;
    this.shapeOmega = shapeOmega;
  }

  /** Back to hanging free. */
  release(): void {
    this.hanging = true;
    this.shapeOmega = 0;
  }

  /** Put every particle at a form, at rest. */
  place(form: Float32Array): void {
    this.x.set(form);
    this.prev.set(form);
    this.v.fill(0);
  }

  /** Hold a particle where it is (it stops moving until let go). */
  hold(i: number): void {
    this.w[i] = 0;
    this.v[i * 3] = 0;
    this.v[i * 3 + 1] = 0;
    this.v[i * 3 + 2] = 0;
  }

  letGo(i: number): void {
    this.w[i] = this.base[i]!;
  }

  step(dt: number): void {
    const S = this.substeps;
    const h = dt / S;
    const n = this.n;
    const m = this.m;
    const { x, prev, v, w, segA, segB, lambda, lim, pose, rest } = this;
    const hanging = this.hanging;
    const gx = this.gravity[0]!;
    const gy = this.gravity[1]!;
    const gz = this.gravity[2]!;
    const ox = this.omega[0]!;
    const oy = this.omega[1]!;
    const oz = this.omega[2]!;
    const ax0 = this.alpha[0]!;
    const ay0 = this.alpha[1]!;
    const az0 = this.alpha[2]!;
    const rotating = ox * ox + oy * oy + oz * oz + ax0 * ax0 + ay0 * ay0 + az0 * az0 > 1e-8;
    const cx = this.pivot[0]!;
    const cy = this.pivot[1]!;
    const cz = this.pivot[2]!;
    const o2 = ox * ox + oy * oy + oz * oz;
    const damp = Math.exp(-this.damping * h);
    const shapeK = !hanging && this.shapeOmega > 0 ? (this.shapeOmega * h) ** 2 : 0;
    const shapeS = shapeK / (1 + shapeK);
    const dragK = (this.dragOmega * h) ** 2;
    const dragS = dragK / (1 + dragK);
    const drag = this.dragParticle;
    const air = this.air;
    const airOn = this.airActive;
    const aox = air[0]!;
    const aoy = air[1]!;
    const aoz = air[2]!;
    const adx = air[3]!;
    const ady = air[4]!;
    const adz = air[5]!;
    const avx = air[6]!;
    const avy = air[7]!;
    const avz = air[8]!;
    const ar = Math.max(1e-3, air[9]!);
    const airInv = 1 / (ar * ar);
    const airReach = 6.25 * ar * ar;
    const airDrag = this.airDrag;
    const airMax = this.airMaxRate;
    let maxSpeed2 = 0;

    for (let s = 0; s < S; s++) {
      // Predict.
      for (let i = 0, j = 0; i < n; i++, j += 3) {
        prev[j] = x[j]!;
        prev[j + 1] = x[j + 1]!;
        prev[j + 2] = x[j + 2]!;
        if (w[i] === 0) continue;
        let fx = gx;
        let fy = gy;
        let fz = gz;
        if (rotating) {
          const rx = x[j]! - cx;
          const ry = x[j + 1]! - cy;
          const rz = x[j + 2]! - cz;
          const vx = v[j]!;
          const vy = v[j + 1]!;
          const vz = v[j + 2]!;
          const od = ox * rx + oy * ry + oz * rz;
          // Euler (-alpha x r), centrifugal (|w|^2 r - (w.r) w), Coriolis (-2 w x v).
          fx += -(ay0 * rz - az0 * ry) + o2 * rx - od * ox - 2 * (oy * vz - oz * vy);
          fy += -(az0 * rx - ax0 * rz) + o2 * ry - od * oy - 2 * (oz * vx - ox * vz);
          fz += -(ax0 * ry - ay0 * rx) + o2 * rz - od * oz - 2 * (ox * vy - oy * vx);
        }
        if (airOn) {
          // Distance from the pointer's ray; drag towards the air's velocity inside the gust.
          const rx = x[j]! - aox;
          const ry = x[j + 1]! - aoy;
          const rz = x[j + 2]! - aoz;
          const along = rx * adx + ry * ady + rz * adz;
          const d2 = rx * rx + ry * ry + rz * rz - along * along;
          if (d2 < airReach) {
            const rate = Math.min(airMax, airDrag * w[i]!) * Math.exp(-d2 * airInv);
            fx += rate * (avx - v[j]!);
            fy += rate * (avy - v[j + 1]!);
            fz += rate * (avz - v[j + 2]!);
          }
        }
        const vx = (v[j]! + fx * h) * damp;
        const vy = (v[j + 1]! + fy * h) * damp;
        const vz = (v[j + 2]! + fz * h) * damp;
        x[j] = x[j]! + vx * h;
        x[j + 1] = x[j + 1]! + vy * h;
        x[j + 2] = x[j + 2]! + vz * h;
      }

      // Segments: a chain while hanging (pulls only), a rigid member once the form is fixed.
      for (let k = 0; k < m; k++) {
        const ia = segA[k]!;
        const ib = segB[k]!;
        const a = ia * 3;
        const b = ib * 3;
        const dx = x[b]! - x[a]!;
        const dy = x[b + 1]! - x[a + 1]!;
        const dz = x[b + 2]! - x[a + 2]!;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const wa = w[ia]!;
        const wb = w[ib]!;
        const wsum = wa + wb;
        const r = rest[k]!;
        if (len < 1e-9 || wsum === 0 || (hanging && len <= r)) {
          lambda[k] = 0;
          continue;
        }
        const dl = -(len - r) / wsum;
        lambda[k] = dl;
        const s1 = dl / len;
        const px = dx * s1;
        const py = dy * s1;
        const pz = dz * s1;
        x[a] = x[a]! - wa * px;
        x[a + 1] = x[a + 1]! - wa * py;
        x[a + 2] = x[a + 2]! - wa * pz;
        x[b] = x[b]! + wb * px;
        x[b + 1] = x[b + 1]! + wb * py;
        x[b + 2] = x[b + 2]! + wb * pz;
      }

      if (hanging) {
        // A chain path cannot be longer than its links: nothing hangs deeper than its shortest path allows.
        for (let i = 0, j = 1; i < n; i++, j += 3) {
          const floor = -lim[i]!;
          if (x[j]! < floor) x[j] = floor;
        }
        // Weights have volume.
        if ((s & 1) === 1) this.collide();
      } else if (shapeS > 0) {
        // Fixed form: every particle is tied to it.
        for (let i = 0, j = 0; i < n; i++, j += 3) {
          if (w[i] === 0) continue;
          x[j] = x[j]! + (pose[j]! - x[j]!) * shapeS;
          x[j + 1] = x[j + 1]! + (pose[j + 1]! - x[j + 1]!) * shapeS;
          x[j + 2] = x[j + 2]! + (pose[j + 2]! - x[j + 2]!) * shapeS;
        }
      }

      // A tug.
      if (drag >= 0 && w[drag] !== 0) {
        const j = drag * 3;
        x[j] = x[j]! + (this.dragTarget[0]! - x[j]!) * dragS;
        x[j + 1] = x[j + 1]! + (this.dragTarget[1]! - x[j + 1]!) * dragS;
        x[j + 2] = x[j + 2]! + (this.dragTarget[2]! - x[j + 2]!) * dragS;
      }

      // Velocities from positions.
      const inv = 1 / h;
      const last = s === S - 1;
      for (let i = 0, j = 0; i < n; i++, j += 3) {
        if (w[i] === 0) continue;
        const vx = (x[j]! - prev[j]!) * inv;
        const vy = (x[j + 1]! - prev[j + 1]!) * inv;
        const vz = (x[j + 2]! - prev[j + 2]!) * inv;
        v[j] = vx;
        v[j + 1] = vy;
        v[j + 2] = vz;
        if (last) {
          const sp = vx * vx + vy * vy + vz * vz;
          if (sp > maxSpeed2) maxSpeed2 = sp;
        }
      }
    }

    // Force per segment from the last substep (positive: tension), smoothed.
    const toForce = -1 / (h * h);
    const f = this.force;
    for (let k = 0; k < m; k++) {
      const value = lambda[k]! * toForce;
      f[k] = f[k]! + (value - f[k]!) * 0.15;
    }
    this.maxSpeed2 = maxSpeed2;
  }

  /** Weights have volume: push overlapping ones apart (sweep and prune along x). */
  private collide(): void {
    const { x, w, radius, order } = this;
    // Insertion sort by x: the order barely changes between steps.
    for (let i = 1; i < order.length; i++) {
      const id = order[i]!;
      const key = x[id * 3]!;
      let j = i - 1;
      while (j >= 0 && x[order[j]! * 3]! > key) {
        order[j + 1] = order[j]!;
        j--;
      }
      order[j + 1] = id;
    }
    const reach = this.maxRadius * 2 + 0.02;
    for (let i = 0; i < order.length; i++) {
      const p = order[i]!;
      const a = p * 3;
      const ra = radius[p]!;
      for (let k = i + 1; k < order.length; k++) {
        const q = order[k]!;
        const b = q * 3;
        const dx = x[b]! - x[a]!;
        if (dx > reach) break;
        const dy = x[b + 1]! - x[a + 1]!;
        const dz = x[b + 2]! - x[a + 2]!;
        const min = ra + radius[q]! + 0.02;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min || d2 < 1e-12) continue;
        const wa = w[p]!;
        const wb = w[q]!;
        const wsum = wa + wb;
        if (wsum === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d / wsum) * 0.5;
        x[a] = x[a]! - dx * push * wa;
        x[a + 1] = x[a + 1]! - dy * push * wa;
        x[a + 2] = x[a + 2]! - dz * push * wa;
        x[b] = x[b]! + dx * push * wb;
        x[b + 1] = x[b + 1]! + dy * push * wb;
        x[b + 2] = x[b + 2]! + dz * push * wb;
      }
    }
  }
}
