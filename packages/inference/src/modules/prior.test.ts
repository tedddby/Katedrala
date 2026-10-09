import { fileId, InvalidIdentifierError } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { addUnit, isDestinationKind, membersByUnit, pathOfFile, priorUnits } from "./prior.js";
import type { Partition, PriorUnits } from "./prior.js";
import { DEFAULT_SETTINGS, testScope, withModuleSettings } from "./reference.test-support.js";
import type { TestScopeSpec } from "./reference.test-support.js";

/** Units as `key kind[*] = paths`, `*` marking destinations, in creation order. */
function describeUnits(prior: PriorUnits): string[] {
  const members = membersByUnit(prior.partition.unitOf, prior.partition.units.length);
  return prior.partition.units.map((unit, index) => {
    const paths = [...(members[index] ?? [])].map((node) => prior.paths[node]);
    return `${unit.key} ${unit.kind}${unit.destination ? "*" : ""} = ${paths.join(", ")}`;
  });
}

function prior(spec: TestScopeSpec, settings = DEFAULT_SETTINGS): PriorUnits {
  return priorUnits(testScope(spec), settings);
}

/** `count` file paths directly in `directory`. */
function filesIn(directory: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${directory}/f${String(i).padStart(3, "0")}.ts`);
}

describe("priorUnits (P1, §3.5)", () => {
  it("descends to the source root while a directory has no file and one child (§3.5 step 1)", () => {
    const result = prior({ paths: ["code/main/a.ts", "code/main/b/c.ts", "code/main/b/d.ts"] });
    expect(result.sourceRoot).toBe("code/main");
    expect(result.splitDirectories).toEqual(["code/main"]);
    expect(describeUnits(result)).toEqual([
      "code/main root = code/main/a.ts",
      "code/main/b feature* = code/main/b/c.ts, code/main/b/d.ts",
    ]);
  });

  it("starts the descent at the scope's package directory", () => {
    const result = prior({
      paths: ["packages/api/src/server.ts", "packages/api/src/handlers/orders.ts"],
      directory: "packages/api",
      packageName: "@acme/api",
    });
    expect(result.sourceRoot).toBe("packages/api/src");
    expect(describeUnits(result)).toEqual([
      "packages/api/src root = packages/api/src/server.ts",
      "packages/api/src/handlers layer = packages/api/src/handlers/orders.ts",
    ]);
  });

  it("writes the analysis root as `.` and escapes directory keys (plan 3.5 item 1)", () => {
    const result = prior({ paths: ["main.ts", "a#b/x.ts", "50%/y.ts", "t~inferred/z.ts"] });
    expect(result.sourceRoot).toBe("");
    expect(describeUnits(result)).toEqual([
      ". root = main.ts",
      "50%25 feature* = 50%/y.ts",
      "a%23b feature* = a#b/x.ts",
      "t%7Einferred feature* = t~inferred/z.ts",
    ]);
  });

  it("splits containers and makes their loose files a shared unit (D-25)", () => {
    const result = prior({
      paths: [
        "src/index.ts",
        "src/features/registry.ts",
        "src/features/orders/order.ts",
        "src/features/payments/payment.ts",
        "src/modules/cart/cart.ts",
        "src/shared/log.ts",
      ],
    });
    expect(result.splitDirectories).toEqual(["src", "src/features", "src/modules"]);
    expect(describeUnits(result)).toEqual([
      "src root = src/index.ts",
      "src/features shared = src/features/registry.ts",
      "src/features/orders feature* = src/features/orders/order.ts",
      "src/features/payments feature* = src/features/payments/payment.ts",
      "src/modules/cart feature* = src/modules/cart/cart.ts",
      "src/shared shared = src/shared/log.ts",
    ]);
  });

  it("matches containers by their ASCII-lower-cased name, never stemmed (D-07)", () => {
    const result = prior({
      paths: [
        "src/Features/orders/a.ts",
        "src/domains/b.ts",
        "src/domain/c.ts",
        "src/libs/d.ts",
        "src/lib/e.ts",
      ],
    });
    expect(describeUnits(result)).toEqual([
      "src/Features/orders feature* = src/Features/orders/a.ts",
      "src/domain layer = src/domain/c.ts",
      "src/domains shared = src/domains/b.ts",
      "src/lib shared = src/lib/e.ts",
      "src/libs shared = src/libs/d.ts",
    ]);
    expect(result.splitDirectories).toEqual(["src", "src/Features", "src/domains", "src/libs"]);
  });

  it("keeps a directory of 120 nodes whole and splits it at 121 (the size cap)", () => {
    const at = [...filesIn("src/big", 119), "src/big/sub/x.ts"];
    const whole = prior({ paths: ["src/main.ts", ...at] });
    expect(whole.splitDirectories).toEqual(["src"]);
    expect(describeUnits(whole)).toEqual([
      "src root = src/main.ts",
      `src/big feature* = ${at.join(", ")}`,
    ]);
    const above = [...filesIn("src/big", 120), "src/big/sub/x.ts"];
    const split = prior({ paths: ["src/main.ts", ...above] });
    expect(split.splitDirectories).toEqual(["src", "src/big"]);
    expect(describeUnits(split)).toEqual([
      "src root = src/main.ts",
      `src/big feature* = ${filesIn("src/big", 120).join(", ")}`,
      "src/big/sub feature* = src/big/sub/x.ts",
    ]);
  });

  it("does not split an oversized directory without sub-directories (P4's case)", () => {
    const flat = filesIn("src/lib", 121);
    const result = prior({ paths: ["src/main.ts", ...flat] });
    expect(result.splitDirectories).toEqual(["src"]);
    expect(describeUnits(result)).toEqual([
      "src root = src/main.ts",
      `src/lib shared = ${flat.join(", ")}`,
    ]);
  });

  it("keeps the directory's own kind for loose files of a size-split directory (D-25)", () => {
    const settings = withModuleSettings({ maxModuleFiles: 2 });
    const result = prior(
      {
        paths: [
          "src/main.ts",
          "src/orders/a.ts",
          "src/orders/b.ts",
          "src/orders/x/c.ts",
          "src/services/a.ts",
          "src/services/b.ts",
          "src/services/x/c.ts",
          "src/utils/a.ts",
          "src/utils/b.ts",
          "src/utils/x/c.ts",
        ],
      },
      settings,
    );
    expect(describeUnits(result)).toEqual([
      "src root = src/main.ts",
      "src/orders feature* = src/orders/a.ts, src/orders/b.ts",
      "src/orders/x feature* = src/orders/x/c.ts",
      "src/services layer = src/services/a.ts, src/services/b.ts",
      "src/services/x feature* = src/services/x/c.ts",
      "src/utils shared = src/utils/a.ts, src/utils/b.ts",
      "src/utils/x feature* = src/utils/x/c.ts",
    ]);
  });

  it("lists split directories by compareStrings, not in depth-first order", () => {
    const settings = withModuleSettings({ maxModuleFiles: 2 });
    const result = prior(
      {
        paths: [
          "src/pkg/cmd/run/a.ts",
          "src/pkg-x/a.ts",
          "src/pkg-x/b.ts",
          "src/pkg-x/y/c.ts",
          "src/z.ts",
        ],
      },
      settings,
    );
    // Depth-first order would put src/pkg/cmd before src/pkg-x ("-" sorts before "/").
    expect(result.splitDirectories).toEqual(["src", "src/pkg", "src/pkg-x", "src/pkg/cmd"]);
  });

  it("gives an empty scope no units", () => {
    const result = prior({ paths: [], directory: "packages/empty" });
    expect(result.sourceRoot).toBe("packages/empty");
    expect(result.partition.units).toEqual([]);
    expect(result.partition.unitOf).toEqual(new Int32Array(0));
  });

  it("rejects a node outside the scope directory", () => {
    expect(() => prior({ paths: ["other/a.ts"], directory: "packages/api" })).toThrow(RangeError);
  });

  it("assigns every node to exactly one unit", () => {
    const result = prior({
      paths: ["src/a.ts", "src/b/c.ts", "src/features/d/e.ts", "src/features/f.ts", "x/y.ts"],
    });
    expect([...result.partition.unitOf].every((unit) => unit >= 0)).toBe(true);
    expect(result.partition.unitOf).toHaveLength(5);
  });
});

describe("partition helpers", () => {
  it("marks feature, stem and split units as destinations (D-35)", () => {
    expect(isDestinationKind("feature")).toBe(true);
    expect(isDestinationKind("stem")).toBe(true);
    expect(isDestinationKind("split")).toBe(true);
    expect(isDestinationKind("layer")).toBe(false);
    expect(isDestinationKind("shared")).toBe(false);
    expect(isDestinationKind("root")).toBe(false);
  });

  it("derives unit keys from anchors and rejects unsafe stems", () => {
    const partition: Partition = { units: [], unitOf: new Int32Array(0) };
    expect(addUnit(partition, { directory: "", stem: "payment" }, "stem")).toBe(0);
    expect(addUnit(partition, { directory: "src/a#b" }, "feature", { group: "src" })).toBe(1);
    expect(partition.units).toEqual([
      {
        key: ".#payment",
        anchor: { directory: "", stem: "payment" },
        kind: "stem",
        destination: true,
      },
      {
        key: "src/a%23b",
        anchor: { directory: "src/a#b" },
        kind: "feature",
        destination: true,
        group: "src",
      },
    ]);
    expect(() => addUnit(partition, { directory: "src", stem: "a#b" }, "stem")).toThrow(
      InvalidIdentifierError,
    );
  });

  it("lists the members of every unit in ascending order", () => {
    const members = membersByUnit(Int32Array.from([1, 0, 1, -1, 2, 1]), 3);
    expect(members.map((nodes) => [...nodes])).toEqual([[1], [0, 2, 5], [4]]);
  });

  it("reads the path of a file identifier", () => {
    expect(pathOfFile(fileId("src/a b.ts"))).toBe("src/a b.ts");
  });
});
