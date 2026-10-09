/**
 * The landing, "Trace any file.": the camera settles on the still camera's three-quarter view and any of the 404
 * files can be traced, in both directions, from the drawing or from the controls in the act's block.
 *
 * Typed stub, written at G1 by the film's engine: the camera holds, nothing is lit, no still figure. The acts'
 * builder owns this file from here on.
 */
import type { ActDefinition } from "../act";
import { holdKeys } from "../timeline";

export const landingAct: ActDefinition = {
  id: "trace",
  cameraKeys: (_model, _framing, from) => holdKeys(from),
  lit: () => null,
  still: null,
};
