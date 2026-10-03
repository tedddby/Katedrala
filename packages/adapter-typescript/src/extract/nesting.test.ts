/**
 * Nesting limits: the measure of a file's nesting (iterative, weighted by the stack TypeScript's parser and
 * binder use per level), the deterministic treatment of files beyond the limits, and the clearing of the
 * parser's state after a parse that exhausted the stack.
 */
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { detectTypeScriptLanguage } from "../languages.js";
import { resolveTypeScriptAdapterOptions } from "../options.js";
import { extractTypeScriptFile, parseTypeScriptFile, type ParsedTypeScriptFile } from "./index.js";
import {
  MAX_BINDING_NESTING,
  MAX_PARSING_NESTING,
  NESTED_TOO_DEEPLY_TO_BIND,
  NESTED_TOO_DEEPLY_TO_PARSE,
  measureNesting,
  type Nesting,
} from "./nesting.js";

type Source = readonly [path: string, text: string];

function parse([path, text]: Source): ParsedTypeScriptFile {
  const detection = detectTypeScriptLanguage(path);
  if (detection === undefined) throw new Error(`unsupported path ${path}`);
  return parseTypeScriptFile({ path, text, ...detection });
}

/** The nesting of a file, parsed directly with TypeScript (also beyond the adapter's limits). */
function nestingOf([path, text]: Source): Nesting {
  const javascript = /\.[cm]?jsx?$/.test(path);
  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : javascript
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  return measureNesting(file, !javascript);
}

/** The largest size whose nesting `accept`s, by bisection (nesting grows with the size). */
function largest(make: (n: number) => Source, accept: (nesting: Nesting) => boolean): number {
  let low = 1;
  let high = 2;
  while (accept(nestingOf(make(high)))) {
    low = high;
    high *= 2;
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (accept(nestingOf(make(middle)))) low = middle;
    else high = middle;
  }
  return low;
}

const operands = (n: number, operand: (index: number) => string, operator: string): string =>
  Array.from({ length: n }, (_, index) => operand(index)).join(` ${operator} `);

const or = (n: number): Source => [
  "src/or.ts",
  `declare const k: number;\nexport const known = ${operands(n, (index) => `k === ${index}`, "||")};\n`,
];
const calls = (n: number): Source => [
  "src/cli.ts",
  `import { program } from "commander";\nprogram${'.option("-x")'.repeat(n)};\n`,
];
const elseIf = (n: number): Source => [
  "src/branches.ts",
  `declare const a: boolean;\nexport function f(): void {\n${"if (a) {} else ".repeat(n)}{}\n}\n`,
];
const ternary = (n: number): Source => [
  "src/ternary.ts",
  `declare const a: boolean;\nexport const t = ${"a ? 1 : ".repeat(n)}0;\n`,
];
const typeArguments = (n: number): Source => [
  "src/types.ts",
  `type A<T> = T;\nexport type T = ${"A<".repeat(n)}string${">".repeat(n)};\n`,
];
const lessThan = (n: number, path = "src/compare.ts"): Source => [
  path,
  `declare const a: any;\nexport const c = ${operands(n, () => "a", "<")};\n`,
];
const sum = (n: number): Source => [
  "src/sum.ts",
  `declare const a: number;\nexport const s = ${operands(n, () => "a", "+")};\n`,
];
const assignments = (n: number): Source => [
  "src/assign.ts",
  `let a = 0;\nexport const s = ${"a = ".repeat(n)}1;\n`,
];
/** JSDoc after the last statement, which TypeScript attaches to the end of file token. */
const trailingTypedef = (n: number): Source => [
  "src/types.js",
  `export var x;\n/** @typedef {${"Array<".repeat(n)}string${">".repeat(n)}} Deep */\n`,
];

describe("nesting measure", () => {
  it("weighs each level of a construct by the stack the parser and the binder use for it", () => {
    const growth = (make: (n: number) => Source): [number, number] => {
      const before = nestingOf(make(40));
      const after = nestingOf(make(41));
      return [after.parsing - before.parsing, after.binding - before.binding];
    };
    // [parsing, binding] per additional level.
    expect(growth(or)).toEqual([0, 5]);
    expect(growth(calls)).toEqual([0, 6]);
    expect(growth(elseIf)).toEqual([1, 2]);
    expect(growth(ternary)).toEqual([2, 2]);
    expect(growth(typeArguments)).toEqual([8, 8]);
    // TypeScript first reads `a < b < ...` as type arguments; JavaScript does not.
    expect(growth(lessThan)).toEqual([7, 0]);
    expect(growth((n) => lessThan(n, "src/compare.js"))).toEqual([0, 0]);
    // Both iterate over `+` chains; the parser recurses along `=` chains, the binder does not.
    expect(growth(sum)).toEqual([0, 0]);
    expect(growth(assignments)).toEqual([1, 0]);
    // JSDoc types of JavaScript files are parsed and bound too.
    expect(growth(trailingTypedef)).toEqual([8, 8]);
  });

  it("measures without recursion, however deep the tree", () => {
    // 100,000 levels of `||`: far more than the call stack holds, but the parser builds them in a loop.
    const nesting = nestingOf([
      "src/huge.ts",
      `export const h = ${operands(100_000, () => "a", "||")};\n`,
    ]);
    expect(nesting.binding).toBeGreaterThan(5 * 99_999);
    expect(nesting.parsing).toBeLessThan(100);
  });
});

describe("nesting limits", () => {
  const options = resolveTypeScriptAdapterOptions(undefined);

  it("binds files up to the limit for binding and extracts deeper files without scopes", () => {
    for (const make of [or, calls, elseIf]) {
      const limit = largest(make, (nesting) => nesting.binding <= MAX_BINDING_NESTING);
      const under = parse(make(limit));
      expect(under.bound, make(limit)[0]).toBe(true);
      expect(extractTypeScriptFile(under, options).syntaxErrors).toEqual([]);
      const over = parse(make(limit + 1));
      expect(over.bound).toBe(false);
      expect(over.bindingFailure).toBe(NESTED_TOO_DEEPLY_TO_BIND);
      const extraction = extractTypeScriptFile(over, options);
      expect(extraction.syntaxErrors).toEqual([
        {
          message: `Incomplete extraction: ${NESTED_TOO_DEEPLY_TO_BIND}, so names were not resolved and references to imports and declarations are missing.`,
          line: 1,
          column: 1,
        },
      ]);
      // Without scopes, the rest of the extraction is still there.
      expect(extraction.exports.length + extraction.imports.length).toBeGreaterThan(0);
    }
  });

  it("does not analyze files beyond the limit for parsing, whether or not the parser could read them", () => {
    for (const make of [typeArguments, lessThan, elseIf]) {
      const limit = largest(make, (nesting) => nesting.parsing <= MAX_PARSING_NESTING);
      expect(() => parse(make(limit))).not.toThrow();
      expect(() => parse(make(limit + 1))).toThrow(NESTED_TOO_DEEPLY_TO_PARSE);
    }
    // Far deeper than the parser can go in any thread: the same outcome, not the engine's stack overflow.
    const parentheses: Source = [
      "src/deep.ts",
      `export const p = ${"(".repeat(100_000)}1${")".repeat(100_000)};\n`,
    ];
    expect(() => parse(parentheses)).toThrow(NESTED_TOO_DEEPLY_TO_PARSE);
  });

  it("parses the next file normally after a parse that exhausted the stack", () => {
    // The first statement leaves TypeScript's parser a note that the `(` at offset 0 does not start an arrow
    // function; it kept the note after a parse that threw, and then misread the arrow function at the same
    // offset of the next file.
    const exhausting: Source = [
      "src/exhausting.ts",
      `(a, b);\n${"(".repeat(100_000)}1${")".repeat(100_000)};\n`,
    ];
    expect(() => parse(exhausting)).toThrow(NESTED_TOO_DEEPLY_TO_PARSE);
    const next = parse(["src/next.ts", "(a, b) => a;\n"]);
    expect(next.syntaxErrors).toEqual([]);
  });
});
