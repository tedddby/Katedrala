/**
 * The film's acts in order: Act I (hang.ts), then Acts II, III and the landing from the acts' registry
 * (acts/index.ts), each paired with its timing (timeline.ts ACTS) by id.
 */
import type { ActDefinition } from "./act";
import { LATER_ACTS } from "./acts";
import { hangAct } from "./hang";
import { ACTS } from "./timeline";

export function filmActs(): readonly ActDefinition[] {
  const byId = new Map(LATER_ACTS.map((a) => [a.id, a]));
  return ACTS.map((timing) => {
    if (timing.id === "hang") return hangAct;
    const act = byId.get(timing.id);
    if (act === undefined) throw new Error(`no act registered for ${timing.id}`);
    return act;
  });
}
