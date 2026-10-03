import { describe, expect, it } from "vitest";
import {
  WorkspaceIndex,
  lernaPackagePatterns,
  manifestWorkspacePatterns,
  parsePnpmWorkspacePackages,
} from "./workspaces.js";

describe("parsePnpmWorkspacePackages", () => {
  it("reads an indented block sequence with quotes and comments", () => {
    const text = [
      "# workspace",
      "packages:",
      '  - "packages/*"',
      "  - 'apps/*' # applications",
      "",
      "  # tools",
      "  - tools/**",
      "  - '!**/test/**'",
      '  - "it\'s\\"quoted\\""',
      "  - 'single ''quoted'''",
      "catalog:",
      "  react: ^19.0.0",
    ].join("\n");
    expect(parsePnpmWorkspacePackages(text)).toEqual([
      "packages/*",
      "apps/*",
      "tools/**",
      "!**/test/**",
      'it\'s"quoted"',
      "single 'quoted'",
    ]);
  });

  it("reads a sequence at the key's indentation and stops at the next key", () => {
    expect(
      parsePnpmWorkspacePackages("packages:\n- a/*\n- b\nonlyBuiltDependencies:\n  - esbuild\n"),
    ).toEqual(["a/*", "b"]);
  });

  it("reads a single-line flow sequence", () => {
    expect(parsePnpmWorkspacePackages(`packages: ["packages/*", 'apps/*', tools] # all`)).toEqual([
      "packages/*",
      "apps/*",
      "tools",
    ]);
  });

  it("handles CRLF line endings, empty items and missing keys", () => {
    expect(parsePnpmWorkspacePackages("packages:\r\n  - a\r\n  -\r\n  - b\r\n")).toEqual([
      "a",
      "b",
    ]);
    expect(parsePnpmWorkspacePackages("catalog:\n  x: 1\n")).toEqual([]);
    expect(parsePnpmWorkspacePackages("  packages:\n  - a\n")).toEqual([]);
    expect(parsePnpmWorkspacePackages("packages: packages/*\n")).toEqual([]);
    expect(parsePnpmWorkspacePackages("")).toEqual([]);
  });
});

describe("manifest workspace declarations", () => {
  it("reads workspaces arrays and objects", () => {
    expect(manifestWorkspacePatterns({ workspaces: ["packages/*", 1] })).toEqual(["packages/*"]);
    expect(
      manifestWorkspacePatterns({ workspaces: { packages: ["apps/*"], nohoist: ["**/x"] } }),
    ).toEqual(["apps/*"]);
    expect(manifestWorkspacePatterns({ workspaces: {} })).toBeUndefined();
    expect(manifestWorkspacePatterns({})).toBeUndefined();
  });

  it("reads lerna packages with Lerna's default", () => {
    expect(lernaPackagePatterns({ packages: ["modules/*"] })).toEqual(["modules/*"]);
    expect(lernaPackagePatterns({ version: "1.0.0" })).toEqual(["packages/*"]);
  });
});

describe("WorkspaceIndex", () => {
  const index = new WorkspaceIndex([
    { directory: "", patterns: ["packages/*", "!packages/legacy"] },
    { directory: "", patterns: ["tools/**"] },
    { directory: "examples/shop", patterns: ["./apps/*/"] },
  ]);

  it("lists workspace roots", () => {
    expect(index.rootDirectories).toEqual(["", "examples/shop"]);
    expect(index.isRoot("")).toBe(true);
    expect(index.isRoot("examples/shop")).toBe(true);
    expect(index.isRoot("packages/a")).toBe(false);
  });

  it("measures how closely a package belongs to the importer's workspace", () => {
    expect(index.affinity("packages/a", "packages/b/src")).toBe(0);
    expect(index.affinity("packages/legacy", "packages/b/src")).toBe(-1);
    expect(index.affinity("tools/x/y", "src")).toBe(0);
    expect(index.affinity("examples/shop/apps/web", "examples/shop/apps/api/src")).toBe(2);
    expect(index.affinity("examples/shop", "examples/shop/apps/api")).toBe(2);
    expect(index.affinity("examples/shop/apps/web", "src")).toBe(-1);
    expect(index.affinity("", "anything")).toBe(0);
    expect(index.affinity("other/pkg", "src")).toBe(-1);
  });
});
