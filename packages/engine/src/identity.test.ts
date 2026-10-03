import { readFileSync } from "node:fs";
import { EMPTY_DIGEST } from "@katedrala/ir";
import type { PackageDescriptor } from "@katedrala/plugin-api";
import { describe, expect, it } from "vitest";
import {
  analysisDigest,
  contentDigest,
  outsideDocumentLines,
  repositoryIdentity,
} from "./identity.js";
import { KATEDRALA_VERSION } from "./version.js";

function manifest(path: string, name: string | undefined, ecosystem = "npm"): PackageDescriptor {
  return {
    ...(name === undefined ? {} : { name }),
    ecosystem,
    path,
    manifest: path === "" ? "package.json" : `${path}/package.json`,
    dependencies: [],
  };
}

describe("repositoryIdentity", () => {
  it("prefers the configured name, then the root package, then the remote", () => {
    const packages = [manifest("", "shop"), manifest("packages/api", "@shop/api")];
    expect(
      repositoryIdentity({ configuredName: "Storefront", packages, versionControlled: false }),
    ).toEqual({ id: "repo:Storefront", name: "Storefront" });
    expect(repositoryIdentity({ packages, versionControlled: false })).toEqual({
      id: "repo:shop",
      name: "shop",
    });
    expect(
      repositoryIdentity({ packages: [], remote: "github.com/acme/shop", versionControlled: true }),
    ).toEqual({
      id: "repo:github.com/acme/shop",
      name: "shop",
      vcs: { type: "git", remote: "github.com/acme/shop" },
    });
    expect(repositoryIdentity({ packages: [], versionControlled: true })).toEqual({
      id: "repo:repository",
      name: "repository",
      vcs: { type: "git" },
    });
  });

  it("ignores unnamed and nested manifests and blank names", () => {
    const packages = [manifest("", undefined), manifest("packages/api", "api")];
    expect(
      repositoryIdentity({ configuredName: "  ", packages, versionControlled: false }).name,
    ).toBe("repository");
  });

  it("chooses deterministically between root manifests of several ecosystems", () => {
    const packages = [manifest("", "zeta", "pypi"), manifest("", "alpha", "cargo")];
    expect(repositoryIdentity({ packages, versionControlled: false }).name).toBe("alpha");
    expect(
      repositoryIdentity({ packages: [...packages].reverse(), versionControlled: false }).name,
    ).toBe("alpha");
  });
});

describe("digests", () => {
  it("hash the file listing as the IR specifies", () => {
    expect(contentDigest([])).toBe(EMPTY_DIGEST);
    const files = [
      { path: "a.ts", hash: "sha256:00", size: 3 },
      { path: "b.bin", size: 10 },
    ];
    expect(contentDigest(files)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(contentDigest(files)).not.toBe(contentDigest([{ ...files[0]!, size: 4 }, files[1]!]));
  });

  it("are independent of object key order", () => {
    expect(analysisDigest({ a: 1, b: [1, 2] })).toBe(analysisDigest({ b: [1, 2], a: 1 }));
    expect(analysisDigest({ a: 1 })).not.toBe(analysisDigest({ a: 2 }));
  });
});

describe("outsideDocumentLines", () => {
  const files = [
    { path: "package.json", hash: "sha256:aa", size: 10 },
    { path: "src/a.ts", hash: "sha256:bb", size: 3 },
  ];

  it("lists what the content digest cannot cover, sorted", () => {
    expect(
      outsideDocumentLines({
        listed: ["dist/a.js", "package.json", "src/a.ts", "tsconfig.json"],
        skipped: ["link"],
        files,
        reads: new Map([
          ["tsconfig.json", "sha256:cc"],
          ["package.json", "sha256:aa"],
          ["src/a.ts", "sha256:changed"],
          ["broken.json", undefined],
        ]),
        ancestorReads: new Map([
          ["tsconfig.base.json", "sha256:dd"],
          ["jsconfig.json", undefined],
        ]),
      }),
    ).toEqual([
      "listed\tdist/a.js",
      "listed\ttsconfig.json",
      "read\t/jsconfig.json\t-",
      "read\t/tsconfig.base.json\tsha256:dd",
      "read\tbroken.json\t-",
      "read\tsrc/a.ts\tsha256:changed",
      "read\ttsconfig.json\tsha256:cc",
      "skipped\tlink",
    ]);
  });

  it("is empty when the document's files carry everything", () => {
    expect(
      outsideDocumentLines({
        listed: ["package.json", "src/a.ts"],
        skipped: [],
        files,
        reads: new Map([["package.json", "sha256:aa"]]),
        ancestorReads: new Map(),
      }),
    ).toEqual([]);
  });
});

describe("KATEDRALA_VERSION", () => {
  it("matches the engine package version", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(KATEDRALA_VERSION).toBe(pkg.version);
  });
});
