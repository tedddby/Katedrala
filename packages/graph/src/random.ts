/**
 * Seeded pseudo-random numbers for the few algorithms that sample (sampled betweenness, reachability
 * sketches). Katedrala's output must be reproducible, so `Math.random` is never used: every random choice
 * flows from an explicit integer seed through the generator below.
 */

import { GraphError } from "./digraph.js";

/** A source of pseudo-random numbers uniformly distributed in `[0, 1)`. */
export type RandomSource = () => number;

/**
 * Create a seeded pseudo-random number generator returning numbers uniformly distributed in `[0, 1)`.
 *
 * The generator is **mulberry32** (Tommy Ettinger, 2017; public domain): a 32-bit state advanced by the Weyl
 * increment `0x6d2b79f5` and finalized by an xorshift-multiply mixer. It has a period of 2^32, returns
 * multiples of 2^-32, and is fast and statistically adequate for sampling and sketching. It is **not**
 * cryptographically secure.
 *
 * Complexity: O(1) per call. Determinism: the sequence is a pure function of `seed`; it is identical on every
 * platform because only 32-bit integer arithmetic (`Math.imul`, shifts) is involved.
 *
 * @param seed - any safe integer; it is reduced modulo 2^32, so `seed` and `seed + 2^32` give the same
 * stream.
 * @throws GraphError if `seed` is not a safe integer.
 */
export function createRandom(seed: number): RandomSource {
  if (!Number.isSafeInteger(seed))
    throw new GraphError(`Random seed must be a safe integer (got ${seed})`);
  // ToUint32 reduces any safe integer exactly modulo 2^32.
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw `k` distinct integers uniformly at random from `0 .. n - 1` and return them sorted ascending.
 *
 * Uses Floyd's algorithm (Bentley, J. & Floyd, R. 1987. "Programming pearls: a sample of brilliance".
 * Communications of the ACM 30(9):754–757), which consumes exactly `k` random numbers and needs no O(n)
 * scratch array. Every k-subset is equally likely up to the 2^-32 granularity of `random`.
 *
 * Complexity: O(k log k) time, O(k) space. Determinism: the result is a pure function of `n`, `k` and the
 * state of `random`.
 *
 * @throws GraphError unless `n` and `k` are integers with `0 <= k <= n`.
 */
export function sampleWithoutReplacement(n: number, k: number, random: RandomSource): Int32Array {
  if (!Number.isInteger(n) || n < 0 || n > 0x7fffffff) {
    throw new GraphError(`Population size must be a non-negative 32-bit integer (got ${n})`);
  }
  if (!Number.isInteger(k) || k < 0 || k > n) {
    throw new GraphError(`Sample size must be an integer between 0 and ${n} (got ${k})`);
  }
  const chosen = new Set<number>();
  for (let j = n - k; j < n; j++) {
    const t = Math.floor(random() * (j + 1));
    chosen.add(chosen.has(t) ? j : t);
  }
  return Int32Array.from(chosen).sort();
}
