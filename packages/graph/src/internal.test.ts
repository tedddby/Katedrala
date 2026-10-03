import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Digraph, GraphError } from "./digraph.js";
import {
  IntMinHeap,
  KeyedMinHeap,
  adjacency,
  assertInteger,
  assertNodeIndex,
  createTarjanWorkspace,
  sortedUniqueNodes,
  tarjan,
} from "./internal.js";
import type { Direction } from "./traversal.js";

describe("validation helpers", () => {
  it("checks node indices and integer options", () => {
    const nodeCheck = (node: number) => () => {
      assertNodeIndex(3, node);
    };
    expect(nodeCheck(2)).not.toThrow();
    expect(nodeCheck(3)).toThrow(GraphError);
    expect(nodeCheck(1.5)).toThrow(GraphError);
    const integerCheck = (value: number, allowInfinity: boolean) => () => {
      assertInteger(value, "x", 0, allowInfinity);
    };
    expect(integerCheck(0, false)).not.toThrow();
    expect(integerCheck(-1, false)).toThrow(/x must be an integer >= 0/);
    expect(integerCheck(Number.POSITIVE_INFINITY, false)).toThrow(GraphError);
    expect(integerCheck(Number.POSITIVE_INFINITY, true)).not.toThrow();
    expect(integerCheck(Number.NaN, true)).toThrow(GraphError);
  });

  it("sorts and de-duplicates node lists", () => {
    expect([...sortedUniqueNodes(6, [5, 1, 5, 0], "Source")]).toEqual([0, 1, 5]);
    expect([...sortedUniqueNodes(0, [], "Source")]).toEqual([]);
    expect(() => sortedUniqueNodes(2, [2], "Source")).toThrow(/Source 2/);
  });

  it("selects adjacency by direction", () => {
    const g = Digraph.fromPairs(2, [[0, 1, 3]]);
    expect([...adjacency(g, "out").targets]).toEqual([1]);
    expect([...adjacency(g, "in").targets]).toEqual([0]);
    expect([...adjacency(g, "in").weights]).toEqual([3]);
    expect(() => adjacency(g, "both" as Direction)).toThrow(GraphError);
  });
});

describe("heaps", () => {
  it("IntMinHeap pops in ascending order and grows", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -1000, max: 1000 }), { maxLength: 200 }), (values) => {
        const heap = new IntMinHeap(1);
        for (const v of values) heap.push(v);
        expect(heap.size).toBe(values.length);
        const popped: number[] = [];
        while (heap.size > 0) popped.push(heap.pop());
        expect(popped).toEqual([...values].sort((a, b) => a - b));
      }),
    );
  });

  it("KeyedMinHeap orders by key, then by value", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: -5, max: 5 }), fc.nat(50)), { maxLength: 200 }),
        (pairs) => {
          const heap = new KeyedMinHeap(1);
          for (const [key, value] of pairs) heap.push(key, value);
          const popped: [number, number][] = [];
          while (heap.size > 0) {
            popped.push([heap.peekKey(), heap.peekValue()]);
            heap.pop();
          }
          expect(popped).toEqual([...pairs].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
        },
      ),
    );
  });
});

describe("tarjan", () => {
  it("restricts the search to a labelled subgraph", () => {
    // 0 ⇄ 1 ⇄ 2 is strongly connected, but without node 1 it falls apart.
    const g = Digraph.fromPairs(4, [
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
      [2, 0],
      [0, 3],
    ]);
    const workspace = createTarjanWorkspace(4);
    expect(tarjan(g.outOffsets, g.outTargets, null, null, 0, workspace)).toBe(2);
    expect(workspace.component[0]).toBe(workspace.component[2]);
    expect(workspace.component[3]).not.toBe(workspace.component[0]);

    const label = Int32Array.from([7, -1, 7, 7]);
    const subset = createTarjanWorkspace(4);
    const count = tarjan(
      g.outOffsets,
      g.outTargets,
      Int32Array.from([0, 2, 3]),
      label,
      7,
      subset,
      10,
    );
    expect(count).toBe(3);
    expect(subset.index[1]).toBe(-1);
    // Components are numbered from `firstComponent` in completion order: the search from root 0 completes 3,
    // then 0; root 2 completes last.
    expect([...subset.component]).toEqual([11, -1, 12, 10]);
  });
});
