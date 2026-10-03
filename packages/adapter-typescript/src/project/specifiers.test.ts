import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  installedLocationOf,
  isAbsoluteOrUrlSpecifier,
  isRelativeSpecifier,
  isValidPackageName,
  packageNameCandidates,
  parsePackageSpecifier,
  runtimePackageName,
} from "./specifiers.js";

describe("installed packages", () => {
  it("finds the package after the last node_modules segment", () => {
    expect(installedLocationOf("node_modules/@types/react")).toEqual({
      packageName: "@types/react",
      path: "",
    });
    expect(installedLocationOf("../../node_modules/@angular/core/testing/index.d.ts")).toEqual({
      packageName: "@angular/core",
      path: "testing/index.d.ts",
    });
    expect(
      installedLocationOf("node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/fp.js"),
    ).toEqual({ packageName: "lodash", path: "fp.js" });
    expect(installedLocationOf("src/lib/a.ts")).toBeUndefined();
    expect(installedLocationOf("node_modules")).toBeUndefined();
    expect(installedLocationOf("node_modules/@scope")).toBeUndefined();
    expect(installedLocationOf("node_modules/@/x")).toBeUndefined();
  });

  it("names the package a DefinitelyTyped package provides types for", () => {
    expect(runtimePackageName("@types/react")).toBe("react");
    expect(runtimePackageName("@types/babel__core")).toBe("@babel/core");
    expect(runtimePackageName("react")).toBe("react");
    expect(runtimePackageName("@acme/types")).toBe("@acme/types");
  });
});

describe("specifier classification", () => {
  it.each([".", "..", "./x", "../x", "./", "../../a/b.js"])("%s is relative", (specifier) => {
    expect(isRelativeSpecifier(specifier)).toBe(true);
  });

  it.each(["x", ".x", "..x", "@scope/x", "#internal", "/abs", "node:fs"])(
    "%s is not relative",
    (specifier) => {
      expect(isRelativeSpecifier(specifier)).toBe(false);
    },
  );

  it.each([
    "/abs/x.js",
    "\\server\\share",
    "C:\\x.js",
    "c:/x.js",
    "file:///x.js",
    "https://esm.sh/react",
    "data:text/javascript,1",
  ])("%s is absolute or a URL", (specifier) => {
    expect(isAbsoluteOrUrlSpecifier(specifier)).toBe(true);
  });

  it.each(["react", "@scope/pkg", "./x", "#x", "lodash/fp"])(
    "%s is neither absolute nor a URL",
    (specifier) => {
      expect(isAbsoluteOrUrlSpecifier(specifier)).toBe(false);
    },
  );
});

describe("package names", () => {
  it.each([
    "react",
    "react-dom",
    "@scope/pkg",
    "lodash.get",
    "JSONStream",
    "a",
    "@a/b.c",
    "x_y",
    "-x",
  ])("%s is valid", (name) => {
    expect(isValidPackageName(name)).toBe(true);
  });

  it.each([
    "",
    "@scope",
    "@/x",
    "@scope/",
    ".hidden",
    "_private",
    "@scope/.x",
    "a b",
    "a/b",
    "ünicode",
    "x".repeat(215),
  ])("%j is invalid", (name) => {
    expect(isValidPackageName(name)).toBe(false);
  });

  it.each([
    ["react", "react", "."],
    ["react-dom/client", "react-dom", "./client"],
    ["@scope/pkg", "@scope/pkg", "."],
    ["@scope/pkg/sub/x.js", "@scope/pkg", "./sub/x.js"],
    ["lodash/", "lodash", "."],
  ])("%s names %s at %s", (specifier, packageName, subpath) => {
    expect(parsePackageSpecifier(specifier)).toEqual({ packageName, subpath });
  });

  it.each(["@scope", "@/utils/x", ".hidden/x", "~"])(
    "%s does not name a valid package (or is ambiguous)",
    (specifier) => {
      const parsed = parsePackageSpecifier(specifier);
      if (specifier === "~") expect(parsed).toEqual({ packageName: "~", subpath: "." });
      else expect(parsed).toBeUndefined();
    },
  );

  it("lists package name candidates longest first", () => {
    expect(packageNameCandidates("@a/b/c/d")).toEqual([
      { packageName: "@a/b/c/d", subpath: "." },
      { packageName: "@a/b/c", subpath: "./d" },
      { packageName: "@a/b", subpath: "./c/d" },
      { packageName: "@a", subpath: "./b/c/d" },
    ]);
    expect(packageNameCandidates("x")).toEqual([{ packageName: "x", subpath: "." }]);
  });

  it("round-trips valid names with subpaths", () => {
    const part = fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,8}$/);
    fc.assert(
      fc.property(
        fc.option(part, { nil: undefined }),
        part,
        fc.array(part, { maxLength: 3 }),
        (scope, name, rest) => {
          const packageName = scope === undefined ? name : `@${scope}/${name}`;
          const specifier = [packageName, ...rest].join("/");
          expect(parsePackageSpecifier(specifier)).toEqual({
            packageName,
            subpath: rest.length === 0 ? "." : `./${rest.join("/")}`,
          });
        },
      ),
    );
  });
});
