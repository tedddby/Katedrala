import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  BOARD_MARGIN,
  BOARD_SLAB,
  LINE_WEIGHT_MAX,
  LINE_WEIGHT_MIN,
  MEDIUM_SPEC,
  WIDE_ASPECT,
  WIDE_SPEC,
} from "../facts";
import type { GraphDocument, Layout, PlanSpec, Structure } from "../model";
import {
  KIND_FOUNDATION,
  KIND_ISOLATED,
  analyze,
  carry,
  layout as layOut,
  loadPath,
} from "../model";
import { RECORD, sagLength, solveCatenary, straight } from "./catenary";
import { DOT } from "./layers";
import type { DrawingRenderer, RendererFactory } from "./layers";
import { Overlay } from "./overlay";
import type { Callout, Room } from "./overlay";
import { HangingSim, HELD } from "./sim";
import type { Box, Camera, Point } from "./view";
import {
  clamp01,
  easeInOutCubic,
  hangCamera,
  planCamera,
  project,
  span,
  standCamera,
  turnCamera,
} from "./view";

/**
 * The stage: Katedrala's analysis of CodeVerse, hung from its foundations, then turned over by the scroll.
 *
 * Time drives the hang (a physical simulation, see sim.ts). The scroll drives everything after it: the turn
 * about the board line through the plan, the standing elevation, the hatched ground and the load path of the
 * heaviest foundation. A pointer, a tap or the keyboard tests any member: its load path lights in load blue.
 */

export interface StageDom {
  readonly section: HTMLElement;
  readonly stage: HTMLElement;
  readonly figure: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: SVGSVGElement;
  readonly frames: {
    readonly hang: HTMLElement;
    readonly plan: HTMLElement;
    readonly stand: HTMLElement;
  };
  readonly view: HTMLElement | null;
  /** The angle of the turn, beside the view's name (empty when the drawing is not turned). */
  readonly angle: HTMLElement | null;
  readonly status: HTMLElement | null;
  /** The title block, which callouts keep clear of. */
  readonly titleBlock: HTMLElement | null;
  readonly live: HTMLElement;
}

export interface StageOptions {
  readonly data: GraphDocument;
  readonly renderer: RendererFactory;
  /** Reduced motion or no WebGL: the standing structure, still. */
  readonly still: boolean;
}

const WIDE = WIDE_SPEC;
const MEDIUM = MEDIUM_SPEC;
/** Board overhang beyond the outermost anchor, and its thickness, in level units. */
const MARGIN = BOARD_MARGIN;
const SLAB = BOARD_SLAB;
/** Self-weight of a chain, lines of code per level unit: how far a lightly loaded chain sags. */
const SAG_WEIGHT = 6;
/** The tallest reaction bar above the board, level units. */
const BAR_MAX = 1.45;
const STEP = 1 / 120;
/** A file that moved less than this since its chains were last solved (level units, far below a pixel) has not moved. */
const MOVED = 2e-4;

/** Scroll choreography, as shares of the pinned scroll. */
const TURN_A = 0.2;
const PLAN_A = 0.35;
const PLAN_B = 0.45;
const TURN_B = 0.6;
const TEST_A = 0.75;
const TEST_B = 0.92;

const CHALK: readonly [number, number, number] = [0xe9 / 255, 0xe6 / 255, 0xdf / 255];
const SOFT: readonly [number, number, number] = [0xb4 / 255, 0xb1 / 255, 0xa9 / 255];
const FAINT: readonly [number, number, number] = [0x8b / 255, 0x8e / 255, 0x92 / 255];
const GRAPHITE: readonly [number, number, number] = [0x5d / 255, 0x61 / 255, 0x66 / 255];
const LOAD: readonly [number, number, number] = [0x3e / 255, 0xa6 / 255, 0xff / 255];

const REL_NONE = 0;
const REL_SUPPORT = 1;
const REL_CARRIED = 2;
const REL_FOCUS = 3;

type FocusSource = "pointer" | "key" | "tap" | "demo";

interface Stats {
  firstFrame: number;
  frames: { t: number; dt: number; cpu: number; phase: string }[];
}

declare global {
  interface Window {
    __hangingModel?: Stats & { stage?: unknown };
  }
}

function readBox(el: HTMLElement, origin: DOMRect): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function mountStage(dom: StageDom, options: StageOptions): () => void {
  performance.mark("hanging-model:mount");
  const stage = new Stage(dom, options);
  return () => stage.dispose();
}

class Stage {
  private readonly s: Structure;
  private readonly renderer: DrawingRenderer;
  private readonly overlay: Overlay;
  private readonly cHeaviest: Callout;
  private readonly cCrown: Callout;
  private readonly cDemo: Callout;
  private readonly cFocus: Callout;
  private readonly heaviest: number;
  private readonly crown: number;
  private readonly maxFoundationLoad: number;
  private readonly stats: Stats & { stage?: unknown } = { firstFrame: 0, frames: [] };

  private spec: PlanSpec = WIDE;
  private l!: Layout;
  private sim!: HangingSim;
  private simDone = false;
  private acc = 0;
  private seenReleases = -1;
  private readonly loadNow: Float64Array;
  private readonly nodeLoadNow: Float64Array;
  private readonly geo: Float32Array;
  /** Each chain's catenary parameter from the last frame (a warm start for the next solve). */
  private readonly warm: Float64Array;
  /** Positions at the last solve, which files moved since, and which chains have been solved at all. */
  private readonly lastPos: Float64Array;
  private readonly moved: Uint8Array;
  private readonly solved: Uint8Array;
  /** The load each chain carried when it was last solved (its sag depends on it). */
  private readonly solvedLoad: Float64Array;
  private geoDirty = true;
  private styleDirty = true;
  private constructionCount = 0;
  private readonly bars: number[] = [];
  private barStart = 0;
  private axisStart = 0;
  private axisCount = 0;
  private slabStart = 0;
  private roomStart = 0;
  private roomCount = 0;

  private hang: Camera = { ox: 0, gy: 0, s: 1, theta: 0 };
  private plan: Camera = { ox: 0, gy: 0, s: 1, theta: Math.PI / 2 };
  private standCam: Camera = { ox: 0, gy: 0, s: 1, theta: Math.PI };
  private readonly cam: Camera = { ox: 0, gy: 0, s: 1, theta: 0 };
  private readonly pt: Point = { x: 0, y: 0, depth: 0 };
  private width = 1;
  private height = 1;
  /** Where callouts may be placed, in figure coordinates. */
  private room: Room = { frame: { left: 0, top: 0, right: 1, bottom: 1 }, avoid: [] };

  private target = 0;
  private progress = 0;
  private raf = 0;
  private last = 0;
  private visible = true;
  private disposed = false;
  private readonly trigger: ScrollTrigger;
  private readonly resizeObserver: ResizeObserver;
  private readonly intersection: IntersectionObserver;
  private readonly cleanups: (() => void)[] = [];

  /** The member under test and how its load path is shown. */
  private focus = -1;
  private focusSource: FocusSource | null = null;
  private readonly rel: Uint8Array;
  private readonly chainRel: Uint8Array;
  private readonly order: Int32Array;
  private readonly jointOrder: Int32Array;
  private carriedCount = 0;
  private supportCount = 0;
  private highlight = 0;
  private highlightTarget = 0;
  /** How far up the structure the load path is lit, in levels. */
  private front = 0;
  /** How fast the drawing is turning, 0 to 1 (1 at about a radian and a half per second), smoothed. */
  private turnSpeed = 0;
  private lastTheta = 0;
  private frontTarget = 0;
  private pointer = { x: -1, y: -1, t: 0, active: false };
  private down: { x: number; y: number; t: number; id: number } | null = null;
  private lastView = "";
  private lastAngle = "";
  private lastAngleActive = "";
  private lastStatus = "";
  private statusReleases = -1;
  private readonly keyOrder: number[];
  private readonly reducedMotion: boolean;

  constructor(
    private readonly dom: StageDom,
    private readonly options: StageOptions,
  ) {
    this.reducedMotion = options.still;
    const s = analyze(options.data);
    this.s = s;
    this.loadNow = new Float64Array(s.chainCount);
    this.nodeLoadNow = new Float64Array(s.n);
    this.geo = new Float32Array(s.chainCount * RECORD);
    this.warm = new Float64Array(s.chainCount);
    this.lastPos = new Float64Array(s.n * 3).fill(Infinity);
    this.moved = new Uint8Array(s.n);
    this.solved = new Uint8Array(s.chainCount);
    this.solvedLoad = new Float64Array(s.chainCount);
    this.rel = new Uint8Array(s.n);
    this.chainRel = new Uint8Array(s.chainCount);
    this.order = Int32Array.from({ length: s.chainCount }, (_, i) => i);
    this.jointOrder = Int32Array.from({ length: s.n }, (_, i) => i);
    let heaviest = s.foundations[0] ?? 0;
    for (const f of s.foundations) if (s.reach[f]! > s.reach[heaviest]!) heaviest = f;
    this.heaviest = heaviest;
    let crown = 0;
    for (let v = 0; v < s.n; v++) if (s.level[v]! > s.level[crown]!) crown = v;
    this.crown = crown;
    let maxF = 1;
    for (const f of s.foundations) maxF = Math.max(maxF, s.nodeLoad[f]!);
    this.maxFoundationLoad = maxF;
    this.keyOrder = Array.from({ length: s.n }, (_, i) => i).sort(
      (a, b) => s.level[a]! - s.level[b]! || s.reach[b]! - s.reach[a]! || a - b,
    );

    const constructionCapacity = 64 + 160 + s.foundations.length + 4 * 64;
    this.renderer = options.renderer(
      dom.canvas,
      { construction: constructionCapacity, chains: s.chainCount, joints: s.n },
      { sheet: [0x0e, 0x10, 0x12], load: [0x3e, 0xa6, 0xff] },
    );
    this.overlay = new Overlay(dom.overlay, s.maxLevel);
    this.cHeaviest = this.overlay.callout();
    this.cHeaviest.text(s.path[heaviest]!, `${s.reach[heaviest]} source files rest on it`);
    this.cCrown = this.overlay.callout();
    this.cCrown.text(s.path[crown]!, `level ${s.level[crown]}, the highest file`);
    this.cDemo = this.overlay.callout();
    this.cDemo.text(s.path[heaviest]!, `${s.reach[heaviest]} source files rest on it`);
    this.cFocus = this.overlay.callout({ size: 12 });

    this.stats.stage = this;
    window.__hangingModel = this.stats;

    gsap.registerPlugin(ScrollTrigger);
    this.trigger = ScrollTrigger.create({
      trigger: dom.section,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        this.target = self.progress;
        this.wake();
      },
      onRefresh: (self) => {
        this.target = self.progress;
        this.wake();
      },
    });
    this.target = this.trigger.progress;
    this.progress = this.target;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(dom.figure);
    this.intersection = new IntersectionObserver((entries) => {
      for (const entry of entries) this.visible = entry.isIntersecting;
      if (this.visible) this.wake();
    });
    this.intersection.observe(dom.section);
    this.bindInput();
    this.resize();
  }

  // -------------------------------------------------------------------------------------------------------
  // Layout and framing
  // -------------------------------------------------------------------------------------------------------

  private resize(): void {
    if (this.disposed) return;
    // Everything is measured in the figure's coordinates: the canvas and the overlay fill it.
    const origin = this.dom.figure.getBoundingClientRect();
    this.width = Math.max(1, origin.width);
    this.height = Math.max(1, origin.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(this.width, this.height, dpr);
    const boxes = {
      hang: readBox(this.dom.frames.hang, origin),
      plan: readBox(this.dom.frames.plan, origin),
      stand: readBox(this.dom.frames.stand, origin),
    };
    const spec = boxes.stand.width / Math.max(1, boxes.stand.height) >= WIDE_ASPECT ? WIDE : MEDIUM;
    // Callouts stay in the drawing's own part of the sheet, below the navigation, clear of the title block.
    const titleBlock = this.dom.titleBlock;
    const tb =
      titleBlock !== null && titleBlock.offsetParent !== null
        ? titleBlock.getBoundingClientRect()
        : null;
    // A phone's drawing band is narrow: labels one size down, so a full path fits beside its member.
    const small = this.width < 560;
    for (const callout of [this.cHeaviest, this.cCrown, this.cDemo])
      callout.resize(small ? 10 : 11);
    this.cFocus.resize(small ? 11 : 12);
    this.room = {
      // The level datum stands just left of the drawing's frames: callouts keep to the right of it.
      frame: {
        left: Math.max(4, boxes.hang.left + 4),
        top: 70,
        right: this.width - 6,
        bottom: this.height - 6,
      },
      avoid:
        tb === null
          ? []
          : [
              {
                left: tb.left - origin.left - 8,
                top: tb.top - origin.top - 8,
                right: tb.right - origin.left + 8,
                bottom: tb.bottom - origin.top + 8,
              },
            ],
    };
    if (this.l === undefined || spec !== this.spec) {
      this.spec = spec;
      this.l = layOut(this.s, spec);
      const fresh = new HangingSim(this.s, this.l);
      if (this.options.still || (this.sim !== undefined && this.simDone)) {
        fresh.finish();
        this.simDone = true;
      } else {
        this.simDone = false;
      }
      this.sim = fresh;
      this.seenReleases = -1;
      this.statusReleases = -1;
      this.acc = 0;
      this.warm.fill(0);
      this.lastPos.fill(Infinity);
      this.solved.fill(0);
      this.buildConstruction();
      this.overlay.rooms(this.l.strips.map((r) => ({ name: r.name, lines: r.lines })));
      this.geoDirty = true;
      this.styleDirty = true;
    }
    const width = spec.width + 2 * MARGIN;
    const levels = this.s.maxLevel + 0.5;
    const shift = (c: Camera): Camera => ({ ...c, ox: c.ox + MARGIN * c.s });
    this.hang = shift(hangCamera(boxes.hang, width, levels));
    const planCam = planCamera(boxes.plan, width, spec.depth + 0.6);
    this.plan = shift(planCam);
    this.standCam = shift(standCamera(boxes.stand, width, levels));
    this.styleDirty = true;
    this.wake(true);
  }

  /** Construction lines: the axis of the turn, the board, its rooms, and a reaction bar per foundation. */
  private buildConstruction(): void {
    const { s, l, spec } = this;
    const d = this.renderer.construction.data;
    let n = 0;
    const x0 = -MARGIN;
    const x1 = spec.width + MARGIN;
    const z0 = -spec.depth / 2;
    const z1 = spec.depth / 2;
    const line = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      straight(d, n * RECORD, ax, ay, az, bx, by, bz);
      n++;
      return n - 1;
    };
    // The axis of the turn: a chain line (long dash, short dash) along the board's centre line.
    this.axisStart = n;
    const long = 0.62;
    const short = 0.1;
    const gap = 0.16;
    for (let x = x0 - 0.9; x < x1 + 0.9; x += long + short + 2 * gap) {
      line(x, 0, 0, Math.min(x + long, x1 + 0.9), 0, 0);
      const sx = x + long + gap;
      if (sx + short < x1 + 0.9) line(sx, 0, 0, sx + short, 0, 0);
    }
    this.axisCount = n - this.axisStart;
    // The board: its underside (the plan, where the anchors hang), then its thickness.
    this.slabStart = n;
    line(x0, 0, z0, x1, 0, z0);
    line(x0, 0, z1, x1, 0, z1);
    line(x0, 0, z0, x0, 0, z1);
    line(x1, 0, z0, x1, 0, z1);
    line(x0, SLAB, z0, x1, SLAB, z0);
    line(x0, SLAB, z1, x1, SLAB, z1);
    line(x0, SLAB, z0, x0, SLAB, z1);
    line(x1, SLAB, z0, x1, SLAB, z1);
    line(x0, 0, z0, x0, SLAB, z0);
    line(x1, 0, z0, x1, SLAB, z0);
    line(x0, 0, z1, x0, SLAB, z1);
    line(x1, 0, z1, x1, SLAB, z1);
    // Rooms on the plan: strip boundaries (directory groups), then rooms (directories) inside them.
    this.roomStart = n;
    for (const strip of l.strips) line(strip.x0, 0, z0, strip.x0, 0, z1);
    for (const room of l.rooms)
      if (room.z0 > z0 + 1e-6) line(room.x0, 0, room.z0, room.x1, 0, room.z0);
    this.roomCount = n - this.roomStart;
    // A reaction bar above the board at every foundation (heights set as the load arrives).
    this.barStart = n;
    this.bars.length = 0;
    for (const f of s.foundations) {
      this.bars.push(f);
      line(
        l.target[f * 3]!,
        SLAB + 0.12,
        l.target[f * 3 + 2]!,
        l.target[f * 3]!,
        SLAB + 0.12,
        l.target[f * 3 + 2]!,
      );
    }
    this.constructionCount = n;
    this.renderer.construction.count = n;
  }

  // -------------------------------------------------------------------------------------------------------
  // Choreography
  // -------------------------------------------------------------------------------------------------------

  private thetaAt(p: number): number {
    if (this.options.still) return Math.PI;
    if (p <= TURN_A) return 0;
    if (p < PLAN_A) return (Math.PI / 2) * easeInOutCubic(span(p, TURN_A, PLAN_A));
    if (p <= PLAN_B) return Math.PI / 2;
    if (p < TURN_B) return Math.PI / 2 + (Math.PI / 2) * easeInOutCubic(span(p, PLAN_B, TURN_B));
    return Math.PI;
  }

  private viewName(theta: number): string {
    const base =
      theta >= Math.PI - 1e-3
        ? "Elevation, standing"
        : theta <= 1e-3
          ? "Elevation, hanging"
          : Math.abs(theta - Math.PI / 2) < 0.12
            ? "Plan of the board"
            : "Turning about the board line";
    // The file under test is named by its callout; the title block says what the blue lines are.
    return this.focus >= 0 && this.highlightTarget > 0 ? `${base}, load path` : base;
  }

  // -------------------------------------------------------------------------------------------------------
  // The loop
  // -------------------------------------------------------------------------------------------------------

  private wake(force = false): void {
    if (this.disposed || this.raf !== 0) return;
    if (!this.visible && !force) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = this.last === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const cpu0 = performance.now();
    const { s, sim } = this;
    let busy = false;

    // Scroll, smoothed a little so the turn has weight but never lags the hand.
    const ease = this.options.still ? 1 : 1 - Math.exp(-dt / 0.11);
    this.progress += (this.target - this.progress) * ease;
    if (Math.abs(this.target - this.progress) < 2e-4) this.progress = this.target;
    else busy = true;
    const p = this.progress;
    const theta = this.thetaAt(p);
    const turnRate = Math.min(1, Math.abs(theta - this.lastTheta) / Math.max(dt, 1e-3) / 1.4);
    this.lastTheta = theta;
    this.turnSpeed += (turnRate - this.turnSpeed) * (1 - Math.exp(-dt / 0.12));
    if (this.turnSpeed < 0.004 && turnRate === 0) this.turnSpeed = 0;
    else busy = true;

    // The hang: fixed steps, faster once the reader moves on.
    if (!this.simDone) {
      const speed = this.target > 0.05 ? 4 : 1;
      this.acc += dt * speed;
      let steps = 0;
      while (this.acc >= STEP && steps < 10 * speed) {
        sim.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 10 * speed) this.acc = 0;
      if (sim.settled) {
        sim.finish();
        this.simDone = true;
      }
      this.geoDirty = true;
      busy = true;
    }
    if (sim.releases !== this.seenReleases) {
      this.seenReleases = sim.releases;
      carry(s, sim.weight, this.loadNow, this.nodeLoadNow);
      this.styleDirty = true;
    }

    // The scroll's own test: the heaviest foundation, its load path rising with the scroll.
    // Still (reduced motion, or no WebGL): no scroll-driven test; the reader tests members by hand.
    const testing = !this.options.still && theta >= Math.PI - 1e-3 && p >= TEST_A - 0.02;
    if (testing && (this.focusSource === null || this.focusSource === "demo")) {
      if (this.focus !== this.heaviest || this.focusSource !== "demo")
        this.setFocus(this.heaviest, "demo");
      const front = (s.maxLevel + 1.2) * span(p, TEST_A, TEST_B);
      if (front !== this.front) {
        this.front = this.frontTarget = front;
        this.styleDirty = true;
      }
    } else if (!testing && this.focusSource === "demo") {
      this.setFocus(-1, null);
    }

    // Highlight and the rising front for a member under test.
    const hlRate = dt / (this.highlightTarget > this.highlight ? 0.16 : 0.12);
    if (this.highlight !== this.highlightTarget) {
      this.highlight =
        this.highlightTarget > this.highlight
          ? Math.min(this.highlightTarget, this.highlight + hlRate)
          : Math.max(this.highlightTarget, this.highlight - hlRate);
      if (this.highlight === 0 && this.highlightTarget === 0) this.clearRelations();
      this.styleDirty = true;
      busy = true;
    }
    if (this.front !== this.frontTarget) {
      const rate = (s.maxLevel + 1) / 0.45;
      this.front = Math.min(this.frontTarget, this.front + rate * dt);
      this.styleDirty = true;
      busy = true;
    }

    // Camera: the hanging framing (which moves on phones as the copy leaves), through the plan, to standing.
    turnCamera(this.hang, this.plan, this.standCam, theta, this.cam);
    if (this.options.still) Object.assign(this.cam, this.standCam);

    if (this.geoDirty) this.writeGeometry();
    if (this.geoDirty || this.styleDirty) {
      this.writeChains();
      this.writeJoints();
    }
    this.writeConstruction(theta);
    this.geoDirty = false;
    this.styleDirty = false;

    // Depth range of the model in this view, for the "beyond" line weight.
    const c = Math.cos(theta);
    const si = Math.sin(theta);
    const yLow = -s.maxLevel - 0.5;
    const yHigh = SLAB + BAR_MAX;
    const zHalf = this.spec.depth / 2;
    let near = -Infinity;
    let far = Infinity;
    for (const y of [yLow, yHigh]) {
      for (const z of [-zHalf, zHalf]) {
        const depth = y * si + z * c;
        near = Math.max(near, depth);
        far = Math.min(far, depth);
      }
    }
    // In plan the chains hang beyond the board: drawn quieter, so the bays of the plan read first.
    const planQuiet = span(Math.sin(theta), 0.82, 1) ** 2;
    this.renderer.render(this.cam, [far, near], 1 - 0.62 * planQuiet);
    this.writeOverlay(p, theta);
    this.writeTitle(theta);

    const cpu = performance.now() - cpu0;
    if (this.stats.firstFrame === 0) {
      this.stats.firstFrame = performance.now();
      performance.mark("hanging-model:first-frame");
    }
    const phase = !this.simDone ? "hang" : theta > 1e-3 && theta < Math.PI - 1e-3 ? "turn" : "rest";
    if (this.stats.frames.length > 4000) this.stats.frames.splice(0, 2000);
    this.stats.frames.push({ t: now, dt: dt * 1000, cpu, phase });

    if (busy || this.pointer.active) this.wake();
  };

  // -------------------------------------------------------------------------------------------------------
  // Records
  // -------------------------------------------------------------------------------------------------------

  /**
   * Catenary of every chain between the current positions of its ends. A chain is solved again only when an
   * end has moved or the loads have changed since its last solve; a model coming to rest costs less and less.
   */
  private writeGeometry(): void {
    const { s, sim, l, geo, lastPos, moved, solved } = this;
    const pos = sim.pos;
    for (let v = 0; v < s.n; v++) {
      const i = v * 3;
      const m =
        Math.abs(pos[i]! - lastPos[i]!) > MOVED ||
        Math.abs(pos[i + 1]! - lastPos[i + 1]!) > MOVED ||
        Math.abs(pos[i + 2]! - lastPos[i + 2]!) > MOVED;
      moved[v] = m ? 1 : 0;
      if (m) {
        lastPos[i] = pos[i]!;
        lastPos[i + 1] = pos[i + 1]!;
        lastPos[i + 2] = pos[i + 2]!;
      }
    }
    const loads = this.loadNow;
    const solvedLoad = this.solvedLoad;
    for (let c = 0; c < s.chainCount; c++) {
      if (sim.state[s.dependent[c]!] === HELD) continue;
      const still = moved[s.dependent[c]!] === 0 && moved[s.dependency[c]!] === 0;
      if (solved[c] === 1 && still && loads[c] === solvedLoad[c]) continue;
      solved[c] = 1;
      solvedLoad[c] = loads[c]!;
      const a = s.dependency[c]! * 3;
      const b = s.dependent[c]! * 3;
      const ax = pos[a]!;
      const ay = pos[a + 1]!;
      const az = pos[a + 2]!;
      const bx = pos[b]!;
      const by = pos[b + 1]!;
      const bz = pos[b + 2]!;
      let length = l.rest[c]!;
      if (s.inCycle[c] === 0) {
        const h = Math.hypot(bx - ax, bz - az);
        const v = by - ay;
        const tension = (Math.max(this.loadNow[c]!, 1) * h) / Math.max(1e-6, Math.abs(v));
        const sagged = sagLength(h, v, tension, SAG_WEIGHT);
        length = Math.max(length, Math.min(sagged, length * 1.08));
      }
      solveCatenary(geo, c * RECORD, ax, ay, az, bx, by, bz, length, this.warm, c);
    }
  }

  private writeChains(): void {
    const { s, sim, geo } = this;
    const layer = this.renderer.chains;
    const d = layer.data;
    const wMax = this.width < 900 ? LINE_WEIGHT_MAX.narrow : LINE_WEIGHT_MAX.wide;
    const maxLoad = s.maxChainLoad;
    const hl = this.highlight;
    const dim = 1 - 0.84 * hl;
    for (let i = 0; i < s.chainCount; i++) {
      const c = this.order[i]!;
      const o = i * RECORD;
      const g = c * RECORD;
      for (let k = 0; k < 9; k++) d[o + k] = geo[g + k]!;
      const dependent = s.dependent[c]!;
      const born = sim.releaseAt[dependent]!;
      const reveal = sim.state[dependent] === HELD ? 0 : clamp01((sim.time - born) / 0.14);
      const load = this.loadNow[c]!;
      let width = Math.max(LINE_WEIGHT_MIN, wMax * Math.sqrt(load / maxLoad));
      if (s.inCycle[c] === 1) width = 0.5;
      let alpha = 0.92 * reveal;
      let lit = 0;
      const colour = CHALK;
      const rel = this.chainRel[c]!;
      if (rel === REL_NONE) {
        alpha *= dim;
      } else if (rel === REL_SUPPORT) {
        width = Math.max(width, 0.55 + 0.6 * hl);
        alpha = Math.min(1, alpha * (1 + 0.1 * hl));
      } else {
        width = Math.max(width, 0.7 + 0.8 * hl);
        const lo = s.level[s.dependency[c]!]!;
        const hi = s.level[dependent]!;
        lit = hi > lo ? clamp01((this.front - lo) / (hi - lo)) : this.front >= hi ? 1 : 0;
        lit = lit * (hl > 0 ? 1 : 0);
      }
      d[o + 9] = width;
      d[o + 10] = alpha;
      d[o + 11] = lit;
      d[o + 12] = colour[0];
      d[o + 13] = colour[1];
      d[o + 14] = colour[2];
      d[o + 15] = 1;
    }
    layer.count = s.chainCount;
    layer.upload();
  }

  private writeJoints(): void {
    const { s, sim } = this;
    const layer = this.renderer.joints;
    const d = layer.data;
    const pos = sim.pos;
    const hl = this.highlight;
    const dim = 1 - 0.8 * hl;
    const small = this.width < 700;
    for (let i = 0; i < s.n; i++) {
      const v = this.jointOrder[i]!;
      const o = i * DOT;
      d[o] = pos[v * 3]!;
      d[o + 1] = pos[v * 3 + 1]!;
      d[o + 2] = pos[v * 3 + 2]!;
      const kind = s.kind[v]!;
      const pin = kind === KIND_FOUNDATION || kind === KIND_ISOLATED;
      const lines = s.lines[v]!;
      let radius = pin ? 2.1 + Math.sqrt(lines) / 12 : 0.85 + Math.sqrt(lines) / 9.5;
      if (small) radius *= 0.86;
      const reveal = pin
        ? 1
        : sim.state[v] === HELD
          ? 0
          : clamp01((sim.time - sim.releaseAt[v]!) / 0.1);
      let colour = kind === KIND_ISOLATED ? FAINT : CHALK;
      let alpha = reveal;
      const rel = this.rel[v]!;
      if (rel === REL_NONE) alpha *= dim;
      else if (rel === REL_FOCUS) {
        colour = mixColour(CHALK, LOAD, hl);
        radius += 1.2 * hl;
      } else if (rel === REL_CARRIED && this.front >= s.level[v]! && hl > 0) {
        colour = mixColour(CHALK, LOAD, hl);
      }
      d[o + 3] = radius;
      d[o + 4] = colour[0];
      d[o + 5] = colour[1];
      d[o + 6] = colour[2];
      d[o + 7] = alpha;
      d[o + 8] = pin && rel !== REL_FOCUS ? 1 : 0;
      d[o + 9] = 1.25;
      d[o + 10] = 0;
      d[o + 11] = 0;
    }
    layer.count = s.n;
    layer.upload();
  }

  private writeConstruction(theta: number): void {
    const d = this.renderer.construction.data;
    const turning = Math.sin(theta) ** 2;
    const planShow = span(Math.sin(theta), 0.82, 1) ** 2;
    const hangShow = theta < Math.PI / 2 ? Math.cos(theta) ** 2 : 0;
    const standing = span(theta, 0.8 * Math.PI, Math.PI);
    const set = (
      i: number,
      width: number,
      alpha: number,
      colour: readonly [number, number, number],
      fade = 1,
    ) => {
      const o = i * RECORD;
      d[o + 9] = width;
      d[o + 10] = alpha;
      d[o + 11] = 0;
      d[o + 12] = colour[0];
      d[o + 13] = colour[1];
      d[o + 14] = colour[2];
      d[o + 15] = fade;
    };
    // The axis: a centre line while the drawing is off its elevations (at rest the board line takes its place),
    // heavier and in load blue only while the drawing is turning about it.
    const axisColour = mixColour(FAINT, LOAD, this.turnSpeed);
    for (let i = 0; i < this.axisCount; i++)
      set(this.axisStart + i, 1.15 + 0.6 * this.turnSpeed, Math.min(1, turning * 2.2), axisColour, 0);
    // The board: underside heavy (the board line, then the ground line), thickness light and gone once standing.
    for (let k = 0; k < 4; k++) set(this.slabStart + k, k < 2 ? 1.6 : 1.1, 1, CHALK, 0.6);
    for (let k = 4; k < 12; k++) set(this.slabStart + k, 0.75, 0.6 * (1 - standing), SOFT, 0.6);
    // Rooms, only around the plan.
    const strips = this.l.strips.length;
    for (let k = 0; k < this.roomCount; k++) {
      const strip = k < strips;
      set(
        this.roomStart + k,
        strip ? 0.9 : 0.6,
        (strip ? 0.85 : 0.7) * planShow,
        strip ? FAINT : GRAPHITE,
        0,
      );
    }
    // Reaction bars: the load each foundation carries right now.
    const scale = BAR_MAX / this.maxFoundationLoad;
    this.bars.forEach((f, k) => {
      const i = this.barStart + k;
      const o = i * RECORD;
      const height = this.nodeLoadNow[f]! * scale;
      d[o + 1] = SLAB + 0.12;
      d[o + 5] = SLAB + 0.12 + Math.max(0.02, height);
      set(
        i,
        1.25,
        0.8 * hangShow,
        f === this.heaviest && this.highlight > 0 && this.focus === f ? LOAD : CHALK,
        0,
      );
    });
    this.renderer.construction.count = this.constructionCount;
    this.renderer.construction.upload();
  }

  // -------------------------------------------------------------------------------------------------------
  // Annotations
  // -------------------------------------------------------------------------------------------------------

  private writeOverlay(p: number, theta: number): void {
    const { s, cam, pt, sim } = this;
    const pos = sim.pos;
    const atRest = Math.abs(Math.cos(theta));
    const hanging = theta < Math.PI / 2;

    // Ground hatch, drawn in as the turn completes.
    const reveal = this.options.still ? 1 : easeInOutCubic(span(theta, 0.86 * Math.PI, Math.PI));
    const left = project(cam, -MARGIN, 0, 0, pt).x;
    const right = project(cam, this.spec.width + MARGIN, 0, 0, pt).x;
    this.overlay.ground(
      left,
      right,
      cam.gy,
      this.width < 700 ? 10 : 14,
      theta > Math.PI / 2 ? reveal : 0,
    );

    // Level datums, left of the board.
    const datumX = project(cam, -MARGIN - 0.55, 0, 0, pt).x;
    const hangAge = this.options.still ? 1 : clamp01((sim.time - 0.1) / 0.6);
    this.overlay.datums(
      datumX,
      (L) => project(cam, 0, -L, 0, pt).y,
      span(atRest, 0.94, 1) * hangAge,
    );

    // While turned, the datum gives way to the drafting mark of the turn: a revolution arrow on the axis, swept
    // through the angle turned so far.
    const turnShow = this.options.still ? 0 : span(Math.sin(theta), 0.35, 0.7);
    this.overlay.turn(datumX, cam.gy, theta, turnShow, this.turnSpeed);

    // The plan's dimension chain: one bay per directory group, above the board's far edge.
    const strips = this.l.strips;
    const edges: number[] = [];
    for (const strip of strips) edges.push(project(cam, strip.x0, 0, 0, pt).x);
    const lastStrip = strips[strips.length - 1];
    if (lastStrip !== undefined) edges.push(project(cam, lastStrip.x1, 0, 0, pt).x);
    const farEdge = project(cam, 0, 0, -this.spec.depth / 2, pt).y;
    this.overlay.plan(edges, farEdge - 18, span(Math.sin(theta), 0.9, 1) ** 2);

    // The heaviest foundation, above its reaction bar, while hanging.
    const h = this.heaviest;
    const barTop = SLAB + 0.12 + (this.nodeLoadNow[h]! * BAR_MAX) / this.maxFoundationLoad;
    project(cam, pos[h * 3]!, barTop, pos[h * 3 + 2]!, pt);
    const heavyShow = hanging
      ? span(Math.cos(theta), 0.97, 1) * clamp01((sim.time - 1.2) / 0.5)
      : 0;
    const toRight = pt.x < this.width * 0.72;
    this.cHeaviest.place(
      pt.x,
      pt.y,
      toRight ? 18 : -18,
      -10,
      this.options.still ? 0 : heavyShow,
      this.room,
      true,
    );

    // The highest file, once standing.
    project(cam, pos[this.crown * 3]!, pos[this.crown * 3 + 1]!, pos[this.crown * 3 + 2]!, pt);
    const crownRight = pt.x < this.width * 0.7;
    const standShow = theta > Math.PI / 2 ? span(theta, 0.9 * Math.PI, Math.PI) : 0;
    const testShow = span(p, TEST_A - 0.04, TEST_A - 0.01);
    const crownShow =
      standShow *
      (1 - testShow) *
      (this.focusSource === "demo" || this.focusSource === null ? 1 : 0);
    this.cCrown.place(pt.x, pt.y, crownRight ? 22 : -22, -16, crownShow, this.room, true);

    // The scroll's test: the heaviest foundation on the ground.
    project(cam, pos[h * 3]!, pos[h * 3 + 1]!, pos[h * 3 + 2]!, pt);
    const demoRight = pt.x < this.width * 0.7;
    const demoShow = this.focusSource === "demo" ? this.highlight * standShow : 0;
    this.cDemo.place(pt.x, pt.y + 2, demoRight ? 20 : -20, 30, demoShow, this.room);

    // The member under the pointer, the finger or the keyboard.
    if (this.focus >= 0 && this.focusSource !== "demo") {
      const v = this.focus;
      project(cam, pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!, pt);
      const right = pt.x < this.width * 0.62;
      const up = pt.y > this.height * 0.3;
      this.cFocus.place(pt.x, pt.y, right ? 20 : -20, up ? -22 : 26, this.highlight, this.room);
    } else {
      this.cFocus.place(0, 0, 0, 0, 0);
    }
  }

  private writeTitle(theta: number): void {
    const view = this.viewName(theta);
    if (view !== this.lastView && this.dom.view !== null) {
      this.dom.view.textContent = view;
      this.lastView = view;
    }
    // The angle of the turn, a measured value: in load blue only while the drawing is turning.
    const angleEl = this.dom.angle;
    if (angleEl !== null) {
      const turned = theta > 1e-3 && theta < Math.PI - 1e-3;
      const angle = turned ? `${Math.round((theta * 180) / Math.PI)}°` : "";
      if (angle !== this.lastAngle) {
        angleEl.textContent = angle;
        this.lastAngle = angle;
      }
      const active = turned && this.turnSpeed > 0.15 ? "1" : "0";
      if (active !== this.lastAngleActive) {
        angleEl.dataset.active = active;
        this.lastAngleActive = active;
      }
    }
    // The count of hung files only changes when a file is released.
    if (this.dom.status !== null && this.sim.releases !== this.statusReleases) {
      this.statusReleases = this.sim.releases;
      let hung = 0;
      for (let v = 0; v < this.s.n; v++) if (this.sim.state[v] !== HELD) hung++;
      const status =
        hung >= this.s.n
          ? `${fmt(this.s.n)} files, ${fmt(this.s.chainCount)} chains`
          : `Hanging ${fmt(hung)} of ${fmt(this.s.n)} files`;
      if (status !== this.lastStatus) {
        this.dom.status.textContent = status;
        this.lastStatus = status;
      }
    }
  }

  // -------------------------------------------------------------------------------------------------------
  // Testing a member
  // -------------------------------------------------------------------------------------------------------

  private clearRelations(): void {
    this.rel.fill(REL_NONE);
    this.chainRel.fill(REL_NONE);
    for (let i = 0; i < this.order.length; i++) this.order[i] = i;
    for (let i = 0; i < this.jointOrder.length; i++) this.jointOrder[i] = i;
    this.carriedCount = 0;
    this.supportCount = 0;
  }

  /**
   * Tests member `v` (or clears the test, `v` < 0). `instant` skips the fade and the rising front: a keyboard
   * walk through the members repeats often, so it answers at once.
   */
  private setFocus(v: number, source: FocusSource | null, instant = source === "key"): void {
    const { s } = this;
    if (v === this.focus && source === this.focusSource) return;
    this.focus = v;
    this.focusSource = v < 0 ? null : source;
    if (v < 0) {
      this.highlightTarget = 0;
      if (instant) {
        this.highlight = 0;
        this.clearRelations();
      }
      this.styleDirty = true;
      this.wake();
      return;
    }
    const { above, below } = loadPath(s, v);
    this.rel.fill(REL_NONE);
    for (const u of above) this.rel[u] = REL_CARRIED;
    for (const u of below) this.rel[u] = REL_SUPPORT;
    this.rel[v] = REL_FOCUS;
    this.chainRel.fill(REL_NONE);
    for (let c = 0; c < s.chainCount; c++) {
      const ra = this.rel[s.dependent[c]!]!;
      const rb = this.rel[s.dependency[c]!]!;
      // What rests on the member: chains among the files above it, and the chains that hang on it.
      if (ra === REL_CARRIED && (rb === REL_CARRIED || rb === REL_FOCUS))
        this.chainRel[c] = REL_CARRIED;
      // What it rests on: chains from it, and among the files below it, down to the foundations.
      else if ((ra === REL_SUPPORT || ra === REL_FOCUS) && rb === REL_SUPPORT)
        this.chainRel[c] = REL_SUPPORT;
    }
    // Draw order: what is tested last, on top.
    const rank = (c: number) => this.chainRel[c]!;
    const chains = Array.from({ length: s.chainCount }, (_, i) => i).sort(
      (x, y) => rank(x) - rank(y) || x - y,
    );
    chains.forEach((c, i) => (this.order[i] = c));
    const joints = Array.from({ length: s.n }, (_, i) => i).sort(
      (x, y) => this.rel[x]! - this.rel[y]! || x - y,
    );
    joints.forEach((u, i) => (this.jointOrder[i] = u));
    this.carriedCount = above.size;
    this.supportCount = below.size;

    this.highlightTarget = 1;
    if (instant) this.highlight = 1;
    if (source === "demo") {
      this.front = 0;
      this.frontTarget = 0;
    } else {
      this.front = this.reducedMotion || instant ? s.maxLevel + 1 : s.level[v]!;
      this.frontTarget = s.maxLevel + 1;
    }
    if (source !== "demo") {
      const level = s.level[v]!;
      const kind = s.kind[v];
      // "Carries" counts the source files resting on the member, directly or through others.
      const detail =
        kind === KIND_FOUNDATION
          ? `foundation, carries ${above.size}`
          : kind === KIND_ISOLATED
            ? "isolated, no runtime dependencies"
            : `level ${level}, rests on ${below.size}, carries ${above.size}`;
      this.cFocus.text(s.path[v]!, detail);
      const sentence =
        `${s.path[v]}: ${kind === KIND_FOUNDATION ? "a foundation, level 0" : `level ${level}`}. ` +
        `It rests on ${below.size} source ${below.size === 1 ? "file" : "files"}; ` +
        `${above.size} source ${above.size === 1 ? "file rests" : "files rest"} on it.`;
      if (source === "key" || source === "tap") this.dom.live.textContent = sentence;
    }
    this.styleDirty = true;
    this.wake();
  }

  /** The member nearest to a screen point, within `radius` CSS px. */
  private pick(x: number, y: number, radius: number): number {
    const { s, sim, cam, pt } = this;
    let best = -1;
    let bestD = radius * radius;
    for (let v = 0; v < s.n; v++) {
      if (sim.state[v] === HELD) continue;
      project(cam, sim.pos[v * 3]!, sim.pos[v * 3 + 1]!, sim.pos[v * 3 + 2]!, pt);
      const dx = pt.x - x;
      const dy = pt.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = v;
      }
    }
    return best;
  }

  private bindInput(): void {
    const { figure } = this.dom;
    const local = (event: PointerEvent) => {
      const r = this.dom.figure.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const { x, y } = local(event);
      const now = performance.now();
      // A quick sweep through the hanging model brushes the chains: the weights swing and find the form again.
      if (this.pointer.active && !this.options.still && this.cam.theta < 0.35) {
        const dtp = Math.max(8, now - this.pointer.t) / 1000;
        const vx = (x - this.pointer.x) / dtp;
        const vy = (y - this.pointer.y) / dtp;
        const speed = Math.hypot(vx, vy);
        if (speed > 650) this.brush(x, y, vx, vy);
      }
      this.pointer = { x, y, t: now, active: true };
      const hit = this.pick(x, y, 14);
      const keep =
        this.focus >= 0 && this.focusSource === "pointer" && this.pick(x, y, 22) === this.focus;
      if (hit >= 0 && hit !== this.focus) this.setFocus(hit, "pointer");
      else if (hit < 0 && !keep && this.focusSource === "pointer") this.setFocus(-1, null);
    };
    const onLeave = () => {
      this.pointer.active = false;
      if (this.focusSource === "pointer") this.setFocus(-1, null);
    };
    const onDown = (event: PointerEvent) => {
      const { x, y } = local(event);
      this.down = { x, y, t: performance.now(), id: event.pointerId };
    };
    const onUp = (event: PointerEvent) => {
      const down = this.down;
      this.down = null;
      if (down === null || down.id !== event.pointerId || event.pointerType !== "touch") return;
      const { x, y } = local(event);
      if (Math.hypot(x - down.x, y - down.y) > 10 || performance.now() - down.t > 450) return;
      const hit = this.pick(x, y, 24);
      if (hit >= 0)
        this.setFocus(hit === this.focus && this.focusSource === "tap" ? -1 : hit, "tap");
      else if (this.focusSource === "tap") this.setFocus(-1, null);
    };
    const onKey = (event: KeyboardEvent) => {
      const { s } = this;
      const current = this.focusSource === "key" ? this.focus : -1;
      let next = -1;
      const standing = this.cam.theta > Math.PI / 2;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const i = current < 0 ? -1 : this.keyOrder.indexOf(current);
        const step = event.key === "ArrowRight" ? 1 : -1;
        next = this.keyOrder[(i + step + this.keyOrder.length) % this.keyOrder.length]!;
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const from = current < 0 ? this.heaviest : current;
        const dir = (event.key === "ArrowUp") === standing ? 1 : -1;
        const level = s.level[from]! + dir;
        let best = -1;
        let bestD = Infinity;
        for (let v = 0; v < s.n; v++) {
          if (s.level[v] !== level) continue;
          const dx = Math.abs(this.sim.pos[v * 3]! - this.sim.pos[from * 3]!);
          if (dx < bestD) {
            bestD = dx;
            best = v;
          }
        }
        next = best >= 0 ? best : from;
      } else if (event.key === "Home") next = this.heaviest;
      else if (event.key === "End") next = this.crown;
      else if (event.key === "Escape") {
        if (this.focusSource === "key") this.setFocus(-1, null, true);
        return;
      } else return;
      event.preventDefault();
      this.setFocus(next, "key");
    };
    const onFocus = () => {
      if (figure.matches(":focus-visible") && this.focusSource !== "key")
        this.setFocus(this.heaviest, "key");
    };
    const onBlur = () => {
      if (this.focusSource === "key") this.setFocus(-1, null, true);
    };
    figure.addEventListener("pointermove", onMove);
    figure.addEventListener("pointerleave", onLeave);
    figure.addEventListener("pointerdown", onDown);
    figure.addEventListener("pointerup", onUp);
    figure.addEventListener("keydown", onKey);
    figure.addEventListener("focus", onFocus);
    figure.addEventListener("blur", onBlur);
    this.cleanups.push(() => {
      figure.removeEventListener("pointermove", onMove);
      figure.removeEventListener("pointerleave", onLeave);
      figure.removeEventListener("pointerdown", onDown);
      figure.removeEventListener("pointerup", onUp);
      figure.removeEventListener("keydown", onKey);
      figure.removeEventListener("focus", onFocus);
      figure.removeEventListener("blur", onBlur);
    });
  }

  /** Push the weights near a fast pointer sideways (model units per second). */
  private brush(x: number, y: number, vx: number, vy: number): void {
    const { s, sim, cam, pt } = this;
    const reach = 46;
    let pushed = false;
    for (let v = 0; v < s.n; v++) {
      if (sim.state[v] !== 1) continue;
      project(cam, sim.pos[v * 3]!, sim.pos[v * 3 + 1]!, sim.pos[v * 3 + 2]!, pt);
      const d = Math.hypot(pt.x - x, pt.y - y);
      if (d > reach) continue;
      const fall = 1 - d / reach;
      sim.push(v, ((vx / cam.s) * 0.1 + (vy / cam.s) * 0.02) * fall, 0, STEP);
      pushed = true;
    }
    if (pushed && this.simDone) {
      this.simDone = false;
      this.wake();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.trigger.kill();
    this.resizeObserver.disconnect();
    this.intersection.disconnect();
    for (const fn of this.cleanups) fn();
    this.renderer.dispose();
    if (window.__hangingModel?.stage === this) delete window.__hangingModel.stage;
  }
}

function mixColour(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
