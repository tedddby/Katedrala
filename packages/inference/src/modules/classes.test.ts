import { fileId } from "@katedrala/ir";
import type { FileId } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { InferenceSettings } from "../types.js";
import {
  ENTRY_POINT_RULE,
  NO_RULE,
  ORCHESTRATOR_MAX_OWN_SHARE,
  ORCHESTRATOR_MAX_UNIT_SHARE,
  SHAPE_RULE,
  SHARED_UTILITY_MIN_MODULES,
  structuralClasses,
} from "./classes.js";
import type { ClassifiedNodes } from "./classes.js";
import { priorUnits } from "./prior.js";
import type { PriorUnits } from "./prior.js";
import {
  arbitraryScope,
  DEFAULT_SETTINGS,
  referenceStructuralClasses,
  testScope,
  withModuleSettings,
} from "./reference.test-support.js";
import type { TestScopeSpec } from "./reference.test-support.js";
import { applyStemUnits } from "./stems.js";

interface Classified {
  readonly prior: PriorUnits;
  readonly classified: ClassifiedNodes;
  /** Paths of the nodes whose entry in `mask` is 1. */
  readonly paths: (mask: Uint8Array) => string[];
  /** The value of `array` at the node of `path`. */
  readonly at: (array: Uint8Array | Int32Array, path: string) => number;
}

/** P1 and P2, then P3 on that prior partition. */
function classify(
  spec: TestScopeSpec,
  options: { readonly settings?: InferenceSettings; readonly entryPoints?: readonly string[] } = {},
): Classified {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const scope = testScope(spec);
  const prior = priorUnits(scope, settings);
  applyStemUnits(scope, prior, settings);
  const entryPoints = new Set<FileId>((options.entryPoints ?? []).map((path) => fileId(path)));
  const classified = structuralClasses(scope, prior.partition, settings, entryPoints);
  return {
    prior,
    classified,
    paths: (mask) => prior.paths.filter((_, node) => mask[node] === 1),
    at: (array, path) => {
      const node = prior.paths.indexOf(path);
      if (node === -1) throw new Error(`Not a node: ${path}`);
      return array[node] ?? Number.NaN;
    },
  };
}

describe("structuralClasses (P3, §3.7)", () => {
  describe("utilities", () => {
    it("needs dependents in utilityMinModules (3) other units for feature files", () => {
      const spec = (users: readonly string[]): TestScopeSpec => ({
        paths: ["src/main.ts", "src/a/x.ts", ...users],
        arcs: users.map((user) => [user, "src/a/x.ts"] as const),
      });
      const two = classify(spec(["src/b/y.ts", "src/c/z.ts"]));
      expect(two.paths(two.classified.classes.utilities)).toEqual([]);
      expect(two.at(two.classified.classes.dependentUnits, "src/a/x.ts")).toBe(2);
      const three = classify(spec(["src/b/y.ts", "src/c/z.ts", "src/d/w.ts"]));
      expect(three.paths(three.classified.classes.utilities)).toEqual(["src/a/x.ts"]);
      expect(three.at(three.classified.classes.dependentUnits, "src/a/x.ts")).toBe(3);
      expect(three.paths(three.classified.firstPassUtilities)).toEqual(["src/a/x.ts"]);
    });

    it("counts units, not files, and ignores dependents in the file's own unit", () => {
      const result = classify({
        paths: ["src/a/x.ts", "src/a/peer.ts", "src/b/y1.ts", "src/b/y2.ts", "src/c/z.ts"],
        arcs: [
          ["src/a/peer.ts", "src/a/x.ts"],
          ["src/b/y1.ts", "src/a/x.ts"],
          ["src/b/y2.ts", "src/a/x.ts"],
          ["src/c/z.ts", "src/a/x.ts"],
        ],
      });
      expect(result.at(result.classified.classes.dependentUnits, "src/a/x.ts")).toBe(2);
      expect(result.paths(result.classified.classes.utilities)).toEqual([]);
    });

    it("needs only 2 other units for files of shared and root units (D-31)", () => {
      expect(SHARED_UTILITY_MIN_MODULES).toBe(2);
      // Every user has a single dependency, so none of them is a composition root.
      const spec = (units: readonly string[]): TestScopeSpec => ({
        paths: [
          "src/util.ts",
          "src/shared/log.ts",
          ...units.flatMap((unit) => [`src/${unit}/a.ts`, `src/${unit}/b.ts`]),
        ],
        arcs: units.flatMap((unit) => [
          [`src/${unit}/a.ts`, "src/shared/log.ts"] as const,
          [`src/${unit}/b.ts`, "src/util.ts"] as const,
        ]),
      });
      const one = classify(spec(["x"]));
      expect(one.paths(one.classified.classes.utilities)).toEqual([]);
      expect(one.at(one.classified.classes.dependentUnits, "src/shared/log.ts")).toBe(1);
      const two = classify(spec(["x", "y"]));
      expect(two.paths(two.classified.classes.utilities)).toEqual([
        "src/shared/log.ts",
        "src/util.ts",
      ]);
    });

    it("reads utilityMinModules from the settings, but not the shared and root threshold", () => {
      const settings = withModuleSettings({ utilityMinModules: 4 });
      const result = classify(
        {
          paths: [
            "src/a/x.ts",
            "src/shared/log.ts",
            "src/b/y.ts",
            "src/c/z.ts",
            "src/d/w.ts",
            "src/e/u.ts",
            "src/f/v.ts",
          ],
          arcs: [
            ["src/b/y.ts", "src/a/x.ts"],
            ["src/c/z.ts", "src/a/x.ts"],
            ["src/d/w.ts", "src/a/x.ts"],
            ["src/e/u.ts", "src/shared/log.ts"],
            ["src/f/v.ts", "src/shared/log.ts"],
          ],
        },
        { settings },
      );
      expect(result.paths(result.classified.classes.utilities)).toEqual(["src/shared/log.ts"]);
      expect(result.at(result.classified.classes.dependentUnits, "src/a/x.ts")).toBe(3);
    });

    it("ignores orchestrators as dependents in the final pass; orchestrators are never utilities", () => {
      // `src/a/x.ts` has dependents in 3 other units, one of them the composition root `src/main.ts`.
      const result = classify(
        {
          paths: ["src/main.ts", "src/a/x.ts", "src/b/y.ts", "src/c/z.ts"],
          arcs: [
            ["src/main.ts", "src/a/x.ts"],
            ["src/b/y.ts", "src/a/x.ts"],
            ["src/c/z.ts", "src/a/x.ts"],
          ],
        },
        { entryPoints: ["src/main.ts"] },
      );
      const { classes, firstPassUtilities } = result.classified;
      expect(result.paths(firstPassUtilities)).toEqual(["src/a/x.ts"]);
      expect(result.paths(classes.orchestrators)).toEqual(["src/main.ts"]);
      expect(result.paths(classes.utilities)).toEqual([]);
      expect(result.at(classes.dependentUnits, "src/a/x.ts")).toBe(2);
    });
  });

  describe("orchestrators", () => {
    /** `src/a/app.ts` depends on the given targets; a peer in its unit, nothing depends on it. */
    const shape = (targets: readonly string[], extra: TestScopeSpec["arcs"] = []): Classified =>
      classify({
        paths: [
          "src/a/app.ts",
          "src/a/peer.ts",
          "src/b/one.ts",
          "src/b/three.ts",
          "src/c/two.ts",
          "src/d/four.ts",
          "src/d/user.ts",
        ],
        arcs: [...targets.map((target) => ["src/a/app.ts", target] as const), ...extra],
      });
    const isOrchestrator = (result: Classified): boolean =>
      result.at(result.classified.classes.orchestrators, "src/a/app.ts") === 1;

    it("treats a file whose dependencies spread over units as a composition root (shape rule)", () => {
      const result = shape(["src/b/one.ts", "src/c/two.ts"]);
      expect(isOrchestrator(result)).toBe(true);
      expect(result.at(result.classified.classes.orchestratorRule, "src/a/app.ts")).toBe(
        SHAPE_RULE,
      );
      expect(result.at(result.classified.classes.dependencyUnits, "src/a/app.ts")).toBe(2);
    });

    it("fails condition (i) with a non-orchestrator dependent outside its unit", () => {
      expect(
        isOrchestrator(
          shape(["src/b/one.ts", "src/c/two.ts"], [["src/d/user.ts", "src/a/app.ts"]]),
        ),
      ).toBe(false);
      // A dependent inside its own unit does not count against (i).
      expect(
        isOrchestrator(
          shape(["src/b/one.ts", "src/c/two.ts"], [["src/a/peer.ts", "src/a/app.ts"]]),
        ),
      ).toBe(true);
    });

    it("fails condition (ii) when its dependencies reach a single other unit", () => {
      const result = shape(["src/b/one.ts", "src/b/three.ts"]);
      expect(isOrchestrator(result)).toBe(false);
      expect(result.at(result.classified.classes.dependencyUnits, "src/a/app.ts")).toBe(1);
    });

    it("fails condition (iii) above 50 % for one unit, and holds at exactly 50 %", () => {
      expect(ORCHESTRATOR_MAX_UNIT_SHARE).toBe(0.5);
      expect(isOrchestrator(shape(["src/b/one.ts", "src/b/three.ts", "src/c/two.ts"]))).toBe(false);
      expect(
        isOrchestrator(shape(["src/b/one.ts", "src/b/three.ts", "src/c/two.ts", "src/d/four.ts"])),
      ).toBe(true);
    });

    it("fails condition (iv) above 25 % for its own unit, and holds at exactly 25 %", () => {
      expect(ORCHESTRATOR_MAX_OWN_SHARE).toBe(0.25);
      expect(isOrchestrator(shape(["src/a/peer.ts", "src/b/one.ts", "src/c/two.ts"]))).toBe(false);
      expect(
        isOrchestrator(shape(["src/a/peer.ts", "src/b/one.ts", "src/c/two.ts", "src/d/four.ts"])),
      ).toBe(true);
    });

    it("compares weight sums, not counts (D-67)", () => {
      // b: 1 + 0.5, c: 1, d: 0.5 → b holds 1.5 of 3, exactly 50 %.
      const result = classify({
        paths: ["src/a/app.ts", "src/b/one.ts", "src/b/two.ts", "src/c/x.ts", "src/d/y.ts"],
        arcs: [
          ["src/a/app.ts", "src/b/one.ts"],
          ["src/a/app.ts", "src/b/two.ts", 0.5],
          ["src/a/app.ts", "src/c/x.ts"],
          ["src/a/app.ts", "src/d/y.ts", 0.5],
        ],
      });
      expect(result.paths(result.classified.classes.orchestrators)).toEqual(["src/a/app.ts"]);
      expect(result.at(result.classified.classes.dependencyUnits, "src/a/app.ts")).toBe(3);
    });

    it("ignores first-pass utilities among the dependencies of the shape rule", () => {
      // `src/lib/log.ts` is a utility (shared, 2 other units); without it, `app` reaches only `b`.
      const result = classify({
        paths: ["src/a/app.ts", "src/b/one.ts", "src/lib/log.ts", "src/c/z.ts"],
        arcs: [
          ["src/a/app.ts", "src/b/one.ts"],
          ["src/a/app.ts", "src/lib/log.ts"],
          ["src/c/z.ts", "src/lib/log.ts"],
        ],
      });
      expect(result.paths(result.classified.classes.utilities)).toEqual(["src/lib/log.ts"]);
      expect(result.at(result.classified.classes.dependencyUnits, "src/a/app.ts")).toBe(1);
      expect(result.paths(result.classified.classes.orchestrators)).toEqual([]);
    });

    it("applies the entry-point rule to declared entry points without dependents", () => {
      const result = classify(
        {
          paths: ["src/main.ts", "src/a/x.ts", "src/b/cli.ts", "src/b/run.ts"],
          arcs: [
            ["src/main.ts", "src/a/x.ts"],
            ["src/b/run.ts", "src/b/cli.ts"],
          ],
        },
        { entryPoints: ["src/main.ts", "src/b/cli.ts"] },
      );
      const { classes } = result.classified;
      // `main.ts` fails the shape rule (one unit) but is an entry point nothing depends on.
      expect(result.paths(classes.orchestrators)).toEqual(["src/main.ts"]);
      expect(result.at(classes.orchestratorRule, "src/main.ts")).toBe(ENTRY_POINT_RULE);
      expect(result.at(classes.orchestratorRule, "src/b/cli.ts")).toBe(NO_RULE);
    });

    it("reaches the least fixpoint: entry points whose only dependents are composition roots (D-30)", () => {
      // `boot.ts` sorts before `main.ts`, so a single id-order pass would miss it.
      const result = classify(
        {
          paths: ["src/boot.ts", "src/main.ts", "src/a/x.ts"],
          arcs: [
            ["src/main.ts", "src/boot.ts"],
            ["src/boot.ts", "src/a/x.ts"],
          ],
        },
        { entryPoints: ["src/main.ts", "src/boot.ts"] },
      );
      const { classes } = result.classified;
      expect(result.paths(classes.orchestrators)).toEqual(["src/boot.ts", "src/main.ts"]);
      expect(result.at(classes.orchestratorRule, "src/boot.ts")).toBe(ENTRY_POINT_RULE);
    });

    it("records the rule that holds at the fixpoint, the entry-point rule first (D-30, D-66)", () => {
      // `start.ts` satisfies the shape rule at once (its dependent `wire.ts` is in its unit); once `wire.ts`
      // is a composition root too, nothing depends on `start.ts`, so the entry-point rule holds as well.
      const result = classify(
        {
          paths: [
            "src/boot/start.ts",
            "src/boot/wire.ts",
            "src/b/x.ts",
            "src/c/y.ts",
            "src/d/z.ts",
          ],
          arcs: [
            ["src/boot/wire.ts", "src/boot/start.ts"],
            ["src/boot/wire.ts", "src/b/x.ts"],
            ["src/boot/wire.ts", "src/c/y.ts"],
            ["src/boot/wire.ts", "src/d/z.ts"],
            ["src/boot/start.ts", "src/b/x.ts"],
            ["src/boot/start.ts", "src/c/y.ts"],
          ],
        },
        { entryPoints: ["src/boot/start.ts"] },
      );
      const { classes } = result.classified;
      expect(result.paths(classes.orchestrators)).toEqual([
        "src/boot/start.ts",
        "src/boot/wire.ts",
      ]);
      expect(result.at(classes.orchestratorRule, "src/boot/start.ts")).toBe(ENTRY_POINT_RULE);
      expect(result.at(classes.orchestratorRule, "src/boot/wire.ts")).toBe(SHAPE_RULE);
      expect(result.at(classes.dependencyUnits, "src/boot/wire.ts")).toBe(3);
    });

    it("records a rule that does not depend on the evaluation order (D-30)", () => {
      // `x.ts` (an entry point whose dependencies spread over two units) has a dependent in its own unit,
      // `d-in.ts`, and one outside, `d-out.ts`; all others are entry points. `d-out.ts` and `e.ts` become
      // composition roots in the first id-order sweep. The worklist then re-examines `x.ts` before
      // `d-in.ts`, so the shape rule holds first; the naive second pass meets `d-in.ts` first, so the
      // entry-point rule holds first. At the fixpoint the entry-point rule holds, and both record it.
      const spec: TestScopeSpec = {
        paths: [
          "src/a/d-in.ts",
          "src/a/x.ts",
          "src/b/d-out.ts",
          "src/c/e.ts",
          "src/m/one.ts",
          "src/n/two.ts",
        ],
        arcs: [
          ["src/a/x.ts", "src/m/one.ts"],
          ["src/a/x.ts", "src/n/two.ts"],
          ["src/a/d-in.ts", "src/a/x.ts"],
          ["src/b/d-out.ts", "src/a/x.ts"],
          ["src/c/e.ts", "src/a/d-in.ts"],
        ],
      };
      const entryPoints = ["src/a/d-in.ts", "src/a/x.ts", "src/b/d-out.ts", "src/c/e.ts"];
      const result = classify(spec, { entryPoints });
      const { classes } = result.classified;
      expect(result.paths(classes.orchestrators)).toEqual(entryPoints);
      expect(result.at(classes.orchestratorRule, "src/a/x.ts")).toBe(ENTRY_POINT_RULE);
      expect(result.at(classes.dependencyUnits, "src/a/x.ts")).toBe(2);
      const reference = referenceStructuralClasses(
        testScope(spec),
        result.prior.partition.unitOf,
        result.prior.partition.units.map((unit) => unit.kind),
        DEFAULT_SETTINGS,
        new Set(entryPoints.map((path) => fileId(path))),
      );
      expect(reference.orchestratorRule.get(result.prior.paths.indexOf("src/a/x.ts"))).toBe(
        ENTRY_POINT_RULE,
      );
    });

    it("never treats a first-pass utility as a composition root, even an entry point", () => {
      // `core.ts` is used by three composition roots in three units: a first-pass utility, so it is not a
      // composition root; with orchestrators ignored it has no dependents, so it is no final utility either.
      const result = classify(
        {
          paths: ["src/a/core.ts", "src/b/m1.ts", "src/c/m2.ts", "src/d/m3.ts"],
          arcs: [
            ["src/b/m1.ts", "src/a/core.ts"],
            ["src/c/m2.ts", "src/a/core.ts"],
            ["src/d/m3.ts", "src/a/core.ts"],
          ],
        },
        { entryPoints: ["src/a/core.ts", "src/b/m1.ts", "src/c/m2.ts", "src/d/m3.ts"] },
      );
      const { classes, firstPassUtilities } = result.classified;
      expect(result.paths(firstPassUtilities)).toEqual(["src/a/core.ts"]);
      expect(result.paths(classes.orchestrators)).toEqual([
        "src/b/m1.ts",
        "src/c/m2.ts",
        "src/d/m3.ts",
      ]);
      expect(result.paths(classes.utilities)).toEqual([]);
      expect(result.at(classes.dependentUnits, "src/a/core.ts")).toBe(0);
    });
  });

  describe("facades", () => {
    it("needs at least half of the admitted out-pairs to be re-exports, and one pair (D-04)", () => {
      const result = classify({
        paths: [
          "src/x/index.ts",
          "src/x/a.ts",
          "src/x/b.ts",
          "src/y/index.ts",
          "src/y/a.ts",
          "src/y/b.ts",
          "src/y/c.ts",
          "src/z/index.ts",
          "src/z/a.ts",
          "src/w/lonely.ts",
        ],
        arcs: [
          ["src/x/index.ts", "src/x/a.ts"],
          ["src/x/index.ts", "src/x/b.ts"],
          ["src/y/index.ts", "src/y/a.ts"],
          ["src/y/index.ts", "src/y/b.ts"],
          ["src/y/index.ts", "src/y/c.ts"],
        ],
        reexports: [
          ["src/x/index.ts", "src/x/a.ts"],
          ["src/y/index.ts", "src/y/a.ts"],
          // A type-only re-export with type_only_weight = 0: an admitted pair of weight 0, not an arc.
          ["src/z/index.ts", "src/z/a.ts"],
        ],
      });
      // x: 1 of 2 (exactly 50 %); y: 1 of 3; z: 1 of 1 without an arc; lonely: no pair at all.
      expect(result.paths(result.classified.classes.facades)).toEqual([
        "src/x/index.ts",
        "src/z/index.ts",
      ]);
    });
  });

  it("pins composition roots, utilities, facades and shared-unit files; excludes the first two", () => {
    const result = classify(
      {
        paths: [
          "src/main.ts",
          "src/a/index.ts",
          "src/a/x.ts",
          "src/b/y.ts",
          "src/c/z.ts",
          "src/d/w.ts",
          "src/shared/quiet.ts",
        ],
        arcs: [
          ["src/main.ts", "src/b/y.ts"],
          ["src/b/y.ts", "src/a/x.ts"],
          ["src/c/z.ts", "src/a/x.ts"],
          ["src/d/w.ts", "src/a/x.ts"],
        ],
        reexports: [["src/a/index.ts", "src/a/x.ts"]],
      },
      { entryPoints: ["src/main.ts"] },
    );
    const { pinned, excluded } = result.classified;
    expect(result.paths(excluded)).toEqual(["src/a/x.ts", "src/main.ts"]);
    expect(result.paths(pinned)).toEqual([
      "src/a/index.ts",
      "src/a/x.ts",
      "src/main.ts",
      "src/shared/quiet.ts",
    ]);
  });

  it("handles a scope without arcs, and an empty scope", () => {
    const quiet = classify({ paths: ["src/a.ts", "src/b/c.ts"] });
    const { classes } = quiet.classified;
    expect([...classes.orchestrators, ...classes.utilities, ...classes.facades]).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
    const empty = classify({ paths: [] });
    expect(empty.classified.classes.orchestrators).toHaveLength(0);
  });

  it("equals the prototype's repeated id-order passes on random graphs (property, D-30)", () => {
    // How often the property met each class, so that it compares more than empty sets.
    const seen = { entryRule: 0, shapeRule: 0, utilities: 0, facades: 0 };
    const count = (mask: Uint8Array, value = 1): number => mask.filter((x) => x === value).length;
    fc.assert(
      fc.property(
        arbitraryScope({ maxFiles: 24, maxArcs: 80 }),
        fc.integer({ min: 2, max: 4 }),
        fc.array(fc.nat(), { maxLength: 6 }),
        ({ scope, paths }, utilityMinModules, entryIndices) => {
          const settings = withModuleSettings({ utilityMinModules, maxModuleFiles: 6 });
          const prior = priorUnits(scope, settings);
          applyStemUnits(scope, prior, settings);
          const entryPoints = new Set<FileId>(
            entryIndices.map((index) => fileId(paths[index % paths.length] ?? "")),
          );
          const { classes, firstPassUtilities } = structuralClasses(
            scope,
            prior.partition,
            settings,
            entryPoints,
          );
          const reference = referenceStructuralClasses(
            scope,
            prior.partition.unitOf,
            prior.partition.units.map((unit) => unit.kind),
            settings,
            entryPoints,
          );
          const set = (mask: Uint8Array): Set<number> =>
            new Set([...mask.keys()].filter((node) => mask[node] === 1));
          expect(set(firstPassUtilities)).toEqual(reference.firstPassUtilities);
          expect(set(classes.orchestrators)).toEqual(reference.orchestrators);
          expect(set(classes.utilities)).toEqual(reference.utilities);
          expect(set(classes.facades)).toEqual(reference.facades);
          expect([...classes.dependencyUnits]).toEqual(reference.dependencyUnits);
          expect([...classes.dependentUnits]).toEqual(reference.dependentUnits);
          for (let node = 0; node < paths.length; node++) {
            expect(classes.orchestratorRule[node]).toBe(
              reference.orchestratorRule.get(node) ?? NO_RULE,
            );
          }
          seen.entryRule += count(classes.orchestratorRule, ENTRY_POINT_RULE);
          seen.shapeRule += count(classes.orchestratorRule, SHAPE_RULE);
          seen.utilities += count(classes.utilities);
          seen.facades += count(classes.facades);
        },
      ),
      { seed: 20261008, numRuns: 400 },
    );
    for (const value of Object.values(seen)) expect(value).toBeGreaterThan(0);
  });
});
