import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { normalizeLoose } from "./locations.js";
import {
  WorkspaceGlob,
  invalidWildcardSpecMessage,
  isImplicitGlob,
  wildcardBaseDirectory,
  wildcardRegExp,
  wildcardSubPattern,
} from "./globs.js";

/** TypeScript's own implementation (exported at runtime, not in the public typings) as a test oracle. */
const typescriptRegularExpressionForWildcard = Reflect.get(
  ts,
  "getRegularExpressionForWildcard",
) as (specs: readonly string[], basePath: string, usage: "files" | "exclude") => string | undefined;

const include = (...specs: string[]): RegExp => {
  const regExp = wildcardRegExp(specs, "files");
  if (regExp === undefined) throw new Error("no usable include specification");
  return regExp;
};
const exclude = (...specs: string[]): RegExp => {
  const regExp = wildcardRegExp(specs, "exclude");
  if (regExp === undefined) throw new Error("no usable exclude specification");
  return regExp;
};

describe("tsconfig wildcard specifications", () => {
  it("treats a last segment without '.', '*' or '?' as a directory", () => {
    expect(isImplicitGlob("src")).toBe(true);
    expect(isImplicitGlob("")).toBe(true);
    expect(isImplicitGlob("index.ts")).toBe(false);
    expect(isImplicitGlob("*")).toBe(false);
    expect(isImplicitGlob("a?")).toBe(false);
    const src = include("src");
    expect(src.test("/src/a.ts")).toBe(true);
    expect(src.test("/src/deep/er/a.tsx")).toBe(true);
    expect(src.test("/srcx/a.ts")).toBe(false);
    expect(src.test("/lib/src/a.ts")).toBe(false);
  });

  it("matches the root include ('.' or the default '**/*') everywhere except dot paths and package folders", () => {
    for (const regExp of [include(""), include("**/*")]) {
      expect(regExp.test("/a.ts")).toBe(true);
      expect(regExp.test("/src/a/b.ts")).toBe(true);
      expect(regExp.test("/.storybook/main.ts")).toBe(false);
      expect(regExp.test("/src/.hidden.ts")).toBe(false);
      expect(regExp.test("/node_modules/x/index.ts")).toBe(false);
      expect(regExp.test("/src/bower_components/x.ts")).toBe(false);
      expect(regExp.test("/jspm_packages/x.ts")).toBe(false);
    }
  });

  it("excludes .min.js files from '*' in include", () => {
    const regExp = include("lib/*.js");
    expect(regExp.test("/lib/app.js")).toBe(true);
    expect(regExp.test("/lib/app.min.js")).toBe(false);
  });

  it("supports '?' and literal characters that need escaping", () => {
    const regExp = include("pkg-?/a+b(c).ts");
    expect(regExp.test("/pkg-1/a+b(c).ts")).toBe(true);
    expect(regExp.test("/pkg-12/a+b(c).ts")).toBe(false);
    expect(regExp.test("/pkg-1/aab(c).ts")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(include("src").test("/SRC/a.ts")).toBe(false);
    expect(exclude("Dist").test("/dist/a.js")).toBe(false);
  });

  it("excludes paths below a matched path", () => {
    const regExp = exclude("dist", "**/*.test.ts");
    expect(regExp.test("/dist/a.js")).toBe(true);
    expect(regExp.test("/dist/nested/a.js")).toBe(true);
    expect(regExp.test("/src/a.test.ts")).toBe(true);
    expect(regExp.test("/src/a.ts")).toBe(false);
    expect(regExp.test("/distribution/a.js")).toBe(false);
    expect(exclude("src/**").test("/src/a/b.ts")).toBe(true);
  });

  it("ignores include specifications ending in '**' and reports invalid specifications like TypeScript", () => {
    expect(wildcardSubPattern("src/**", "files")).toBeUndefined();
    expect(wildcardRegExp(["src/**"], "files")).toBeUndefined();
    expect(invalidWildcardSpecMessage("src/**", "files")).toMatch(/recursive directory wildcard/);
    expect(invalidWildcardSpecMessage("src/**/", "files")).toMatch(/recursive directory wildcard/);
    expect(invalidWildcardSpecMessage("src/**", "exclude")).toBeUndefined();
    expect(invalidWildcardSpecMessage("**/../x", "files")).toMatch(/parent directory/);
    expect(invalidWildcardSpecMessage("src/**/a/..", "exclude")).toMatch(/parent directory/);
    expect(invalidWildcardSpecMessage("../src/**/*", "files")).toBeUndefined();
    expect(invalidWildcardSpecMessage("src", "files")).toBeUndefined();
  });

  it("computes the directory below which a specification matches", () => {
    expect(wildcardBaseDirectory("")).toBe("");
    expect(wildcardBaseDirectory("src")).toBe("src");
    expect(wildcardBaseDirectory("src/index.ts")).toBe("src");
    expect(wildcardBaseDirectory("src/**/*.ts")).toBe("src");
    expect(wildcardBaseDirectory("a/b*/c")).toBe("a");
    expect(wildcardBaseDirectory("**/*")).toBe("");
  });

  const segment = fc.constantFrom(
    "src",
    "lib",
    "a",
    "b.ts",
    "*",
    "**",
    "?",
    "*.ts",
    "a?",
    "*.min.js",
    ".hidden",
    "node_modules",
    "x-y",
    "a+b",
    "v1.2",
  );
  const spec = fc.array(segment, { minLength: 1, maxLength: 5 }).map((parts) => parts.join("/"));
  const pathSegment = fc.constantFrom(
    "src",
    "lib",
    "a",
    "b.ts",
    "a.ts",
    "x.min.js",
    "app.js",
    ".hidden",
    "node_modules",
    "x-y",
    "a+b",
    "v1.2",
    "ab",
    "b",
  );
  const path = fc
    .array(pathSegment, { minLength: 1, maxLength: 6 })
    .map((parts) => `/${parts.join("/")}`);

  it("produces exactly TypeScript's regular expressions (oracle: TypeScript 6.0)", () => {
    fc.assert(
      fc.property(
        fc.array(spec, { minLength: 1, maxLength: 3 }),
        fc.constantFrom("files", "exclude"),
        (specs, usage) => {
          const ours = wildcardRegExp(specs.map(normalizeLoose), usage);
          const theirs = typescriptRegularExpressionForWildcard(specs, "/", usage);
          expect(ours?.source).toBe(theirs === undefined ? undefined : new RegExp(theirs).source);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("matches the same paths as TypeScript (oracle: TypeScript 6.0)", () => {
    fc.assert(
      fc.property(
        spec,
        fc.array(path, { minLength: 1, maxLength: 8 }),
        fc.constantFrom("files", "exclude"),
        (one, paths, usage) => {
          const ours = wildcardRegExp([normalizeLoose(one)], usage);
          const source = typescriptRegularExpressionForWildcard([one], "/", usage);
          const theirs = source === undefined ? undefined : new RegExp(source);
          for (const candidate of paths) {
            expect(ours?.test(candidate) ?? false).toBe(theirs?.test(candidate) ?? false);
          }
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe("WorkspaceGlob", () => {
  it.each([
    ["packages/*", "packages/a", true],
    ["packages/*", "packages/a/b", false],
    ["packages/*", "packages", false],
    ["packages/*", "apps/a", false],
    ["apps/**", "apps", true],
    ["apps/**", "apps/a", true],
    ["apps/**", "apps/a/b/c", true],
    ["**/pkg", "pkg", true],
    ["**/pkg", "x/y/pkg", true],
    ["**/pkg", "x/y/pkg2", false],
    ["pkg-?", "pkg-1", true],
    ["pkg-?", "pkg-12", false],
    ["tools/cli", "tools/cli", true],
    ["tools/cli", "tools/clix", false],
    ["./packages/*/", "packages/x", true],
    ["a.b/*", "a.b/c", true],
    ["a.b/*", "aab/c", false],
    ["Packages/*", "packages/a", false],
  ])("%s matches %s: %s", (pattern, directory, expected) => {
    expect(new WorkspaceGlob(pattern).matches(directory)).toBe(expected);
  });

  it("agrees with a regular-expression reference implementation", () => {
    // Reference: every segment is written as "/<segment>"; `**` is any number of such segments.
    const toRegExp = (pattern: string): RegExp => {
      const source = pattern
        .split("/")
        .filter((part) => part !== "" && part !== ".")
        .map((part) =>
          part === "**"
            ? "(?:/[^/]+)*"
            : `/${part.replace(/[^\w]/g, (character) =>
                character === "*" ? "[^/]*" : character === "?" ? "[^/]" : `\\${character}`,
              )}`,
        )
        .join("");
      return new RegExp(`^${source}$`);
    };
    const part = fc.constantFrom("packages", "apps", "*", "**", "a?", "x", "y", "a*");
    const pattern = fc.array(part, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/"));
    const segments = fc.array(fc.constantFrom("packages", "apps", "a", "ab", "x", "y", "a1"), {
      maxLength: 5,
    });
    fc.assert(
      fc.property(pattern, segments, (glob, parts) => {
        const directory = parts.join("/");
        const reference = toRegExp(glob).test(parts.map((segment) => `/${segment}`).join(""));
        expect(new WorkspaceGlob(glob).matches(directory)).toBe(reference);
      }),
      { numRuns: 500 },
    );
  });
});
