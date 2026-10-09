/**
 * Act II, "Every conclusion has evidence.": the camera cranes down from the crown hold to one real dependency
 * (src/analysis/analysis-service.ts to src/analysis/cache-key.ts, from the evidence JSON), lit in load blue while
 * everything else steps back. Its two ends are named (E1); the two files open as rulers of their lines beside their
 * rings, with their symbols' spans (E2, Parse); the seven observations run from the lines they were seen on to what
 * they bind (E3, Link); the relationship's record appears, its two "line" entries tied to the lines they name (E4);
 * then the camera pulls back and every chain brightens once (E5).
 *
 * The rulers are drawn to scale from the document: analysis-service.ts as a full-height scale of its lines, cache-key.ts
 * as a detail at four times that scale with the scale written on it. Wide windows set them upright beside their rings;
 * tall ones set them across the frame under the dependency, so every name and line number keeps at least 11 px.
 */
import type { ActContext, ActDefinition, ActLabel, ActOverlay, CameraKey, ScreenPoint } from "../act";
import type { HangingModel } from "../model";
import { cameraFrom, emptyCamera, standingOf, type CameraState, type Framing } from "../timeline";
import { countOf } from "../model";
import { baseName, detailScale, fileFacts, linesOf } from "./copy";
import type { EvidencePayload } from "./payload";
import {
  chainOf,
  html,
  key,
  maskOf,
  nearestYaw,
  place,
  point,
  ramp,
  RECORD_LINES,
  setOn,
  shown,
  svg,
  valuesOf,
} from "./shared";
import { EVIDENCE } from "./timing";

/** cache-key.ts is drawn at this many times the scale of analysis-service.ts. */
export const DETAIL_SCALE = 4;

/** The local time the still figure stands for: every observation bound (E3 complete). */
const STILL_T = 0.62;

/* ------------------------------------------------------------------------------------------------------------
 * The dependency in the model.
 * ---------------------------------------------------------------------------------------------------------- */

interface Dependency {
  /** The dependent (analysis-service.ts) and the dependency (cache-key.ts), as the model numbers its files. */
  readonly a: number;
  readonly b: number;
  readonly chain: number;
}

const DEPENDENT = "src/analysis/analysis-service.ts";
const DEPENDENCY = "src/analysis/cache-key.ts";

const dependencies = new WeakMap<HangingModel, Dependency>();

/**
 * The model's numbers for the act's dependency. The paths are the evidence JSON's (the generator refuses any other
 * document), repeated here because the act's camera keys are needed before the payload is read.
 */
function dependencyOf(model: HangingModel): Dependency {
  let d = dependencies.get(model);
  if (d === undefined) {
    const a = model.paths.indexOf(DEPENDENT);
    const b = model.paths.indexOf(DEPENDENCY);
    d = { a, b, chain: a >= 0 && b >= 0 ? chainOf(model, a, b) : -1 };
    dependencies.set(model, d);
  }
  return d;
}

const masks = new WeakMap<HangingModel, ReturnType<typeof maskOf>>();

function litOf(model: HangingModel) {
  let m = masks.get(model);
  if (m === undefined) {
    const d = dependencyOf(model);
    // Everything but the dependency steps back to about 15 percent.
    m = maskOf(model, [d.a, d.b], [d.chain], 0.85);
    masks.set(model, m);
  }
  return m;
}

/* ------------------------------------------------------------------------------------------------------------
 * The camera.
 * ---------------------------------------------------------------------------------------------------------- */

/**
 * The shot of the dependency (E1 to E4), held still so the rulers beside the rings stay put: the dependency from its
 * dependent (upper) to its dependency (lower), diagonal across the frame right of the words. Values found for the
 * reference windows (1440 x 900, 390 x 844), round the dependency's midpoint.
 */
function dependencyShot(model: HangingModel, framing: Framing, yawNear: number): number[] {
  const d = dependencyOf(model);
  const pa = standingOf(model, framing, Math.max(0, d.a));
  const pb = standingOf(model, framing, Math.max(0, d.b));
  const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
  return framing === "wide"
    ? [nearestYaw(5.266, yawNear), 0.2, 30.8, mid[0]!, mid[1]!, mid[2]!, 30, 0.333, 0.128]
    : [nearestYaw(6.734, yawNear), 0.254, 61.4, mid[0]!, mid[1]!, mid[2]!, 36, -0.026, 0.584];
}

/** The whole standing structure again, as the camera pulls back (E5's end; Act III starts here). */
function pullBack(model: HangingModel, framing: Framing, yawNear: number): number[] {
  const H = model.maxLevel * model.levelHeight;
  return framing === "wide"
    ? [nearestYaw(4.62, yawNear), 0.16, 58, 0, H / 2 - 0.6, 0, 31, 0.3, 0.04]
    : [nearestYaw(6.18, yawNear), 0.16, 82, 0, H / 2 - 0.6, 0, 38, 0, 0.06];
}

function cameraKeys(model: HangingModel, framing: Framing, from: CameraKey | null): CameraKey[] {
  const start = from ?? key(0, pullBack(model, framing, 0));
  const yaw0 = start[1];
  const shot = dependencyShot(model, framing, yaw0);
  // A drift too small to move the rulers' rings by more than a few pixels: the camera breathes, the drawing holds.
  const drift = (dy: number) => shot.map((v, i) => (i === 0 ? v + dy : v));
  const back = pullBack(model, framing, shot[0]!);
  return [
    key(0, valuesOf(start)),
    key(EVIDENCE.crane.to, shot),
    key(EVIDENCE.e4.to, drift(0.004)),
    key(1, back),
  ];
}

/** The still figure's camera: the shot of the dependency. */
function stillCamera(model: HangingModel, framing: Framing): CameraState {
  return cameraFrom(dependencyShot(model, framing, 0), emptyCamera());
}

/* ------------------------------------------------------------------------------------------------------------
 * The overlay: the two ends named, the rulers, the observations, the record's ties.
 * ---------------------------------------------------------------------------------------------------------- */

/** A ruler's place on the frame: a line from its head (line 1) to its foot (its last line). */
interface Ruler {
  /** Upright (wide frames) or across (tall ones). */
  readonly upright: boolean;
  /** Where line 1 is, and how far one line runs along the ruler (px). */
  readonly x: number;
  readonly y: number;
  readonly step: number;
  readonly lines: number;
}

/** The point of line n on a ruler. */
function at(r: Ruler, n: number): [number, number] {
  const s = (n - 1) * r.step;
  return r.upright ? [r.x, r.y + s] : [r.x + s, r.y];
}

interface Geometry {
  /** Rulers across the frame (tall frames, and wide ones too short to stand them upright), or upright. */
  readonly across: boolean;
  readonly width: number;
  readonly main: Ruler;
  readonly detail: Ruler;
}

/** Below this frame height (px) the rulers lie across the frame even on wide windows (a phone turned). */
const UPRIGHT_MIN = 600;

/** Words placed by the overlay: a box measured once per size and text, then moved with transforms. */
interface Word {
  readonly el: HTMLElement;
  w: number;
  h: number;
}

const f1 = (v: number) => v.toFixed(1);

class EvidenceOverlay implements ActOverlay {
  private readonly ctx: ActContext;
  private readonly e: EvidencePayload;
  private readonly dep: Dependency;
  private readonly root: HTMLElement;
  private readonly ends: [ActLabel, ActLabel];
  private readonly heads: [Word, Word];
  private readonly symbols: { readonly word: Word; readonly sym: EvidencePayload["symbols"][number] }[];
  private readonly numbers: Word[];
  private readonly lines: {
    readonly main: SVGPathElement;
    readonly mainTicks: SVGPathElement;
    readonly detail: SVGPathElement;
    readonly detailTicks: SVGPathElement;
    readonly mainSpan: SVGPathElement;
    readonly detailSpans: SVGPathElement;
    readonly joins: SVGPathElement;
    readonly marks: SVGPathElement;
    readonly leaders: readonly SVGPathElement[];
  };
  private readonly titleSwap: HTMLElement | null;
  private readonly condensed: HTMLElement | null;
  private readonly record: HTMLElement | null;
  private readonly cleanups: (() => void)[] = [];
  private readonly pa: ScreenPoint = point();
  private readonly pb: ScreenPoint = point();
  private geometry: Geometry | null = null;
  private geometryKey = "";
  private wordsFor: boolean | null = null;
  private on = false;
  private drawnKey = "";
  /** Where the record's "line" entries are on the frame, by line (measured once each time the record shows). */
  private rows: Map<number, [number, number]> | null = null;

  constructor(ctx: ActContext) {
    this.ctx = ctx;
    this.e = ctx.payload.evidence;
    this.dep = dependencyOf(ctx.model);
    const layer = ctx.layer ?? ctx.frame;
    this.titleSwap = layer.querySelector<HTMLElement>("[data-ev-titleblock]");
    this.condensed = layer.querySelector<HTMLElement>("[data-ev-condensed]");
    this.record =
      ctx.mode === "film" ? (ctx.slot?.querySelector<HTMLElement>("[data-ev-record]") ?? null) : null;

    // E1: the two ends named on the drawing, leaders in load blue (the dependency is what is active).
    this.ends = [ctx.label({ active: true }), ctx.label({ active: true })];
    this.ends[0].set(this.e.dependent.path, fileFacts(this.e.dependent));
    this.ends[1].set(this.e.dependency.path, fileFacts(this.e.dependency));

    this.root = document.createElement("div");
    this.root.setAttribute("data-ev-diagram", "");
    this.root.setAttribute("aria-hidden", "true");
    const canvas = svg("svg", { "data-ev-lines": "" });
    this.root.append(canvas);
    const path = (kind: string) => {
      const p = svg("path", { "data-ev": kind });
      canvas.append(p);
      return p;
    };
    this.lines = {
      joins: path("join"),
      mainSpan: path("bracket"),
      detailSpans: path("bracket"),
      main: path("ruler"),
      detail: path("ruler"),
      mainTicks: path("ticks"),
      detailTicks: path("ticks"),
      leaders: this.e.observations.map(() => path("leader")),
      marks: path("mark"),
    };
    const word = (kind: string): Word => {
      const el = document.createElement("span");
      el.setAttribute("data-ev-word", kind);
      this.root.append(el);
      return { el, w: 0, h: 0 };
    };
    this.heads = [word("head"), word("head")];
    this.symbols = [...this.e.symbols]
      .sort((p, q) => (p.side === q.side ? p.from - q.from : p.side === "dependent" ? -1 : 1))
      .map((sym) => ({ sym, word: word("sym") }));
    this.numbers = this.e.observations.map((o) => {
      const w = word("line");
      w.el.append(html("code", "", String(o.line)));
      return w;
    });
    (layer.querySelector<HTMLElement>("[data-ev-host]") ?? layer).append(this.root);

    if (this.record !== null) {
      // Focus reveal: a control in the record (its copy button, its scrolling code) reached from the keyboard brings
      // the film to E4, where the record is shown.
      const onFocus = (event: FocusEvent) => {
        const target = event.target as Element | null;
        if (target?.matches(":focus-visible") === true) ctx.reveal(EVIDENCE.e4.to - 0.06);
      };
      this.record.addEventListener("focusin", onFocus);
      this.cleanups.push(() => this.record?.removeEventListener("focusin", onFocus));
    }
    const onResize = () => {
      this.geometryKey = "";
      this.wordsFor = null;
      this.rows = null;
    };
    window.addEventListener("resize", onResize);
    this.cleanups.push(() => window.removeEventListener("resize", onResize));
  }

  /** The words for a layout: full paths beside upright rulers; names alone, lines stacked, across the frame. */
  private setWords(across: boolean): void {
    if (this.wordsFor === across) return;
    this.wordsFor = across;
    const wide = !across;
    const { dependent, dependency } = this.e;
    const fill = (w: Word, code: string, notes: readonly string[]) => {
      w.el.replaceChildren(html("code", "", code), ...notes.map((n) => html("span", "note", n)));
    };
    fill(this.heads[0], wide ? dependent.path : baseName(dependent.path), [
      countOf(dependent.lines, "line"),
    ]);
    fill(
      this.heads[1],
      wide ? dependency.path : `${baseName(dependency.path)}, ${countOf(dependency.lines, "line")}`,
      wide
        ? [`${countOf(dependency.lines, "line")}, ${detailScale(DETAIL_SCALE)}`]
        : [detailScale(DETAIL_SCALE)],
    );
    for (const { sym, word } of this.symbols) {
      const range = `${linesOf(sym.from, sym.to)}${sym.exported ? "" : ", not exported"}`;
      // Across a phone the detail's spans are short: their names stand alone (the narration gives the ranges).
      fill(word, sym.name, wide || sym.side === "dependent" ? [range] : []);
    }
    for (const w of [...this.heads, ...this.symbols.map((s) => s.word), ...this.numbers]) {
      w.w = w.el.offsetWidth;
      w.h = w.el.offsetHeight;
    }
  }

  update(t: number): void {
    const { ctx } = this;
    const film = ctx.mode === "film";
    if (t <= -0.02 || t >= 1.02) {
      if (this.on) this.hide();
      return;
    }
    this.on = true;
    const tracing = ctx.traced() >= 0;

    // E1: the two ends named while the camera arrives and holds (labels step aside for a traced file).
    if (film && shown(t, EVIDENCE.ends, 0.01) > 0.5 && !tracing) {
      this.ends[0].at(this.dep.a);
      this.ends[1].at(this.dep.b);
    } else {
      this.ends[0].hide();
      this.ends[1].hide();
    }
    // E3: the title block counts what cannot be bound.
    if (this.titleSwap !== null) setOn(this.titleSwap, film && shown(t, EVIDENCE.e3, 0.01) > 0.5);

    ctx.screenOf(this.dep.a, this.pa);
    ctx.screenOf(this.dep.b, this.pb);
    const g = this.layout();
    if (g !== null) this.draw(g, film ? t : STILL_T);
  }

  /** Where the rulers go, from where the rings are (again only when they or the frame move). */
  private layout(): Geometry | null {
    const { ctx, pa, pb } = this;
    if (!pa.visible || !pb.visible) return this.geometry;
    const { width: W, height: H } = ctx.size();
    const across = ctx.framing === "tall" || H < UPRIGHT_MIN;
    const k = `${across ? "across" : "upright"}:${Math.round(W)}x${Math.round(H)}:${Math.round(pa.x)},${Math.round(pa.y)}:${Math.round(pb.x)},${Math.round(pb.y)}`;
    if (k === this.geometryKey && this.geometry !== null) return this.geometry;
    this.geometryKey = k;
    this.setWords(across);
    const edge = Math.max(16, Math.min(48, W * 0.04));
    const { dependent, dependency } = this.e;
    let main: Ruler;
    let detail: Ruler;
    if (!across) {
      // Upright: the main ruler hangs beside the dependent's ring down to the foot of the drawing; the detail stands
      // beside the dependency's ring, centred on it, its functions named to its right.
      const top = pa.y + 30;
      const foot = Math.min(H * 0.87, top + H * 0.7);
      const step = (foot - top) / (dependent.lines - 1);
      main = { upright: true, x: pa.x - 68, y: top, step, lines: dependent.lines };
      const dstep = step * DETAIL_SCALE;
      const dlen = (dependency.lines - 1) * dstep;
      const widest = Math.max(
        0,
        ...this.symbols.filter((s) => s.sym.side === "dependency").map((s) => s.word.w),
      );
      const dx = Math.min(pb.x + 58, W - edge - widest - 30);
      const dy = Math.max(top + 60, Math.min(pb.y - dlen / 2, H * 0.87 - dlen));
      detail = { upright: true, x: dx, y: dy, step: dstep, lines: dependency.lines };
    } else if (ctx.framing === "tall") {
      // Across a tall frame: under the dependency, the main ruler the frame's width; the detail under it.
      const top = Math.max(pa.y, pb.y) + 76;
      const step = (W - 2 * edge - 8) / (dependent.lines - 1);
      main = { upright: false, x: edge + 4, y: top, step, lines: dependent.lines };
      detail = { upright: false, x: edge + 4, y: top + 86, step: step * DETAIL_SCALE, lines: dependency.lines };
    } else {
      // Across a short wide frame (a phone turned): right of the captions, from a third of the way down.
      const left = this.captionsRight() + 28;
      const step = (W - edge - 8 - left) / (dependent.lines - 1);
      const top = Math.max(H * 0.34, 96);
      main = { upright: false, x: left, y: top, step, lines: dependent.lines };
      detail = { upright: false, x: left, y: top + 86, step: step * DETAIL_SCALE, lines: dependency.lines };
    }
    this.geometry = { across, width: W, main, detail };
    this.rows = null;
    return this.geometry;
  }

  private draw(g: Geometry, t: number): void {
    const film = this.ctx.mode === "film";
    // How far each part has come, scrubbed by the scroll.
    const out = film ? 1 - ramp(t, EVIDENCE.rulers.to - 0.02, EVIDENCE.rulers.to + 0.01) : 1;
    const open = ramp(t, EVIDENCE.rulers.from, EVIDENCE.rulers.from + 0.08) * out;
    const spans = ramp(t, EVIDENCE.rulers.from + 0.05, EVIDENCE.rulers.from + 0.12) * out;
    const linked = ramp(t, EVIDENCE.leaders.from - 0.01, EVIDENCE.leaders.from + 0.075) * out;
    const recorded = film ? ramp(t, EVIDENCE.record.from, EVIDENCE.record.from + 0.035) * out : 0;
    const tied = film ? ramp(t, EVIDENCE.record.from + 0.025, EVIDENCE.record.from + 0.07) * out : 0;
    const visible = open > 0.001;
    this.root.toggleAttribute("data-on", visible);
    const recordOn = recorded > 0.5;
    if (this.condensed !== null) setOn(this.condensed, film && g.across && recordOn);
    if (this.record !== null) this.record.toggleAttribute("data-shown", film && recordOn);
    if (!recordOn) this.rows = null;
    if (!visible) return;
    const state = [open, spans, linked, recorded, tied].map((v) => v.toFixed(3)).join(",");
    const drawnKey = `${this.geometryKey}|${state}`;
    if (drawnKey === this.drawnKey) return;
    this.drawnKey = drawnKey;

    const { main, detail } = g;
    const up = main.upright;
    const L = this.lines;
    // The detail gives way to the record at E4 (on tall frames the record's rows take its place).
    const detailAlpha = open * (1 - recorded);

    // The rulers grow from their heads, ticks every ten lines on the main ruler and every line on the detail.
    L.main.setAttribute("d", this.ruler(main, open));
    L.detail.setAttribute("d", this.ruler(detail, open));
    L.mainTicks.setAttribute("d", this.ticks(main, open, 10, 50));
    L.detailTicks.setAttribute("d", this.ticks(detail, open, 1, 10));
    L.main.style.opacity = String(open);
    L.mainTicks.style.opacity = String(open);
    L.detail.style.opacity = String(detailAlpha);
    L.detailTicks.style.opacity = String(detailAlpha);

    // Short leaders from the rings to the rulers' heads: the rulers open beside the rings they stand for.
    const joins: string[] = [];
    if (this.pa.visible) joins.push(this.join([this.pa.x, this.pa.y], at(main, 1), up ? "left" : "down"));
    if (this.pb.visible && detailAlpha > 0.01) {
      joins.push(this.join([this.pb.x, this.pb.y], at(detail, 1), up ? "right" : "down"));
    }
    L.joins.setAttribute("d", joins.join(""));
    L.joins.style.opacity = String(open);

    // The heads: each file's path (or name) and its length; the detail's scale written on it.
    const [mx, my] = at(main, 1);
    const [dx, dy] = at(detail, 1);
    const [hm, hd] = this.heads;
    if (up) {
      this.put(hm, mx - 16 - hm.w, my - hm.h / 2, open, true);
      this.put(hd, dx - 6, dy - hd.h - 12, detailAlpha, false);
    } else {
      this.put(hm, mx, my + 12, open, false);
      const [ex] = at(detail, detail.lines);
      this.put(hd, ex + 14, dy - hd.h / 2, detailAlpha, false);
    }

    // E2: the symbols' spans as brackets beside the rulers, named.
    let mainSpan = "";
    let detailSpans = "";
    let stair = up ? -Infinity : 0;
    for (const { sym, word } of this.symbols) {
      const own = sym.side === "dependent";
      const r = own ? main : detail;
      const [x0, y0] = at(r, sym.from);
      const [x1, y1] = at(r, sym.to);
      if (up) {
        const o = own ? -16 : 16;
        const tick = own ? 4 : -4;
        const d = `M${f1(x0 + o + tick)} ${f1(y0)}h${-tick}V${f1(y1)}h${tick}`;
        if (own) {
          mainSpan += d;
          this.put(word, x0 + o - 10 - word.w, y0 - 2, spans, true);
        } else {
          detailSpans += d;
          const y = Math.max((y0 + y1) / 2 - word.h / 2, stair);
          stair = y + word.h;
          this.put(word, x0 + o + 12, y, spans * (1 - recorded), false);
        }
      } else {
        const d = `M${f1(x0)} ${f1(y0 + 5)}v3H${f1(x1)}v-3`;
        if (own) {
          mainSpan += d;
          this.put(word, Math.max(x0, hm.w + mx + 8), y0 + 12, spans, false);
        } else {
          detailSpans += d;
          this.put(word, x0, y0 + 14 + stair * (word.h + 1), spans * (1 - recorded), false);
          stair++;
        }
      }
    }
    L.mainSpan.setAttribute("d", mainSpan);
    L.detailSpans.setAttribute("d", detailSpans);
    L.mainSpan.style.opacity = String(spans);
    L.detailSpans.style.opacity = String(spans * (1 - recorded));

    // E3: each observation's line marked and numbered on the main ruler; its leader runs to what it binds (the
    // file's head for the import, the function's first line for the calls), one after another. At E4 the record's
    // two leaders run on to its "line" entries instead, lit; the others step back.
    const at0 = this.packNumbers(main);
    const rows = tied > 0 ? this.recordRows(g) : null;
    let marks = "";
    const count = this.e.observations.length;
    this.e.observations.forEach((o, i) => {
      const w = this.numbers[i]!;
      const [nx, ny] = at0[i]!;
      const [lx, ly] = at(main, o.line);
      const k = Math.min(1, Math.max(0, (linked - (i / Math.max(1, count - 1)) * 0.5) / 0.5));
      this.put(w, nx, ny, Math.min(1, linked * 2) * (o.recorded ? 1 : 1 - 0.7 * recorded), false);
      const lit = o.recorded && recorded > 0.5;
      w.el.toggleAttribute("data-lit", lit);
      if (up) {
        marks += `M${f1(lx)} ${f1(ly)}h8L${f1(nx - 3)} ${f1(ny + w.h / 2)}`;
      } else {
        marks += `M${f1(lx)} ${f1(ly)}v-7L${f1(nx + w.w / 2)} ${f1(ny + w.h + 1)}`;
      }
      let end = this.targetOf(detail, o.target);
      const row = o.recorded ? rows?.get(o.line) : undefined;
      if (row !== undefined) end = [end[0] + (row[0] - end[0]) * tied, end[1] + (row[1] - end[1]) * tied];
      const leader = L.leaders[i]!;
      leader.setAttribute(
        "d",
        up
          ? `M${f1(nx + w.w + 5)} ${f1(ny + w.h / 2)}h10L${f1(end[0] - 14)} ${f1(end[1])}H${f1(end[0] - 3)}`
          : `M${f1(lx)} ${f1(ly + 3)}L${f1(end[0])} ${f1(end[1] - 12)}V${f1(end[1] - 3)}`,
      );
      leader.toggleAttribute("data-lit", lit);
      leader.style.strokeDasharray = "1200";
      leader.style.strokeDashoffset = f1(1200 * (1 - k));
      leader.style.opacity = String(o.recorded ? 1 : 1 - 0.85 * recorded);
    });
    L.marks.setAttribute("d", marks);
    L.marks.style.opacity = String(Math.min(1, linked * 2));
  }

  private put(w: Word, x: number, y: number, alpha: number, right: boolean): void {
    place(w.el, x, y);
    w.el.style.opacity = alpha.toFixed(3);
    w.el.toggleAttribute("data-right", right);
  }

  private ruler(r: Ruler, k: number): string {
    const [x0, y0] = at(r, 1);
    const [x1, y1] = at(r, 1 + (r.lines - 1) * k);
    return `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
  }

  /** Ticks every `minor` lines, longer every `major`, and a bar across each end. */
  private ticks(r: Ruler, k: number, minor: number, major: number): string {
    let d = "";
    const last = 1 + (r.lines - 1) * k;
    for (let n = minor; n <= last; n += minor) {
      const [x, y] = at(r, n);
      const len = n % major === 0 ? 6 : 3;
      d += r.upright ? `M${f1(x)} ${f1(y)}h${-len}` : `M${f1(x)} ${f1(y)}v${len}`;
    }
    for (const n of [1, r.lines]) {
      if (n > last + 0.5) continue;
      const [x, y] = at(r, n);
      d += r.upright ? `M${f1(x - 6)} ${f1(y)}h12` : `M${f1(x)} ${f1(y - 6)}v12`;
    }
    return d;
  }

  /** A dotted leader from a ring to a ruler's head. */
  private join(from: [number, number], to: [number, number], side: "left" | "right" | "down"): string {
    const [x0, y0] = from;
    const end: [number, number] =
      side === "left" ? [to[0] + 8, to[1]] : side === "right" ? [to[0] - 8, to[1]] : [to[0], to[1] - 8];
    const dx = end[0] - x0;
    const dy = end[1] - y0;
    const l = Math.hypot(dx, dy);
    if (l < 14) return "";
    return `M${f1(x0 + (dx / l) * 7)} ${f1(y0 + (dy / l) * 7)}L${f1(end[0])} ${f1(end[1])}`;
  }

  /**
   * Where each observation's number goes: beside its line on the main ruler, nudged apart where lines are close
   * (189 and 190), in line order, inside the frame.
   */
  private packNumbers(r: Ruler): [number, number][] {
    const out: [number, number][] = [];
    let last = -Infinity;
    this.e.observations.forEach((o, i) => {
      const w = this.numbers[i]!;
      const [x, y] = at(r, o.line);
      if (r.upright) {
        const top = Math.max(y - w.h / 2, last);
        last = top + w.h - 3;
        out.push([x + 16, top]);
      } else {
        const left = Math.max(x - w.w / 2, last + 2);
        last = left + w.w;
        out.push([left, y - 9 - w.h]);
      }
    });
    if (!r.upright) {
      // Keep the last numbers inside the frame: push the run back from the right edge.
      let limit = this.geometry === null ? Infinity : this.ctx.size().width - 12;
      for (let i = out.length - 1; i >= 0; i--) {
        const w = this.numbers[i]!;
        if (out[i]![0] + w.w > limit) out[i]![0] = limit - w.w;
        limit = out[i]![0] - 2;
      }
    }
    return out;
  }

  /** The right edge of the captions' column on the frame (its left edge without captions, as in a still figure). */
  private captionsRight(): number {
    const { width } = this.ctx.size();
    const list = this.ctx.layer?.querySelector<HTMLElement>("ol") ?? null;
    if (list === null || this.ctx.mode !== "film") return Math.max(16, Math.min(48, width * 0.04));
    const frame = this.ctx.frame.getBoundingClientRect();
    return list.getBoundingClientRect().right - frame.left;
  }

  /** What an observation binds to on the detail: the file's head, or its function's first line. */
  private targetOf(detail: Ruler, target: string | null): [number, number] {
    if (target === null) return at(detail, 1);
    const sym = this.e.symbols.find((s) => s.side === "dependency" && s.name === target);
    return at(detail, sym?.from ?? 1);
  }

  /**
   * Where the record's "line" entries are on the frame: the code block's lines over a wide frame (measured against
   * the record's resting place, not its arriving transform), the condensed rows on a tall one.
   */
  private recordRows(g: Geometry): Map<number, [number, number]> | null {
    if (this.rows !== null) return this.rows;
    const base = this.ctx.frame.getBoundingClientRect();
    const rows = new Map<number, [number, number]>();
    if (g.across) {
      const box = this.condensed;
      if (box === null) return null;
      place(box, g.detail.x - 4, g.detail.y - 18);
      const boxRect = box.getBoundingClientRect();
      for (const el of box.querySelectorAll<HTMLElement>("[data-ev-row]")) {
        const code = el.querySelector("code") ?? el;
        const r = code.getBoundingClientRect();
        if (r.width < 1) return null;
        // Against the box's resting place: its rows' offsets within it, added to where it was put.
        const x = g.detail.x - 4 + (r.left - boxRect.left) + r.width / 2;
        const y = g.detail.y - 18 + (r.top - boxRect.top);
        rows.set(Number(el.dataset.evRow), [x, y]);
      }
    } else {
      const record = this.record;
      if (record === null) return null;
      const recRect = record.getBoundingClientRect();
      if (recRect.width < 1) return null;
      // The record may still be arriving (a short rise): measure against where it comes to rest.
      const shift = new DOMMatrixReadOnly(getComputedStyle(record).transform);
      for (const { line, at: n } of this.e.recordLines) {
        const el = record.querySelector<HTMLElement>(`[id="${RECORD_LINES}-${n}"]`);
        const r = el?.getBoundingClientRect();
        if (r === undefined || r.width < 1) return null;
        const y = r.top - shift.m42 + r.height / 2 - base.top;
        rows.set(line, [recRect.left - shift.m41 - base.left - 2, y]);
      }
    }
    this.rows = rows;
    return rows;
  }

  private hide(): void {
    this.on = false;
    this.drawnKey = "";
    this.ends[0].hide();
    this.ends[1].hide();
    this.root.removeAttribute("data-on");
    if (this.titleSwap !== null) setOn(this.titleSwap, false);
    if (this.condensed !== null) setOn(this.condensed, false);
    this.record?.removeAttribute("data-shown");
    this.rows = null;
  }

  dispose(): void {
    this.hide();
    for (const c of this.cleanups) c();
    this.root.remove();
  }
}

/* ------------------------------------------------------------------------------------------------------------
 * The act.
 * ---------------------------------------------------------------------------------------------------------- */

export const evidenceAct: ActDefinition = {
  id: "evidence",
  cameraKeys,
  lit: (t, model) => (t < EVIDENCE.e5.from ? litOf(model) : null),
  emphasis(t) {
    const { from, to } = EVIDENCE.emphasis;
    if (t <= from || t >= to) return 0;
    // Brightens quickly, then settles: a single swell across the span.
    const u = (t - from) / (to - from);
    return Math.min(1, u / 0.3) * (1 - ramp(u, 0.35, 1)) * 0.85;
  },
  mount: (ctx) => new EvidenceOverlay(ctx),
  still: {
    camera: stillCamera,
    lit: (model) => litOf(model),
    t: STILL_T,
  },
};

export { dependencyOf };
