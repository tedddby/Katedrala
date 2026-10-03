import type { ExtractedFact, FileExtraction } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import { detectTypeScriptLanguage } from "../languages.js";
import { resolveTypeScriptAdapterOptions } from "../options.js";
import { extractTypeScriptFile, parseTypeScriptFile } from "./index.js";

function extract(text: string, path = "src/sample.ts"): FileExtraction {
  const detection = detectTypeScriptLanguage(path);
  if (detection === undefined) throw new Error(`unsupported path ${path}`);
  const parsed = parseTypeScriptFile({ path, text, ...detection });
  return extractTypeScriptFile(parsed, resolveTypeScriptAdapterOptions(undefined));
}

function factsOf(text: string, path?: string): Array<Omit<ExtractedFact, "line" | "column">> {
  return extract(text, path).facts.map(({ line: _line, column: _column, ...rest }) => rest);
}

const env = (name: string, from?: string) =>
  from === undefined
    ? { type: "environment-read" as const, attributes: { name } }
    : { type: "environment-read" as const, from, attributes: { name } };

describe("environment reads", () => {
  it("records process.env and import.meta.env reads", () => {
    expect(
      factsOf(`
        const port = process.env.PORT;
        const url = process.env["DATABASE_URL"];
        export function key() { return process.env.API_KEY ?? import.meta.env.VITE_KEY; }
        const list = process.env.PLUGINS?.split(",");
        const viaGlobal = globalThis.process.env.GLOBAL_FLAG;
      `),
    ).toEqual([
      env("PORT", "port"),
      env("DATABASE_URL", "url"),
      env("API_KEY", "key"),
      env("VITE_KEY", "key"),
      env("PLUGINS", "list"),
      env("GLOBAL_FLAG", "viaGlobal"),
    ]);
  });

  it("records destructured environment variables, each from the symbol its binding declares", () => {
    expect(
      factsOf('const { HOST, PORT: port = "80", ["MODE"]: mode, ...others } = process.env;'),
    ).toEqual([env("HOST", "HOST"), env("PORT", "port"), env("MODE", "mode")]);
    // Inside a function, the bindings are not symbols: the reads are the function's.
    expect(
      factsOf("export function load() { const { HOST } = process.env; return HOST; }"),
    ).toEqual([env("HOST", "load")]);
  });

  it("records environment reads assigned to CommonJS exports and exported as defaults", () => {
    expect(
      factsOf(
        [
          "exports.D = process.env.D;",
          'module.exports.E = process.env["E"];',
          "module.exports = { port: process.env.PORT, host: (process.env.HOST) };",
        ].join("\n"),
        "src/config.js",
      ),
    ).toEqual([env("D"), env("E"), env("PORT"), env("HOST")]);
    expect(
      factsOf('import { env } from "node:process";\nexport default env.MODE as string;\n'),
    ).toEqual([env("MODE")]);
  });

  it("follows locals and parameters that alias the environment", () => {
    expect(
      factsOf(
        `function loadConfig(env = process.env) {
           const vars = process.env;
           return { port: env.PORT, mode: vars.NODE_ENV };
         }`,
        "src/config.js",
      ),
    ).toEqual([env("PORT", "loadConfig"), env("NODE_ENV", "loadConfig")]);
  });

  it("recognizes imports of the process module", () => {
    expect(
      factsOf(`
        import process from "node:process";
        import { env } from "process";
        export const a = process.env.A;
        export const b = env.B;
      `),
    ).toEqual([env("A", "a"), env("B", "b")]);
  });

  it("ignores writes, non-literal keys and rebound process", () => {
    expect(
      factsOf(`
        process.env.WRITTEN = "1";
        const dynamic = process.env[name];
        function local(process: { env: Record<string, string> }) { return process.env.SHADOWED; }
      `),
    ).toEqual([]);
  });

  it("records the position of the read", () => {
    const facts = extract("const a =\n  process.env.X;\n").facts;
    expect(facts.map((fact) => [fact.line, fact.column])).toEqual([[2, 3]]);
  });
});

describe("HTTP requests", () => {
  it("records calls of the global fetch with URL, host and method", () => {
    expect(
      factsOf(`
        export async function charge(id: string) {
          await fetch("https://api.stripe.com/v1/charges", { method: "post", body: "x" });
          await fetch(\`https://api.example.com/orders/\${id}\`);
          await fetch("/relative");
          await fetch(url, { headers: {} });
          await fetch(request, options);
          await fetch("https://x.test", { ...defaults });
          await window.fetch("https://w.test/a", { method: verb });
        }
      `),
    ).toEqual([
      {
        type: "http-request",
        from: "charge",
        attributes: {
          client: "fetch",
          url: "https://api.stripe.com/v1/charges",
          host: "api.stripe.com",
          method: "POST",
        },
      },
      {
        type: "http-request",
        from: "charge",
        attributes: {
          client: "fetch",
          url: "https://api.example.com/orders/${…}",
          host: "api.example.com",
          method: "GET",
        },
      },
      {
        type: "http-request",
        from: "charge",
        attributes: { client: "fetch", url: "/relative", method: "GET" },
      },
      { type: "http-request", from: "charge", attributes: { client: "fetch", method: "GET" } },
      { type: "http-request", from: "charge", attributes: { client: "fetch" } },
      {
        type: "http-request",
        from: "charge",
        attributes: { client: "fetch", url: "https://x.test", host: "x.test" },
      },
      {
        type: "http-request",
        from: "charge",
        attributes: { client: "fetch", url: "https://w.test/a", host: "w.test" },
      },
    ]);
  });

  it("ignores locally bound fetch functions", () => {
    expect(
      factsOf(`
        import fetch from "node-fetch";
        export const a = fetch("https://a.test");
        function b(fetch: (url: string) => void) { fetch("https://b.test"); }
      `),
    ).toEqual([]);
  });
});
