import { fileId } from "@katedrala/ir";
import type { FileId } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { InferenceSettings } from "../types.js";
import { structuralClasses } from "./classes.js";
import { priorUnits } from "./prior.js";
import type { PriorUnits } from "./prior.js";
import { reassign } from "./reassign.js";
import type { Reassignment } from "./reassign.js";
import {
  arbitraryScope,
  DEFAULT_SETTINGS,
  partitionLines,
  referenceReassign,
  testScope,
  withModuleSettings,
} from "./reference.test-support.js";
import type { TestArc, TestScopeSpec } from "./reference.test-support.js";
import { splitOversized } from "./split.js";
import { applyStemUnits } from "./stems.js";

interface Run {
  readonly prior: PriorUnits;
  readonly result: Reassignment;
  /** Units after P5 as `key kind[*] = paths`. */
  readonly units: string[];
  /** Relocations as `path: from -> to`. */
  readonly moves: string[];
}

/** P1–P5 on a test scope. */
function run(
  spec: TestScopeSpec,
  options: { readonly settings?: InferenceSettings; readonly entryPoints?: readonly string[] } = {},
): Run {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const scope = testScope(spec);
  const prior = priorUnits(scope, settings);
  const stems = applyStemUnits(scope, prior, settings);
  const entryPoints = new Set<FileId>((options.entryPoints ?? []).map((path) => fileId(path)));
  const classified = structuralClasses(scope, prior.partition, settings, entryPoints);
  splitOversized(scope, prior, classified, settings, stems);
  const result = reassign(scope, prior.partition, classified, settings);
  return {
    prior,
    result,
    units: partitionLines(prior.paths, prior.partition),
    moves: result.relocations.map(
      (move) => `${prior.paths[move.node] ?? "?"}: ${move.from} -> ${move.to}`,
    ),
  };
}

/** The base case: `src/a/f.ts` is used by two files of `src/b` and uses one; it moves to `src/b`. */
const BASE_PATHS = [
  "src/a/f.ts",
  "src/a/peer.ts",
  "src/b/u1.ts",
  "src/b/u2.ts",
  "src/b/u3.ts",
  "src/c/v1.ts",
  "src/c/v2.ts",
  "src/c/w.ts",
];
const BASE_ARCS: readonly TestArc[] = [
  ["src/b/u1.ts", "src/a/f.ts"],
  ["src/b/u2.ts", "src/a/f.ts"],
  ["src/a/f.ts", "src/b/u3.ts"],
];

describe("reassign (P5, §3.9)", () => {
  it("moves a file to the destination holding a strict majority of its dependents", () => {
    const result = run({ paths: BASE_PATHS, arcs: BASE_ARCS });
    expect(result.moves).toEqual(["src/a/f.ts: src/a -> src/b"]);
    expect(result.result).toMatchObject({ passes: 2, converged: true });
    const [move] = result.result.relocations;
    expect(move?.dependents).toEqual(new Map([["src/b", { weight: 2, files: 2 }]]));
    expect(move?.dependencies).toEqual(new Map([["src/b", 1]]));
    // The prior assignment is kept.
    expect(result.prior.partition.units[result.result.priorOf[0] ?? -1]?.key).toBe("src/a");
  });

  describe("each condition failing alone", () => {
    it("1: never moves into its own unit or into a unit that is not a destination (D-35)", () => {
      const own = run({
        paths: [...BASE_PATHS, "src/a/x1.ts", "src/a/x2.ts", "src/a/x3.ts"],
        arcs: [
          ...BASE_ARCS,
          ["src/a/x1.ts", "src/a/f.ts"],
          ["src/a/x2.ts", "src/a/f.ts"],
          ["src/a/x3.ts", "src/a/f.ts"],
        ],
      });
      expect(own.moves).toEqual([]);
      const layer = run({
        paths: [
          "src/a/f.ts",
          "src/a/peer.ts",
          "src/services/u1.ts",
          "src/services/u2.ts",
          "src/services/u3.ts",
        ],
        arcs: [
          ["src/services/u1.ts", "src/a/f.ts"],
          ["src/services/u2.ts", "src/a/f.ts"],
          ["src/a/f.ts", "src/services/u3.ts"],
        ],
      });
      expect(layer.moves).toEqual([]);
    });

    it("2: needs strictly more than half of the dependents' weight", () => {
      const half = run({
        paths: BASE_PATHS,
        arcs: [...BASE_ARCS, ["src/c/v1.ts", "src/a/f.ts"], ["src/c/v2.ts", "src/a/f.ts"]],
      });
      expect(half.moves).toEqual([]);
      const more = run({
        paths: BASE_PATHS,
        arcs: [...BASE_ARCS, ["src/c/v1.ts", "src/a/f.ts"], ["src/c/v2.ts", "src/a/f.ts", 0.5]],
      });
      expect(more.moves).toEqual(["src/a/f.ts: src/a -> src/b"]);
    });

    it("3: needs at least moveMinWeight", () => {
      const light: TestArc[] = [
        ["src/b/u1.ts", "src/a/f.ts", 0.25],
        ["src/b/u2.ts", "src/a/f.ts", 0.25],
        ["src/a/f.ts", "src/b/u3.ts"],
      ];
      expect(run({ paths: BASE_PATHS, arcs: light }).moves).toEqual([]);
      const settings = withModuleSettings({ moveMinWeight: 0.5 });
      expect(run({ paths: BASE_PATHS, arcs: light }, { settings }).moves).toEqual([
        "src/a/f.ts: src/a -> src/b",
      ]);
    });

    it("4: needs moveMinSupport dependent files, or one when the file is alone in its unit (D-74)", () => {
      const one: TestArc[] = [
        ["src/b/u1.ts", "src/a/f.ts"],
        ["src/a/f.ts", "src/b/u3.ts"],
      ];
      expect(run({ paths: BASE_PATHS, arcs: one }).moves).toEqual([]);
      const lone = run({ paths: BASE_PATHS.filter((path) => path !== "src/a/peer.ts"), arcs: one });
      expect(lone.moves).toEqual(["src/a/f.ts: src/a -> src/b"]);
      expect(lone.units).toContain("src/a feature* = ");
      const settings = withModuleSettings({ moveMinSupport: 3 });
      expect(run({ paths: BASE_PATHS, arcs: BASE_ARCS }, { settings }).moves).toEqual([]);
    });

    it("5: needs no dependencies, or strictly more than half of their weight in the destination", () => {
      const split = run({ paths: BASE_PATHS, arcs: [...BASE_ARCS, ["src/a/f.ts", "src/c/w.ts"]] });
      expect(split.moves).toEqual([]);
      const none = run({ paths: BASE_PATHS, arcs: BASE_ARCS.slice(0, 2) });
      expect(none.moves).toEqual(["src/a/f.ts: src/a -> src/b"]);
      expect(none.result.relocations[0]?.dependencies).toEqual(new Map());
    });
  });

  it("decides a tie for the largest in-weight by the smallest key, which never wins a strict majority", () => {
    const tie = run({
      paths: BASE_PATHS,
      arcs: [
        ["src/b/u1.ts", "src/a/f.ts"],
        ["src/c/v1.ts", "src/a/f.ts"],
        ["src/a/f.ts", "src/b/u3.ts"],
      ],
    });
    expect(tie.moves).toEqual([]);
  });

  it("ignores the arcs of composition roots and utilities, and never moves pinned files", () => {
    // Three composition roots in `src/c` use `f`: without them, `src/b` holds all of its dependents.
    const roots = run(
      {
        paths: [...BASE_PATHS, "src/c/m1.ts", "src/c/m2.ts", "src/c/m3.ts"],
        arcs: [
          ...BASE_ARCS,
          ["src/c/m1.ts", "src/a/f.ts"],
          ["src/c/m2.ts", "src/a/f.ts"],
          ["src/c/m3.ts", "src/a/f.ts"],
        ],
      },
      { entryPoints: ["src/c/m1.ts", "src/c/m2.ts", "src/c/m3.ts"] },
    );
    expect(roots.moves).toEqual(["src/a/f.ts: src/a -> src/b"]);
    // Files of shared units are pinned (D-35).
    const shared = run({
      paths: BASE_PATHS.map((path) => path.replace("src/a/", "src/shared/")),
      arcs: BASE_ARCS.map(([source, target]) => [
        source.replace("src/a/", "src/shared/"),
        target.replace("src/a/", "src/shared/"),
      ]),
    });
    expect(shared.moves).toEqual([]);
    // Facades are pinned.
    const facade = run({
      paths: BASE_PATHS,
      arcs: BASE_ARCS,
      reexports: [["src/a/f.ts", "src/b/u3.ts"]],
    });
    expect(facade.moves).toEqual([]);
  });

  it("updates assignments immediately within a pass", () => {
    // `f1` moves first; `f2`, visited later in the same pass, then has both dependents in `src/b` (with
    // `f1` still in `src/a` it would be a tie, 1 against 1).
    const result = run({
      paths: [
        "src/a/f1.ts",
        "src/a/f2.ts",
        "src/a/peer.ts",
        "src/b/u1.ts",
        "src/b/u2.ts",
        "src/b/u3.ts",
        "src/b/u4.ts",
      ],
      arcs: [
        ["src/b/u1.ts", "src/a/f1.ts"],
        ["src/b/u2.ts", "src/a/f1.ts"],
        ["src/a/f1.ts", "src/a/f2.ts"],
        ["src/a/f1.ts", "src/b/u3.ts"],
        ["src/a/f1.ts", "src/b/u4.ts"],
        ["src/b/u1.ts", "src/a/f2.ts"],
      ],
    });
    expect(result.moves).toEqual(["src/a/f1.ts: src/a -> src/b", "src/a/f2.ts: src/a -> src/b"]);
    expect(result.result.passes).toBe(2);
  });

  it("reports only files whose final unit differs from their prior unit, with their last move (D-36)", () => {
    // Pass 1: `f` follows its users h1 and h2 into `src/b`; h1 and h2, used from `src/a` and depending
    // mostly on it, then move to `src/a`. Pass 2: `f` follows them back. Only h1 and h2 changed unit.
    const result = run({
      paths: [
        "src/a/a1.ts",
        "src/a/a2.ts",
        "src/a/a3.ts",
        "src/a/a4.ts",
        "src/a/f.ts",
        "src/b/h1.ts",
        "src/b/h2.ts",
      ],
      arcs: [
        ["src/b/h1.ts", "src/a/f.ts"],
        ["src/b/h2.ts", "src/a/f.ts"],
        ["src/a/a3.ts", "src/b/h1.ts"],
        ["src/a/a4.ts", "src/b/h1.ts"],
        ["src/a/a3.ts", "src/b/h2.ts"],
        ["src/a/a4.ts", "src/b/h2.ts"],
        ["src/b/h1.ts", "src/a/a1.ts"],
        ["src/b/h1.ts", "src/a/a2.ts"],
        ["src/b/h2.ts", "src/a/a1.ts"],
        ["src/b/h2.ts", "src/a/a2.ts"],
        ["src/a/a1.ts", "src/a/a2.ts"],
        ["src/a/a2.ts", "src/a/a1.ts"],
      ],
    });
    expect(result.moves).toEqual(["src/b/h1.ts: src/b -> src/a", "src/b/h2.ts: src/b -> src/a"]);
    expect(result.result.passes).toBe(3);
    const [h1] = result.result.relocations;
    expect(h1?.dependents).toEqual(new Map([["src/a", { weight: 2, files: 2 }]]));
    expect(h1?.dependencies).toEqual(
      new Map([
        ["src/a", 2],
        ["src/b", 1],
      ]),
    );
    expect(result.units).toEqual([
      "src/a feature* = src/a/a1.ts, src/a/a2.ts, src/a/a3.ts, src/a/a4.ts, src/a/f.ts, src/b/h1.ts, src/b/h2.ts",
      "src/b feature* = ",
    ]);
  });

  describe("cascades (D-74, a synthetic copy of the monorepo's @acme/core)", () => {
    const core = (path: string): string => `packages/core/src/${path}`;
    const spec: TestScopeSpec = {
      id: "pkg:npm:@acme/core",
      directory: "packages/core",
      packageName: "@acme/core",
      paths: [
        "index.ts",
        "catalog/catalog.ts",
        "catalog/product.ts",
        "orders/order-service.ts",
        "orders/order.ts",
      ].map(core),
      arcs: (
        [
          ["catalog/catalog.ts", "catalog/product.ts"],
          ["index.ts", "catalog/catalog.ts"],
          ["index.ts", "catalog/product.ts"],
          ["index.ts", "orders/order-service.ts"],
          ["index.ts", "orders/order.ts"],
          ["orders/order-service.ts", "catalog/catalog.ts"],
          ["orders/order-service.ts", "catalog/product.ts"],
          ["orders/order-service.ts", "orders/order.ts"],
          ["orders/order.ts", "catalog/product.ts"],
        ] as const
      ).map(([source, target]): TestArc => [core(source), core(target)]),
    };
    const entryPoints = [core("index.ts")];

    it("absorbs a unit left with one file into the destination it serves", () => {
      const result = run(spec, { entryPoints });
      // Pass 1: product.ts (2 of 3 dependents in orders). Pass 2: catalog.ts, now alone (1 of 1).
      expect(result.moves).toEqual([
        "packages/core/src/catalog/catalog.ts: packages/core/src/catalog -> packages/core/src/orders",
        "packages/core/src/catalog/product.ts: packages/core/src/catalog -> packages/core/src/orders",
      ]);
      expect(result.result).toMatchObject({ passes: 3, converged: true });
      const [catalog, product] = result.result.relocations;
      expect(catalog?.dependents).toEqual(
        new Map([["packages/core/src/orders", { weight: 1, files: 1 }]]),
      );
      expect(catalog?.dependencies).toEqual(new Map([["packages/core/src/orders", 1]]));
      expect(product?.dependents).toEqual(
        new Map([
          ["packages/core/src/catalog", { weight: 1, files: 1 }],
          ["packages/core/src/orders", { weight: 2, files: 2 }],
        ]),
      );
      expect(product?.dependencies).toEqual(new Map());
      expect(result.units).toContain("packages/core/src/catalog feature* = ");
    });

    it("stops at maxPasses and reports whether moves were pending (D-37)", () => {
      const one = run(spec, { entryPoints, settings: withModuleSettings({ maxPasses: 1 }) });
      expect(one.result).toMatchObject({ passes: 1, converged: false });
      expect(one.moves).toEqual([
        "packages/core/src/catalog/product.ts: packages/core/src/catalog -> packages/core/src/orders",
      ]);
      // The second pass moves the last file; nothing is pending after it.
      const two = run(spec, { entryPoints, settings: withModuleSettings({ maxPasses: 2 }) });
      expect(two.result).toMatchObject({ passes: 2, converged: true });
      expect(two.moves).toHaveLength(2);
    });
  });

  it("lets a chain of files follow one another, one file per pass, up to maxPasses (D-37)", () => {
    // Every link is used by `b/u1` and `b/u2` and uses the next link: only the last link can move at first
    // (the others mostly depend on `src/a`); each move lets the link before it follow in the next pass.
    const links = ["src/a/l0.ts", "src/a/l1.ts", "src/a/l2.ts", "src/a/l3.ts"];
    const users = ["src/b/u1.ts", "src/b/u2.ts"];
    const spec: TestScopeSpec = {
      paths: [...links, ...users],
      arcs: links.flatMap((link, i): TestArc[] => [
        ...users.map((user): TestArc => [user, link]),
        ...(i + 1 < links.length ? [[link, links[i + 1] ?? ""] as TestArc] : []),
      ]),
    };
    const all = run(spec);
    expect(all.moves).toEqual(links.map((link) => `${link}: src/a -> src/b`));
    expect(all.result).toMatchObject({ passes: 5, converged: true });
    // The last link moved on its in-weight alone; the first one when the second had moved.
    const [first, , , last] = all.result.relocations;
    expect(last?.dependents).toEqual(
      new Map([
        ["src/a", { weight: 1, files: 1 }],
        ["src/b", { weight: 2, files: 2 }],
      ]),
    );
    expect(last?.dependencies).toEqual(new Map());
    expect(first?.dependencies).toEqual(new Map([["src/b", 1]]));
    const limited = run(spec, { settings: withModuleSettings({ maxPasses: 3 }) });
    expect(limited.moves).toEqual(links.slice(1).map((link) => `${link}: src/a -> src/b`));
    expect(limited.result).toMatchObject({ passes: 3, converged: false });
  });

  it("equals the naive reference implementation of §3.15 on random graphs (property)", () => {
    // How often the property met the cases that need several passes (the generator's chains, D-37).
    let cascades = 0;
    let limited = 0;
    fc.assert(
      fc.property(
        fc.boolean().chain((flat) => arbitraryScope({ maxFiles: 26, maxArcs: 80, flat })),
        fc.record({
          maxModuleFiles: fc.integer({ min: 3, max: 30 }),
          moveMinSupport: fc.integer({ min: 1, max: 3 }),
          moveMinWeight: fc.constantFrom(0.25, 0.5, 1, 1.5),
          maxPasses: fc.integer({ min: 1, max: 4 }),
        }),
        fc.array(fc.nat(), { maxLength: 4 }),
        ({ scope, paths }, overrides, entryIndices) => {
          const settings = withModuleSettings(overrides);
          const prior = priorUnits(scope, settings);
          const stems = applyStemUnits(scope, prior, settings);
          const entryPoints = new Set<FileId>(
            entryIndices.map((index) => fileId(paths[index % paths.length] ?? "")),
          );
          const classified = structuralClasses(scope, prior.partition, settings, entryPoints);
          splitOversized(scope, prior, classified, settings, stems);
          const initial = prior.partition.unitOf.slice();
          const units = prior.partition.units.map((unit) => ({
            key: unit.key,
            destination: unit.destination,
          }));
          const mask = (array: Uint8Array): Set<number> =>
            new Set([...array.keys()].filter((node) => array[node] === 1));
          const reference = referenceReassign(
            scope,
            initial,
            units,
            mask(classified.pinned),
            mask(classified.excluded),
            settings,
          );
          const result = reassign(scope, prior.partition, classified, settings);
          expect([...prior.partition.unitOf]).toEqual([...reference.unitOf]);
          expect([...result.priorOf]).toEqual([...initial]);
          expect(result.passes).toBe(reference.passes);
          expect(result.converged).toBe(reference.converged);
          expect(result.relocations.map((move) => move.node)).toEqual([
            ...reference.relocations.keys(),
          ]);
          for (const move of result.relocations) {
            const expected = reference.relocations.get(move.node);
            expect([...move.dependents]).toEqual([...(expected?.dependents ?? [])]);
            expect([...move.dependencies]).toEqual([...(expected?.dependencies ?? [])]);
            expect(move.from).toBe(units[initial[move.node] ?? -1]?.key);
            expect(move.to).toBe(units[prior.partition.unitOf[move.node] ?? -1]?.key);
          }
          if (result.passes >= 3) cascades++;
          if (!result.converged) limited++;
        },
      ),
      { seed: 20261008, numRuns: 400 },
    );
    expect(cascades).toBeGreaterThan(0);
    expect(limited).toBeGreaterThan(0);
  });
});
