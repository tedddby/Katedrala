/**
 * Act III, "Know what a change will touch before you make it.": a change rises from src/graph/model/types.ts through
 * everything that rests on it, the load wave reversed. Impact analysis is planned for v1: the act says so throughout,
 * and the trace is computed by this page over Katedrala's dependencies (trace.ts).
 *
 * Typed stub, written at G1 by the film's engine: the camera holds, nothing is lit, no still figure. The acts'
 * builder owns this file from here on.
 */
import type { ActDefinition } from "../act";
import { holdKeys } from "../timeline";

export const changeAct: ActDefinition = {
  id: "change",
  cameraKeys: (_model, _framing, from) => holdKeys(from),
  lit: () => null,
  still: null,
};
