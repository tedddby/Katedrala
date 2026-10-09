/**
 * Architectural Entropy of the demonstration system, following Katedrala's draft `katedrala/entropy@1` design
 * (milestone 6, planned). Four factors, each normalized without reference to the snapshot's maximum:
 *
 * - cyclicity: members in cycles, weighted by cycle size (Acyclic Dependencies Principle);
 * - direction: weight of module dependencies against the best one-way ordering (minimum feedback arc set);
 * - dispersion: perplexity of the target module of a dependency given its source module (Shannon entropy);
 * - propagation: share of member pairs connected by a dependency path (propagation cost, MacCormack et al. 2006).
 */
import { MODULES, NODES, type ModuleId } from "./system.ts";

export type EntropyFactorKey = "cyclicity" | "direction" | "dispersion" | "propagation";

export interface EntropyFactor {
  readonly key: EntropyFactorKey;
  readonly label: string;
  readonly raw: number;
  readonly normalized: number;
  readonly weight: number;
  readonly contribution: number;
  /** One line of evidence, with the measured values. */
  readonly evidence: string;
}

export type EntropyRating = "low" | "moderate" | "high" | "severe";

export interface EntropyResult {
  readonly score: number;
  readonly rating: EntropyRating;
  readonly factors: readonly EntropyFactor[];
  /** Module-level cycles (strongly connected groups of two or more modules). */
  readonly moduleCycles: readonly (readonly ModuleId[])[];
  /** Member-level cycles. */
  readonly memberCycles: readonly (readonly string[])[];
}

const anchored = (x: number, x0: number) => {
  const a = x0 / (1 - 2 * x0);
  return (x * (1 + a)) / (x + a);
};

/** Tarjan's strongly connected components (iterative-safe for these sizes). */
function components(n: number, out: readonly (readonly number[])[]): number[][] {
  let index = 0;
  const stack: number[] = [];
  const onStack = new Array<boolean>(n).fill(false);
  const indices = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const result: number[][] = [];
  const connect = (v: number) => {
    indices[v] = index;
    low[v] = index;
    index++;
    stack.push(v);
    onStack[v] = true;
    for (const w of out[v]!) {
      if (indices[w] === -1) {
        connect(w);
        low[v] = Math.min(low[v]!, low[w]!);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v]!, indices[w]!);
      }
    }
    if (low[v] === indices[v]) {
      const group: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        group.push(w);
      } while (w !== v);
      result.push(group.sort((a, b) => a - b));
    }
  };
  for (let v = 0; v < n; v++) if (indices[v] === -1) connect(v);
  return result;
}

/** Minimum total weight of edges against the best ordering of one strongly connected group (exact, k <= 16). */
function minimumFeedbackWeight(
  members: readonly number[],
  weight: (a: number, b: number) => number,
): number {
  const k = members.length;
  const best = new Array<number>(1 << k).fill(Number.POSITIVE_INFINITY);
  best[0] = 0;
  for (let set = 0; set < 1 << k; set++) {
    const base = best[set]!;
    if (!Number.isFinite(base)) continue;
    for (let j = 0; j < k; j++) {
      if (set & (1 << j)) continue;
      // Placing j after the members of `set`: every dependency from j to them runs against the order.
      let back = 0;
      for (let i = 0; i < k; i++) if (set & (1 << i)) back += weight(members[j]!, members[i]!);
      const next = set | (1 << j);
      if (base + back < best[next]!) best[next] = base + back;
    }
  }
  return best[(1 << k) - 1]!;
}

/** Entropy of the system made of `members` (every member by default) and `edges` between them. */
export function entropyOf(
  edges: readonly (readonly [string, string])[],
  members: readonly string[] = NODES.map((node) => node.id),
): EntropyResult {
  const present = new Set(members);
  const nodes = NODES.filter((node) => present.has(node.id));
  const ids = nodes.map((node) => node.id);
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  const moduleOf = nodes.map((node) => node.module);
  const out: number[][] = ids.map(() => []);
  for (const [source, target] of edges) {
    const s = index.get(source);
    const t = index.get(target);
    if (s === undefined || t === undefined) continue;
    if (s !== t && !out[s]!.includes(t)) out[s]!.push(t);
  }

  // F1 cyclicity.
  const memberGroups = components(n, out).filter((group) => group.length > 1);
  const omega = (size: number) => Math.min(1, Math.log2(size) / 5);
  const cyclic =
    memberGroups.reduce((sum, group) => sum + group.length * omega(group.length), 0) / n;

  // Module weights over member dependencies (own module included).
  const moduleIds = MODULES.map((module) => module.id).filter((id) =>
    nodes.some((node) => node.module === id),
  );
  const m = moduleIds.length;
  const mIndex = new Map(moduleIds.map((id, i) => [id, i]));
  const W = moduleIds.map(() => new Array<number>(m).fill(0));
  for (let s = 0; s < n; s++) {
    for (const t of out[s]!) W[mIndex.get(moduleOf[s]!)!]![mIndex.get(moduleOf[t]!)!]! += 1;
  }
  let crossWeight = 0;
  let totalWeight = 0;
  const moduleOut: number[][] = moduleIds.map(() => []);
  for (let a = 0; a < m; a++) {
    for (let b = 0; b < m; b++) {
      const w = W[a]![b]!;
      totalWeight += w;
      if (a !== b && w > 0) {
        crossWeight += w;
        moduleOut[a]!.push(b);
      }
    }
  }

  // F2 direction.
  const moduleGroups = components(m, moduleOut).filter((group) => group.length > 1);
  const feedback = moduleGroups.reduce(
    (sum, group) => sum + minimumFeedbackWeight(group, (a, b) => W[a]![b]!),
    0,
  );
  const direction = crossWeight === 0 ? 0 : feedback / crossWeight;

  // F3 dispersion.
  let conditionalEntropy = 0;
  for (let a = 0; a < m; a++) {
    const rowTotal = W[a]!.reduce((x, y) => x + y, 0);
    if (rowTotal === 0) continue;
    let h = 0;
    for (const w of W[a]!) if (w > 0) h -= (w / rowTotal) * Math.log2(w / rowTotal);
    conditionalEntropy += (rowTotal / totalWeight) * h;
  }
  const perplexity = 2 ** conditionalEntropy;

  // F4 propagation.
  let reachable = 0;
  for (let v = 0; v < n; v++) {
    const seen = new Set<number>();
    const stack = [...out[v]!];
    while (stack.length > 0) {
      const w = stack.pop()!;
      if (w === v || seen.has(w)) continue;
      seen.add(w);
      stack.push(...out[w]!);
    }
    reachable += seen.size;
  }
  const propagation = reachable / (n * (n - 1));

  const measured: EntropyFactor[] = [
    {
      key: "cyclicity",
      label: "Cycles",
      raw: cyclic,
      normalized: anchored(cyclic, 0.15),
      weight: 0.3,
      contribution: 0,
      evidence:
        memberGroups.length === 0
          ? "No member is part of a cycle."
          : `${memberGroups.reduce((s, g) => s + g.length, 0)} members in ${memberGroups.length} cycle${memberGroups.length === 1 ? "" : "s"}.`,
    },
    {
      key: "direction",
      label: "Against the grain",
      raw: direction,
      normalized: (8 * direction) / (6 * direction + 1),
      weight: 0.25,
      contribution: 0,
      evidence:
        feedback === 0
          ? "Cross-module dependencies all flow one way."
          : `${feedback} of ${crossWeight} cross-module dependencies ${feedback === 1 ? "runs" : "run"} against the best one-way order.`,
    },
    {
      key: "dispersion",
      label: "Scatter",
      raw: perplexity,
      normalized: (perplexity - 1) / (perplexity + 1),
      weight: 0.25,
      contribution: 0,
      // The perplexity of a dependency's target module given its source module: an effective number of modules.
      evidence: `A module's dependencies spread over ${perplexity.toFixed(1)} modules on average, its own included.`,
    },
    {
      key: "propagation",
      label: "Propagation",
      raw: propagation,
      normalized: (2 * propagation) / (1 + propagation),
      weight: 0.2,
      contribution: 0,
      evidence: `${Math.round(propagation * 100)}% of member pairs are joined by a dependency path.`,
    },
  ];
  // With fewer than two modules, direction and scatter cannot be measured; cycles and propagation carry the score.
  const measurable = moduleIds.length >= 2;
  const reweighted = measured.map((factor) => ({
    ...factor,
    weight: measurable
      ? factor.weight
      : factor.key === "cyclicity"
        ? 0.6
        : factor.key === "propagation"
          ? 0.4
          : 0,
  }));
  const factors = reweighted.map((factor) => ({
    ...factor,
    contribution: factor.weight * factor.normalized,
  }));

  const score = factors.reduce((sum, factor) => sum + factor.contribution, 0);
  const rating: EntropyRating =
    score < 0.25 ? "low" : score < 0.45 ? "moderate" : score < 0.65 ? "high" : "severe";
  return {
    score,
    rating,
    factors,
    moduleCycles: moduleGroups.map((group) => group.map((i) => moduleIds[i]!)),
    memberCycles: memberGroups.map((group) => group.map((i) => ids[i]!)),
  };
}

/** Five commits that each add one dependency to the demonstration system. */
export const DEGRADATION: readonly {
  readonly message: string;
  readonly edge: readonly [string, string];
}[] = [
  {
    message: "Send order confirmations from the user repository",
    edge: ["UserRepository", "OrderService"],
  },
  { message: "Check permissions before charging", edge: ["PaymentService", "AuthService"] },
  { message: "Recalculate invoices from orders", edge: ["InvoiceService", "OrderService"] },
  { message: "Show unpaid invoices on profiles", edge: ["UserService", "InvoiceService"] },
  { message: "Audit order access from auth", edge: ["AuthService", "OrderController"] },
];
