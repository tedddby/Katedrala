/**
 * The still drawing (reduced motion, no WebGL 2, or a film that cannot run): the standing structure, drawn in
 * canvas 2D from the same model and the same turn, through one still camera, on its hatched ground. It needs
 * neither three.js nor GSAP. Hover and tap still trace load paths (a redraw costs a few milliseconds).
 */
import { inkOf, PLAN_MINOR, PLAN_RADIUS, SLAB, type HangingModel } from "./model";
import { lensFov, modelHeight, modelMatrix, stillCamera, turnAxis, type Framing } from "./timeline";

const SHEET = "#0e1012";
const CHALK = "233, 230, 223";
const GRAPHITE = "93, 97, 102";
const BLUE = "62, 166, 255";

interface View {
  readonly m: Float32Array;
  readonly e: readonly [number, number, number];
  readonly f: readonly [number, number, number];
  readonly r: readonly [number, number];
  readonly u: readonly [number, number, number];
  readonly k: number;
  readonly cx: number;
  readonly cy: number;
}

export class Fallback {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly model: HangingModel;
  private framing: Framing;
  private width = 1;
  private height = 1;
  private dpr = 1;
  /** Screen x, y and depth per file. */
  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  private sd = new Float32Array(0);
  private scale = 1;
  private view: View | null = null;

  constructor(canvas: HTMLCanvasElement, model: HangingModel, framing: Framing) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2d context");
    this.ctx = ctx;
    this.model = model;
    this.framing = framing;
  }

  resize(width: number, height: number, dpr: number, framing: Framing): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    this.framing = framing;
    const canvas = this.ctx.canvas;
    canvas.width = Math.round(this.width * dpr);
    canvas.height = Math.round(this.height * dpr);
    this.project();
  }

  /** Perspective projection through the still camera (with its lens shift), standing. */
  private project(): void {
    const model = this.model;
    const cam = stillCamera(model, this.framing);
    const m = new Float32Array(16);
    modelMatrix(modelHeight(model), 1, turnAxis(this.framing), m);
    const [ex, ey, ez] = cam.eye;
    const [tx, ty, tz] = cam.target;
    let fx = tx - ex;
    let fy = ty - ey;
    let fz = tz - ez;
    const fl = Math.hypot(fx, fy, fz);
    fx /= fl;
    fy /= fl;
    fz /= fl;
    // right = f x up(0,1,0), up = right x f
    let rx = -fz;
    let rz = fx;
    const rl = Math.hypot(rx, rz);
    rx /= rl;
    rz /= rl;
    const fov = lensFov(cam.fov, this.width / this.height, this.framing);
    const k = this.height / 2 / Math.tan((fov * Math.PI) / 360);
    this.scale = k;
    this.view = {
      m,
      e: [ex, ey, ez],
      f: [fx, fy, fz],
      r: [rx, rz],
      u: [-rz * fy, rz * fx - rx * fz, rx * fy],
      k,
      cx: (this.width / 2) * (1 + cam.lensX),
      cy: (this.height / 2) * (1 - cam.lensY),
    };
    const n = model.n;
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.sd = new Float32Array(n);
    const out: [number, number, number] = [0, 0, 0];
    for (let v = 0; v < n; v++) {
      this.screen(model.rest[v * 3]!, model.rest[v * 3 + 1]!, model.rest[v * 3 + 2]!, out);
      this.sx[v] = out[0];
      this.sy[v] = out[1];
      this.sd[v] = out[2];
    }
  }

  /** A model-space point, turned over, on screen: [x, y, depth]. */
  private screen(
    x: number,
    y: number,
    z: number,
    out: [number, number, number],
  ): [number, number, number] {
    const { m, e, f, r, u, k, cx, cy } = this.view!;
    const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]! - e[0];
    const wy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]! - e[1];
    const wz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]! - e[2];
    const depth = wx * f[0] + wy * f[1] + wz * f[2];
    out[0] = cx + ((wx * r[0] + wz * r[1]) * k) / depth;
    out[1] = cy - ((wx * u[0] + wy * u[1] + wz * u[2]) * k) / depth;
    out[2] = depth;
    return out;
  }

  /** The plan's ellipse at a radius (in plan units) and a height above the board (model space), on screen. */
  private ellipse(radius: number, y: number): [number, number][] {
    const out: [number, number, number] = [0, 0, 0];
    const points: [number, number][] = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      this.screen(Math.cos(t) * PLAN_RADIUS * radius, y, Math.sin(t) * PLAN_MINOR * radius, out);
      points.push([out[0], out[1]]);
    }
    return points;
  }

  /** The ground: the band the foundations stand in and the slab under it, hatched like a section. */
  private drawGround(): void {
    const { ctx } = this;
    const inner = this.ellipse(0.865, 0);
    const outer = this.ellipse(1.145, 0);
    const under = this.ellipse(1.145, SLAB);
    const trace = (pts: [number, number][]) => {
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    };
    const hatch = (alpha: number) => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [x, y] of [...outer, ...under]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      ctx.beginPath();
      for (let s = x0 - (y1 - y0); s < x1; s += 7) {
        ctx.moveTo(s, y1);
        ctx.lineTo(s + (y1 - y0), y0);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${GRAPHITE}, ${alpha})`;
      ctx.stroke();
    };
    // The band on the ground.
    ctx.save();
    ctx.beginPath();
    trace(outer);
    trace(inner);
    ctx.clip("evenodd");
    hatch(0.45);
    ctx.restore();
    // The slab's face: between the ground's outer edge and the same edge one slab lower.
    ctx.save();
    ctx.beginPath();
    trace(outer);
    trace(under);
    ctx.clip("evenodd");
    hatch(0.32);
    ctx.restore();
    ctx.lineWidth = 1;
    for (const [pts, alpha] of [
      [outer, 0.7],
      [inner, 0.45],
      [under, 0.35],
    ] as const) {
      ctx.beginPath();
      trace(pts);
      ctx.strokeStyle = `rgba(${CHALK}, ${alpha * 0.55})`;
      ctx.stroke();
    }
  }

  draw(masks: { nodes: Uint8Array; edges: Uint8Array } | null): void {
    const { ctx, model, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = SHEET;
    ctx.fillRect(0, 0, this.width, this.height);
    this.drawGround();
    let dmin = Infinity;
    let dmax = -Infinity;
    for (let v = 0; v < model.n; v++) {
      dmin = Math.min(dmin, this.sd[v]!);
      dmax = Math.max(dmax, this.sd[v]!);
    }
    const focus = masks !== null;
    const order = [...Array(model.m).keys()].sort(
      (p, q) => model.edgeLoad[p]! - model.edgeLoad[q]!,
    );
    const pass = (lit: boolean) => {
      for (const k of order) {
        const isLit = masks !== null && masks.edges[k] === 1;
        if (isLit !== lit) continue;
        const a = model.edgeA[k]!;
        const b = model.edgeB[k]!;
        const ink = inkOf(Math.sqrt(model.edgeLoad[k]! / model.maxEdgeLoad));
        const depth = ((this.sd[a]! + this.sd[b]!) / 2 - dmin) / Math.max(1e-6, dmax - dmin);
        let alpha = (0.075 + 0.845 * ink) * (1 - 0.55 * depth);
        if (focus && !isLit) alpha *= 0.2;
        if (isLit) alpha = Math.max(alpha, 0.5 + 0.45 * ink);
        // Turned over, the sag of a chain becomes the rise of an arch: bow the line upwards on screen.
        const mx = (this.sx[a]! + this.sx[b]!) / 2;
        const my = (this.sy[a]! + this.sy[b]!) / 2;
        const sag = (model.edgeSag[k]! * this.scale) / ((this.sd[a]! + this.sd[b]!) / 2);
        ctx.beginPath();
        ctx.moveTo(this.sx[b]!, this.sy[b]!);
        ctx.quadraticCurveTo(mx, my - sag * 2, this.sx[a]!, this.sy[a]!);
        ctx.lineWidth = (0.55 + 3.15 * ink) * (isLit ? 1.2 : 1);
        ctx.strokeStyle = `rgba(${isLit ? BLUE : CHALK}, ${alpha.toFixed(3)})`;
        ctx.stroke();
      }
    };
    pass(false);
    pass(true);
    const nodes = [...Array(model.n).keys()].sort((p, q) => this.sd[q]! - this.sd[p]!);
    for (const v of nodes) {
      const lit = masks !== null && masks.nodes[v] === 1;
      const r = Math.max(1.7, (model.radius[v]! * this.scale) / this.sd[v]!);
      const depth = (this.sd[v]! - dmin) / Math.max(1e-6, dmax - dmin);
      let alpha = 1 - 0.5 * depth;
      if (focus && !lit) alpha *= 0.3;
      ctx.beginPath();
      ctx.arc(this.sx[v]!, this.sy[v]!, r, 0, Math.PI * 2);
      const ink = `rgba(${lit ? BLUE : CHALK}, ${alpha.toFixed(3)})`;
      ctx.fillStyle = model.foundation[v] === 1 ? ink : SHEET;
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = ink;
      ctx.stroke();
    }
  }

  pick(x: number, y: number, slop: number): number {
    let best = -1;
    let bestScore = Infinity;
    for (let v = 0; v < this.model.n; v++) {
      const r = Math.max(3, (this.model.radius[v]! * this.scale) / this.sd[v]!);
      const d = Math.hypot(this.sx[v]! - x, this.sy[v]! - y);
      if (d > r + slop) continue;
      const score = Math.max(0, d - r) + this.sd[v]! * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }

  screenOf(v: number): { x: number; y: number } | null {
    if (v < 0 || v >= this.model.n) return null;
    return { x: this.sx[v]!, y: this.sy[v]! };
  }
}
