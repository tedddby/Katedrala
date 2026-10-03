/**
 * Robustness: extraction of every TypeScript/JavaScript file of the fixture repositories (and of the
 * CodeVerse sources when present on this machine) never throws, satisfies the structural invariants of the
 * contract and is deterministic. Generated programs check that naming does not depend on source order.
 * Very long expressions (generated code) are extracted in time and stack space independent of their depth,
 * and files TypeScript cannot bind are extracted without scopes and marked incomplete.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArgumentSummary, FileExtraction, ReferenceTarget } from "@katedrala/plugin-api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectTypeScriptLanguage } from "../languages.js";
import { resolveTypeScriptAdapterOptions } from "../options.js";
import { extractTypeScriptFile, parseTypeScriptFile, type ParsedTypeScriptFile } from "./index.js";

const FIXTURES = fileURLToPath(new URL("../../../../fixtures/", import.meta.url));
const CODEVERSE = "C:/Users/Awab/Desktop/PROJECTS/CodeVerse/src";
const SWEPT = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;

function parse(path: string, text: string): ParsedTypeScriptFile {
  const detection = detectTypeScriptLanguage(path);
  if (detection === undefined) throw new Error(`unsupported path ${path}`);
  return parseTypeScriptFile({ path, text, ...detection });
}

function extract(path: string, text: string): FileExtraction {
  return extractTypeScriptFile(parse(path, text), resolveTypeScriptAdapterOptions(undefined));
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (SWEPT.test(entry)) files.push(full);
    }
  };
  visit(root);
  return files;
}

/** Every position in an extraction, for the 1-based check. */
function positions(extraction: FileExtraction): Array<{ line: number; column: number }> {
  const result: Array<{ line: number; column: number }> = [];
  const target = (value: ReferenceTarget): void => {
    if (value.type === "local") result.push(value.declaredAt);
    if (value.type === "instance") {
      target(value.of);
      if (value.receiver !== undefined) target(value.receiver);
    }
  };
  const summary = (value: ArgumentSummary): void => {
    switch (value.type) {
      case "function":
        result.push(value.range.start, value.range.end);
        if (value.returns !== undefined) summary(value.returns);
        break;
      case "reference":
        target(value.target);
        break;
      case "object":
        for (const property of value.properties) summary(property.value);
        break;
      case "array":
        for (const element of value.elements) summary(element);
        break;
      case "call":
        target(value.callee);
        for (const argument of value.arguments) summary(argument);
        break;
      case "template":
        for (const substitution of value.substitutions) summary(substitution);
        break;
      case "spread":
        summary(value.argument);
        break;
      case "boolean":
      case "null":
      case "number":
      case "other":
      case "string":
        break;
    }
  };
  result.push(
    ...extraction.syntaxErrors,
    ...extraction.imports,
    ...extraction.exports,
    ...extraction.facts,
  );
  for (const symbol of extraction.symbols) {
    result.push(symbol.range.start, symbol.range.end);
    for (const declaration of symbol.declarations ?? []) {
      result.push(declaration.range.start, declaration.range.end);
    }
    for (const decorator of symbol.decorators ?? []) {
      result.push(decorator);
      decorator.arguments.forEach(summary);
    }
    if (symbol.value !== undefined) summary(symbol.value);
    symbol.initializer?.arguments?.forEach(summary);
  }
  for (const reference of extraction.references) {
    result.push(reference);
    target(reference.target);
    reference.arguments?.forEach(summary);
  }
  return result;
}

/** Assert the structural invariants of one extraction. */
function checkInvariants(extraction: FileExtraction, label: string): void {
  const names = new Set(extraction.symbols.map((symbol) => symbol.localName));
  expect(names.size, `${label}: unique local names`).toBe(extraction.symbols.length);
  for (const symbol of extraction.symbols) {
    if (symbol.parent !== undefined)
      expect(names.has(symbol.parent), `${label}: parent ${symbol.parent}`).toBe(true);
    expect(symbol.signature?.length ?? 0).toBeLessThanOrEqual(200);
  }
  for (const reference of extraction.references) {
    if (reference.from !== undefined)
      expect(names.has(reference.from), `${label}: from ${reference.from}`).toBe(true);
    expect((reference.arguments ?? []).length).toBeLessThanOrEqual(8);
  }
  for (const item of [...extraction.imports, ...extraction.facts]) {
    if (item.from !== undefined)
      expect(names.has(item.from), `${label}: from ${item.from}`).toBe(true);
  }
  for (const global of extraction.globals ?? []) expect(names.has(global)).toBe(true);
  for (const position of positions(extraction)) {
    expect(position.line, label).toBeGreaterThanOrEqual(1);
    expect(position.column, label).toBeGreaterThanOrEqual(1);
  }
}

function sweep(root: string): number {
  let count = 0;
  for (const full of sourceFiles(root)) {
    const path = relative(root, full).replaceAll("\\", "/");
    const text = readFileSync(full, "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n");
    const extraction = extract(path, text);
    checkInvariants(extraction, path);
    expect(extract(path, text), `${path}: deterministic`).toEqual(extraction);
    count += 1;
  }
  return count;
}

describe("sweep", () => {
  it.skipIf(!existsSync(FIXTURES))("extracts every fixture source file", () => {
    expect(sweep(FIXTURES)).toBeGreaterThan(100);
  });

  it.skipIf(!existsSync(CODEVERSE))("extracts every CodeVerse source file", () => {
    expect(sweep(CODEVERSE)).toBeGreaterThan(0);
  });
});

describe("generated programs", () => {
  const NAMES = ["User", "Order", "load", "Store"];
  const DECLARATIONS: ReadonlyArray<(name: string) => string> = [
    (name) => `function ${name}() {}`,
    (name) => `declare function ${name}(value: string): void;`,
    (name) => `class ${name} { run() {} static run() {} }`,
    (name) => `interface ${name} { id: string }`,
    (name) => `type ${name} = { id: string };`,
    (name) => `enum ${name} { A }`,
    (name) => `namespace ${name} { export const inner = 1; }`,
    (name) => `const ${name} = 1;`,
    (name) => `let ${name} = 1;`,
    (name) => `const ${name} = () => 1;`,
    (name) => `export default class ${name} {}`,
    (name) => `declare global { var ${name}: number; }`,
    (name) => `declare global { function ${name}(): void; }`,
  ];
  const program = fc.array(
    fc.tuple(fc.constantFrom(...NAMES), fc.integer({ min: 0, max: DECLARATIONS.length - 1 })),
    { minLength: 1, maxLength: 12 },
  );
  const render = (declarations: ReadonlyArray<readonly [string, number]>): string =>
    declarations.map(([name, index]) => DECLARATIONS[index]?.(name) ?? "").join("\n");
  const identities = (extraction: FileExtraction): string[] =>
    [
      ...extraction.symbols.map(
        (symbol) =>
          `${symbol.localName} ${symbol.kind} ${symbol.qualifiedName} ${symbol.declarations?.length ?? 1}`,
      ),
      ...(extraction.globals ?? []).map((name) => `global ${name}`),
    ].sort();

  it("satisfies the invariants and is deterministic", () => {
    fc.assert(
      fc.property(program, (declarations) => {
        const text = render(declarations);
        const extraction = extract("src/generated.ts", text);
        checkInvariants(extraction, text);
        expect(extract("src/generated.ts", text)).toEqual(extraction);
      }),
      { numRuns: 200 },
    );
  });

  it("names declarations independently of their order (kind precedence)", () => {
    fc.assert(
      fc.property(
        program.chain((declarations) =>
          fc.tuple(
            fc.constant(declarations),
            fc.shuffledSubarray(declarations, { minLength: declarations.length }),
          ),
        ),
        ([declarations, shuffled]) => {
          expect(identities(extract("src/a.ts", render(shuffled)))).toEqual(
            identities(extract("src/a.ts", render(declarations))),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("long expressions", () => {
  // The walk keeps its own stack, so the depth of an expression no longer exhausts the call stack (formerly at
  // about 2,000 operands on the main thread and 8,000 in a worker), and lookups of names and of `this` skip
  // runs of nodes in one step, so that extraction time stays linear in the length of an expression (it was
  // quadratic: 30,000 operands took about half a minute).
  const TERMS = 30_000;

  /** Extract, within a time budget far above linear time and far below quadratic time. */
  function timed(path: string, text: string): FileExtraction {
    const started = performance.now();
    const extraction = extract(path, text);
    expect(performance.now() - started, path).toBeLessThan(5_000);
    return extraction;
  }

  it("extracts generated template caches (long string concatenations)", () => {
    const lines = Array.from(
      { length: 20_000 },
      (_, index) => `    '<div class="row-${index}">{{ vm.item${index} }}</div>'`,
    );
    const text = `angular.module("app").run(["$templateCache", function ($templateCache) {\n  $templateCache.put("big.html",\n${lines.join(" +\n")});\n}]);\n`;
    const extraction = timed("src/templates.js", text);
    expect(extraction.syntaxErrors).toEqual([]);
    const module = { type: "name", name: "angular", members: ["module"] };
    expect(
      extraction.references.map((reference) => [reference.line, reference.kind, reference.target]),
    ).toEqual([
      [1, "call", module],
      [1, "call", { type: "instance", via: "call-result", of: module, members: ["run"] }],
      [2, "call", { type: "parameter", index: 0, name: "$templateCache", members: ["put"] }],
    ]);
  });

  it("extracts long operator chains of names, this members and assignments", () => {
    const sum = timed(
      "src/sum.ts",
      `import { a } from "./a";\nexport const s = ${Array<string>(TERMS).fill("a").join(" + ")};\n`,
    );
    expect(sum.syntaxErrors).toEqual([]);
    expect(sum.references).toHaveLength(TERMS);
    expect(sum.references.at(-1)).toEqual({
      kind: "value",
      target: { type: "import", local: "a", members: [] },
      typeOnly: false,
      from: "s",
      line: 2,
      column: 18 + 4 * (TERMS - 1),
    });
    const members = timed(
      "src/members.ts",
      `export class C {\n  x = 1;\n  m() { return ${Array<string>(TERMS).fill("this.x").join(" + ")}; }\n}\n`,
    );
    expect(members.references).toHaveLength(TERMS);
    expect(
      new Set(
        members.references.map((reference) => JSON.stringify([reference.from, reference.target])),
      ),
    ).toEqual(
      new Set([JSON.stringify(["C.m", { type: "symbol", localName: "C.x", members: [] }])]),
    );
    const assignments = Array.from({ length: TERMS }, (_, index) => `target.p${index} = ${index}`);
    const sequence = timed(
      "src/sequence.ts",
      `const target: Record<string, number> = {};\n${assignments.join(", ")};\n`,
    );
    expect(sequence.syntaxErrors).toEqual([]);
    expect(sequence.references).toHaveLength(TERMS);
  });
});

describe("files TypeScript cannot bind", () => {
  const SERVICE = [
    'import { UserRepository } from "./repo";',
    'import { sendMail } from "./mail";',
    'import { z } from "zod";',
    "export class UserService {",
    "  constructor(private repo: UserRepository) {}",
    "  async register(email: string) {",
    "    await this.repo.save(email);",
    "    sendMail(email);",
    "  }",
    "}",
  ].join("\n");

  it("keeps imports, symbols and exports and reports that names were not resolved", () => {
    const parsed = parse("src/service.ts", SERVICE);
    expect(parsed.bound).toBe(true);
    // As when TypeScript's binder fails: it recurses along call chains and logical operators, so a fluent
    // chain of about a thousand links (or a `||` chain of a few thousand operands) exhausts the stack.
    const unbound: ParsedTypeScriptFile = {
      ...parsed,
      bound: false,
      bindingFailure: "Maximum call stack size exceeded",
    };
    const extraction = extractTypeScriptFile(unbound, resolveTypeScriptAdapterOptions(undefined));
    const complete = extract("src/service.ts", SERVICE);
    expect(extraction.syntaxErrors).toEqual([
      {
        message:
          "Incomplete extraction: TypeScript could not bind this file (Maximum call stack size exceeded), so names were not resolved and references to imports and declarations are missing.",
        line: 1,
        column: 1,
      },
    ]);
    expect(extraction.imports).toEqual(complete.imports);
    expect(extraction.exports).toEqual(complete.exports);
    expect(extraction.symbols.map((symbol) => symbol.localName)).toEqual(
      complete.symbols.map((symbol) => symbol.localName),
    );
    // Only references found without name lookup remain (`this` members).
    expect(complete.references.map((reference) => reference.target)).toEqual([
      { type: "import", local: "UserRepository", members: [] },
      { type: "symbol", localName: "UserService.repo", members: ["save"] },
      { type: "import", local: "sendMail", members: [] },
    ]);
    expect(extraction.references.map((reference) => reference.target)).toEqual([
      { type: "symbol", localName: "UserService.repo", members: ["save"] },
    ]);
  });

  it("extracts files whose expressions are too deep for TypeScript's binder", () => {
    const inputs = [
      `${SERVICE}\nexport const schema = z${"\n  .string()".repeat(20_000)};\n`,
      `${SERVICE}\nexport const known = (k: number) => ${Array.from({ length: 20_000 }, (_, index) => `k === ${index}`).join(" || ")};\n`,
    ];
    for (const text of inputs) {
      const parsed = parse("src/service.ts", text);
      const extraction = extractTypeScriptFile(parsed, resolveTypeScriptAdapterOptions(undefined));
      expect(extraction.imports.map((entry) => entry.specifier)).toEqual([
        "./repo",
        "./mail",
        "zod",
      ]);
      expect(extraction.exports.map((entry) => entry.name)).toHaveLength(2);
      expect(extraction.symbols.length).toBeGreaterThanOrEqual(4);
      // Marked incomplete exactly when TypeScript could not bind the file.
      expect(
        extraction.syntaxErrors.map((error) => error.message.startsWith("Incomplete extraction")),
      ).toEqual(parsed.bound ? [] : [true]);
    }
  });
});
