/**
 * Act II, "Every conclusion has evidence.": the camera dives into one real dependency (analysis-service.ts to
 * cache-key.ts) and performs Parse and Link on it, down to its lines of code, ending on the real relationship record.
 *
 * Typed stub, written at G1 by the film's engine: the camera holds where Act I left it, nothing is lit and there is no
 * still figure. The acts' builder owns this file from here on.
 */
import type { ActDefinition } from "../act";
import { holdKeys } from "../timeline";

export const evidenceAct: ActDefinition = {
  id: "evidence",
  cameraKeys: (_model, _framing, from) => holdKeys(from),
  lit: () => null,
  still: null,
};
