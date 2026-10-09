import type { PlanOptions } from "./plan";
import type { RigOptions } from "./rig";

/**
 * The model's dimensions, shared by the worker that simulates it, the stage that draws it and the fallback. Units
 * are arbitrary model units; gravity is 98 units/s^2, so one unit reads as about ten centimetres of a real model.
 */

export type Profile = "desktop" | "mobile";

export const GRAVITY = 98;

export const PLAN: PlanOptions = {
  radiusX: 7,
  radiusZ: 5,
  inner: 0.72,
  opening: (70 * Math.PI) / 180,
  gap: (3 * Math.PI) / 180,
};

const RIG_BASE: Omit<RigOptions, "plan"> = {
  unit: 1.2,
  slack: 1.04,
  linkLength: 0.8,
  minLinks: 2,
  maxLinks: 8,
  massPerLine: 0.01,
  chainMass: 0.25,
  radius100: 0.13,
  minLines: 20,
  minChainShare: 0.2,
  bayPull: 0.3,
  bayFade: 4,
  taper: 0.7,
  taperPower: 0.8,
};

/** Phones get chains with fewer, longer links: the same form, about half the particles. */
export function rigOptions(profile: Profile): Omit<RigOptions, "plan"> {
  return profile === "mobile" ? { ...RIG_BASE, linkLength: 1.25, maxLinks: 5 } : RIG_BASE;
}

export const SUBSTEPS: Record<Profile, number> = { desktop: 8, mobile: 6 };

/** The intro: the net starts folded under the board and each level's weights are let go in turn. */
export const DROP = {
  fold: 0.08,
  start: 0.25,
  perLevel: 0.085,
  /** Damping while it drops, and once it has (1/s). */
  damping: 0.9,
  settledDamping: 2.2,
  settleAfter: 3.2,
} as const;

/** The turn-over: a critically damped spring drives the board over (and back), once the page asks for it. */
export const FLIP = {
  frequency: 0.55,
  /** Natural frequency of the springs tying particles to the fixed form while it turns, and once it stands (Hz). */
  turning: 3.2,
  standing: 4.5,
  /** Most angular acceleration the board takes (rad/s^2): a fast scroll cannot fling the model apart. */
  maxAlpha: 14,
} as const;
