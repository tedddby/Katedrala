import { describe, expect, it } from "vitest";
import type { ExtractedDecorator } from "@katedrala/plugin-api";
import { splitLocalName } from "./records.js";
import { extraction, file, member, run, sid, sym } from "./test-support.js";

function decorator(
  name: string,
  text: string[],
  extra: Partial<ExtractedDecorator> = {},
): ExtractedDecorator {
  return { name, invoked: true, arguments: [], text, line: 1, column: 1, ...extra };
}

describe("local names", () => {
  it("split at the first tilde", () => {
    expect(splitLocalName("Foo")).toEqual({ qualifiedName: "Foo" });
    expect(splitLocalName("Foo~namespace")).toEqual({
      qualifiedName: "Foo",
      disambiguator: "namespace",
    });
    expect(splitLocalName("A.create~method-static")).toEqual({
      qualifiedName: "A.create",
      disambiguator: "method-static",
    });
    expect(splitLocalName("a~b~c")).toEqual({ qualifiedName: "a", disambiguator: "b~c" });
  });
});

describe("symbol entities", () => {
  it("maps every extracted field and omits empty optional arrays", async () => {
    const range = { start: { line: 3, column: 1 }, end: { line: 9, column: 2 } };
    const result = await run([
      file(
        "src/order-service.ts",
        extraction({
          symbols: [
            sym("OrderService", "class", {
              abstract: false,
              visibility: "public",
              modifiers: ["sealed", "abstract", "sealed"],
              decorators: [
                decorator("Injectable", ['"orders"']),
                decorator("Inject", ['"clock"'], { parameterIndex: 0 }),
              ],
              signature: "class OrderService",
              roles: ["service", "repository", "service"],
            }),
            member("OrderService", "place", "method", {
              range,
              declarations: [
                {
                  range: { start: { line: 3, column: 1 }, end: { line: 3, column: 30 } },
                  signature: "place(a)",
                },
                { range },
              ],
              decorators: [decorator("Log", [], { invoked: false })],
              role: "test",
            }),
            member("OrderService", "once", "method", {
              declarations: [
                { range: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } } },
              ],
              modifiers: [],
              decorators: [],
            }),
            sym("Widget", "x-acme-widget", { category: "type" }),
            sym("Gadget", "x-acme-gadget"),
          ],
        }),
      ),
    ]);
    const byLocalName = Object.fromEntries(
      result.symbols.map((symbol) => [symbol.id.slice(symbol.id.indexOf("#") + 1), symbol]),
    );
    expect(byLocalName.OrderService).toEqual({
      id: sid("src/order-service.ts", "OrderService"),
      name: "OrderService",
      qualifiedName: "OrderService",
      kind: "class",
      category: "type",
      file: "file:src/order-service.ts",
      range: { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } },
      exported: false,
      visibility: "public",
      abstract: false,
      modifiers: ["abstract", "sealed"],
      decorators: [{ name: "Injectable", invoked: true, arguments: ['"orders"'] }],
      signature: "class OrderService",
      roles: [
        {
          role: "repository",
          confidence: 1,
          source: "fake",
          evidence: [
            {
              signal: "declaration-syntax",
              description: "The fake adapter recognized the role from the declaration's syntax.",
            },
          ],
        },
        {
          role: "service",
          confidence: 1,
          source: "fake",
          evidence: [
            {
              signal: "declaration-syntax",
              description: "The fake adapter recognized the role from the declaration's syntax.",
            },
          ],
        },
      ],
    });
    expect(byLocalName["OrderService.place"]).toEqual({
      id: sid("src/order-service.ts", "OrderService.place"),
      name: "place",
      qualifiedName: "OrderService.place",
      kind: "method",
      category: "callable",
      file: "file:src/order-service.ts",
      parent: sid("src/order-service.ts", "OrderService"),
      range,
      declarations: [
        {
          range: { start: { line: 3, column: 1 }, end: { line: 3, column: 30 } },
          signature: "place(a)",
        },
        { range },
      ],
      exported: false,
      decorators: [{ name: "Log", invoked: false, arguments: [] }],
      role: "test",
    });
    expect(byLocalName["OrderService.once"]).not.toHaveProperty("declarations");
    expect(byLocalName["OrderService.once"]).not.toHaveProperty("modifiers");
    expect(byLocalName["OrderService.once"]).not.toHaveProperty("decorators");
    expect(byLocalName.Widget?.category).toBe("type");
    // Unknown kinds without an explicit category are values.
    expect(byLocalName.Gadget?.category).toBe("value");
  });

  it("keeps the first of repeated local names and ignores invalid ones with a diagnostic", async () => {
    const result = await run([
      file(
        "src/a.ts",
        extraction({
          symbols: [
            sym("parse", "function", { signature: "first" }),
            sym("parse", "function", { signature: "second" }),
            sym("Bad~Not Valid", "function", { line: 7 }),
            sym("~orphan", "function", { line: 8 }),
            member("ghost", "child", "method"),
          ],
        }),
      ),
    ]);
    expect(result.symbols.map((symbol) => [symbol.id, symbol.signature, symbol.parent])).toEqual([
      [sid("src/a.ts", "ghost.child"), undefined, undefined],
      [sid("src/a.ts", "parse"), "first", undefined],
    ]);
    expect(result.files[0]?.symbols).toEqual([
      sid("src/a.ts", "parse"),
      sid("src/a.ts", "ghost.child"),
    ]);
    expect(
      result.diagnostics.map((diagnostic) => [
        diagnostic.code,
        diagnostic.severity,
        diagnostic.line,
      ]),
    ).toEqual([
      ["plugin-error", "warning", 7],
      ["plugin-error", "warning", 8],
    ]);
  });

  it("escapes symbol paths and keeps qualified names consistent with identifiers", async () => {
    const result = await run([
      file("src/#weird%.ts", extraction({ symbols: [sym("a%2Eb", "constant")] })),
    ]);
    expect(result.symbols[0]).toMatchObject({
      id: "sym:src/%23weird%25.ts#a%2Eb",
      name: "a.b",
      qualifiedName: "a%2Eb",
    });
  });
});
