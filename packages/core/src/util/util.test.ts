import type { Diagnostic } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";
import { Limiter, mapConcurrent } from "./concurrency.js";
import { compareDiagnostics, errorMessage, sortDiagnostics } from "./diagnostics.js";

describe("canonicalJson", () => {
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
    );
  });
});

describe("mapConcurrent", () => {
  it("keeps input order and bounds the work in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 40 }, (_, index) => index);
    const results = await mapConcurrent(items, 5, async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, (item * 7) % 5));
      inFlight--;
      return item * 2;
    });
    expect(results).toEqual(items.map((item) => item * 2));
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("rejects with the first failure and starts nothing afterwards", async () => {
    const started: number[] = [];
    await expect(
      mapConcurrent([1, 2, 3, 4, 5], 1, (item) => {
        started.push(item);
        return item === 2 ? Promise.reject(new Error("boom")) : Promise.resolve(item);
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });

  it("handles empty input", async () => {
    await expect(mapConcurrent([], 3, () => Promise.resolve(1))).resolves.toEqual([]);
  });
});

describe("Limiter", () => {
  it("grants slots in request order", async () => {
    const limiter = new Limiter(1);
    const order: string[] = [];
    await limiter.acquire();
    const second = limiter.acquire().then(() => order.push("second"));
    const third = limiter.acquire().then(() => order.push("third"));
    order.push("first");
    limiter.release();
    await second;
    limiter.release();
    await third;
    limiter.release();
    expect(order).toEqual(["first", "second", "third"]);
    await expect(limiter.run(() => Promise.resolve(42))).resolves.toBe(42);
  });
});

describe("diagnostics", () => {
  it("sorts canonically by file, line, column, code, message", () => {
    const diagnostics: Diagnostic[] = [
      { code: "syntax-error", severity: "error", message: "b", file: "file:b.ts", line: 1 },
      { code: "read-failed", severity: "error", message: "x", file: "file:a.ts", line: 2 },
      { code: "plugin-error", severity: "error", message: "no file" },
      { code: "parse-failed", severity: "error", message: "y", file: "file:a.ts", line: 2 },
      { code: "parse-failed", severity: "error", message: "a", file: "file:a.ts", line: 2 },
      {
        code: "syntax-error",
        severity: "error",
        message: "c",
        file: "file:a.ts",
        line: 1,
        column: 9,
      },
    ];
    expect(sortDiagnostics(diagnostics).map((diagnostic) => diagnostic.message)).toEqual([
      "no file",
      "c",
      "a",
      "y",
      "x",
      "b",
    ]);
    expect(compareDiagnostics(diagnostics[0]!, diagnostics[0]!)).toBe(0);
  });

  it("describes thrown values", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("text")).toBe("text");
    expect(errorMessage({ code: 1 })).toBe('{"code":1}');
    expect(errorMessage(undefined)).toBe("unknown error");
  });
});
