import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import type { ArchitectureDocument, FileEntity } from "./index.js";
import { emptyDocument } from "./empty.js";
import { directoryId, edgeId, fileId, qualifiedNameOf, symbolId } from "./ids.js";
import { IR_SCHEMA_VERSION } from "./version.js";

const KINDS = ["architecture", "impact", "diff", "health", "explain", "validation", "history"];

function loadSchema(name: string): object {
  const url = new URL(`../schema/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as object;
}

function compile(name: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats.default(ajv);
  return ajv.compile(loadSchema(name));
}

const strict = compile("architecture.strict.schema");
const consumer = compile("architecture.schema");

function errors(validate: typeof strict, document: unknown): string[] {
  return validate(document)
    ? []
    : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ""}`);
}

function sampleDocument(): ArchitectureDocument {
  const doc = emptyDocument({ repositoryName: "sample" });
  const a = fileId("src/a.ts");
  const b = fileId("src/b.ts");
  const service = symbolId("src/b.ts", qualifiedNameOf(["Service"]));
  doc.directories = [
    { id: directoryId(""), path: "", name: "sample", directories: [directoryId("src")], files: [] },
    {
      id: directoryId("src"),
      path: "src",
      name: "src",
      parent: directoryId(""),
      directories: [],
      files: [a, b],
    },
  ];
  const base = (id: typeof a): FileEntity => ({
    id,
    path: id.slice(5),
    name: id.slice(9),
    directory: directoryId("src"),
    language: "typescript",
    role: "source",
    size: 42,
    lines: 3,
    hash: `sha256:${"0".repeat(64)}`,
    analysis: { status: "parsed", adapter: "typescript@1.0.0" },
    symbols: [],
    imports: [],
    exports: [],
    tags: [],
  });
  doc.files = [
    {
      ...base(a),
      imports: [
        {
          specifier: "./b",
          kind: "static",
          mechanism: "import-declaration",
          typeOnly: false,
          line: 1,
          column: 1,
          resolution: { status: "resolved", targets: [b], method: "relative-path" },
        },
      ],
    },
    {
      ...base(b),
      symbols: [service],
      exports: [{ name: "Service", symbols: [service], typeOnly: false }],
    },
  ];
  doc.symbols = [
    {
      id: service,
      name: "Service",
      qualifiedName: "Service",
      kind: "class",
      category: "type",
      file: b,
      range: { start: { line: 1, column: 1 }, end: { line: 3, column: 2 } },
      exported: true,
      abstract: false,
      decorators: [{ name: "Injectable", invoked: true, arguments: [] }],
    },
  ];
  doc.edges = [
    {
      id: edgeId("imports", a, b),
      kind: "imports",
      source: a,
      target: b,
      observations: 1,
      typeOnly: false,
      confidence: 1,
      provenance: [
        {
          file: a,
          line: 1,
          column: 1,
          mechanism: "import-declaration",
          resolution: "relative-path",
          confidence: 1,
          specifier: "./b",
        },
      ],
    },
  ];
  return doc;
}

describe("strict architecture schema", () => {
  it("accepts empty and populated documents", () => {
    expect(errors(strict, emptyDocument())).toEqual([]);
    expect(errors(strict, sampleDocument())).toEqual([]);
  });

  it("accepts plugin-reserved enumeration values", () => {
    const doc = sampleDocument();
    doc.edges[0]!.kind = "x-acme-relation";
    doc.edges[0]!.provenance[0]!.mechanism = "x-acme-mechanism";
    doc.symbols[0]!.kind = "x-acme-widget";
    expect(errors(strict, doc)).toEqual([]);
  });

  it("rejects unknown enumeration values, malformed extension values and unknown properties", () => {
    const unknownKind = sampleDocument() as unknown as { edges: Array<{ kind: string }> };
    unknownKind.edges[0]!.kind = "depends";
    expect(errors(strict, unknownKind).length).toBeGreaterThan(0);

    const badExtension = sampleDocument() as unknown as { edges: Array<{ kind: string }> };
    badExtension.edges[0]!.kind = "x-Has Spaces";
    expect(errors(strict, badExtension).length).toBeGreaterThan(0);

    expect(errors(strict, { ...sampleDocument(), extra: true }).length).toBeGreaterThan(0);
  });

  it("enforces identifier patterns, integer positions and bounded confidence", () => {
    const badId = sampleDocument() as unknown as { edges: Array<{ id: string }> };
    badId.edges[0]!.id = "edge:not-a-hash";
    expect(errors(strict, badId).join("\n")).toContain("/edges/0/id");

    const zeroLine = sampleDocument();
    zeroLine.edges[0]!.provenance[0]!.line = 0;
    expect(errors(strict, zeroLine).join("\n")).toContain("/edges/0/provenance/0/line");

    const fractional = sampleDocument();
    fractional.files[0]!.size = 1.5;
    expect(errors(strict, fractional).join("\n")).toContain("/files/0/size");

    const confident = sampleDocument();
    confident.edges[0]!.confidence = 7;
    expect(errors(strict, confident).join("\n")).toContain("/edges/0/confidence");

    const badHash = sampleDocument();
    badHash.files[0]!.hash = "0".repeat(40);
    expect(errors(strict, badHash).join("\n")).toContain("/files/0/hash");
  });

  it("validates exactly the current schema version", () => {
    expect(errors(strict, { ...sampleDocument(), schemaVersion: "1.1.0" }).length).toBeGreaterThan(
      0,
    );
    expect(IR_SCHEMA_VERSION).toBe(sampleDocument().schemaVersion);
  });

  it("compiles every published schema", () => {
    for (const kind of KINDS) {
      expect(() => compile(`${kind}.strict.schema`)).not.toThrow();
      expect(() => compile(`${kind}.schema`)).not.toThrow();
    }
  });
});

describe("consumer architecture schema", () => {
  it("accepts every document the strict schema accepts", () => {
    expect(errors(consumer, emptyDocument())).toEqual([]);
    expect(errors(consumer, sampleDocument())).toEqual([]);
  });

  it("tolerates additions of future minor versions", () => {
    const future = {
      ...sampleDocument(),
      schemaVersion: "1.7.0",
      newSection: [{ anything: true }],
    } as unknown as {
      files: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };
    future.files[0]!.complexity = 12;
    future.files[0]!.role = "fixture";
    future.edges[0]!.kind = "observes";
    const imports = future.files[0]!.imports as Array<{ resolution: unknown }>;
    imports[0]!.resolution = { status: "deferred", reason: "new in 1.7" };
    expect(errors(consumer, future)).toEqual([]);
  });

  it("still rejects other major versions and malformed identifiers", () => {
    expect(
      errors(consumer, { ...sampleDocument(), schemaVersion: "2.0.0" }).length,
    ).toBeGreaterThan(0);
    const badId = sampleDocument() as unknown as { files: Array<{ id: string }> };
    badId.files[0]!.id = "src/a.ts";
    expect(errors(consumer, badId).length).toBeGreaterThan(0);
  });
});
