import { describe, expect, it } from "vitest";
import type { SymbolDeclarationInput } from "./symbols.js";
import { SymbolNamer } from "./symbols.js";

function names(declarations: SymbolDeclarationInput[]): string[] {
  const namer = new SymbolNamer();
  const handles = declarations.map((declaration) => namer.declare(declaration));
  return handles.map((handle) => namer.localName(handle));
}

describe("SymbolNamer", () => {
  it("uses the bare qualified name for unique declarations", () => {
    expect(
      names([
        { qualifiedName: "PaymentService", kind: "class" },
        { qualifiedName: "PaymentService.charge", kind: "method" },
      ]),
    ).toEqual(["PaymentService", "PaymentService.charge"]);
  });

  it("merges declarations with the same identity (overloads, declaration merging)", () => {
    const namer = new SymbolNamer();
    const first = namer.declare({ qualifiedName: "parse", kind: "function" });
    const second = namer.declare({ qualifiedName: "parse", kind: "function" });
    expect(namer.localName(first)).toBe("parse");
    expect(namer.localName(second)).toBe("parse");
    expect(namer.isMerged(first)).toBe(false);
    expect(namer.isMerged(second)).toBe(true);
  });

  it("gives the bare name by kind precedence, independent of source order", () => {
    const constantFirst = names([
      { qualifiedName: "User", kind: "constant" },
      { qualifiedName: "User", kind: "type-alias" },
    ]);
    const typeFirst = names([
      { qualifiedName: "User", kind: "type-alias" },
      { qualifiedName: "User", kind: "constant" },
    ]);
    expect(constantFirst).toEqual(["User", "User~type-alias"]);
    expect(typeFirst).toEqual(["User~type-alias", "User"]);
  });

  it("disambiguates class/namespace/interface merges", () => {
    expect(
      names([
        { qualifiedName: "Foo", kind: "namespace" },
        { qualifiedName: "Foo", kind: "interface" },
        { qualifiedName: "Foo", kind: "class" },
      ]),
    ).toEqual(["Foo~namespace", "Foo~interface", "Foo"]);
  });

  it("separates static and instance members with the same name", () => {
    expect(
      names([
        { qualifiedName: "A.create", kind: "method", isStatic: true },
        { qualifiedName: "A.create", kind: "method" },
      ]),
    ).toEqual(["A.create~method-static", "A.create"]);
  });

  it("separates otherwise identical declarations by content-derived keys", () => {
    expect(
      names([
        { qualifiedName: "Order.fmt", kind: "method", key: "display" },
        { qualifiedName: "Order.fmt", kind: "method", key: "debug" },
      ]),
    ).toEqual(["Order.fmt~method-display", "Order.fmt"]);
  });

  it("rejects invalid input and late declarations", () => {
    const namer = new SymbolNamer();
    expect(() => namer.declare({ qualifiedName: "", kind: "class" })).toThrow();
    expect(() => namer.declare({ qualifiedName: "a~b", kind: "class" })).toThrow();
    expect(() => namer.declare({ qualifiedName: "a", kind: "class", key: "Bad Key" })).toThrow();
    namer.declare({ qualifiedName: "a", kind: "class" });
    namer.assign();
    expect(() => namer.declare({ qualifiedName: "b", kind: "class" })).toThrow();
    expect(() => namer.localName(99)).toThrow();
  });
});
