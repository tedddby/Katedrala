import { compareStrings, isWithin, parentPath } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DirectoryTree,
  commonDirectory,
  directoryKind,
  directoryLayer,
  sourceRoot,
} from "./directories.js";
import { resolveInferenceSettings } from "./settings.js";

const vocabulary = resolveInferenceSettings().vocabulary;

describe("directoryKind (§1.4, D-07, D-08)", () => {
  it("classifies the default vocabulary", () => {
    for (const name of ["src", "packages", "features", "modules", "apps", "libs", "domains"]) {
      expect(directoryKind(name, vocabulary)).toBe("container");
    }
    for (const name of [
      "controllers",
      "services",
      "domain",
      "models",
      "repositories",
      "api",
      "ui",
    ]) {
      expect(directoryKind(name, vocabulary)).toBe("layer");
    }
    for (const name of [
      "shared",
      "common",
      "utils",
      "utilities",
      "lib",
      "helpers",
      "types",
      "core",
    ]) {
      expect(directoryKind(name, vocabulary)).toBe("shared");
    }
    for (const name of ["orders", "catalog", "billing", "payments", "", "x"]) {
      expect(directoryKind(name, vocabulary)).toBe("feature");
    }
  });

  it("matches containers exactly and layers and shared directories stemmed (D-07)", () => {
    // `domains` is a container although it stems to the layer key `domain`; `domain` stays a layer.
    expect(directoryKind("domains", vocabulary)).toBe("container");
    expect(directoryKind("domain", vocabulary)).toBe("layer");
    // `libs` is a container although it stems to the shared key `lib`; `lib` stays shared.
    expect(directoryKind("libs", vocabulary)).toBe("container");
    expect(directoryKind("lib", vocabulary)).toBe("shared");
    // A container name is not stemmed: `srcs` is not `src`.
    expect(directoryKind("srcs", vocabulary)).toBe("feature");
  });

  it("folds ASCII case only (D-05)", () => {
    expect(directoryKind("SRC", vocabulary)).toBe("container");
    expect(directoryKind("Controllers", vocabulary)).toBe("layer");
    expect(directoryKind("Utils", vocabulary)).toBe("shared");
    // Non-ASCII letters are not case-folded, so `SERVİCES` (dotted capital I) is no layer.
    expect(directoryKind("SERVİCES", vocabulary)).toBe("feature");
  });

  it("classifies a path by its last segment", () => {
    expect(directoryKind("src/orders/controllers", vocabulary)).toBe("layer");
    expect(directoryKind("packages/api/src", vocabulary)).toBe("container");
    expect(directoryKind("src/shared", vocabulary)).toBe("shared");
  });

  it("applies the precedence container > layer > shared > feature (D-08)", () => {
    const overlapping = resolveInferenceSettings({
      modules: {
        container_directories: ["gateway", "warehouse"],
        shared_directories: ["gateway", "warehouse", "store", "bazaar"],
      },
      layers: { directory_layers: { warehouse: "storage", bazaar: "market" } },
    }).vocabulary;
    // container, layer and shared at once: container
    expect(directoryKind("warehouse", overlapping)).toBe("container");
    // container and layer (default `gateway` layer key) and shared: container
    expect(directoryKind("gateway", overlapping)).toBe("container");
    // layer and shared: layer
    expect(directoryKind("stores", overlapping)).toBe("layer");
    expect(directoryKind("bazaar", overlapping)).toBe("layer");
    // shared only
    expect(directoryKind("common", overlapping)).toBe("shared");
  });

  it("follows configured removals", () => {
    const configured = resolveInferenceSettings({
      modules: { container_directories: ["!src"], shared_directories: ["!utils"] },
      layers: { directory_layers: { services: null } },
    }).vocabulary;
    expect(directoryKind("src", configured)).toBe("feature");
    expect(directoryKind("utils", configured)).toBe("feature");
    expect(directoryKind("services", configured)).toBe("feature");
  });
});

describe("directoryLayer (§4.3, D-18)", () => {
  it("names the layer of layer-kind directories", () => {
    expect(directoryLayer("controllers", vocabulary)).toBe("controller");
    expect(directoryLayer("repositories", vocabulary)).toBe("repository");
    expect(directoryLayer("persistence", vocabulary)).toBe("repository");
    expect(directoryLayer("http", vocabulary)).toBe("presentation");
    expect(directoryLayer("src/domain", vocabulary)).toBe("domain");
  });

  it("names no layer for containers, shared and feature directories (D-08)", () => {
    expect(directoryLayer("domains", vocabulary)).toBeUndefined();
    expect(directoryLayer("shared", vocabulary)).toBeUndefined();
    expect(directoryLayer("orders", vocabulary)).toBeUndefined();
  });
});

describe("DirectoryTree (§2, §3.5)", () => {
  const paths = [
    "src/orders/order.service.ts",
    "src/main.ts",
    "src/orders/http/order.controller.ts",
    "README.md",
    "src/catalog/product.ts",
    "src/orders/order.ts",
    "test/orders.test.ts",
  ];
  const tree = DirectoryTree.fromPaths(paths);

  it("lists child directories with files, sorted", () => {
    expect(tree.children("")).toEqual(["src", "test"]);
    expect(tree.children("src")).toEqual(["src/catalog", "src/orders"]);
    expect(tree.children("src/orders")).toEqual(["src/orders/http"]);
    expect(tree.children("src/orders/http")).toEqual([]);
  });

  it("lists direct files as ascending input indices", () => {
    expect(tree.directFiles("")).toEqual([3]);
    expect(tree.directFiles("src")).toEqual([1]);
    expect(tree.directFiles("src/orders")).toEqual([0, 5]);
    expect(tree.directFiles("src/catalog")).toEqual([4]);
  });

  it("counts files in subtrees", () => {
    expect(tree.subtreeSize("")).toBe(7);
    expect(tree.subtreeSize("src")).toBe(5);
    expect(tree.subtreeSize("src/orders")).toBe(3);
    expect(tree.subtreeSize("src/orders/http")).toBe(1);
    expect(tree.subtreeFiles("src/orders")).toEqual([0, 2, 5]);
    expect(tree.subtreeFiles("")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("answers for directories without files", () => {
    for (const directory of ["src/payments", "src/orders/http/x", "docs", "src/ord"]) {
      expect(tree.has(directory)).toBe(false);
      expect(tree.children(directory)).toEqual([]);
      expect(tree.directFiles(directory)).toEqual([]);
      expect(tree.subtreeSize(directory)).toBe(0);
      expect(tree.subtreeFiles(directory)).toEqual([]);
    }
    expect(tree.has("src/orders/http")).toBe(true);
  });

  it("lists every directory in path order", () => {
    expect(tree.directories()).toEqual([
      "",
      "src",
      "src/catalog",
      "src/orders",
      "src/orders/http",
      "test",
    ]);
  });

  it("returns frozen arrays from its queries", () => {
    expect(Object.isFrozen(tree.children("src"))).toBe(true);
    expect(Object.isFrozen(tree.directFiles("src/orders"))).toBe(true);
    expect(Object.isFrozen(tree.children("nowhere"))).toBe(true);
  });

  it("has only the root for top-level files, and nothing without files", () => {
    const flat = DirectoryTree.fromPaths(["a.ts", "b.ts"]);
    expect(flat.directories()).toEqual([""]);
    expect(flat.directFiles("")).toEqual([0, 1]);
    const empty = DirectoryTree.fromPaths([]);
    expect(empty.directories()).toEqual([]);
    expect(empty.subtreeSize("")).toBe(0);
  });

  it("orders children by UTF-16 code units, not by locale", () => {
    const mixed = DirectoryTree.fromPaths(["b/x.ts", "B/x.ts", "a-b/x.ts", "a/x.ts", "é/x.ts"]);
    expect(mixed.children("")).toEqual(["B", "a", "a-b", "b", "é"]);
  });

  it("agrees with a brute-force computation (property)", () => {
    const segment = fc.constantFrom("a", "b", "src", "x-y", "B");
    const path = fc
      .array(segment, { minLength: 0, maxLength: 3 })
      .chain((directories) =>
        fc.constantFrom("f.ts", "g.ts").map((file) => [...directories, file].join("/")),
      );
    fc.assert(
      fc.property(fc.uniqueArray(path, { maxLength: 12 }), (files) => {
        const subject = DirectoryTree.fromPaths(files);
        const directories = new Set<string>();
        for (const file of files) {
          for (let d = parentPath(file); ; d = parentPath(d)) {
            directories.add(d);
            if (d === "") break;
          }
        }
        expect(subject.directories()).toEqual([...directories].sort(compareStrings));
        for (const directory of directories) {
          const below = files.flatMap((file, index) => (isWithin(file, directory) ? [index] : []));
          expect(subject.subtreeSize(directory)).toBe(below.length);
          expect(subject.subtreeFiles(directory)).toEqual(below);
          expect(subject.directFiles(directory)).toEqual(
            files.flatMap((file, index) => (parentPath(file) === directory ? [index] : [])),
          );
          expect(subject.children(directory)).toEqual(
            [...directories]
              .filter((child) => child !== "" && child !== directory)
              .filter((child) => parentPath(child) === directory)
              .sort(compareStrings),
          );
        }
      }),
      { seed: 20261008, numRuns: 300 },
    );
  });
});

describe("sourceRoot (§3.5 step 1, D-11)", () => {
  it("descends while a directory has no direct file and exactly one child", () => {
    expect(
      sourceRoot("packages/api", ["packages/api/src/server.ts", "packages/api/src/a/b.ts"]),
    ).toBe("packages/api/src");
    expect(sourceRoot("", ["src/main.ts", "src/orders/order.ts"])).toBe("src");
    expect(sourceRoot("", ["src/app/orders/order.ts", "src/app/catalog/product.ts"])).toBe(
      "src/app",
    );
    expect(sourceRoot("", ["src/app/orders/order.ts"])).toBe("src/app/orders");
  });

  it("stops at a directory with direct files or several children", () => {
    expect(sourceRoot("", ["index.ts", "src/a.ts"])).toBe("");
    expect(sourceRoot("", ["src/a.ts", "lib/b.ts"])).toBe("");
    expect(sourceRoot("", ["src/orders/a.ts", "src/catalog/b.ts"])).toBe("src");
  });

  it("stays at the scope directory when it has no files", () => {
    expect(sourceRoot("packages/web", [])).toBe("packages/web");
    expect(sourceRoot("packages/web", ["packages/api/src/a.ts"])).toBe("packages/web");
    expect(sourceRoot("", [])).toBe("");
  });

  it("ignores files outside the scope directory", () => {
    expect(
      sourceRoot("packages/core", [
        "packages/core/src/index.ts",
        "packages/api/src/server.ts",
        "x.ts",
      ]),
    ).toBe("packages/core/src");
  });

  it("does not depend on the order of the paths", () => {
    const paths = ["src/a/x.ts", "src/a/y/z.ts", "src/b.ts"];
    expect(sourceRoot("", paths)).toBe("src");
    expect(sourceRoot("", [...paths].reverse())).toBe("src");
  });
});

describe("commonDirectory (D-43)", () => {
  it("is the deepest directory containing every path, segment by segment", () => {
    expect(commonDirectory(["src/payments/index.ts", "src/payments/stripe/client.ts"])).toBe(
      "src/payments",
    );
    expect(commonDirectory(["src/a/x.ts", "src/ab/y.ts"])).toBe("src");
    expect(commonDirectory(["src/a/x.ts", "lib/y.ts"])).toBe("");
    expect(commonDirectory(["src/a/b/c/x.ts", "src/a/b/y.ts", "src/a/b/c/d/z.ts"])).toBe("src/a/b");
  });

  it("gives a single file's directory, the root for top-level files and no files", () => {
    expect(commonDirectory(["src/payments/checkout.ts"])).toBe("src/payments");
    expect(commonDirectory(["main.ts", "src/x.ts"])).toBe("");
    expect(commonDirectory(["main.ts"])).toBe("");
    expect(commonDirectory([])).toBe("");
  });

  it("does not depend on the order of the paths (property)", () => {
    const path = fc
      .array(fc.constantFrom("a", "b", "ab"), { minLength: 0, maxLength: 4 })
      .map((segments) => [...segments, "f.ts"].join("/"));
    fc.assert(
      fc.property(fc.array(path, { minLength: 1, maxLength: 6 }), (paths) => {
        const common = commonDirectory(paths);
        expect(commonDirectory([...paths].reverse())).toBe(common);
        // It contains every path, and no child of it does.
        for (const file of paths) expect(isWithin(parentPath(file), common)).toBe(true);
        const deeper = new Set(paths.map((file) => parentPath(file)).filter((d) => d !== common));
        for (const candidate of deeper) {
          const child =
            common === ""
              ? candidate.split("/")[0]!
              : `${common}/${candidate.slice(common.length + 1).split("/")[0]!}`;
          expect(paths.every((file) => isWithin(parentPath(file), child))).toBe(false);
        }
      }),
      { seed: 20261008, numRuns: 300 },
    );
  });
});
