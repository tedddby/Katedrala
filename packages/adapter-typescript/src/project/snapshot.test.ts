import fc from "fast-check";
import { compareStrings, isWithin } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { SnapshotIndex } from "./snapshot.js";

describe("SnapshotIndex", () => {
  const snapshot = new SnapshotIndex([
    "src/b.ts",
    "src/a/x.ts",
    "README.md",
    "src/a/x.ts",
    "srcx/y.ts",
  ]);

  it("sorts and de-duplicates paths", () => {
    expect(snapshot.paths).toEqual(["README.md", "src/a/x.ts", "src/b.ts", "srcx/y.ts"]);
  });

  it("matches files exactly and case-sensitively", () => {
    expect(snapshot.hasFile("src/b.ts")).toBe(true);
    expect(snapshot.hasFile("src/B.ts")).toBe(false);
    expect(snapshot.hasFile("readme.md")).toBe(false);
    expect(snapshot.hasFile("src")).toBe(false);
  });

  it("knows every ancestor directory and the root", () => {
    expect(snapshot.hasDirectory("")).toBe(true);
    expect(snapshot.hasDirectory("src")).toBe(true);
    expect(snapshot.hasDirectory("src/a")).toBe(true);
    expect(snapshot.hasDirectory("src/b.ts")).toBe(false);
    expect(snapshot.hasDirectory("Src")).toBe(false);
    expect(new SnapshotIndex([]).hasDirectory("")).toBe(true);
  });

  it("lists files below a directory", () => {
    expect(snapshot.filesUnder("src")).toEqual(["src/a/x.ts", "src/b.ts"]);
    expect(snapshot.filesUnder("src/a")).toEqual(["src/a/x.ts"]);
    expect(snapshot.filesUnder("")).toEqual(snapshot.paths);
    expect(snapshot.filesUnder("nothing")).toEqual([]);
  });

  it("lists exactly the files within a directory, for any file set", () => {
    const segment = fc.constantFrom("a", "b", "a.ts", "b-c", "a b", "Z", "a.b", "é");
    const path = fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/"));
    fc.assert(
      fc.property(
        fc.array(path, { maxLength: 30 }),
        fc.array(segment, { maxLength: 3 }),
        (paths, directoryParts) => {
          const index = new SnapshotIndex(paths);
          const directory = directoryParts.join("/");
          const expected = [...new Set(paths)]
            .filter((candidate) => isWithin(candidate, directory) && candidate !== directory)
            .sort(compareStrings);
          expect(index.filesUnder(directory)).toEqual(expected);
          expect(index.paths).toEqual([...new Set(paths)].sort(compareStrings));
        },
      ),
    );
  });
});
