/**
 * The still layout's controller: reduced motion, no usable WebGL 2, or a film that cannot run. The film becomes an
 * illustrated article: every act that has a still figure is drawn once in Canvas 2D (fallback.ts) through its own
 * camera with its own lighting, Act I's in the hero frame and the others in their blocks ([data-still-act], see
 * StillFigure.tsx). Neither three.js nor GSAP is ever downloaded. Canvases draw when they come within a viewport of
 * the window, at a pixel ratio of at most 2, and at most two hold pixels at a time (the others give theirs back and
 * draw again when they return). Hover and tap trace files with instant lighting; each figure keeps its own trace.
 */
import type { ActContext, ActDefinition, ActOverlay, Box, LitMask, ScreenPoint } from "./act";
import { Fallback } from "./fallback";
import { defaultTrace } from "./hang";
import { ActLabelHandle, LabelLayer, type Label } from "./labels";
import { bindFilmLinks, bindNavigationMark } from "./links";
import { buildModel, DATA_URL, type GraphData, type HangingModel } from "./model";
import { filmActs } from "./registry";
import { framingOf, type Framing } from "./timeline";

export interface FilmOptions {
  /** Rest positions of the model, as the server computed them (skips the layout iterations). */
  readonly rest: readonly number[];
  /** What the server computed for the acts (acts/payload.ts). */
  readonly payload: unknown;
  /** WebGL 2 is missing or unusable: the title block says the drawing is still for that reason. */
  readonly noWebGL: boolean;
}

/** Figures that may hold pixels at once. */
const PIXEL_BUDGET = 2;

/** One act as one still figure. */
interface Figure {
  readonly index: number;
  readonly act: ActDefinition;
  /** The element the drawing fills: the hero's frame for Act I, the act's figure otherwise. */
  readonly el: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly layer: HTMLElement | null;
  readonly slot: HTMLElement | null;
  readonly labels: LabelLayer;
  readonly hoverLabel: Label;
  readonly actLabels: ActLabelHandle[];
  readonly pinListeners: Set<(v: number) => void>;
  fallback: Fallback | null;
  overlay: ActOverlay | null;
  framing: Framing;
  size: { width: number; height: number };
  /** Size and pixel ratio it was last projected for. */
  projected: string;
  near: boolean;
  hover: number;
  pinned: number;
  retraced: number;
  obstacles: Box[];
}

export class StillFilm {
  private readonly root: HTMLElement;
  private readonly options: FilmOptions;
  private readonly html = document.documentElement;
  private readonly status: HTMLElement | null;
  private readonly cleanups: (() => void)[] = [];
  private model: HangingModel | null = null;
  private data: GraphData | null = null;
  private figures: Figure[] = [];
  private disposed = false;
  private firstFrame = false;
  private readonly pt: ScreenPoint = { x: 0, y: 0, depth: 0, visible: false };

  constructor(
    root: HTMLElement,
    options: FilmOptions,
    given?: { readonly model: HangingModel; readonly data: GraphData },
  ) {
    this.root = root;
    this.options = options;
    this.html.dataset.kfilm = "still";
    this.html.dataset.kfilmReady = "1";
    if (process.env.NODE_ENV !== "production")
      (window as unknown as { __kfilm?: unknown }).__kfilm = this;
    this.status = root.querySelector<HTMLElement>("[data-film-status]");
    const note = root.querySelector<HTMLElement>("[data-film-fallback]");
    if (note !== null) note.hidden = !options.noWebGL;
    this.cleanups.push(bindFilmLinks(root, () => "still"));
    const frame = root.querySelector<HTMLElement>("[data-film-stage]");
    if (frame !== null) this.cleanups.push(bindNavigationMark(frame));
    void this.start(given);
  }

  /** The hero figure's drawing (for the capture tooling). */
  get fallback(): Fallback | null {
    return this.figures[0]?.fallback ?? null;
  }

  private async start(given?: {
    readonly model: HangingModel;
    readonly data: GraphData;
  }): Promise<void> {
    performance.mark("kfilm:start");
    let model = given?.model ?? null;
    let data = given?.data ?? null;
    if (model === null || data === null) {
      try {
        const r = await fetch(DATA_URL);
        if (!r.ok) throw new Error(`${DATA_URL}: ${r.status}`);
        data = (await r.json()) as GraphData;
      } catch {
        // Without the analysis there is nothing to draw: the words stay.
        return;
      }
      if (this.disposed) return;
      model = buildModel(data, this.options.rest);
      performance.mark("kfilm:model");
    }
    this.model = model;
    this.data = data;
    this.figures = this.collectFigures();
    if (this.figures.length === 0) return;

    const near = new IntersectionObserver((entries) => this.onNear(entries), {
      rootMargin: "100% 0px",
    });
    const onScreen = new IntersectionObserver(() => this.allocate());
    for (const f of this.figures) {
      near.observe(f.el);
      onScreen.observe(f.el);
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const f = this.figures.find((g) => g.el === entry.target);
        if (f !== undefined && f.fallback?.drawn === true) this.draw(f);
      }
    });
    for (const f of this.figures) ro.observe(f.el);
    this.cleanups.push(() => {
      near.disconnect();
      onScreen.disconnect();
      ro.disconnect();
    });
    this.bindInput();
    // The figures near the window now are drawn at once, without waiting for the observers.
    const vh = window.innerHeight;
    for (const f of this.figures) {
      const r = f.el.getBoundingClientRect();
      f.near = r.bottom > -vh && r.top < 2 * vh;
    }
    this.allocate();
  }

  /** The acts' figures: Act I's in the hero frame, the others where their blocks placed them. */
  private collectFigures(): Figure[] {
    const root = this.root;
    const figures: Figure[] = [];
    filmActs().forEach((act, index) => {
      if (act.still === null) return;
      let el: HTMLElement | null;
      let canvas: HTMLCanvasElement | null;
      let labelsEl: HTMLElement | null;
      let leaders: SVGSVGElement | null;
      let layer: HTMLElement | null;
      if (index === 0) {
        el = root.querySelector<HTMLElement>("[data-film-stage]");
        canvas = root.querySelector<HTMLCanvasElement>("[data-film-canvas]");
        labelsEl = root.querySelector<HTMLElement>("[data-film-labels]");
        leaders = root.querySelector<SVGSVGElement>("[data-film-leaders]");
        layer = null;
      } else {
        el = root.querySelector<HTMLElement>(`[data-still-act="${act.id}"]`);
        canvas = el?.querySelector<HTMLCanvasElement>("[data-still-canvas]") ?? null;
        labelsEl = el?.querySelector<HTMLElement>("[data-still-labels]") ?? null;
        leaders = el?.querySelector<SVGSVGElement>("[data-still-leaders]") ?? null;
        layer = el?.querySelector<HTMLElement>("[data-still-layer]") ?? null;
      }
      if (el === null || canvas === null || labelsEl === null || leaders === null) return;
      const labels = new LabelLayer(labelsEl, leaders);
      figures.push({
        index,
        act,
        el,
        canvas,
        layer,
        slot: root.querySelector<HTMLElement>(`[data-act-slot="${act.id}"]`),
        labels,
        hoverLabel: labels.create(true),
        actLabels: [],
        pinListeners: new Set(),
        fallback: null,
        overlay: null,
        framing: "wide",
        size: { width: 1, height: 1 },
        projected: "",
        near: false,
        hover: -1,
        pinned: -1,
        retraced: 0,
        obstacles: [],
      });
    });
    return figures;
  }

  private onNear(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const f = this.figures.find((g) => g.el === entry.target);
      if (f !== undefined) f.near = entry.isIntersecting;
    }
    this.allocate();
  }

  /**
   * Gives pixels to the figures nearest the window (at most PIXEL_BUDGET, all of them within a viewport of it) and
   * takes them back from the others.
   */
  private allocate(): void {
    if (this.disposed || this.model === null) return;
    const mid = window.innerHeight / 2;
    const ranked = this.figures
      .filter((f) => f.near)
      .map((f) => {
        const r = f.el.getBoundingClientRect();
        const distance = r.bottom < mid ? mid - r.bottom : r.top > mid ? r.top - mid : 0;
        return { f, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, PIXEL_BUDGET)
      .map((x) => x.f);
    for (const f of this.figures) {
      if (ranked.includes(f)) {
        if (f.fallback?.drawn !== true) this.draw(f);
      } else if (f.fallback?.drawn === true) {
        f.fallback.release();
      }
    }
  }

  /** Projects (when the figure's size changed), lights, draws and labels one figure. */
  private draw(f: Figure): void {
    const model = this.model;
    const data = this.data;
    if (model === null || data === null || f.act.still === null) return;
    const rect = f.el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (f.fallback === null) {
      try {
        f.fallback = new Fallback(f.canvas, model, framingOf(rect.width, rect.height));
      } catch {
        return;
      }
    }
    const fb = f.fallback;
    const key = `${rect.width}x${rect.height}@${dpr}`;
    if (key !== f.projected) {
      f.projected = key;
      f.size = { width: rect.width, height: rect.height };
      f.framing = framingOf(rect.width, rect.height);
      fb.resize(rect.width, rect.height, dpr, f.framing);
      fb.setCamera(f.act.still.camera(model, f.framing));
      f.labels.resize(rect.width, rect.height);
    }
    fb.draw(this.maskOf(f));
    if (f.overlay === null && f.act.mount !== undefined) {
      try {
        f.overlay = f.act.mount(this.contextFor(f, model, data));
      } catch (error) {
        console.error(`kfilm: the ${f.act.id} still overlay failed to mount`, error);
      }
    }
    try {
      f.overlay?.update(f.act.still.t);
    } catch (error) {
      console.error(`kfilm: the ${f.act.id} still overlay failed`, error);
    }
    this.place(f);
    if (f.index === 0 && !this.firstFrame) {
      this.firstFrame = true;
      f.canvas.setAttribute("data-ready", "");
      this.html.dataset.kfilmLive = "";
      performance.mark("kfilm:first-frame");
    } else {
      f.canvas.setAttribute("data-ready", "");
    }
  }

  /** The figure's lighting: its trace (a hover previews over a pin) wins over the act's own. */
  private maskOf(f: Figure): LitMask | null {
    const model = this.model!;
    const v = f.hover >= 0 ? f.hover : f.pinned;
    if (v >= 0) return (f.act.traceOf?.(v, model) ?? defaultTrace(model, v, true)).mask;
    return f.act.still?.lit(model) ?? null;
  }

  /** The figure's words: what labels keep clear of, then the traced file's label and the act's labels. */
  private place(f: Figure): void {
    const fb = f.fallback;
    const model = this.model;
    if (fb === null || model === null) return;
    const base = f.el.getBoundingClientRect();
    const boxes: Box[] = [];
    for (const el of f.el.querySelectorAll<HTMLElement>("[data-obstacle]")) {
      const always = el.dataset.obstacle === "always";
      if (!always && !el.hasAttribute("data-on")) continue;
      const pad = Number(el.dataset.obstaclePad ?? 14);
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      boxes.push({
        l: r.left - base.left - pad,
        t: r.top - base.top - pad,
        r: r.right - base.left + pad,
        b: r.bottom - base.top + pad,
      });
    }
    f.obstacles = boxes;
    f.labels.begin(boxes);
    const v = f.hover >= 0 ? f.hover : f.pinned;
    if (v >= 0) {
      const view = f.act.traceOf?.(v, model) ?? defaultTrace(model, v, true);
      f.hoverLabel.set(model.paths[v]!, view.note);
      const pt = fb.screenOf(v, this.pt);
      f.labels.place(f.hoverLabel, pt !== null && pt.visible ? pt : null);
    } else f.labels.place(f.hoverLabel, null);
    for (const a of f.actLabels) {
      let point: ScreenPoint | null = null;
      if (a.kind === 1) point = fb.screenOf(a.v, this.pt);
      else if (a.kind === 2) point = fb.screenOfWorld(a.x, a.y, a.z, this.pt);
      const show = point !== null && point.visible && !f.labels.behindWords(point.x, point.y);
      f.labels.place(a.label, show ? point : null);
    }
  }

  private contextFor(f: Figure, model: HangingModel, data: GraphData): ActContext {
    return {
      mode: "still",
      id: f.act.id,
      root: this.root,
      frame: f.el,
      layer: f.layer,
      slot: f.slot,
      model,
      data,
      payload: this.options.payload,
      get framing() {
        return f.framing;
      },
      size: () => f.size,
      screenOf: (v, out) => {
        const pt = f.fallback?.screenOf(v, out) ?? null;
        if (pt === null) out.visible = false;
        return out;
      },
      screenOfWorld: (x, y, z, out) => {
        if (f.fallback === null) {
          out.visible = false;
          return out;
        }
        return f.fallback.screenOfWorld(x, y, z, out);
      },
      obstacles: () => f.obstacles,
      label: (options) => {
        const handle = new ActLabelHandle(
          f.labels.create(options?.active ?? false, options?.micro ?? false),
        );
        f.actLabels.push(handle);
        return handle;
      },
      traced: () => (f.hover >= 0 ? f.hover : f.pinned),
      pinnedFile: () => f.pinned,
      pin: (v) => {
        if (v === f.pinned) return;
        f.pinned = v;
        this.refresh(f);
      },
      onPin: (listener) => {
        f.pinListeners.add(listener);
        return () => f.pinListeners.delete(listener);
      },
      retrace: () => {
        f.retraced++;
        this.refresh(f);
      },
      reveal: () => undefined,
      invalidate: () => this.refresh(f),
    };
  }

  /** Draws a figure again if it holds pixels (a figure without them draws when it returns). */
  private refresh(f: Figure): void {
    if (f.fallback?.drawn === true) this.draw(f);
  }

  /* ---------------------------------------------------------------------------------------------------------
   * Input: hover previews, a click or a tap pins (and is announced), Escape clears.
   * ------------------------------------------------------------------------------------------------------- */

  private bindInput(): void {
    const ignored = (e: Event) =>
      (e.target as Element).closest(
        "a, button, input, select, textarea, label, summary, [data-film-hero], [data-no-trace]",
      ) !== null;
    for (const f of this.figures) {
      const el = f.el;
      const local = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      };
      const setHover = (v: number) => {
        if (v === f.hover) return;
        f.hover = v;
        el.style.cursor = v >= 0 ? "pointer" : "";
        this.refresh(f);
      };
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
        if (ignored(e) || f.fallback === null) {
          setHover(-1);
          return;
        }
        const at = local(e);
        setHover(f.fallback.pick(at.x, at.y, 6));
      };
      const onLeave = () => setHover(-1);
      const onClick = (e: MouseEvent) => {
        if (ignored(e) || f.fallback === null) return;
        const at = local(e);
        const v = f.fallback.pick(at.x, at.y, 12);
        this.pinFromDrawing(f, v === f.pinned ? -1 : v);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      el.addEventListener("click", onClick);
      this.cleanups.push(() => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("click", onClick);
        el.style.cursor = "";
      });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const f of this.figures) if (f.pinned >= 0) this.pinFromDrawing(f, -1);
    };
    document.addEventListener("keydown", onKey);
    this.cleanups.push(() => document.removeEventListener("keydown", onKey));
  }

  private pinFromDrawing(f: Figure, v: number): void {
    if (v === f.pinned) return;
    f.pinned = v;
    this.refresh(f);
    const model = this.model;
    if (this.status !== null && model !== null) {
      this.status.textContent =
        v < 0
          ? "Trace cleared."
          : `Traced ${model.paths[v]!}. ${(f.act.traceOf?.(v, model) ?? defaultTrace(model, v, true)).note}`;
    }
    for (const listener of f.pinListeners) listener(v);
  }

  dispose(): void {
    this.disposed = true;
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    for (const f of this.figures) {
      f.overlay?.dispose();
      f.labels.dispose();
      f.pinListeners.clear();
      f.canvas.removeAttribute("data-ready");
    }
    this.figures = [];
    const data = this.html.dataset;
    delete data.kfilm;
    delete data.kfilmReady;
    delete data.kfilmLive;
    delete data.kfilmUnder;
    if ((window as unknown as { __kfilm?: unknown }).__kfilm === this)
      delete (window as unknown as { __kfilm?: unknown }).__kfilm;
  }
}
