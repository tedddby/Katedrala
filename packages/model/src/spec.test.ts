import fc from "fast-check";
import { EDGE_KINDS, FILE_ROLES, compareStrings } from "@katedrala/ir";
import type { EdgeKind, FileRole } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { ModelError } from "./errors.js";
import {
  DEFAULT_EDGE_KINDS,
  DEFAULT_FILE_ROLES,
  PROJECTION_LEVELS,
  fromProjectionInfo,
  normalizeProjectionSpec,
  projectionKey,
  toProjectionInfo,
} from "./spec.js";
import type { ProjectionLevel, ProjectionSpec } from "./spec.js";

describe("defaults", () => {
  it("lift every known edge kind except manifest declarations, sorted", () => {
    expect(DEFAULT_EDGE_KINDS).not.toContain("depends-on-package");
    expect(DEFAULT_EDGE_KINDS).toHaveLength(EDGE_KINDS.length - 1);
    for (const kind of EDGE_KINDS) {
      if (kind !== "depends-on-package") expect(DEFAULT_EDGE_KINDS).toContain(kind);
    }
    expect(DEFAULT_EDGE_KINDS).toEqual([...DEFAULT_EDGE_KINDS].sort(compareStrings));
    expect(Object.isFrozen(DEFAULT_EDGE_KINDS)).toBe(true);
  });

  it("take production code and declarations", () => {
    expect(DEFAULT_FILE_ROLES).toEqual(["declaration", "source"]);
    expect(Object.isFrozen(DEFAULT_FILE_ROLES)).toBe(true);
  });

  it("list the levels from the finest to the coarsest", () => {
    expect(PROJECTION_LEVELS).toEqual([
      "symbol",
      "file",
      "component",
      "module",
      "layer",
      "package",
    ]);
  });
});

describe("normalizeProjectionSpec", () => {
  it("applies the documented defaults", () => {
    const spec = normalizeProjectionSpec({ level: "file" });
    expect(spec.level).toBe("file");
    expect([...spec.edgeKinds]).toEqual(DEFAULT_EDGE_KINDS);
    expect(spec.includeTypeOnly).toBe(true);
    expect([...spec.fileRoles]).toEqual(["declaration", "source"]);
    expect(spec.includeExternals).toBe(false);
    expect(Object.isFrozen(spec)).toBe(true);
  });

  it("keeps explicit options, sorted and de-duplicated, as private copies", () => {
    const edgeKinds = new Set<EdgeKind>(["uses", "calls", "x-acme-event"]);
    const fileRoles = new Set<FileRole>(["test", "source"]);
    const spec = normalizeProjectionSpec({
      level: "package",
      edgeKinds,
      includeTypeOnly: false,
      fileRoles,
      includeExternals: true,
    });
    expect([...spec.edgeKinds]).toEqual(["calls", "uses", "x-acme-event"]);
    expect([...spec.fileRoles]).toEqual(["source", "test"]);
    expect(spec.includeTypeOnly).toBe(false);
    expect(spec.includeExternals).toBe(true);
    edgeKinds.add("imports");
    fileRoles.clear();
    expect([...spec.edgeKinds]).toEqual(["calls", "uses", "x-acme-event"]);
    expect([...spec.fileRoles]).toEqual(["source", "test"]);
  });

  it("treats explicitly undefined options (from JavaScript callers) as omitted", () => {
    const spec = normalizeProjectionSpec({
      level: "module",
      includeTypeOnly: undefined,
      includeExternals: undefined,
    } as unknown as ProjectionSpec);
    expect(spec.includeTypeOnly).toBe(true);
    expect(spec.includeExternals).toBe(false);
  });

  it("is idempotent", () => {
    const once = normalizeProjectionSpec({ level: "layer", fileRoles: new Set(["test"]) });
    const twice = normalizeProjectionSpec(once);
    expect(projectionKey(twice)).toBe(projectionKey(once));
    expect([...twice.fileRoles]).toEqual(["test"]);
  });

  it("rejects unknown levels with a structured error", () => {
    const attempt = () => normalizeProjectionSpec({ level: "directory" as ProjectionLevel });
    expect(attempt).toThrow(ModelError);
    expect(attempt).toThrow(/Unknown projection level "directory"/);
    try {
      attempt();
    } catch (error) {
      expect(error).toBeInstanceOf(ModelError);
      expect((error as ModelError).code).toBe("invalid-level");
      expect((error as ModelError).name).toBe("ModelError");
    }
  });
});

describe("projectionKey", () => {
  const kinds = fc.subarray([...EDGE_KINDS]);
  const roles = fc.subarray([...FILE_ROLES]);

  it("is equal exactly for equal normalized specifications", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PROJECTION_LEVELS),
        kinds,
        fc.boolean(),
        roles,
        fc.boolean(),
        fc.integer(),
        (level, edgeKinds, includeTypeOnly, fileRoles, includeExternals, seed) => {
          const reversed = seed % 2 === 0;
          const order = <T>(values: T[]): T[] => (reversed ? [...values].reverse() : values);
          const a = normalizeProjectionSpec({
            level,
            edgeKinds: new Set(edgeKinds),
            includeTypeOnly,
            fileRoles: new Set(fileRoles),
            includeExternals,
          });
          const b = normalizeProjectionSpec({
            level,
            edgeKinds: new Set(order([...edgeKinds, ...edgeKinds])),
            includeTypeOnly,
            fileRoles: new Set(order(fileRoles)),
            includeExternals,
          });
          expect(projectionKey(a)).toBe(projectionKey(b));
          const different = normalizeProjectionSpec({ ...a, includeExternals: !includeExternals });
          expect(projectionKey(different)).not.toBe(projectionKey(a));
        },
      ),
    );
  });

  it("distinguishes defaults from explicit empty sets", () => {
    const defaults = normalizeProjectionSpec({ level: "file" });
    const empty = normalizeProjectionSpec({ level: "file", edgeKinds: new Set() });
    expect(projectionKey(defaults)).not.toBe(projectionKey(empty));
    expect(projectionKey(defaults)).toBe(
      projectionKey(
        normalizeProjectionSpec({ level: "file", edgeKinds: new Set(DEFAULT_EDGE_KINDS) }),
      ),
    );
  });
});

describe("IR projection descriptions", () => {
  it("describe the options with sorted lists", () => {
    expect(toProjectionInfo({})).toEqual({
      edgeKinds: [...DEFAULT_EDGE_KINDS],
      includeTypeOnly: true,
      fileRoles: ["declaration", "source"],
    });
    expect(
      toProjectionInfo({
        edgeKinds: new Set(["uses", "calls"]),
        includeTypeOnly: false,
        fileRoles: new Set(["test", "source"]),
        includeExternals: true,
      }),
    ).toEqual({
      edgeKinds: ["calls", "uses"],
      includeTypeOnly: false,
      fileRoles: ["source", "test"],
    });
  });

  it("round-trip through projection options", () => {
    fc.assert(
      fc.property(
        fc.subarray([...EDGE_KINDS]),
        fc.boolean(),
        fc.subarray([...FILE_ROLES]),
        (k, t, r) => {
          const info = toProjectionInfo({
            edgeKinds: new Set(k),
            includeTypeOnly: t,
            fileRoles: new Set(r),
          });
          expect(toProjectionInfo(fromProjectionInfo(info))).toEqual(info);
          const options = fromProjectionInfo(info);
          expect(options.includeExternals).toBeUndefined();
        },
      ),
    );
  });
});
