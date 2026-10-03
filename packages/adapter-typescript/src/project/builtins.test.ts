import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  NODE_BUILTIN_MODULES,
  NODE_BUILTIN_SUBPATHS,
  NODE_PREFIX_ONLY_BUILTIN_MODULES,
  nodeBuiltinOf,
} from "./builtins.js";

describe("nodeBuiltinOf", () => {
  it.each([
    ["fs", "fs"],
    ["node:fs", "fs"],
    ["fs/promises", "fs"],
    ["node:fs/promises", "fs"],
    ["path/posix", "path"],
    ["stream/web", "stream"],
    ["util/types", "util"],
    ["child_process", "child_process"],
    ["node:test", "test"],
    ["node:test/reporters", "test"],
    ["node:sqlite", "sqlite"],
    ["node:sea", "sea"],
    ["node:anything-else", "anything-else"],
    ["console", "console"],
  ])("%s is the built-in %s", (specifier, name) => {
    expect(nodeBuiltinOf(specifier)).toBe(name);
  });

  it.each([
    "lodash",
    "fsevents",
    "events-emitter",
    "@types/node",
    "./fs",
    "node:",
    "punycode/",
    "pathe",
    // Regression: only the subpaths Node.js exposes are built-ins; others are npm package files.
    "process/browser",
    "util/util.js",
    "events/bus",
    "constants/routes",
    "domain/user",
    "fs/bogus",
    "fs/",
  ])("%s is not a built-in", (specifier) => {
    expect(nodeBuiltinOf(specifier)).toBeUndefined();
  });

  it("treats node:-only built-ins as packages without the prefix (as Node.js does)", () => {
    for (const name of NODE_PREFIX_ONLY_BUILTIN_MODULES) {
      expect(nodeBuiltinOf(name)).toBeUndefined();
      expect(nodeBuiltinOf(`node:${name}`)).toBe(name);
    }
  });

  it("covers the documented names with and without prefix; bare subpaths only when Node.js has them", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NODE_BUILTIN_MODULES),
        fc.stringMatching(/^[a-z]{1,6}$/),
        (name, sub) => {
          expect(nodeBuiltinOf(name)).toBe(name);
          expect(nodeBuiltinOf(`node:${name}`)).toBe(name);
          expect(nodeBuiltinOf(`node:${name}/${sub}`)).toBe(name);
          const subpath = `${name}/${sub}`;
          expect(nodeBuiltinOf(subpath)).toBe(
            NODE_BUILTIN_SUBPATHS.includes(subpath) ? name : undefined,
          );
        },
      ),
    );
    for (const subpath of NODE_BUILTIN_SUBPATHS) {
      const name = subpath.slice(0, subpath.indexOf("/"));
      expect(NODE_BUILTIN_MODULES).toContain(name);
      expect(nodeBuiltinOf(subpath)).toBe(name);
    }
  });
});
