/**
 * P4 of module inference: splitting oversized flat units with Louvain (§3.8; docs/ALGORITHMS.md, "Modules",
 * P4).
 *
 * A directory with more than `max_module_files` nodes and no sub-directory has no finer prior, so it is
 * partitioned by dependencies: Louvain modularity clustering (Blondel et al. 2008, resolution γ = 1,
 * Newman & Girvan 2004) warm-started from file-name stems, on the unit's undirected inference subgraph
 * without orchestrators and utilities. `@katedrala/graph.louvain` refines its result into connected
 * communities. Small pieces are then merged into the piece they share the most weight with, and every piece
 * gets a content-derived key (D-34). Louvain keeps only this role in module inference: unconstrained
 * clustering scrambles intentional structure and is unstable (§3.2).
 *
 * Determinism: Louvain is deterministic, warm-started and runs with pinned parameters (D-68); pieces are
 * numbered by smallest member; merging and key assignment are order-independent rules with integer and
 * string tie-breaks; weight sums are exact (D-67).
 */
import { louvain } from "@katedrala/graph";
import type { LouvainOptions, UndirectedGraph } from "@katedrala/graph";
import { baseName, compareStrings, shortHash } from "@katedrala/ir";
import { fileStem, tokenize } from "../lexical.js";
import type { InferenceSettings, Scope } from "../types.js";
import type { ClassifiedNodes } from "./classes.js";
import { addUnit, membersByUnit } from "./prior.js";
import type { PriorUnits } from "./prior.js";
import type { StemUnits } from "./stems.js";

/**
 * The Louvain parameters of P4 [KATEDRALA HEURISTIC] (D-68): today's defaults of `@katedrala/graph.louvain`,
 * copied into an inference constant so that a later change of the graph package's defaults cannot change
 * module ids without a method version bump (R-7). docs/ALGORITHMS.md lists the values.
 */
export const LOUVAIN_OPTIONS: Readonly<Required<Omit<LouvainOptions, "initialCommunities">>> =
  Object.freeze({
    resolution: 1,
    maxLevels: Number.POSITIVE_INFINITY,
    maxPasses: 1000,
    minModularityGain: 1e-12,
    minPassGain: 1e-7,
  });

/**
 * The fallback key of a piece without an available stem [KATEDRALA HEURISTIC] (D-34): the ASCII-lower-cased
 * keys of the tokens of the file name, extension included, joined by `-` (`formatDate.ts` →
 * `format-date-ts`). Tokens never contain `%`, `#`, `~` or `/` (D-05), so the key is safe after `#`; it is
 * empty when the name has no token.
 *
 * Complexity: O(length of the file name). Determinism: ASCII-only (D-05).
 */
export function fileNameKey(path: string): string {
  return tokenize(baseName(path))
    .map((token) => token.key)
    .join("-");
}

/**
 * A file name without its last extension [DERIVED] (`formatDate.ts` → `formatDate`; a leading dot does not
 * start an extension). P6 names fallback pieces by it.
 *
 * Complexity: O(length of the path).
 */
export function fileNameWithoutExtension(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Union-find root with path halving. */
function findRoot(parent: Int32Array, item: number): number {
  let current = item;
  while (parent[current]! !== current) {
    parent[current] = parent[parent[current]!]!;
    current = parent[current]!;
  }
  return current;
}

/**
 * Merge small pieces by iterated simultaneous best-neighbour merging [KATEDRALA HEURISTIC] (§3.8, D-33):
 * every piece with fewer than `minSize` nodes and at least one edge to another piece points to the piece it
 * shares the most weight with (exact sums, D-67; ties: the smaller piece index, which is the piece with the
 * smaller smallest member); each connected component of that pointer graph merges into one piece; pieces
 * are renumbered by smallest member; the rounds repeat until no small piece has an edge to another piece.
 * The rule is order-independent and terminates: every round merges at least two pieces, and it at least
 * halves the number of small pieces that have edges, so there are O(log p) rounds.
 *
 * Every merged piece stays connected when its parts were: each pointer is an edge between the two pieces.
 *
 * Complexity: O((k + m) log p) time for k nodes, m edges and p pieces; O(k + p) memory.
 *
 * @param pieces - a piece for every node, numbered `0..count − 1` by smallest member (as `louvain` returns).
 * @returns the merged pieces, numbered by smallest member, and their count.
 */
export function mergeSmallPieces(
  graph: UndirectedGraph,
  pieces: Int32Array,
  count: number,
  minSize: number,
): { readonly pieces: Int32Array; readonly count: number } {
  const k = graph.nodeCount;
  let piece = Int32Array.from(pieces);
  let pieceCount = count;
  for (;;) {
    const size = new Int32Array(pieceCount);
    for (let node = 0; node < k; node++) size[piece[node]!]!++;
    const offsets = new Int32Array(pieceCount + 1);
    for (let p = 0; p < pieceCount; p++) offsets[p + 1] = offsets[p]! + size[p]!;
    const order = new Int32Array(k);
    const cursor = offsets.slice(0, pieceCount);
    for (let node = 0; node < k; node++) order[cursor[piece[node]!]!++] = node;

    const pointer = new Int32Array(pieceCount).fill(-1);
    const weight = new Float64Array(pieceCount);
    const stamp = new Int32Array(pieceCount).fill(-1);
    const touched: number[] = [];
    let anyPointer = false;
    for (let p = 0; p < pieceCount; p++) {
      if (size[p]! >= minSize) continue;
      touched.length = 0;
      for (let i = offsets[p]!; i < offsets[p + 1]!; i++) {
        const node = order[i]!;
        for (let a = graph.offsets[node]!; a < graph.offsets[node + 1]!; a++) {
          const other = piece[graph.neighbors[a]!]!;
          if (other === p) continue;
          if (stamp[other] !== p) {
            stamp[other] = p;
            weight[other] = 0;
            touched.push(other);
          }
          weight[other]! += graph.weights[a]!;
        }
      }
      if (touched.length === 0) continue;
      // D-33: the most shared weight (exact sums, D-67); ties go to the smaller piece index.
      let best = touched[0]!;
      for (const other of touched) {
        if (weight[other]! > weight[best]! || (weight[other] === weight[best] && other < best)) {
          best = other;
        }
      }
      pointer[p] = best;
      anyPointer = true;
    }
    if (!anyPointer) return { pieces: piece, count: pieceCount };

    const parent = new Int32Array(pieceCount);
    for (let p = 0; p < pieceCount; p++) parent[p] = p;
    for (let p = 0; p < pieceCount; p++) {
      if (pointer[p] === -1) continue;
      const a = findRoot(parent, p);
      const b = findRoot(parent, pointer[p]!);
      if (a < b) parent[b] = a;
      else if (b < a) parent[a] = b;
    }
    // Renumber by smallest member: the first node of a merged piece decides its number.
    const renumbered = new Int32Array(pieceCount).fill(-1);
    const next = new Int32Array(k);
    let merged = 0;
    for (let node = 0; node < k; node++) {
      const root = findRoot(parent, piece[node]!);
      if (renumbered[root] === -1) renumbered[root] = merged++;
      next[node] = renumbered[root]!;
    }
    piece = next;
    pieceCount = merged;
  }
}

/** One piece of an oversized unit: its scope nodes, ascending. */
interface Piece {
  readonly nodes: number[];
}

/**
 * P4, splitting oversized units [KATEDRALA HEURISTIC] (§3.8). It applies to the directory, root and shared
 * units with more than `maxModuleFiles` nodes after P2; stem units are never split (D-32). Within such a
 * unit the prior nodes lie directly in one directory (P1 split every oversized directory with
 * sub-directories); only stem files P2 added to a feature child lie elsewhere. For each unit:
 *
 * 1. `{ graph, mapping } = scopeGraph.inducedSubgraph(unit nodes − orchestrators − utilities)` (review #16:
 *    community labels index the subgraph and are mapped back through `mapping`); its undirected view gives
 *    `w̄(u, v) = w(u → v) + w(v → u)`.
 * 2. `louvain(G_U, { ...LOUVAIN_OPTIONS, initialCommunities })` (D-68), warm-started from file-stem labels
 *    numbered by first occurrence in node order; stemless nodes start as singletons. The final refinement of
 *    `louvain` makes every community connected.
 * 3. Small pieces merge ({@link mergeSmallPieces}, D-33).
 * 4. Keys (D-34): pieces of at least `minModuleFiles` nodes are visited by decreasing size, then smallest
 *    member; each takes its most frequent file stem (ties: the smallest by `compareStrings`) that is not yet
 *    taken, the taken set starting with the stems P2 applied in the same directory. Without one it takes
 *    {@link fileNameKey} of its smallest member, and when that is empty or taken the 16-hex-digit
 *    `shortHash` of that member's path. Keys are content-derived, never a counter (ADR-004).
 * 5. Each piece becomes a destination unit `{ directory, stem: key }` of kind `split` with `oversized`. The
 *    unit itself remains as the *remainder* with its key, kind and destination flag (D-32): the removed
 *    orchestrators and utilities and the small pieces without edges to other pieces; it gets `oversized`
 *    too, and is dropped by P6 when it is empty.
 *
 * Complexity: per oversized unit, O(m_U log m_U) per Louvain pass, O((n_U + m_U) log p) for merging, and
 * O(n) for the index array of `Digraph.inducedSubgraph` (n scope nodes); O(n + U) once for the members.
 * Determinism: see the module comment. The partition is updated in place (members and prior alike).
 */
export function splitOversized(
  scope: Scope,
  prior: PriorUnits,
  classified: ClassifiedNodes,
  settings: InferenceSettings,
  stems: StemUnits,
): void {
  const { partition, paths } = prior;
  const { maxModuleFiles, minModuleFiles } = settings.modules;
  const { vocabulary } = settings;
  const unitCount = partition.units.length;
  const members = membersByUnit(partition.unitOf, unitCount);
  for (let unit = 0; unit < unitCount; unit++) {
    const original = partition.units[unit]!;
    const nodes = members[unit]!;
    // D-32: stem units are never split.
    if (original.kind === "stem" || nodes.length <= maxModuleFiles) continue;
    const { directory } = original.anchor;
    const oversized = { directory, nodes: nodes.length };
    const kept: number[] = [];
    for (const node of nodes) if (classified.excluded[node] === 0) kept.push(node);

    const pieces: Piece[] = [];
    if (kept.length > 0) {
      // Review #16: labels index the induced subgraph; `mapping` gives the scope node of each.
      const { graph: subgraph, mapping } = scope.graph.graph.inducedSubgraph(kept);
      const undirected = subgraph.toUndirected();
      const stemLabel = new Map<string, number>();
      const labels = new Int32Array(mapping.length);
      let nextLabel = 0;
      for (let local = 0; local < mapping.length; local++) {
        const token = fileStem(paths[mapping[local]!]!, vocabulary);
        if (token === undefined) {
          labels[local] = nextLabel++;
          continue;
        }
        let label = stemLabel.get(token.stem);
        if (label === undefined) {
          label = nextLabel++;
          stemLabel.set(token.stem, label);
        }
        labels[local] = label;
      }
      // D-68: every Louvain parameter is pinned.
      const result = louvain(undirected, { ...LOUVAIN_OPTIONS, initialCommunities: labels });
      const merged = mergeSmallPieces(undirected, result.communities, result.count, minModuleFiles);
      const byPiece: number[][] = Array.from({ length: merged.count }, () => []);
      for (let local = 0; local < mapping.length; local++) {
        byPiece[merged.pieces[local]!]!.push(mapping[local]!);
      }
      for (const nodesOfPiece of byPiece) {
        // Small pieces left after merging have no edge to another piece: they stay in the remainder.
        if (nodesOfPiece.length >= minModuleFiles) pieces.push({ nodes: nodesOfPiece });
      }
    }

    // D-34: keys by decreasing size, then smallest member; the taken set starts with P2's stems.
    pieces.sort((a, b) => b.nodes.length - a.nodes.length || a.nodes[0]! - b.nodes[0]!);
    const taken = new Set<string>(stems.appliedStems.get(directory) ?? []);
    for (const piece of pieces) {
      const counts = new Map<string, number>();
      for (const node of piece.nodes) {
        const token = fileStem(paths[node]!, vocabulary);
        if (token !== undefined) counts.set(token.stem, (counts.get(token.stem) ?? 0) + 1);
      }
      const candidates = [...counts.keys()].sort(
        (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || compareStrings(a, b),
      );
      let key = candidates.find((stem) => !taken.has(stem));
      let fallbackName: string | undefined;
      if (key === undefined) {
        const smallest = paths[piece.nodes[0]!]!;
        const fallback = fileNameKey(smallest);
        key = fallback !== "" && !taken.has(fallback) ? fallback : shortHash(smallest);
        fallbackName = fileNameWithoutExtension(smallest);
      }
      taken.add(key);
      const index = addUnit(
        partition,
        { directory, stem: key },
        "split",
        fallbackName === undefined ? { oversized } : { oversized, fallbackName },
      );
      for (const node of piece.nodes) partition.unitOf[node] = index;
    }
    // D-32: the remainder keeps the unit's key, kind and destination flag.
    partition.units[unit] = { ...original, oversized };
  }
}
