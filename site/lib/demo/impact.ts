/**
 * Change impact on the demonstration system: everything that depends on a member, directly or through other
 * members, with the shortest dependency chain that explains each one. Ties are broken by name, so the answer
 * is the same on every run.
 */
import { measurementOf } from "./metrics";
import { EDGES, NODES, type ModuleId } from "./system";

export interface Impact {
  readonly target: string;
  /** Affected member -> distance in dependency steps. */
  readonly distance: ReadonlyMap<string, number>;
  /** Affected member -> the member it depends on that leads to the target (shortest path, smallest name first). */
  readonly next: ReadonlyMap<string, string>;
  readonly maxDistance: number;
  /** Affected members, nearest first, then by name. */
  readonly affected: readonly (readonly [string, number])[];
  readonly modules: ReadonlySet<ModuleId>;
  /** Affected members that receive HTTP traffic. */
  readonly entryPoints: readonly string[];
}

const nodeById = new Map(NODES.map((n) => [n.id, n]));
const ENTRY_ROLES = new Set(["http controller", "route definition"]);

/** Members something depends on: the meaningful targets of an impact question. */
export const IMPACT_TARGETS: readonly string[] = NODES.filter(
  (n) => measurementOf(n.id).dependedOnBy.length > 0,
)
  .map((n) => n.id)
  .sort();

/** Breadth-first search up the dependency graph: everything that depends on the target, with its nearest path. */
export function impactOf(target: string): Impact {
  const distance = new Map<string, number>();
  const next = new Map<string, string>();
  let frontier = [target];
  let d = 0;
  while (frontier.length > 0) {
    d += 1;
    const following: string[] = [];
    for (const current of frontier.sort()) {
      for (const edge of EDGES.filter((e) => e.target === current).sort((a, b) =>
        a.source < b.source ? -1 : 1,
      )) {
        if (edge.source === target || distance.has(edge.source)) continue;
        distance.set(edge.source, d);
        next.set(edge.source, current);
        following.push(edge.source);
      }
    }
    frontier = following;
  }
  const affected = [...distance.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
  return {
    target,
    distance,
    next,
    maxDistance: Math.max(0, ...distance.values()),
    affected,
    modules: new Set(affected.map(([id]) => nodeById.get(id)!.module)),
    entryPoints: affected.map(([id]) => id).filter((id) => ENTRY_ROLES.has(nodeById.get(id)!.role)),
  };
}

/** The chain from an affected member down to the target. */
export function pathFrom(member: string, impact: Impact): string[] {
  const path = [member];
  let current = member;
  while (current !== impact.target) {
    current = impact.next.get(current) ?? impact.target;
    path.push(current);
  }
  return path;
}
