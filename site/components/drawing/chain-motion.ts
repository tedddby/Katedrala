import { createElement, useLayoutEffect, useRef, type SVGProps } from "react";

/**
 * Dependencies are chains. One that appears drops in slack and pulls taut with one small rebound: a damped spring
 * with the film's damping ratio (0.55, a 12.6 percent overshoot, the catch of its hanging weights), settled in
 * about 450 ms. One that disappears lifts out of the structure faster, in 180 ms. Both ends stay on their joints
 * while a chain pulls taut; only the slack between them moves.
 *
 * Interruptible: every chain keeps its current shape, velocity and opacity when its target changes, so rapid input
 * retargets the motion instead of stacking or restarting it. One frame loop serves every chain on the page and
 * stops as soon as nothing moves. Under reduced motion, and for changes the keyboard made, chains land at once.
 */

/** How a change of state reaches the drawing: a motion the eye can follow, or at once (keyboard input). */
export type ChainMotion = "animate" | "instant";

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A dependency as drawn, from its dependent to what it rests on: a quadratic (one control point; a straight line
 * has it on the chord) or a cubic (two).
 */
interface Shape {
  readonly from: Point;
  readonly controls: readonly Point[];
  readonly to: Point;
  /** Unit normal the slack hangs toward. */
  readonly normal: Point;
  readonly length: number;
}

/** The film's catch: damping ratio and angular frequency of the spring that pulls a chain taut. */
const ZETA = 0.55;
const OMEGA = 22;
const DAMPED = OMEGA * Math.sqrt(1 - ZETA * ZETA);
/** Slack a chain drops in with: its control point hangs this share of the chord off the line, at most SLACK_MAX. */
const SLACK = 0.3;
const SLACK_MAX = 72;
/** A chain that drops in is fully drawn after this long. */
const FADE_IN = 140;
/** A chain that is taken out lifts this far (drawing units) and is gone after LIFT_TIME. */
const LIFT = 10;
const LIFT_TIME = 180;

interface Chain {
  readonly group: SVGGElement;
  readonly path: SVGPathElement;
  /** The chain's resting path, as the drawing currently renders it. */
  readonly rest: () => string;
  phase: "appear" | "leave";
  /** When the phase's motion starts (after any delay), in ms. */
  start: number;
  /** Slack (drawing units off the chord) and its velocity (units per second) at `start`. */
  slack0: number;
  speed0: number;
  /** Lift (units) and opacity at `start`. */
  lift0: number;
  opacity0: number;
  /** The values drawn in the last frame, for a retarget to continue from. */
  slack: number;
  speed: number;
  lift: number;
  opacity: number;
}

const chains = new Map<SVGGElement, Chain>();
let frame = 0;

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/** Reads a path this module can bend: "M x y L x y", "M x y Q cx cy x y" or "M x y C c1x c1y c2x c2y x y". */
function shapeOf(d: string): Shape | null {
  const n = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  if (n.length !== 4 && n.length !== 6 && n.length !== 8) return null;
  const point = (i: number) => ({ x: n[i]!, y: n[i + 1]! });
  const from = point(0);
  const to = point(n.length - 2);
  const controls =
    n.length === 4
      ? [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }]
      : n.length === 6
        ? [point(2)]
        : [point(2), point(4)];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // A curved chain hangs further the way it already bends; a straight one toward the ground (or to the right of
  // a plumb line, where the ground gives no side).
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const bend =
    controls.reduce((sum, c) => sum + (-dy / length) * (c.x - mx) + (dx / length) * (c.y - my), 0) /
    controls.length;
  const side =
    Math.abs(bend) > 0.5
      ? Math.sign(bend)
      : Math.abs(dx) > 1e-6
        ? Math.sign(dx)
        : Math.sign(-dy) || 1;
  return {
    from,
    controls,
    to,
    normal: { x: (-dy / length) * side, y: (dx / length) * side },
    length,
  };
}

function draw(chain: Chain) {
  const shape = shapeOf(chain.rest());
  if (shape !== null) {
    const f = (v: number) => v.toFixed(2);
    const { from, controls, to, normal } = shape;
    const up = chain.lift;
    const bent = controls
      .map((c) => `${f(c.x + normal.x * chain.slack)} ${f(c.y + normal.y * chain.slack - up)}`)
      .join(" ");
    chain.path.setAttribute(
      "d",
      `M${f(from.x)} ${f(from.y - up)}${controls.length === 1 ? "Q" : "C"}${bent} ${f(to.x)} ${f(to.y - up)}`,
    );
  }
  chain.group.style.opacity = chain.opacity.toFixed(3);
}

/** Puts a chain back in its resting state: the drawing's own path, the opacity its stylesheet gives it. */
function settle(group: SVGGElement, path: SVGPathElement, rest: string) {
  chains.delete(group);
  path.setAttribute("d", rest);
  group.style.removeProperty("opacity");
}

/** Advances one chain to `now`; true once it has come to rest. */
function step(chain: Chain, now: number): boolean {
  const t = (now - chain.start) / 1000;
  if (t < 0) return false;
  if (chain.phase === "leave") {
    const p = Math.min(1, (now - chain.start) / LIFT_TIME);
    const e = easeOut(p);
    chain.opacity = chain.opacity0 * (1 - e);
    chain.lift = chain.lift0 + (LIFT - chain.lift0) * e;
    chain.slack = chain.slack0;
    chain.speed = 0;
    return p >= 1;
  }
  // The analytic damped spring from (slack0, speed0) toward taut; the lift falls back on the same spring.
  const decay = Math.exp(-ZETA * OMEGA * t);
  const cos = Math.cos(DAMPED * t);
  const sin = Math.sin(DAMPED * t);
  const spring = (x0: number, v0: number) => ({
    x: decay * (x0 * cos + ((v0 + ZETA * OMEGA * x0) / DAMPED) * sin),
    v: decay * (v0 * cos - ((ZETA * OMEGA * v0 + OMEGA * OMEGA * x0) / DAMPED) * sin),
  });
  const slack = spring(chain.slack0, chain.speed0);
  const lift = spring(chain.lift0, 0);
  chain.slack = slack.x;
  chain.speed = slack.v;
  chain.lift = lift.x;
  chain.opacity =
    chain.opacity0 + (1 - chain.opacity0) * easeOut(Math.min(1, (now - chain.start) / FADE_IN));
  // At rest once what is left of the motion is under half a drawing unit, and slower than a sixth of one a frame.
  return (
    chain.opacity >= 0.999 &&
    Math.abs(slack.x) < 0.5 &&
    Math.abs(slack.v) < 10 &&
    Math.abs(lift.x) < 0.5 &&
    Math.abs(lift.v) < 10
  );
}

function tick(now: number) {
  frame = 0;
  for (const chain of [...chains.values()]) {
    if (step(chain, now)) settle(chain.group, chain.path, chain.rest());
    else if (now >= chain.start) draw(chain);
  }
  if (chains.size > 0) frame = requestAnimationFrame(tick);
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Sends a chain toward being present or not. `group` carries its opacity, `path` its shape; `rest` returns the
 * path as the drawing renders it at rest. A drop-in can wait `delay` ms (chains dropping in one after another);
 * a lift-out never waits.
 */
export function moveChain(
  group: SVGGElement,
  path: SVGPathElement,
  present: boolean,
  rest: () => string,
  { instant = false, delay = 0 }: { instant?: boolean; delay?: number } = {},
) {
  // A drawing hidden at this width (its other form is shown) has nothing to animate.
  if (instant || reducedMotion() || group.getClientRects().length === 0) {
    settle(group, path, rest());
    return;
  }
  const now = performance.now();
  const current = chains.get(group);
  if (current?.phase === (present ? "appear" : "leave")) return;
  const length = shapeOf(rest())?.length ?? 0;
  const chain: Chain = present
    ? {
        group,
        path,
        rest,
        phase: "appear",
        start: current === undefined ? now + delay : now,
        // From the resting state it drops in slack; from a lift-out it pulls taut from where it is.
        slack0: current?.slack ?? Math.min(SLACK * length, SLACK_MAX),
        speed0: 0,
        lift0: current?.lift ?? 0,
        opacity0: current?.opacity ?? 0,
        slack: 0,
        speed: 0,
        lift: 0,
        opacity: 0,
      }
    : {
        group,
        path,
        rest,
        phase: "leave",
        start: now,
        slack0: current?.slack ?? 0,
        speed0: 0,
        lift0: current?.lift ?? 0,
        opacity0: current?.opacity ?? 1,
        slack: 0,
        speed: 0,
        lift: 0,
        opacity: 1,
      };
  chain.slack = chain.slack0;
  chain.lift = chain.lift0;
  chain.opacity = chain.opacity0;
  chains.set(group, chain);
  // Drawn at once, before the browser paints the state change, so no frame shows the end state first.
  draw(chain);
  if (frame === 0) frame = requestAnimationFrame(tick);
}

/** Forgets a chain that left the document mid-motion. */
export function releaseChain(group: SVGGElement) {
  chains.delete(group);
}

type ChainPathProps = Omit<SVGProps<SVGPathElement>, "ref" | "d"> & {
  /** The dependency at rest. */
  readonly d: string;
  /** Whether the dependency is part of the drawing now; changes animate as the chain drops in or lifts out. */
  readonly present: boolean;
  /** How the change that flipped `present` arrives. */
  readonly motion: ChainMotion;
  /** Wait this long before dropping in (ms), for chains that drop one after another. */
  readonly delay?: number;
};

/**
 * A dependency drawn as a chain: a `<g class="chain">` (its presence, `data-present`) around the path. The server
 * render is the resting state, so the drawing is complete without script; only changes of `present` move.
 */
export function ChainPath({ d, present, motion, delay = 0, ...props }: ChainPathProps) {
  const group = useRef<SVGGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const rest = useRef(d);
  rest.current = d;
  const shown = useRef(present);

  useLayoutEffect(() => {
    if (shown.current === present) return;
    shown.current = present;
    const g = group.current;
    const p = path.current;
    if (g === null || p === null) return;
    moveChain(g, p, present, () => rest.current, { instant: motion === "instant", delay });
  }, [present, motion, delay]);

  useLayoutEffect(() => {
    const g = group.current;
    return () => {
      if (g !== null) releaseChain(g);
    };
  }, []);

  return createElement(
    "g",
    { ref: group, className: "chain", "data-present": present },
    createElement("path", { ...props, ref: path, d }),
  );
}

/**
 * Whether a click came from the keyboard (Enter or Space on a button reports no pointer press), so the change it
 * makes can land at once.
 */
export function fromKeyboard(event: { readonly detail: number }): boolean {
  return event.detail === 0;
}
