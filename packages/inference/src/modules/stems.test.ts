import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { InferenceSettings } from "../types.js";
import { priorUnits } from "./prior.js";
import type { PriorUnits } from "./prior.js";
import {
  arbitraryScope,
  DEFAULT_SETTINGS,
  partitionLines,
  testScope,
  withModuleSettings,
} from "./reference.test-support.js";
import type { TestScopeSpec } from "./reference.test-support.js";
import { applyStemUnits, organizationStyle } from "./stems.js";
import type { StemUnits } from "./stems.js";

interface Result {
  readonly prior: PriorUnits;
  readonly stems: StemUnits;
  /** Units after P2, as `key kind[*] = paths`. */
  readonly units: string[];
}

function runStems(spec: TestScopeSpec, settings: InferenceSettings = DEFAULT_SETTINGS): Result {
  const scope = testScope(spec);
  const prior = priorUnits(scope, settings);
  const stems = applyStemUnits(scope, prior, settings);
  return { prior, stems, units: partitionLines(prior.paths, prior.partition) };
}

/** The kept components of every group as `stem: paths`. */
function components(result: Result): string[] {
  return result.stems.groups.flatMap((group) =>
    group.components.map(
      (component) =>
        `${component.stem}: ${component.nodes.map((node) => result.prior.paths[node]).join(", ")}`,
    ),
  );
}

/** Six files below layer children with distinct stems and no arcs, for coverage tests. */
const FILLER = [
  "src/controllers/alpha.ts",
  "src/controllers/beta.ts",
  "src/controllers/gamma.ts",
  "src/services/delta.ts",
  "src/services/epsilon.ts",
  "src/services/zeta.ts",
];

describe("applyStemUnits (P2, §3.6)", () => {
  it("forms a stem unit from a connected stem across layer directories, and only then", () => {
    const result = runStems({
      paths: [
        "src/main.ts",
        "src/controllers/order.controller.ts",
        "src/controllers/payment.controller.ts",
        "src/services/order.service.ts",
        "src/services/payment.service.ts",
        "src/models/order.ts",
        "src/models/user.ts",
      ],
      arcs: [["src/controllers/order.controller.ts", "src/services/order.service.ts"]],
    });
    // `payment` recurs but its files are not connected; `models/order.ts` is a component of its own.
    expect(components(result)).toEqual([
      "order: src/controllers/order.controller.ts, src/services/order.service.ts",
    ]);
    expect(result.units).toEqual([
      "src root = src/main.ts",
      "src/controllers layer = src/controllers/payment.controller.ts",
      "src/models layer = src/models/order.ts, src/models/user.ts",
      "src/services layer = src/services/payment.service.ts",
      "src#order stem* = src/controllers/order.controller.ts, src/services/order.service.ts",
    ]);
    expect(result.prior.partition.units[4]).toMatchObject({
      anchor: { directory: "src", stem: "order" },
      group: "src",
    });
    expect(result.stems.groups.map((group) => group.organization)).toEqual([
      {
        directory: "src",
        style: "layer",
        layerChildren: ["src/controllers", "src/models", "src/services"],
        featureChildren: [],
        sharedChildren: [],
        layerFiles: 6,
        recurrentStems: ["order"],
        coveredFiles: 2,
        stemsApplied: true,
      },
    ]);
    expect(result.stems.appliedStems).toEqual(new Map([["src", ["order"]]]));
    expect(result.stems.originalOf.filter((original) => original !== undefined)).toEqual([
      "order",
      "order",
    ]);
  });

  it("keeps the union of a stem's qualifying components (D-27)", () => {
    const result = runStems({
      paths: [
        "src/index.ts",
        "src/controllers/order.controller.ts",
        "src/services/order.service.ts",
        "src/models/order.ts",
        "src/repositories/order.repository.ts",
      ],
      arcs: [
        ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
        ["src/repositories/order.repository.ts", "src/models/order.ts", 0.5],
      ],
    });
    expect(components(result)).toEqual([
      "order: src/controllers/order.controller.ts, src/services/order.service.ts",
      "order: src/models/order.ts, src/repositories/order.repository.ts",
    ]);
    expect(result.units.at(-1)).toBe(
      "src#order stem* = src/controllers/order.controller.ts, src/models/order.ts, src/repositories/order.repository.ts, src/services/order.service.ts",
    );
  });

  it("uses recurring sub-directory names as stems (D-28)", () => {
    const result = runStems({
      paths: [
        "src/controllers/payment/create.ts",
        "src/controllers/payment/v2/refund.ts",
        "src/controllers/common/thing.ts",
        "src/services/payments/charge.ts",
        "src/services/common/helper.ts",
        "src/services/thing.service.ts",
        "src/models/invoice/inv.ts",
      ],
      arcs: [
        ["src/controllers/payment/create.ts", "src/services/payments/charge.ts"],
        ["src/controllers/payment/v2/refund.ts", "src/services/payments/charge.ts"],
        ["src/controllers/common/thing.ts", "src/services/thing.service.ts"],
      ],
    });
    // `payment(s)` recurs below two layer directories; `common` does too but is a generic token, so its
    // files keep their file stems (`thing`, and none for `helper`); `invoice` occurs below one only.
    expect(components(result)).toEqual([
      "payment: src/controllers/payment/create.ts, src/controllers/payment/v2/refund.ts, src/services/payments/charge.ts",
      "thing: src/controllers/common/thing.ts, src/services/thing.service.ts",
    ]);
    expect(result.units).toEqual([
      "src/controllers layer = ",
      "src/models layer = src/models/invoice/inv.ts",
      "src/services layer = src/services/common/helper.ts",
      "src#payment stem* = src/controllers/payment/create.ts, src/controllers/payment/v2/refund.ts, src/services/payments/charge.ts",
      "src#thing stem* = src/controllers/common/thing.ts, src/services/thing.service.ts",
    ]);
    const originals = result.prior.paths.map((path, node) => [path, result.stems.originalOf[node]]);
    expect(Object.fromEntries(originals)).toMatchObject({
      "src/controllers/payment/create.ts": "payment",
      "src/services/payments/charge.ts": "payments",
      "src/controllers/common/thing.ts": "thing",
      "src/models/invoice/inv.ts": undefined,
    });
  });

  it("never takes a sub-directory stem that a module key cannot hold (D-28, plan 3.5)", () => {
    const result = runStems({
      paths: ["src/controllers/a#b/item.ts", "src/services/a#b/item.ts", "src/z.ts"],
      arcs: [["src/controllers/a#b/item.ts", "src/services/a#b/item.ts"]],
    });
    expect(result.stems.groups[0]?.organization.recurrentStems).toEqual(["item"]);
    expect(result.units.at(-1)).toBe(
      "src#item stem* = src/controllers/a#b/item.ts, src/services/a#b/item.ts",
    );
  });

  it("joins the feature child named like the stem, the smallest path first (D-70)", () => {
    const result = runStems({
      paths: [
        "src/controllers/order.controller.ts",
        "src/services/order.service.ts",
        "src/order/order-view.ts",
        "src/orders/orders-list.ts",
      ],
      arcs: [["src/controllers/order.controller.ts", "src/services/order.service.ts"]],
    });
    expect(result.stems.groups[0]?.organization.style).toBe("mixed");
    expect(result.units).toEqual([
      "src/controllers layer = ",
      "src/order feature* = src/controllers/order.controller.ts, src/order/order-view.ts, src/services/order.service.ts",
      "src/orders feature* = src/orders/orders-list.ts",
      "src/services layer = ",
    ]);
  });

  it("gives a size-split feature child without loose files a unit to join", () => {
    const result = runStems(
      {
        paths: [
          "src/controllers/order.controller.ts",
          "src/services/order.service.ts",
          "src/orders/a/x.ts",
          "src/orders/b/y.ts",
          "src/orders/c/z.ts",
        ],
        arcs: [["src/controllers/order.controller.ts", "src/services/order.service.ts"]],
      },
      withModuleSettings({ maxModuleFiles: 2 }),
    );
    expect(result.prior.splitDirectories).toEqual(["src", "src/orders"]);
    expect(result.units.at(-1)).toBe(
      "src/orders feature* = src/controllers/order.controller.ts, src/services/order.service.ts",
    );
    expect(result.stems.groups.map((group) => group.organization.style)).toEqual([
      "mixed",
      "feature",
    ]);
  });

  describe("coverage (D-67)", () => {
    const pair = ["src/controllers/order.controller.ts", "src/services/order.service.ts"] as const;
    const twoOfEight: TestScopeSpec = { paths: [...pair, ...FILLER], arcs: [pair] };

    it("applies stems at a coverage equal to the threshold", () => {
      for (const [threshold, applied] of [
        [0.249, true],
        [0.25, true],
        [0.251, false],
      ] as const) {
        const result = runStems(twoOfEight, withModuleSettings({ stemMinCoverage: threshold }));
        const organization = result.stems.groups[0]?.organization;
        expect(organization).toMatchObject({ coveredFiles: 2, layerFiles: 8 });
        expect(organization?.stemsApplied).toBe(applied);
      }
    });

    it("does not apply stems at a coverage of 0.249, and applies them at 0.25 (default threshold)", () => {
      /** `kept` files of connected recurring stems among 1 000 files below three layer directories. */
      const spec = (kept: 249 | 250): TestScopeSpec => {
        const paths: string[] = [];
        const arcs: [string, string][] = [];
        // Pairs `controllers/item<i>.controller.ts` → `services/item<i>.service.ts`; 249 = 123 pairs + 1 triple.
        const pairs = kept === 249 ? 123 : 125;
        for (let i = 0; i < pairs; i++) {
          const controller = `src/controllers/item${String(i)}.controller.ts`;
          const service = `src/services/item${String(i)}.service.ts`;
          paths.push(controller, service);
          arcs.push([controller, service]);
        }
        if (kept === 249) {
          paths.push("src/controllers/triple.controller.ts", "src/services/triple.service.ts");
          paths.push("src/models/triple.ts");
          arcs.push(["src/controllers/triple.controller.ts", "src/services/triple.service.ts"]);
          arcs.push(["src/services/triple.service.ts", "src/models/triple.ts"]);
        }
        // Files with unique stems and no arcs fill the layer directories up to 1 000.
        for (let i = 0; paths.length < 1000; i++) paths.push(`src/models/filler${String(i)}.ts`);
        return { paths, arcs };
      };
      const below = runStems(spec(249)).stems.groups[0]?.organization;
      expect(below).toMatchObject({ coveredFiles: 249, layerFiles: 1000, stemsApplied: false });
      expect(DEFAULT_SETTINGS.modules.stemMinCoverage).toBe(0.25);
      const at = runStems(spec(250)).stems.groups[0]?.organization;
      expect(at).toMatchObject({ coveredFiles: 250, layerFiles: 1000, stemsApplied: true });
    });

    it("does not apply stems below the default threshold", () => {
      const result = runStems({ paths: [...pair, ...FILLER, "src/services/eta.ts"], arcs: [pair] });
      expect(result.stems.groups[0]?.organization).toMatchObject({
        recurrentStems: ["order"],
        coveredFiles: 2,
        layerFiles: 9,
        stemsApplied: false,
      });
      expect(result.units.some((line) => line.startsWith("src#order"))).toBe(false);
    });

    it("compares the correctly rounded quotient 3/10 with 0.3 as equal", () => {
      const spec: TestScopeSpec = {
        paths: [
          "src/controllers/order.controller.ts",
          "src/services/order.service.ts",
          "src/repositories/order.repository.ts",
          ...FILLER,
          "src/repositories/eta.ts",
        ],
        arcs: [
          ["src/controllers/order.controller.ts", "src/services/order.service.ts"],
          ["src/services/order.service.ts", "src/repositories/order.repository.ts", 0.5],
        ],
      };
      const at = runStems(spec, withModuleSettings({ stemMinCoverage: 0.3 }));
      expect(at.stems.groups[0]?.organization).toMatchObject({
        coveredFiles: 3,
        layerFiles: 10,
        stemsApplied: true,
      });
      const above = runStems(spec, withModuleSettings({ stemMinCoverage: 0.31 }));
      expect(above.stems.groups[0]?.organization.stemsApplied).toBe(false);
    });
  });

  describe("organization styles (D-26)", () => {
    it("classifies one layer child and a shared child as `none` (simple-dependencies)", () => {
      const result = runStems({
        paths: ["src/app.ts", "src/services/expense-service.ts", "src/utils/currency.ts"],
      });
      expect(result.stems.groups.map((group) => group.organization)).toEqual([
        {
          directory: "src",
          style: "none",
          layerChildren: ["src/services"],
          featureChildren: [],
          sharedChildren: ["src/utils"],
          layerFiles: 1,
          recurrentStems: [],
          coveredFiles: 0,
          stemsApplied: false,
        },
      ]);
    });

    it("counts container children in no class", () => {
      const result = runStems({
        paths: ["src/orders/a.ts", "src/features/b/c.ts", "src/shared/x.ts"],
      });
      expect(
        result.stems.groups.map((group) => [
          group.organization.directory,
          group.organization.style,
          group.organization.featureChildren,
          group.organization.sharedChildren,
        ]),
      ).toEqual([
        ["src", "feature", ["src/orders"], ["src/shared"]],
        ["src/features", "feature", ["src/features/b"], []],
      ]);
    });

    it("follows the style table, with `none` where §3.6 has no row", () => {
      expect(organizationStyle(0, 0)).toBe("none");
      expect(organizationStyle(1, 0)).toBe("none");
      expect(organizationStyle(0, 1)).toBe("feature");
      expect(organizationStyle(1, 3)).toBe("feature");
      expect(organizationStyle(2, 0)).toBe("layer");
      expect(organizationStyle(4, 1)).toBe("mixed");
    });
  });

  it("keeps every stem component connected and spanning two layer children (property, plan 7.1)", () => {
    let components = 0;
    fc.assert(
      fc.property(
        arbitraryScope(),
        fc.integer({ min: 2, max: 12 }),
        fc.constantFrom(0, 0.25, 0.5),
        ({ scope, paths }, maxModuleFiles, stemMinCoverage) => {
          const settings = withModuleSettings({ maxModuleFiles, stemMinCoverage });
          const prior = priorUnits(scope, settings);
          const stems = applyStemUnits(scope, prior, settings);
          const { graph } = scope.graph;
          for (const group of stems.groups) {
            const { layerChildren, directory } = group.organization;
            let covered = 0;
            for (const component of group.components) {
              covered += component.nodes.length;
              const members = new Set(component.nodes);
              // Spans at least two layer children.
              const children = new Set(
                component.nodes.map((node) => {
                  const child = layerChildren.find((c) => paths[node]?.startsWith(`${c}/`));
                  expect(child).toBeDefined();
                  return child;
                }),
              );
              expect(children.size).toBeGreaterThanOrEqual(2);
              expect(group.organization.recurrentStems).toContain(component.stem);
              // Connected through arcs among its members (undirected).
              const [first] = component.nodes;
              const seen = new Set([first]);
              const pending = [first];
              for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
                for (const other of [...graph.successors(node), ...graph.predecessors(node)]) {
                  if (members.has(other) && !seen.has(other)) {
                    seen.add(other);
                    pending.push(other);
                  }
                }
              }
              expect(seen.size).toBe(members.size);
            }
            expect(covered).toBe(group.organization.coveredFiles);
            expect(prior.splitDirectories).toContain(directory);
            components += group.components.length;
          }
        },
      ),
      { seed: 20261008, numRuns: 300 },
    );
    expect(components).toBeGreaterThan(0);
  });
});
