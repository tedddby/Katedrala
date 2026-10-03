import fc from "fast-check";
import { canonicalizeDocument, emptyDocument } from "@katedrala/ir";
import type { ArchitectureDocument } from "@katedrala/ir";
import type { NameCandidate, ReferenceKind, ReferenceTarget } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import type { LinkFile, LinkProject, LinkResult } from "./types.js";
import {
  ADAPTER,
  exportFrom,
  exportLocal,
  exportStar,
  extraction,
  fact,
  fakeProject,
  file,
  imp,
  instance,
  member,
  ref,
  reexportImport,
  run,
  sym,
  typeRef,
  use,
} from "./test-support.js";

/** A repository exercising most linker features at once. */
function richRepository(): { files: LinkFile[]; projects: LinkProject[] } {
  const files = [
    file("package.json"),
    file("packages/core/package.json"),
    file("packages/app/package.json"),
    file(
      "packages/core/src/repo.ts",
      extraction({
        symbols: [
          sym("Repository", "class"),
          member("Repository", "getOrThrow", "method"),
          sym("OrderRepository", "class"),
          member("OrderRepository", "save", "method"),
          member("OrderRepository", "find", "method", {
            returnType: typeRef(ref.symbol("Repository")),
          }),
        ],
        exports: [
          exportLocal("Repository", ref.symbol("Repository")),
          exportLocal("OrderRepository", ref.symbol("OrderRepository")),
        ],
        references: [use("extends", ref.symbol("Repository"), { from: "OrderRepository" })],
      }),
    ),
    file(
      "packages/core/src/tax.ts",
      extraction({
        symbols: [sym("Tax", "namespace"), member("Tax", "rateFor", "function")],
        exports: [exportLocal("Tax", ref.symbol("Tax"))],
      }),
    ),
    file(
      "packages/core/src/index.ts",
      extraction({
        imports: [reexportImport("./repo", { mechanism: "export-all" }), reexportImport("./tax")],
        exports: [exportStar("./repo"), exportFrom("tax", "./tax", "*")],
      }),
    ),
    file(
      "packages/app/src/service.ts",
      extraction({
        imports: [
          imp("@acme/core", ["OrderRepository", "tax"]),
          imp("lodash", ["chunk"]),
          imp("node:fs", [["fs", "*"]]),
        ],
        symbols: [
          sym("OrderService", "class"),
          member("OrderService", "repo", "property", {
            declaredType: typeRef(ref.import("OrderRepository")),
          }),
          member("OrderService", "place", "method"),
        ],
        exports: [exportLocal("OrderService", ref.symbol("OrderService"))],
        references: [
          use("call", ref.symbol("OrderService.repo", "save"), {
            from: "OrderService.place",
            line: 4,
          }),
          use("call", ref.symbol("OrderService.repo", "getOrThrow"), {
            from: "OrderService.place",
            line: 5,
          }),
          use(
            "call",
            instance("call-result", ref.symbol("OrderService.repo", "find"), "getOrThrow"),
            {
              from: "OrderService.place",
              line: 6,
            },
          ),
          use("call", ref.import("tax", "Tax", "rateFor"), { from: "OrderService.place", line: 7 }),
          use("call", ref.import("chunk"), { from: "OrderService.place", line: 8 }),
          use("call", ref.import("fs", "readFileSync"), { line: 9 }),
          use("call", ref.name("ambient"), { line: 10 }),
          use("type", ref.import("OrderRepository"), { from: "OrderService.repo", typeOnly: true }),
        ],
        facts: [
          fact("environment-read", { name: "PORT" }, { from: "OrderService.place" }),
          fact("http-request", {
            host: "api.example.com",
            url: "https://api.example.com/x",
            method: "GET",
          }),
          fact("entry-point", { kind: "main" }),
        ],
      }),
    ),
    file(
      "packages/app/src/broken.ts",
      extraction({ syntaxErrors: [{ message: "Bad.", line: 3, column: 2 }] }),
    ),
    file(
      "types/ambient.d.ts",
      extraction({
        moduleFormat: "script",
        globals: ["ambient"],
        symbols: [sym("ambient", "function")],
      }),
    ),
    file("README.md", undefined, { language: "markdown" }),
  ];
  const project = fakeProject({
    files: files.map((entry) => entry.path),
    modules: {
      "@acme/core": {
        status: "resolved",
        paths: ["packages/core/src/index.ts"],
        method: "workspace-package",
      },
    },
    packages: [
      {
        name: "acme",
        ecosystem: "npm",
        path: "",
        manifest: "package.json",
        workspaceRoot: true,
        dependencies: [{ name: "lodash", versionRange: "^4", scope: "production" }],
      },
      {
        name: "@acme/core",
        ecosystem: "npm",
        path: "packages/core",
        manifest: "packages/core/package.json",
        dependencies: [],
      },
      {
        name: "@acme/app",
        ecosystem: "npm",
        path: "packages/app",
        manifest: "packages/app/package.json",
        dependencies: [{ name: "@acme/core", versionRange: "workspace:*", scope: "production" }],
      },
    ],
    entryPoints: [
      {
        path: "packages/core/src/index.ts",
        kind: "main",
        source: "package.json#main",
        packagePath: "packages/core",
        mappedFrom: "dist/index.js",
      },
    ],
  });
  const other = fakeProject({
    link: () => ({ lookup: (): NameCandidate[] => [] }),
  });
  return {
    files,
    projects: [
      { adapterId: ADAPTER, project },
      { adapterId: "other", project: other },
    ],
  };
}

function documentOf(result: LinkResult): ArchitectureDocument {
  return {
    ...emptyDocument({ repositoryName: "repo" }),
    directories: result.directories,
    packages: result.packages,
    files: result.files,
    symbols: result.symbols,
    externals: result.externals,
    edges: result.edges,
    entryPoints: result.entryPoints,
    diagnostics: result.diagnostics,
  };
}

/** Structural invariants every link result satisfies. */
function checkInvariants(result: LinkResult): void {
  const nodes = new Set<string>([
    ...result.files.map((entry) => entry.id),
    ...result.symbols.map((entry) => entry.id),
    ...result.externals.map((entry) => entry.id),
    ...result.packages.map((entry) => entry.id),
  ]);
  for (const edge of result.edges) {
    expect(nodes.has(edge.source), edge.source).toBe(true);
    expect(nodes.has(edge.target), edge.target).toBe(true);
    expect(edge.source).not.toBe(edge.target);
    expect(edge.provenance.length).toBeLessThanOrEqual(edge.observations);
    expect(edge.confidence).toBeGreaterThan(0);
    expect(edge.confidence).toBeLessThanOrEqual(1);
  }
  for (const entry of result.files) {
    for (const item of entry.imports) {
      if (item.resolution.status === "resolved") {
        for (const target of item.resolution.targets) expect(nodes.has(target)).toBe(true);
      }
    }
    for (const exported of entry.exports) {
      for (const symbol of exported.symbols ?? []) expect(nodes.has(symbol)).toBe(true);
    }
  }
  const document = documentOf(result);
  expect(canonicalizeDocument(document)).toEqual(document);
  expect(result.stats.edges).toBe(result.edges.length);
  expect(result.stats.symbols).toBe(result.symbols.length);
  expect(result.stats.externals).toBe(result.externals.length);
}

describe("determinism", () => {
  it("produces identical results for shuffled files and projects", async () => {
    const { files, projects } = richRepository();
    const baseline = await run(files, { projects });
    checkInvariants(baseline);
    expect(baseline.edges.length).toBeGreaterThan(10);
    const serialized = JSON.stringify(baseline);
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(files, { minLength: files.length, maxLength: files.length }),
        fc.shuffledSubarray(projects, { minLength: projects.length, maxLength: projects.length }),
        async (shuffledFiles, shuffledProjects) => {
          const result = await run(shuffledFiles, { projects: shuffledProjects });
          expect(JSON.stringify(result)).toBe(serialized);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("binds the rich repository as expected", async () => {
    const { files, projects } = richRepository();
    const result = await run(files, { projects });
    const place = "sym:packages/app/src/service.ts#OrderService.place";
    const fromPlace = result.edges
      .filter((edge) => edge.source === place)
      .map(
        (edge) =>
          `${edge.kind} ${edge.target} ${edge.provenance.map((item) => item.resolution).join(",")}`,
      );
    expect(fromPlace).toEqual([
      "reads-configuration ext:env:PORT global-scope",
      "calls ext:npm:lodash import-binding",
      "calls sym:packages/core/src/repo.ts#OrderRepository.save declared-type",
      "calls sym:packages/core/src/repo.ts#Repository.getOrThrow inherited-member,return-type",
      "calls sym:packages/core/src/tax.ts#Tax.rateFor re-export-chain",
    ]);
    expect(result.externals.find((external) => external.id === "ext:npm:lodash")?.declared).toBe(
      true,
    );
  });
});

// ─── Random module graphs ────────────────────────────────────────────────────

const NAMES = ["a", "b", "c", "x"] as const;
const IMPORTED = [...NAMES, "*", "default", "="] as const;
const KINDS: readonly ReferenceKind[] = ["call", "new", "type", "value", "extends"];

interface FileSpec {
  declared: string[];
  stars: number[];
  named: Array<[name: string, target: number, imported: string]>;
  imports: Array<[target: number, imported: string]>;
  references: Array<[pick: number, members: string[], kind: ReferenceKind]>;
  defaultExport: boolean;
}

function fileSpec(size: number): fc.Arbitrary<FileSpec> {
  const target = fc.nat({ max: size - 1 });
  return fc.record({
    declared: fc.subarray(["a", "b", "c"]),
    stars: fc.array(target, { maxLength: 2 }),
    named: fc.array(
      fc.tuple(fc.constantFrom(...NAMES, "ns"), target, fc.constantFrom(...IMPORTED)),
      {
        maxLength: 2,
      },
    ),
    imports: fc.array(fc.tuple(target, fc.constantFrom(...IMPORTED)), { maxLength: 3 }),
    references: fc.array(
      fc.tuple(
        fc.nat({ max: 7 }),
        fc.array(fc.constantFrom(...NAMES), { maxLength: 2 }),
        fc.constantFrom(...KINDS),
      ),
      { maxLength: 4 },
    ),
    defaultExport: fc.boolean(),
  });
}

const repository = fc
  .integer({ min: 1, max: 6 })
  .chain((size) => fc.array(fileSpec(size), { minLength: size, maxLength: size }));

function build(specs: readonly FileSpec[]): LinkFile[] {
  return specs.map((spec, index) => {
    const symbols = spec.declared.flatMap((name) => [
      sym(name, "class"),
      member(name, "x", "method"),
    ]);
    const exports = [
      ...spec.declared.map((name) => exportLocal(name, ref.symbol(name))),
      ...(spec.defaultExport && spec.declared[0] !== undefined
        ? [exportLocal("default", ref.symbol(spec.declared[0]))]
        : []),
      ...spec.stars.map((target) => exportStar(`./m${target}`)),
      ...spec.named.map(([name, target, imported]) => exportFrom(name, `./m${target}`, imported)),
    ];
    const imports = [
      ...spec.stars.map((target) => reexportImport(`./m${target}`, { mechanism: "export-all" })),
      ...spec.named.map(([, target]) => reexportImport(`./m${target}`)),
      ...spec.imports.map(([target, imported], position) =>
        imp(`./m${target}`, [[`i${position}`, imported]]),
      ),
    ];
    const roots: ReferenceTarget[] = [
      ...spec.imports.map((_, position) => ref.import(`i${position}`)),
      ...spec.declared.map((name) => ref.symbol(name)),
    ];
    const references =
      roots.length === 0
        ? []
        : spec.references.map(([pick, members, kind], position) => {
            const root = roots[pick % roots.length] as ReferenceTarget & { members: string[] };
            const target: ReferenceTarget =
              position % 3 === 2
                ? instance("declared-type", root, ...members)
                : { ...root, members: [...root.members, ...members] };
            return use(kind, target, {
              line: position + 1,
              ...(spec.declared[0] === undefined ? {} : { from: spec.declared[0] }),
            });
          });
    return file(`m${index}.ts`, extraction({ symbols, exports, imports, references }));
  });
}

describe("random module graphs", () => {
  it("terminate, satisfy the structural invariants and ignore input order", async () => {
    await fc.assert(
      fc.asyncProperty(
        repository,
        fc.array(fc.nat(), { minLength: 6, maxLength: 6 }),
        async (specs, keys) => {
          const files = build(specs);
          const result = await run(files);
          checkInvariants(result);
          const order = files.map((entry, index) => ({ entry, key: keys[index] ?? 0 }));
          order.sort((a, b) => a.key - b.key);
          const shuffled = await run(order.map((item) => item.entry));
          expect(shuffled).toEqual(result);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("handles strongly connected star-export graphs without blowing up", async () => {
    const size = 12;
    const files = Array.from({ length: size }, (_, index) =>
      file(
        `m${index}.ts`,
        extraction({
          imports: Array.from({ length: size }, (_, target) => reexportImport(`./m${target}`)),
          exports: Array.from({ length: size }, (_, target) => exportStar(`./m${target}`)),
        }),
      ),
    );
    files.push(
      file(
        "leaf.ts",
        extraction({
          symbols: [sym("found", "function")],
          exports: [exportLocal("found", ref.symbol("found"))],
        }),
      ),
      file(
        "user.ts",
        extraction({
          symbols: [sym("main", "function")],
          imports: Array.from({ length: size }, (_, index) =>
            imp(`./m${index}`, [
              [`f${index}`, "found"],
              [`g${index}`, "ghost"],
            ]),
          ),
          references: Array.from({ length: size }, (_, index) => [
            use("call", ref.import(`f${index}`), { from: "main", line: index + 1 }),
            use("call", ref.import(`g${index}`), { from: "main", line: index + 1 }),
          ]).flat(),
        }),
      ),
    );
    // Only m0 reaches the leaf; every barrel reaches m0 through the cycle.
    const first = files[0];
    if (first?.extraction !== undefined) {
      first.extraction.imports.push(reexportImport("./leaf"));
      first.extraction.exports.push(exportStar("./leaf"));
    }
    const started = performance.now();
    const result = await run(files);
    expect(performance.now() - started).toBeLessThan(5_000);
    const edge = result.edges.find(
      (item) => item.kind === "calls" && item.target === "sym:leaf.ts#found",
    );
    expect(edge?.observations).toBe(size);
    expect(result.stats.unresolvedReferences).toBe(size);
  });
});
