/**
 * Extraction checked against the ground truth of the fixture repositories (`fixtures/<name>/expected.json`),
 * for the expectations that depend on extraction alone (symbols, decorators, module formats, syntax errors,
 * export names, environment reads and HTTP calls).
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FileExtraction } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { detectTypeScriptLanguage } from "../languages.js";
import { resolveTypeScriptAdapterOptions } from "../options.js";
import { extractTypeScriptFile, parseTypeScriptFile } from "./index.js";

const FIXTURES = fileURLToPath(new URL("../../../../fixtures/", import.meta.url));

function fixtureFile(fixture: string, path: string): FileExtraction {
  const detection = detectTypeScriptLanguage(path);
  if (detection === undefined) throw new Error(`unsupported path ${path}`);
  const text = readFileSync(`${FIXTURES}${fixture}/${path}`, "utf8").replace(/\r\n?/g, "\n");
  const parsed = parseTypeScriptFile({ path, text, ...detection });
  return extractTypeScriptFile(parsed, resolveTypeScriptAdapterOptions(undefined));
}

function expectations(fixture: string): Record<string, unknown> {
  const expected = JSON.parse(readFileSync(`${FIXTURES}${fixture}/expected.json`, "utf8")) as {
    expectations: Record<string, unknown>;
  };
  return expected.expectations;
}

const available = (fixture: string): boolean => existsSync(`${FIXTURES}${fixture}/expected.json`);

describe.skipIf(!available("typescript-features"))("fixture typescript-features", () => {
  const expected = available("typescript-features") ? expectations("typescript-features") : {};

  it("extracts the sampled symbols with their kinds", () => {
    const samples = expected.symbolsSample as Array<{
      file: string;
      qualifiedName: string;
      kind: string;
    }>;
    for (const sample of samples) {
      const symbols = fixtureFile("typescript-features", sample.file).symbols;
      expect(
        symbols.some(
          (symbol) => symbol.qualifiedName === sample.qualifiedName && symbol.kind === sample.kind,
        ),
        `${sample.file}#${sample.qualifiedName} (${sample.kind})`,
      ).toBe(true);
    }
  });

  it("merges declarations into one symbol", () => {
    const merged = expected.mergedSymbols as Array<{
      file: string;
      qualifiedName: string;
      kind: string;
      declarations: number;
    }>;
    for (const entry of merged) {
      const matches = fixtureFile("typescript-features", entry.file).symbols.filter(
        (symbol) => symbol.qualifiedName === entry.qualifiedName && symbol.kind === entry.kind,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.declarations).toHaveLength(entry.declarations);
    }
  });

  it("assigns the expected symbol identifiers to declarations sharing a name", () => {
    for (const [id, kind] of Object.entries(expected.symbolIds as Record<string, string>)) {
      const [file = "", localName = ""] = id.split("#");
      const symbol = fixtureFile("typescript-features", file).symbols.find(
        (candidate) => candidate.localName === localName,
      );
      expect(symbol?.kind, id).toBe(kind);
    }
  });

  it("records decorators with their argument text", () => {
    const decorators = expected.decorators as Record<
      string,
      Array<{ name: string; arguments: string[] }>
    >;
    for (const [id, entries] of Object.entries(decorators)) {
      const [file = "", localName = ""] = id.split("#");
      const symbol = fixtureFile("typescript-features", file).symbols.find(
        (candidate) => candidate.localName === localName,
      );
      expect(
        symbol?.decorators?.map((decorator) => ({
          name: decorator.name,
          arguments: decorator.text,
        })),
        id,
      ).toEqual(entries);
    }
  });

  it("reports the first syntax error of partial files", () => {
    for (const [file, entry] of Object.entries(
      expected.partialFiles as Record<string, { firstSyntaxErrorLine: number }>,
    )) {
      const extraction = fixtureFile("typescript-features", file);
      expect(extraction.syntaxErrors[0]?.line).toBe(entry.firstSyntaxErrorLine);
      expect(extraction.imports.length).toBeGreaterThan(0);
    }
  });

  it("classifies script files", () => {
    for (const file of expected.scriptFiles as string[]) {
      expect(fixtureFile("typescript-features", file).moduleFormat, file).toBe("script");
    }
  });
});

describe.skipIf(!available("javascript-commonjs"))("fixture javascript-commonjs", () => {
  const expected = available("javascript-commonjs") ? expectations("javascript-commonjs") : {};

  it("detects module formats", () => {
    for (const [file, format] of Object.entries(expected.moduleFormats as Record<string, string>)) {
      expect(fixtureFile("javascript-commonjs", file).moduleFormat, file).toBe(format);
    }
  });

  it("records the non-literal require with its source text", () => {
    const entries = expected.nonLiteralSpecifiers as Array<{
      file: string;
      specifier: string;
      line: number;
    }>;
    for (const entry of entries) {
      const found = fixtureFile("javascript-commonjs", entry.file).imports.filter(
        (item) => !item.literal,
      );
      expect(found.map((item) => [item.specifier, item.line, item.mechanism])).toEqual([
        [entry.specifier, entry.line, "require-call"],
      ]);
    }
  });

  it("exports the expected names", () => {
    // The fixture names `module.exports = value` exports `default`; extractions use `=` (the export
    // assignment, see the IR), which an object literal accompanies without targets.
    for (const [file, names] of Object.entries(expected.exports as Record<string, string[]>)) {
      const exported = fixtureFile("javascript-commonjs", file).exports.map((entry) => entry.name);
      const comparable =
        exported.length === 1 && exported[0] === "="
          ? ["default"]
          : exported.filter((name) => name !== "=");
      expect([...comparable].sort(), file).toEqual(names);
    }
  });

  it("parses JSX in .jsx and .js files without syntax errors", () => {
    for (const file of expected.jsxFiles as string[]) {
      const extraction = fixtureFile("javascript-commonjs", file);
      expect(extraction.syntaxErrors, file).toEqual([]);
    }
  });
});

describe.each(["express-app", "fastify-app", "nestjs-app"].filter(available))(
  "fixture %s",
  (fixture) => {
    const expected = expectations(fixture);

    it("records the expected environment reads", () => {
      const reads = expected.envReads as Array<[string, string]>;
      const files = [...new Set(reads.map(([file]) => file))];
      const found = files.flatMap((file) =>
        fixtureFile(fixture, file)
          .facts.filter((fact) => fact.type === "environment-read")
          .map((fact) => [file, fact.attributes.name] as [string, string | undefined]),
      );
      expect([...new Set(found.map((entry) => entry.join("\u0000")))].sort()).toEqual(
        reads.map((entry) => entry.join("\u0000")).sort(),
      );
    });

    it("records the expected HTTP calls", () => {
      const calls = expected.httpCalls as Array<[string, string, string]>;
      for (const [file, method, url] of calls) {
        const requests = fixtureFile(fixture, file).facts.filter(
          (fact) => fact.type === "http-request",
        );
        expect(
          requests.map((fact) => [fact.attributes.method, fact.attributes.url]),
        ).toContainEqual([method, url]);
        expect(requests.map((fact) => fact.attributes.host)).toContain(new URL(url).host);
      }
    });
  },
);
