/**
 * Feedback arc sets: sets of edges whose removal makes a directed graph acyclic.
 */

import type { Digraph } from "./digraph.js";
import { IntMinHeap, KeyedMinHeap } from "./internal.js";
import { stronglyConnectedComponents } from "./scc.js";

/**
 * A small feedback arc set computed with the greedy heuristic of Eades, P., Lin, X. & Smyth, W. F. 1993.
 * "A fast and effective heuristic for the feedback arc set problem". Information Processing Letters
 * 47(6):319–323. Returns the edges `[source, target]` that point backwards in the computed vertex ordering,
 * sorted ascending by source, then target; removing them leaves the graph acyclic. Finding a minimum feedback
 * arc set is NP-hard; this is a heuristic.
 *
 * The ordering is built by repeatedly removing a sink (placed at the end), else a source (placed at the
 * front), else the vertex maximizing out-degree − in-degree (placed at the front). The heuristic is applied
 * to each strongly connected component independently (edges between components are never backward when the
 * components are ordered topologically, so they never need to be removed). Self-loops are always included.
 * Within each component the result has at most half of the component's edges (each removed vertex has
 * out-degree ≥ in-degree when chosen), and at most m/2 − n/6 edges for a component without 2-cycles (Eades et
 * al. 1993).
 *
 * Determinism: ties are broken by the smallest node (smallest sink, then smallest source, then smallest node
 * among the maximizers). With parallel edges (graphs built without merging), every backward copy is listed.
 *
 * Complexity: O((n + m) log(n + m)) time, O(n + m) space. An empty array for a DAG.
 */
export function greedyFeedbackArcSet(graph: Digraph): Array<[number, number]> {
  const n = graph.nodeCount;
  const { outOffsets, outTargets, inOffsets, inSources } = graph;
  const { componentOf } = stronglyConnectedComponents(graph);
  // Degrees count only edges inside a component, without self-loops.
  const outDegree = new Int32Array(n);
  const inDegree = new Int32Array(n);
  for (let u = 0; u < n; u++) {
    const cu = componentOf[u]!;
    for (let i = outOffsets[u]!; i < outOffsets[u + 1]!; i++) {
      const v = outTargets[i]!;
      if (v === u || componentOf[v] !== cu) continue;
      outDegree[u]!++;
      inDegree[v]!++;
    }
  }
  const sinks = new IntMinHeap(n);
  const sources = new IntMinHeap(n);
  // Max (out − in) with smallest node first: min-heap on −(out − in). Entries go stale when degrees change
  // and are skipped when popped.
  const balanced = new KeyedMinHeap(n);
  for (let v = 0; v < n; v++) {
    if (outDegree[v] === 0) sinks.push(v);
    else if (inDegree[v] === 0) sources.push(v);
    else balanced.push(inDegree[v]! - outDegree[v]!, v);
  }
  const removed = new Uint8Array(n);
  const position = new Int32Array(n);
  let front = 0;
  let back = n - 1;

  const remove = (v: number): void => {
    removed[v] = 1;
    const cv = componentOf[v]!;
    for (let i = outOffsets[v]!; i < outOffsets[v + 1]!; i++) {
      const w = outTargets[i]!;
      if (w === v || removed[w] === 1 || componentOf[w] !== cv) continue;
      if (--inDegree[w]! === 0) {
        if (outDegree[w]! > 0) sources.push(w);
      } else if (outDegree[w]! > 0) {
        balanced.push(inDegree[w]! - outDegree[w]!, w);
      }
    }
    for (let i = inOffsets[v]!; i < inOffsets[v + 1]!; i++) {
      const u = inSources[i]!;
      if (u === v || removed[u] === 1 || componentOf[u] !== cv) continue;
      if (--outDegree[u]! === 0) sinks.push(u);
      else if (inDegree[u]! > 0) balanced.push(inDegree[u]! - outDegree[u]!, u);
    }
  };

  for (let placed = 0; placed < n;) {
    let v: number;
    if (sinks.size > 0) {
      v = sinks.pop();
      if (removed[v] === 1) continue;
      position[v] = back--;
    } else if (sources.size > 0) {
      v = sources.pop();
      if (removed[v] === 1) continue;
      position[v] = front++;
    } else {
      v = balanced.peekValue();
      const key = balanced.peekKey();
      balanced.pop();
      if (removed[v] === 1 || key !== inDegree[v]! - outDegree[v]!) continue;
      position[v] = front++;
    }
    remove(v);
    placed++;
  }

  const arcs: Array<[number, number]> = [];
  for (let u = 0; u < n; u++) {
    for (let i = outOffsets[u]!; i < outOffsets[u + 1]!; i++) {
      const v = outTargets[i]!;
      if (v === u || (componentOf[v] === componentOf[u] && position[v]! < position[u]!))
        arcs.push([u, v]);
    }
  }
  return arcs;
}
