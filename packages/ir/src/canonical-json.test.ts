import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";
import { canonicalJson as exported } from "./index.js";

// Core's tests, moved with the implementation (milestone 5); core keeps its copy, which now runs through its
// re-export, so both packages are checked against the same expectations.
describe("canonicalJson", () => {
  it("is exported from the package index", () => {
    expect(exported).toBe(canonicalJson);
  });

  it("sorts keys by UTF-16 code units, including integer-like keys", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
    // JavaScript would enumerate "9" before "10"; code-unit order puts "10" first.
    expect(canonicalJson({ 9: "nine", 10: "ten", a: "a" })).toBe('{"10":"ten","9":"nine","a":"a"}');
  });

  it("follows JSON.stringify for values JSON cannot represent", () => {
    expect(canonicalJson({ a: undefined, b: () => 1, c: Number.NaN, d: Infinity })).toBe(
      '{"c":null,"d":null}',
    );
    expect(canonicalJson([undefined, () => 1, Symbol("x")])).toBe("[null,null,null]");
    expect(canonicalJson(undefined)).toBe("null");
    expect(canonicalJson({ when: new Date(0) })).toBe('{"when":"1970-01-01T00:00:00.000Z"}');
    expect(canonicalJson("é\n")).toBe('"é\\n"');
  });

  it("serializes shared references and rejects cycles and bigints", () => {
    const shared = { x: 1 };
    expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(TypeError);
    expect(() => canonicalJson({ n: 1n })).toThrow(TypeError);
  });

  it("serializes own __proto__ keys like any other key", () => {
    const parsed = JSON.parse('{"__proto__":{"x":1},"a":2}') as unknown;
    expect(canonicalJson(parsed)).toBe('{"__proto__":{"x":1},"a":2}');
  });

  it("round-trips JSON values and ignores key order", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const text = canonicalJson(value);
        expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(value)));
        const reordered = JSON.parse(JSON.stringify(value), (_key, nested: unknown) =>
          typeof nested === "object" && nested !== null && !Array.isArray(nested)
            ? Object.fromEntries(Object.entries(nested).reverse())
            : nested,
        ) as unknown;
        expect(canonicalJson(reordered)).toBe(text);
      }),
      { seed: 20261007, numRuns: 200 },
    );
  });
});
