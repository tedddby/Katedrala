import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseJsonWithPositions, type JsonNode } from "./json.js";

function parseWithJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

describe("parseJsonWithPositions", () => {
  it("parses exactly like JSON.parse for every JSON value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.constantFrom(undefined, 2, "\t"), (value, indent) => {
        const text = JSON.stringify(value, null, indent);
        const result = parseJsonWithPositions(text);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value).toEqual(JSON.parse(text));
      }),
    );
  });

  it("accepts and rejects the same inputs as JSON.parse", () => {
    const token = fc.constantFrom(
      "{",
      "}",
      "[",
      "]",
      ",",
      ":",
      '"',
      '"a"',
      '"\\u00e9"',
      '"\\x"',
      "\\",
      "0",
      "-",
      "1",
      ".",
      "5",
      "e",
      "E",
      "+",
      "true",
      "false",
      "null",
      "nul",
      " ",
      "\n",
      "\t",
      "\r",
      "\u0001",
      " ",
      "﻿",
    );
    fc.assert(
      fc.property(fc.array(token, { maxLength: 14 }), (tokens) => {
        const text = tokens.join("");
        const expected = parseWithJson(text);
        const actual = parseJsonWithPositions(text);
        expect(actual.ok).toBe(expected.ok);
        if (actual.ok && expected.ok) expect(actual.value).toEqual(expected.value);
      }),
      { numRuns: 2000 },
    );
  });

  it("handles escapes, numbers, duplicate keys and __proto__ like JSON.parse", () => {
    for (const text of [
      '"\\"\\\\\\/\\b\\f\\n\\r\\t\\u0041\\ud83d\\ude00\\ud800"',
      "-0",
      "1e400",
      "-12.5E-3",
      '{"a": 1, "a": 2, "b": 3}',
      '{"__proto__": {"polluted": true}}',
      "[[], {}, [{}]]",
    ]) {
      const result = parseJsonWithPositions(text);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual(JSON.parse(text));
    }
    const proto = parseJsonWithPositions('{"__proto__": {"polluted": true}}');
    expect(proto.ok && Object.keys(proto.value as object)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("records the line of every value and member key", () => {
    const text =
      '{\n  "name": "shop",\n  "analysis": {\n    "max_file_size": "big"\n  },\n  "include": [\n    "src/**",\n    7\n  ]\n}';
    const result = parseJsonWithPositions(text);
    if (!result.ok) throw new Error("expected valid JSON");
    const members = result.root.members;
    expect(result.root.line).toBe(1);
    expect(members?.get("name")).toMatchObject({ line: 2, keyLine: 2 });
    const analysis = members?.get("analysis");
    expect(analysis).toMatchObject({ line: 3, keyLine: 3 });
    expect(analysis?.members?.get("max_file_size")).toMatchObject({ line: 4, keyLine: 4 });
    const include = members?.get("include");
    expect(include?.elements?.map((node: JsonNode) => node.line)).toEqual([7, 8]);
  });

  it.each([
    ["", 1, 1, "Unexpected end of input"],
    ['{\n  "a": 1,\n}', 3, 1, "Expected a double-quoted property name"],
    ['{\n  "a" 1\n}', 2, 7, 'Expected ":" after a property name'],
    ["[1,\n 2\n 3]", 3, 2, 'Expected "," or "]" after an array element'],
    ['{"a": tru}', 1, 7, "Unexpected character"],
    ['"abc', 1, 5, "Unterminated string"],
    ['"a\nb"', 1, 3, "Unescaped control character in string"],
    ['"\\q"', 1, 2, "Invalid escape sequence in string"],
    ["01", 1, 2, "Unexpected character after the JSON value"],
    ["﻿{}", 1, 1, "Unexpected character"],
  ])("reports %j at line %i, column %i", (text, line, column, message) => {
    const result = parseJsonWithPositions(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.line).toBe(line);
      expect(result.column).toBe(column);
      expect(result.message).toContain(message);
    }
  });

  it("rejects pathologically deep nesting instead of overflowing the stack", () => {
    const result = parseJsonWithPositions(`${"[".repeat(100_000)}${"]".repeat(100_000)}`);
    expect(result).toMatchObject({ ok: false, message: "The document is nested too deeply" });
  });
});
