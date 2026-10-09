/**
 * Labels on the drawing: a real path in the mono face (it breaks only after a slash), a short note, a knock-out
 * ground (as lettering on a drawing knocks the lines out behind it) and a hairline leader from the joint to the near
 * end of the label's rule. Each label is placed up and to the side with more room, inside the frame (clear of the
 * bar) and clear of every word on it and of the labels placed before it in the same pass; it keeps its place while
 * that stays clear, so it does not hop from side to side as the camera moves. Shared by the film and the still
 * figures.
 */
import type { ActLabel, Box } from "./act";

const SVG = "http://www.w3.org/2000/svg";

/** How much of a box another box covers (its area), 0 when they are clear of each other. */
export function overlap(a: Box, b: Box): number {
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

function setOn(el: Element, on: boolean): void {
  if (on) el.setAttribute("data-on", "");
  else el.removeAttribute("data-on");
}

export class Label {
  readonly el: HTMLDivElement;
  readonly leader: SVGPathElement;
  readonly code: HTMLElement;
  readonly note: HTMLSpanElement;
  /** Shown now. */
  on = false;
  /** Measured once per text, so placing it every frame does not force a layout. */
  size: { w: number; h: number } | null = null;
  /** The place it was last put (an index into the candidate places), kept while it stays clear. */
  slot = -1;
  /** The words it was last given (set() skips the DOM when they are the same). */
  private words = "";

  constructor(
    el: HTMLDivElement,
    leader: SVGPathElement,
    code: HTMLElement,
    note: HTMLSpanElement,
  ) {
    this.el = el;
    this.leader = leader;
    this.code = code;
    this.note = note;
  }

  /** Sets its words; its size is measured again the next time it is placed. */
  set(code: string, note: string): void {
    const words = `${code}\n${note}`;
    if (words === this.words) return;
    this.words = words;
    this.code.replaceChildren(...breakablePath(code));
    this.note.textContent = note;
    this.size = null;
    this.slot = -1;
  }
}

export class LabelLayer {
  private readonly labels: HTMLElement;
  private readonly leaders: SVGSVGElement;
  private readonly all: Label[] = [];
  private width = 1;
  private height = 1;
  private obstacles: readonly Box[] = [];
  /** Labels placed so far in this pass: later ones keep clear of them too. */
  private placed: Box[] = [];

  constructor(labels: HTMLElement, leaders: SVGSVGElement) {
    this.labels = labels;
    this.leaders = leaders;
  }

  /**
   * A new label, hidden. `active` draws its leader in load blue (what is active right now); `micro` makes it one
   * line of the mono face at 11px, for naming parts of the drawing.
   */
  create(active: boolean, micro = false): Label {
    const el = document.createElement("div");
    el.setAttribute("data-label", "");
    if (active) el.setAttribute("data-active", "");
    if (micro) el.setAttribute("data-micro", "");
    const code = document.createElement("code");
    const note = document.createElement("span");
    el.append(code, note);
    this.labels.append(el);
    const leader = document.createElementNS(SVG, "path");
    if (active) leader.setAttribute("data-active", "");
    if (micro) leader.setAttribute("data-micro", "");
    this.leaders.append(leader);
    const label = new Label(el, leader, code, note);
    this.all.push(label);
    return label;
  }

  /** The frame's size changed: every label is measured again. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const label of this.all) {
      label.size = null;
      label.slot = -1;
    }
  }

  /** Starts a placement pass with the boxes labels keep clear of. */
  begin(obstacles: readonly Box[]): void {
    this.obstacles = obstacles;
    this.placed = [];
  }

  /** Whether a point on the frame lies under one of its words (the obstacles, with their margins). */
  behindWords(x: number, y: number): boolean {
    return this.obstacles.some((o) => x > o.l && x < o.r && y > o.t && y < o.b);
  }

  /** Shows a label at a point on the frame, or hides it (null). */
  place(label: Label, point: { readonly x: number; readonly y: number } | null): void {
    const show = point !== null;
    if (show !== label.on) {
      label.on = show;
      setOn(label.el, show);
      setOn(label.leader, show);
      // Shown again: start from the preferred place.
      if (show) label.slot = -1;
    }
    if (point !== null) this.layout(label, point.x, point.y);
  }

  /**
   * Puts a label beside its point, up and to the side with more room. It tries the other side, then below, and
   * keeps the place it has while that stays clear. A leader runs from the point to the near end of the label's rule.
   */
  private layout(a: Label, x: number, y: number): void {
    const { width, height } = this;
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

  /** Removes every label and leader it made. */
  dispose(): void {
    for (const label of this.all) {
      label.el.remove();
      label.leader.remove();
    }
    this.all.length = 0;
  }
}

/** A label an act asked for (ActContext.label), and where it points; placed by the film or the still figure. */
export class ActLabelHandle implements ActLabel {
  readonly label: Label;
  /** 0: hidden; 1: a file; 2: a world-space point. */
  kind = 0;
  v = -1;
  x = 0;
  y = 0;
  z = 0;

  constructor(label: Label) {
    this.label = label;
  }

  set(code: string, note: string): void {
    this.label.set(code, note);
  }

  at(v: number): void {
    this.kind = v >= 0 ? 1 : 0;
    this.v = v;
  }

  atWorld(x: number, y: number, z: number): void {
    this.kind = 2;
    this.x = x;
    this.y = y;
    this.z = z;
  }

  hide(): void {
    this.kind = 0;
  }
}
