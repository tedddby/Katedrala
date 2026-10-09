/**
 * The registry of Acts II, III and the landing, in the film's order (Act I is ../hang.ts). The director and the still
 * controller pair each definition with its timing in timing.ts by id: every timing needs a definition here.
 *
 * Typed stub, written at G1 by the film's engine; the acts' builder owns this file from here on.
 */
import type { ActDefinition } from "../act";
import { changeAct } from "./change";
import { evidenceAct } from "./evidence";
import { landingAct } from "./landing";

export const LATER_ACTS: readonly ActDefinition[] = [evidenceAct, changeAct, landingAct];
