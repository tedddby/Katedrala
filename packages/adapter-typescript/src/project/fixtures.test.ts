/**
 * Integration: every fixture repository with an `expected.json` is loaded into an in-memory project
 * context, the module specifiers of its code files are extracted with the TypeScript parser, and their
 * resolutions are compared with the fixture's ground truth (`imports`, `externals`, `unresolved`, plus
 * the resolution-related `expectations` keys some fixtures define).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareStrings } from "@katedrala/ir";
import type { EdgeMechanism, ImportKind } from "@katedrala/ir";
import type { AdapterProject, ModuleResolution } from "@katedrala/plugin-api";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS } from "../options.js";
import { createTypeScriptProject } from "./index.js";
import { createMemoryProjectContext } from "./memory-context.js";

const FIXTURES = fileURLToPath(new URL("../../../../fixtures/", import.meta.url));
const CODE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

interface FixtureExpectation {
  imports: Array<[from: string, to: string, kind: string]>;
  externals: string[];
  unresolved: Array<[from: string, specifier: string]>;
  expectations: Record<string, unknown>;
}

/** Every file of a fixture except its own README.md and expected.json, by POSIX path. */
function fixtureFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory).sort(compareStrings)) {
      const absolute = join(directory, name);
      const path = prefix === "" ? name : `${prefix}/${name}`;
      if (statSync(absolute).isDirectory()) {
        walk(absolute, path);
      } else if (!(prefix === "" && (name === "README.md" || name === "expected.json"))) {
        const text = readFileSync(absolute, "utf8");
        const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
        files[path] = withoutBom.replace(/\r\n?/g, "\n");
      }
    }
  };
  walk(root, "");
  return files;
}

interface ScannedRequest {
  from: string;
  specifier: string;
  kind: ImportKind;
  mechanism: EdgeMechanism;
}

function scriptKindOf(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[mc]?js$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** Literal module specifiers of one file: imports, re-exports, import-equals, require, import(), import types. */
function scanFile(from: string, text: string): ScannedRequest[] {
  const sourceFile = ts.createSourceFile(
    from,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(from),
  );
  const requests: ScannedRequest[] = [];
  const add = (specifier: string, kind: ImportKind, mechanism: EdgeMechanism): void => {
    requests.push({ from, specifier, kind, mechanism });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      add(
        node.moduleSpecifier.text,
        node.importClause === undefined ? "side-effect" : "static",
        "import-declaration",
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(
        node.moduleSpecifier.text,
        "re-export",
        node.exportClause === undefined ? "export-all" : "export-from",
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      add(node.moduleReference.expression.text, "static", "import-equals");
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteralLike(argument)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword)
          add(argument.text, "dynamic", "dynamic-import");
        if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
          add(argument.text, "static", "require-call");
        }
      }
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      add(node.argument.literal.text, "static", "type-import");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  for (const reference of sourceFile.referencedFiles)
    add(reference.fileName, "include", "triple-slash-reference");
  for (const reference of sourceFile.typeReferenceDirectives) {
    add(reference.fileName, "include", "triple-slash-reference");
  }
  return requests;
}

function scanImports(files: Readonly<Record<string, string>>): ScannedRequest[] {
  return Object.entries(files)
    .filter(([path]) => CODE_FILE.test(path))
    .flatMap(([path, text]) => scanFile(path, text));
}

interface Observed {
  pairs: string[];
  externals: string[];
  unresolved: string[];
  resolutions: Map<string, ModuleResolution>;
}

function observe(project: AdapterProject, requests: readonly ScannedRequest[]): Observed {
  const pairs = new Set<string>();
  const externals = new Set<string>();
  const unresolved = new Set<string>();
  const resolutions = new Map<string, ModuleResolution>();
  for (const request of requests) {
    const resolution = project.resolve({
      specifier: request.specifier,
      fromFile: request.from,
      kind: request.kind,
      mechanism: request.mechanism,
    });
    resolutions.set(`${request.from} ? ${request.specifier}`, resolution);
    switch (resolution.status) {
      case "resolved":
        for (const path of resolution.paths) pairs.add(`${request.from} -> ${path}`);
        break;
      case "external":
        externals.add(resolution.packageName);
        break;
      case "builtin":
        externals.add(`node:${resolution.moduleName}`);
        break;
      case "unresolved":
        unresolved.add(`${request.from} ? ${request.specifier}`);
        break;
    }
  }
  const sorted = (values: Set<string>): string[] => [...values].sort(compareStrings);
  return {
    pairs: sorted(pairs),
    externals: sorted(externals),
    unresolved: sorted(unresolved),
    resolutions,
  };
}

const fixtureNames = readdirSync(FIXTURES)
  .filter((name) => existsSync(join(FIXTURES, name, "expected.json")))
  .sort(compareStrings);

async function loadFixture(name: string): Promise<{
  expected: FixtureExpectation;
  files: Record<string, string>;
  project: AdapterProject;
}> {
  const root = join(FIXTURES, name);
  const expected = JSON.parse(
    readFileSync(join(root, "expected.json"), "utf8"),
  ) as FixtureExpectation;
  const files = fixtureFiles(root);
  const { context } = createMemoryProjectContext(files);
  const project = await createTypeScriptProject(context, DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
  return { expected, files, project };
}

describe("fixture repositories", () => {
  it("finds the fixtures with ground truth", () => {
    expect(fixtureNames).toEqual(
      expect.arrayContaining(["javascript-commonjs", "monorepo", "typescript-features"]),
    );
  });

  it.each(fixtureNames)(
    "%s: resolves imports, externals and unresolved imports as expected",
    async (name) => {
      const { expected, files, project } = await loadFixture(name);
      const requests = scanImports(files);
      const observed = observe(project, requests);

      const expectedPairs = [
        ...new Set(expected.imports.map(([from, to]) => `${from} -> ${to}`)),
      ].sort(compareStrings);
      expect(observed.pairs).toEqual(expectedPairs);
      expect(observed.externals).toEqual([...expected.externals].sort(compareStrings));
      // Non-literal specifiers (e.g. `require(pluginPath)`) are invisible to the scan; compare the rest.
      const scanned = new Set(requests.map((request) => `${request.from} ? ${request.specifier}`));
      const expectedUnresolved = expected.unresolved
        .map(([from, specifier]) => `${from} ? ${specifier}`)
        .filter((entry) => scanned.has(entry))
        .sort(compareStrings);
      expect(observed.unresolved).toEqual(expectedUnresolved);

      const methods = expected.expectations.resolutionMethods as
        Array<[string, string, string]> | undefined;
      for (const [from, specifier, method] of methods ?? []) {
        const resolution = observed.resolutions.get(`${from} ? ${specifier}`);
        expect(resolution, `${from} ? ${specifier}`).toMatchObject({ status: "resolved", method });
      }
    },
  );

  it("monorepo: workspace packages, root and manifest entry points", async () => {
    const { expected, project } = await loadFixture("monorepo");
    const expectations = expected.expectations as {
      packages: string[];
      rootPackage: string;
      packageEntryPoints: Record<string, string[]>;
    };
    const root = project.packages.find((pkg) => pkg.path === "");
    expect(root).toMatchObject({
      name: expectations.rootPackage,
      workspaceRoot: true,
      private: true,
    });
    expect(
      project.packages
        .filter((pkg) => pkg.path !== "")
        .map((pkg) => pkg.name ?? "")
        .sort(compareStrings),
    ).toEqual(expectations.packages);
    // The fixture lists the manifest-declared entry points (main/module/types/exports/bin); scripts are
    // entry points too (`tsx watch src/server.ts` in @acme/api) but are not part of that expectation.
    for (const [name, entryFiles] of Object.entries(expectations.packageEntryPoints)) {
      const pkg = project.packages.find((candidate) => candidate.name === name);
      const files = new Set(
        project.entryPoints
          .filter((entry) => entry.packagePath === pkg?.path && entry.kind !== "script")
          .map((entry) => entry.path),
      );
      expect([...files].sort(compareStrings), name).toEqual(entryFiles);
    }
  });

  it.each(["javascript-commonjs", "typescript-features"])("%s: entry points", async (name) => {
    const { expected, project } = await loadFixture(name);
    const files = new Set(project.entryPoints.map((entry) => entry.path));
    expect([...files].sort(compareStrings)).toEqual(expected.expectations.entryPoints);
  });

  it.each(["express-app", "fastify-app", "nestjs-app"])(
    "%s: main entry point mapped from dist",
    async (name) => {
      const { expected, project } = await loadFixture(name);
      const main = project.entryPoints
        .filter((entry) => entry.kind === "main")
        .map((entry) => [entry.path, entry.mappedFrom]);
      expect(main).toEqual(expected.expectations.manifestMain);
    },
  );
});
