import type { AdapterProject, ParseInput, ProjectContext } from "@katedrala/plugin-api";
import { describe, expect, it, vi } from "vitest";
import {
  TYPESCRIPT_ADAPTER_ID,
  TYPESCRIPT_ADAPTER_VERSION,
  createTypeScriptAdapter,
} from "./adapter.js";
import {
  DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS,
  TypeScriptAdapterOptionsError,
  resolveTypeScriptAdapterOptions,
} from "./options.js";
import { createAdapter } from "./worker.js";

const { createTypeScriptProject, fakeProject } = vi.hoisted(() => {
  const project: AdapterProject = {
    packages: [],
    entryPoints: [],
    configurationFiles: [],
    resolve: () => ({ status: "unresolved", reason: "fake" }),
  };
  return { fakeProject: project, createTypeScriptProject: vi.fn(() => Promise.resolve(project)) };
});

vi.mock("./project/index.js", () => ({ createTypeScriptProject }));

const SOURCE = `
  import express from "express";
  export function register(app) { app.get("/users", (req, res) => res.json([])); }
  export const server = express();
`;

async function run(
  adapter: ReturnType<typeof createTypeScriptAdapter>,
  path: string,
  text: string,
) {
  const detection = adapter.detect({ path });
  if (detection === undefined) throw new Error(`unsupported ${path}`);
  const input: ParseInput = {
    path,
    text,
    language: detection.language,
    ...(detection.dialect === undefined ? {} : { dialect: detection.dialect }),
  };
  return adapter.extract(await adapter.parse(input), input);
}

describe("createTypeScriptAdapter", () => {
  it("describes the adapter", () => {
    const adapter = createTypeScriptAdapter();
    expect(adapter.id).toBe(TYPESCRIPT_ADAPTER_ID);
    expect(adapter.id).toBe("typescript");
    expect(adapter.version).toBe(TYPESCRIPT_ADAPTER_VERSION);
    expect(adapter.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(adapter.displayName).toBe("TypeScript & JavaScript");
    expect(adapter.languages.map((language) => [language.id, language.extensions])).toEqual([
      ["typescript", [".ts", ".tsx", ".mts", ".cts"]],
      ["javascript", [".js", ".jsx", ".mjs", ".cjs"]],
    ]);
  });

  it("points workers at the worker module next to the adapter", () => {
    const url = new URL(createTypeScriptAdapter().workerModule ?? "");
    expect(url.protocol).toBe("file:");
    expect(url.pathname.endsWith("/worker.js")).toBe(true);
  });

  it("exposes resolved, cloneable options", () => {
    expect(createTypeScriptAdapter().options).toEqual(DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    const adapter = createTypeScriptAdapter({ recordUntypedCalls: false });
    expect(adapter.options).toEqual({ recordUntypedCalls: false });
    expect(structuredClone(adapter.options)).toEqual(adapter.options);
  });

  it("rejects invalid options", () => {
    expect(() => createTypeScriptAdapter({ unknown: true } as never)).toThrow(
      TypeScriptAdapterOptionsError,
    );
    expect(() => createTypeScriptAdapter({ recordUntypedCalls: "yes" } as never)).toThrow(
      TypeScriptAdapterOptionsError,
    );
    expect(() => resolveTypeScriptAdapterOptions({ toString: true })).toThrow(
      TypeScriptAdapterOptionsError,
    );
    expect(() => resolveTypeScriptAdapterOptions([])).toThrow(TypeScriptAdapterOptionsError);
    expect(resolveTypeScriptAdapterOptions(null)).toEqual(DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
  });

  it("detects, parses and extracts through the adapter contract", async () => {
    const adapter = createTypeScriptAdapter();
    expect(adapter.detect({ path: "README.md" })).toBeUndefined();
    const extraction = await run(adapter, "src/server.ts", SOURCE);
    expect(extraction.moduleFormat).toBe("esm");
    expect(extraction.symbols.map((symbol) => symbol.localName)).toEqual(["register", "server"]);
    expect(extraction.references.map((reference) => reference.target.type)).toEqual([
      "parameter",
      "import",
    ]);
  });

  it("applies the recordUntypedCalls option", async () => {
    const extraction = await run(
      createTypeScriptAdapter({ recordUntypedCalls: false }),
      "src/server.ts",
      SOURCE,
    );
    expect(extraction.references.map((reference) => reference.target.type)).toEqual(["import"]);
  });

  it("is deterministic", async () => {
    const adapter = createTypeScriptAdapter();
    expect(await run(adapter, "src/server.ts", SOURCE)).toEqual(
      await run(adapter, "src/server.ts", SOURCE),
    );
  });

  it("delegates project setup to createTypeScriptProject", async () => {
    const adapter = createTypeScriptAdapter({ recordUntypedCalls: false });
    const context: ProjectContext = {
      files: [],
      hasFile: () => false,
      readText: () => Promise.resolve(undefined),
      readAncestorText: () => Promise.resolve(undefined),
      report: () => undefined,
    };
    await expect(adapter.createProject?.(context)).resolves.toBe(fakeProject);
    expect(createTypeScriptProject).toHaveBeenCalledWith(context, { recordUntypedCalls: false });
  });
});

describe("worker entry point", () => {
  it("creates an equivalent adapter from cloned options", async () => {
    const main = createTypeScriptAdapter({ recordUntypedCalls: false });
    const worker = createAdapter(structuredClone(main.options));
    expect(worker.id).toBe(main.id);
    expect(worker.version).toBe(main.version);
    expect(worker.options).toEqual(main.options);
    const input: ParseInput = {
      path: "src/a.ts",
      text: SOURCE,
      language: "typescript",
      dialect: "ts",
    };
    expect(await worker.extract(await worker.parse(input), input)).toEqual(
      await main.extract(await main.parse(input), input),
    );
  });

  it("validates options", () => {
    expect(createAdapter(undefined).options).toEqual(DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS);
    expect(() => createAdapter({ recordUntypedCalls: 1 })).toThrow(TypeScriptAdapterOptionsError);
  });
});
