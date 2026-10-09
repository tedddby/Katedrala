/**
 * Measurements of the demonstration system, computed from its graph.
 *
 * Gravity follows Katedrala's draft `katedrala/gravity@1` design (milestone 6, planned): a weighted sum of
 * reach (transitive dependents), fan-in, cross-module spread and brokerage (betweenness). Reach, fan-in and
 * brokerage are log shares of the largest value possible for the system's size, never of the observed maximum;
 * spread saturates at a fixed constant.
 */
import { EDGES, MODULES, NODES, type DemoNode, type ModuleId } from "./system";

/** Structural facts of a directed graph whose edges point from a dependent to what it rests on. */
interface GraphFacts {
  readonly out: readonly (readonly number[])[];
  readonly in: readonly (readonly number[])[];
  /** 0 for foundations, otherwise one more than the highest unit it rests on. */
  readonly level: readonly number[];
  /** Every unit weighs 1 and passes its whole load evenly to the units it rests on. */
  readonly load: readonly number[];
  readonly edgeLoad: ReadonlyMap<string, number>;
  readonly betweenness: readonly number[];
  readonly dependents: readonly ReadonlySet<number>[];
  readonly dependencies: readonly ReadonlySet<number>[];
}

function analyzeGraph(
  ids: readonly string[],
  edges: readonly (readonly [string, string])[],
): GraphFacts {
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const out: number[][] = ids.map(() => []);
  const inn: number[][] = ids.map(() => []);
  for (const [source, target] of edges) {
    const s = index.get(source);
    const t = index.get(target);
    if (s === undefined || t === undefined)
      throw new Error(`Unknown unit in ${source} -> ${target}`);
    if (!out[s]!.includes(t)) {
      out[s]!.push(t);
      inn[t]!.push(s);
    }
  }

  const reach = (start: number, adjacency: readonly number[][]): Set<number> => {
    const seen = new Set<number>();
    const stack = [...adjacency[start]!];
    while (stack.length > 0) {
      const v = stack.pop()!;
      if (v === start || seen.has(v)) continue;
      seen.add(v);
      stack.push(...adjacency[v]!);
    }
    return seen;
  };

  const memo = new Array<number>(n).fill(-1);
  const levelOf = (v: number): number => {
    if (memo[v]! >= 0) return memo[v]!;
    let level = 0;
    for (const w of out[v]!) level = Math.max(level, levelOf(w) + 1);
    memo[v] = level;
    return level;
  };
  const level = ids.map((_, v) => levelOf(v));

  const load = new Array<number>(n).fill(1);
  const edgeLoad = new Map<string, number>();
  for (const v of ids.map((_, i) => i).sort((a, b) => level[b]! - level[a]!)) {
    const supports = out[v]!;
    if (supports.length === 0) continue;
    const share = load[v]! / supports.length;
    for (const w of supports) {
      load[w]! += share;
      edgeLoad.set(`${ids[v]}>${ids[w]}`, share);
    }
  }

  // Brandes (2001) betweenness on the directed, unweighted graph (raw, unnormalized).
  const betweenness = new Array<number>(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack: number[] = [];
    const predecessors: number[][] = ids.map(() => []);
    const sigma = new Array<number>(n).fill(0);
    const distance = new Array<number>(n).fill(-1);
    sigma[s] = 1;
    distance[s] = 0;
    const queue = [s];
    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);
      for (const w of out[v]!) {
        if (distance[w] === -1) {
          distance[w] = distance[v]! + 1;
          queue.push(w);
        }
        if (distance[w] === distance[v]! + 1) {
          sigma[w]! += sigma[v]!;
          predecessors[w]!.push(v);
        }
      }
    }
    const delta = new Array<number>(n).fill(0);
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of predecessors[w]!) delta[v]! += (sigma[v]! / sigma[w]!) * (1 + delta[w]!);
      if (w !== s) betweenness[w]! += delta[w]!;
    }
  }

  return {
    out,
    in: inn,
    level,
    load,
    edgeLoad,
    betweenness,
    dependents: ids.map((_, v) => reach(v, inn)),
    dependencies: ids.map((_, v) => reach(v, out)),
  };
}

export interface GravityTerm {
  readonly key: "reach" | "fan-in" | "spread" | "brokerage";
  readonly label: string;
  readonly raw: number;
  readonly normalized: number;
  readonly weight: number;
  readonly contribution: number;
}

export interface Measurement {
  readonly node: DemoNode;
  readonly dependsOn: readonly string[];
  readonly dependedOnBy: readonly string[];
  readonly transitiveDependents: readonly string[];
  readonly transitiveDependencies: readonly string[];
  readonly level: number;
  readonly load: number;
  readonly betweenness: number;
  readonly gravity: number;
  readonly terms: readonly GravityTerm[];
}

const logShare = (x: number, max: number): number =>
  max <= 0 ? 0 : Math.log1p(x) / Math.log1p(max);
const saturation = (x: number, k: number): number => x / (x + k);

const WEIGHTS = { reach: 0.4, "fan-in": 0.2, spread: 0.25, brokerage: 0.15 } as const;
const TERM_LABEL = {
  reach: "Reach",
  "fan-in": "Fan-in",
  spread: "Cross-module spread",
  brokerage: "Brokerage",
} as const;
const SPREAD_K = 3;

const nodeIds = NODES.map((node) => node.id);
const facts = analyzeGraph(
  nodeIds,
  EDGES.map((edge) => [edge.source, edge.target] as const),
);
const n = nodeIds.length;

export const MEASUREMENTS: ReadonlyMap<string, Measurement> = new Map(
  NODES.map((node, v) => {
    const spreadModules = new Set(
      facts.in[v]!.map((u) => NODES[u]!.module).filter((module) => module !== node.module),
    );
    const raw = {
      reach: facts.dependents[v]!.size,
      "fan-in": facts.in[v]!.length,
      spread: spreadModules.size,
      brokerage: facts.betweenness[v]!,
    };
    const normalized = {
      reach: logShare(raw.reach, n - 1),
      "fan-in": logShare(raw["fan-in"], n - 1),
      spread: saturation(raw.spread, SPREAD_K),
      brokerage: logShare(raw.brokerage, (n - 1) * (n - 2)),
    };
    const terms = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((key) => ({
      key,
      label: TERM_LABEL[key],
      raw: raw[key],
      normalized: normalized[key],
      weight: WEIGHTS[key],
      contribution: WEIGHTS[key] * normalized[key],
    }));
    const name = (u: number): string => nodeIds[u]!;
    const measurement: Measurement = {
      node,
      dependsOn: facts.out[v]!.map(name),
      dependedOnBy: facts.in[v]!.map(name),
      transitiveDependents: [...facts.dependents[v]!].map(name).sort(),
      transitiveDependencies: [...facts.dependencies[v]!].map(name).sort(),
      level: facts.level[v]!,
      load: facts.load[v]!,
      betweenness: facts.betweenness[v]!,
      gravity: terms.reduce((sum, term) => sum + term.contribution, 0),
      terms,
    };
    return [node.id, measurement];
  }),
);

export function measurementOf(id: string): Measurement {
  const measurement = MEASUREMENTS.get(id);
  if (measurement === undefined) throw new Error(`Unknown member ${id}`);
  return measurement;
}

export type TermKey = GravityTerm["key"];

/** What one term of a member's Gravity measured, as members and dependencies a drawing can light. */
export interface TermEvidence {
  /** Members the term counts or passes through, the member itself excluded, by name. */
  readonly members: readonly string[];
  /** Dependencies as `source>target` (the dependent first). */
  readonly edges: readonly string[];
}

// Shortest dependency distances between every two members (breadth first; -1 where there is no path).
const distance: number[][] = nodeIds.map((_, s) => {
  const d = new Array<number>(n).fill(-1);
  d[s] = 0;
  const queue = [s];
  while (queue.length > 0) {
    const v = queue.shift()!;
    for (const w of facts.out[v]!) {
      if (d[w] === -1) {
        d[w] = d[v]! + 1;
        queue.push(w);
      }
    }
  }
  return d;
});

/** Whether the dependency a -> b lies on a shortest path from s to t. */
const onShortestPath = (a: number, b: number, s: number, t: number): boolean => {
  const st = distance[s]![t]!;
  const sa = distance[s]![a]!;
  const bt = distance[b]![t]!;
  return st >= 0 && sa >= 0 && bt >= 0 && sa + 1 + bt === st;
};

/**
 * The evidence behind each term, per member: reach, everything that rests on it and the dependencies that bring
 * that load down to it; fan-in, its direct dependents and their dependencies on it; cross-module spread, the
 * direct dependents in other modules; brokerage, every member and dependency on a shortest dependency path
 * between two other members that passes through it (the paths its betweenness sums over).
 */
export const TERM_EVIDENCE: ReadonlyMap<string, Readonly<Record<TermKey, TermEvidence>>> = new Map(
  NODES.map((node, v) => {
    const key = (a: number, b: number) => `${nodeIds[a]}>${nodeIds[b]}`;
    const sorted = (members: Iterable<number>) =>
      [...new Set(members)]
        .filter((u) => u !== v)
        .map((u) => nodeIds[u]!)
        .sort();
    const tributary = facts.dependents[v]!;
    const carried = new Set([v, ...tributary]);
    const reachEdges = facts.out.flatMap((targets, s) =>
      tributary.has(s) ? targets.filter((t) => carried.has(t)).map((t) => key(s, t)) : [],
    );
    const callers = facts.in[v]!;
    const outside = callers.filter((u) => NODES[u]!.module !== node.module);

    const brokered = new Set<number>();
    const brokeredEdges = new Set<string>();
    for (let s = 0; s < n; s++) {
      for (let t = 0; t < n; t++) {
        if (s === v || t === v || s === t) continue;
        const sv = distance[s]![v]!;
        const vt = distance[v]![t]!;
        if (sv < 0 || vt < 0 || sv + vt !== distance[s]![t]) continue;
        // v lies on a shortest path from s to t: light every dependency on a shortest path s -> v or v -> t.
        facts.out.forEach((targets, a) => {
          for (const b of targets) {
            if (onShortestPath(a, b, s, v) || onShortestPath(a, b, v, t)) {
              brokered.add(a);
              brokered.add(b);
              brokeredEdges.add(key(a, b));
            }
          }
        });
      }
    }

    const evidence: Record<TermKey, TermEvidence> = {
      reach: { members: sorted(tributary), edges: reachEdges.sort() },
      "fan-in": { members: sorted(callers), edges: callers.map((u) => key(u, v)).sort() },
      spread: { members: sorted(outside), edges: outside.map((u) => key(u, v)).sort() },
      brokerage: { members: sorted(brokered), edges: [...brokeredEdges].sort() },
    };
    return [node.id, evidence];
  }),
);

export function termEvidenceOf(id: string, term: TermKey): TermEvidence {
  const evidence = TERM_EVIDENCE.get(id);
  if (evidence === undefined) throw new Error(`Unknown member ${id}`);
  return evidence[term];
}

/** Load carried by one member (dependent -> dependency). */
export function edgeLoad(source: string, target: string): number {
  return facts.edgeLoad.get(`${source}>${target}`) ?? 0;
}

export const MAX_LEVEL = Math.max(...facts.level);
export const MAX_EDGE_LOAD = Math.max(...facts.edgeLoad.values());

// Module level: the same rules on the graph of dependencies between modules.

export interface ModuleMeasurement {
  readonly id: ModuleId;
  readonly name: string;
  readonly members: readonly string[];
  readonly dependsOn: readonly ModuleId[];
  readonly dependedOnBy: readonly ModuleId[];
  readonly level: number;
  readonly load: number;
}

const moduleIds = MODULES.map((module) => module.id);
const moduleOf = new Map(NODES.map((node) => [node.id, node.module]));
export const MODULE_EDGES: readonly (readonly [ModuleId, ModuleId])[] = [
  ...new Map(
    EDGES.map((edge) => [moduleOf.get(edge.source)!, moduleOf.get(edge.target)!] as const)
      .filter(([source, target]) => source !== target)
      .map((pair) => [pair.join(">"), pair] as const),
  ).values(),
];
const moduleFacts = analyzeGraph(moduleIds, MODULE_EDGES);

export const MODULE_MEASUREMENTS: ReadonlyMap<ModuleId, ModuleMeasurement> = new Map(
  MODULES.map((module, v) => [
    module.id,
    {
      id: module.id,
      name: module.name,
      members: NODES.filter((node) => node.module === module.id).map((node) => node.id),
      dependsOn: moduleFacts.out[v]!.map((w) => moduleIds[w]!),
      dependedOnBy: moduleFacts.in[v]!.map((u) => moduleIds[u]!),
      level: moduleFacts.level[v]!,
      load: moduleFacts.load[v]!,
    },
  ]),
);

export function moduleEdgeLoad(source: ModuleId, target: ModuleId): number {
  return moduleFacts.edgeLoad.get(`${source}>${target}`) ?? 0;
}

export const MAX_MODULE_LEVEL = Math.max(...moduleFacts.level);
export const MAX_MODULE_EDGE_LOAD = Math.max(...moduleFacts.edgeLoad.values());

/** Two decimals, the precision the page shows for draft scores. */
export function formatScore(value: number): string {
  return value.toFixed(2);
}

/**
 * The change from one score to another as the page shows them, signed ("+0.04", "−0.02"): the difference of the
 * two shown values, so a column of changes adds up exactly to the scores beside it.
 */
export function formatDelta(before: number, after: number): string {
  const cents =
    Math.round(Number(formatScore(after)) * 100) - Math.round(Number(formatScore(before)) * 100);
  return `${cents < 0 ? "−" : "+"}${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * The parts of a score at the page's two decimals, rounded so they add up to the score as shown: each part is
 * rounded down, and the hundredths still missing go to the parts with the largest remainders (ties to the
 * earlier part). Plain rounding can make 0.12 + 0.09 sit beside a total of 0.22.
 */
export function formatParts(parts: readonly number[], total: number): string[] {
  const cents = parts.map((part) => Math.floor(part * 100 + 1e-9));
  // The target is the total exactly as formatScore prints it, so the parts can never disagree with it.
  let missing = Math.round(Number(formatScore(total)) * 100) - cents.reduce((sum, c) => sum + c, 0);
  const remainder = (i: number) => parts[i]! * 100 - cents[i]!;
  const order = parts.map((_, i) => i).sort((a, b) => remainder(b) - remainder(a) || a - b);
  for (const i of order) {
    if (missing <= 0) break;
    cents[i]! += 1;
    missing -= 1;
  }
  return cents.map((c) => (c / 100).toFixed(2));
}

/**
 * The scale each Gravity term is normalized against, for the page to state the method with its own numbers:
 * reach and fan-in against the other members, brokerage against the ordered pairs of other members.
 */
export const GRAVITY_SCALE = {
  members: n,
  reach: n - 1,
  "fan-in": n - 1,
  brokerage: (n - 1) * (n - 2),
  spread: SPREAD_K,
} as const;

export function moduleMeasurementOf(id: string): ModuleMeasurement {
  const measurement = MODULE_MEASUREMENTS.get(id as ModuleId);
  if (measurement === undefined) throw new Error(`Unknown module ${id}`);
  return measurement;
}

/** Members of the system other than one member: the denominator of "how many rest on it". */
export const OTHER_MEMBERS = n - 1;
