/**
 * The film's director, in the browser. Reads scroll progress (GSAP ScrollTrigger over a sticky stage, so the
 * browser keeps scrolling natively), gives the camera a little mass, runs the stage, and choreographs the words
 * around it: captions, annotations with leader lines, the level gauge and the final card. Hover, tap and the
 * card's buttons trace a file's load path in load blue. three.js and GSAP are imported on demand, and only for the
 * film: the still drawing (reduced motion, no WebGL 2) is canvas 2D.
 *
 * It draws only while something changes: the frame loop stops once the model is at rest and the camera has
 * arrived, and starts again on scroll, pointer, resize or a trace. Everything it adds to the page (listeners,
 * observers, the ScrollTrigger, the WebGL context, attributes on <html>) is removed by dispose().
 */
import { fileNote } from "./copy";
import {
  buildModel,
  DATA_URL,
  formatCount,
  loadPathOf,
  type GraphData,
  type HangingModel,
} from "./model";
import { BEAT, clamp01, STOPS, turnOf, window01, type Framing } from "./timeline";
import type { ScreenPoint, Stage } from "./stage";
import type { Fallback } from "./fallback";

type Mode = "film" | "still";

interface Annotation {
  readonly el: HTMLDivElement;
  readonly leader: SVGPathElement;
  readonly note: HTMLSpanElement;
  readonly code: HTMLElement;
  node: number;
  readonly from: number;
  readonly to: number;
  readonly wideOnly: boolean;
  /** Follows the climb: the file of the load path at the camera's level. */
  readonly climb: boolean;
  /** Shown in the still drawing (the crown). */
  readonly still: boolean;
  on: boolean;
  /** Measured once per text, so placing it every frame does not force a layout. */
  size: { w: number; h: number } | null;
  /** The place it was last put (an index into the candidate places), kept while it stays clear. */
  slot: number;
}

/** A box on the frame, CSS pixels from its top left. */
interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

interface Trigger {
  readonly start: number;
  readonly end: number;
  readonly progress: number;
  kill(): void;
}

type ScrollTriggerClass = typeof import("gsap/ScrollTrigger").ScrollTrigger;

const SVG = "http://www.w3.org/2000/svg";
/** After this long without input the hanging model stops breathing, so a page left open comes to rest. */
const CALM_AFTER = 14;

/** How much of a box another box covers (its area), 0 when they are clear of each other. */
function overlap(a: Box, b: Box): number {
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  return w > 0 && h > 0 ? w * h : 0;
}

/** A path that may break after a slash and nowhere else (labels wrap on narrow screens, never mid-name). */
function breakablePath(path: string): Node[] {
  const parts = path.split("/");
  const nodes: Node[] = [];
  parts.forEach((part, i) => {
    const last = i === parts.length - 1;
    const span = document.createElement("span");
    span.style.whiteSpace = "nowrap";
    span.textContent = last ? part : `${part}/`;
    nodes.push(span);
    if (!last) nodes.push(document.createElement("wbr"));
  });
  return nodes;
}

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

export class Film {
  private readonly root: HTMLElement;
  private readonly rest: readonly number[];
  /** The browser has the WebGL 2 API but could not make a usable context (probed by FilmClient). */
  private readonly noWebGL: boolean;
  private readonly html = document.documentElement;
  private mode: Mode;
  private readonly track: HTMLElement;
  private readonly stageEl: HTMLElement;
  private canvas: HTMLCanvasElement;
  private readonly leaders: SVGSVGElement;
  private readonly labels: HTMLElement;
  private readonly hero: HTMLElement;
  private readonly captions: { el: HTMLElement; from: number; to: number; on: boolean }[];
  private readonly turning: HTMLElement[];
  private readonly gauge: HTMLElement;
  private readonly levelText: HTMLElement;
  private readonly ticks: HTMLElement[];
  private readonly card: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tests: HTMLButtonElement[];
  private readonly titleblock: HTMLElement;

  private model: HangingModel | null = null;
  private stage: Stage | null = null;
  private fallback: Fallback | null = null;
  private trigger: Trigger | null = null;
  private framing: Framing = "wide";
  private size = { width: 1, height: 1 };
  private annotations: Annotation[] = [];
  private hoverLabel: Annotation | null = null;
  private readonly pathCache = new Map<number, ReturnType<typeof loadPathOf>>();
  private spineNodes: Uint8Array | null = null;
  private spineEdges: Uint8Array | null = null;

  private raf = 0;
  private visible = true;
  private disposed = false;
  private last = 0;
  private pRaw = 0;
  private p = -1;
  private heroOn = true;
  private gaugeOn = false;
  private cardOn = false;
  /** The climb: the camera is inside the structure, so the narration takes a darker ground. */
  private shadeOn = false;
  private level = -1;
  private hover = -1;
  private pinned = -1;
  private litKey = "";
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
  private crop: SVGPathElement | null = null;
  private cropOn = false;
  private readonly corners: ScreenPoint[] = [0, 1, 2, 3].map(() => ({
    x: 0,
    y: 0,
    depth: 0,
    visible: false,
  }));
  /** The words on the frame that labels keep clear of, measured only when what is shown changes. */
  private obstacles: Box[] = [];
  private obstaclesKey = "";
  /** Labels placed so far this frame: later ones keep clear of them too. */
  private placed: Box[] = [];
  /** How far the turning word rises at mid-turn so that, upright on its end, it clears the line below (px). */
  private turnLift = -1;
  private turnShown = -1;
  /** The stop a page key last sent the film to, so quick presses step on from it rather than from where the
   * smooth scroll has got to. */
  private keyStop = -1;
  private keyStopAt = 0;
  private inputBound = false;
  /** The progress the film holds while a resize is measured (-1: none). */
  private held = -1;

  constructor(root: HTMLElement, rest: readonly number[], noWebGL = false) {
    this.root = root;
    this.rest = rest;
    this.noWebGL = noWebGL;
    this.mode = this.html.dataset.kfilm === "film" ? "film" : "still";
    this.html.dataset.kfilmReady = "1";
    if (process.env.NODE_ENV !== "production")
      (window as unknown as { __kfilm?: Film }).__kfilm = this;
    this.track = q(root, "[data-film-track]");
    this.stageEl = q(root, "[data-film-stage]");
    this.canvas = q(root, "[data-film-canvas]");
    this.leaders = q(root, "[data-film-leaders]");
    this.labels = q(root, "[data-film-labels]");
    this.hero = q(root, "[data-film-hero]");
    this.captions = [...root.querySelectorAll<HTMLElement>("[data-caption]")].map((el) => ({
      el,
      from: Number(el.dataset.from),
      to: Number(el.dataset.to),
      on: false,
    }));
    this.turning = [...root.querySelectorAll<HTMLElement>("[data-turns]")];
    this.gauge = q(root, "[data-film-gauge]");
    this.levelText = q(root, "[data-film-level]");
    this.ticks = [...root.querySelectorAll<HTMLElement>("[data-tick]")].sort(
      (a, b) => Number(a.dataset.tick) - Number(b.dataset.tick),
    );
    this.card = q(root, "[data-film-card]");
    this.status = q(root, "[data-film-status]");
    this.tests = [...root.querySelectorAll<HTMLButtonElement>("[data-file]")];
    this.titleblock = q(root, "[data-film-titleblock]");
    if (this.mode === "still") {
      setOn(this.card, true);
      this.cardOn = true;
    }
    this.bindNavigation();
    this.bindSkip();
    void this.start();
  }

  /**
   * "Skip the film" jumps past it at once (the page scrolls smoothly, which would play the whole film at speed)
   * and moves focus to the end of the section. Without script the link still works, smoothly.
   */
  private bindSkip(): void {
    const link = this.root.querySelector<HTMLAnchorElement>("[data-film-skip]");
    const end = this.root.querySelector<HTMLElement>("[data-film-end]");
    if (link === null || end === null) return;
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      window.scrollTo({
        top: end.getBoundingClientRect().top + window.scrollY,
        behavior: "instant",
      });
      end.focus({ preventScroll: true });
    };
    link.addEventListener("click", onClick);
    this.cleanups.push(() => link.removeEventListener("click", onClick));
  }

  private async start(): Promise<void> {
    performance.mark("kfilm:start");
    const dataPromise = fetch(DATA_URL).then((r) => {
      if (!r.ok) throw new Error(`${DATA_URL}: ${r.status}`);
      return r.json() as Promise<GraphData>;
    });
    // Only the film needs three.js and GSAP (FilmClient has already switched to the still layout when WebGL 2
    // cannot run it).
    const film = this.mode === "film";
    const stagePromise = film ? import("./stage") : null;
    const gsapPromise = film ? Promise.all([import("gsap"), import("gsap/ScrollTrigger")]) : null;
    // Awaited later, after the first frame; a failure is handled there.
    gsapPromise?.catch(() => undefined);
    let data: GraphData;
    try {
      data = await dataPromise;
    } catch {
      // Without the analysis there is nothing to draw: the words stay, in the still layout.
      if (!this.disposed) this.setMode("still");
      return;
    }
    if (this.disposed) return;
    const model = buildModel(data, this.rest);
    this.model = model;
    this.framing = this.framingOf();
    performance.mark("kfilm:model");

    if (stagePromise === null) {
      // Reduced motion, or no WebGL 2 for the film: the standing structure in 2D.
      await this.startFallback(model, this.noWebGL);
      return;
    }
    let StageClass: typeof import("./stage").Stage;
    try {
      StageClass = (await stagePromise).Stage;
    } catch {
      // The stage could not be fetched: the still drawing, which needs no WebGL.
      await this.startFallback(model, false);
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
      await this.startFallback(model, true);
      return;
    }
    this.stage = stage;

    this.buildAnnotations(model);
    this.bindInput();
    this.bindContext();
    const rect = this.stageEl.getBoundingClientRect();
    this.size = { width: rect.width, height: rect.height };
    stage.resize(rect.width, rect.height);
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(this.stageEl);
    this.cleanups.push(() => ro.disconnect());

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
    if (this.pRaw > BEAT.plan) stage.sim.showBoard();
    this.wake();

    let gsapModules: Awaited<NonNullable<typeof gsapPromise>>;
    try {
      gsapModules = await gsapPromise!;
    } catch {
      if (this.disposed) return;
      // No scroll clock: the standing structure, still. The 2D drawing takes over the stage's place.
      this.stage = null;
      if (this.raf !== 0) cancelAnimationFrame(this.raf);
      this.raf = 0;
      await this.startFallback(model, false);
      stage.dispose();
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
        if (this.held >= 0) return;
        this.pRaw = self.progress;
        this.quiet = 0;
        this.wake();
      },
      onRefresh: (self) => {
        if (this.held >= 0) return;
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

  /**
   * A resize (a phone turned, a window dragged) changes the track's length in pixels while the page keeps its
   * scroll offset, which would throw the film to another beat, or past its end. The film holds where it was until
   * ScrollTrigger has measured the new track (about 200 ms after the last resize), then the page scrolls back to the
   * same moment. Height-only resizes on touch screens (the address bar) are not measured again by ScrollTrigger and
   * keep the film running.
   */
  private bindResize(trigger: Trigger, ScrollTrigger: ScrollTriggerClass): void {
    let width = window.innerWidth;
    let release = 0;
    const onResize = () => {
      const widthChanged = window.innerWidth !== width;
      width = window.innerWidth;
      if (!widthChanged && ScrollTrigger.isTouch === 1) return;
      if (this.held < 0 && this.pRaw > 0 && this.pRaw < 1) this.held = this.pRaw;
      window.clearTimeout(release);
      // Should the new measurement not come, let the film follow the page again.
      release = window.setTimeout(() => (this.held = -1), 1500);
    };
    const onRefresh = () => {
      if (this.held < 0) return;
      const p = this.held;
      this.held = -1;
      window.clearTimeout(release);
      const top = trigger.start + p * (trigger.end - trigger.start);
      if (Math.abs(window.scrollY - top) > 1) window.scrollTo({ top, behavior: "instant" });
      this.pRaw = p;
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

  /** Scroll progress through the track, read from the layout: what ScrollTrigger reports once it runs. */
  private progressNow(): number {
    const r = this.track.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    return span > 0 ? clamp01(-r.top / span) : 0;
  }

  /** The film could not run after all (no context, no scroll clock): the still layout, before anything shows. */
  private setMode(mode: Mode): void {
    this.mode = mode;
    this.html.dataset.kfilm = mode;
    if (mode === "still") {
      setOn(this.card, true);
      this.cardOn = true;
      this.heroOn = true;
      this.hero.removeAttribute("data-off");
      this.stageEl.removeAttribute("data-shade");
      this.shadeOn = false;
    }
  }

  /**
   * The standing structure, drawn in 2D, still and interactive: under reduced motion, without WebGL 2, or when the
   * film cannot run. `noWebGL` adds the title block's line saying why it is still.
   */
  private async startFallback(model: HangingModel, noWebGL: boolean): Promise<void> {
    this.setMode("still");
    const { Fallback } = await import("./fallback");
    if (this.disposed) return;
    // A canvas that already holds a WebGL context cannot give a 2D one: swap in a fresh one, marked the same way.
    if (this.canvas.getContext("2d") === null) {
      const canvas2d = document.createElement("canvas");
      canvas2d.className = this.canvas.className;
      canvas2d.setAttribute("aria-hidden", "true");
      canvas2d.setAttribute("data-film-canvas", "");
      this.canvas.replaceWith(canvas2d);
      this.canvas = canvas2d;
    }
    this.fallback = new Fallback(this.canvas, model, this.framingOf());
    const note = this.root.querySelector<HTMLElement>("[data-film-fallback]");
    if (note !== null) note.hidden = !noWebGL;
    this.buildAnnotations(model);
    let drawn = "";
    const draw = () => {
      const rect = this.stageEl.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // The observer reports the size it was first given too: the drawing only changes with the frame's size.
      const key = `${rect.width}x${rect.height}@${dpr}`;
      if (key === drawn) return;
      drawn = key;
      this.size = { width: rect.width, height: rect.height };
      for (const a of this.annotations) a.size = null;
      if (this.hoverLabel !== null) this.hoverLabel.size = null;
      this.obstaclesKey = "";
      this.framing = this.framingOf();
      this.fallback?.resize(rect.width, rect.height, dpr, this.framing);
      this.fallback?.draw(this.litMasks());
      this.placeFallbackLabel();
    };
    draw();
    performance.mark("kfilm:first-frame");
    const ro = new ResizeObserver(draw);
    ro.observe(this.stageEl);
    this.cleanups.push(() => ro.disconnect());
    this.bindInput();
    this.canvas.setAttribute("data-ready", "");
    this.html.dataset.kfilmLive = "";
  }

  private framingOf(): Framing {
    const rect = this.stageEl.getBoundingClientRect();
    return rect.width / Math.max(1, rect.height) >= 0.95 ? "wide" : "tall";
  }

  private onResize(): void {
    if (this.stage === null) return;
    const rect = this.stageEl.getBoundingClientRect();
    this.size = { width: rect.width, height: rect.height };
    for (const a of this.annotations) a.size = null;
    if (this.hoverLabel !== null) this.hoverLabel.size = null;
    this.obstaclesKey = "";
    this.turnLift = -1;
    this.turnShown = -1;
    const framing = this.framingOf();
    if (framing !== this.framing) {
      this.framing = framing;
      this.stage.setFraming(framing);
    }
    this.stage.resize(rect.width, rect.height);
    this.relayout = true;
    this.wake();
  }

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
    if (this.p < 0 || Math.abs(target - this.p) > 0.2) this.p = target;
    else this.p += (target - this.p) * (1 - Math.exp(-dt / 0.14));
    if (Math.abs(target - this.p) < 2e-5) this.p = target;
    const p = this.p;

    if (this.needsPick && this.pointer !== null) {
      this.needsPick = false;
      this.setHover(stage.pick(this.pointer.x, this.pointer.y, 6));
    }
    this.updateLit(p);
    const calm = 1 - Math.min(1, Math.max(0, (this.quiet - CALM_AFTER) / 3));
    const t0 = performance.now();
    const drawn = stage.frame(p, dt, calm);
    if (drawn) this.measure(performance.now() - t0, dt);
    if (drawn && !this.firstStructure) {
      this.firstStructure = true;
      this.canvas.setAttribute("data-ready", "");
      this.html.dataset.kfilmLive = "";
      performance.mark("kfilm:first-frame");
    }
    this.choreograph(p);
    // Words follow the drawing: they move only when it was drawn again (or the frame changed under them).
    if (drawn || this.relayout) {
      this.relayout = false;
      this.refreshObstacles();
      this.placeLabels(p);
      this.placeCrop(p);
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
    if (this.dprSettled || this.stage === null || this.mode !== "film") return;
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

  private choreograph(p: number): void {
    const film = this.mode === "film";
    const heroOn = !film || p < 0.034;
    if (heroOn !== this.heroOn) {
      this.heroOn = heroOn;
      this.hero.toggleAttribute("data-off", !heroOn);
    }
    if (film) {
      for (const c of this.captions) {
        const on = p >= c.from && p <= c.to;
        if (on !== c.on) {
          c.on = on;
          setOn(c.el, on);
        }
      }
      // "stands." turns over with the model, in the picture plane like the model. Upright on its end at
      // mid-turn it would cut into the line below, so it rises as it turns, the way a plank turned end over end
      // is lifted, and lands back on the line as it comes upright.
      const turn = turnOf(p);
      if (turn !== this.turnShown) {
        this.turnShown = turn;
        if (this.turnLift < 0) this.measureTurnWord();
        const lift = Math.sin(Math.PI * turn) * this.turnLift;
        const transform = `translateY(${(-lift).toFixed(1)}px) rotate(${((turn - 1) * 180).toFixed(2)}deg)`;
        for (const el of this.turning) el.style.transform = transform;
      }
      const gaugeOn = p >= BEAT.zoomEnd - 0.012 && p <= BEAT.riseEnd + 0.02;
      if (gaugeOn !== this.gaugeOn) {
        this.gaugeOn = gaugeOn;
        setOn(this.gauge, gaugeOn);
      }
      // Inside the structure the drawing fills the frame: the narration's corner takes a darker ground.
      const shadeOn = p >= BEAT.zoomEnd - 0.02 && p <= BEAT.riseEnd + 0.014;
      if (shadeOn !== this.shadeOn) {
        this.shadeOn = shadeOn;
        this.stageEl.toggleAttribute("data-shade", shadeOn);
      }
      const cardOn = p >= BEAT.land - 0.016;
      if (cardOn !== this.cardOn) {
        this.cardOn = cardOn;
        setOn(this.card, cardOn);
      }
    }
    const model = this.model;
    if (model === null) return;
    const steps = model.spine.length - 1;
    const level = Math.max(
      0,
      Math.min(steps, Math.round(((p - BEAT.zoomEnd) / (BEAT.riseEnd - BEAT.zoomEnd)) * steps)),
    );
    if (level !== this.level) {
      this.level = level;
      this.levelText.textContent = String(level).padStart(2, "0");
      this.ticks.forEach((tick, i) => {
        if (i === level) tick.setAttribute("data-current", "");
        else tick.removeAttribute("data-current");
        if (i < level) tick.setAttribute("data-passed", "");
        else tick.removeAttribute("data-passed");
      });
    }
  }

  /** The turning word's lift: half its length less half its height, so on its end it stands on the line. */
  private measureTurnWord(): void {
    const el = this.turning[0];
    // Layout sizes, unaffected by the word's own transform (the caption is transparent, not removed, so it has them).
    this.turnLift = el === undefined ? 0 : Math.max(0, (el.offsetWidth - el.offsetHeight) / 2) + 3;
  }

  /**
   * Measures the words on the frame (title block, hero, the caption shown, gauge, card) when what is shown
   * changes, so labels can keep clear of them without reading the layout every frame.
   */
  private refreshObstacles(): void {
    const film = this.mode === "film" && this.fallback === null;
    const shown = film
      ? `${this.heroOn ? 1 : 0}${this.gaugeOn ? 1 : 0}${this.cardOn ? 1 : 0}${this.captions.map((c) => (c.on ? 1 : 0)).join("")}`
      : "still";
    const key = `${shown}:${Math.round(this.size.width)}x${Math.round(this.size.height)}`;
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
    add(this.titleblock, 6);
    if (this.heroOn) add(this.hero, 14);
    if (film) {
      // A caption's words, not its column: the column is wider than its lines, and a label pushed out of the
      // whole column next to a file that hangs low on the left would find no place at all. The wrappers are
      // inline, so their boxes are the lines as laid out, unmoved by the words' own drop.
      for (const c of this.captions) {
        if (!c.on) continue;
        for (const words of c.el.querySelectorAll(":scope > p > span[aria-hidden]")) add(words, 14);
      }
      if (this.gaugeOn) add(this.gauge, 14);
      if (this.cardOn) add(this.card, 14);
    }
    this.obstacles = boxes;
  }

  /* ---------------------------------------------------------------------------------------------------------
   * Load paths in load blue.
   * ------------------------------------------------------------------------------------------------------- */

  private pathOf(v: number) {
    let path = this.pathCache.get(v);
    if (path === undefined && this.model !== null) {
      path = loadPathOf(this.model, v);
      this.pathCache.set(v, path);
    }
    return path!;
  }

  private selected(): number {
    return this.hover >= 0 ? this.hover : this.pinned;
  }

  private litMasks(): { nodes: Uint8Array; edges: Uint8Array } | null {
    const model = this.model;
    if (model === null) return null;
    const v = this.selected();
    if (v >= 0) {
      const path = this.pathOf(v);
      if (path.supportCount === 0) {
        // A foundation stands on nothing but the ground: light the load it carries, everything resting on it.
        const nodes = Uint8Array.from(path.carriedBy);
        nodes[v] = 1;
        return { nodes, edges: path.above };
      }
      const nodes = Uint8Array.from(path.supports);
      nodes[v] = 1;
      return { nodes, edges: path.below };
    }
    if (this.mode === "still" || this.fallback !== null) return null;
    const p = this.p;
    if (p >= BEAT.zoomEnd - 0.01 && p < BEAT.land - 0.02) {
      if (this.spineNodes === null || this.spineEdges === null) {
        this.spineNodes = new Uint8Array(model.n);
        this.spineEdges = new Uint8Array(model.m);
        const spine = model.spine;
        spine.forEach((s) => (this.spineNodes![s] = 1));
        for (let k = 0; k < model.m; k++) {
          const i = spine.indexOf(model.edgeA[k]!);
          if (i > 0 && spine[i - 1] === model.edgeB[k]) this.spineEdges[k] = 1;
        }
      }
      return { nodes: this.spineNodes, edges: this.spineEdges };
    }
    if (p >= BEAT.land - 0.02) {
      const path = this.pathOf(model.crown);
      const nodes = Uint8Array.from(path.supports);
      nodes[model.crown] = 1;
      return { nodes, edges: path.below };
    }
    return null;
  }

  private updateLit(p: number): void {
    const v = this.selected();
    const key =
      v >= 0
        ? `f${v}`
        : this.mode === "still"
          ? ""
          : p >= BEAT.land - 0.02
            ? "crown"
            : p >= BEAT.zoomEnd - 0.01
              ? "spine"
              : "";
    if (key === this.litKey) return;
    this.litKey = key;
    const masks = this.litMasks();
    // A traced file stands out from everything; the climb and the landing keep the structure around them in view.
    const dim = key === "spine" ? 0.18 : key === "crown" ? 0.5 : 0.8;
    this.stage?.setLit(masks?.nodes ?? null, masks?.edges ?? null, dim);
    if (this.fallback !== null) this.fallback.draw(masks);
    this.relayout = true;
  }

  private setHover(v: number): void {
    if (v === this.hover) return;
    this.hover = v;
    this.stageEl.style.cursor = v >= 0 ? "pointer" : "";
    this.refreshSelection();
  }

  private refreshSelection(): void {
    if (this.fallback !== null) {
      this.litKey = "";
      this.updateLit(1);
      this.placeFallbackLabel();
    }
    this.relayout = true;
    this.wake();
  }

  private describeFile(v: number): { path: string; note: string } {
    const model = this.model!;
    const standing = this.mode === "still" || this.fallback !== null || turnOf(this.p) > 0.5;
    return { path: model.paths[v]!, note: fileNote(model, v, this.pathOf(v), standing) };
  }

  /* ---------------------------------------------------------------------------------------------------------
   * Annotations: real paths on the drawing, with leader lines that follow the camera.
   * ------------------------------------------------------------------------------------------------------- */

  private makeLabel(active: boolean): Annotation {
    const el = document.createElement("div");
    el.setAttribute("data-label", "");
    if (active) el.setAttribute("data-active", "");
    const code = document.createElement("code");
    const note = document.createElement("span");
    el.append(code, note);
    this.labels.append(el);
    const leader = document.createElementNS(SVG, "path");
    if (active) leader.setAttribute("data-active", "");
    this.leaders.append(leader);
    return {
      el,
      leader,
      code,
      note,
      node: -1,
      from: 0,
      to: 0,
      wideOnly: false,
      climb: false,
      still: false,
      on: false,
      size: null,
      slot: -1,
    };
  }

  private buildAnnotations(model: HangingModel): void {
    if (this.annotations.length > 0) return;
    const [first, second] = model.heaviest;
    const add = (
      node: number,
      from: number,
      to: number,
      note: string,
      active: boolean,
      extra: Partial<Annotation> = {},
    ) => {
      const a = { ...this.makeLabel(active), node, from, to, ...extra };
      this.setLabel(a, model.paths[node]!, note);
      this.annotations.push(a);
    };
    add(first!, -1, 0.034, `carries ${formatCount(model.reach[first!]!)} files`, false);
    add(second!, -1, 0.034, `carries ${formatCount(model.reach[second!]!)} files`, false, {
      wideOnly: true,
    });
    add(
      model.crown,
      0.418,
      BEAT.circleEnd - 0.012,
      `level ${model.level[model.crown]}, the lowest weight`,
      false,
    );
    add(
      first!,
      BEAT.turnEnd + 0.006,
      BEAT.waveEnd + 0.008,
      `carries ${formatCount(model.reach[first!]!)} files`,
      true,
    );
    // The climb: the file of the load path at the camera's level.
    this.annotations.push({
      ...this.makeLabel(true),
      node: model.spine[0]!,
      from: BEAT.zoomEnd + 0.004,
      to: BEAT.riseEnd,
      climb: true,
    });
    add(model.crown, BEAT.land - 0.01, 2, `level ${model.level[model.crown]}, the crown`, true, {
      still: true,
    });
    this.hoverLabel = this.makeLabel(true);
    this.crop = document.createElementNS(SVG, "path");
    this.crop.setAttribute("data-crop", "");
    this.leaders.append(this.crop);
  }

  /**
   * The photograph: crop marks close round the hanging model while its form is fixed, then turn over with it
   * (the model turns in the picture plane, so the marks turn on screen exactly as the photograph would).
   */
  private placeCrop(p: number): void {
    const stage = this.stage;
    const crop = this.crop;
    if (stage === null || crop === null || this.model === null) return;
    const shown =
      this.mode === "film" ? window01(p, BEAT.circleEnd + 0.012, BEAT.turnEnd + 0.004, 0.012) : 0;
    const on = shown > 0.001;
    if (on !== this.cropOn) {
      this.cropOn = on;
      setOn(crop, on);
    }
    if (!on) {
      crop.style.opacity = "0";
      return;
    }
    crop.style.opacity = shown.toFixed(3);
    const { axis, height } = stage.turnGeometry;
    const a = Math.PI * turnOf(p);
    const c = Math.cos(a);
    // About z the frame's (across, up) turns like (x, y); about x, (up, across) turns like (y, z): the other way.
    const s = axis === "z" ? Math.sin(a) : -Math.sin(a);
    // Half-sizes of the frame round the hanging model: its span across the screen, and its height with a margin.
    const across = axis === "z" ? 13.4 : 9.4;
    const up = height / 2 + 1.6;
    const corner = [
      [-across, -up],
      [across, -up],
      [across, up],
      [-across, up],
    ] as const;
    corner.forEach(([u, v], i) => {
      // Rotate the frame's corner about the turn axis, through the model's centre (0, height / 2, 0).
      const ru = c * u - s * v;
      const rv = s * u + c * v;
      if (axis === "z") stage.screenOfWorld(ru, height / 2 + rv, 0, this.corners[i]!);
      else stage.screenOfWorld(0, height / 2 + rv, ru, this.corners[i]!);
    });
    const arm = 22;
    let d = "";
    for (let i = 0; i < 4; i++) {
      const pt = this.corners[i]!;
      const prev = this.corners[(i + 3) % 4]!;
      const next = this.corners[(i + 1) % 4]!;
      const toward = (q: ScreenPoint) => {
        const dx = q.x - pt.x;
        const dy = q.y - pt.y;
        const l = Math.hypot(dx, dy) || 1;
        return `${(pt.x + (dx / l) * arm).toFixed(1)} ${(pt.y + (dy / l) * arm).toFixed(1)}`;
      };
      d += `M${toward(prev)}L${pt.x.toFixed(1)} ${pt.y.toFixed(1)}L${toward(next)}`;
    }
    crop.setAttribute("d", d);
  }

  private placeLabels(p: number): void {
    const stage = this.stage;
    const model = this.model;
    if (stage === null || model === null) return;
    const film = this.mode === "film";
    const selected = this.selected();
    this.placed = [];
    // The traced file's label goes first: it is what the visitor is pointing at.
    if (this.hoverLabel !== null && selected >= 0) {
      const h = this.hoverLabel;
      if (h.node !== selected) {
        h.node = selected;
        const d = this.describeFile(selected);
        this.setLabel(h, d.path, d.note);
      }
      this.position(h, true);
    }
    for (const a of this.annotations) {
      if (a.climb) {
        const node = model.spine[Math.max(0, this.level)]!;
        if (node !== a.node) {
          a.node = node;
          this.setLabel(a, model.paths[node]!, `level ${model.level[node]}`);
        }
      }
      const inWindow = film ? p >= a.from && p <= a.to : a.still;
      const on = inWindow && (!a.wideOnly || this.framing === "wide") && selected < 0;
      this.position(a, on);
    }
    if (this.hoverLabel !== null && selected < 0) this.position(this.hoverLabel, false);
  }

  /** Sets a label's words; its size is measured again the next time it is placed. */
  private setLabel(a: Annotation, code: string, note: string): void {
    a.code.replaceChildren(...breakablePath(code));
    a.note.textContent = note;
    a.size = null;
    a.slot = -1;
  }

  private position(a: Annotation, on: boolean): void {
    const stage = this.stage;
    if (stage === null) return;
    let show = on;
    if (on) {
      stage.screenOf(a.node, this.pt);
      // A file behind the words on the frame (the camera's orbit carries the lowest weight under the narration
      // on some screens): a leader into lettering points at nothing the eye can find, so the label waits for the
      // file to come out. The traced file's label always shows: it is what the visitor is pointing at.
      show = this.pt.visible && (a === this.hoverLabel || !this.behindWords(this.pt.x, this.pt.y));
    }
    if (show !== a.on) {
      a.on = show;
      setOn(a.el, show);
      setOn(a.leader, show);
      // Shown again: start from the preferred place.
      if (show) a.slot = -1;
    }
    if (show) this.layoutLabel(a, this.pt.x, this.pt.y);
  }

  /** Whether a point on the frame lies under one of its words (the measured obstacles, with their margins). */
  private behindWords(x: number, y: number): boolean {
    return this.obstacles.some((o) => x > o.l && x < o.r && y > o.t && y < o.b);
  }

  /**
   * Puts a label beside its point, up and to the side with more room, inside the frame (clear of the bar) and
   * clear of every word on it: the hero, the caption shown, the gauge, the card, the title block and the labels
   * already placed this frame. It tries the other side, then below, and keeps the place it has while that stays
   * clear, so it does not hop from side to side as the camera moves. A leader runs from the point to the near
   * end of the label's rule.
   */
  private layoutLabel(a: Annotation, x: number, y: number): void {
    const { width, height } = this.size;
    if (a.size === null) a.size = { w: a.el.offsetWidth, h: a.el.offsetHeight };
    const { w, h } = a.size;
    const top = 76;
    const gap = 34;
    const rise = 30;
    const preferRight = x < width - 300;
    const near = preferRight ? x + gap : x - gap - w;
    const far = preferRight ? x - gap - w : x + gap;
    // [left edge, baseline] of each place, in order of preference.
    const places: readonly (readonly [number, number])[] = [
      [near, y - rise],
      [far, y - rise],
      [near, y + rise + h],
      [far, y + rise + h],
    ];
    const boxAt = (i: number): Box => {
      const [px, py] = places[i]!;
      const lx = Math.min(Math.max(px, 16), Math.max(16, width - 16 - w));
      const ly = Math.min(Math.max(py, top + h), height - 16);
      return { l: lx - 6, t: ly - h, r: lx + w, b: ly };
    };
    const self: Box = { l: x - 9, t: y - 9, r: x + 9, b: y + 9 };
    const cost = (box: Box) => {
      let c = overlap(box, self) * 4;
      for (const o of this.obstacles) c += overlap(box, o);
      for (const o of this.placed) c += overlap(box, o);
      return c;
    };
    let slot = a.slot;
    if (slot < 0 || cost(boxAt(slot)) > 0) {
      let best = Infinity;
      for (let i = 0; i < places.length; i++) {
        const c = cost(boxAt(i));
        if (c < best) {
          best = c;
          slot = i;
          if (c === 0) break;
        }
      }
      a.slot = slot;
    }
    const box = boxAt(slot);
    this.placed.push(box);
    const lx = box.l + 6;
    a.el.style.transform = `translate3d(${lx.toFixed(1)}px, ${box.t.toFixed(1)}px, 0)`;
    // The rule runs along the edge nearer the point: under a label above its point, over a label below it.
    const ry = box.t > y ? box.t : box.b;
    const toRight = lx + w / 2 >= x;
    const ex = toRight ? lx : lx + w;
    const fx = toRight ? lx + w : lx;
    const dx = ex - x;
    const dy = ry - y;
    const l = Math.hypot(dx, dy) || 1;
    // Start the leader just outside the ring, not at its centre.
    const r = 5;
    a.leader.setAttribute(
      "d",
      `M${(x + (dx / l) * r).toFixed(1)} ${(y + (dy / l) * r).toFixed(1)}L${ex.toFixed(1)} ${ry.toFixed(1)}L${fx.toFixed(1)} ${ry.toFixed(1)}`,
    );
  }

  /** The 2D drawing's words: the crown's note, or the traced file's while one is traced. */
  private placeFallbackLabel(): void {
    const fb = this.fallback;
    if (fb === null || this.model === null) return;
    this.refreshObstacles();
    this.placed = [];
    const h = this.hoverLabel ?? this.makeLabel(true);
    this.hoverLabel = h;
    const v = this.selected();
    const show = (a: Annotation, pt: { x: number; y: number } | null) => {
      if (a.on !== (pt !== null)) {
        a.on = pt !== null;
        setOn(a.el, a.on);
        setOn(a.leader, a.on);
        if (a.on) a.slot = -1;
      }
      if (pt !== null) this.layoutLabel(a, pt.x, pt.y);
    };
    const pt = v >= 0 ? fb.screenOf(v) : null;
    if (pt !== null && h.node !== v) {
      h.node = v;
      const d = this.describeFile(v);
      this.setLabel(h, d.path, d.note);
    }
    show(h, pt);
    for (const a of this.annotations) {
      show(a, v < 0 && a.still ? fb.screenOf(a.node) : null);
    }
  }

  /* ---------------------------------------------------------------------------------------------------------
   * Input.
   * ------------------------------------------------------------------------------------------------------- */

  /**
   * Keeps <html data-kfilm-under> while the top of the film's frame lies under the navigation bar: the frame then
   * fills the window from the bar down (the film is pinned, or the page is at its top), so a navigation can stay
   * clear over the drawing. Once the frame starts to scroll away (the film is over), or before it arrives, the bar
   * takes its own ground, so the card and the next section never slide under clear lettering.
   */
  private bindNavigation(): void {
    // A one-pixel mark on the frame's top edge, watched through a band across the top of the window.
    const mark = document.createElement("div");
    mark.setAttribute("aria-hidden", "true");
    mark.style.cssText = "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none";
    this.stageEl.prepend(mark);
    const io = new IntersectionObserver(
      (entries) => {
        const under = entries.some((e) => e.isIntersecting);
        if (under) this.html.dataset.kfilmUnder = "";
        else delete this.html.dataset.kfilmUnder;
      },
      // The band: about as deep as the bar.
      { rootMargin: "0px 0px -92% 0px" },
    );
    io.observe(mark);
    this.cleanups.push(() => {
      io.disconnect();
      mark.remove();
      delete this.html.dataset.kfilmUnder;
    });
  }

  /**
   * While the film is pinned, Space, Page Down and Page Up go one beat at a time (a page of scroll would skip
   * most of a beat). Past either end, and with focus in a control, the keys do what they always do.
   */
  private bindKeys(): void {
    const onKey = (e: KeyboardEvent) => {
      const trigger = this.trigger;
      const dir = pageKey(e);
      if (dir === null || e.defaultPrevented || trigger === null || this.mode !== "film") return;
      const target = e.target as Element | null;
      if (
        target !== null &&
        target.closest(
          "input, textarea, select, button, summary, [contenteditable]:not([contenteditable='false']), [role='button'], [role='textbox'], [role='slider'], [role='listbox']",
        ) !== null
      ) {
        return;
      }
      const y = window.scrollY;
      const { start, end } = trigger;
      if (y < start - 2 || y > end + 2 || end <= start) return;
      const span = end - start;
      const recent = this.keyStop >= 0 && performance.now() - this.keyStopAt < 650;
      const from = recent ? this.keyStop : (y - start) / span;
      const next =
        dir === "forward"
          ? STOPS.find((s) => s > from + 0.004)
          : [...STOPS].reverse().find((s) => s < from - 0.004);
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

  /** Pointer and button input, bound once (the fallback can take over from a stage that already bound it). */
  private bindInput(): void {
    if (this.inputBound) return;
    this.inputBound = true;
    this.bindPointer();
    this.bindTests();
  }

  private bindPointer(): void {
    const el = this.stageEl;
    const local = (e: PointerEvent | MouseEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: PointerEvent) => {
      this.quiet = 0;
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if ((e.target as Element).closest("a, button, [data-film-hero], [data-film-card]") !== null) {
        this.pointer = null;
        if (this.hover >= 0) this.setHover(-1);
        return;
      }
      this.pointer = local(e);
      if (this.fallback !== null && this.model !== null) {
        this.setHover(this.fallback.pick(this.pointer.x, this.pointer.y, 6));
        return;
      }
      this.needsPick = true;
      this.wake();
    };
    const onLeave = () => {
      this.pointer = null;
      this.setHover(-1);
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest("a, button, [data-film-hero], [data-film-card]") !== null)
        return;
      const at = local(e);
      const v =
        this.fallback !== null
          ? this.fallback.pick(at.x, at.y, 12)
          : this.stage !== null
            ? this.stage.pick(at.x, at.y, 12)
            : -1;
      this.pinned = v === this.pinned ? -1 : v;
      this.syncTests();
      this.announce(this.pinned);
      this.refreshSelection();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.pinned >= 0) {
        this.pinned = -1;
        this.syncTests();
        this.announce(-1);
        this.refreshSelection();
      }
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

  /**
   * The card's buttons: pointing at one (or focusing it) previews its trace on the drawing; pressing it keeps the
   * trace (aria-pressed), pressing again lets it go. Each button carries its file's facts as its description, so
   * nothing is announced on focus beyond the button itself.
   */
  private bindTests(): void {
    const model = this.model;
    if (model === null) return;
    const indexOf = new Map(model.paths.map((p, i) => [p, i]));
    for (const button of this.tests) {
      const v = indexOf.get(button.dataset.file ?? "") ?? -1;
      if (v < 0) continue;
      const enter = () => {
        this.hover = v;
        this.refreshSelection();
      };
      const leave = () => {
        if (this.hover === v) this.hover = -1;
        this.refreshSelection();
      };
      const click = () => {
        this.pinned = this.pinned === v ? -1 : v;
        this.syncTests();
        this.refreshSelection();
      };
      button.addEventListener("pointerenter", enter);
      button.addEventListener("pointerleave", leave);
      button.addEventListener("focus", enter);
      button.addEventListener("blur", leave);
      button.addEventListener("click", click);
      this.cleanups.push(() => {
        button.removeEventListener("pointerenter", enter);
        button.removeEventListener("pointerleave", leave);
        button.removeEventListener("focus", enter);
        button.removeEventListener("blur", leave);
        button.removeEventListener("click", click);
      });
    }
  }

  private syncTests(): void {
    const model = this.model;
    if (model === null) return;
    for (const button of this.tests) {
      button.setAttribute(
        "aria-pressed",
        String(this.pinned >= 0 && model.paths[this.pinned] === button.dataset.file),
      );
    }
  }

  /** A trace kept from the drawing itself (a click or a tap), told to assistive technology in one sentence. */
  private announce(v: number): void {
    if (v < 0) {
      this.status.textContent = "Trace cleared.";
      return;
    }
    const d = this.describeFile(v);
    this.status.textContent = `Traced ${d.path}. ${d.note}`;
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
    for (const c of this.cleanups) c();
    this.cleanups.length = 0;
    this.trigger = null;
    this.stage?.dispose();
    this.stage = null;
    this.fallback = null;
    this.labels.replaceChildren();
    this.leaders.replaceChildren();
    this.stageEl.removeAttribute("data-shade");
    this.stageEl.style.cursor = "";
    const data = this.html.dataset;
    delete data.kfilm;
    delete data.kfilmReady;
    delete data.kfilmLive;
    delete data.kfilmUnder;
    if ((window as unknown as { __kfilm?: Film }).__kfilm === this)
      delete (window as unknown as { __kfilm?: Film }).__kfilm;
  }
}
