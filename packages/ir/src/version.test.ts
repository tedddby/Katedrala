import { describe, expect, it } from "vitest";
import {
  IR_SCHEMA_VERSION,
  isCompatibleSchemaVersion,
  majorVersion,
  schemaUri,
} from "./version.js";

describe("schema versioning", () => {
  it("parses major versions", () => {
    expect(majorVersion("1.2.3")).toBe(1);
    expect(majorVersion("12.0.0-beta.1")).toBe(12);
    expect(majorVersion("1.2")).toBeUndefined();
    expect(majorVersion("v1.2.3")).toBeUndefined();
  });

  it("accepts documents of the same major version only", () => {
    const major = majorVersion(IR_SCHEMA_VERSION)!;
    expect(isCompatibleSchemaVersion(IR_SCHEMA_VERSION)).toBe(true);
    expect(isCompatibleSchemaVersion(`${major}.99.0`)).toBe(true);
    expect(isCompatibleSchemaVersion(`${major + 1}.0.0`)).toBe(false);
    expect(isCompatibleSchemaVersion("garbage")).toBe(false);
  });

  it("identifies consumer schemas per major version and strict schemas per exact version", () => {
    const major = majorVersion(IR_SCHEMA_VERSION)!;
    expect(schemaUri("katedrala.architecture")).toBe(`urn:katedrala:schema:architecture:${major}`);
    expect(schemaUri("katedrala.diff", "strict")).toBe(
      `urn:katedrala:schema:diff:${IR_SCHEMA_VERSION}:strict`,
    );
  });
});
