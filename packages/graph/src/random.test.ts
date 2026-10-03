import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GraphError } from "./digraph.js";
import { createRandom, sampleWithoutReplacement } from "./random.js";

const draw = (seed: number, count: number): number[] => {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => random());
};

describe("createRandom", () => {
  it.each([
    [0, [1144304738, 1416247, 958946056, 627933444, 2007157716]],
    [1, [2693262067, 11749833, 2265367787, 4213581821, 4159151403]],
    [42, [2581720956, 1925393290, 3661312704, 2876485805, 750819978]],
  ])("matches the reference mulberry32 stream for seed %i", (seed, expected) => {
    // Reference values from Tommy Ettinger's original mulberry32 (outputs scaled by 2^32).
    expect(draw(seed, 5).map((x) => x * 4294967296)).toEqual(expected);
  });

  it("reduces seeds modulo 2^32", () => {
    expect(draw(2 ** 32, 3)).toEqual(draw(0, 3));
    expect(draw(-1, 3)).toEqual(draw(2 ** 32 - 1, 3));
  });

  it("is deterministic per seed and differs between seeds", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(draw(a, 8)).toEqual(draw(a, 8));
        if (a !== b) expect(draw(a, 8)).not.toEqual(draw(b, 8));
      }),
    );
  });

  it("returns numbers in [0, 1) with a plausible distribution", () => {
    const random = createRandom(7);
    const buckets = new Array<number>(10).fill(0);
    const samples = 100_000;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const x = random();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
      buckets[Math.floor(x * 10)]!++;
    }
    expect(sum / samples).toBeCloseTo(0.5, 2);
    // Chi-square with 9 degrees of freedom; 27.9 is the 0.999 quantile.
    const expected = samples / 10;
    const chiSquare = buckets.reduce((acc, count) => acc + (count - expected) ** 2 / expected, 0);
    expect(chiSquare).toBeLessThan(27.9);
  });

  it("rejects seeds that are not safe integers", () => {
    expect(() => createRandom(1.5)).toThrow(GraphError);
    expect(() => createRandom(Number.NaN)).toThrow(GraphError);
    expect(() => createRandom(2 ** 60)).toThrow(GraphError);
  });
});

describe("sampleWithoutReplacement", () => {
  it("handles the boundary sizes", () => {
    expect([...sampleWithoutReplacement(0, 0, createRandom(1))]).toEqual([]);
    expect([...sampleWithoutReplacement(5, 0, createRandom(1))]).toEqual([]);
    expect([...sampleWithoutReplacement(5, 5, createRandom(1))]).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns k distinct sorted integers below n, deterministically", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 0, max: 200 })
          .chain((n) => fc.tuple(fc.constant(n), fc.nat(n), fc.integer())),
        ([n, k, seed]) => {
          const sample = sampleWithoutReplacement(n, k, createRandom(seed));
          expect(sample.length).toBe(k);
          for (let i = 0; i < k; i++) {
            expect(sample[i]).toBeGreaterThanOrEqual(0);
            expect(sample[i]).toBeLessThan(n);
            if (i > 0) expect(sample[i]).toBeGreaterThan(sample[i - 1]!);
          }
          expect(sampleWithoutReplacement(n, k, createRandom(seed))).toEqual(sample);
        },
      ),
    );
  });

  it("includes every element with probability k/n", () => {
    const n = 20;
    const k = 5;
    const trials = 20_000;
    const random = createRandom(2024);
    const hits = new Array<number>(n).fill(0);
    for (let t = 0; t < trials; t++) {
      for (const x of sampleWithoutReplacement(n, k, random)) hits[x]!++;
    }
    const expected = (trials * k) / n; // 5000, binomial standard deviation ≈ 61
    for (const count of hits) expect(Math.abs(count - expected)).toBeLessThan(300);
  });

  it("rejects invalid sizes", () => {
    const random = createRandom(1);
    expect(() => sampleWithoutReplacement(3, 4, random)).toThrow(GraphError);
    expect(() => sampleWithoutReplacement(3, -1, random)).toThrow(GraphError);
    expect(() => sampleWithoutReplacement(-1, 0, random)).toThrow(GraphError);
    expect(() => sampleWithoutReplacement(3.5, 1, random)).toThrow(GraphError);
  });
});
