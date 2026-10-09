/**
 * Act III, "Know what a change will touch before you make it.": the heaviest foundation (src/graph/model/types.ts) is
 * lit at the base of the standing structure (C1) and named (C2); a change to it rises through everything that rests
 * on it, one dependency at a time, the load wave reversed, while a counter of the files reached climbs (C3); then the
 * shortest path from the crown down to it is drawn bold and named (C4).
 *
 * Impact analysis is planned for v1 (milestone 9): the act's caption and its title block say so from start to end, and
 * the trace is this page's, computed over Katedrala's dependencies (trace.ts), as the scope line beside the counter says.
 */
import type {
  ActContext,
  ActDefinition,
  ActLabel,
  ActOverlay,
  CameraKey,
  LitMask,
  ScreenPoint,
} from "../act";
import type { HangingModel } from "../model";
import { cameraFrom, emptyCamera, type CameraState, type Framing } from "../timeline";
import { baseName, pathNote, subjectNote } from "./copy";
import { formatCount } from "../model";
import {
  chainPoints,
  key,
  maskOf,
  modelGraph,
  nearestYaw,
  point,
  ramp,
  setOn,
  shown,
  svg,
  valuesOf,
} from "./shared";
import { CHANGE } from "./timing";
import { pathTo, trace, type Trace } from "./trace";

/** The local time the still figure stands for: C4, every file reached, the path from the crown drawn and named. */
const STILL_T = 0.92;

/* ------------------------------------------------------------------------------------------------------------
 * The change and what it reaches.
 * ---------------------------------------------------------------------------------------------------------- */

interface Change {
  /** The subject: the foundation the most files rest on. */
  readonly subject: number;
  /** Its trace up through what rests on it, over the drawing's chains. */
  readonly trace: Trace;
  /** The files reached, in the order they light: step by step, and within a step from the lowest level up. */
  readonly order: readonly number[];
  /** Where each step's files end in `order`. */
  readonly stepEnds: readonly number[];
  /** The shortest path from the crown down to the subject, crown first (empty if the crown is not reached). */
  readonly path: readonly number[];
  /** Its chains, from the crown down. */
  readonly pathChains: readonly number[];
}

const changes = new WeakMap<HangingModel, Change>();

export function changeOf(model: HangingModel): Change {
  let c = changes.get(model);
  if (c === undefined) {
    const subject = model.heaviest[0] ?? 0;
    const tr = trace(modelGraph(model), subject, "up", "runtime");
    const order: number[] = [];
    const stepEnds: number[] = [];
    for (let s = 1; s < tr.layers.length; s++) {
      const layer = [...tr.layers[s]!].sort(
        (p, q) => model.level[p]! - model.level[q]! || tr.graph.rank[p]! - tr.graph.rank[q]!,
      );
      order.push(...layer);
      stepEnds.push(order.length);
    }
    const path = pathTo(tr, model.crown);
    const pathChains = path.slice(0, -1).map((v) => tr.via[v]!);
    c = { subject, trace: tr, order, stepEnds, path, pathChains };
    changes.set(model, c);
  }
  return c;
}

/**
 * How many files have lit at local t: each step takes an equal share of the rise, lighting its files over the first
 * three quarters of its share and holding them for the rest, so each step's running count can be read.
 */
export function reachedAt(c: Change, t: number): { lit: number; step: number } {
  const { from, to } = CHANGE.rise;
  const steps = c.stepEnds.length;
  if (t <= from) return { lit: 0, step: 0 };
  if (t >= to) return { lit: c.order.length, step: steps };
  const u = ((t - from) / (to - from)) * steps;
  const s = Math.min(steps - 1, Math.floor(u));
  const within = Math.min(1, (u - s) / 0.75);
  const start = s === 0 ? 0 : c.stepEnds[s - 1]!;
  const end = c.stepEnds[s]!;
  return { lit: start + Math.round((end - start) * within), step: s + 1 };
}

const masks = new WeakMap<HangingModel, Map<number, LitMask>>();

/** The subject and the first `lit` files of the rise, with each one's chain to the file it was reached from. */
function riseMask(model: HangingModel, lit: number, dim: number): LitMask {
  let byCount = masks.get(model);
  if (byCount === undefined) {
    byCount = new Map();
    masks.set(model, byCount);
  }
  const k = lit * 10 + Math.round(dim * 10);
  let m = byCount.get(k);
  if (m === undefined) {
    const c = changeOf(model);
    const files = c.order.slice(0, lit);
    m = maskOf(
      model,
      [c.subject, ...files],
      files.map((v) => c.trace.via[v]!),
      dim,
    );
    byCount.set(k, m);
  }
  return m;
}

/* ------------------------------------------------------------------------------------------------------------
 * The camera: a three-quarter view of the standing structure that turns slowly as the change rises, towards the
 * still drawing's view, where the landing settles.
 * ---------------------------------------------------------------------------------------------------------- */

function shots(model: HangingModel, framing: Framing, yawNear: number): number[][] {
  const H = model.maxLevel * model.levelHeight;
  const ty = H / 2 - 0.6;
  const yaw = (v: number) => nearestYaw(v, yawNear);
  return framing === "wide"
    ? [
        // C1: the subject at the base, in front.
        [yaw(4.36), 0.15, 48, 0, ty, 0, 31, 0.3, 0.05],
        // C2: the orbit begins.
        [yaw(4.16), 0.16, 48, 0, ty, 0, 31, 0.3, 0.05],
        // C3: rising with the change.
        [yaw(3.9), 0.2, 49, 0, ty + 0.8, 0, 31, 0.3, 0.04],
        // C4: the path from the crown down to the subject in full view.
        [yaw(3.74), 0.18, 49, 0, ty + 0.4, 0, 31, 0.3, 0.05],
      ]
    : [
        [yaw(5.92), 0.15, 84, 0, ty, 0, 38, 0, 0.12],
        [yaw(5.72), 0.16, 84, 0, ty, 0, 38, 0, 0.12],
        [yaw(5.46), 0.2, 85, 0, ty + 0.8, 0, 38, 0, 0.12],
        [yaw(5.3), 0.18, 86, 0, ty + 0.4, 0, 38, 0, 0.12],
      ];
}

function cameraKeys(model: HangingModel, framing: Framing, from: CameraKey | null): CameraKey[] {
  const start = from ?? key(0, shots(model, framing, 0)[0]!);
  const [c1, c2, c3, c4] = shots(model, framing, start[1]);
  return [
    key(0, valuesOf(start)),
    key(CHANGE.c1.from + 0.08, c1!),
    key(CHANGE.c2.from, c2!),
    key(CHANGE.c3.to, c3!),
    key(1, c4!),
  ];
}

function stillCamera(model: HangingModel, framing: Framing): CameraState {
  return cameraFrom(shots(model, framing, 0)[3]!, emptyCamera());
}

/* ------------------------------------------------------------------------------------------------------------
 * The overlay: the subject named, the counter, the path drawn and named.
 * ---------------------------------------------------------------------------------------------------------- */

class ChangeOverlay implements ActOverlay {
  private readonly ctx: ActContext;
  private readonly c: Change;
  private readonly subjectLabel: ActLabel;
  private readonly pathLabels: ActLabel[];
  /** On tall frames the files between the crown and the subject are named by their file names alone. */
  private readonly pathMicro: ActLabel[];
  private readonly counter: HTMLElement | null;
  private readonly value: HTMLElement | null;
  private readonly ticks: HTMLElement[];
  private readonly titleSwap: HTMLElement | null;
  private readonly bold: SVGPathElement | null;
  private readonly pt: ScreenPoint = point();
  private on = false;
  private shownLit = -1;
  private shownStep = -1;
  private boldFor: string | null = null;
  private boldPoints: [number, number, number][][] = [];
  private boldD = "";

  constructor(ctx: ActContext) {
    this.ctx = ctx;
    const model = ctx.model;
    this.c = changeOf(model);
    const layer = ctx.layer ?? ctx.frame;
    this.counter = layer.querySelector<HTMLElement>("[data-ch-counter]");
    this.value = layer.querySelector<HTMLElement>("[data-ch-value]");
    this.ticks = [...layer.querySelectorAll<HTMLElement>("[data-ch-step]")];
    this.titleSwap = layer.querySelector<HTMLElement>("[data-ch-titleblock]");
    this.subjectLabel = ctx.label({ active: true });
    this.subjectLabel.set(
      model.paths[this.c.subject]!,
      subjectNote(model.lines[this.c.subject]!, model.foundation[this.c.subject] === 1),
    );
    const count = this.c.path.length;
    this.pathLabels = this.c.path.map((v, i) => {
      const label = ctx.label({ active: true });
      label.set(model.paths[v]!, pathNote(model.level[v]!, i, count));
      return label;
    });
    this.pathMicro = this.c.path.map((v) => {
      const label = ctx.label({ active: true, micro: true });
      label.set(baseName(model.paths[v]!), "");
      return label;
    });
    // The path is drawn under the labels, on the drawing's own leader layer.
    const leaders = ctx.frame.querySelector<SVGSVGElement>(
      ctx.mode === "film" ? "[data-film-leaders]" : "[data-still-leaders]",
    );
    this.bold = leaders === null ? null : svg("path", { "data-ch-path": "" });
    if (this.bold !== null && leaders !== null) {
      this.bold.style.cssText =
        "fill:none;stroke:var(--color-load,#3ea6ff);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;opacity:0;transition:none";
      leaders.append(this.bold);
    }
  }

  update(t: number): void {
    const { ctx, c } = this;
    const film = ctx.mode === "film";
    const on = t > -0.02 && t < 1.02;
    if (!on) {
      if (this.on) this.hide();
      return;
    }
    this.on = true;
    const tracing = ctx.traced() >= 0;
    // The still figure is updated with its own time (STILL_T); the film with the scroll's.
    const tt = film ? t : STILL_T;

    // The title block's third line: impact analysis is planned for v1, for the whole act.
    if (this.titleSwap !== null) setOn(this.titleSwap, film);

    // The subject named from C1 until the path takes over.
    const subjectOn =
      !tracing && tt < CHANGE.path.from && shown(tt, { from: CHANGE.c1.from, to: 1 }) > 0.5;
    if (subjectOn) this.subjectLabel.at(c.subject);
    else this.subjectLabel.hide();

    // The counter: files reached, step by step.
    const counterOn = shown(tt, CHANGE.counter) > 0.5;
    if (this.counter !== null) setOn(this.counter, counterOn);
    const { lit, step } = reachedAt(c, tt);
    if (lit !== this.shownLit && this.value !== null) {
      this.shownLit = lit;
      this.value.textContent = formatCount(lit);
    }
    if (step !== this.shownStep) {
      this.shownStep = step;
      this.ticks.forEach((tick, i) => {
        tick.toggleAttribute("data-current", i === step - 1);
        tick.toggleAttribute("data-passed", i < step - 1);
      });
    }

    // C4: the path from the crown down, drawn bold and named, file by file.
    const pathOn = shown(tt, CHANGE.path) > 0.5 && c.path.length > 0;
    const last = c.path.length - 1;
    // Tall frames, and wide ones too short for five full labels, name the files between the ends by name alone.
    const tall = ctx.framing === "tall" || ctx.size().height < 600;
    c.path.forEach((v, i) => {
      const end = i === 0 || i === last;
      const full = pathOn && !tracing && (!tall || end);
      const micro = pathOn && !tracing && tall && !end;
      if (full) this.pathLabels[i]!.at(v);
      else this.pathLabels[i]!.hide();
      if (micro) this.pathMicro[i]!.at(v);
      else this.pathMicro[i]!.hide();
    });
    this.drawPath(pathOn ? ramp(tt, CHANGE.path.from, CHANGE.path.from + 0.08) : 0, tracing);
  }

  /**
   * The path as the chains draw it, traced over in load blue at a heavier weight. Projected again on every update
   * while it shows (the camera keeps moving through C4; the director updates only when the drawing changed): four
   * chains of thirteen points, a few microseconds. Their points on the standing structure are kept per framing.
   */
  private drawPath(k: number, tracing: boolean): void {
    const bold = this.bold;
    if (bold === null) return;
    const { ctx, c } = this;
    const visible = k > 0.001 && !tracing;
    if (visible) {
      if (this.boldFor !== ctx.framing) {
        this.boldFor = ctx.framing;
        this.boldPoints = c.pathChains
          .filter((chain) => chain >= 0)
          .map((chain) => chainPoints(ctx.model, ctx.framing, chain, 12));
      }
      let d = "";
      for (const pts of this.boldPoints) {
        pts.forEach((p, i) => {
          ctx.screenOfWorld(p[0], p[1], p[2], this.pt);
          d += `${i === 0 ? "M" : "L"}${this.pt.x.toFixed(1)} ${this.pt.y.toFixed(1)}`;
        });
      }
      if (d !== this.boldD) {
        this.boldD = d;
        bold.setAttribute("d", d);
      }
    }
    const opacity = String(visible ? k : 0);
    if (bold.style.opacity !== opacity) bold.style.opacity = opacity;
  }

  private hide(): void {
    this.on = false;
    this.subjectLabel.hide();
    for (const label of [...this.pathLabels, ...this.pathMicro]) label.hide();
    if (this.counter !== null) setOn(this.counter, false);
    if (this.titleSwap !== null) setOn(this.titleSwap, false);
    if (this.bold !== null) this.bold.style.opacity = "0";
  }

  dispose(): void {
    this.hide();
    this.bold?.remove();
  }
}

/* ------------------------------------------------------------------------------------------------------------
 * The act.
 * ---------------------------------------------------------------------------------------------------------- */

export const changeAct: ActDefinition = {
  id: "change",
  cameraKeys,
  lit(t, model) {
    const c = changeOf(model);
    // C1 and C2: the subject alone, the rest stepped back so it can be found at the base.
    if (t < CHANGE.rise.from) return riseMask(model, 0, 0.6);
    const { lit } = reachedAt(c, t);
    return riseMask(model, lit, 0.78);
  },
  mount: (ctx) => new ChangeOverlay(ctx),
  still: {
    camera: stillCamera,
    lit: (model) => riseMask(model, changeOf(model).order.length, 0.78),
    t: STILL_T,
  },
};
