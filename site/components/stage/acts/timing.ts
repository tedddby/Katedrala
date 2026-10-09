/**
 * Where Acts II, III and the landing sit on the film's clock: pure data, read on the server (the track's height,
 * the anchors #evidence, #impact and #trace) and in the browser (timeline.ts builds the clock from it and Act I's
 * timing). Lengths are viewports of pinned scroll per framing, within the plan's budgets (Act II at most 2.0 wide
 * and 1.9 tall, Act III at most 1.8, the landing at most 0.8).
 *
 * Typed stub, written at G1 by the film's engine: the budgets as lengths, one page-key stop per act and a provisional
 * anchor. The acts' builder owns this file from here on; change the stops and the anchors to the acts' real beats.
 */
import type { ActTiming } from "../act";

export const ACT_TIMINGS: readonly ActTiming[] = [
  // "Every conclusion has evidence." E0 has no caption: the anchor should land on E1's.
  { id: "evidence", length: { wide: 2.0, tall: 1.9 }, stops: [1], anchor: 0.12 },
  // "Know what a change will touch before you make it." C1 opens with its caption.
  { id: "change", length: { wide: 1.8, tall: 1.8 }, stops: [1], anchor: 0.08 },
  // "Trace any file." The pin holds, then releases.
  { id: "trace", length: { wide: 0.8, tall: 0.8 }, stops: [1], anchor: 0.2 },
];
