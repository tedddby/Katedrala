/**
 * The annotations of the drawing, in SVG over the canvas: the level datums, the plan's dimension chain, the
 * hatched ground, and callouts with leader lines. The stage projects every anchor with the drawing's own
 * camera, so text and lines stay on the members they name.
 */

const SVG = "http://www.w3.org/2000/svg";

type Attrs = Record<string, string | number>;

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  parent.appendChild(node);
  return node;
}

/** Measured values and paths are set in the mono; labels in the condensed sans of the page. */
const MONO =
  "font-family: var(--font-martian), ui-monospace, monospace; font-variation-settings: 'wdth' 87.5;";
const SANS =
  "font-family: var(--font-archivo), ui-sans-serif, sans-serif; font-variation-settings: 'wdth' 82; font-weight: 500;";
const INK = "#e9e6df";
const INK_SOFT = "#b4b1a9";
const INK_FAINT = "#8b8e92";
const GRAPHITE = "#5d6166";
const LOAD = "#3ea6ff";

function fix(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where callouts may go: inside `frame`, clear of every rectangle in `avoid`. */
export interface Room {
  frame: Rect;
  avoid: readonly Rect[];
}

let measureContext: CanvasRenderingContext2D | null = null;
let monoFamily = "";

/**
 * Width of `text` in the mono face at `size` px. The canvas measures the face at its normal width; the labels
 * are set at wdth 87.5, which Martian Mono draws 0.93 as wide (measured against the rendered SVG text).
 */
const CONDENSED = 0.93;

function measure(text: string, size: number): number {
  if (measureContext === null) {
    measureContext = document.createElement("canvas").getContext("2d");
    monoFamily =
      getComputedStyle(document.documentElement).getPropertyValue("--font-martian").trim() ||
      "monospace";
  }
  if (measureContext === null) return text.length * size * 0.62;
  measureContext.font = `${size}px ${monoFamily}`;
  return measureContext.measureText(text).width * CONDENSED;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Where a callout may go, in order of preference: [x side, y side, elbow stretch]. The x side scales the
 * preferred horizontal elbow (its sign flips the side, 0.3 tucks the label in close where the sheet is narrow);
 * the y side flips the vertical one; a stretched elbow reaches past a crowded neighbourhood.
 */
const CANDIDATES: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [-1, 1, 1],
  [1, -1, 1],
  [-1, -1, 1],
  [1, 1, 1.9],
  [-1, 1, 1.9],
  [1, -1, 1.9],
  [-1, -1, 1.9],
  [0.3, 1, 1],
  [-0.3, 1, 1],
  [0.3, -1, 1],
  [-0.3, -1, 1],
];

/** A label with a leader line: an elbow from the anchor to the text. */
export class Callout {
  readonly group: SVGGElement;
  private readonly leader: SVGPolylineElement;
  private readonly dot: SVGCircleElement;
  private readonly title: SVGTextElement;
  private readonly detail: SVGTextElement;
  private shown = -1;
  private width = 0;
  /** The last placement written to the DOM. */
  private placed = "";
  private size: number;

  constructor(parent: Element, opts: { size?: number } = {}) {
    this.size = opts.size ?? 11;
    this.group = make("g", { opacity: 0 }, parent);
    this.group.style.display = "none";
    this.leader = make(
      "polyline",
      { fill: "none", stroke: INK_FAINT, "stroke-width": 1 },
      this.group,
    );
    this.dot = make("circle", { r: 1.6, fill: INK_FAINT }, this.group);
    this.title = make(
      "text",
      { style: `${MONO} font-size: ${this.size}px;`, fill: INK },
      this.group,
    );
    this.detail = make(
      "text",
      { style: `${MONO} font-size: ${this.size - 1}px;`, fill: INK_FAINT },
      this.group,
    );
  }

  text(title: string, detail: string): void {
    if (this.title.textContent === title && this.detail.textContent === detail) return;
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.measureText();
  }

  /** The type size of the title (the detail is a pixel smaller): smaller on a phone's drawing band. */
  resize(size: number): void {
    if (size === this.size) return;
    this.size = size;
    this.title.setAttribute("style", `${MONO} font-size: ${size}px;`);
    this.detail.setAttribute("style", `${MONO} font-size: ${size - 1}px;`);
    this.measureText();
    this.placed = "";
  }

  private measureText(): void {
    const title = this.title.textContent ?? "";
    const detail = this.detail.textContent ?? "";
    this.width = Math.max(measure(title, this.size), measure(detail, this.size - 1)) + 2;
  }

  /**
   * Anchor at (ax, ay). The text sits at an elbow |dx|, |dy| away: on the preferred side when it fits the room,
   * otherwise wherever it covers the least of what it must keep clear of (the title block, the edge of the
   * drawing). A label too long for either side of its anchor (a long path on a phone) goes on a shelf instead:
   * the leader rises or drops straight to a rule under or over the text, which slides along x until it fits.
   * An `optional` callout that fits nowhere is not drawn. `opacity` 0 hides it.
   */
  place(
    ax: number,
    ay: number,
    dx: number,
    dy: number,
    opacity: number,
    room?: Room,
    optional = false,
  ): void {
    let chosen: [number, number, number] = [dx, dy, 0];
    let visible = opacity;
    if (room !== undefined && visible > 0) {
      const sx = Math.sign(dx) || 1;
      const sy = Math.sign(dy) || -1;
      const ax0 = Math.abs(dx);
      const ay0 = Math.abs(dy);
      let best = Infinity;
      for (const [kx, ky, stretch] of CANDIDATES) {
        const cdx = ax0 * kx * sx;
        const cdy = (ay0 * stretch + (stretch > 1 ? 8 : 0)) * ky * sy;
        const slide = this.slide(ax, cdx, room.frame);
        // A shelf costs a little more than an elbow that fits as it is, so the elbow wins whenever it fits.
        const score = this.cost(this.box(ax, ay, cdx, cdy, slide), room) + (slide === 0 ? 0 : 400);
        if (score < best) {
          best = score;
          chosen = [cdx, cdy, slide];
        }
        if (score === 0) break;
      }
      if (optional && best >= 1) visible = 0;
    }
    const o = Math.round(visible * 100) / 100;
    if (o !== this.shown) {
      this.group.setAttribute("opacity", String(o));
      this.group.style.display = o <= 0 ? "none" : "";
      this.shown = o;
    }
    if (o <= 0) return;
    const [ddx, ddy, slide] = chosen;
    const key = `${fix(ax)} ${fix(ay)} ${fix(ddx)} ${fix(ddy)} ${fix(slide)}`;
    if (key === this.placed) return;
    this.placed = key;
    this.dot.setAttribute("cx", fix(ax));
    this.dot.setAttribute("cy", fix(ay));
    const t = this.textAt(ax, ay, ddx, ddy, slide);
    if (slide === 0) {
      const ex = ax + ddx;
      const ey = ay + ddy;
      const run = ddx >= 0 ? 14 : -14;
      this.leader.setAttribute(
        "points",
        `${fix(ax)},${fix(ay)} ${fix(ex)},${fix(ey)} ${fix(ex + run)},${fix(ey)}`,
      );
    } else {
      const shelf = ay + ddy;
      const x0 = Math.min(ax, t.left - 3);
      const x1 = Math.max(ax, t.left + this.width + 3);
      this.leader.setAttribute(
        "points",
        `${fix(ax)},${fix(ay)} ${fix(ax)},${fix(shelf)} ${fix(x0)},${fix(shelf)} ${fix(x1)},${fix(shelf)}`,
      );
    }
    const end = t.anchor === "end";
    for (const [node, y] of [
      [this.title, t.titleY],
      [this.detail, t.detailY],
    ] as const) {
      node.setAttribute("x", fix(end ? t.left + this.width : t.left));
      node.setAttribute("y", fix(y));
      node.setAttribute("text-anchor", t.anchor);
    }
  }

  /**
   * The text of a placement: its left edge, its anchor and the baselines of its two lines. An elbow puts it
   * beside the end of the leader; a shelf (`slide` ≠ 0) above or below the rule at the leader's end.
   */
  private textAt(ax: number, ay: number, dx: number, dy: number, slide: number) {
    const right = dx >= 0;
    const size = this.size;
    if (slide === 0) {
      const tx = ax + dx + (right ? 20 : -20);
      const y = ay + dy + 4;
      return {
        left: right ? tx : tx - this.width,
        anchor: right ? ("start" as const) : ("end" as const),
        titleY: y,
        detailY: y + size + 4,
      };
    }
    const shelf = ay + dy;
    const detailY = dy < 0 ? shelf - 6 : shelf + 2 * size + 7;
    return {
      left: (right ? ax + dx + 20 : ax + dx - 20 - this.width) + slide,
      anchor: "start" as const,
      titleY: detailY - size - 4,
      detailY,
    };
  }

  /** How far the label must slide along x to lie inside `frame` (0 when it already does, or cannot). */
  private slide(ax: number, dx: number, frame: Rect): number {
    const right = dx >= 0;
    const tx = ax + dx + (right ? 20 : -20);
    const left = right ? tx : tx - this.width;
    const end = left + this.width;
    if (this.width + 8 > frame.right - frame.left) return 0;
    if (end + 4 > frame.right) return frame.right - 4 - end;
    if (left - 4 < frame.left) return frame.left + 4 - left;
    return 0;
  }

  /** Area of `box` outside the room's frame plus its overlap with what the room keeps clear, px² (0: fits). */
  private cost(box: Rect, room: Room): number {
    const area = (r: Rect) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
    const clip = (a: Rect, b: Rect): Rect => ({
      left: Math.max(a.left, b.left),
      top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right),
      bottom: Math.min(a.bottom, b.bottom),
    });
    let cost = area(box) - area(clip(box, room.frame));
    for (const r of room.avoid) if (overlaps(box, r)) cost += area(clip(box, r));
    return cost;
  }

  /** The leader and the text of a placement. */
  private box(ax: number, ay: number, dx: number, dy: number, slide: number): Rect {
    const t = this.textAt(ax, ay, dx, dy, slide);
    const size = this.size;
    return {
      left: Math.min(ax, t.left) - 4,
      right: Math.max(ax, t.left + this.width) + 4,
      top: Math.min(ay, ay + dy, t.titleY - size) - 2,
      bottom: Math.max(ay, ay + dy, t.detailY + 4) + 2,
    };
  }
}

export class Overlay {
  readonly root: SVGSVGElement;
  private readonly hatch: SVGRectElement;
  private readonly hatchClip: SVGRectElement;
  private readonly datumGroup: SVGGElement;
  private readonly datumRule: SVGLineElement;
  private readonly datumTicks: SVGLineElement[] = [];
  private readonly datumLabels: SVGTextElement[] = [];
  private readonly datumTitle: SVGTextElement;
  private readonly planGroup: SVGGElement;
  private readonly planRule: SVGLineElement;
  private planTicks: SVGLineElement[] = [];
  private planLabels: { name: SVGTextElement; size: SVGTextElement; width: number }[] = [];
  private readonly turnGroup: SVGGElement;
  private readonly turnRing: SVGEllipseElement;
  private readonly turnArc: SVGPathElement;
  private readonly turnHead: SVGPolylineElement;
  private readonly turnLabel: SVGTextElement;
  private datumOpacity = -1;
  private planOpacity = -1;
  private turnOpacity = -1;
  private datumMark = -1;
  /** What was last drawn, so an unchanged view writes nothing to the DOM. */
  private groundKey = "";
  private datumKey = "";
  private planKey = "";
  private turnKey = "";

  constructor(root: SVGSVGElement, levels: number) {
    this.root = root;
    root.replaceChildren();
    const defs = make("defs", {}, root);
    const pattern = make(
      "pattern",
      {
        id: "hm-hatch",
        width: 7,
        height: 7,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(45)",
      },
      defs,
    );
    make("line", { x1: 0, y1: 0, x2: 0, y2: 7, stroke: GRAPHITE, "stroke-width": 1 }, pattern);
    const clip = make("clipPath", { id: "hm-hatch-clip" }, defs);
    this.hatchClip = make("rect", { x: 0, y: 0, width: 0, height: 0 }, clip);
    this.hatch = make(
      "rect",
      { fill: "url(#hm-hatch)", "clip-path": "url(#hm-hatch-clip)", opacity: 0 },
      root,
    );

    this.datumGroup = make("g", { opacity: 0 }, root);
    this.datumRule = make("line", { stroke: GRAPHITE, "stroke-width": 1 }, this.datumGroup);
    for (let L = 0; L <= levels; L++) {
      this.datumTicks.push(
        make(
          "line",
          { stroke: L === 0 ? INK_FAINT : GRAPHITE, "stroke-width": 1 },
          this.datumGroup,
        ),
      );
      const label = make(
        "text",
        { style: `${MONO} font-size: 10px;`, fill: INK_FAINT, "text-anchor": "end" },
        this.datumGroup,
      );
      label.textContent = String(L);
      this.datumLabels.push(label);
    }
    this.datumTitle = make(
      "text",
      {
        style: `${SANS} font-size: 10px; letter-spacing: 0.08em;`,
        fill: INK_FAINT,
        "text-anchor": "middle",
      },
      this.datumGroup,
    );
    this.datumTitle.textContent = "LEVEL";

    this.planGroup = make("g", { opacity: 0 }, root);
    this.planRule = make("line", { stroke: GRAPHITE, "stroke-width": 1 }, this.planGroup);

    this.turnGroup = make("g", { opacity: 0 }, root);
    this.turnGroup.style.display = "none";
    // The path of the turn as a phantom line (long dashes), then the part swept so far, solid.
    this.turnRing = make(
      "ellipse",
      { fill: "none", stroke: GRAPHITE, "stroke-width": 1, "stroke-dasharray": "3 2" },
      this.turnGroup,
    );
    const stroke = {
      fill: "none",
      stroke: INK_FAINT,
      "stroke-width": 1.25,
      "stroke-linejoin": "round",
    };
    this.turnArc = make("path", stroke, this.turnGroup);
    this.turnHead = make("polyline", stroke, this.turnGroup);
    this.turnLabel = make(
      "text",
      { style: `${MONO} font-size: 10px;`, fill: INK_FAINT, "text-anchor": "middle" },
      this.turnGroup,
    );
  }

  /**
   * The drafting mark of the turn: a revolution arrow around the axis at (cx, cy), swept through the angle turned
   * so far, and that angle in degrees. Load blue while the drawing is turning (`active` above a half).
   */
  turn(cx: number, cy: number, theta: number, opacity: number, active: number): void {
    const o = Math.round(opacity * 100) / 100;
    if (o !== this.turnOpacity) {
      this.turnGroup.setAttribute("opacity", String(o));
      this.turnGroup.style.display = o <= 0 ? "none" : "";
      this.turnOpacity = o;
    }
    if (o <= 0) return;
    const degrees = Math.round((theta * 180) / Math.PI);
    const lit = active > 0.5;
    const key = `${fix(cx)} ${fix(cy)} ${degrees} ${lit ? 1 : 0}`;
    if (key === this.turnKey) return;
    this.turnKey = key;
    // A ring around the axis seen side on: narrow across the axis, tall along the turn. It starts at the top and
    // runs over the near side, the way the board's upper face swings toward the reader and down.
    const rx = 6;
    const ry = 14;
    this.turnRing.setAttribute("cx", fix(cx));
    this.turnRing.setAttribute("cy", fix(cy));
    this.turnRing.setAttribute("rx", String(rx));
    this.turnRing.setAttribute("ry", String(ry));
    const sweep = (degrees * Math.PI) / 180;
    const steps = Math.max(2, Math.ceil(degrees / 8));
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const phi = (sweep * i) / steps;
      d += `${i === 0 ? "M" : "L"}${fix(cx + rx * Math.sin(phi))},${fix(cy - ry * Math.cos(phi))}`;
    }
    this.turnArc.setAttribute("d", d);
    const ex = cx + rx * Math.sin(sweep);
    const ey = cy - ry * Math.cos(sweep);
    const tx = rx * Math.cos(sweep);
    const ty = ry * Math.sin(sweep);
    const len = Math.hypot(tx, ty) || 1;
    const ux = tx / len;
    const uy = ty / len;
    const barb = (spread: number) => {
      const c = Math.cos(spread);
      const s = Math.sin(spread);
      return `${fix(ex + 5 * (-ux * c + uy * s))},${fix(ey + 5 * (-uy * c - ux * s))}`;
    };
    this.turnHead.setAttribute("points", `${barb(0.5)} ${fix(ex)},${fix(ey)} ${barb(-0.5)}`);
    this.turnLabel.textContent = `${degrees}°`;
    this.turnLabel.setAttribute("x", fix(cx));
    this.turnLabel.setAttribute("y", fix(cy - ry - 7));
    const colour = lit ? LOAD : INK_FAINT;
    this.turnArc.setAttribute("stroke", colour);
    this.turnHead.setAttribute("stroke", colour);
    this.turnLabel.setAttribute("fill", colour);
  }

  callout(opts: { size?: number } = {}): Callout {
    return new Callout(this.root, opts);
  }

  /** The bays of the plan (directory groups in board order), for the dimension chain above the board. */
  rooms(rooms: readonly { name: string; lines: number }[]): void {
    for (const tick of this.planTicks) tick.remove();
    for (const label of this.planLabels) {
      label.name.remove();
      label.size.remove();
    }
    this.planTicks = [];
    this.planLabels = [];
    this.planKey = "";
    for (let k = 0; k <= rooms.length; k++) {
      this.planTicks.push(make("line", { stroke: INK_FAINT, "stroke-width": 1 }, this.planGroup));
    }
    for (const room of rooms) {
      const name = make(
        "text",
        { style: `${MONO} font-size: 11px;`, fill: INK_SOFT, "text-anchor": "middle" },
        this.planGroup,
      );
      name.textContent = room.name;
      const size = make(
        "text",
        { style: `${MONO} font-size: 10px;`, fill: INK_FAINT, "text-anchor": "middle" },
        this.planGroup,
      );
      size.textContent = room.lines.toLocaleString("en-US");
      const width = Math.max(measure(room.name, 11), measure(size.textContent, 10)) + 10;
      this.planLabels.push({ name, size, width });
    }
  }

  /** The hatched ground under the ground line, from x0 to x1, drawn in from the left as `reveal` goes to 1. */
  ground(x0: number, x1: number, y: number, depth: number, reveal: number): void {
    const key = `${fix(x0)} ${fix(x1)} ${fix(y)} ${depth} ${fix(reveal * 100)}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    const width = Math.max(0, x1 - x0);
    this.hatch.setAttribute("x", fix(x0));
    this.hatch.setAttribute("y", fix(y + 1));
    this.hatch.setAttribute("width", fix(width));
    this.hatch.setAttribute("height", fix(depth));
    this.hatchClip.setAttribute("x", fix(x0));
    this.hatchClip.setAttribute("y", fix(y + 1));
    this.hatchClip.setAttribute("width", fix(width * reveal));
    this.hatchClip.setAttribute("height", fix(depth));
    this.hatch.setAttribute("opacity", reveal > 0 ? "1" : "0");
  }

  /**
   * Level datums: a rule at screen x `x` with a tick and a number at every level. `levelY(L)` gives the
   * screen y of level L; `mark` (or -1) is a level to call out, in load blue.
   */
  datums(x: number, levelY: (L: number) => number, opacity: number, mark = -1): void {
    const o = Math.round(opacity * 100) / 100;
    if (o !== this.datumOpacity) {
      this.datumGroup.setAttribute("opacity", String(o));
      this.datumGroup.style.display = o <= 0 ? "none" : "";
      this.datumOpacity = o;
    }
    if (o <= 0) return;
    const key = `${fix(x)} ${fix(levelY(0))} ${fix(levelY(this.datumTicks.length - 1))} ${mark}`;
    if (key === this.datumKey) return;
    this.datumKey = key;
    if (mark !== this.datumMark) {
      this.datumLabels.forEach((label, L) =>
        label.setAttribute("fill", L === mark ? LOAD : INK_FAINT),
      );
      this.datumTicks.forEach((tick, L) =>
        tick.setAttribute("stroke", L === mark ? LOAD : L === 0 ? INK_FAINT : GRAPHITE),
      );
      this.datumMark = mark;
    }
    const top = levelY(this.datumTicks.length - 1);
    const bottom = levelY(0);
    this.datumRule.setAttribute("x1", fix(x));
    this.datumRule.setAttribute("x2", fix(x));
    this.datumRule.setAttribute("y1", fix(top));
    this.datumRule.setAttribute("y2", fix(bottom));
    const up = top < bottom;
    this.datumTicks.forEach((tick, L) => {
      const y = levelY(L);
      tick.setAttribute("x1", fix(x - 4));
      tick.setAttribute("x2", fix(x + (L === 0 ? 10 : 4)));
      tick.setAttribute("y1", fix(y));
      tick.setAttribute("y2", fix(y));
      const label = this.datumLabels[L]!;
      label.setAttribute("x", fix(x - 9));
      label.setAttribute("y", fix(y + 3.5));
    });
    this.datumTitle.setAttribute("x", fix(x - 6));
    this.datumTitle.setAttribute("y", fix(up ? top - 14 : top + 22));
  }

  /**
   * The plan's dimension chain: a rule above the board at screen y `y`, a slash at every bay boundary
   * (`edges`, screen x), and each bay's name and lines of code where the bay is wide enough to hold them.
   */
  plan(edges: readonly number[], y: number, opacity: number): void {
    const o = Math.round(opacity * 100) / 100;
    if (o !== this.planOpacity) {
      this.planGroup.setAttribute("opacity", String(o));
      this.planGroup.style.display = o <= 0 ? "none" : "";
      this.planOpacity = o;
    }
    if (o <= 0 || edges.length < 2) return;
    const key = `${fix(y)} ${edges.map(fix).join(" ")}`;
    if (key === this.planKey) return;
    this.planKey = key;
    this.planRule.setAttribute("x1", fix(edges[0]! - 8));
    this.planRule.setAttribute("x2", fix(edges[edges.length - 1]! + 8));
    this.planRule.setAttribute("y1", fix(y));
    this.planRule.setAttribute("y2", fix(y));
    this.planTicks.forEach((tick, k) => {
      const x = edges[k];
      if (x === undefined) return;
      tick.setAttribute("x1", fix(x - 3.5));
      tick.setAttribute("y1", fix(y + 3.5));
      tick.setAttribute("x2", fix(x + 3.5));
      tick.setAttribute("y2", fix(y - 3.5));
    });
    this.planLabels.forEach((label, k) => {
      const x0 = edges[k];
      const x1 = edges[k + 1];
      if (x0 === undefined || x1 === undefined) return;
      const fits = x1 - x0 >= label.width;
      label.name.style.display = fits ? "" : "none";
      label.size.style.display = fits ? "" : "none";
      if (!fits) return;
      const cx = (x0 + x1) / 2;
      label.name.setAttribute("x", fix(cx));
      label.name.setAttribute("y", fix(y - 22));
      label.size.setAttribute("x", fix(cx));
      label.size.setAttribute("y", fix(y - 8));
    });
  }
}
