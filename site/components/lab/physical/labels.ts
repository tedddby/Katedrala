import type { BoardLabels } from "./board";
import type { Built } from "./build";
import { baseName } from "./model";
import { planPoint } from "./plan";

/**
 * The words on the drawing, as HTML over the canvas (crisp at any size, styled like the page): the directory bays
 * on the plan while the model hangs, the level scale, and two notes once it stands (the crown, and the foundation
 * that carries the most), each with a leader. Shared by the WebGL stage and the 2D fallback.
 *
 * Placement is one pass in order of importance: the title block and the level scale first, then the notes, then the
 * bay names. Nothing is placed over what is already there, and nothing leaves the stage.
 */

export interface LabelFrame {
  /** Scroll progress through the sequence (the still drawings pass 1). */
  readonly progress: number;
  /** The board's angle (pi once it stands). */
  readonly angle: number;
  /** Camera yaw, to tell the near side of the plan from the far side. */
  readonly yaw: number;
  /** The file under the pointer or selected (-1 for none): the notes give way to its card. */
  readonly active: number;
  /** A still drawing (reduced motion, no WebGL): the scale and the notes, no bay names. */
  readonly still: boolean;
  readonly width: number;
  readonly height: number;
  /** Positions of the files in the board's frame, xyz per file. */
  readonly files: Float32Array;
  /** A point in the board's frame to CSS pixels on the stage, plus a depth (z < 1 is in front of the far plane). */
  readonly project: (x: number, y: number, z: number) => readonly [number, number, number];
}

export interface Labels {
  /** The crown (the deepest file) and the foundation that carries the most. */
  readonly crown: number;
  readonly heaviest: number;
  /** Read label sizes and the title block's box (on layout changes only, never per frame). */
  measure(): void;
  place(frame: LabelFrame): void;
}

const SVG = "http://www.w3.org/2000/svg";

export function createLabels(
  overlay: HTMLElement,
  root: HTMLElement,
  built: Built,
  board: BoardLabels,
): Labels {
  const { model, plan } = built;
  overlay.replaceChildren();
  const makeLabel = (text: string, className: string) => {
    const node = document.createElement("span");
    node.className = className;
    node.textContent = text;
    node.setAttribute("aria-hidden", "true");
    overlay.appendChild(node);
    return node;
  };

  // Bay names, biggest bays first: when two would collide, the bigger bay keeps its name.
  const bays = board.bays
    .map((b) => ({
      ...b,
      node: makeLabel(b.name, "phx-label phx-label--bay"),
      w: b.name.length * 6.7,
      h: 12,
    }))
    .sort((a, b) => b.anchors - a.anchors);
  const levels = board.levels.map((l) => ({
    ...l,
    node: makeLabel(
      l.level === model.maxLevel ? `level ${l.level}` : String(l.level),
      "phx-label phx-label--level",
    ),
    w: 0,
    h: 0,
  }));

  const crown = model.nodes.reduce(
    (best, n) => (n.level > model.nodes[best]!.level ? n.id : best),
    0,
  );
  const heaviest = model.nodes
    .filter((n) => n.kind === "foundation")
    .reduce((best, n) => (n.reach > best.reach ? n : best)).id;

  // Notes, as on a drawing: a leader from the member to its note. The crown's note sits beside it, above; the
  // heaviest foundation's note stands on the ground outside the board, or under it, clear of the base.
  const leaders = document.createElementNS(SVG, "svg");
  leaders.setAttribute("class", "phx-leaders");
  leaders.setAttribute("aria-hidden", "true");
  overlay.appendChild(leaders);
  const makeLeader = () => {
    const line = document.createElementNS(SVG, "line");
    leaders.appendChild(line);
    return line;
  };
  const heavy = model.nodes[heaviest]!;
  const heavyAngle = Math.atan2(
    -plan.anchorZ[heaviest]! / plan.radiusZ,
    plan.anchorX[heaviest]! / plan.radiusX,
  );
  const crownNode = model.nodes[crown]!;
  const notes = [
    {
      id: crown,
      ground: null as readonly [number, number] | null,
      node: makeLabel(
        `${baseName(crownNode.path)}, level ${crownNode.level}: the crown`,
        "phx-label phx-label--callout",
      ),
      leader: makeLeader(),
      w: 0,
      h: 0,
    },
    {
      id: heaviest,
      ground: planPoint(plan, heavyAngle, 1.3) as readonly [number, number] | null,
      node: makeLabel(
        `${baseName(heavy.path)}: ${heavy.reach} files rest on it`,
        "phx-label phx-label--callout",
      ),
      leader: makeLeader(),
      w: 0,
      h: 0,
    },
  ];

  const titleBox = [0, 0, 0, 0];
  const measure = () => {
    for (const b of bays) {
      b.w = b.node.offsetWidth || b.w;
      b.h = b.node.offsetHeight || b.h;
    }
    for (const l of levels) {
      l.w = l.node.offsetWidth;
      l.h = l.node.offsetHeight;
    }
    for (const n of notes) {
      n.w = n.node.offsetWidth;
      n.h = n.node.offsetHeight;
    }
    const title = root.querySelector<HTMLElement>(".phx-title-block");
    if (title) {
      const r = title.getBoundingClientRect();
      const s = root.getBoundingClientRect();
      titleBox[0] = r.left - s.left;
      titleBox[1] = r.right - s.left;
      titleBox[2] = r.top - s.top;
      titleBox[3] = r.bottom - s.top;
    }
  };

  const placed: number[] = [];
  const at = (node: HTMLElement, x: number, y: number) => {
    node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  const place = (f: LabelFrame) => {
    const { project, width, height, files } = f;
    const free = (x0: number, x1: number, y0: number, y1: number) => {
      if (x0 < 8 || x1 > width - 8 || y0 < 68 || y1 > height - 8) return false;
      for (let i = 0; i < placed.length; i += 4) {
        if (x0 < placed[i + 1]! && x1 > placed[i]! && y0 < placed[i + 3]! && y1 > placed[i + 2]!)
          return false;
      }
      return true;
    };
    placed.length = 0;
    placed.push(titleBox[0]! - 8, titleBox[1]! + 8, titleBox[2]! - 6, titleBox[3]! + 6);

    // The scale's line, and its marks reading outwards from it, whichever side of the structure it stands on.
    const depth = model.maxLevel * built.unit;
    const [ax, ay] = project(board.scaleX, 0, 0);
    const [bx, by] = project(board.scaleX, -depth, 0);
    placed.push(
      Math.min(ax, bx) - 4,
      Math.max(ax, bx) + 4,
      Math.min(ay, by) - 4,
      Math.max(ay, by) + 4,
    );
    const showLevels = f.still || f.progress > 0.08;
    for (const l of levels) {
      const [x, y] = project(l.x, l.y, l.z);
      const [lineX] = project(board.scaleX, l.y, l.z);
      const right = x < lineX;
      at(l.node, x, y);
      l.node.dataset.align = right ? "right" : "left";
      l.node.dataset.on = showLevels ? "true" : "false";
      if (showLevels)
        placed.push(
          right ? x - l.w - 4 : x - 4,
          right ? x + 4 : x + l.w + 4,
          y - l.h / 2 - 3,
          y + l.h / 2 + 3,
        );
    }

    // Notes, once the structure stands: the first placement that is free wins.
    const showNotes = (f.still || f.progress > 0.66) && f.active < 0 && f.angle > Math.PI * 0.9;
    const [ringX] = project(0, 0, 0);
    let ringBottom = 0;
    if (showNotes) {
      for (let i = 0; i < 24; i++) {
        const [x, z] = planPoint(plan, (Math.PI * 2 * i) / 24, 1.16);
        ringBottom = Math.max(ringBottom, project(x, 0, z)[1]);
      }
    }
    for (const n of notes) {
      const [sx, sy] = project(files[n.id * 3]!, files[n.id * 3 + 1]!, files[n.id * 3 + 2]!);
      const clampX = (x: number) => Math.min(Math.max(x, n.w / 2 + 10), width - n.w / 2 - 10);
      const boxOf = (lx: number, ly: number, align: string): [number, number, number, number] => {
        const x0 = align === "left" ? lx + 6 : align === "right" ? lx - 6 - n.w : lx - n.w / 2;
        return [x0 - 2, x0 + n.w + 2, ly - n.h / 2 - 2, ly + n.h / 2 + 2];
      };
      const candidates: [number, number, string][] = [];
      if (n.ground !== null) {
        const [gx, gy] = project(n.ground[0], 0, n.ground[1]);
        candidates.push(
          [gx, gy, gx < ringX ? "right" : "left"],
          [clampX(sx), ringBottom + 12 + n.h / 2, "center"],
        );
      } else {
        candidates.push(
          [sx + 16, sy - 16, "left"],
          [sx - 16, sy - 16, "right"],
          [sx + 14, sy, "left"],
          [sx - 14, sy, "right"],
        );
        candidates.push([clampX(sx), sy - 18 - n.h / 2, "center"]);
      }
      let pick = candidates[candidates.length - 1]!;
      for (const candidate of candidates) {
        if (free(...boxOf(...candidate))) {
          pick = candidate;
          break;
        }
      }
      const [lx, ly, align] = pick;
      if (showNotes) placed.push(...boxOf(lx, ly, align));
      at(n.node, lx, ly);
      n.node.dataset.align = align;
      n.node.dataset.on = showNotes ? "true" : "false";
      // A centred note takes its leader to its nearest edge.
      const ey = align === "center" ? (ly > sy ? ly - n.h / 2 - 3 : ly + n.h / 2 + 3) : ly;
      n.leader.setAttribute("x1", sx.toFixed(1));
      n.leader.setAttribute("y1", sy.toFixed(1));
      n.leader.setAttribute("x2", lx.toFixed(1));
      n.leader.setAttribute("y2", ey.toFixed(1));
      n.leader.dataset.on = n.node.dataset.on;
    }

    // Bay names hang only while the model hangs. A name on the far side of the ring would sit on the members, so
    // only the near half and the flanks are named.
    const showBays = !f.still && f.progress > 0.08 && f.progress < 0.44;
    const ex = Math.sin(f.yaw);
    const ez = Math.cos(f.yaw);
    for (const b of bays) {
      const [x, y, z] = project(b.x, b.y, b.z);
      at(b.node, x, y);
      const x0 = x - b.w / 2 - 5;
      const x1 = x + b.w / 2 + 5;
      const y0 = y - b.h / 2 - 5;
      const y1 = y + b.h / 2 + 5;
      const on =
        showBays &&
        z < 1 &&
        (b.x * ex + b.z * ez) / Math.hypot(b.x, b.z) > -0.3 &&
        free(x0, x1, y0, y1);
      if (on) placed.push(x0, x1, y0, y1);
      b.node.dataset.on = on ? "true" : "false";
    }
  };

  return { crown, heaviest, measure, place };
}
