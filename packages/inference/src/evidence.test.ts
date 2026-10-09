import { compareStrings, roundMetric } from "@katedrala/ir";
import type { EntityId, Evidence } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatList, formatNumber, formatPercent, inferenceInfo } from "./evidence.js";
import type { ContextSignal, InferenceInfoInput, WeightedSignal } from "./types.js";

const METHOD = "katedrala/module-inference@1";
const REASON = "Inferred: files named `payment.*` in 4 layer directories form a connected group.";

function info(
  weighted: readonly WeightedSignal[],
  context: readonly ContextSignal[] = [],
  maxEntities = 10,
) {
  return inferenceInfo({ method: METHOD, reason: REASON, weighted, context, maxEntities });
}

/** The §3.13 worked example (`mod:src#payment`): 0.40 · 0.750 + 0.25 · 0.800 + 0.20 · 1.000 + 0.15 · 5/7. */
const PAYMENT: readonly WeightedSignal[] = [
  {
    signal: "module-size",
    weight: 0.15,
    value: 5 / 7,
    description: "The module has 5 member files.",
  },
  { signal: "prior-agreement", weight: 0.2, value: 1, description: "The members match the stem." },
  { signal: "internal-edge-ratio", weight: 0.4, value: 0.75, description: "75% stays inside." },
  { signal: "membership-margin", weight: 0.25, value: 0.8, description: "80 points more." },
];

describe("inferenceInfo (§5.1, plan 4.6)", () => {
  it("sums weight × value from unrounded values, then rounds (§3.13's worked example)", () => {
    const result = info(PAYMENT);
    expect(result.confidence).toBe(roundMetric(0.3 + 0.2 + 0.2 + 0.15 * (5 / 7)));
    expect(result.confidence).toBe(0.807142857);
    expect(result.method).toBe(METHOD);
    expect(result.reason).toBe(REASON);
    // Recomputing from the rounded entries agrees within 1e-8 (D-57).
    const recomputed = result.evidence.reduce(
      (sum, entry) => sum + (entry.weight ?? 0) * (entry.value ?? 0),
      0,
    );
    expect(Math.abs(recomputed - result.confidence)).toBeLessThan(1e-8);
  });

  it("orders weighted evidence by decreasing weight × value, ties by signal (review #34)", () => {
    const result = info(PAYMENT);
    // 0.300, then 0.200 twice (`membership-margin` < `prior-agreement`), then 0.107.
    expect(result.evidence.map((entry) => entry.signal)).toEqual([
      "internal-edge-ratio",
      "membership-margin",
      "prior-agreement",
      "module-size",
    ]);
  });

  it("rounds values and weights with roundMetric (D-57)", () => {
    const result = info([
      { signal: "a", weight: 1 / 3, value: 2 / 3, description: "a" },
      { signal: "b", weight: 2 / 3, value: 1e-12 / 3, description: "b" },
    ]);
    expect(result.evidence[0]).toMatchObject({ weight: 0.333333333, value: 0.666666667 });
    expect(result.evidence[1]).toMatchObject({ weight: 0.666666667, value: 3.33333333e-13 });
    expect(result.confidence).toBe(roundMetric((1 / 3) * (2 / 3) + (2 / 3) * (1e-12 / 3)));
  });

  it("lists signals without a value with their weight, contributing 0 (D-45)", () => {
    const result = info([
      { signal: "internal-edge-ratio", weight: 0.4, description: "No member has evidence." },
      { signal: "prior-agreement", weight: 0.2, value: 0.5, description: "Half." },
      { signal: "module-size", weight: 0.4, value: 0, description: "Empty." },
    ]);
    expect(result.confidence).toBe(0.1);
    expect(result.evidence).toEqual([
      { signal: "prior-agreement", description: "Half.", value: 0.5, weight: 0.2 },
      { signal: "internal-edge-ratio", description: "No member has evidence.", weight: 0.4 },
      { signal: "module-size", description: "Empty.", value: 0, weight: 0.4 },
    ]);
  });

  it("does not check that the weights sum to 1", () => {
    expect(info([{ signal: "a", weight: 0.5, value: 1, description: "a" }]).confidence).toBe(0.5);
    expect(info([]).confidence).toBe(0);
  });

  it("puts context evidence after weighted evidence, ordered by signal, description, value, entities", () => {
    const context: ContextSignal[] = [
      { signal: "relocated-files", description: "b", entities: ["file:x.ts"] },
      { signal: "relocated-files", description: "a", value: 2 },
      { signal: "anchor-drift", description: "z", value: 0.4 },
      { signal: "relocated-files", description: "a", value: 1 },
      { signal: "relocated-files", description: "a" },
      { signal: "single-user-files", description: "s", entities: ["file:b.ts", "file:c.ts"] },
      { signal: "single-user-files", description: "s", entities: ["file:b.ts"] },
      { signal: "single-user-files", description: "s", entities: ["file:a.ts", "file:z.ts"] },
      { signal: "single-user-files", description: "s" },
    ];
    const result = info([{ signal: "w", weight: 1, value: 0, description: "w" }], context);
    expect(
      result.evidence.map((entry) => [
        entry.signal,
        entry.description,
        entry.value,
        entry.entities,
      ]),
    ).toEqual([
      ["w", "w", 0, undefined],
      ["anchor-drift", "z", 0.4, undefined],
      ["relocated-files", "a", undefined, undefined],
      ["relocated-files", "a", 1, undefined],
      ["relocated-files", "a", 2, undefined],
      ["relocated-files", "b", undefined, ["file:x.ts"]],
      ["single-user-files", "s", undefined, undefined],
      ["single-user-files", "s", undefined, ["file:a.ts", "file:z.ts"]],
      ["single-user-files", "s", undefined, ["file:b.ts"]],
      ["single-user-files", "s", undefined, ["file:b.ts", "file:c.ts"]],
    ]);
    for (const entry of result.evidence.slice(1)) expect(entry).not.toHaveProperty("weight");
  });

  it("never gives context evidence a weight", () => {
    // A weighted signal passed as context (structurally a ContextSignal) keeps no weight.
    const weightedSignal: WeightedSignal = { signal: "x", description: "x", weight: 0.5 };
    const context: ContextSignal[] = [weightedSignal];
    expect(info([], context).evidence).toEqual([{ signal: "x", description: "x" }]);
  });

  it("sorts, de-duplicates and truncates entities, and omits empty lists", () => {
    const entities: EntityId[] = [
      "file:src/c.ts",
      "file:src/a.ts",
      "file:src/b.ts",
      "file:src/a.ts",
    ];
    const result = info(
      [{ signal: "w", weight: 1, value: 1, description: "w", entities }],
      [
        { signal: "a", description: "a", entities },
        { signal: "b", description: "b", entities: [] },
      ],
      2,
    );
    expect(result.evidence.map((entry) => entry.entities)).toEqual([
      ["file:src/a.ts", "file:src/b.ts"],
      ["file:src/a.ts", "file:src/b.ts"],
      undefined,
    ]);
    expect(result.evidence[2]).not.toHaveProperty("entities");
    const none = info([], [{ signal: "a", description: "a", entities }], 0);
    expect(none.evidence).toEqual([{ signal: "a", description: "a" }]);
    // The input lists are not modified.
    expect(entities).toEqual(["file:src/c.ts", "file:src/a.ts", "file:src/b.ts", "file:src/a.ts"]);
  });

  it("creates keys in the order of the IR's Evidence and InferenceInfo", () => {
    const result = info(
      [{ signal: "w", weight: 0.5, value: 0.5, description: "w", entities: ["file:a.ts"] }],
      [{ signal: "c", description: "c", value: 3, entities: ["file:a.ts"] }],
    );
    expect(Object.keys(result)).toEqual(["confidence", "method", "reason", "evidence"]);
    expect(result.evidence.map((entry) => Object.keys(entry))).toEqual([
      ["signal", "description", "value", "weight", "entities"],
      ["signal", "description", "value", "entities"],
    ]);
  });

  it("requires a reason worded as an inference (D-66)", () => {
    const input: InferenceInfoInput = {
      method: METHOD,
      reason: "Directory `src/catalog` with 1 file reassigned in.",
      weighted: [],
      context: [],
      maxEntities: 10,
    };
    expect(() => inferenceInfo(input)).toThrow(RangeError);
    expect(() => inferenceInfo({ ...input, reason: "inferred: lower case" })).toThrow(RangeError);
    expect(inferenceInfo({ ...input, reason: "Inferred: directory `src/catalog`." }).reason).toBe(
      "Inferred: directory `src/catalog`.",
    );
  });

  it("rejects an invalid entity bound and non-finite numbers", () => {
    for (const maxEntities of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => info([], [], maxEntities)).toThrow(RangeError);
    }
    expect(() => info([{ signal: "a", weight: 1, value: Number.NaN, description: "a" }])).toThrow(
      RangeError,
    );
    expect(() =>
      info([{ signal: "a", weight: Number.POSITIVE_INFINITY, description: "a" }]),
    ).toThrow(RangeError);
    expect(() => info([], [{ signal: "a", description: "a", value: Number.NaN }])).toThrow(
      RangeError,
    );
  });

  it("is a function of the signals, not of their order, and follows plan 4.6 (property)", () => {
    const entity = fc.constantFrom<EntityId>("file:a.ts", "file:b.ts", "file:c.ts", "mod:src");
    const weightedSignal: fc.Arbitrary<WeightedSignal> = fc.record(
      {
        signal: fc.constantFrom(
          "internal-edge-ratio",
          "membership-margin",
          "prior-agreement",
          "module-size",
        ),
        weight: fc.integer({ min: 0, max: 20 }).map((k) => k / 20),
        value: fc.oneof(
          fc.constantFrom(0, 0.25, 0.5, 1),
          fc.double({ min: 0, max: 1, noNaN: true }),
        ),
        description: fc.constantFrom("a", "b"),
        entities: fc.array(entity, { maxLength: 4 }),
      },
      { requiredKeys: ["signal", "weight", "description"] },
    );
    const contextSignal: fc.Arbitrary<ContextSignal> = fc.record(
      {
        signal: fc.constantFrom("relocated-files", "single-user-files", "anchor-drift"),
        description: fc.constantFrom("a", "b"),
        value: fc.constantFrom(0, 1, 2.5, 7),
        entities: fc.array(entity, { maxLength: 4 }),
      },
      { requiredKeys: ["signal", "description"] },
    );
    fc.assert(
      fc.property(
        fc.array(weightedSignal, { maxLength: 5 }),
        fc.array(contextSignal, { maxLength: 6 }),
        fc.nat(5),
        fc.integer(),
        (weighted, context, maxEntities, seed) => {
          const result = info(weighted, context, maxEntities);
          const rotate = <T>(items: readonly T[]): T[] =>
            items.length === 0
              ? []
              : [
                  ...items.slice(seed % items.length),
                  ...items.slice(0, seed % items.length),
                ].reverse();
          expect(info(rotate(weighted), rotate(context), maxEntities)).toEqual(result);

          const published = result.evidence.slice(0, weighted.length);
          const rest = result.evidence.slice(weighted.length);
          // The confidence is the rounded weighted sum; recomputation from rounded entries within 1e-8.
          const exact = weighted.reduce(
            (sum, signal) => sum + signal.weight * (signal.value ?? 0),
            0,
          );
          expect(Math.abs(result.confidence - exact)).toBeLessThan(1e-8);
          const recomputed = published.reduce((s, e) => s + (e.weight ?? 0) * (e.value ?? 0), 0);
          expect(Math.abs(result.confidence - recomputed)).toBeLessThan(1e-8);
          // Weighted entries first, by decreasing contribution, then signal; context entries have no weight.
          for (const entry of published) expect(entry.weight).toBeDefined();
          for (const entry of rest) expect(entry.weight).toBeUndefined();
          const contribution = (entry: Evidence): number =>
            (entry.weight ?? 0) * (entry.value ?? 0);
          for (let i = 1; i < published.length; i++) {
            const [a, b] = [published[i - 1]!, published[i]!];
            expect(
              contribution(a) > contribution(b) ||
                (contribution(a) === contribution(b) && compareStrings(a.signal, b.signal) <= 0),
            ).toBe(true);
          }
          for (let i = 1; i < rest.length; i++) {
            expect(compareStrings(rest[i - 1]!.signal, rest[i]!.signal)).toBeLessThanOrEqual(0);
          }
          // Entity lists are sorted, unique, bounded and never empty.
          for (const entry of result.evidence) {
            if (entry.entities === undefined) continue;
            expect(entry.entities.length).toBeGreaterThan(0);
            expect(entry.entities.length).toBeLessThanOrEqual(maxEntities);
            expect(entry.entities).toEqual([...new Set(entry.entities)].sort(compareStrings));
          }
        },
      ),
      { seed: 20261008, numRuns: 500 },
    );
  });
});

describe("formatPercent (D-58)", () => {
  it("formats shares as integer percentages from the published value", () => {
    expect(formatPercent(0.75)).toBe("75%");
    expect(formatPercent(6 / 7)).toBe("86%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
    // 0.285 · 100 is 28.499999999999996 in binary; the published 0.285 reads as 29% (half up, as toFixed).
    expect(formatPercent(0.285)).toBe("29%");
    expect(formatPercent(0.005)).toBe("1%");
    expect(formatPercent(0.004999)).toBe("0%");
    expect(formatPercent(-0.001)).toBe("0%");
    expect(formatPercent(-0.25)).toBe("-25%");
  });

  it("rejects non-finite values", () => {
    expect(() => formatPercent(Number.NaN)).toThrow(RangeError);
    expect(() => formatPercent(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("formatNumber (D-58)", () => {
  it("formats with a fixed number of decimals from the published value", () => {
    expect(formatNumber(3, 1)).toBe("3.0");
    expect(formatNumber(4, 1)).toBe("4.0");
    expect(formatNumber(5 / 7, 2)).toBe("0.71");
    expect(formatNumber(5 / 7, 3)).toBe("0.714");
    expect(formatNumber(0.125, 2)).toBe("0.13");
    expect(formatNumber(2.5, 0)).toBe("3");
    expect(formatNumber(1234.5678, 1)).toBe("1234.6");
    // Rounded with roundMetric first: nine significant digits, then padded.
    expect(formatNumber(1 / 3, 12)).toBe("0.333333333000");
    expect(formatNumber(1e-12, 3)).toBe("0.000");
  });

  it("writes no minus sign on a result that reads as zero", () => {
    expect(formatNumber(-0.0001, 2)).toBe("0.00");
    expect(formatNumber(-0, 1)).toBe("0.0");
    expect(formatNumber(-0.4, 0)).toBe("0");
    expect(formatNumber(-0.6, 0)).toBe("-1");
    expect(formatNumber(-1.25, 1)).toBe("-1.3");
  });

  it("rejects non-finite values and invalid digit counts", () => {
    expect(() => formatNumber(Number.NaN, 1)).toThrow(RangeError);
    expect(() => formatNumber(1, 101)).toThrow(RangeError);
    expect(() => formatNumber(1, -1)).toThrow(RangeError);
  });
});

describe("formatList", () => {
  it("joins items as an English list in the given order", () => {
    expect(formatList([])).toBe("");
    expect(formatList(["order"])).toBe("order");
    expect(formatList(["order", "payment"])).toBe("order and payment");
    expect(formatList(["order", "payment", "user"])).toBe("order, payment and user");
    expect(formatList(["z", "a", "m", "b"])).toBe("z, a, m and b");
  });
});
