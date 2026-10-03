import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CONDITION_PREFERENCE, exportsMap, matchSubpath, targetStrings } from "./exports-field.js";

describe("targetStrings", () => {
  it("orders conditions by preference, then unknown conditions in key order", () => {
    expect(
      targetStrings({
        types: "./t.d.ts",
        browser: "./browser.js",
        default: "./d.js",
        require: "./r.cjs",
        import: "./i.mjs",
        worker: "./w.js",
        source: "./src/index.ts",
      }),
    ).toEqual([
      "./src/index.ts",
      "./i.mjs",
      "./r.cjs",
      "./d.js",
      "./t.d.ts",
      "./browser.js",
      "./w.js",
    ]);
  });

  it("flattens nested conditions and fallback arrays, skipping null and invalid keys", () => {
    expect(
      targetStrings([
        null,
        { node: { import: "./node.mjs", default: null }, "./bad": "./x.js" },
        "./fallback.js",
        42,
      ]),
    ).toEqual(["./node.mjs", "./fallback.js"]);
  });

  it("matches only active conditions, in key order, when given a condition set", () => {
    const conditions = new Set(["node", "require", "types", "default"]);
    expect(
      targetStrings(
        {
          import: "./i.json",
          types: "./t.json",
          node: { require: "./n.json" },
          default: "./d.json",
        },
        conditions,
      ),
    ).toEqual(["./t.json", "./n.json", "./d.json"]);
    expect(
      matchSubpath({ "./*": { browser: "./b/*.json", default: "./d/*.json" } }, "./x", conditions),
    ).toEqual({ key: "./*", targets: ["./d/x.json"] });
  });

  it("de-duplicates targets", () => {
    expect(targetStrings({ import: "./a.js", default: "./a.js" })).toEqual(["./a.js"]);
  });

  it("follows the documented preference for every pair of known conditions", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...CONDITION_PREFERENCE), { minLength: 1 }),
        (conditions) => {
          const value = Object.fromEntries(
            conditions.map((condition) => [condition, `./${condition}.js`]),
          );
          const expected = CONDITION_PREFERENCE.filter((condition) =>
            conditions.includes(condition),
          ).map((condition) => `./${condition}.js`);
          expect(targetStrings(value)).toEqual(expected);
        },
      ),
    );
  });
});

describe("exportsMap", () => {
  it("treats strings, arrays and condition objects as the package root", () => {
    expect(exportsMap("./index.js")).toEqual({ ".": "./index.js" });
    expect(exportsMap(["./a.js"])).toEqual({ ".": ["./a.js"] });
    expect(exportsMap({ import: "./a.mjs" })).toEqual({ ".": { import: "./a.mjs" } });
  });

  it("keeps subpath maps and drops condition keys mixed into them", () => {
    expect(exportsMap({ ".": "./a.js", "./b": "./b.js", import: "./x.js" })).toEqual({
      ".": "./a.js",
      "./b": "./b.js",
    });
  });

  it("returns undefined without exports and an empty map for invalid values", () => {
    expect(exportsMap(undefined)).toBeUndefined();
    expect(exportsMap(null)).toBeUndefined();
    expect(exportsMap(42)).toEqual({});
  });
});

describe("matchSubpath", () => {
  const map = {
    ".": "./dist/index.js",
    "./utils": { import: "./dist/utils.mjs", require: "./dist/utils.cjs" },
    "./features/*": "./dist/features/*/index.js",
    "./features/internal/*": null,
    "./icons/*.svg": "./assets/*.svg",
    "./*": "./dist/*.js",
    "./data/*/*": "./invalid.js",
  };

  it("prefers exact keys", () => {
    expect(matchSubpath(map, ".")).toEqual({ key: ".", targets: ["./dist/index.js"] });
    expect(matchSubpath(map, "./utils")).toEqual({
      key: "./utils",
      targets: ["./dist/utils.mjs", "./dist/utils.cjs"],
    });
  });

  it("chooses the pattern with the longest prefix and substitutes every '*'", () => {
    expect(matchSubpath(map, "./features/cart")).toEqual({
      key: "./features/*",
      targets: ["./dist/features/cart/index.js"],
    });
    expect(matchSubpath(map, "./features/internal/x")).toEqual({
      key: "./features/internal/*",
      targets: [],
    });
    expect(matchSubpath(map, "./icons/arrow.svg")).toEqual({
      key: "./icons/*.svg",
      targets: ["./assets/arrow.svg"],
    });
    expect(matchSubpath(map, "./other/x")).toEqual({ key: "./*", targets: ["./dist/other/x.js"] });
    expect(matchSubpath({ "./a/*": "./x/*/y/*.js" }, "./a/b")).toEqual({
      key: "./a/*",
      targets: ["./x/b/y/b.js"],
    });
  });

  it("requires '*' to match at least one character and ignores keys with several '*'", () => {
    expect(matchSubpath({ "./features/*": "./x/*.js" }, "./features/")).toBeUndefined();
    expect(matchSubpath({ "./data/*/*": "./x.js" }, "./data/a/b")).toBeUndefined();
    expect(matchSubpath({ "./icons/*.svg": "./x/*.svg" }, "./icons/.svg")).toBeUndefined();
  });

  it("matches #imports keys", () => {
    const imports = { "#internal/*": "./src/internal/*.js", "#dep": "lodash" };
    expect(matchSubpath(imports, "#internal/a")).toEqual({
      key: "#internal/*",
      targets: ["./src/internal/a.js"],
    });
    expect(matchSubpath(imports, "#dep")).toEqual({ key: "#dep", targets: ["lodash"] });
    expect(matchSubpath(imports, "#missing")).toBeUndefined();
  });
});
