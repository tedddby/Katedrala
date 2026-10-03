/**
 * File role heuristics (a Katedrala heuristic, not an established classification). Roles are decided from the
 * path alone; configuration (`roles` globs) overrides them, and generated-code markers in file content are
 * checked later, during extraction.
 *
 * Rules are tried in this order; the first match wins:
 *
 * | Role            | Matches                                                                  | Examples                                                         |
 * | --------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
 * | `declaration`   | `*.d.ts`, `*.d.mts`, `*.d.cts`, `*.d.<ext>.ts`                           | `src/types.d.ts`, `lib/index.d.mts`, `src/app.d.css.ts`          |
 * | `test`          | test directories; test file-name conventions                             | `src/__tests__/a.ts`, `test/fixtures/x.json`, `a.spec.ts`        |
 * | `configuration` | tool, build, CI and package-manager configuration                        | `package.json`, `tsconfig.build.json`, `.github/workflows/ci.yml` |
 * | `script`        | anything in a `scripts` directory; `bin` directly under a package root   | `scripts/release.mjs`, `packages/cli/bin/run.js`                 |
 * | `generated`     | `generated` / `__generated__` directories, generated names, lock files   | `src/__generated__/schema.ts`, `api.pb.go`, `pnpm-lock.yaml`     |
 * | `vendored`      | `vendor` / `third_party` / `third-party` directories, minified bundles   | `vendor/lib/x.go`, `public/jquery.min.js`                        |
 * | `documentation` | `.md`, `.mdx`, `.markdown`, `.rst`, `.adoc`; `LICENSE`, `CHANGELOG`, ... | `docs/guide.md`, `LICENSE`, `CHANGELOG.old`                      |
 * | `asset`         | images, fonts, audio, video                                              | `logo.svg`, `fonts/inter.woff2`, `intro.mp4`                     |
 * | `data`          | `.json`, `.yaml`, `.yml`, `.csv`, `.tsv`, `.toml`, `.xml`, JSON lines    | `data/countries.json`, `seed.csv`                                |
 * | `source`        | code claimed by a language adapter not matched above                     | `src/index.ts`                                                   |
 * | `other`         | everything else                                                          | `tools/run.py` without a Python adapter, `Procfile.example`      |
 */
import { baseName, extensionOf, parentPath, type FileRole } from "@katedrala/ir";

/** What the role heuristics know besides the path. */
export interface RoleHeuristicContext {
  /** Whether a language adapter claimed the file. */
  claimed: boolean;
  /** Package roots: directories containing a package manifest, plus the analysis root `""`. */
  packageRoots: ReadonlySet<string>;
}

/** Manifest file names marking a package root (lower-case), besides `*.csproj`, `*.fsproj` and `*.gemspec`. */
const MANIFEST_NAMES: ReadonlySet<string> = new Set([
  "package.json",
  "deno.json",
  "deno.jsonc",
  "cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "composer.json",
  "gemfile",
  "package.swift",
  "mix.exs",
  "pubspec.yaml",
]);

/** Whether a file name is a package manifest (`package.json`, `Cargo.toml`, `go.mod`, `*.csproj`, ...). */
export function isManifestName(name: string): boolean {
  const lower = name.toLowerCase();
  return MANIFEST_NAMES.has(lower) || /\.(?:csproj|fsproj|gemspec)$/.test(lower);
}

/** Package roots of a set of paths: `""` plus every directory that contains a package manifest. */
export function packageRootsOf(paths: Iterable<string>): Set<string> {
  const roots = new Set<string>([""]);
  for (const path of paths) if (isManifestName(baseName(path))) roots.add(parentPath(path));
  return roots;
}

// ─── declaration ─────────────────────────────────────────────────────────────

/** `types.d.ts`, `index.d.mts`, `index.d.cts`, and arbitrary-extension declarations such as `app.d.css.ts`. */
const DECLARATION_NAME = /\.d\.(?:ts|mts|cts|[^./]+\.ts)$/;

// ─── test ────────────────────────────────────────────────────────────────────

/**
 * Directory names (case-insensitive) whose contents are tests: `src/__tests__/a.ts`, `test/unit/a.ts`,
 * `tests/conftest.py`, `spec/models/user_spec.rb`, `e2e/login.ts`, `src/__mocks__/fs.ts`,
 * `cypress/support/commands.ts`, `playwright/pages/home.ts`, Swift's `Tests/AppTests/AppTests.swift`, Jest's
 * `__snapshots__` and `__fixtures__`, Go's `testdata`. A `fixtures` directory counts only below a test
 * directory (`test/fixtures/x.json` is a test file through `test`; a top-level `fixtures/a.ts` is not).
 */
const TEST_DIRECTORIES: ReadonlySet<string> = new Set([
  "__tests__",
  "test",
  "tests",
  "spec",
  "specs",
  "e2e",
  "__mocks__",
  "cypress",
  "playwright",
  "__snapshots__",
  "__fixtures__",
  "testdata",
]);

/**
 * Test file names (case-insensitive): `a.test.ts`, `a.spec.js`, `app.e2e.ts`, NestJS's `app.e2e-spec.ts`,
 * Storybook's `Button.stories.tsx`; test setup files `jest.setup.ts`, `vitest.setup.ts`, `setupTests.js`;
 * and the conventions of other languages: Go `x_test.go`, pytest `test_x.py`, `x_test.py` and `conftest.py`,
 * RSpec `x_spec.rb`.
 */
const TEST_NAME =
  /\.(?:test|spec|e2e|e2e-spec|stories)\.[^/]+$|^(?:jest|vitest)\.setup\.[^.]+$|^setuptests\.[^.]+$|_test\.go$|^test_[^/]*\.py$|_test\.py$|^conftest\.py$|_spec\.rb$/;

// ─── configuration ───────────────────────────────────────────────────────────

/**
 * Configuration files by exact name (case-insensitive): package manifests and workspace files
 * (`package.json`, `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, `Cargo.toml`, `go.mod`,
 * `pyproject.toml`, `pom.xml`, `build.gradle`, ...), build files (`Makefile`, `Dockerfile`), CI files
 * (`.gitlab-ci.yml`, `Jenkinsfile`), repository and editor settings (`.gitignore`, `.gitattributes`,
 * `.editorconfig`, `.npmrc`, `.nvmrc`), Katedrala's own configuration and framework CLI files
 * (`nest-cli.json`, `angular.json`).
 */
const CONFIGURATION_NAMES: ReadonlySet<string> = new Set([
  "package.json",
  "jsconfig.json",
  "deno.json",
  "deno.jsonc",
  "pnpm-workspace.yaml",
  "lerna.json",
  "nx.json",
  "turbo.json",
  "rush.json",
  "makefile",
  "gnumakefile",
  "containerfile",
  ".gitlab-ci.yml",
  "jenkinsfile",
  "procfile",
  "vercel.json",
  "netlify.toml",
  "renovate.json",
  "nest-cli.json",
  "angular.json",
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  ".node-version",
  ".yarnrc",
  ".yarnrc.yml",
  ".browserslistrc",
  ".dockerignore",
  ".prettierignore",
  ".eslintignore",
  "katedrala.config.yaml",
  "katedrala.config.yml",
  ".katedrala.yaml",
  ".katedrala.yml",
  "cargo.toml",
  "go.mod",
  "go.work",
  "pyproject.toml",
  "setup.py",
  "setup.cfg",
  "tox.ini",
  "pytest.ini",
  "mypy.ini",
  ".flake8",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.properties",
  "composer.json",
  "gemfile",
  ".rubocop.yml",
  "global.json",
  "nuget.config",
  "directory.build.props",
  "directory.build.targets",
  "package.swift",
]);

/**
 * Configuration files by name pattern (case-insensitive): `tsconfig.json`, `tsconfig.build.json`;
 * `*.config.{js,cjs,mjs,ts,cts,mts,json}` (`vite.config.ts`, `eslint.config.js`, `katedrala.config.json`);
 * `.eslintrc*`, `.prettierrc*`, `.babelrc*`, `.stylelintrc*`, `.swcrc`; `babel.config.*`;
 * `docker-compose*` and `compose.yaml`; `Dockerfile`, `Dockerfile.dev`, `api.dockerfile`; .NET project files;
 * `.env` files.
 */
const CONFIGURATION_NAME =
  /^tsconfig[^/]*\.json$|\.config\.(?:js|cjs|mjs|ts|cts|mts|json)$|^\.(?:eslintrc|prettierrc|babelrc|stylelintrc|swcrc)|^babel\.config\.|^docker-compose[^/]*\.ya?ml$|^compose\.ya?ml$|^dockerfile(?:\.[^/]*)?$|\.dockerfile$|\.(?:csproj|fsproj|vbproj|sln)$|^\.env(?:\.|$)/;

/** Directories holding CI and editor configuration: `.github/workflows/ci.yml`, `.vscode/settings.json`. */
const CONFIGURATION_DIRECTORIES: ReadonlySet<string> = new Set([
  ".github",
  ".gitlab",
  ".circleci",
  ".husky",
  ".devcontainer",
  ".vscode",
  ".idea",
]);

// ─── generated ───────────────────────────────────────────────────────────────

/** `src/generated/client.ts`, `src/__generated__/schema.graphql.ts`. */
const GENERATED_DIRECTORIES: ReadonlySet<string> = new Set(["generated", "__generated__"]);

/**
 * Generated names: `api.generated.ts`, `schema.gen.go`, protobuf output `service.pb.go`, `msg.pb.ts`,
 * `msg_pb2.py`, `msg_pb2_grpc.py`; and package-manager lock files (`package-lock.json`, `pnpm-lock.yaml`,
 * `yarn.lock`, `Cargo.lock`, `go.sum`, ...), which tools write.
 */
const GENERATED_NAME =
  /\.(?:generated|gen|pb)\.[^/]+$|_pb2(?:_grpc)?\.py$|^(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|deno\.lock|cargo\.lock|poetry\.lock|pipfile\.lock|uv\.lock|pdm\.lock|composer\.lock|gemfile\.lock|go\.sum|flake\.lock|packages\.lock\.json|gradle\.lockfile)$/;

// ─── vendored ────────────────────────────────────────────────────────────────

/** `vendor/github.com/x/y.go`, `third_party/zlib/zlib.h`, `src/third-party/chart.js`. */
const VENDORED_DIRECTORIES: ReadonlySet<string> = new Set(["vendor", "third_party", "third-party"]);

/** Minified bundles: `public/jquery.min.js`, `bootstrap.min.css`. */
const VENDORED_NAME = /\.min\.(?:js|mjs|cjs|css)$/;

// ─── documentation, assets, data ─────────────────────────────────────────────

const DOCUMENTATION_EXTENSIONS: ReadonlySet<string> = new Set([
  ".md",
  ".mdx",
  ".markdown",
  ".rst",
  ".adoc",
  ".asciidoc",
]);

/**
 * Project documents by (upper-case) name, for files no adapter claims: `LICENSE`, `LICENSE-MIT`,
 * `LICENCE.txt`, `CHANGELOG`, `README`, `NOTICE`, `COPYING`, `AUTHORS`, `CONTRIBUTORS`, `CONTRIBUTING`,
 * `CODE_OF_CONDUCT`, `SECURITY`.
 */
const DOCUMENTATION_NAME =
  /^(?:LICEN[CS]E|CHANGELOG|README|NOTICE|COPYING|AUTHORS|CONTRIBUTORS|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY)(?:[-_.].*)?$/;

/** Images, fonts, audio and video. */
const ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
  // Images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".ico",
  ".icns",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".svg",
  ".apng",
  // Fonts
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  // Audio
  ".mp3",
  ".wav",
  ".ogg",
  ".oga",
  ".flac",
  ".aac",
  ".m4a",
  ".opus",
  ".mid",
  ".midi",
  // Video
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".m4v",
  ".ogv",
  ".wmv",
  ".mpg",
  ".mpeg",
]);

const DATA_EXTENSIONS: ReadonlySet<string> = new Set([
  ".json",
  ".jsonc",
  ".json5",
  ".jsonl",
  ".ndjson",
  ".yaml",
  ".yml",
  ".csv",
  ".tsv",
  ".toml",
  ".xml",
]);

/** Whether some directory segment is a `bin` directory directly under a package root. */
function inPackageBin(directories: readonly string[], packageRoots: ReadonlySet<string>): boolean {
  for (const [index, directory] of directories.entries()) {
    if (directory === "bin" && packageRoots.has(directories.slice(0, index).join("/"))) return true;
  }
  return false;
}

/**
 * The heuristic role of a file (see the table at the top of this module). Directory names are compared
 * case-insensitively; paths are normalized IR paths.
 */
export function heuristicRole(path: string, context: RoleHeuristicContext): FileRole {
  const name = baseName(path);
  const lowerName = name.toLowerCase();
  const directories = path.split("/").slice(0, -1);
  const lowerDirectories = directories.map((directory) => directory.toLowerCase());
  const inDirectory = (names: ReadonlySet<string>): boolean =>
    lowerDirectories.some((directory) => names.has(directory));
  const extension = extensionOf(path);

  if (DECLARATION_NAME.test(lowerName)) return "declaration";
  if (inDirectory(TEST_DIRECTORIES) || TEST_NAME.test(lowerName)) return "test";
  if (
    CONFIGURATION_NAMES.has(lowerName) ||
    CONFIGURATION_NAME.test(lowerName) ||
    inDirectory(CONFIGURATION_DIRECTORIES)
  ) {
    return "configuration";
  }
  if (lowerDirectories.includes("scripts") || inPackageBin(directories, context.packageRoots)) {
    return "script";
  }
  if (inDirectory(GENERATED_DIRECTORIES) || GENERATED_NAME.test(lowerName)) return "generated";
  if (inDirectory(VENDORED_DIRECTORIES) || VENDORED_NAME.test(lowerName)) return "vendored";
  if (DOCUMENTATION_EXTENSIONS.has(extension)) return "documentation";
  if (!context.claimed && DOCUMENTATION_NAME.test(name)) return "documentation";
  if (ASSET_EXTENSIONS.has(extension)) return "asset";
  if (DATA_EXTENSIONS.has(extension)) return "data";
  return context.claimed ? "source" : "other";
}
