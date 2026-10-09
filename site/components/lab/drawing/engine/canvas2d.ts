import { RECORD, sampleCatenary } from "./catenary";
import { DOT } from "./layers";
import type { DrawingRenderer, Layer, RendererFactory } from "./layers";
import { project } from "./view";
import type { Camera, Point } from "./view";

/**
 * The drawing without WebGL: the same records, sampled and stroked with the 2D canvas API. It draws on demand
 * only (the standing structure, and again when a member is tested), so it never animates.
 */

class ArrayLayer implements Layer {
  readonly data: Float32Array;
  count = 0;
  constructor(capacity: number, stride: number) {
    this.data = new Float32Array(capacity * stride);
  }
  upload(): void {}
}

/** Segments per catenary: the still drawing is stroked once, so it can afford smooth arches. */
const STEPS = 28;

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a.toFixed(3)})`;
}

export class CanvasDrawing implements DrawingRenderer {
  readonly construction: Layer;
  readonly chains: Layer;
  readonly joints: Layer;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private readonly p: Point = { x: 0, y: 0, depth: 0 };
  private readonly sample = new Float64Array(3);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    sizes: { construction: number; chains: number; joints: number },
    private readonly palette: {
      sheet: readonly [number, number, number];
      load: readonly [number, number, number];
    },
  ) {
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("No 2D canvas");
    this.ctx = ctx;
    this.construction = new ArrayLayer(sizes.construction, RECORD);
    this.chains = new ArrayLayer(sizes.chains, RECORD);
    this.joints = new ArrayLayer(sizes.joints, DOT);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  render(cam: Camera, _depth: readonly [number, number], chainFade = 1): void {
    const { ctx, palette } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = `rgb(${palette.sheet.join(",")})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.lineCap = "round";
    this.lines(this.construction, cam, 1);
    this.lines(this.chains, cam, chainFade);
    this.dots(cam);
  }

  private lines(layer: Layer, cam: Camera, fade: number) {
    const { ctx, p, sample } = this;
    const d = layer.data;
    const [lr, lg, lb] = this.palette.load.map((v) => v / 255) as [number, number, number];
    for (let i = 0; i < layer.count; i++) {
      const o = i * RECORD;
      const width = d[o + 9]!;
      const alpha = d[o + 10]! * Math.min(1, width * this.dpr) * fade;
      if (alpha < 0.004) continue;
      const lit = d[o + 11]!;
      const straight = d[o + 3] === 0;
      const steps = straight ? 1 : STEPS;
      const trace = (from: number, to: number) => {
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) {
          const t = from + ((to - from) * k) / steps;
          sampleCatenary(d, o, t, sample, 0);
          project(cam, sample[0]!, sample[1]!, sample[2]!, p);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      };
      ctx.lineWidth = Math.max(width, 1 / this.dpr);
      const split = lit <= 0 ? 0 : Math.min(1, lit);
      if (split < 1) {
        ctx.strokeStyle = rgba(d[o + 12]!, d[o + 13]!, d[o + 14]!, alpha);
        trace(split, 1);
      }
      if (split > 0) {
        ctx.strokeStyle = rgba(lr, lg, lb, alpha);
        trace(0, split);
      }
    }
  }

  private dots(cam: Camera) {
    const { ctx, p } = this;
    const d = this.joints.data;
    const sheet = `rgb(${this.palette.sheet.join(",")})`;
    for (let i = 0; i < this.joints.count; i++) {
      const o = i * DOT;
      const alpha = d[o + 7]!;
      if (alpha < 0.004) continue;
      project(cam, d[o]!, d[o + 1]!, d[o + 2]!, p);
      const r = d[o + 3]!;
      const colour = rgba(d[o + 4]!, d[o + 5]!, d[o + 6]!, alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (d[o + 8]! < 0.5) {
        ctx.fillStyle = colour;
        ctx.fill();
      } else {
        const stroke = d[o + 9]!;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, r - stroke / 2), 0, Math.PI * 2);
        ctx.fillStyle = sheet;
        ctx.fill();
        ctx.lineWidth = stroke;
        ctx.strokeStyle = colour;
        ctx.stroke();
      }
    }
  }

  dispose(): void {}
}

export const createCanvasDrawing: RendererFactory = (canvas, sizes, palette) =>
  new CanvasDrawing(canvas, sizes, palette);
