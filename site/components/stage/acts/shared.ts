/**
 * Small pieces the acts share: their trace graph, lighting masks, camera keys, the drawn shape of a chain on the
 * standing structure, and DOM helpers for overlays. Pure apart from the DOM helpers; no three.js, no GSAP.
 */
import type { CameraKey, LitMask, ScreenPoint } from "../act";
import type { GraphData, HangingModel } from "../model";
import { modelHeight, modelMatrix, turnAxis, type Framing } from "../timeline";
import { traceGraph, type TraceGraph } from "./trace";
import type { Span } from "./timing";

/** The id prefix of the record's lines (CodeBlock lineId): Act II ties its leaders to them. */
export const RECORD_LINES = "kfilm-record";

const graphs = new WeakMap<GraphData, TraceGraph>();

/** The trace graph of the analysis, built once per data (about 4 ms): every scope, tests included. */
export function graphOf(data: GraphData): TraceGraph {
  let g = graphs.get(data);
  if (g === undefined) {
    g = traceGraph(data);
    graphs.set(data, g);
  }
  return g;
}

const modelGraphs = new WeakMap<HangingModel, TraceGraph>();

/**
 * The trace graph of the drawing itself: the model's source files and its chains (the runtime dependencies between
 * source files), numbered as the model numbers them. Its "runtime" traces are the analysis's (trace.ts agrees with
 * the model file for file), so an act can light a trace from the model alone, as lit() and traceOf() are given it.
 */
export function modelGraph(model: HangingModel): TraceGraph {
  let g = modelGraphs.get(model);
  if (g === undefined) {
    const foundations: number[] = [];
    for (let v = 0; v < model.n; v++) if (model.foundation[v] === 1) foundations.push(v);
    g = traceGraph({
      files: model.paths.map((path) => [path, 0, 0] as const),
      edges: Array.from({ length: model.m }, (_, k) => [model.edgeA[k]!, model.edgeB[k]!, 1, 1] as const),
      foundations,
    });
    modelGraphs.set(model, g);
  }
  return g;
}

/** A mask lighting these files and chains, with everything else stepped back by `dim`. */
export function maskOf(
  model: HangingModel,
  nodes: readonly number[],
  chains: readonly number[],
  dim: number,
): LitMask {
  const n = new Uint8Array(model.n);
  const e = new Uint8Array(model.m);
  for (const v of nodes) if (v >= 0) n[v] = 1;
  for (const k of chains) if (k >= 0) e[k] = 1;
  return { nodes: n, edges: e, dim };
}

/** The chain from file a (the dependent) to file b (its dependency), or -1. */
export function chainOf(model: HangingModel, a: number, b: number): number {
  for (const k of model.out[a] ?? []) if (model.edgeB[k] === b) return k;
  return -1;
}

/** A camera key from its local time and its values (yaw, pitch, distance, target, fov, lens). */
export function key(t: number, values: readonly number[]): CameraKey {
  return [t, ...values] as unknown as CameraKey;
}

/** The values of a key, without its time. */
export function valuesOf(k: CameraKey): number[] {
  return k.slice(1) as number[];
}

/**
 * The yaw nearest `near` that looks the same as `yaw` (a whole turn apart), so a camera track never spins the long way
 * round between two keys.
 */
export function nearestYaw(yaw: number, near: number): number {
  const turn = Math.PI * 2;
  return yaw + Math.round((near - yaw) / turn) * turn;
}

/**
 * Points along chain k as the stage draws it on the standing structure, in world space: from its dependency up to its
 * dependent, its sag turned into the rise of an arch.
 */
export function chainPoints(
  model: HangingModel,
  framing: Framing,
  k: number,
  samples: number,
): [number, number, number][] {
  const m = new Float32Array(16);
  modelMatrix(modelHeight(model), 1, turnAxis(framing), m);
  const a = model.edgeA[k]!;
  const b = model.edgeB[k]!;
  const r = model.rest;
  const sag = model.edgeSag[k]!;
  const out: [number, number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const s = i / samples;
    const x = r[b * 3]! + (r[a * 3]! - r[b * 3]!) * s;
    const y = r[b * 3 + 1]! + (r[a * 3 + 1]! - r[b * 3 + 1]!) * s - sag * 4 * s * (1 - s);
    const z = r[b * 3 + 2]! + (r[a * 3 + 2]! - r[b * 3 + 2]!) * s;
    out.push([
      m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
      m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
      m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
    ]);
  }
  return out;
}

/** 0 before the span, 1 after it, eased in between (a fade that the scroll scrubs). */
export function shown(t: number, span: Span, fade = 0.015): number {
  return Math.min(ramp(t, span.from - fade, span.from + fade), 1 - ramp(t, span.to - fade, span.to + fade));
}

/** 0 at a, 1 at b, smoothstepped. */
export function ramp(t: number, a: number, b: number): number {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

export function setOn(el: Element, on: boolean): void {
  if (on) el.setAttribute("data-on", "");
  else el.removeAttribute("data-on");
}

const SVG = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return el;
}

export function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** A scratch screen point. */
export function point(): ScreenPoint {
  return { x: 0, y: 0, depth: 0, visible: false };
}

/** Positions a box by its top left corner (CSS px on its frame), without layout. */
export function place(el: HTMLElement, x: number, y: number): void {
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
}

/** Path data from points. */
export function polyline(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join("");
}
