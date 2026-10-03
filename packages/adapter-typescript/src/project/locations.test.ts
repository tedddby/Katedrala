import fc from "fast-check";
import { PathOutsideRootError, normalizePath } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { Locator, isInsideRoot, joinLoose, normalizeLoose } from "./locations.js";

describe("loose paths", () => {
  it.each([
    ["", ""],
    ["./a/b", "a/b"],
    ["a/../b", "b"],
    ["a/../../b", "../b"],
    ["../../x/./y", "../../x/y"],
    ["..\\x\\y", "../x/y"],
    ["a/b/../../..", ".."],
    ["a//b/", "a/b"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeLoose(input)).toBe(expected);
  });

  it("agrees with normalizePath inside the root and keeps escapes otherwise", () => {
    const segment = fc.constantFrom("a", "b", ".", "..", "c.ts", "");
    fc.assert(
      fc.property(fc.array(segment, { maxLength: 8 }), (segments) => {
        const path = segments.join("/");
        const loose = normalizeLoose(path);
        try {
          expect(loose).toBe(normalizePath(path));
          expect(isInsideRoot(loose)).toBe(true);
        } catch (error) {
          if (!(error instanceof PathOutsideRootError)) throw error;
          expect(isInsideRoot(loose)).toBe(false);
        }
        expect(normalizeLoose(loose)).toBe(loose);
      }),
    );
  });

  it("joins relative to a base", () => {
    expect(joinLoose("", "a")).toBe("a");
    expect(joinLoose("packages/api", "../../tsconfig.base.json")).toBe("tsconfig.base.json");
    expect(joinLoose("packages/api", "../../../x.json")).toBe("../x.json");
  });
});

describe("Locator", () => {
  const nested = new Locator("packages/api");
  const atTop = new Locator("");
  const unknown = new Locator(undefined);

  it("canonicalizes paths that climb above the root and come back", () => {
    expect(nested.canonical("../../packages/api/src")).toBe("src");
    expect(nested.canonical("../../packages/api")).toBe("");
    expect(nested.canonical("../core/src")).toBe("../core/src");
    expect(nested.canonical("../../tsconfig.base.json")).toBe("../../tsconfig.base.json");
    expect(nested.canonical("../../../x")).toBeUndefined();
    expect(atTop.canonical("../x")).toBeUndefined();
    expect(unknown.canonical("../x/../y")).toBe("../y");
    expect(nested.canonical("src/a.ts")).toBe("src/a.ts");
  });

  it("converts to paths from the top level", () => {
    expect(nested.topLevelPath("../../tsconfig.base.json")).toBe("tsconfig.base.json");
    expect(nested.topLevelPath("src/index.ts")).toBe("packages/api/src/index.ts");
    expect(nested.topLevelPath("../../../x")).toBeUndefined();
    expect(unknown.topLevelPath("src")).toBeUndefined();
    expect(atTop.topLevelPath("src")).toBe("src");
  });

  it("uses top-level coordinates for wildcard matching when known", () => {
    expect(nested.matchPath("src/a.ts")).toBe("packages/api/src/a.ts");
    expect(nested.matchPath("../../packages/*/src")).toBe("packages/*/src");
    expect(unknown.matchPath("src/a.ts")).toBe("src/a.ts");
    expect(unknown.matchPath("../x")).toBeUndefined();
    expect(nested.rootPathOfMatchPath("packages/api/src/a.ts")).toBe("src/a.ts");
    expect(nested.rootPathOfMatchPath("packages/api")).toBe("");
    expect(nested.rootPathOfMatchPath("packages/core/a.ts")).toBeUndefined();
    expect(unknown.rootPathOfMatchPath("src/a.ts")).toBe("src/a.ts");
    expect(nested.rootDirectoryOfMatchPath("packages/api/src")).toBe("src");
    expect(nested.rootDirectoryOfMatchPath("packages")).toBe("");
    expect(nested.rootDirectoryOfMatchPath("")).toBe("");
    expect(nested.rootDirectoryOfMatchPath("apps")).toBeUndefined();
    expect(atTop.rootDirectoryOfMatchPath("apps")).toBe("apps");
  });

  it("lists the directories above the root, nearest first, in canonical form", () => {
    expect(nested.ancestorDirectories()).toEqual(["..", "../.."]);
    expect(atTop.ancestorDirectories()).toEqual([]);
    expect(unknown.ancestorDirectories()).toEqual([]);
    for (const directory of nested.ancestorDirectories()) {
      expect(nested.canonical(directory)).toBe(directory);
    }
    expect(nested.topLevelPath("../tsconfig.json")).toBe("packages/tsconfig.json");
  });

  it("displays locations above the root relative to the top level", () => {
    expect(nested.display("tsconfig.json")).toBe("tsconfig.json");
    expect(nested.display("../../tsconfig.base.json")).toBe("<top-level>/tsconfig.base.json");
    expect(unknown.display("../tsconfig.base.json")).toBe("../tsconfig.base.json");
  });

  it("round-trips any root path through the top level", () => {
    const segment = fc.constantFrom("a", "b", "src", "x.ts");
    fc.assert(
      fc.property(
        fc.array(segment, { minLength: 1, maxLength: 3 }),
        fc.array(segment, { maxLength: 4 }),
        (subdirectoryParts, pathParts) => {
          const subdirectory = subdirectoryParts.join("/");
          const locator = new Locator(subdirectory);
          const path = pathParts.join("/");
          const viaTop = `${"../".repeat(subdirectoryParts.length)}${subdirectory}/${path}`;
          expect(locator.canonical(viaTop)).toBe(path);
          expect(locator.rootPathOfMatchPath(locator.matchPath(path) ?? "")).toBe(path);
        },
      ),
    );
  });
});
