import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  COMMONJS_PROBE_EXTENSIONS,
  PROBE_EXTENSIONS,
  javaScriptExtensionOf,
  probeFile,
  probeIndex,
} from "./probing.js";
import { SnapshotIndex } from "./snapshot.js";

describe("probeFile", () => {
  it("prefers the exact path, whatever its extension", () => {
    const snapshot = new SnapshotIndex(["src/a.js", "src/a.ts", "src/styles.css", "src/data.json"]);
    expect(probeFile(snapshot, "src/a.js")).toBe("src/a.js");
    expect(probeFile(snapshot, "src/styles.css")).toBe("src/styles.css");
    expect(probeFile(snapshot, "src/data.json")).toBe("src/data.json");
  });

  it("maps a missing JavaScript file to its TypeScript source", () => {
    const snapshot = new SnapshotIndex([
      "a.ts",
      "b.tsx",
      "c.d.ts",
      "d.tsx",
      "e.mts",
      "f.d.mts",
      "g.cts",
      "h.d.cts",
    ]);
    expect(probeFile(snapshot, "a.js")).toBe("a.ts");
    expect(probeFile(snapshot, "b.js")).toBe("b.tsx");
    expect(probeFile(snapshot, "c.js")).toBe("c.d.ts");
    expect(probeFile(snapshot, "d.jsx")).toBe("d.tsx");
    expect(probeFile(snapshot, "e.mjs")).toBe("e.mts");
    expect(probeFile(snapshot, "f.mjs")).toBe("f.d.mts");
    expect(probeFile(snapshot, "g.cjs")).toBe("g.cts");
    expect(probeFile(snapshot, "h.cjs")).toBe("h.d.cts");
    expect(probeFile(snapshot, "e.js")).toBeUndefined();
  });

  it("appends extensions in the documented order", () => {
    fc.assert(
      fc.property(fc.subarray([...PROBE_EXTENSIONS], { minLength: 1 }), (present) => {
        const snapshot = new SnapshotIndex(present.map((extension) => `src/x${extension}`));
        const first = PROBE_EXTENSIONS.find((extension) => present.includes(extension));
        expect(probeFile(snapshot, "src/x")).toBe(`src/x${first ?? ""}`);
      }),
    );
  });

  it("appends .json only with the CommonJS extensions, after the code extensions", () => {
    const snapshot = new SnapshotIndex(["src/data.json", "src/config.json", "src/config.cjs"]);
    expect(PROBE_EXTENSIONS).not.toContain(".json");
    expect(probeFile(snapshot, "src/data")).toBeUndefined();
    expect(probeFile(snapshot, "src/data", COMMONJS_PROBE_EXTENSIONS)).toBe("src/data.json");
    expect(probeFile(snapshot, "src/config", COMMONJS_PROBE_EXTENSIONS)).toBe("src/config.cjs");
    expect(COMMONJS_PROBE_EXTENSIONS).toEqual([...PROBE_EXTENSIONS, ".json"]);
  });

  it("appends extensions to names that contain dots", () => {
    const snapshot = new SnapshotIndex(["src/order.service.ts", "src/app.config.mjs"]);
    expect(probeFile(snapshot, "src/order.service")).toBe("src/order.service.ts");
    expect(probeFile(snapshot, "src/app.config")).toBe("src/app.config.mjs");
  });

  it("never matches directories or the root", () => {
    const snapshot = new SnapshotIndex(["src/index.ts", ".ts"]);
    expect(probeFile(snapshot, "src")).toBeUndefined();
    expect(probeFile(snapshot, "")).toBeUndefined();
  });

  it("is case-sensitive", () => {
    const snapshot = new SnapshotIndex(["src/Button.tsx"]);
    expect(probeFile(snapshot, "src/button")).toBeUndefined();
    expect(probeFile(snapshot, "src/Button")).toBe("src/Button.tsx");
  });
});

describe("probeIndex", () => {
  it("finds directory index files in extension order", () => {
    const snapshot = new SnapshotIndex(["lib/index.js", "lib/index.d.ts", "index.mjs"]);
    expect(probeIndex(snapshot, "lib")).toBe("lib/index.d.ts");
    expect(probeIndex(snapshot, "")).toBe("index.mjs");
    expect(probeIndex(snapshot, "missing")).toBeUndefined();
  });

  it("finds index.json only with the CommonJS extensions", () => {
    const snapshot = new SnapshotIndex(["data/index.json"]);
    expect(probeIndex(snapshot, "data")).toBeUndefined();
    expect(probeIndex(snapshot, "data", COMMONJS_PROBE_EXTENSIONS)).toBe("data/index.json");
  });

  it("recognizes JavaScript extensions", () => {
    expect(javaScriptExtensionOf("a.js")).toBe(".js");
    expect(javaScriptExtensionOf("a.jsx")).toBe(".jsx");
    expect(javaScriptExtensionOf("a.mjs")).toBe(".mjs");
    expect(javaScriptExtensionOf("a.cjs")).toBe(".cjs");
    expect(javaScriptExtensionOf("a.json")).toBeUndefined();
    expect(javaScriptExtensionOf("a.ts")).toBeUndefined();
  });
});
