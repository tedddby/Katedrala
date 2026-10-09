/**
 * Where Acts II, III and the landing sit on the film's clock, and their beats: pure data, read on the server (the
 * track's height, the anchors #evidence, #impact and #trace, the captions' windows) and in the browser (timeline.ts
 * builds the clock from ACT_TIMINGS and Act I's timing; the acts' controllers read their beats here). Lengths are
 * viewports of pinned scroll per framing, within the plan's budgets (Act II at most 2.0 wide and 1.9 tall, Act III at
 * most 1.8, the landing at most 0.8). Every beat is a span of its act's local time t (0..1).
 */
import type { ActTiming } from "../act";

/** A span of an act's local time. */
export interface Span {
  readonly from: number;
  readonly to: number;
}

/**
 * Act II, "Every conclusion has evidence.": the camera cranes down from the crown hold to one real dependency (E0),
 * names its two ends (E1), opens both files as rulers of their lines and symbols (E2, Parse), binds the seven
 * observations to what they name (E3, Link), shows the relationship's record tied to its lines (E4, Evidence),
 * then pulls back to the whole structure (E5).
 */
export const EVIDENCE = {
  /** The crane down to the dependency; no caption. */
  crane: { from: 0, to: 0.12 },
  /** The two ends named on the drawing. */
  ends: { from: 0.08, to: 0.29 },
  /** Captions, one per beat, with the beat's own drawing in the same window. */
  e1: { from: 0.1, to: 0.27 },
  e2: { from: 0.295, to: 0.465 },
  e3: { from: 0.49, to: 0.645 },
  e4: { from: 0.67, to: 0.83 },
  e5: { from: 0.855, to: 1 },
  /** The rulers open out of their rings, then stay until the pull-back. */
  rulers: { from: 0.27, to: 0.85 },
  /** The leaders run from the observed lines to what they bind, one after another. */
  leaders: { from: 0.47, to: 0.85 },
  /** The record, tied to its two lines. */
  record: { from: 0.655, to: 0.845 },
  /** Every chain brightens once as the camera pulls back. */
  emphasis: { from: 0.86, to: 0.99 },
} as const satisfies Record<string, Span>;

/**
 * Act III, "Know what a change will touch before you make it.": the heaviest foundation is lit at the base (C1), named
 * (C2), the change rises through everything that rests on it one dependency at a time (C3), and the shortest path from
 * the crown down to it is drawn and named (C4). Impact analysis is planned for v1: the act says so from start to end.
 */
export const CHANGE = {
  c1: { from: 0.04, to: 0.215 },
  c2: { from: 0.235, to: 0.415 },
  c3: { from: 0.435, to: 0.755 },
  c4: { from: 0.775, to: 1 },
  /** The change rises: each step of the trace takes an equal share of this span. */
  rise: { from: 0.45, to: 0.72 },
  /** The counter of files reached, with the scope line beside it. */
  counter: { from: 0.425, to: 1 },
  /** The path from the crown down to the subject, drawn and named. */
  path: { from: 0.77, to: 1 },
} as const satisfies Record<string, Span>;

/** The landing, "Trace any file.": the camera settles on the still drawing's view; the controls take over. */
export const LANDING = {
  settle: { from: 0, to: 0.3 },
} as const satisfies Record<string, Span>;

export const ACT_TIMINGS: readonly ActTiming[] = [
  // Each act's page-key stops sit where its beat's caption is fully in view; its anchor on its first caption.
  {
    id: "evidence",
    length: { wide: 2.0, tall: 1.9 },
    stops: [0.19, 0.38, 0.57, 0.76, 0.93],
    anchor: 0.19,
  },
  {
    id: "change",
    length: { wide: 1.8, tall: 1.8 },
    stops: [0.13, 0.33, 0.56, 0.74, 0.9],
    anchor: 0.13,
  },
  { id: "trace", length: { wide: 0.8, tall: 0.8 }, stops: [0.4], anchor: 0.4 },
];
