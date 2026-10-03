import { compareStrings, type FileRole } from "@katedrala/ir";
import type { FileExtraction, LanguageAdapter, SourceEntry } from "@katedrala/plugin-api";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveCoreSettings } from "../config/settings.js";
import { discoverFiles } from "./discover.js";
import { createPathMatcher, globPatternProblem } from "./globs.js";
import { builtinLanguageOf, isTextLikePath } from "./languages.js";
import { heuristicRole, isManifestName, packageRootsOf } from "./roles.js";

const EMPTY_EXTRACTION: FileExtraction = {
  moduleFormat: "esm",
  syntaxErrors: [],
  symbols: [],
  imports: [],
  exports: [],
  references: [],
  facts: [],
};

/** A minimal adapter claiming files by extension. */
function fakeAdapter(
  id: string,
  extensions: Record<string, { language: string; dialect?: string }>,
): LanguageAdapter {
  return {
    id,
    version: "1.0.0",
    displayName: id,
    languages: [],
    detect: ({ path }) => {
      const match = Object.entries(extensions).find(([extension]) => path.endsWith(extension));
      return match?.[1];
    },
    parse: () => undefined,
    extract: () => EMPTY_EXTRACTION,
  };
}

const typescript = fakeAdapter("typescript", {
  ".d.ts": { language: "typescript", dialect: "dts" },
  ".tsx": { language: "typescript", dialect: "tsx" },
  ".ts": { language: "typescript", dialect: "ts" },
  ".js": { language: "javascript", dialect: "esm" },
  ".json": { language: "json" },
});

describe("heuristicRole", () => {
  const roots = new Set(["", "packages/cli", "crates/core"]);
  const role = (path: string, claimed: boolean): FileRole =>
    heuristicRole(path, { claimed, packageRoots: roots });

  it.each<[string, boolean, FileRole]>([
    // declaration
    ["src/types.d.ts", true, "declaration"],
    ["lib/index.d.mts", true, "declaration"],
    ["lib/index.d.cts", true, "declaration"],
    ["src/styles.d.css.ts", true, "declaration"],
    ["src/__tests__/globals.d.ts", true, "declaration"],
    // test: directories
    ["src/__tests__/cart.ts", true, "test"],
    ["test/unit/cart.ts", true, "test"],
    ["tests/conftest.py", false, "test"],
    ["spec/models/user_spec.rb", false, "test"],
    ["specs/a.ts", true, "test"],
    ["e2e/login.ts", true, "test"],
    ["src/__mocks__/fs.ts", true, "test"],
    ["cypress/support/commands.ts", true, "test"],
    ["playwright/pages/home.ts", true, "test"],
    ["Tests/AppTests/AppTests.swift", false, "test"],
    ["src/__snapshots__/a.test.ts.snap", false, "test"],
    ["src/__fixtures__/order.json", false, "test"],
    ["pkg/testdata/input.txt", false, "test"],
    ["test/fixtures/package.json", true, "test"],
    ["test/fixtures/repo/tsconfig.json", true, "test"],
    // test: names
    ["src/cart.test.ts", true, "test"],
    ["src/cart.spec.tsx", true, "test"],
    ["src/app.e2e.ts", true, "test"],
    ["src/app.e2e-spec.ts", true, "test"],
    ["src/Button.stories.tsx", true, "test"],
    ["jest.setup.ts", true, "test"],
    ["src/setupTests.js", true, "test"],
    ["pkg/server_test.go", false, "test"],
    ["app/test_models.py", false, "test"],
    ["app/models_test.py", false, "test"],
    ["app/conftest.py", false, "test"],
    ["lib/user_spec.rb", false, "test"],
    // not tests
    ["fixtures/simple/src/index.ts", true, "source"],
    ["src/testing.ts", true, "source"],
    ["src/latest.ts", true, "source"],
    ["src/contest/entry.ts", true, "source"],
    // configuration
    ["package.json", true, "configuration"],
    ["packages/api/package.json", true, "configuration"],
    ["tsconfig.json", true, "configuration"],
    ["tsconfig.build.json", true, "configuration"],
    ["packages/api/tsconfig.base.json", true, "configuration"],
    ["jsconfig.json", true, "configuration"],
    ["vite.config.ts", true, "configuration"],
    ["eslint.config.js", true, "configuration"],
    ["jest.config.cjs", true, "configuration"],
    ["katedrala.config.json", true, "configuration"],
    ["katedrala.config.yaml", false, "configuration"],
    [".katedrala.yml", false, "configuration"],
    [".eslintrc", false, "configuration"],
    [".eslintrc.json", true, "configuration"],
    [".prettierrc.yaml", false, "configuration"],
    [".babelrc", false, "configuration"],
    ["babel.config.json", true, "configuration"],
    ["pnpm-workspace.yaml", false, "configuration"],
    ["lerna.json", true, "configuration"],
    ["nx.json", true, "configuration"],
    ["turbo.json", true, "configuration"],
    ["nest-cli.json", true, "configuration"],
    ["Dockerfile", false, "configuration"],
    ["docker/Dockerfile.dev", false, "configuration"],
    ["api.dockerfile", false, "configuration"],
    ["docker-compose.yml", false, "configuration"],
    ["docker-compose.override.yaml", false, "configuration"],
    ["compose.yaml", false, "configuration"],
    [".github/workflows/ci.yml", false, "configuration"],
    [".github/CODEOWNERS", false, "configuration"],
    [".gitlab-ci.yml", false, "configuration"],
    [".vscode/settings.json", true, "configuration"],
    ["Makefile", false, "configuration"],
    [".gitignore", false, "configuration"],
    [".editorconfig", false, "configuration"],
    [".env", false, "configuration"],
    [".env.local", false, "configuration"],
    ["Cargo.toml", false, "configuration"],
    ["go.mod", false, "configuration"],
    ["pyproject.toml", false, "configuration"],
    ["src/App/App.csproj", false, "configuration"],
    ["src/dockerfileParser.ts", true, "source"],
    ["src/docker-compose-helper.ts", true, "source"],
    // script
    ["scripts/release.mjs", false, "script"],
    ["scripts/build.ts", true, "script"],
    ["packages/api/scripts/seed.ts", true, "script"],
    ["bin/katedrala.js", true, "script"],
    ["packages/cli/bin/run.js", true, "script"],
    ["packages/cli/src/bin/run.ts", true, "source"],
    ["crates/core/src/bin/tool.rs", false, "other"],
    ["packages/web/bin/x.js", true, "source"],
    // generated
    ["src/generated/client.ts", true, "generated"],
    ["src/__generated__/schema.ts", true, "generated"],
    ["src/api.generated.ts", true, "generated"],
    ["pkg/schema.gen.go", false, "generated"],
    ["pkg/service.pb.go", false, "generated"],
    ["proto/msg_pb2.py", false, "generated"],
    ["pnpm-lock.yaml", false, "generated"],
    ["package-lock.json", true, "generated"],
    ["yarn.lock", false, "generated"],
    ["go.sum", false, "generated"],
    // vendored
    ["vendor/github.com/x/y.go", false, "vendored"],
    ["third_party/zlib/zlib.h", false, "vendored"],
    ["src/third-party/chart.js", true, "vendored"],
    ["public/jquery.min.js", true, "vendored"],
    ["styles/bootstrap.min.css", false, "vendored"],
    ["vendor/README.md", false, "vendored"],
    // documentation
    ["README.md", false, "documentation"],
    ["docs/guide.mdx", false, "documentation"],
    ["docs/index.rst", false, "documentation"],
    ["docs/manual.adoc", false, "documentation"],
    ["LICENSE", false, "documentation"],
    ["LICENSE-MIT", false, "documentation"],
    ["LICENCE.txt", false, "documentation"],
    ["CHANGELOG", false, "documentation"],
    ["NOTICE", false, "documentation"],
    ["src/license.ts", true, "source"],
    ["src/history.ts", true, "source"],
    // assets
    ["public/logo.svg", false, "asset"],
    ["assets/photo.JPG", false, "asset"],
    ["fonts/inter.woff2", false, "asset"],
    ["media/intro.mp4", false, "asset"],
    ["sounds/ding.wav", false, "asset"],
    // data
    ["data/countries.json", true, "data"],
    ["config/default.yaml", false, "data"],
    ["seed/users.csv", false, "data"],
    ["schema.xml", false, "data"],
    ["settings.toml", false, "data"],
    // source and other
    ["src/index.ts", true, "source"],
    ["src/payments/payment.service.ts", true, "source"],
    ["tools/run.py", false, "other"],
    ["Procfile.example", false, "other"],
    ["notes.txt", false, "other"],
  ])("classifies %s (claimed: %s) as %s", (path, claimed, expected) => {
    expect(role(path, claimed)).toBe(expected);
  });

  it("finds package roots from manifests", () => {
    expect(
      [
        ...packageRootsOf([
          "package.json",
          "packages/a/package.json",
          "crates/b/Cargo.toml",
          "src/x.ts",
          "App/App.csproj",
        ]),
      ].sort(compareStrings),
    ).toEqual(["", "App", "crates/b", "packages/a"]);
    expect(isManifestName("Gemfile")).toBe(true);
    expect(isManifestName("package-lock.json")).toBe(false);
  });
});

describe("createPathMatcher", () => {
  it("matches globs against paths and their ancestor directories", () => {
    const matches = createPathMatcher([
      "dist",
      "src/**/*.test.ts",
      ".github/**",
      "*.config.{js,ts}",
    ]);
    expect(matches("dist/a/b.js")).toBe(true);
    expect(matches("dist")).toBe(true);
    expect(matches("distribution/a.js")).toBe(false);
    expect(matches("src/a/b.test.ts")).toBe(true);
    expect(matches("src/a/b.ts")).toBe(false);
    expect(matches(".github/workflows/ci.yml")).toBe(true);
    expect(matches("vite.config.ts")).toBe(true);
    expect(matches("src/vite.config.ts")).toBe(false);
  });

  it("treats `dir`, `dir/` and `dir/**` alike and ignores a leading ./", () => {
    for (const pattern of ["build", "build/", "build/**", "./build", "./build/**"]) {
      const matches = createPathMatcher([pattern]);
      expect(matches("build/x/y.js")).toBe(true);
      expect(matches("src/build/x.js")).toBe(false);
    }
    expect(createPathMatcher(["**/build"])("src/build/x.js")).toBe(true);
  });

  it("applies negated patterns to the whole list", () => {
    const matches = createPathMatcher(["src/**", "!src/generated", "!**/*.snap"]);
    expect(matches("src/a.ts")).toBe(true);
    expect(matches("src/generated/a.ts")).toBe(false);
    expect(matches("src/a.snap")).toBe(false);
    expect(matches("lib/a.ts")).toBe(false);
    const onlyNegative = createPathMatcher(["!test/**"]);
    expect(onlyNegative("src/a.ts")).toBe(true);
    expect(onlyNegative("test/a.ts")).toBe(false);
    // `!(...)` is an extglob ("anything but"), not a list-wide exclusion.
    const extglob = createPathMatcher(["src/!(legacy)/**"]);
    expect(extglob("src/app/a.ts")).toBe(true);
    expect(extglob("src/legacy/a.ts")).toBe(false);
    expect(createPathMatcher(["!(*.md)"])("a.ts")).toBe(true);
    expect(createPathMatcher(["!(*.md)"])("a.md")).toBe(false);
  });

  it("rejects patterns that name the root, start with / or do not compile, with a clear message", () => {
    for (const [pattern, message] of [
      ["./", '"./" names the analysis root itself; write "**" to match every file'],
      [".", '"." names the analysis root itself; write "**" to match every file'],
      ["/", '"/" names the analysis root itself; write "**" to match every file'],
      ["!", '"!" must be followed by a pattern (e.g. "!dist/**")'],
      [
        "/src/**",
        '"/src/**" can never match: patterns are relative to the analysis root, so write "src/**"',
      ],
    ] as const) {
      expect(globPatternProblem(pattern)).toBe(message);
      expect(() => createPathMatcher(["src/**", pattern])).toThrow(
        new TypeError(`Invalid glob pattern: ${message}`),
      );
    }
    // picomatch would silently turn these into patterns that match nothing.
    for (const pattern of ["a{", "src/!(", "src\\"]) {
      expect(globPatternProblem(pattern)).toMatch(/is not a valid glob pattern \(.+\)$/);
      expect(() => createPathMatcher([pattern])).toThrow(TypeError);
    }
    expect(globPatternProblem("x".repeat(70_000))).toMatch(/exceeds maximum allowed length/);
    for (const pattern of ["**", "./src/", "src//", "!dist", "!(*.md)", "{a,b}/**", "[ab]/x.ts"]) {
      expect(globPatternProblem(pattern)).toBeUndefined();
    }
  });

  it("matches dotfiles, is case-sensitive and treats backslashes as escapes on every platform", () => {
    expect(createPathMatcher(["**"])(".env")).toBe(true);
    expect(createPathMatcher(["src/*"])("src/.hidden")).toBe(true);
    expect(createPathMatcher(["SRC/**"])("src/a.ts")).toBe(false);
    expect(createPathMatcher(["src\\a.ts"])("src/a.ts")).toBe(false);
    expect(createPathMatcher([])("anything")).toBe(false);
  });
});

describe("languages", () => {
  it.each([
    ["src/a.ts", "typescript"],
    ["src/a.MJS", "javascript"],
    ["data.json", "json"],
    ["config.yml", "yaml"],
    ["README.md", "markdown"],
    ["styles.scss", "scss"],
    ["page.html", "html"],
    ["logo.svg", "svg"],
    ["app.py", "python"],
    ["Main.java", "java"],
    ["main.go", "go"],
    ["lib.rs", "rust"],
    ["Program.cs", "csharp"],
    ["App.kt", "kotlin"],
    ["App.swift", "swift"],
    ["app.rb", "ruby"],
    ["index.php", "php"],
    ["a.h", "c"],
    ["a.hpp", "cpp"],
    ["run.sh", "shell"],
    ["schema.sql", "sql"],
    ["schema.graphql", "graphql"],
    ["msg.proto", "protobuf"],
    ["Cargo.toml", "toml"],
    ["pom.xml", "xml"],
    ["notes.txt", "text"],
  ])("knows %s as %s", (path, language) => {
    expect(builtinLanguageOf(path)).toBe(language);
  });

  it("does not know other files", () => {
    expect(builtinLanguageOf("Dockerfile")).toBeUndefined();
    expect(builtinLanguageOf("image.png")).toBeUndefined();
    expect(builtinLanguageOf(".gitignore")).toBeUndefined();
  });

  it.each([
    ["src/a.ts", true],
    ["notes.txt", true],
    ["data.csv", true],
    ["Dockerfile", true],
    ["Makefile", true],
    ["LICENSE", true],
    ["LICENSE-MIT", true],
    [".gitignore", true],
    [".env.local", true],
    ["image.png", false],
    ["font.woff2", false],
    ["archive.zip", false],
    ["binary", false],
  ])("decides whether %s is text-like (%s)", (path, expected) => {
    expect(isTextLikePath(path)).toBe(expected);
  });
});

describe("discoverFiles", () => {
  const entries: SourceEntry[] = [
    { path: "README.md", size: 10 },
    { path: "package.json", size: 20 },
    { path: "src/index.ts", size: 30, objectId: "abc123" },
    { path: "src/view.tsx", size: 30 },
    { path: "src/types.d.ts", size: 30 },
    { path: "src/big.ts", size: 5000 },
    { path: "src/generated/api.ts", size: 30 },
    { path: "src/index.test.ts", size: 30 },
    { path: "vendor/lib.js", size: 30 },
    { path: "dist/index.js", size: 30 },
    { path: "docs/logo.png", size: 3000 },
    { path: "tools/run.py", size: 5000 },
    { path: "Dockerfile", size: 10 },
  ];
  const settings = resolveCoreSettings({ exclude: ["dist"], analysis: { max_file_size: 1000 } });

  it("selects, identifies and classifies files", () => {
    const files = discoverFiles(entries, settings, [typescript]);
    expect(files).toEqual([
      {
        path: "Dockerfile",
        size: 10,
        language: "unknown",
        role: "configuration",
        roleSource: "heuristic",
      },
      {
        path: "README.md",
        size: 10,
        language: "markdown",
        role: "documentation",
        roleSource: "heuristic",
      },
      {
        path: "docs/logo.png",
        size: 3000,
        language: "unknown",
        role: "asset",
        roleSource: "heuristic",
      },
      {
        path: "package.json",
        size: 20,
        language: "json",
        adapterId: "typescript",
        role: "configuration",
        roleSource: "heuristic",
      },
      {
        path: "src/big.ts",
        size: 5000,
        language: "typescript",
        dialect: "ts",
        adapterId: "typescript",
        role: "source",
        roleSource: "heuristic",
        skipReason: "file-too-large",
      },
      {
        path: "src/generated/api.ts",
        size: 30,
        language: "typescript",
        dialect: "ts",
        adapterId: "typescript",
        role: "generated",
        roleSource: "heuristic",
        skipReason: "generated",
      },
      {
        path: "src/index.test.ts",
        size: 30,
        language: "typescript",
        dialect: "ts",
        adapterId: "typescript",
        role: "test",
        roleSource: "heuristic",
      },
      {
        path: "src/index.ts",
        size: 30,
        objectId: "abc123",
        language: "typescript",
        dialect: "ts",
        adapterId: "typescript",
        role: "source",
        roleSource: "heuristic",
      },
      {
        path: "src/types.d.ts",
        size: 30,
        language: "typescript",
        dialect: "dts",
        adapterId: "typescript",
        role: "declaration",
        roleSource: "heuristic",
      },
      {
        path: "src/view.tsx",
        size: 30,
        language: "typescript",
        dialect: "tsx",
        adapterId: "typescript",
        role: "source",
        roleSource: "heuristic",
      },
      {
        path: "tools/run.py",
        size: 5000,
        language: "python",
        role: "other",
        roleSource: "heuristic",
      },
      {
        path: "vendor/lib.js",
        size: 30,
        language: "javascript",
        dialect: "esm",
        adapterId: "typescript",
        role: "vendored",
        roleSource: "heuristic",
        skipReason: "vendored",
      },
    ]);
  });

  it("applies include globs before anything else", () => {
    const files = discoverFiles(
      entries,
      resolveCoreSettings({ include: ["src"], exclude: ["**/*.test.ts"] }),
      [typescript],
    );
    expect(files.map((file) => file.path)).toEqual([
      "src/big.ts",
      "src/generated/api.ts",
      "src/index.ts",
      "src/types.d.ts",
      "src/view.tsx",
    ]);
  });

  it("lets configured roles override the heuristics, in FILE_ROLES order", () => {
    const configured = resolveCoreSettings({
      roles: {
        // `source` is checked before `generated`, so it wins for src/generated/api.ts.
        source: ["src/generated/**", "vendor/**"],
        generated: ["src/**"],
        documentation: ["Dockerfile"],
      },
    });
    const byPath = new Map(
      discoverFiles(entries, configured, [typescript]).map((file) => [file.path, file]),
    );
    expect(byPath.get("src/generated/api.ts")).toMatchObject({
      role: "source",
      roleSource: "configuration",
    });
    expect(byPath.get("src/generated/api.ts")?.skipReason).toBeUndefined();
    expect(byPath.get("vendor/lib.js")).toMatchObject({
      role: "source",
      roleSource: "configuration",
    });
    expect(byPath.get("src/index.ts")).toMatchObject({
      role: "generated",
      roleSource: "configuration",
      skipReason: "generated",
    });
    expect(byPath.get("Dockerfile")).toMatchObject({
      role: "documentation",
      roleSource: "configuration",
    });
    expect(byPath.get("package.json")).toMatchObject({
      role: "configuration",
      roleSource: "heuristic",
    });
  });

  it("uses the first adapter that claims a file", () => {
    const python = fakeAdapter("python", { ".py": { language: "python", dialect: "py3" } });
    const greedy = fakeAdapter("greedy", {
      ".ts": { language: "greedy" },
      ".py": { language: "greedy" },
    });
    const files = discoverFiles(entries, settings, [python, typescript, greedy]);
    expect(files.find((file) => file.path === "tools/run.py")).toMatchObject({
      adapterId: "python",
      language: "python",
      dialect: "py3",
      role: "source",
      skipReason: "file-too-large",
    });
    expect(files.find((file) => file.path === "src/index.ts")?.adapterId).toBe("typescript");
    const reversed = discoverFiles(entries, settings, [greedy, typescript]);
    expect(reversed.find((file) => file.path === "src/index.ts")).toMatchObject({
      adapterId: "greedy",
      language: "greedy",
    });
  });

  it("rejects adapters sharing an id", () => {
    expect(() => discoverFiles(entries, settings, [typescript, typescript])).toThrow(TypeError);
  });

  it("includes everything when the include list is empty", () => {
    const handMade = { ...settings, include: [] };
    expect(discoverFiles(entries, handMade, [typescript])).toEqual(
      discoverFiles(entries, settings, [typescript]),
    );
  });

  it("is deterministic and independent of input order", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(entries), (subset) => {
        const files = discoverFiles(subset, settings, [typescript]);
        const paths = files.map((file) => file.path);
        expect(paths).toEqual([...paths].sort(compareStrings));
        expect(discoverFiles([...subset].reverse(), settings, [typescript])).toEqual(files);
        for (const file of files)
          expect(subset.some((entry) => entry.path === file.path)).toBe(true);
        for (const file of files) {
          expect(file.skipReason === undefined || file.adapterId !== undefined).toBe(true);
        }
      }),
    );
  });
});
