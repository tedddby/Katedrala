import {
  DocumentIndex,
  DuplicateIdError,
  componentId,
  directoryId,
  endpointId,
  fileId,
  layerId,
  moduleId,
  packageId,
  repositoryId,
  symbolId,
} from "@katedrala/ir";
import type { EdgeKind, EntityId, FileRole } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { ModelError } from "./errors.js";
import { ArchitectureModel } from "./model.js";
import type { ModelDocument } from "./model.js";
import { DEFAULT_EDGE_KINDS, PROJECTION_LEVELS } from "./spec.js";
import type { ProjectionLevel } from "./spec.js";
import {
  C,
  F,
  L,
  M,
  P,
  S,
  X,
  documentOf,
  makeComponent,
  makeEdge,
  makeFile,
  makeLayer,
  makeModule,
  makeSymbol,
  shopDocument,
  shuffleDocument,
} from "./test-support.js";

const shop = () => ArchitectureModel.from(shopDocument());

describe("ArchitectureModel.from", () => {
  it("indexes a complete document", () => {
    const document = shopDocument();
    const model = ArchitectureModel.from(document);
    expect(model.document).toBe(document);
    expect(model.index).toBeInstanceOf(DocumentIndex);
    expect(model.index.file(F.order)?.path).toBe("api/src/order.ts");
  });

  it("accepts partial documents with only the structural sections", () => {
    const partial: ModelDocument = {
      directories: [],
      packages: [],
      files: [makeFile("a.ts"), makeFile("b.ts")],
      symbols: [],
      externals: [],
      edges: [makeEdge("imports", fileId("a.ts"), fileId("b.ts"))],
    };
    const model = ArchitectureModel.from(partial);
    expect(model.unitOf(fileId("a.ts"), "component")).toBeUndefined();
    expect(model.unitOf(fileId("a.ts"), "file")).toBe(fileId("a.ts"));
    expect(model.filesIn(componentId(""))).toEqual([]);
  });

  it("rejects duplicate identifiers", () => {
    const document = shopDocument();
    document.files.push(makeFile("api/src/order.ts"));
    expect(() => ArchitectureModel.from(document)).toThrow(DuplicateIdError);
    const edges = shopDocument();
    const first = edges.edges[0];
    if (first !== undefined) edges.edges.push({ ...first });
    expect(() => ArchitectureModel.from(edges)).toThrow(DuplicateIdError);
  });
});

describe("fileOf", () => {
  it("maps files to themselves and symbols to their file", () => {
    const model = shop();
    expect(model.fileOf(F.order)).toBe(F.order);
    expect(model.fileOf(S.place)).toBe(F.order);
    // Mirrors DocumentIndex.fileOf: a file identifier is its own file, listed or not.
    expect(model.fileOf(fileId("missing.ts"))).toBe(fileId("missing.ts"));
  });

  it("derives the file of unlisted symbols from their identifier", () => {
    const model = shop();
    expect(model.fileOf(symbolId("api/src/order.ts", "Hidden"))).toBe(F.order);
    expect(model.fileOf(symbolId("src/a#b%c.ts", "f"))).toBe(fileId("src/a#b%c.ts"));
    expect(model.fileOf("sym:no-qualified-name")).toBeUndefined();
  });

  it("is undefined for entities that are not code", () => {
    const model = shop();
    for (const id of [P.api, X.react, C.apiSrc, M.orders, L.ui, directoryId("api")] as EntityId[]) {
      expect(model.fileOf(id)).toBeUndefined();
    }
  });
});

describe("roleOf", () => {
  const document = () =>
    documentOf({
      files: [makeFile("src/lib.rs"), makeFile("tests/it.rs", { role: "test" })],
      symbols: [
        makeSymbol("src/lib.rs", "helper"),
        makeSymbol("src/lib.rs", "tests", { kind: "module", role: "test" }),
        makeSymbol("src/lib.rs", "tests.check", { parent: "tests" }),
        makeSymbol("src/lib.rs", "tests.fixtures", { kind: "module", parent: "tests" }),
        makeSymbol("src/lib.rs", "tests.fixtures.build", { parent: "tests.fixtures" }),
        makeSymbol("src/lib.rs", "tests.real", { parent: "tests", role: "source" }),
        makeSymbol("tests/it.rs", "it"),
      ],
    });

  it("is the file's role unless a symbol or its ancestors declare one", () => {
    const model = ArchitectureModel.from(document());
    const sym = (name: string) => symbolId("src/lib.rs", name);
    expect(model.roleOf(fileId("src/lib.rs"))).toBe("source");
    expect(model.roleOf(fileId("tests/it.rs"))).toBe("test");
    expect(model.roleOf(sym("helper"))).toBe("source");
    expect(model.roleOf(sym("tests"))).toBe("test");
    expect(model.roleOf(sym("tests.check"))).toBe("test");
    expect(model.roleOf(sym("tests.fixtures.build"))).toBe("test");
    // The nearest declaration wins.
    expect(model.roleOf(sym("tests.real"))).toBe("source");
    expect(model.roleOf(symbolId("tests/it.rs", "it"))).toBe("test");
    // Unlisted symbols have no declared role.
    expect(model.roleOf(sym("unlisted"))).toBe("source");
  });

  it("gives the same answers whatever the query order (memoization)", () => {
    const names = ["tests.fixtures.build", "tests.check", "helper", "tests.real", "tests"];
    const expected = new Map<string, FileRole | undefined>();
    const reference = ArchitectureModel.from(document());
    for (const name of names) expected.set(name, reference.roleOf(symbolId("src/lib.rs", name)));
    const model = ArchitectureModel.from(document());
    for (const name of [...names].reverse()) {
      expect(model.roleOf(symbolId("src/lib.rs", name))).toBe(expected.get(name));
    }
  });

  it("is undefined for unlisted files and non-code entities", () => {
    const model = ArchitectureModel.from(document());
    expect(model.roleOf(fileId("missing.rs"))).toBeUndefined();
    expect(model.roleOf(symbolId("missing.rs", "f"))).toBeUndefined();
    expect(model.roleOf(packageId("npm", ""))).toBeUndefined();
  });

  it("terminates on parent cycles of malformed documents", () => {
    const a = makeSymbol("a.ts", "A", { parent: "B" });
    const b = makeSymbol("a.ts", "B", { parent: "A" });
    const model = ArchitectureModel.from(
      documentOf({ files: [makeFile("a.ts", { role: "test" })], symbols: [a, b] }),
    );
    expect(model.roleOf(a.id)).toBe("test");
    expect(model.roleOf(b.id)).toBe("test");
  });
});

describe("unitOf", () => {
  it("maps code to its unit at every level", () => {
    const model = shop();
    const expectations: Array<[EntityId, ProjectionLevel, EntityId | undefined]> = [
      [S.place, "symbol", S.place],
      [F.order, "symbol", F.order],
      [S.place, "file", F.order],
      [F.order, "file", F.order],
      [S.place, "component", C.apiSrc],
      [F.rootManifest, "component", C.root],
      [F.apiManifest, "component", C.api],
      [S.place, "module", M.orders],
      [F.app, "module", M.web],
      [F.types, "module", undefined],
      [S.suite, "module", undefined],
      [S.app, "layer", L.ui],
      [F.payment, "layer", L.service],
      [F.types, "layer", undefined],
      [S.charge, "package", P.api],
      [F.rootManifest, "package", P.root],
      [S.view, "package", P.web],
    ];
    for (const [entity, level, unit] of expectations) {
      expect([entity, level, model.unitOf(entity, level)]).toEqual([entity, level, unit]);
    }
  });

  it("maps unlisted symbols of listed files, but nothing of unlisted files", () => {
    const model = shop();
    const hidden = symbolId("api/src/order.ts", "Hidden");
    expect(model.unitOf(hidden, "symbol")).toBe(hidden);
    expect(model.unitOf(hidden, "module")).toBe(M.orders);
    for (const level of PROJECTION_LEVELS) {
      expect(model.unitOf(fileId("missing.ts"), level)).toBeUndefined();
      expect(model.unitOf(symbolId("missing.ts", "f"), level)).toBeUndefined();
      expect(model.unitOf("sym:malformed", level)).toBeUndefined();
    }
  });

  it("maps a file without a package to no package", () => {
    const model = ArchitectureModel.from(documentOf({ files: [makeFile("loose.ts")] }));
    expect(model.unitOf(fileId("loose.ts"), "package")).toBeUndefined();
  });

  it("maps externals to themselves and units to themselves at their own level only", () => {
    const model = shop();
    for (const level of PROJECTION_LEVELS) {
      expect(model.unitOf(X.react, level)).toBe(X.react);
      expect(model.unitOf(P.api, level)).toBe(level === "package" ? P.api : undefined);
      expect(model.unitOf(C.apiSrc, level)).toBe(level === "component" ? C.apiSrc : undefined);
      expect(model.unitOf(M.web, level)).toBe(level === "module" ? M.web : undefined);
      expect(model.unitOf(L.ui, level)).toBe(level === "layer" ? L.ui : undefined);
      // Not checked against the document.
      expect(model.unitOf(moduleId("unknown"), level)).toBe(
        level === "module" ? moduleId("unknown") : undefined,
      );
    }
  });

  it("maps no other entity", () => {
    const model = shop();
    const others: EntityId[] = [
      directoryId("api"),
      repositoryId("shop"),
      endpointId("http", "GET", "/", S.app),
    ];
    for (const level of PROJECTION_LEVELS) {
      for (const entity of others) expect(model.unitOf(entity, level)).toBeUndefined();
    }
    expect(model.unitOf(F.order, "directory" as ProjectionLevel)).toBeUndefined();
  });
});

describe("containment of malformed documents", () => {
  const ambiguous = () =>
    documentOf({
      files: [makeFile("src/a/x.ts"), makeFile("lib/z.ts"), makeFile("free.ts")],
      components: [
        makeComponent("src", ["src/a/x.ts"]),
        makeComponent("src/a", ["src/a/x.ts"]),
        makeComponent("lib/b", ["lib/z.ts"]),
        makeComponent("lib/a", ["lib/z.ts"]),
      ],
      modules: [makeModule("zeta", ["src/a/x.ts"]), makeModule("alpha", ["src/a/x.ts"])],
      layers: [makeLayer("web", ["lib/z.ts"]), makeLayer("domain", ["lib/z.ts"], 1)],
    });

  it("takes the deepest component listing a file, then the smallest id", () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const model = ArchitectureModel.from(shuffleDocument(ambiguous(), seed));
      expect(model.unitOf(fileId("src/a/x.ts"), "component")).toBe(componentId("src/a"));
      expect(model.unitOf(fileId("lib/z.ts"), "component")).toBe(componentId("lib/a"));
      expect(model.unitOf(fileId("free.ts"), "component")).toBeUndefined();
      expect(model.filesIn(componentId("src"))).toEqual([]);
      expect(model.filesIn(componentId("src/a"))).toEqual([fileId("src/a/x.ts")]);
      expect(model.filesIn(componentId("lib/b"))).toEqual([]);
    }
  });

  it("takes the module or layer with the smallest id", () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const model = ArchitectureModel.from(shuffleDocument(ambiguous(), seed));
      expect(model.unitOf(fileId("src/a/x.ts"), "module")).toBe(moduleId("alpha"));
      expect(model.unitOf(fileId("lib/z.ts"), "layer")).toBe(layerId("domain"));
      expect(model.filesIn(moduleId("zeta"))).toEqual([]);
      expect(model.filesIn(layerId("web"))).toEqual([]);
    }
  });

  it("ignores files that a unit lists but the document does not", () => {
    const model = ArchitectureModel.from(
      documentOf({ components: [makeComponent("", ["ghost.ts"])], modules: [] }),
    );
    expect(model.unitOf(fileId("ghost.ts"), "component")).toBeUndefined();
    expect(model.filesIn(componentId(""))).toEqual([]);
  });
});

describe("filesIn", () => {
  it("lists the directly owned files of a component, sorted", () => {
    const model = shop();
    expect(model.filesIn(C.apiSrc)).toEqual([F.order, F.payment, F.types]);
    expect(model.filesIn(C.root)).toEqual([F.rootManifest]);
  });

  it("lists module, layer and package members regardless of their role", () => {
    const model = shop();
    expect(model.filesIn(M.web)).toEqual([F.app, F.view]);
    expect(model.filesIn(L.service)).toEqual([F.order, F.payment]);
    expect(model.filesIn(P.api)).toEqual([F.apiManifest, F.order, F.payment, F.types, F.orderTest]);
    expect(model.filesIn(P.root)).toEqual([F.rootManifest]);
  });

  it("lists the file of a file or symbol", () => {
    const model = shop();
    expect(model.filesIn(F.view)).toEqual([F.view]);
    expect(model.filesIn(S.place)).toEqual([F.order]);
    expect(model.filesIn(fileId("missing.ts"))).toEqual([]);
    expect(model.filesIn(symbolId("missing.ts", "f"))).toEqual([]);
  });

  it("is empty for other entities and unknown units", () => {
    const model = shop();
    for (const id of [X.react, directoryId("api"), moduleId("unknown"), packageId("npm", "x")]) {
      expect(model.filesIn(id)).toEqual([]);
    }
  });

  it("returns a new array on every call", () => {
    const model = shop();
    model.filesIn(M.web).push(F.order);
    expect(model.filesIn(M.web)).toEqual([F.app, F.view]);
  });

  it("does not depend on the order of the document's arrays", () => {
    const expected = shop();
    for (const seed of [11, 12, 13]) {
      const model = ArchitectureModel.from(shuffleDocument(shopDocument(), seed));
      for (const unit of [...Object.values(C), ...Object.values(M), ...Object.values(L)]) {
        expect(model.filesIn(unit)).toEqual(expected.filesIn(unit));
      }
      for (const pkg of Object.values(P)) expect(model.filesIn(pkg)).toEqual(expected.filesIn(pkg));
    }
  });
});

describe("projection memoization", () => {
  it("returns the same instance for equal normalized specifications", () => {
    const model = shop();
    const projection = model.projection({ level: "file" });
    expect(model.projection({ level: "file" })).toBe(projection);
    expect(
      model.projection({
        level: "file",
        edgeKinds: new Set<EdgeKind>([...DEFAULT_EDGE_KINDS].reverse()),
        includeTypeOnly: true,
        fileRoles: new Set<FileRole>(["source", "declaration", "source"]),
        includeExternals: false,
      }),
    ).toBe(projection);
    expect(model.projection(projection.spec)).toBe(projection);
  });

  it("returns different instances for different specifications", () => {
    const model = shop();
    const projection = model.projection({ level: "file" });
    expect(model.projection({ level: "module" })).not.toBe(projection);
    expect(model.projection({ level: "file", includeTypeOnly: false })).not.toBe(projection);
    expect(model.projection({ level: "file", includeExternals: true })).not.toBe(projection);
    expect(model.projection({ level: "file", fileRoles: new Set(["source"]) })).not.toBe(
      projection,
    );
    expect(model.projection({ level: "file", edgeKinds: new Set(["imports"]) })).not.toBe(
      projection,
    );
  });

  it("is per model", () => {
    expect(shop().projection({ level: "file" })).not.toBe(shop().projection({ level: "file" }));
  });

  it("rejects unknown levels", () => {
    expect(() => shop().projection({ level: "system" as ProjectionLevel })).toThrow(ModelError);
  });
});
