/**
 * Act I, "See what your code stands on.", as an act: its camera, what it lights, and its overlay (the hero, the
 * turning word, the crop marks, the level gauge, the labels on the drawing). Its beats keep their own BEAT table in
 * local t (timeline.ts); its captions are server-rendered (Film.tsx) and shown by the director like every act's.
 * Also the default trace every act inherits: a traced file lights what it stands on, or, for a foundation, what
 * rests on it.
 */
import type {
  ActContext,
  ActDefinition,
  ActLabel,
  ActOverlay,
  LitMask,
  ScreenPoint,
  TraceView,
} from "./act";
import { fileNote } from "./copy/hanging";
import {
  formatCount,
  loadPathOf,
  PLAN_MINOR,
  PLAN_RADIUS,
  type HangingModel,
  type LoadPath,
} from "./model";
import {
  BEAT,
  hangCameraKeys,
  modelHeight,
  stillCamera,
  turnAxis,
  turnOf,
  window01,
} from "./timeline";

/* ------------------------------------------------------------------------------------------------------------
 * Load paths, computed once per file and model.
 * ---------------------------------------------------------------------------------------------------------- */

const paths = new WeakMap<HangingModel, Map<number, LoadPath>>();

/** What file v stands on and what rests on it (cached). */
export function loadPath(model: HangingModel, v: number): LoadPath {
  let byFile = paths.get(model);
  if (byFile === undefined) {
    byFile = new Map();
    paths.set(model, byFile);
  }
  let path = byFile.get(v);
  if (path === undefined) {
    path = loadPathOf(model, v);
    byFile.set(v, path);
  }
  return path;
}

/**
 * The default trace: what file v stands on (or hangs from, before the turn), down to the foundations; a foundation
 * stands on nothing but the ground, so it lights the load it carries, everything resting on it.
 */
export function defaultTrace(model: HangingModel, v: number, standing: boolean): TraceView {
  const path = loadPath(model, v);
  const foundation = path.supportCount === 0;
  const nodes = Uint8Array.from(foundation ? path.carriedBy : path.supports);
  nodes[v] = 1;
  return {
    mask: { nodes, edges: foundation ? path.above : path.below, dim: 0.8 },
    note: fileNote(model, v, path, standing),
  };
}

/* ------------------------------------------------------------------------------------------------------------
 * What Act I lights: the longest load path during the climb, the crown and what it stands on at the hold.
 * ---------------------------------------------------------------------------------------------------------- */

const masks = new WeakMap<HangingModel, { spine: LitMask; crown: LitMask }>();

function masksOf(model: HangingModel): { spine: LitMask; crown: LitMask } {
  let m = masks.get(model);
  if (m === undefined) {
    const spineNodes = new Uint8Array(model.n);
    const spineEdges = new Uint8Array(model.m);
    const spine = model.spine;
    for (const s of spine) spineNodes[s] = 1;
    for (let k = 0; k < model.m; k++) {
      const i = spine.indexOf(model.edgeA[k]!);
      if (i > 0 && spine[i - 1] === model.edgeB[k]) spineEdges[k] = 1;
    }
    const crown = loadPath(model, model.crown);
    const crownNodes = Uint8Array.from(crown.supports);
    crownNodes[model.crown] = 1;
    m = {
      // The climb keeps the structure around the path in view; the hold steps it back further.
      spine: { nodes: spineNodes, edges: spineEdges, dim: 0.18 },
      crown: { nodes: crownNodes, edges: crown.below, dim: 0.5 },
    };
    masks.set(model, m);
  }
  return m;
}

/* ------------------------------------------------------------------------------------------------------------
 * The overlay.
 * ---------------------------------------------------------------------------------------------------------- */

/**
 * The plan beat names the directories the foundations are set out by: the boundaries Katedrala records today
 * (modules are planned for v1, and the narration says so). At most this many, the largest first.
 */
const FOLDERS = 8;

interface Annotation {
  readonly label: ActLabel;
  node: number;
  /** A point on the board instead of a file (model space, hanging: the board is y = 0). */
  readonly at?: readonly [number, number, number];
  readonly from: number;
  readonly to: number;
  readonly wideOnly: boolean;
  /** Follows the climb: the file of the load path at the camera's level. */
  readonly climb: boolean;
  /** Shown in the still drawing (the crown). */
  readonly still: boolean;
}

function setOn(el: Element, on: boolean): void {
  if (on) el.setAttribute("data-on", "");
  else el.removeAttribute("data-on");
}

const SVG = "http://www.w3.org/2000/svg";

class HangOverlay implements ActOverlay {
  private readonly ctx: ActContext;
  private readonly film: boolean;
  private readonly hero: HTMLElement | null;
  private readonly turning: HTMLElement[];
  private readonly gauge: HTMLElement | null;
  private readonly levelText: HTMLElement | null;
  private readonly ticks: HTMLElement[];
  private readonly annotations: Annotation[] = [];
  private crop: SVGPathElement | null = null;
  private heroOn = true;
  private gaugeOn = false;
  private shadeOn = false;
  private cropOn = false;
  private level = -1;
  private turnShown = -1;
  /** How far the turning word rises at mid-turn so that, upright on its end, it clears the line below (px). */
  private turnLift = -1;
  private width = -1;
  private readonly corners: ScreenPoint[] = [0, 1, 2, 3].map(() => ({
    x: 0,
    y: 0,
    depth: 0,
    visible: false,
  }));

  constructor(ctx: ActContext) {
    this.ctx = ctx;
    this.film = ctx.mode === "film";
    const root = ctx.root;
    this.hero = root.querySelector<HTMLElement>("[data-film-hero]");
    this.turning = [...root.querySelectorAll<HTMLElement>("[data-turns]")];
    this.gauge = root.querySelector<HTMLElement>("[data-film-gauge]");
    this.levelText = root.querySelector<HTMLElement>("[data-film-level]");
    this.ticks = [...root.querySelectorAll<HTMLElement>("[data-tick]")].sort(
      (a, b) => Number(a.dataset.tick) - Number(b.dataset.tick),
    );
    if (this.hero !== null) setOn(this.hero, true);
    this.buildAnnotations();
    if (this.film) {
      const leaders = ctx.frame.querySelector<SVGSVGElement>("[data-film-leaders]");
      if (leaders !== null) {
        this.crop = document.createElementNS(SVG, "path");
        this.crop.setAttribute("data-crop", "");
        leaders.append(this.crop);
      }
    }
  }

  private buildAnnotations(): void {
    const { model } = this.ctx;
    const [first, second] = model.heaviest;
    const add = (
      node: number,
      from: number,
      to: number,
      note: string,
      active: boolean,
      extra: Partial<Pick<Annotation, "wideOnly" | "climb" | "still">> = {},
    ) => {
      const label = this.ctx.label({ active });
      label.set(model.paths[node]!, note);
      this.annotations.push({
        label,
        node,
        from,
        to,
        wideOnly: extra.wideOnly ?? false,
        climb: extra.climb ?? false,
        still: extra.still ?? false,
      });
    };
    const carries = (v: number) => `carries ${formatCount(model.reach[v]!)} files`;
    add(first!, -1, BEAT.heroEnd, carries(first!), false);
    add(second!, -1, BEAT.heroEnd, carries(second!), false, { wideOnly: true });
    add(
      model.crown,
      0.418,
      BEAT.circleEnd - 0.012,
      `level ${model.level[model.crown]}, the lowest weight`,
      false,
    );
    add(first!, BEAT.turnEnd + 0.006, BEAT.waveEnd + 0.008, carries(first!), true);
    // The climb: the file of the load path at the camera's level.
    add(model.spine[0]!, BEAT.zoomEnd + 0.004, BEAT.riseEnd, "level 0", true, { climb: true });
    add(
      model.crown,
      BEAT.land - 0.01,
      BEAT.end,
      `level ${model.level[model.crown]}, the crown`,
      true,
      {
        still: true,
      },
    );
    // The directories on the board's rim, while the plan caption shows (wide windows: on a phone the plan is too
    // small for eight more words).
    for (const d of model.districts.slice(0, FOLDERS)) {
      const label = this.ctx.label({ micro: true });
      label.set(d.name, "");
      this.annotations.push({
        label,
        node: -1,
        at: [Math.cos(d.angle) * PLAN_RADIUS * 1.2, 0, Math.sin(d.angle) * PLAN_MINOR * 1.2],
        from: 0.06,
        to: 0.112,
        wideOnly: true,
        climb: false,
        still: false,
      });
    }
  }

  update(t: number): void {
    const ctx = this.ctx;
    const film = this.film;
    // The hero steps out of the picture once the film runs; it stays in the page (and comes back on focus).
    const heroOn = !film || t < BEAT.heroEnd;
    if (heroOn !== this.heroOn && this.hero !== null) {
      this.heroOn = heroOn;
      setOn(this.hero, heroOn);
      this.hero.toggleAttribute("data-off", !heroOn);
    }
    if (film) {
      // "stands." turns over with the model, in the picture plane like the model. Upright on its end at mid-turn it
      // would cut into the line below, so it rises as it turns, the way a plank turned end over end is lifted, and
      // lands back on the line as it comes upright.
      const turn = turnOf(t);
      const width = ctx.size().width;
      if (width !== this.width) {
        this.width = width;
        this.turnLift = -1;
        this.turnShown = -1;
      }
      if (turn !== this.turnShown) {
        this.turnShown = turn;
        if (this.turnLift < 0) this.measureTurnWord();
        const lift = Math.sin(Math.PI * turn) * this.turnLift;
        const transform = `translateY(${(-lift).toFixed(1)}px) rotate(${((turn - 1) * 180).toFixed(2)}deg)`;
        for (const el of this.turning) el.style.transform = transform;
      }
      const gaugeOn = t >= BEAT.zoomEnd - 0.012 && t <= BEAT.riseEnd + 0.02;
      if (gaugeOn !== this.gaugeOn && this.gauge !== null) {
        this.gaugeOn = gaugeOn;
        setOn(this.gauge, gaugeOn);
      }
      // Inside the structure the drawing fills the frame: the narration's corner takes a darker ground.
      const shadeOn = t >= BEAT.zoomEnd - 0.02 && t <= BEAT.riseEnd + 0.014;
      if (shadeOn !== this.shadeOn) {
        this.shadeOn = shadeOn;
        ctx.frame.toggleAttribute("data-shade", shadeOn);
      }
      const steps = ctx.model.spine.length - 1;
      const level = Math.max(
        0,
        Math.min(steps, Math.round(((t - BEAT.zoomEnd) / (BEAT.riseEnd - BEAT.zoomEnd)) * steps)),
      );
      if (level !== this.level) {
        this.level = level;
        if (this.levelText !== null) this.levelText.textContent = String(level).padStart(2, "0");
        this.ticks.forEach((tick, i) => {
          tick.toggleAttribute("data-current", i === level);
          tick.toggleAttribute("data-passed", i < level);
        });
      }
      this.placeCrop(t);
    }
    this.pointLabels(t);
  }

  /** The turning word's lift: half its length less half its height, so on its end it stands on the line. */
  private measureTurnWord(): void {
    const el = this.turning[0];
    // Layout sizes, unaffected by the word's own transform (the caption is transparent, not removed, so it has them).
    this.turnLift = el === undefined ? 0 : Math.max(0, (el.offsetWidth - el.offsetHeight) / 2) + 3;
  }

  /** Points each label at its file while its window is open (none while a file is traced). */
  private pointLabels(t: number): void {
    const { model, framing } = this.ctx;
    const tracing = this.ctx.traced() >= 0;
    for (const a of this.annotations) {
      if (a.climb) {
        const node = model.spine[Math.max(0, this.level)]!;
        if (node !== a.node) {
          a.node = node;
          a.label.set(model.paths[node]!, `level ${model.level[node]}`);
        }
      }
      const inWindow = this.film ? t >= a.from && t <= a.to : a.still;
      const on = inWindow && (!a.wideOnly || framing === "wide") && !tracing;
      if (!on) a.label.hide();
      else if (a.at !== undefined) {
        // Still hanging at the plan beat: world space is model space with the board lifted to the model's height.
        a.label.atWorld(a.at[0], a.at[1] + modelHeight(this.ctx.model), a.at[2]);
      } else a.label.at(a.node);
    }
  }

  /**
   * The photograph: crop marks close round the hanging model while its form is fixed, then turn over with it (the
   * model turns in the picture plane, so the marks turn on screen exactly as the photograph would).
   */
  private placeCrop(t: number): void {
    const crop = this.crop;
    if (crop === null) return;
    const shown = window01(t, BEAT.circleEnd + 0.012, BEAT.turnEnd + 0.004, 0.012);
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
    const { model, framing } = this.ctx;
    const axis = turnAxis(framing);
    const height = modelHeight(model);
    const a = Math.PI * turnOf(t);
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
      if (axis === "z") this.ctx.screenOfWorld(ru, height / 2 + rv, 0, this.corners[i]!);
      else this.ctx.screenOfWorld(0, height / 2 + rv, ru, this.corners[i]!);
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

  dispose(): void {
    for (const a of this.annotations) a.label.hide();
    this.crop?.remove();
    this.ctx.frame.removeAttribute("data-shade");
    if (this.hero !== null) {
      this.hero.removeAttribute("data-off");
      this.hero.removeAttribute("data-on");
    }
    this.gauge?.removeAttribute("data-on");
  }
}

/* ------------------------------------------------------------------------------------------------------------
 * The act.
 * ---------------------------------------------------------------------------------------------------------- */

export const hangAct: ActDefinition = {
  id: "hang",
  cameraKeys: (model, framing) => hangCameraKeys(model, framing),
  lit(t, model) {
    if (t >= BEAT.land - 0.02) return masksOf(model).crown;
    if (t >= BEAT.zoomEnd - 0.01) return masksOf(model).spine;
    return null;
  },
  mount: (ctx) => new HangOverlay(ctx),
  still: {
    camera: (model, framing) => stillCamera(model, framing),
    lit: () => null,
    t: 1,
  },
};

/** Whether Act I shows the structure standing at local t (the turn is past its middle). */
export function standingAt(t: number): boolean {
  return turnOf(t) > 0.5;
}
