/**
 * Cycle queries: the shortest cycle through a node, and enumeration of elementary (simple) cycles.
 */

import type { Digraph } from "./digraph.js";
import { assertInteger, assertNodeIndex, createTarjanWorkspace, tarjan } from "./internal.js";

/** Options of {@link elementaryCycles}. */
export interface ElementaryCyclesOptions {
  /**
   * Stop after this many cycles (a non-negative integer or `Infinity`). Graphs can have exponentially many
   * elementary cycles, so a limit is required.
   */
  maxCycles: number;
  /** Only report cycles of at most this many nodes (= edges); a positive integer or `Infinity` (default). */
  maxLength?: number;
}

/** Result of {@link elementaryCycles}. */
export interface ElementaryCyclesResult {
  /**
   * The cycles, each as its node sequence starting at its smallest node (the closing edge from the last node
   * back to the first is implied; a self-loop is `[v]`), listed in lexicographic order of these sequences.
   */
  readonly cycles: number[][];
  /** Whether more cycles (within `maxLength`) exist than were returned. */
  readonly truncated: boolean;
}

/**
 * A shortest cycle through `node`: the node sequence of a cycle with the fewest edges that starts at `node`
 * (consecutive nodes are joined by edges and the last node has an edge back to `node`), `[node]` for a
 * self-loop, or `undefined` when `node` lies on no cycle.
 *
 * Breadth-first search from `node` until an edge back to `node` is found. Ties between equally short cycles
 * are broken by breadth-first order with neighbours ascending, so the result is deterministic.
 *
 * Complexity: O(n + m) time, O(n) space. Reference: Moore, E. F. 1959. "The shortest path through a maze".
 * Proceedings of the International Symposium on the Theory of Switching, 285–292.
 *
 * @throws GraphError if `node` is not a node.
 */
export function shortestCycleThrough(graph: Digraph, node: number): number[] | undefined {
  const n = graph.nodeCount;
  assertNodeIndex(n, node);
  if (graph.hasEdge(node, node)) return [node];
  const { outOffsets: offsets, outTargets: targets } = graph;
  const parent = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  parent[node] = node;
  queue[0] = node;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const v = queue[head]!;
    for (let i = offsets[v]!; i < offsets[v + 1]!; i++) {
      const w = targets[i]!;
      if (w === node) {
        const cycle: number[] = [];
        for (let x = v; x !== node; x = parent[x]!) cycle.push(x);
        cycle.push(node);
        return cycle.reverse();
      }
      if (parent[w] !== -1) continue;
      parent[w] = v;
      queue[tail++] = w;
    }
  }
  return undefined;
}

/**
 * Enumerate the elementary cycles (closed paths without repeated nodes) of a directed graph, up to
 * `maxCycles` of them and optionally only those with at most `maxLength` nodes.
 *
 * Algorithm: Johnson, D. B. 1975. "Finding all the elementary circuits of a directed graph". SIAM Journal on
 * Computing 4(1):77–84. Start vertices are taken in ascending order; for each start `s`, the circuits
 * through `s` are searched within the strongly connected component of `s` in the subgraph induced by the
 * nodes not yet used as starts, so every cycle is reported exactly once, beginning at its smallest node.
 * Blocking (Johnson's B-lists) makes the time O((n + m)(c + 1)) for c cycles, i.e. polynomial per cycle.
 *
 * In components with more than `maxLength` (L) nodes, the length-bounded variant of Johnson's search by
 * Gupta, A. & Suzumura, T. 2021. "Finding all bounded-length simple cycles in a directed graph"
 * (arXiv:2105.10094) is used instead. Blocking becomes a per-node depth lock: a node entered at depth d
 * (edges from the start) is locked at d, so it is entered again only at a smaller depth until a cycle found
 * later relaxes its lock. A node with no cycle below it joins the B-lists of its successors, as in Johnson's
 * algorithm. A node with a cycle below it is unlocked completely, and every node off the stack that reaches
 * it in j B-list steps gets lock L − j unless its lock is higher. This deviates from the paper, which locks
 * such a node at L − b + 1 for the shortest way back (of length b) its search found. That lock is never
 * raised when a node on the stack that blocked a shorter way back is popped, so cycles through that way are
 * lost (the proof of the paper's Lemma 2 overlooks ways back blocked by the stack). The invariant kept
 * instead implies that no node is refused at a depth from which it can still reach the start within the
 * bound, so no cycle is missed: among the nodes off the stack, a node with an edge to the start has lock L,
 * and every node's lock is at most one below the lock of each successor.
 *
 * Without cycles, locks only decrease, so a node is entered at most L − 1 times per start, at strictly
 * decreasing depths. Each reported cycle accounts for at most L relaxations (one per node on the stack when
 * it was reported); a relaxation raises every lock at most once, and each raise allows at most L − 1 more
 * entries of that node. A start thus costs O(L·(n + m)) plus O(L²·(n + m)) per reported cycle.
 *
 * The bounded search's state is reset lazily, so a start costs time proportional to the part of the
 * component its search explores. The component is only re-split into strongly connected components once
 * the search work spent in it since the last split exceeds the cost of a split times a patience factor,
 * which doubles whenever a re-split keeps more than half of the component's nodes together (and is 1
 * otherwise). Re-splits thus cost at most as much as the searches, while the parts of the component that can
 * no longer contain cycles are still discarded. Both searches use explicit stacks (no recursion), so long
 * cycles are safe.
 *
 * Determinism: neighbours are scanned in ascending order and pruning only removes branches without cycles,
 * so cycles come out in lexicographic order of their node sequences, and a truncated result is always the
 * same prefix of that order. Parallel edges (in graphs built without merging) do not produce duplicates.
 *
 * Space: O(n + m) besides the output.
 *
 * @throws GraphError if `maxCycles` or `maxLength` is invalid.
 */
export function elementaryCycles(
  graph: Digraph,
  options: ElementaryCyclesOptions,
): ElementaryCyclesResult {
  const { maxCycles, maxLength = Number.POSITIVE_INFINITY } = options;
  assertInteger(maxCycles, "maxCycles", 0, true);
  assertInteger(maxLength, "maxLength", 1, true);
  const n = graph.nodeCount;
  const { outOffsets: offsets, outTargets: targets } = graph;

  // Live components: every node v with label[v] = id >= 0 belongs to the live component `id`; label -1 marks
  // nodes that can lie on no cycle that has not been reported yet (including every start already used).
  // members[id] lists the component's nodes when it was formed, ascending. Components of at most maxLength
  // nodes (Johnson mode) are re-split after every start, so their members are exactly the live nodes.
  // Larger ones (bounded mode) are re-split once `work[id]` reaches `splitCost[id] * patience[id]`.
  const label = new Int32Array(n);
  const members: (Int32Array | undefined)[] = [];
  const splitCost: number[] = [];
  const work: number[] = [];
  const patience: number[] = [];
  const workspace = createTarjanWorkspace(n);

  /**
   * Replace the live component `token` (live nodes `nodes`) by its nontrivial strong components. For a
   * bounded-mode re-split, `previousPatience` is the component's patience: a group that keeps more than half
   * of the nodes gets twice that (the split barely paid off, so the next one waits for twice the work);
   * every other group gets 1.
   */
  const split = (nodes: Int32Array, token: number, previousPatience = 0): void => {
    const { index, component } = workspace;
    for (const v of nodes) {
      index[v] = -1;
      component[v] = -1;
    }
    const rawCount = tarjan(offsets, targets, nodes, label, token, workspace);
    const groupOf = new Int32Array(rawCount).fill(-1);
    const sizes: number[] = [];
    for (const v of nodes) {
      const raw = component[v]!;
      if (groupOf[raw] === -1) {
        groupOf[raw] = sizes.length;
        sizes.push(0);
      }
      sizes[groupOf[raw]!]!++;
    }
    const groups = sizes.map((size) => new Int32Array(size));
    const fill = new Int32Array(groups.length);
    for (const v of nodes) {
      const g = groupOf[component[v]!]!;
      groups[g]![fill[g]!++] = v;
    }
    for (const group of groups) {
      const first = group[0]!;
      if (group.length > 1 || graph.hasEdge(first, first)) {
        const id = members.length;
        let cost = 0;
        for (const v of group) {
          label[v] = id;
          cost += 1 + offsets[v + 1]! - offsets[v]!;
        }
        members.push(group);
        splitCost.push(cost);
        work.push(0);
        const together = previousPatience > 0 && 2 * group.length > nodes.length;
        patience.push(together ? 2 * previousPatience : 1);
      } else {
        label[first] = -1;
      }
    }
  };

  const cycles: number[][] = [];
  let truncated = false;
  const path = new Int32Array(n);
  const cursor = new Int32Array(n);
  /** Whether a cycle was found below each path entry. */
  const found = new Uint8Array(n);
  /** Johnson: blocked flags. Bounded: depth locks (a node may only be entered at a depth below its lock). */
  const block = new Int32Array(n);
  const onPath = new Uint8Array(n);
  /** Johnson's B-lists. */
  const blockers = new Array<Set<number> | undefined>(n);
  const pending: number[] = [];
  const pendingLock: number[] = [];
  // Bounded searches reset their state lazily: a node's lock and B-list are valid only while stamp[v] is
  // the current start, so a search costs time proportional to the region it explores. Their B-lists are
  // linked lists in a pool (the list of w starts at entry listHead[w]; entry k holds node listNode[k] and
  // continues at listNext[k]). A node joins the lists of its successors at most once per start (`listed`),
  // since list membership lasts until the start ends, so the pool needs at most one entry per edge.
  const stamp = new Int32Array(n).fill(-1);
  let currentStart = -1;
  const listHead = new Int32Array(n);
  const listed = new Uint8Array(n);
  const poolSize = maxLength < n ? graph.edgeCount : 0;
  const listNode = new Int32Array(poolSize);
  const listNext = new Int32Array(poolSize);
  let listSize = 0;
  const fresh = (v: number): void => {
    if (stamp[v] === currentStart) return;
    stamp[v] = currentStart;
    block[v] = maxLength;
    listHead[v] = -1;
    listed[v] = 0;
  };

  /** Record the cycle `path[0 .. depth)`; returns false (and marks truncation) once the limit is exceeded. */
  const emit = (depth: number): boolean => {
    if (cycles.length >= maxCycles) {
      truncated = true;
      return false;
    }
    cycles.push(Array.from(path.subarray(0, depth)));
    return true;
  };

  /** Add `v` to Johnson's B-list of `w`. */
  const addBlocker = (w: number, v: number): void => {
    let set = blockers[w];
    if (set === undefined) {
      set = new Set<number>();
      blockers[w] = set;
    }
    set.add(v);
  };

  /** Johnson's UNBLOCK, with an explicit stack. */
  const unblock = (u: number): void => {
    pending.length = 0;
    pending.push(u);
    while (pending.length > 0) {
      const x = pending.pop()!;
      if (block[x] === 0) continue;
      block[x] = 0;
      const set = blockers[x];
      if (set === undefined) continue;
      for (const y of set) pending.push(y);
      set.clear();
    }
  };

  /**
   * Gupta & Suzumura's RELAX_LOCKS, with the deviation described at {@link elementaryCycles}, for `u`, just
   * popped with a cycle below it: unlock `u` (lock `maxLength`) and give every node off the stack that
   * reaches `u` in j B-list steps the lock `maxLength − j`, unless its lock is higher. Breadth-first, so
   * every lock rises at most once. Returns the number of queue entries processed (search work).
   */
  const relax = (u: number): number => {
    pending.length = 0;
    pendingLock.length = 0;
    pending.push(u);
    pendingLock.push(maxLength);
    let head = 0;
    for (; head < pending.length; head++) {
      const x = pending[head]!;
      const lock = pendingLock[head]!;
      fresh(x);
      if (block[x]! >= lock) continue;
      block[x] = lock;
      for (let k = listHead[x]!; k !== -1; k = listNext[k]!) {
        const y = listNode[k]!;
        if (onPath[y] === 1) continue;
        pending.push(y);
        pendingLock.push(lock - 1);
      }
    }
    return head;
  };

  /** Johnson's CIRCUIT from `s` within component `id`; returns false when the cycle limit stopped it. */
  const johnson = (s: number, id: number, nodes: Int32Array): boolean => {
    for (const v of nodes) {
      block[v] = 0;
      blockers[v]?.clear();
    }
    path[0] = s;
    cursor[0] = offsets[s]!;
    found[0] = 0;
    block[s] = 1;
    let depth = 1;
    while (depth > 0) {
      const v = path[depth - 1]!;
      const i = cursor[depth - 1]!;
      if (i < offsets[v + 1]!) {
        cursor[depth - 1] = i + 1;
        const w = targets[i]!;
        if (label[w] !== id || (i > offsets[v]! && targets[i - 1] === w)) continue;
        if (w === s) {
          if (!emit(depth)) return false;
          found[depth - 1] = 1;
        } else if (block[w] === 0) {
          path[depth] = w;
          cursor[depth] = offsets[w]!;
          found[depth] = 0;
          block[w] = 1;
          depth++;
        }
        continue;
      }
      depth--;
      if (found[depth] === 1) {
        if (depth > 0) found[depth - 1] = 1;
        unblock(v);
      } else {
        for (let j = offsets[v]!; j < offsets[v + 1]!; j++) {
          const w = targets[j]!;
          if (label[w] === id) addBlocker(w, v);
        }
      }
    }
    return true;
  };

  /**
   * Length-bounded search (Gupta & Suzumura 2021, with the relaxation described at
   * {@link elementaryCycles}) from `s` within component `id`, whose live nodes other than `s` are all larger
   * than `s`. Returns the work done, or -1 when the cycle limit stopped it.
   */
  const bounded = (s: number, id: number): number => {
    let steps = 0;
    currentStart = s;
    listSize = 0;
    fresh(s);
    block[s] = 0;
    path[0] = s;
    cursor[0] = offsets[s]!;
    found[0] = 0;
    onPath[s] = 1;
    let depth = 1;
    while (depth > 0) {
      steps++;
      const v = path[depth - 1]!;
      const i = cursor[depth - 1]!;
      if (i < offsets[v + 1]!) {
        cursor[depth - 1] = i + 1;
        const w = targets[i]!;
        if (label[w] !== id || (i > offsets[v]! && targets[i - 1] === w)) continue;
        if (w === s) {
          if (!emit(depth)) return -1;
          found[depth - 1] = 1;
          continue;
        }
        fresh(w);
        // `w` would be at depth `depth`: enter it only below its lock, and lock it at that depth (the
        // paper's Lock(w) = flen), so that it is entered again only at a smaller depth.
        if (depth < block[w]!) {
          block[w] = depth;
          path[depth] = w;
          cursor[depth] = offsets[w]!;
          found[depth] = 0;
          onPath[w] = 1;
          depth++;
        }
        continue;
      }
      depth--;
      onPath[v] = 0;
      if (found[depth] === 1) {
        if (depth > 0) found[depth - 1] = 1;
        steps += relax(v);
      } else if (listed[v] === 0) {
        listed[v] = 1;
        for (let j = offsets[v]!; j < offsets[v + 1]!; j++) {
          steps++;
          const w = targets[j]!;
          if (w === s || label[w] !== id || (j > offsets[v]! && targets[j - 1] === w)) continue;
          fresh(w);
          listNode[listSize] = v;
          listNext[listSize] = listHead[w]!;
          listHead[w] = listSize++;
        }
      }
    }
    return steps;
  };

  // Initially every node carries label 0: one placeholder component that the first split replaces.
  if (n > 0)
    split(
      Int32Array.from({ length: n }, (_, v) => v),
      0,
    );
  for (let s = 0; s < n; s++) {
    const id = label[s]!;
    if (id < 0) continue;
    const nodes = members[id]!;
    if (nodes.length <= maxLength) {
      // Johnson mode: nodes[0] === s, since every smaller node has been used as a start or is on no cycle.
      if (!johnson(s, id, nodes)) break;
      members[id] = undefined;
      label[s] = -1;
      split(nodes.subarray(1), id);
      continue;
    }
    const steps = bounded(s, id);
    if (steps < 0) break;
    label[s] = -1;
    work[id]! += steps;
    if (work[id]! >= splitCost[id]! * patience[id]!) {
      members[id] = undefined;
      split(
        nodes.filter((v) => label[v] === id),
        id,
        patience[id],
      );
    }
  }
  return { cycles, truncated };
}
