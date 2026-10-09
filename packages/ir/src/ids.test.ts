import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InvalidIdentifierError,
  anomalyId,
  componentId,
  declaredModuleKey,
  directionalAnomalyId,
  directoryId,
  edgeId,
  endpointId,
  entityKindOf,
  escapeNameSegment,
  externalId,
  fileId,
  inferredModuleKey,
  isEntityId,
  layerId,
  moduleId,
  normalizeRemoteUrl,
  packageId,
  parseSymbolId,
  qualifiedNameOf,
  qualifiedNameSegments,
  repositoryId,
  symbolId,
  symbolLocalName,
  unescapeNameSegment,
  violationId,
} from "./ids.js";
import { sha256Hex } from "./hash.js";

describe("entity identifiers", () => {
  it("derive readable ids from paths and names", () => {
    expect(repositoryId("github.com/acme/shop")).toBe("repo:github.com/acme/shop");
    expect(directoryId("")).toBe("dir:");
    expect(directoryId("./src/payments/")).toBe("dir:src/payments");
    expect(fileId("src\\payments\\service.ts")).toBe("file:src/payments/service.ts");
    expect(componentId("")).toBe("cmp:");
    expect(componentId("src/payments")).toBe("cmp:src/payments");
    expect(layerId("controller")).toBe("layer:controller");
    expect(externalId("npm", "@nestjs/core")).toBe("ext:npm:@nestjs/core");
    expect(externalId("node", "fs")).toBe("ext:node:fs");
  });

  it("derive package ids from ecosystem and manifest location", () => {
    expect(packageId("npm", "packages/api")).toBe("pkg:npm:packages/api");
    expect(packageId("npm", "")).toBe("pkg:npm:");
    expect(packageId("cargo", "./crates/core/")).toBe("pkg:cargo:crates/core");
    expect(() => packageId("NPM", "x")).toThrow(InvalidIdentifierError);
  });

  it("derive module ids from declared names or inferred anchors", () => {
    expect(moduleId(declaredModuleKey("payments"))).toBe("mod:payments");
    expect(moduleId(inferredModuleKey({ directory: "src/payments" }))).toBe("mod:src/payments");
    expect(moduleId(inferredModuleKey({ directory: "src", stem: "payment" }))).toBe(
      "mod:src#payment",
    );
    expect(moduleId(inferredModuleKey({ directory: "" }))).toBe("mod:.");
    expect(moduleId(inferredModuleKey({ directory: "payments" }, true))).toBe(
      "mod:payments~inferred",
    );
    expect(() => declaredModuleKey("a#b")).toThrow(InvalidIdentifierError);
  });

  it("write the analysis root as '.' also when a stem follows", () => {
    expect(inferredModuleKey({ directory: "", stem: "payment" })).toBe(".#payment");
    expect(inferredModuleKey({ directory: "./", stem: "payment" })).toBe(".#payment");
    expect(inferredModuleKey({ directory: "", stem: "payment" }, true)).toBe(".#payment~inferred");
    expect(inferredModuleKey({ directory: "" }, true)).toBe(".~inferred");
  });

  it("escape '%', '#' and '~' in the directory part", () => {
    // A directory containing "#" no longer collides with a group directory plus a stem.
    expect(inferredModuleKey({ directory: "src/a#b" })).toBe("src/a%23b");
    expect(inferredModuleKey({ directory: "src/a", stem: "b" })).toBe("src/a#b");
    // A directory ending in "~inferred" cannot imitate the collision suffix.
    expect(inferredModuleKey({ directory: "src/x~inferred" })).toBe("src/x%7Einferred");
    expect(inferredModuleKey({ directory: "src/x" }, true)).toBe("src/x~inferred");
    expect(inferredModuleKey({ directory: "src/50%" })).toBe("src/50%25");
    expect(inferredModuleKey({ directory: "src/%23" })).toBe("src/%2523");
    expect(inferredModuleKey({ directory: "src\\a#b\\", stem: "order" })).toBe("src/a%23b#order");
    expect(moduleId(inferredModuleKey({ directory: "src/a#b", stem: "x" }, true))).toBe(
      "mod:src/a%23b#x~inferred",
    );
  });

  it("reject stems that would make keys ambiguous", () => {
    for (const stem of ["", "a#b", "a~b", "50%", "a/b"]) {
      expect(() => inferredModuleKey({ directory: "src", stem })).toThrow(InvalidIdentifierError);
    }
    expect(inferredModuleKey({ directory: "src/lib", stem: "format-date-ts" })).toBe(
      "src/lib#format-date-ts",
    );
    expect(inferredModuleKey({ directory: "src/lib", stem: "0123456789abcdef" })).toBe(
      "src/lib#0123456789abcdef",
    );
  });

  it("derive distinct keys from distinct anchors", () => {
    const segment = fc
      .stringMatching(/^[a-z0-9#%~._ -]{1,5}$/)
      .filter((value) => value !== "." && value !== ".." && value.trim() === value);
    const anchor = fc
      .tuple(
        fc.array(segment, { maxLength: 3 }).map((segments) => segments.join("/")),
        fc.option(fc.stringMatching(/^[a-z0-9-]{1,4}$/), { nil: null }),
      )
      .map(([directory, stem]): { directory: string; stem?: string } =>
        stem === null ? { directory } : { directory, stem },
      );
    fc.assert(
      fc.property(anchor, anchor, fc.boolean(), fc.boolean(), (a, b, collidesA, collidesB) => {
        const same = a.directory === b.directory && a.stem === b.stem && collidesA === collidesB;
        expect(inferredModuleKey(a, collidesA) === inferredModuleKey(b, collidesB)).toBe(same);
      }),
      { seed: 20261007, numRuns: 1000 },
    );
  });

  it("derive endpoint ids from protocol, method, path and handler", () => {
    const id = endpointId("http", "GET", "/users/:id", "sym:src/users.ts#getUser");
    expect(id).toMatch(/^endpoint:[0-9a-f]{16}$/);
    expect(endpointId("http", "POST", "/users/:id", "sym:src/users.ts#getUser")).not.toBe(id);
  });

  it("reject empty names", () => {
    expect(() => fileId("")).toThrow(InvalidIdentifierError);
    expect(() => fileId("./")).toThrow(InvalidIdentifierError);
    expect(() => moduleId(" ")).toThrow(InvalidIdentifierError);
    expect(() => symbolId("a.ts", "")).toThrow(InvalidIdentifierError);
  });
});

describe("normalizeRemoteUrl", () => {
  it.each([
    ["https://github.com/acme/shop.git", "github.com/acme/shop"],
    ["https://user:token@GitHub.com/acme/shop", "github.com/acme/shop"],
    ["ssh://git@github.com:22/acme/shop.git", "github.com/acme/shop"],
    ["git@github.com:acme/shop.git", "github.com/acme/shop"],
    ["github.com:acme/shop", "github.com/acme/shop"],
    ["https://gitlab.example.com/group/sub/repo/", "gitlab.example.com/group/sub/repo"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeRemoteUrl(input)).toBe(expected);
  });

  it.each([
    "",
    "file:///srv/git/repo.git",
    "/srv/git/repo.git",
    "../other",
    "C:\\repos\\x",
    "C:/repos/x",
  ])("rejects local remote %j", (input) => {
    expect(normalizeRemoteUrl(input)).toBeUndefined();
  });
});

describe("qualified names", () => {
  it("escape separators inside segments", () => {
    expect(qualifiedNameOf(["PaymentService", "charge"])).toBe("PaymentService.charge");
    expect(qualifiedNameOf(['"*.svg"'])).toBe('"*%2Esvg"');
    expect(qualifiedNameOf(["[Symbol.iterator]"])).toBe("[Symbol%2Eiterator]");
    expect(qualifiedNameOf(["a~b", "100%"])).toBe("a%7Eb.100%25");
    expect(qualifiedNameSegments("a%7Eb.100%25")).toEqual(["a~b", "100%"]);
  });

  it("round-trip arbitrary segments", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 4 }),
        (segments) => {
          fc.pre(segments.every((s) => s.trim() !== ""));
          expect(qualifiedNameSegments(qualifiedNameOf(segments))).toEqual(segments);
          for (const segment of segments)
            expect(unescapeNameSegment(escapeNameSegment(segment))).toBe(segment);
        },
      ),
    );
  });
});

describe("symbol identifiers", () => {
  it("combine file path and qualified name", () => {
    expect(symbolId("src/payment.service.ts", "PaymentService.charge")).toBe(
      "sym:src/payment.service.ts#PaymentService.charge",
    );
    expect(symbolId("src/a.ts", "Foo", "namespace")).toBe("sym:src/a.ts#Foo~namespace");
    expect(symbolId("src/a.ts", "A.create", "method-static")).toBe(
      "sym:src/a.ts#A.create~method-static",
    );
    expect(symbolLocalName("Foo", "namespace")).toBe("Foo~namespace");
    expect(symbolLocalName("Foo")).toBe("Foo");
  });

  it("reject malformed disambiguators and unescaped tildes", () => {
    expect(() => symbolId("a.ts", "Foo", "Bad")).toThrow(InvalidIdentifierError);
    expect(() => symbolId("a.ts", "Foo", "a b")).toThrow(InvalidIdentifierError);
    expect(() => symbolId("a.ts", "Foo~namespace")).toThrow(InvalidIdentifierError);
  });

  it("escape '#' and '%' in paths so ids parse unambiguously", () => {
    const id = symbolId("src/c#/100%/a.ts", "Klass.#secret");
    expect(id).toBe("sym:src/c%23/100%25/a.ts#Klass.#secret");
    expect(parseSymbolId(id)).toEqual({ path: "src/c#/100%/a.ts", qualifiedName: "Klass.#secret" });
  });

  it("round-trip through parseSymbolId", () => {
    const pathSegment = fc
      .stringMatching(/^[a-zA-Z0-9_.#%@~ -]{1,6}$/)
      .filter((segment) => segment !== "." && segment !== ".." && segment.trim() === segment);
    const nameSegment = fc.string({ minLength: 1, maxLength: 6 }).filter((s) => s.trim() !== "");
    const disambiguator = fc.option(fc.stringMatching(/^[a-z0-9]{1,6}(?:-[a-z0-9]{1,3})?$/), {
      nil: undefined,
    });
    fc.assert(
      fc.property(
        fc.array(pathSegment, { minLength: 1, maxLength: 4 }),
        fc.array(nameSegment, { minLength: 1, maxLength: 3 }),
        disambiguator,
        (pathSegments, nameSegments, suffix) => {
          const path = pathSegments.join("/");
          const qualifiedName = qualifiedNameOf(nameSegments);
          const parsed = parseSymbolId(symbolId(path, qualifiedName, suffix));
          expect(parsed).toEqual(
            suffix === undefined
              ? { path, qualifiedName }
              : { path, qualifiedName, disambiguator: suffix },
          );
        },
      ),
    );
  });

  it("reject non-symbol ids when parsing", () => {
    expect(parseSymbolId("file:a.ts")).toBeUndefined();
    expect(parseSymbolId("sym:a.ts")).toBeUndefined();
    expect(parseSymbolId("sym:#Foo")).toBeUndefined();
    expect(parseSymbolId("sym:a.ts#")).toBeUndefined();
    expect(parseSymbolId("sym:a.ts#Foo~Bad")).toBeUndefined();
  });
});

describe("hashed identifiers", () => {
  it("derive edge ids from kind, source and target", () => {
    const expected = sha256Hex("imports\nfile:a.ts\nfile:b.ts").slice(0, 16);
    expect(edgeId("imports", "file:a.ts", "file:b.ts")).toBe(`edge:${expected}`);
    expect(edgeId("calls", "file:a.ts", "file:b.ts")).not.toBe(
      edgeId("imports", "file:a.ts", "file:b.ts"),
    );
    expect(edgeId("imports", "file:b.ts", "file:a.ts")).not.toBe(
      edgeId("imports", "file:a.ts", "file:b.ts"),
    );
  });

  it("derive set anomaly ids independent of subject order and duplicates", () => {
    expect(anomalyId("dependency-cycle", ["mod:b", "mod:a"])).toBe(
      anomalyId("dependency-cycle", ["mod:a", "mod:b", "mod:a"]),
    );
    expect(anomalyId("dependency-cycle", ["mod:a"])).toMatch(
      /^anomaly:dependency-cycle:[0-9a-f]{16}$/,
    );
  });

  it("derive directional anomaly ids that distinguish direction", () => {
    const forward = directionalAnomalyId("boundary-bypass", "mod:orders", "mod:payments");
    const backward = directionalAnomalyId("boundary-bypass", "mod:payments", "mod:orders");
    expect(forward).not.toBe(backward);
    expect(forward).toMatch(/^anomaly:boundary-bypass:[0-9a-f]{16}$/);
  });

  it("derive violation ids from rule, source, target and discriminator", () => {
    const id = violationId("no-db", "file:a.ts", "file:b.ts");
    expect(id).toMatch(/^violation:no-db:[0-9a-f]{16}$/);
    expect(violationId("no-db", "file:a.ts", "file:b.ts")).toBe(id);
    expect(violationId("no-db", "file:a.ts")).not.toBe(id);
    expect(violationId("no-db", "file:a.ts", "file:b.ts", "x")).not.toBe(id);
  });

  it("are deterministic", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (kind, source, target) => {
        expect(edgeId(kind, source, target)).toBe(edgeId(kind, source, target));
        expect(edgeId(kind, source, target)).toMatch(/^edge:[0-9a-f]{16}$/);
      }),
    );
  });
});

describe("entityKindOf", () => {
  it("recognizes every entity prefix", () => {
    expect(entityKindOf("repo:x")).toBe("repository");
    expect(entityKindOf("dir:")).toBe("directory");
    expect(entityKindOf("file:a.ts")).toBe("file");
    expect(entityKindOf("sym:a.ts#x")).toBe("symbol");
    expect(entityKindOf("pkg:npm:")).toBe("package");
    expect(entityKindOf("ext:npm:react")).toBe("external");
    expect(entityKindOf("cmp:src")).toBe("component");
    expect(entityKindOf("mod:payments")).toBe("module");
    expect(entityKindOf("layer:service")).toBe("layer");
    expect(entityKindOf("endpoint:0123456789abcdef")).toBe("endpoint");
  });

  it("rejects unknown prefixes", () => {
    expect(entityKindOf("edge:0123")).toBeUndefined();
    expect(entityKindOf("nonsense")).toBeUndefined();
    expect(isEntityId("file:a.ts")).toBe(true);
    expect(isEntityId("unknown:a")).toBe(false);
  });
});
