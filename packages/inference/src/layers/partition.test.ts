import { defaultLimits, fileId } from "@katedrala/ir";
import type { FileId } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { syntheticModel } from "../test-support.js";
import type { DeclaredLayerSpec, FileLabel, LayerVote, VoteSource } from "../types.js";
import { declaredLayers, partitionLayers } from "./partition.js";

/** A vote of `source` for `label`. */
function vote(label: string | null, source: VoteSource, confidence = 0.7): LayerVote {
  return {
    label,
    confidence,
    source,
    producer: source === "detector" ? "custom" : source,
    signal:
      source === "configuration"
        ? "configured-glob"
        : source === "detector"
          ? "detector-role"
          : source === "naming"
            ? "name-qualifier"
            : "directory-name",
  };
}

/** A label map from `path → [label, sources of its votes for it]`. */
function labels(
  entries: Record<string, [label: string | null, sources: readonly VoteSource[]]>,
): Map<FileId, FileLabel> {
  const map = new Map<FileId, FileLabel>();
  for (const [path, [label, sources]] of Object.entries(entries)) {
    map.set(fileId(path), {
      file: fileId(path),
      votes: sources.map((source) => vote(label, source)),
      label,
      score: 0.7,
    });
  }
  return map;
}

const MODEL = syntheticModel({
  files: [
    "src/controllers/a.controller.ts",
    "src/controllers/b.controller.ts",
    "src/routes/index.ts",
    "src/services/a.ts",
    "src/stray/x.controller.ts",
    "src/stray/y.service.ts",
    "src/stray/z.repository.ts",
    "src/stray/w.repository.ts",
    "src/models/m.ts",
    { path: "src/controllers/a.controller.test.ts", role: "test" },
  ],
});

describe("partitionLayers (§4.3, plan 4.5)", () => {
  it("groups source files by label and keeps a label with enough members or a placed member", () => {
    const partition = partitionLayers(
      MODEL,
      labels({
        "src/controllers/b.controller.ts": ["controller", ["naming", "location"]],
        "src/controllers/a.controller.ts": ["controller", ["naming"]],
        // One member, placed by its directory: a deliberate `routes/` directory is a layer.
        "src/routes/index.ts": ["route", ["location"]],
        // One member, placed by configuration or a detector.
        "src/services/a.ts": ["service", ["configuration"]],
        "src/models/m.ts": ["model", ["detector"]],
        // One stray naming-only member is pruned.
        "src/stray/z.repository.ts": ["repository", ["naming"]],
        "src/stray/x.controller.ts": [null, ["naming"]],
        // Tests never form layers, whatever the label map says (D-17).
        "src/controllers/a.controller.test.ts": ["test-layer", ["location"]],
      }),
      2,
    );
    expect(partition.layers).toEqual(["controller", "model", "route", "service"]);
    expect(partition.members).toEqual([
      ["file:src/controllers/a.controller.ts", "file:src/controllers/b.controller.ts"],
      ["file:src/models/m.ts"],
      ["file:src/routes/index.ts"],
      ["file:src/services/a.ts"],
    ]);
  });

  it("keeps a naming-only label with at least min_layer_files members", () => {
    const entries = labels({
      "src/stray/z.repository.ts": ["repository", ["naming"]],
      "src/stray/w.repository.ts": ["repository", ["naming"]],
      "src/routes/index.ts": ["route", ["location"]],
    });
    expect(partitionLayers(MODEL, entries, 2).layers).toEqual(["repository", "route"]);
    expect(partitionLayers(MODEL, entries, 3).layers).toEqual([]);
  });

  it("gives no layers with fewer than two kept labels (§4.7)", () => {
    const one = labels({
      "src/controllers/a.controller.ts": ["controller", ["location"]],
      "src/stray/y.service.ts": ["service", ["naming"]],
    });
    expect(partitionLayers(MODEL, one, 2)).toEqual({ layers: [], members: [] });
    expect(partitionLayers(MODEL, new Map(), 2)).toEqual({ layers: [], members: [] });
  });

  it("counts only votes for the file's own label as placing it", () => {
    const entries = new Map<FileId, FileLabel>([
      [
        fileId("src/stray/y.service.ts"),
        {
          file: fileId("src/stray/y.service.ts"),
          // The location vote names another layer; only naming supports `service`.
          votes: [vote("service", "naming", 0.8), vote("controller", "location")],
          label: "service",
          score: 0.8,
        },
      ],
      ...labels({ "src/routes/index.ts": ["route", ["location"]] }),
      ...labels({ "src/models/m.ts": ["model", ["location"]] }),
    ]);
    expect(partitionLayers(MODEL, entries, 2).layers).toEqual(["model", "route"]);
  });
});

describe("declaredLayers (§4.4, D-24, D-50, D-71)", () => {
  const model = syntheticModel({
    files: [
      "src/api/a.ts",
      "src/api/b.ts",
      "src/api/c.ts",
      "src/core/d.ts",
      { path: "src/api/a.test.ts", role: "test" },
      { path: "src/api/types.d.ts", role: "declaration" },
      { path: "docs/readme.md", role: "documentation" },
    ],
  });
  const files = (...paths: string[]): FileId[] => paths.map((path) => fileId(path));
  const spec = (name: string, rank: number, paths: readonly string[]): DeclaredLayerSpec => ({
    name,
    rank,
    files: files(...paths),
  });

  it("takes the source files of each layer's matches, the first layer in list order keeping overlaps", () => {
    const result = declaredLayers(
      model,
      [
        spec("presentation", 0, ["src/api/b.ts", "src/api/a.ts", "src/api/a.test.ts"]),
        spec("application", 1, [
          "src/api/a.ts",
          "src/api/b.ts",
          "src/api/c.ts",
          "src/api/types.d.ts",
        ]),
        spec("domain", 2, ["src/core/d.ts", "src/api/c.ts"]),
      ],
      defaultLimits(),
      fileId("katedrala.config.yaml"),
    );
    expect(result.layers).toEqual([
      {
        id: "layer:presentation",
        name: "presentation",
        origin: "declared",
        rank: 0,
        files: ["file:src/api/a.ts", "file:src/api/b.ts"],
      },
      {
        id: "layer:application",
        name: "application",
        origin: "declared",
        rank: 1,
        files: ["file:src/api/c.ts"],
      },
      {
        id: "layer:domain",
        name: "domain",
        origin: "declared",
        rank: 2,
        files: ["file:src/core/d.ts"],
      },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: "configuration-warning",
        severity: "warning",
        message:
          'Files match several declared layers: 2 files match both "presentation" and "application", and ' +
          'the first in list order ("presentation") keeps them: src/api/a.ts and src/api/b.ts',
        file: "file:katedrala.config.yaml",
      },
      {
        code: "configuration-warning",
        severity: "warning",
        message:
          'Files match several declared layers: 1 file matches both "application" and "domain", and the ' +
          'first in list order ("application") keeps it: src/api/c.ts',
        file: "file:katedrala.config.yaml",
      },
    ]);
  });

  it("keeps layers without a source file, with a warning (D-71)", () => {
    const result = declaredLayers(
      model,
      [
        spec("web", 0, []),
        spec("tests", 1, ["src/api/a.test.ts", "src/api/types.d.ts", "docs/readme.md"]),
        spec("core", 2, ["src/core/d.ts"]),
      ],
      defaultLimits(),
    );
    expect(result.layers.map((layer) => [layer.name, layer.files])).toEqual([
      ["web", []],
      ["tests", []],
      ["core", ["file:src/core/d.ts"]],
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: "configuration-warning",
        severity: "warning",
        message: 'Declared layer "web" matches no file; it is kept without member files',
      },
      {
        code: "configuration-warning",
        severity: "warning",
        message:
          'Declared layer "tests" matches 3 files, none of them a source file (layers contain source files ' +
          "only); it is kept without member files",
      },
    ]);
  });

  it("takes ranks from the configuration, ties allowed, and sorts by rank then id", () => {
    const result = declaredLayers(
      model,
      [spec("ui", 0, ["src/api/a.ts"]), spec("cli", 0, ["src/api/b.ts"]), spec("core", 3, [])],
      defaultLimits(),
    );
    expect(result.layers.map((layer) => `${layer.rank} ${layer.id}`)).toEqual([
      "0 layer:cli",
      "0 layer:ui",
      "3 layer:core",
    ]);
    for (const layer of result.layers) expect(layer).not.toHaveProperty("inference");
  });

  it("bounds the example paths of an overlap by limits.maxEvidenceEntities", () => {
    const overlapping = ["src/api/a.ts", "src/api/b.ts", "src/api/c.ts"];
    const layers = [spec("outer", 0, overlapping), spec("inner", 1, overlapping)];
    const message = (maxEvidenceEntities: number): string | undefined =>
      declaredLayers(model, layers, { ...defaultLimits(), maxEvidenceEntities }).diagnostics[0]
        ?.message;
    expect(message(1)).toBe(
      'Files match several declared layers: 3 files match both "outer" and "inner", and the first in list ' +
        'order ("outer") keeps them: src/api/a.ts and 2 more',
    );
    expect(message(0)).toBe(
      'Files match several declared layers: 3 files match both "outer" and "inner", and the first in list ' +
        'order ("outer") keeps them',
    );
  });

  it("rejects two declared layers with the same name", () => {
    expect(() =>
      declaredLayers(model, [spec("a", 0, []), spec("a", 1, [])], defaultLimits()),
    ).toThrow(RangeError);
  });
});
