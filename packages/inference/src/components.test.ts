import {
  canonicalizeDocument,
  compareStrings,
  emptyDocument,
  isWithin,
  packageId,
  parentPath,
} from "@katedrala/ir";
import type { ComponentEntity, FileRole } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { inferComponents } from "./components.js";
import { prototypeModel, shuffledModel, syntheticModel } from "./test-support.js";
import type { SyntheticFileSpec, SyntheticModelSpec } from "./test-support.js";
import type { ComponentDraft } from "./types.js";

/** The default `inference.components.file_roles` (plan 5.3). */
const OWNED: ReadonlySet<FileRole> = new Set([
  "declaration",
  "generated",
  "script",
  "source",
  "test",
]);

function components(
  spec: SyntheticModelSpec,
  fileRoles: ReadonlySet<FileRole> = OWNED,
): ComponentDraft[] {
  return inferComponents({ model: syntheticModel(spec), fileRoles, repositoryName: "repository" });
}

/** A compact view: `id kind name direct/total`, in component order. */
function tree(drafts: readonly ComponentDraft[]): string[] {
  return drafts.map(
    (draft) =>
      `${draft.id} ${draft.kind} ${draft.name} ${draft.files.length}/${draft.totals.files}` +
      (draft.parent === undefined ? "" : ` < ${draft.parent}`),
  );
}

/** The source files of the clean-architecture fixture (§2.4). */
const CLEAN_ARCHITECTURE_FILES = [
  "src/application/borrow-book.ts",
  "src/application/dto.ts",
  "src/application/return-book.ts",
  "src/application/send-overdue-reminders.ts",
  "src/domain/index.ts",
  "src/domain/model/book.ts",
  "src/domain/model/errors.ts",
  "src/domain/model/loan.ts",
  "src/domain/model/member.ts",
  "src/domain/ports/book-repository.ts",
  "src/domain/ports/clock.ts",
  "src/domain/ports/loan-repository.ts",
  "src/domain/ports/member-repository.ts",
  "src/domain/ports/notifier.ts",
  "src/infrastructure/notifications/smtp-notifier.ts",
  "src/infrastructure/persistence/pool.ts",
  "src/infrastructure/persistence/sql-book-repository.ts",
  "src/infrastructure/persistence/sql-loan-repository.ts",
  "src/infrastructure/persistence/sql-member-repository.ts",
  "src/infrastructure/system-clock.ts",
  "src/main.ts",
  "src/presentation/http/error-mapper.ts",
  "src/presentation/http/http-types.ts",
  "src/presentation/http/loan-routes.ts",
  "src/presentation/http/server.ts",
];

/** The files of the monorepo fixture (§2.4), configuration files included. */
const MONOREPO_SPEC: SyntheticModelSpec = {
  files: [
    "packages/api/src/handlers/orders.ts",
    "packages/api/src/handlers/products.ts",
    "packages/api/src/routes.ts",
    "packages/api/src/server.ts",
    { path: "packages/api/tsconfig.json", role: "configuration" },
    "packages/core/src/catalog/catalog.ts",
    "packages/core/src/catalog/product.ts",
    "packages/core/src/index.ts",
    "packages/core/src/orders/order-service.ts",
    "packages/core/src/orders/order.ts",
    { path: "packages/core/tsconfig.json", role: "configuration" },
    "packages/shared/src/index.ts",
    "packages/shared/src/money.ts",
    "packages/shared/src/result.ts",
    "packages/shared/src/strings.ts",
    { path: "packages/shared/tsconfig.json", role: "configuration" },
    "packages/web/src/App.tsx",
    "packages/web/src/components/PriceTag.tsx",
    "packages/web/src/components/ProductCard.tsx",
    "packages/web/src/main.tsx",
    { path: "packages/web/tsconfig.json", role: "configuration" },
    { path: "pnpm-workspace.yaml", role: "configuration" },
    { path: "tsconfig.base.json", role: "configuration" },
  ],
  packages: [
    { path: "", name: "acme-monorepo" },
    { path: "packages/api", name: "@acme/api" },
    { path: "packages/core", name: "@acme/core" },
    { path: "packages/shared", name: "@acme/shared" },
    { path: "packages/web", name: "@acme/web" },
  ],
};

/** §2.4's monorepo tree: `id kind name direct/total < parent`. */
const MONOREPO_TREE = [
  "cmp: package acme-monorepo 0/17",
  "cmp:packages directory packages 0/17 < cmp:",
  "cmp:packages/api package @acme/api 0/4 < cmp:packages",
  "cmp:packages/api/src directory src 2/4 < cmp:packages/api",
  "cmp:packages/api/src/handlers directory handlers 2/2 < cmp:packages/api/src",
  "cmp:packages/core package @acme/core 0/5 < cmp:packages",
  "cmp:packages/core/src directory src 1/5 < cmp:packages/core",
  "cmp:packages/core/src/catalog directory catalog 2/2 < cmp:packages/core/src",
  "cmp:packages/core/src/orders directory orders 2/2 < cmp:packages/core/src",
  "cmp:packages/shared package @acme/shared 0/4 < cmp:packages",
  "cmp:packages/shared/src directory src 4/4 < cmp:packages/shared",
  "cmp:packages/web package @acme/web 0/4 < cmp:packages",
  "cmp:packages/web/src directory src 2/4 < cmp:packages/web",
  "cmp:packages/web/src/components directory components 2/2 < cmp:packages/web/src",
];

/** §2.4's clean-architecture tree. */
const CLEAN_ARCHITECTURE_TREE = [
  "cmp: package library-lending 0/25",
  "cmp:src directory src 1/25 < cmp:",
  "cmp:src/application directory application 4/4 < cmp:src",
  "cmp:src/domain directory domain 1/10 < cmp:src",
  "cmp:src/domain/model directory model 4/4 < cmp:src/domain",
  "cmp:src/domain/ports directory ports 5/5 < cmp:src/domain",
  "cmp:src/infrastructure directory infrastructure 1/6 < cmp:src",
  "cmp:src/infrastructure/notifications directory notifications 1/1 < cmp:src/infrastructure",
  "cmp:src/infrastructure/persistence directory persistence 4/4 < cmp:src/infrastructure",
  "cmp:src/presentation/http directory presentation/http 4/4 < cmp:src",
];

describe("inferComponents (§2)", () => {
  it("reproduces §2.4's monorepo tree on a synthetic copy", () => {
    const drafts = components(MONOREPO_SPEC);
    expect(tree(drafts)).toEqual(MONOREPO_TREE);
    const byId = new Map(drafts.map((draft) => [draft.id, draft]));
    expect(byId.get("cmp:")?.children).toEqual(["cmp:packages"]);
    expect(byId.get("cmp:packages")?.children).toEqual([
      "cmp:packages/api",
      "cmp:packages/core",
      "cmp:packages/shared",
      "cmp:packages/web",
    ]);
    // Package components list their own package; other directories the package that owns them.
    expect(byId.get("cmp:")?.packages).toEqual([packageId("npm", "")]);
    expect(byId.get("cmp:packages")?.packages).toEqual([packageId("npm", "")]);
    expect(byId.get("cmp:packages/core/src/orders")?.packages).toEqual([
      packageId("npm", "packages/core"),
    ]);
    expect(byId.get("cmp:packages/api/src")?.files).toEqual([
      "file:packages/api/src/routes.ts",
      "file:packages/api/src/server.ts",
    ]);
  });

  it("reproduces §2.4's monorepo tree on the prototype's copy of the fixture", () => {
    const drafts = inferComponents({
      model: prototypeModel("monorepo"),
      fileRoles: OWNED,
      repositoryName: "monorepo",
    });
    expect(tree(drafts)).toEqual(MONOREPO_TREE);
  });

  it("reproduces §2.4's clean-architecture tree, the collapsed `presentation/http` included", () => {
    const drafts = components({
      files: [...CLEAN_ARCHITECTURE_FILES, { path: "tsconfig.json", role: "configuration" }],
      packages: [{ path: "", name: "library-lending" }],
    });
    expect(tree(drafts)).toEqual(CLEAN_ARCHITECTURE_TREE);
    const byId = new Map(drafts.map((draft) => [draft.id, draft]));
    // `src/presentation` has no file and one child: it collapses into `src/presentation/http`.
    expect(byId.has("cmp:src/presentation")).toBe(false);
    expect(byId.get("cmp:src")?.children).toEqual([
      "cmp:src/application",
      "cmp:src/domain",
      "cmp:src/infrastructure",
      "cmp:src/presentation/http",
    ]);
    const prototype = inferComponents({
      model: prototypeModel("clean-architecture"),
      fileRoles: OWNED,
      repositoryName: "clean-architecture",
    });
    expect(tree(prototype)).toEqual(CLEAN_ARCHITECTURE_TREE);
  });

  it("collapses a chain of directories without files into its deepest member", () => {
    const drafts = components({
      files: ["src/main/java/com/acme/App.java", "src/main/java/com/acme/Util.java"],
    });
    expect(tree(drafts)).toEqual([
      "cmp: directory repository 0/2",
      "cmp:src/main/java/com/acme directory src/main/java/com/acme 2/2 < cmp:",
    ]);
  });

  it("keeps branch points without files, and names collapsed children relative to them", () => {
    const drafts = components({
      files: ["lib/a/x/one.ts", "lib/b/two.ts", "lib/b/c/three.ts"],
    });
    expect(tree(drafts)).toEqual([
      "cmp: directory repository 0/3",
      "cmp:lib directory lib 0/3 < cmp:",
      "cmp:lib/a/x directory a/x 1/1 < cmp:lib",
      "cmp:lib/b directory b 1/2 < cmp:lib",
      "cmp:lib/b/c directory c 1/1 < cmp:lib/b",
    ]);
  });

  it("makes no component of a package root without owned files", () => {
    const drafts = components({
      files: ["src/index.ts", { path: "tools/README.md", role: "documentation" }],
      packages: [
        { path: "", name: "app" },
        { path: "tools", name: "tools" },
      ],
    });
    expect(tree(drafts)).toEqual(["cmp: package app 0/1", "cmp:src directory src 1/1 < cmp:"]);
  });

  it("nests package components and gives other directories the nearest enclosing package", () => {
    const drafts = components({
      files: ["index.ts", "plugins/a/index.ts", "plugins/a/lib/util.ts", "plugins/a/nested/x.ts"],
      packages: [
        { path: "", name: "host" },
        { path: "plugins/a", name: "plugin-a" },
        { path: "plugins/a/nested", name: "nested" },
      ],
    });
    expect(tree(drafts)).toEqual([
      "cmp: package host 1/4",
      "cmp:plugins/a package plugin-a 1/3 < cmp:",
      "cmp:plugins/a/lib directory lib 1/1 < cmp:plugins/a",
      "cmp:plugins/a/nested package nested 1/1 < cmp:plugins/a",
    ]);
    const packages = Object.fromEntries(drafts.map((draft) => [draft.id, draft.packages]));
    expect(packages).toEqual({
      "cmp:": ["pkg:npm:"],
      "cmp:plugins/a": ["pkg:npm:plugins/a"],
      "cmp:plugins/a/lib": ["pkg:npm:plugins/a"],
      "cmp:plugins/a/nested": ["pkg:npm:plugins/a/nested"],
    });
  });

  it("names a directory with several manifests after the smallest package id and lists all (D-13)", () => {
    const drafts = components({
      files: ["src/lib.rs", "src/index.ts", "src/inner/mod.rs"],
      packages: [
        { path: "", name: "web-app", ecosystem: "npm" },
        { path: "", name: "core-crate", ecosystem: "cargo", manifest: "Cargo.toml" },
      ],
    });
    const root = drafts.find((draft) => draft.id === "cmp:");
    expect(root?.kind).toBe("package");
    // pkg:cargo: sorts before pkg:npm:.
    expect(root?.name).toBe("core-crate");
    expect(root?.packages).toEqual(["pkg:cargo:", "pkg:npm:"]);
    // A directory below them is owned by the same manifest directory.
    expect(drafts.find((draft) => draft.id === "cmp:src/inner")?.packages).toEqual([
      "pkg:cargo:",
      "pkg:npm:",
    ]);
  });

  it("names unnamed manifests after the repository at the root and after the directory elsewhere (D-12)", () => {
    const drafts = inferComponents({
      model: syntheticModel({
        files: ["main.ts", "packages/tool/run.ts"],
        // Unnamed manifests: the IR names them after the path, or "." at the root.
        packages: ["", "packages/tool"],
      }),
      fileRoles: OWNED,
      repositoryName: "acme",
    });
    expect(tree(drafts)).toEqual([
      "cmp: package acme 1/2",
      "cmp:packages/tool package tool 1/1 < cmp:",
    ]);
  });

  it("names the root without a manifest after the repository", () => {
    const drafts = inferComponents({
      model: syntheticModel({ files: ["a.ts", "lib/b.ts"] }),
      fileRoles: OWNED,
      repositoryName: "my-repo",
    });
    expect(tree(drafts)).toEqual([
      "cmp: directory my-repo 1/2",
      "cmp:lib directory lib 1/1 < cmp:",
    ]);
    expect(drafts[0]?.packages).toEqual([]);
  });

  it("gives a single root component when every owned file is at the root", () => {
    expect(tree(components({ files: ["a.ts", "b.ts"] }))).toEqual([
      "cmp: directory repository 2/2",
    ]);
  });

  it("returns no component without owned files", () => {
    expect(
      components({
        files: [
          { path: "README.md", role: "documentation" },
          { path: "docs/guide.md", role: "documentation" },
        ],
        packages: [{ path: "", name: "docs-only" }],
      }),
    ).toEqual([]);
    expect(components({ files: ["src/a.ts"] }, new Set())).toEqual([]);
  });

  it("owns files by role only, whatever their analysis status (§2.1)", () => {
    const drafts = components(
      {
        files: [
          "src/a.ts",
          { path: "src/a.test.ts", role: "test" },
          { path: "scripts/tool.py", status: "unsupported" },
          { path: "vendor/lib.js", role: "vendored" },
          { path: "assets/logo.svg", role: "asset" },
        ],
      },
      new Set(["source"]),
    );
    expect(tree(drafts)).toEqual([
      "cmp: directory repository 0/2",
      "cmp:scripts directory scripts 1/1 < cmp:",
      "cmp:src directory src 1/1 < cmp:",
    ]);
    expect(drafts.find((draft) => draft.id === "cmp:src")?.files).toEqual(["file:src/a.ts"]);
  });

  it("sums files, symbols and lines over each subtree", () => {
    const drafts = components({
      files: [
        { path: "a.ts", lines: 10, classes: ["A"] },
        { path: "src/b.ts", lines: 5, symbols: [{ name: "b" }, { name: "c" }] },
        { path: "src/x/c.ts" },
        { path: "src/y/d.ts", lines: 7, classes: ["D"], symbols: [{ name: "d" }] },
      ],
    });
    const totals = Object.fromEntries(drafts.map((draft) => [draft.id, draft.totals]));
    expect(totals).toEqual({
      "cmp:": { files: 4, symbols: 5, lines: 22 },
      "cmp:src": { files: 3, symbols: 4, lines: 12 },
      "cmp:src/x": { files: 1, symbols: 0, lines: 0 },
      "cmp:src/y": { files: 1, symbols: 2, lines: 7 },
    });
  });

  it("is canonical and independent of the order of the document's arrays", () => {
    const model = syntheticModel(MONOREPO_SPEC);
    const drafts = inferComponents({ model, fileRoles: OWNED, repositoryName: "monorepo" });
    for (const seed of [1, 2, 3]) {
      expect(
        inferComponents({
          model: shuffledModel(model, seed),
          fileRoles: OWNED,
          repositoryName: "monorepo",
        }),
      ).toEqual(drafts);
    }
    const entities: ComponentEntity[] = drafts.map((draft) => ({
      ...draft,
      modules: [],
      dependencies: [],
      dependents: [],
    }));
    const document = { ...emptyDocument(), components: entities };
    expect(canonicalizeDocument(document).components).toEqual(entities);
  });

  it("partitions the owned files and keeps parents, children and totals consistent (property)", () => {
    // Directory names have no dot and file names do, so no path is both a file and a directory.
    const segment = fc.constantFrom("a", "b", "src", "lib", "x-y");
    const path = fc
      .array(segment, { minLength: 0, maxLength: 4 })
      .chain((directories) =>
        fc.constantFrom("f.ts", "g.ts", "h.js").map((file) => [...directories, file].join("/")),
      );
    const role = fc.constantFrom<FileRole>("source", "test", "documentation", "configuration");
    const directory = fc
      .array(segment, { minLength: 0, maxLength: 3 })
      .map((parts) => parts.join("/"));
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(path, role), { maxLength: 14, selector: ([file]) => file }),
        fc.uniqueArray(directory, { maxLength: 3 }),
        (files, packages) => {
          const fileSpecs: SyntheticFileSpec[] = files.map(([file, fileRole]) => ({
            path: file,
            role: fileRole,
            lines: file.length,
          }));
          const model = syntheticModel({ files: fileSpecs, packages });
          const owned = model.document.files
            .filter((file) => OWNED.has(file.role))
            .map((file) => file.path)
            .sort(compareStrings);
          const drafts = inferComponents({ model, fileRoles: OWNED, repositoryName: "r" });
          if (owned.length === 0) return drafts.length === 0;
          const byId = new Map(drafts.map((draft) => [draft.id, draft]));
          // Every owned file is in exactly one component: the one of its own directory.
          const listed = drafts.flatMap((draft) => draft.files.map((file) => file.slice(5)));
          expect([...listed].sort(compareStrings)).toEqual(owned);
          for (const draft of drafts) {
            for (const file of draft.files) expect(parentPath(file.slice(5))).toBe(draft.path);
            const subtree = owned.filter((file) => isWithin(file, draft.path));
            expect(draft.totals.files).toBe(subtree.length);
            expect(draft.totals.lines).toBe(subtree.reduce((sum, file) => sum + file.length, 0));
            for (const child of draft.children) expect(byId.get(child)?.parent).toBe(draft.id);
            if (draft.parent !== undefined) {
              expect(byId.get(draft.parent)?.children).toContain(draft.id);
              expect(isWithin(draft.path, byId.get(draft.parent)?.path ?? "?")).toBe(true);
            }
          }
          expect(
            drafts.filter((draft) => draft.parent === undefined).map((draft) => draft.id),
          ).toEqual(["cmp:"]);
          return true;
        },
      ),
      { seed: 20261008, numRuns: 300 },
    );
  });
});
