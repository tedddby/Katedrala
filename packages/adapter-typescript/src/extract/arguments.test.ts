import type { ArgumentSummary, FileExtraction } from "@katedrala/plugin-api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectTypeScriptLanguage } from "../languages.js";
import { resolveTypeScriptAdapterOptions } from "../options.js";
import { hostOfUrl } from "./walker.js";
import { extractTypeScriptFile, parseTypeScriptFile } from "./index.js";

function extract(text: string, path = "src/sample.ts"): FileExtraction {
  const detection = detectTypeScriptLanguage(path);
  if (detection === undefined) throw new Error(`unsupported path ${path}`);
  const parsed = parseTypeScriptFile({ path, text, ...detection });
  return extractTypeScriptFile(parsed, resolveTypeScriptAdapterOptions(undefined));
}

/** Summaries of the arguments of `register(...)` calls in a snippet. */
function argumentsOf(expressions: string): ArgumentSummary[] {
  const extraction = extract(
    `import { register, value, ns } from "./deps";\nregister(${expressions});\n`,
  );
  const call = extraction.references.find(
    (reference) =>
      reference.kind === "call" &&
      reference.target.type === "import" &&
      reference.target.local === "register",
  );
  if (call?.arguments === undefined) throw new Error("no register call");
  return call.arguments;
}

const imported = (local: string, ...members: string[]) => ({
  type: "import" as const,
  local,
  members,
});

describe("argument summaries", () => {
  it("summarizes literals", () => {
    // Eleven arguments: only the first eight are summarized.
    expect(
      argumentsOf(`"text", 'single', \`plain\`, 42, -1.5, +7, 0x10, 1_000, true, false, null`),
    ).toEqual([
      { type: "string", value: "text" },
      { type: "string", value: "single" },
      { type: "string", value: "plain" },
      { type: "number", value: 42 },
      { type: "number", value: -1.5 },
      { type: "number", value: 7 },
      { type: "number", value: 16 },
      { type: "number", value: 1000 },
    ]);
  });

  it("summarizes booleans and null", () => {
    expect(argumentsOf("true, false, null, undefined")).toEqual([
      { type: "boolean", value: true },
      { type: "boolean", value: false },
      { type: "null" },
      { type: "other" },
    ]);
  });

  it("summarizes templates with placeholders", () => {
    expect(argumentsOf("`/users/${id}/orders/${value.x}`")).toEqual([
      {
        type: "template",
        text: "/users/${…}/orders/${…}",
        substitutions: [
          { type: "reference", target: { type: "name", name: "id", members: [] } },
          { type: "reference", target: imported("value", "x") },
        ],
      },
    ]);
  });

  it("summarizes functions with the result of expression-bodied arrows", () => {
    expect(
      argumentsOf("() => value, function named() { return 1; }, async (x) => { await x; }"),
    ).toEqual([
      {
        type: "function",
        range: { start: { line: 2, column: 10 }, end: { line: 2, column: 21 } },
        returns: { type: "reference", target: imported("value") },
      },
      { type: "function", range: { start: { line: 2, column: 23 }, end: { line: 2, column: 53 } } },
      { type: "function", range: { start: { line: 2, column: 55 }, end: { line: 2, column: 80 } } },
    ]);
  });

  it("summarizes objects with computed keys, shorthand, spreads and methods", () => {
    expect(
      argumentsOf(
        `{ path: "/x", [value]: 1, ["lit"]: 2, value, ...ns, handle() {}, get size() { return 1; }, "quoted-key": null }`,
      ),
    ).toEqual([
      {
        type: "object",
        properties: [
          { key: "path", value: { type: "string", value: "/x" } },
          { key: "[value]", value: { type: "number", value: 1 } },
          { key: "lit", value: { type: "number", value: 2 } },
          { key: "value", value: { type: "reference", target: imported("value") } },
          {
            key: "...",
            value: { type: "spread", argument: { type: "reference", target: imported("ns") } },
          },
          {
            key: "handle",
            value: {
              type: "function",
              range: { start: { line: 2, column: 62 }, end: { line: 2, column: 73 } },
            },
          },
          {
            key: "size",
            value: {
              type: "function",
              range: { start: { line: 2, column: 75 }, end: { line: 2, column: 99 } },
            },
          },
          { key: "quoted-key", value: { type: "null" } },
        ],
      },
    ]);
  });

  it("summarizes arrays, spreads, calls and references", () => {
    expect(
      argumentsOf(
        "[1, value], ...rest, ns.make(1), ns.member, (value as any), require('./mod'), other()(), new value()",
      ),
    ).toEqual([
      {
        type: "array",
        length: 2,
        elements: [
          { type: "number", value: 1 },
          { type: "reference", target: imported("value") },
        ],
      },
      {
        type: "spread",
        argument: { type: "reference", target: { type: "name", name: "rest", members: [] } },
      },
      { type: "call", callee: imported("ns", "make"), arguments: [{ type: "number", value: 1 }] },
      { type: "reference", target: imported("ns", "member") },
      { type: "reference", target: imported("value") },
      { type: "reference", target: { type: "module", specifier: "./mod", members: [] } },
      { type: "other" },
      { type: "other" },
    ]);
  });

  it("bounds arguments, arrays, objects, strings and depth", () => {
    const many = Array.from({ length: 12 }, (_, index) => String(index)).join(", ");
    expect(argumentsOf(many)).toHaveLength(8);
    const array = argumentsOf(`[${Array.from({ length: 40 }, (_, index) => index).join(", ")}]`)[0];
    expect(array).toMatchObject({ type: "array", length: 40 });
    expect(array?.type === "array" ? array.elements : []).toHaveLength(16);
    const object = argumentsOf(
      `{ ${Array.from({ length: 40 }, (_, index) => `k${index}: ${index}`).join(", ")} }`,
    )[0];
    expect(object?.type === "object" ? object.properties : []).toHaveLength(32);
    const text = argumentsOf(`"${"y".repeat(500)}"`)[0];
    expect(text?.type === "string" ? text.value : "").toHaveLength(200);
    expect(argumentsOf("[[[[[1]]]]], [[[1]]]")).toEqual([
      {
        type: "array",
        length: 1,
        elements: [
          {
            type: "array",
            length: 1,
            elements: [{ type: "array", length: 1, elements: [{ type: "other" }] }],
          },
        ],
      },
      {
        type: "array",
        length: 1,
        elements: [
          {
            type: "array",
            length: 1,
            elements: [{ type: "array", length: 1, elements: [{ type: "number", value: 1 }] }],
          },
        ],
      },
    ]);
  });

  it("respects every bound for arbitrary nested literals (property)", () => {
    const literal: fc.Memo<string> = fc.memo((depth) =>
      depth <= 1
        ? fc.oneof(
            fc.integer({ min: -1000, max: 1000 }).map(String),
            fc.string({ maxLength: 300 }).map((text) => JSON.stringify(text)),
            fc.constantFrom("true", "false", "null", "value", "ns.member"),
          )
        : fc.oneof(
            literal(depth - 1),
            fc.array(literal(depth - 1), { maxLength: 24 }).map((items) => `[${items.join(", ")}]`),
            fc
              .array(fc.tuple(fc.stringMatching(/^[a-z]{1,6}$/), literal(depth - 1)), {
                maxLength: 40,
              })
              .map(
                (entries) =>
                  `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${item}`).join(", ")} }`,
              ),
          ),
    );
    const check = (summary: ArgumentSummary, depth: number): void => {
      expect(depth).toBeLessThanOrEqual(4);
      switch (summary.type) {
        case "string":
          expect(summary.value.length).toBeLessThanOrEqual(200);
          break;
        case "array":
          expect(summary.elements.length).toBeLessThanOrEqual(16);
          expect(summary.elements.length).toBeLessThanOrEqual(summary.length);
          for (const element of summary.elements) check(element, depth + 1);
          break;
        case "object":
          expect(summary.properties.length).toBeLessThanOrEqual(32);
          for (const property of summary.properties) {
            expect(property.key.length).toBeLessThanOrEqual(200);
            check(property.value, depth + 1);
          }
          break;
        case "boolean":
        case "call":
        case "function":
        case "null":
        case "number":
        case "other":
        case "reference":
        case "spread":
        case "template":
          break;
      }
    };
    fc.assert(
      fc.property(fc.array(literal(6), { maxLength: 12 }), (items) => {
        const summaries = argumentsOf(items.join(", "));
        expect(summaries.length).toBe(Math.min(items.length, 8));
        for (const summary of summaries) check(summary, 1);
      }),
      { numRuns: 60 },
    );
  });
});

describe("hosts of absolute URLs", () => {
  it.each([
    ["https://api.stripe.com/v1/charges", "api.stripe.com"],
    ["http://localhost:3000/x", "localhost:3000"],
    ["https://user:secret@Example.COM/path", "example.com"],
    ["wss://socket.example.org", "socket.example.org"],
    ["/relative/path", undefined],
    ["https://${host}/x", undefined],
    ["${base}/x", undefined],
    ["https:///nohost", undefined],
  ])("host of %s is %s", (url, host) => {
    expect(hostOfUrl(url)).toBe(host);
  });
});
