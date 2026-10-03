import { EMPTY_DIGEST } from "@katedrala/ir";
import type {
  AdapterProject,
  FileExtraction,
  LanguageAdapter,
  ProjectContext,
  SourceEntry,
} from "@katedrala/plugin-api";
import { describe, expect, it, vi } from "vitest";
import { initializeAdapter } from "../extraction/adapters.js";
import { InMemorySource, type InMemorySourceOptions } from "../sources/in-memory.js";
import { contentHash, digestOf } from "../text/text.js";
import { prepareProjects } from "./prepare.js";

const EMPTY_EXTRACTION: FileExtraction = {
  moduleFormat: "esm",
  syntaxErrors: [],
  symbols: [],
  imports: [],
  exports: [],
  references: [],
  facts: [],
};

/** What the fake adapter observed of its context. */
interface Observation {
  files: readonly SourceEntry[];
  subdirectory: string | undefined;
  manifest: string | undefined;
  missing: string | undefined;
  unlisted: string | undefined;
  binary: string | undefined;
  base: string | undefined;
  escaping: string | undefined;
  hasManifest: boolean;
}

function projectAdapter(
  id: string,
  options: {
    /** `null`: the adapter has no `createProject`. */
    createProject?: ((context: ProjectContext) => Promise<AdapterProject>) | null;
    init?: () => Promise<void>;
  } = {},
): LanguageAdapter & { observations: Observation[] } {
  const observations: Observation[] = [];
  const adapter: LanguageAdapter & { observations: Observation[] } = {
    id,
    version: "1.0.0",
    displayName: id,
    languages: [],
    observations,
    ...(options.init === undefined ? {} : { init: options.init }),
    detect: () => undefined,
    parse: () => undefined,
    extract: () => EMPTY_EXTRACTION,
  };
  if (options.createProject === null) return adapter;
  return {
    ...adapter,
    createProject:
      options.createProject ??
      (async (context) => {
        observations.push({
          files: context.files,
          subdirectory: context.subdirectory,
          manifest: await context.readText("package.json"),
          missing: await context.readText("tsconfig.json"),
          unlisted: await context.readText("node_modules/x/package.json"),
          binary: await context.readText("logo.png"),
          base: await context.readAncestorText("tsconfig.base.json"),
          escaping: await context.readAncestorText("../secret"),
          hasManifest: context.hasFile("package.json"),
        });
        context.report({
          code: "invalid-project-configuration",
          severity: "warning",
          message: "tsconfig.json not found",
          file: "file:package.json",
        });
        return {
          packages: [
            { name: "app", ecosystem: "npm", path: "", manifest: "package.json", dependencies: [] },
          ],
          entryPoints: [],
          configurationFiles: ["package.json", "./tsconfig.json"],
          resolve: () => ({ status: "unresolved", reason: "not implemented in the fake" }),
        };
      }),
  };
}

function source(overrides: Partial<InMemorySourceOptions> = {}): InMemorySource {
  return new InMemorySource({
    files: {
      "package.json": '{\r\n  "name": "app"\r\n}\r\n',
      "src/index.ts": "export {};\n",
      "logo.png": Uint8Array.of(0x89, 0x50, 0x00, 0x01),
    },
    subdirectory: "apps/web",
    ancestors: { "tsconfig.base.json": "{}\n" },
    ...overrides,
  });
}

describe("prepareProjects", () => {
  it("gives adapters a read-only view of the snapshot and collects their projects", async () => {
    const snapshot = source();
    const adapter = projectAdapter("fake");
    const result = await prepareProjects(snapshot, await snapshot.list(), [adapter]);

    expect(result.projects.map((prepared) => prepared.adapterId)).toEqual(["fake"]);
    expect(result.projects[0]?.project.packages[0]?.name).toBe("app");
    const [observed] = adapter.observations;
    expect(observed).toEqual({
      files: [
        { path: "logo.png", size: 4 },
        { path: "package.json", size: 23 },
        { path: "src/index.ts", size: 11 },
      ],
      subdirectory: "apps/web",
      manifest: '{\n  "name": "app"\n}\n',
      missing: undefined,
      unlisted: undefined,
      binary: undefined,
      base: "{}\n",
      escaping: undefined,
      hasManifest: true,
    });
    expect(Object.isFrozen(observed?.files)).toBe(true);
    expect(result.diagnostics).toEqual([
      {
        code: "invalid-project-configuration",
        severity: "warning",
        message: "tsconfig.json not found",
        file: "file:package.json",
      },
    ]);
  });

  it("digests the configuration files projects read and the ancestor files read", async () => {
    const snapshot = source();
    const result = await prepareProjects(snapshot, await snapshot.list(), [projectAdapter("fake")]);
    // Sorted lines: ancestors are written with a leading "/" (relative to the top level); the escaping
    // ancestor path "../secret" is never read and does not appear; a missing file has the hash "-".
    const expected = digestOf([
      `/tsconfig.base.json\t${contentHash("{}\n")}`,
      `package.json\t${contentHash('{\n  "name": "app"\n}\n')}`,
      "tsconfig.json\t-",
    ]);
    expect(result.projectConfigurationDigest).toBe(expected);
  });

  it("changes the digest only when configuration content changes", async () => {
    const digest = async (snapshot: InMemorySource): Promise<string> =>
      (await prepareProjects(snapshot, await snapshot.list(), [projectAdapter("fake")]))
        .projectConfigurationDigest;
    const base = await digest(source());
    // Line endings do not matter (text is normalized); unrelated files do not matter.
    expect(
      await digest(
        source({
          files: {
            "package.json": '{\n  "name": "app"\n}\n',
            "src/index.ts": "export const changed = 1;\n",
          },
        }),
      ),
    ).toBe(base);
    expect(await digest(source({ files: { "package.json": '{ "name": "renamed" }\n' } }))).not.toBe(
      base,
    );
    expect(
      await digest(source({ ancestors: { "tsconfig.base.json": '{ "strict": true }\n' } })),
    ).not.toBe(base);
    expect(await digest(source({ ancestors: {} }))).not.toBe(base);
    expect(
      await digest(source({ files: { "package.json": "{}", "tsconfig.json": "{}" } })),
    ).not.toBe(await digest(source({ files: { "package.json": "{}" } })));
  });

  it("isolates failing adapters and skips adapters without projects", async () => {
    const snapshot = source();
    const failing = projectAdapter("failing", {
      createProject: () => Promise.reject(new Error("manifest exploded")),
    });
    const uninitialized = projectAdapter("uninitialized", {
      init: () => Promise.reject(new Error("no grammar")),
    });
    const without = projectAdapter("plain", { createProject: null });
    const working = projectAdapter("working");
    const result = await prepareProjects(snapshot, await snapshot.list(), [
      failing,
      uninitialized,
      without,
      working,
    ]);
    expect(result.projects.map((prepared) => prepared.adapterId)).toEqual(["working"]);
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message])).toEqual([
      ["plugin-error", 'Adapter "failing" could not prepare its project: manifest exploded'],
      ["plugin-error", 'Adapter "uninitialized" could not be initialized: no grammar'],
      ["invalid-project-configuration", "tsconfig.json not found"],
    ]);
  });

  it("initializes each adapter once, shared with extraction", async () => {
    const init = vi.fn(() => Promise.resolve());
    const adapter = projectAdapter("fake", { init });
    await initializeAdapter(adapter);
    const snapshot = source();
    await prepareProjects(snapshot, await snapshot.list(), [adapter]);
    await prepareProjects(snapshot, await snapshot.list(), [adapter]);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("reads each file once even when several adapters ask", async () => {
    const snapshot = source();
    const read = vi.spyOn(snapshot, "read");
    const readAncestor = vi.spyOn(snapshot, "readAncestor");
    await prepareProjects(snapshot, await snapshot.list(), [
      projectAdapter("a"),
      projectAdapter("b"),
    ]);
    expect(read.mock.calls.filter(([path]) => path === "package.json")).toHaveLength(1);
    expect(readAncestor.mock.calls.filter(([path]) => path === "tsconfig.base.json")).toHaveLength(
      1,
    );
  });

  it("only serves the given entries", async () => {
    const snapshot = source();
    const adapter = projectAdapter("fake");
    await prepareProjects(
      snapshot,
      (await snapshot.list()).filter((entry) => entry.path !== "package.json"),
      [adapter],
    );
    expect(adapter.observations[0]).toMatchObject({ manifest: undefined, hasManifest: false });
  });

  it("has the empty digest when no adapter prepares a project", async () => {
    const snapshot = new InMemorySource({ files: { "package.json": "{}" } });
    const adapters = [projectAdapter("plain", { createProject: null })];
    expect(await prepareProjects(snapshot, await snapshot.list(), adapters)).toEqual({
      projects: [],
      diagnostics: [],
      projectConfigurationDigest: EMPTY_DIGEST,
    });
  });
});
