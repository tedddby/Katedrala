/**
 * The film's director, in the browser (film mode). Reads scroll progress (GSAP ScrollTrigger over a sticky stage, so
 * the browser keeps scrolling natively), maps it to an act and that act's local time (timeline.ts), gives the camera
 * a little mass, runs the stage, and dispatches by act: the camera follows every act's keys on one continuous track,
 * the structure takes the lighting of the act on screen (a traced file always wins), captions show in their act's
 * windows, and each act's overlay is updated with its local time. It also lays out the labels on the drawing, keeps
 * html[data-kfilm-under] current for the navigation, steps the page keys through every act's stops, and holds the
 * film's moment through resizes. three.js and GSAP are imported on demand, and only for the film: the still layout
 * (reduced motion, no usable WebGL 2, a film that cannot run) is still.ts, in Canvas 2D.
 *
 * It draws only while something changes: the frame loop stops once the model is at rest and the camera has
 * arrived, and starts again on scroll, pointer, resize or a trace. Everything it adds to the page (listeners,
 * observers, the ScrollTrigger, the WebGL context, attributes on <html>) is removed by dispose().
 */
import type {
  ActContext,
  ActDefinition,
  ActOverlay,
  Box,
  CameraKey,
  LitMask,
  ScreenPoint,
  TraceView,
} from "./act";
import { defaultTrace, standingAt } from "./hang";
import { ActLabelHandle, LabelLayer, type Label } from "./labels";
import { bindFilmLinks, bindNavigationMark } from "./links";
import { buildModel, DATA_URL, type GraphData, type HangingModel } from "./model";
import type { Stage } from "./stage";
import { filmActs } from "./registry";
import type { FilmOptions } from "./still";
import {
  BEAT,
  cameraFrom,
  clamp01,
  clockOf,
  emptyCamera,
  Track,
  type ActPosition,
  type CameraState,
  type Clock,
  type Framing,
} from "./timeline";

interface Trigger {
  readonly start: number;
  readonly end: number;
  readonly progress: number;
  kill(): void;
}

type ScrollTriggerClass = typeof import("gsap/ScrollTrigger").ScrollTrigger;

/** After this long without input the hanging model stops breathing, so a page left open comes to rest. */
const CALM_AFTER = 14;
/** A jump longer than this, in viewports of pinned scroll, moves the camera at once rather than with its mass. */
const SNAP = 1.32;
/** Windows framed tall (phones and tablets in portrait): the same split as the stylesheet's track lengths. */
const TALL = "(max-aspect-ratio: 949/1000)";
/** Controls that keep Space and the page keys for themselves. */
const CONTROLS =
  "input, textarea, select, button, summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='textbox'], [role='slider'], [role='listbox'], [role='option'], [role='radio'], [role='radiogroup'], [role='tab'], [role='combobox']";

function q<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (el === null) throw new Error(`missing ${selector}`);
  return el;
}

function setOn(el: Element, on: boolean): void {
  if (on) el.setAttribute("data-on", "");
  else el.removeAttribute("data-on");
}

/** Keys that page the document, and whether they go forward. */
function pageKey(e: KeyboardEvent): "forward" | "back" | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) return "forward";
  if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) return "back";
  return null;
}

/** A caption on the frame: shown while its act's local time is in [from, to]. */
interface Caption {
  readonly el: HTMLElement;
  readonly index: number;
  readonly from: number;
  readonly to: number;
  on: boolean;
}

/** Words on the frame that labels keep clear of. */
interface Obstacle {
  readonly el: HTMLElement;
  readonly pad: number;
  readonly always: boolean;
  /** The boxes measured instead of the element (a caption's lines, not its column). */
  readonly boxes: readonly HTMLElement[];
}

export class Director {
  private readonly root: HTMLElement;
  private readonly options: FilmOptions;
  private readonly html = document.documentElement;
  private readonly track: HTMLElement;
  private readonly stageEl: HTMLElement;
  private canvas: HTMLCanvasElement;
  private readonly leaders: SVGSVGElement;
  private readonly labelsEl: HTMLElement;
  private readonly status: HTMLElement;
  private readonly acts: readonly ActDefinition[];
  private readonly captions: Caption[];
  private readonly layers: (HTMLElement | null)[];
  private readonly slots: (HTMLElement | null)[];
  private obstacleEls: Obstacle[] = [];

  private model: HangingModel | null = null;
  private data: GraphData | null = null;
  private stage: Stage | null = null;
  private trigger: Trigger | null = null;
  private readonly tall = window.matchMedia(TALL);
  private framing: Framing;
  private clock: Clock;
  private camTrack: Track | null = null;
  private readonly camValues: number[] = new Array<number>(9).fill(0);
  private readonly camera: CameraState = emptyCamera();
  private size = { width: 1, height: 1 };
  private labels: LabelLayer | null = null;
  private hoverLabel: Label | null = null;
  private readonly actLabels: ActLabelHandle[] = [];
  private overlays: (ActOverlay | null)[] = [];
  private readonly pinListeners = new Set<(v: number) => void>();
  /** The still layout, when the film could not run after all. */
  private still: { dispose(): void } | null = null;

  private raf = 0;
  private visible = true;
  private disposed = false;
  private last = 0;
  private pRaw = 0;
  /** Global progress as the camera has it (it follows the scroll with a little mass). */
  private p = -1;
  private readonly pos: ActPosition = { index: 0, id: "hang", t: 0 };
  private active = -1;
  private readonly marked = new Set<string>();
  private hover = -1;
  private pinned = -1;
  private litKey = "";
  private retraced = 0;
  /** The last trace view, kept while the traced file, the act and the act's answer stay the same. */
  private traceCache: { key: string; view: TraceView } | null = null;
  /** Global progress the overlays were last updated for. */
  private overlaysAt = -1;
  private emphasis = 0;
  private pointer: { x: number; y: number } | null = null;
  private needsPick = false;
  /** Place the words on the next frame even if the stage draws nothing new (a resize, a new trace). */
  private relayout = true;
  /** Seconds since the last scroll, pointer or key input (the breath calms down after CALM_AFTER). */
  private quiet = 0;
  private frameTimes: number[] = [];
  private dprSettled = false;
  private firstStructure = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly pt: ScreenPoint = { x: 0, y: 0, depth: 0, visible: false };
  /** The words on the frame that labels keep clear of, measured only when what is shown changes. */
  private obstacles: Box[] = [];
  private obstaclesKey = "";
  private obstaclesStale = true;
  /** The stop a page key last sent the film to, so quick presses step on from it rather than from where the
   * smooth scroll has got to. */
  private keyStop = -1;
  private keyStopAt = 0;
  private inputBound = false;
  /** The moment the film holds while a resize is measured: an act and its local time. */
  private held: { index: number; t: number } | null = null;

  constructor(root: HTMLElement, options: FilmOptions) {
    this.root = root;
    this.options = options;
    this.html.dataset.kfilmReady = "1";
    if (process.env.NODE_ENV !== "production")
      (window as unknown as { __kfilm?: unknown }).__kfilm = this;
    this.track = q(root, "[data-film-track]");
    this.stageEl = q(root, "[data-film-stage]");
    this.canvas = q(root, "[data-film-canvas]");
    this.leaders = q(root, "[data-film-leaders]");
    this.labelsEl = q(root, "[data-film-labels]");
    this.status = q(root, "[data-film-status]");
    this.acts = filmActs();
    this.layers = this.acts.map((a) =>
      root.querySelector<HTMLElement>(`[data-act-layer="${a.id}"]`),
    );
    this.slots = this.acts.map((a) => root.querySelector<HTMLElement>(`[data-act-slot="${a.id}"]`));
    const indexOf = new Map(this.acts.map((a, i) => [a.id as string, i]));
    this.captions = [...root.querySelectorAll<HTMLElement>("[data-caption]")].map((el) => ({
      el,
      index: indexOf.get(el.dataset.act ?? "hang") ?? 0,
      from: Number(el.dataset.from),
      to: Number(el.dataset.to),
      on: false,
    }));
    this.framing = this.tall.matches ? "tall" : "wide";
    this.clock = clockOf(this.framing);
    this.cleanups.push(bindNavigationMark(this.stageEl));
    this.cleanups.push(bindFilmLinks(root, () => (this.still === null ? "film" : "still")));
    void this.start();
  }

  private async start(): Promise<void> {
    performance.mark("kfilm:start");
    const dataPromise = fetch(DATA_URL).then((r) => {
      if (!r.ok) throw new Error(`${DATA_URL}: ${r.status}`);
      return r.json() as Promise<GraphData>;
    });
    const stagePromise = import("./stage");
    const gsapPromise = Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
    // Awaited later, after the first frame; a failure is handled there.
    gsapPromise.catch(() => undefined);
    stagePromise.catch(() => undefined);
    let data: GraphData;
    try {
      data = await dataPromise;
    } catch {
      // Without the analysis there is nothing to draw: the words stay, in the still layout.
      if (!this.disposed) this.html.dataset.kfilm = "still";
      return;
    }
    if (this.disposed) return;
    const model = buildModel(data, this.options.rest);
    this.model = model;
    this.data = data;
    performance.mark("kfilm:model");

    let StageClass: typeof import("./stage").Stage;
    try {
      StageClass = (await stagePromise).Stage;
    } catch {
      // The stage could not be fetched: the still drawing, which needs no WebGL.
      await this.toStill(false);
      return;
    }
    if (this.disposed) return;
    let stage: Stage;
    try {
      stage = new StageClass({
        canvas: this.canvas,
        model,
        framing: this.framing,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch {
      await this.toStill(true);
      return;
    }
    this.stage = stage;
    performance.mark("kfilm:stage-ready");
    this.buildCamera();

    const rect = this.stageEl.getBoundingClientRect();
    this.size = { width: rect.width, height: rect.height };
    stage.resize(rect.width, rect.height);
    this.labels = new LabelLayer(this.labelsEl, this.leaders);
    this.labels.resize(rect.width, rect.height);
    this.hoverLabel = this.labels.create(true);
    this.mountOverlays(model, data);
    this.collectObstacles();
    this.bindInput();
    this.bindContext();
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(this.stageEl);
    this.cleanups.push(() => ro.disconnect());
    const onFraming = () => this.onResize();
    this.tall.addEventListener("change", onFraming);
    this.cleanups.push(() => this.tall.removeEventListener("change", onFraming));

    const io = new IntersectionObserver(
      (entries) => {
        this.visible = entries.some((e) => e.isIntersecting);
        if (this.visible) this.wake();
      },
      { rootMargin: "100px 0px" },
    );
    io.observe(this.track);
    this.cleanups.push(() => io.disconnect());
    const onVisibility = () => {
      if (document.visibilityState === "visible") this.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    this.cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

    // Draw now, from where the page is (a reload can land mid-film), without waiting for the scroll clock. The
    // canvas is shown once its first frame is drawn (see tick): before that it would be an empty buffer.
    this.pRaw = this.progressNow();
    const at = this.clock.at(this.pRaw);
    if (at.index > 0 || at.t > BEAT.plan) stage.sim.showBoard();
    this.wake();

    let gsapModules: Awaited<typeof gsapPromise>;
    try {
      gsapModules = await gsapPromise;
    } catch {
      if (this.disposed) return;
      // No scroll clock: the standing structure, still. The 2D drawing takes over the stage's place.
      await this.toStill(false);
      return;
    }
    if (this.disposed) return;
    const [{ gsap }, { ScrollTrigger }] = gsapModules;
    gsap.registerPlugin(ScrollTrigger);
    const trigger = ScrollTrigger.create({
      trigger: this.track,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        // While a resize is being measured the progress is read against the old track: keep the film where it is.
        if (this.held !== null) return;
        this.pRaw = self.progress;
        this.quiet = 0;
        this.wake();
      },
      onRefresh: (self) => {
        if (this.held !== null) return;
        this.pRaw = self.progress;
        this.wake();
      },
    });
    this.trigger = trigger;
    this.pRaw = trigger.progress;
    this.cleanups.push(() => trigger.kill());
    this.bindResize(trigger, ScrollTrigger);
    this.bindKeys();
    this.wake();
  }

  /* ---------------------------------------------------------------------------------------------------------
   * The camera: every act's keys on one track over global progress, continuous at the act boundaries.
   * ------------------------------------------------------------------------------------------------------- */

  private buildCamera(): void {
    const model = this.model;
    if (model === null) return;
    const keys: number[][] = [];
    let from: CameraKey | null = null;
    this.acts.forEach((act, index) => {
      const own = [...act.cameraKeys(model, this.framing, from)].sort((a, b) => a[0] - b[0]);
      own.forEach((key, i) => {
        // The first key of every act after the first is the previous act's last: the camera never cuts.
        const values = i === 0 && from !== null ? from.slice(1) : key.slice(1);
        const P = this.clock.progressOf(index, key[0]);
        const prev = keys[keys.length - 1];
        if (prev !== undefined && P <= prev[0]! + 1e-9) return;
        keys.push([P, ...values]);
      });
      const last = own[own.length - 1];
      if (last !== undefined) from = [0, ...last.slice(1)] as unknown as CameraKey;
    });
    this.camTrack = new Track(keys);
  }

  private cameraAt(P: number): CameraState {
    this.camTrack?.at(P, this.camValues);
    return cameraFrom(this.camValues, this.camera);
  }

  /* ---------------------------------------------------------------------------------------------------------
   * The acts' overlays and their context.
   * ------------------------------------------------------------------------------------------------------- */

  private mountOverlays(model: HangingModel, data: GraphData): void {
    this.overlays = this.acts.map((act, index) => {
      if (act.mount === undefined) return null;
      try {
        return act.mount(this.contextFor(index, model, data));
      } catch (error) {
        // One act's overlay failing must not take the film down with it.
        console.error(`kfilm: the ${act.id} overlay failed to mount`, error);
        return null;
      }
    });
  }

  private contextFor(index: number, model: HangingModel, data: GraphData): ActContext {
    const act = this.acts[index]!;
    const self = this;
    return {
      mode: "film",
      id: act.id,
      root: this.root,
      frame: this.stageEl,
      layer: this.layers[index] ?? null,
      slot: this.slots[index] ?? null,
      model,
      data,
      payload: this.options.payload,
      get framing() {
        return self.framing;
      },
      size: () => this.size,
      screenOf: (v, out) => {
        if (this.stage === null) {
          out.visible = false;
          return out;
        }
        return this.stage.screenOf(v, out);
      },
      screenOfWorld: (x, y, z, out) => {
        if (this.stage === null) {
          out.visible = false;
          return out;
        }
        return this.stage.screenOfWorld(x, y, z, out);
      },
      obstacles: () => this.obstacles,
      label: (options) => {
        const handle = new ActLabelHandle(
          this.labels!.create(options?.active ?? false, options?.micro ?? false),
        );
        this.actLabels.push(handle);
        return handle;
      },
      traced: () => this.selected(),
      pinnedFile: () => this.pinned,
      pin: (v) => this.setPinned(v, false),
      onPin: (listener) => {
        this.pinListeners.add(listener);
        return () => this.pinListeners.delete(listener);
      },
      retrace: () => {
        this.retraced++;
        this.relayout = true;
        this.wake();
      },
      reveal: (t) => this.reveal(index, t),
      invalidate: () => {
        this.obstaclesStale = true;
        this.relayout = true;
        this.wake();
      },
    };
  }

  /** Brings the film to act `index` at local time t at once (focus reveal). */
  private reveal(index: number, t: number): void {
    const trigger = this.trigger;
    if (trigger === null) return;
    const P = this.clock.progressOf(index, t);
    const top = trigger.start + P * (trigger.end - trigger.start);
    if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, behavior: "instant" });
    this.pRaw = P;
    this.p = P;
    this.relayout = true;
    this.wake();
  }

  /* ---------------------------------------------------------------------------------------------------------
   * Resizes.
   * ------------------------------------------------------------------------------------------------------- */

  /**
   * A resize (a phone turned, a window dragged) changes the track's length in pixels while the page keeps its
   * scroll offset, which would throw the film to another beat, or past its end. The film holds its moment (the act
   * and its local time: the acts' lengths differ between the framings) until ScrollTrigger has measured the new track
   * (about 200 ms after the last resize), then the page scrolls back to the same moment. Height-only resizes on
   * touch screens (the address bar) are not measured again by ScrollTrigger and keep the film running.
   */
  private bindResize(trigger: Trigger, ScrollTrigger: ScrollTriggerClass): void {
    let width = window.innerWidth;
    let release = 0;
    const onResize = () => {
      const widthChanged = window.innerWidth !== width;
      width = window.innerWidth;
      if (!widthChanged && ScrollTrigger.isTouch === 1) return;
      if (this.held === null && this.pRaw > 0 && this.pRaw < 1) {
        const at = this.clock.at(this.pRaw);
        this.held = { index: at.index, t: at.t };
      }
      window.clearTimeout(release);
      // Should the new measurement not come, let the film follow the page again.
      release = window.setTimeout(() => (this.held = null), 1500);
    };
    const onRefresh = () => {
      // The track has its new length: the clock and the camera take the new framing now, never before.
      this.updateFraming();
      const held = this.held;
      if (held === null) return;
      this.held = null;
      window.clearTimeout(release);
      const P = this.clock.progressOf(held.index, held.t);
      const top = trigger.start + P * (trigger.end - trigger.start);
      if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, behavior: "instant" });
      this.pRaw = P;
      this.p = P;
      this.relayout = true;
      this.wake();
    };
    window.addEventListener("resize", onResize);
    ScrollTrigger.addEventListener("refresh", onRefresh);
    this.cleanups.push(() => {
      window.removeEventListener("resize", onResize);
      ScrollTrigger.removeEventListener("refresh", onRefresh);
      window.clearTimeout(release);
    });
  }

  /** The framing follows the stylesheet's split (the track's length depends on it): clock and camera with it. */
  private updateFraming(): void {
    const framing: Framing = this.tall.matches ? "tall" : "wide";
    if (framing === this.framing) return;
    this.framing = framing;
    this.clock = clockOf(framing);
    this.stage?.setFraming(framing);
    this.buildCamera();
    this.relayout = true;
  }

  private onResize(): void {
    if (this.stage === null) return;
    const rect = this.stageEl.getBoundingClientRect();
    this.size = { width: rect.width, height: rect.height };
    this.labels?.resize(rect.width, rect.height);
    this.obstaclesStale = true;
    // Before the scroll clock runs there is no track to measure again: switch at once. Afterwards the switch waits
    // for ScrollTrigger's refresh (bindResize), so the clock never reads the old track with the new lengths.
    if (this.trigger === null) this.updateFraming();
    this.stage.resize(rect.width, rect.height);
    this.relayout = true;
    this.wake();
  }

  /** Scroll progress through the track, read from the layout: what ScrollTrigger reports once it runs. */
  private progressNow(): number {
    const r = this.track.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    return span > 0 ? clamp01(-r.top / span) : 0;
  }

  /* ---------------------------------------------------------------------------------------------------------
   * The frame loop.
   * ------------------------------------------------------------------------------------------------------- */

  private wake(): void {
    if (this.disposed || this.raf !== 0 || this.stage === null) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    const stage = this.stage;
    if (stage === null || this.disposed) return;
    const dt = Math.min(0.1, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.quiet += dt;

    // The camera has a little mass: it follows the scroll, it does not jump with it.
    const target = this.pRaw;
    if (this.p < 0 || Math.abs(target - this.p) * this.clock.length > SNAP) this.p = target;
    else this.p += (target - this.p) * (1 - Math.exp(-dt / 0.14));
    // Close enough (a fraction of a pixel of scroll): arrive.
    if (Math.abs(target - this.p) * this.clock.length < 1.3e-4) this.p = target;
    const P = this.p;
    const pos = this.clock.at(P, this.pos);
    const hang = pos.index === 0 ? pos.t : 1;

    if (this.needsPick && this.pointer !== null) {
      this.needsPick = false;
      this.setHover(stage.pick(this.pointer.x, this.pointer.y, 6));
    }
    this.updateLit(pos, hang);
    const act = this.acts[pos.index]!;
    this.emphasis = act.emphasis?.(pos.t) ?? 0;
    const calm = 1 - Math.min(1, Math.max(0, (this.quiet - CALM_AFTER) / 3));
    const t0 = performance.now();
    const drawn = stage.frame({
      P,
      hang,
      camera: this.cameraAt(P),
      dt,
      calm,
      emphasis: this.emphasis,
    });
    if (drawn) this.measure(performance.now() - t0, dt);
    if (drawn && !this.firstStructure) {
      this.firstStructure = true;
      this.canvas.setAttribute("data-ready", "");
      this.html.dataset.kfilmLive = "";
      performance.mark("kfilm:first-frame");
    }
    this.choreograph(pos);
    // Words follow the drawing: they move only when it was drawn again (or the frame changed under them).
    if (drawn || this.relayout || P !== this.overlaysAt) {
      this.relayout = false;
      this.overlaysAt = P;
      this.updateOverlays(P);
      this.refreshObstacles();
      this.placeLabels();
    }

    const settling = target !== this.p;
    if (
      this.visible &&
      document.visibilityState === "visible" &&
      (settling || drawn || !stage.idle)
    ) {
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  /** Lowers the resolution once if the first frames are slow (integrated graphics at a high pixel ratio). */
  private measure(_cpu: number, dt: number): void {
    if (this.dprSettled || this.stage === null) return;
    this.frameTimes.push(dt * 1000);
    if (this.frameTimes.length < 90) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    this.frameTimes = [];
    const dpr = this.stage.dpr;
    if (median > 21 && dpr > 1) {
      const rect = this.stageEl.getBoundingClientRect();
      this.stage.resize(rect.width, rect.height, Math.max(1, dpr - 0.5));
    } else {
      this.dprSettled = true;
    }
  }

  /** Captions in their act's windows, and which act's layer and block are on screen. */
  private choreograph(pos: ActPosition): void {
    for (const c of this.captions) {
      const on = c.index === pos.index && pos.t >= c.from && pos.t <= c.to;
      if (on !== c.on) {
        c.on = on;
        setOn(c.el, on);
      }
    }
    if (pos.index !== this.active) {
      this.active = pos.index;
      this.layers.forEach((el, i) => el?.toggleAttribute("data-active", i === pos.index));
      this.slots.forEach((el, i) => el?.toggleAttribute("data-active", i === pos.index));
      const id = this.acts[pos.index]!.id;
      if (!this.marked.has(id)) {
        this.marked.add(id);
        performance.mark(`kfilm:act-${id}`);
      }
      this.relayout = true;
    }
  }

  /** Every overlay hears its act's local time, unclamped (below 0 before its act, above 1 after it). */
  private updateOverlays(P: number): void {
    const s = P * this.clock.length;
    this.overlays.forEach((overlay, i) => {
      if (overlay === null) return;
      const span = this.clock.spans[i]!;
      try {
        overlay.update((s - span.from) / span.length);
      } catch (error) {
        console.error(`kfilm: the ${span.id} overlay failed`, error);
        this.overlays[i] = null;
      }
    });
  }

  /* ---------------------------------------------------------------------------------------------------------
   * Words on the frame: obstacles and labels.
   * ------------------------------------------------------------------------------------------------------- */

  /** The frame's words that labels keep clear of ([data-obstacle]), found again when an act asks. */
  private collectObstacles(): void {
    this.obstacleEls = [...this.root.querySelectorAll<HTMLElement>("[data-obstacle]")].map(
      (el) => ({
        el,
        pad: Number(el.dataset.obstaclePad ?? 14),
        always: el.dataset.obstacle === "always",
        boxes: [...el.querySelectorAll<HTMLElement>("[data-obstacle-box]")],
      }),
    );
    this.obstaclesStale = false;
    this.obstaclesKey = "";
  }

  /**
   * Measures the words on the frame (title block, hero, the captions shown, gauge, the acts' shown words) when what
   * is shown changes, so labels can keep clear of them without reading the layout every frame.
   */
  private refreshObstacles(): void {
    if (this.obstaclesStale) this.collectObstacles();
    let key = `${Math.round(this.size.width)}x${Math.round(this.size.height)}:`;
    for (const o of this.obstacleEls) key += o.always || o.el.hasAttribute("data-on") ? "1" : "0";
    if (key === this.obstaclesKey) return;
    this.obstaclesKey = key;
    const base = this.stageEl.getBoundingClientRect();
    const boxes: Box[] = [];
    const add = (el: Element, pad: number) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      boxes.push({
        l: r.left - base.left - pad,
        t: r.top - base.top - pad,
        r: r.right - base.left + pad,
        b: r.bottom - base.top + pad,
      });
    };
    for (const o of this.obstacleEls) {
      if (!o.always && !o.el.hasAttribute("data-on")) continue;
      // A caption's words, not its column: the column is wider than its lines, and a label pushed out of the whole
      // column next to a file that hangs low on the left would find no place at all.
      if (o.boxes.length > 0) for (const b of o.boxes) add(b, o.pad);
      else add(o.el, o.pad);
    }
    this.obstacles = boxes;
  }

  /** The traced file's label first (it is what the visitor is pointing at), then the acts' labels in order. */
  private placeLabels(): void {
    const labels = this.labels;
    const stage = this.stage;
    const model = this.model;
    if (labels === null || stage === null || model === null) return;
    labels.begin(this.obstacles);
    const selected = this.selected();
    const h = this.hoverLabel;
    if (h !== null) {
      if (selected >= 0) {
        const view = this.traceView(selected);
        h.set(model.paths[selected]!, view.note);
        stage.screenOf(selected, this.pt);
        labels.place(h, this.pt.visible ? this.pt : null);
      } else labels.place(h, null);
    }
    for (const a of this.actLabels) {
      let point: ScreenPoint | null = null;
      if (a.kind === 1) point = stage.screenOf(a.v, this.pt);
      else if (a.kind === 2) point = stage.screenOfWorld(a.x, a.y, a.z, this.pt);
      // A file behind the words on the frame: a leader into lettering points at nothing the eye can find, so the
      // label waits for the file to come out.
      const show = point !== null && point.visible && !labels.behindWords(point.x, point.y);
      labels.place(a.label, show ? point : null);
    }
  }

  /* ---------------------------------------------------------------------------------------------------------
   * Lighting: a traced file wins over the act's own.
   * ------------------------------------------------------------------------------------------------------- */

  private selected(): number {
    return this.hover >= 0 ? this.hover : this.pinned;
  }

  /** How the act on screen lights a traced file, and its label's sentence. */
  private traceView(v: number): TraceView {
    const model = this.model!;
    const index = this.pos.index;
    const standing = index > 0 || standingAt(this.pos.t);
    const key = `${v}:${index}:${standing ? 1 : 0}:${this.retraced}`;
    if (this.traceCache !== null && this.traceCache.key === key) return this.traceCache.view;
    const act = this.acts[index]!;
    const view = act.traceOf?.(v, model) ?? defaultTrace(model, v, standing);
    this.traceCache = { key, view };
    return view;
  }

  private updateLit(pos: ActPosition, hang: number): void {
    const model = this.model;
    const stage = this.stage;
    if (model === null || stage === null) return;
    const v = this.selected();
    let mask: LitMask | null;
    let key: string;
    if (v >= 0) {
      key = `f${v}:${pos.index}:${pos.index > 0 || standingAt(hang) ? 1 : 0}:${this.retraced}`;
      if (key === this.litKey) return;
      mask = this.traceView(v).mask;
    } else {
      mask = this.acts[pos.index]!.lit(pos.t, model);
      key = mask === null ? "none" : `${pos.index}:${this.maskId(mask)}:${mask.dim}`;
      if (key === this.litKey) return;
    }
    this.litKey = key;
    stage.setLit(mask?.nodes ?? null, mask?.edges ?? null, mask?.dim ?? 0.78);
    this.relayout = true;
  }

  /** A stable id per mask object (masks are compared by identity). */
  private readonly maskIds = new WeakMap<LitMask, number>();
  private nextMaskId = 1;
  private maskId(mask: LitMask): number {
    let id = this.maskIds.get(mask);
    if (id === undefined) {
      id = this.nextMaskId++;
      this.maskIds.set(mask, id);
    }
    return id;
  }

  private setHover(v: number): void {
    if (v === this.hover) return;
    this.hover = v;
    this.stageEl.style.cursor = v >= 0 ? "pointer" : "";
    this.relayout = true;
    this.wake();
  }

  /**
   * Pins a file (-1 clears it). A pin made on the drawing is announced here and heard by the acts' controls; an act
   * that pins from its own controls tells assistive technology through its own readout (one live region a widget).
   */
  private setPinned(v: number, fromDrawing: boolean): void {
    if (v === this.pinned) return;
    this.pinned = v;
    if (fromDrawing) {
      this.announce(v);
      for (const listener of this.pinListeners) listener(v);
    }
    this.relayout = true;
    this.wake();
  }

  /** A trace kept, told to assistive technology in one sentence. */
  private announce(v: number): void {
    if (v < 0) {
      this.status.textContent = "Trace cleared.";
      return;
    }
    const model = this.model;
    if (model === null) return;
    this.status.textContent = `Traced ${model.paths[v]!}. ${this.traceView(v).note}`;
  }

  /* ---------------------------------------------------------------------------------------------------------
   * Input.
   * ------------------------------------------------------------------------------------------------------- */

  /**
   * While the film is pinned, Space, Page Down and Page Up go one stop at a time through every act (a page of scroll
   * would skip most of a beat). Past either end, and with focus in a control, the keys do what they always do.
   */
  private bindKeys(): void {
    const onKey = (e: KeyboardEvent) => {
      const trigger = this.trigger;
      const dir = pageKey(e);
      if (dir === null || e.defaultPrevented || trigger === null || this.still !== null) return;
      const target = e.target as Element | null;
      if (target !== null && target.closest(CONTROLS) !== null) return;
      const y = window.scrollY;
      const { start, end } = trigger;
      if (y < start - 2 || y > end + 2 || end <= start) return;
      const span = end - start;
      const recent = this.keyStop >= 0 && performance.now() - this.keyStopAt < 650;
      const from = recent ? this.keyStop : (y - start) / span;
      const stops = this.clock.stops;
      const next =
        dir === "forward"
          ? stops.find((s) => s > from + 0.002)
          : [...stops].reverse().find((s) => s < from - 0.002);
      if (next === undefined) return;
      e.preventDefault();
      this.keyStop = next;
      this.keyStopAt = performance.now();
      window.scrollTo({ top: start + next * span, behavior: "smooth" });
    };
    document.addEventListener("keydown", onKey);
    this.cleanups.push(() => document.removeEventListener("keydown", onKey));
  }

  /** A lost context (a GPU reset, a driver update) is restored by the browser; draw the frame again then. */
  private bindContext(): void {
    const canvas = this.canvas;
    const restored = () => {
      this.stage?.invalidate();
      this.relayout = true;
      this.wake();
    };
    canvas.addEventListener("webglcontextrestored", restored);
    this.cleanups.push(() => canvas.removeEventListener("webglcontextrestored", restored));
  }

  private bindInput(): void {
    if (this.inputBound) return;
    this.inputBound = true;
    const el = this.stageEl;
    const local = (e: PointerEvent | MouseEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const ignored = (e: Event) =>
      (e.target as Element).closest(
        "a, button, input, select, textarea, label, summary, [data-film-hero], [data-no-trace]",
      ) !== null;
    const onMove = (e: PointerEvent) => {
      this.quiet = 0;
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (ignored(e)) {
        this.pointer = null;
        if (this.hover >= 0) this.setHover(-1);
        return;
      }
      this.pointer = local(e);
      this.needsPick = true;
      this.wake();
    };
    const onLeave = () => {
      this.pointer = null;
      this.setHover(-1);
    };
    const onClick = (e: MouseEvent) => {
      if (ignored(e) || this.stage === null) return;
      const at = local(e);
      const v = this.stage.pick(at.x, at.y, 12);
      this.setPinned(v === this.pinned ? -1 : v, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.pinned >= 0) this.setPinned(-1, true);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    this.cleanups.push(() => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    });
  }

  /* ---------------------------------------------------------------------------------------------------------
   * The still layout, when the film cannot run after all (no stage, no context, no scroll clock).
   * ------------------------------------------------------------------------------------------------------- */

  private async toStill(noWebGL: boolean): Promise<void> {
    const stage = this.stage;
    this.stage = null;
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const overlay of this.overlays) overlay?.dispose();
    this.overlays = [];
    this.labels?.dispose();
    this.labels = null;
    this.hoverLabel = null;
    this.actLabels.length = 0;
    this.trigger?.kill();
    this.trigger = null;
    this.stageEl.removeAttribute("data-shade");
    this.stageEl.style.cursor = "";
    this.html.dataset.kfilm = "still";
    // A canvas that holds a WebGL context cannot give a 2D one: swap in a fresh one, marked the same way.
    if (stage !== null || this.canvas.getContext("2d") === null) {
      const canvas2d = document.createElement("canvas");
      canvas2d.className = this.canvas.className;
      canvas2d.setAttribute("aria-hidden", "true");
      canvas2d.setAttribute("data-film-canvas", "");
      this.canvas.replaceWith(canvas2d);
      this.canvas = canvas2d;
    }
    // Off the page now, the old canvas gives its context back at once.
    stage?.dispose();
    const model = this.model;
    const data = this.data;
    if (model === null || data === null) return;
    let StillFilm: typeof import("./still").StillFilm;
    try {
      StillFilm = (await import("./still")).StillFilm;
    } catch {
      return;
    }
    if (this.disposed) return;
    this.still = new StillFilm(this.root, { ...this.options, noWebGL }, { model, data });
  }

  /**
   * Releases everything the film holds: the frame loop, observers and listeners, the ScrollTrigger, the WebGL
   * context, the words it added to the frame and the attributes it set on <html>, so a page reached afterwards by
   * client-side navigation keeps none of them (its navigation, for one, reads data-kfilm).
   */
  dispose(): void {
    this.disposed = true;
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const overlay of this.overlays) overlay?.dispose();
    this.overlays = [];
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.trigger = null;
    this.stage?.dispose();
    this.stage = null;
    this.still?.dispose();
    this.still = null;
    this.labels?.dispose();
    this.labels = null;
    this.pinListeners.clear();
    this.stageEl.removeAttribute("data-shade");
    this.stageEl.style.cursor = "";
    for (const c of this.captions) c.el.removeAttribute("data-on");
    for (const el of [...this.layers, ...this.slots]) el?.removeAttribute("data-active");
    const data = this.html.dataset;
    delete data.kfilm;
    delete data.kfilmReady;
    delete data.kfilmLive;
    delete data.kfilmUnder;
    if ((window as unknown as { __kfilm?: unknown }).__kfilm === this)
      delete (window as unknown as { __kfilm?: unknown }).__kfilm;
  }
}
