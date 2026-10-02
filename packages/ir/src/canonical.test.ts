import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ArchitectureDocument, EdgeEntity, FileEntity, FileId } from "./index.js";
import {
  DuplicateIdError,
  canonicalizeDocument,
  roundMetric,
  serializeDocument,
  serializeDocumentChunks,
  sortedUnique,
} from "./canonical.js";
import { emptyDocument } from "./empty.js";
import { directoryId, edgeId, fileId } from "./ids.js";

function file(path: string, overrides: Partial<FileEntity> = {}): FileEntity {
  return {
    id: fileId(path),
    path,
    name: path.split("/").pop() ?? path,
    directory: directoryId(""),
    language: "typescript",
    role: "source",
    size: 10,
    analysis: { status: "parsed" },
    symbols: [],
    imports: [],
    exports: [],
    tags: [],
    ...overrides,
  };
}

function edge(
  kind: EdgeEntity["kind"],
  source: FileId,
  target: FileId,
  lines: number[],
): EdgeEntity {
  return {
    id: edgeId(kind, source, target),
    kind,
    source,
    target,
    observations: lines.length,
    typeOnly: false,
    confidence: 1,
    provenance: lines.map((line) => ({
      file: source,
      line,
      column: 1,
      mechanism: "import-declaration",
      resolution: "relative-path",
      confidence: 1,
    })),
  };
}

function sampleDocument(): ArchitectureDocument {
  const doc = emptyDocument({ repositoryName: "sample" });
  doc.files = [
    file("src/b.ts", {
      tags: ["z", "a", "a"],
      exports: [
        { name: "*", from: "./z", typeOnly: false },
        { name: "zeta", typeOnly: false },
        { name: "*", from: "./a", typeOnly: false },
        { name: "alpha", typeOnly: false },
      ],
    }),
    file("src/a.ts"),
  ];
  doc.edges = [
    edge("imports", fileId("src/b.ts"), fileId("src/a.ts"), [9, 2]),
    edge("calls", fileId("src/a.ts"), fileId("src/b.ts"), [3]),
    edge("imports", fileId("src/a.ts"), fileId("src/b.ts"), [1]),
  ];
  doc.diagnostics = [
    {
      code: "unresolved-import",
      severity: "warning",
      message: "b",
      file: fileId("src/b.ts"),
      line: 2,
    },
    {
      code: "unresolved-import",
      severity: "warning",
      message: "a",
      file: fileId("src/a.ts"),
      line: 5,
    },
  ];
  doc.metrics.units = [
    {
      entity: fileId("src/b.ts"),
      level: "file",
      size: { files: 1, symbols: 0, lines: 1 },
      fanIn: 1,
      fanOut: 1,
      instability: 0.5,
      types: 0,
      abstractTypes: 0,
      abstractness: null,
      distance: null,
      transitiveDependents: 1,
      transitiveDependencies: 1,
      depth: 0,
      betweenness: 0,
      pageRank: 1,
      structuralRole: "core",
      gravity: { score: 0, terms: [] },
      extensions: { "zeta.metric": 1, "alpha.metric": 2 },
    },
  ];
  doc.metrics.system.cycles = {
    module: { groups: 0, unitsInCycles: 0, largestGroup: 0, ratio: 0 },
    file: { groups: 1, unitsInCycles: 2, largestGroup: 2, ratio: 1 },
  };
  return doc;
}

describe("canonicalizeDocument", () => {
  it("sorts entities by id and edges by source, target, kind", () => {
    const doc = canonicalizeDocument(sampleDocument());
    expect(doc.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(doc.edges.map((e) => `${e.source}>${e.target}:${e.kind}`)).toEqual([
      "file:src/a.ts>file:src/b.ts:calls",
      "file:src/a.ts>file:src/b.ts:imports",
      "file:src/b.ts>file:src/a.ts:imports",
    ]);
  });

  it("uses total orders for nested arrays, including ties on the primary key", () => {
    const doc = canonicalizeDocument(sampleDocument());
    const b = doc.files.find((f) => f.path === "src/b.ts");
    expect(b?.tags).toEqual(["a", "z"]);
    expect(b?.exports.map((e) => `${e.name}${e.from ?? ""}`)).toEqual([
      "*./a",
      "*./z",
      "alpha",
      "zeta",
    ]);
    const imports = doc.edges.find((e) => e.source === fileId("src/b.ts"));
    expect(imports?.provenance.map((p) => p.line)).toEqual([2, 9]);
    expect(doc.diagnostics.map((d) => d.message)).toEqual(["a", "b"]);
  });

  it("sorts the keys of record-typed fields", () => {
    const doc = canonicalizeDocument(sampleDocument());
    expect(Object.keys(doc.metrics.units[0]!.extensions!)).toEqual(["alpha.metric", "zeta.metric"]);
    expect(Object.keys(doc.metrics.system.cycles)).toEqual(["file", "module"]);
  });

  it("produces identical bytes regardless of producer order", () => {
    const once = serializeDocument(canonicalizeDocument(sampleDocument()));
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
        const doc = sampleDocument();
        const rotate = <T>(items: T[]): T[] => {
          const k = items.length === 0 ? 0 : seed % items.length;
          return [...items.slice(k), ...items.slice(0, k)];
        };
        doc.files = rotate(doc.files).map((f) => ({
          ...f,
          exports: rotate(f.exports),
          tags: rotate(f.tags),
        }));
        doc.edges = rotate(doc.edges).map((e) => ({ ...e, provenance: rotate(e.provenance) }));
        doc.diagnostics = rotate(doc.diagnostics);
        expect(serializeDocument(canonicalizeDocument(doc))).toBe(once);
      }),
    );
  });

  it("is idempotent and does not mutate its input", () => {
    const input = sampleDocument();
    const before = JSON.stringify(input);
    const once = canonicalizeDocument(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(serializeDocument(canonicalizeDocument(once))).toBe(serializeDocument(once));
  });

  it("rejects duplicate identifiers", () => {
    const doc = sampleDocument();
    doc.files.push(file("src/a.ts"));
    expect(() => canonicalizeDocument(doc)).toThrow(DuplicateIdError);
  });
});

describe("serialization", () => {
  it("omits the run section unless requested", () => {
    const doc = emptyDocument();
    doc.run = {
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      timings: {},
      cache: { enabled: false, hits: 0, misses: 0 },
      workers: 1,
      platform: { node: "v22", os: "linux", arch: "x64" },
    };
    expect(serializeDocument(doc)).not.toContain('"run"');
    expect(serializeDocument(doc, { includeRun: true })).toContain('"run"');
    expect(serializeDocument(doc).endsWith("}\n")).toBe(true);
    expect(serializeDocument(doc, { pretty: false }).split("\n")).toHaveLength(2);
  });

  it("rejects non-finite numbers", () => {
    const doc = emptyDocument();
    doc.metrics.system.density = Number.NaN;
    expect(() => serializeDocument(doc)).toThrow(RangeError);
  });

  it("streams chunks that concatenate to the same text", () => {
    const doc = canonicalizeDocument(sampleDocument());
    for (const pretty of [true, false]) {
      const chunks = [...serializeDocumentChunks(doc, { pretty })];
      expect(chunks.length).toBeGreaterThan(5);
      expect(chunks.join("")).toBe(serializeDocument(doc, { pretty }));
    }
    expect([...serializeDocumentChunks({})].join("")).toBe(serializeDocument({}));
  });
});

describe("roundMetric", () => {
  it("keeps nine significant digits", () => {
    expect(roundMetric(0.1 + 0.2)).toBe(0.3);
    expect(roundMetric(1 / 3)).toBe(0.333333333);
    expect(roundMetric(2 / 3_000_000)).toBe(6.66666667e-7);
    expect(roundMetric(123456.7891234)).toBe(123456.789);
    expect(Object.is(roundMetric(-0), 0)).toBe(true);
    expect(roundMetric(2.5, 1)).toBe(3);
  });

  it("rejects non-finite values", () => {
    expect(() => roundMetric(Number.NaN)).toThrow(RangeError);
    expect(() => roundMetric(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("sortedUnique", () => {
  it("sorts by code units and removes duplicates", () => {
    expect(sortedUnique(["b", "a", "B", "a"])).toEqual(["B", "a", "b"]);
  });
});
