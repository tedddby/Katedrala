import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AnalysisLevel,
  AnomalyType,
  ArchitecturalRole,
  DependencyScope,
  DiagnosticCode,
  EdgeKind,
  EdgeMechanism,
  EndpointProtocol,
  EntryPointKind,
  ExternalKind,
  FileRole,
  ImportKind,
  ResolutionMethod,
  RuleProblemCode,
  RuleType,
  Severity,
  SnapshotKind,
  SymbolCategory,
  SymbolKind,
  SymbolModifier,
  VcsType,
  Visibility,
} from "./index.js";
import {
  ANALYSIS_LEVELS,
  ANOMALY_TYPES,
  ARCHITECTURAL_ROLES,
  DEPENDENCY_SCOPES,
  DIAGNOSTIC_CODES,
  DIRECTIONAL_ANOMALY_TYPES,
  EDGE_KINDS,
  EDGE_MECHANISMS,
  ENDPOINT_PROTOCOLS,
  ENTRY_POINT_KINDS,
  EXTENSIBLE_ENUMERATIONS,
  EXTERNAL_KINDS,
  EXTERNAL_NAMESPACES,
  FILE_ROLES,
  IMPORT_KINDS,
  RESOLUTION_METHODS,
  RULE_PROBLEM_CODES,
  RULE_TYPES,
  SEVERITIES,
  SNAPSHOT_KINDS,
  SYMBOL_CATEGORIES,
  SYMBOL_KINDS,
  SYMBOL_KIND_CATEGORY,
  SYMBOL_KIND_PRECEDENCE,
  SYMBOL_MODIFIERS,
  VCS_TYPES,
  VISIBILITIES,
  isExtensionValue,
  severityRank,
  symbolCategoryOf,
} from "./constants.js";

type Known<T> = Exclude<T, `x-${string}`>;

describe("enumeration constants", () => {
  it("list exactly the known members of each type", () => {
    // Compile-time checks: these fail type-checking when a constant and its type drift apart.
    expectTypeOf<(typeof EDGE_KINDS)[number]>().toEqualTypeOf<Known<EdgeKind>>();
    expectTypeOf<(typeof EDGE_MECHANISMS)[number]>().toEqualTypeOf<Known<EdgeMechanism>>();
    expectTypeOf<(typeof RESOLUTION_METHODS)[number]>().toEqualTypeOf<Known<ResolutionMethod>>();
    expectTypeOf<(typeof IMPORT_KINDS)[number]>().toEqualTypeOf<Known<ImportKind>>();
    expectTypeOf<(typeof SYMBOL_KINDS)[number]>().toEqualTypeOf<Known<SymbolKind>>();
    expectTypeOf<(typeof SYMBOL_CATEGORIES)[number]>().toEqualTypeOf<SymbolCategory>();
    expectTypeOf<(typeof SYMBOL_MODIFIERS)[number]>().toEqualTypeOf<Known<SymbolModifier>>();
    expectTypeOf<(typeof VISIBILITIES)[number]>().toEqualTypeOf<Visibility>();
    expectTypeOf<(typeof FILE_ROLES)[number]>().toEqualTypeOf<FileRole>();
    expectTypeOf<(typeof ARCHITECTURAL_ROLES)[number]>().toEqualTypeOf<Known<ArchitecturalRole>>();
    expectTypeOf<(typeof EXTERNAL_KINDS)[number]>().toEqualTypeOf<Known<ExternalKind>>();
    expectTypeOf<(typeof ANOMALY_TYPES)[number]>().toEqualTypeOf<Known<AnomalyType>>();
    expectTypeOf<(typeof RULE_TYPES)[number]>().toEqualTypeOf<Known<RuleType>>();
    expectTypeOf<(typeof DIAGNOSTIC_CODES)[number]>().toEqualTypeOf<Known<DiagnosticCode>>();
    expectTypeOf<(typeof ANALYSIS_LEVELS)[number]>().toEqualTypeOf<AnalysisLevel>();
    expectTypeOf<(typeof SEVERITIES)[number]>().toEqualTypeOf<Severity>();
    expectTypeOf<(typeof VCS_TYPES)[number]>().toEqualTypeOf<Known<VcsType>>();
    expectTypeOf<(typeof SNAPSHOT_KINDS)[number]>().toEqualTypeOf<Known<SnapshotKind>>();
    expectTypeOf<(typeof DEPENDENCY_SCOPES)[number]>().toEqualTypeOf<Known<DependencyScope>>();
    expectTypeOf<(typeof ENTRY_POINT_KINDS)[number]>().toEqualTypeOf<Known<EntryPointKind>>();
    expectTypeOf<(typeof ENDPOINT_PROTOCOLS)[number]>().toEqualTypeOf<Known<EndpointProtocol>>();
    expectTypeOf<(typeof RULE_PROBLEM_CODES)[number]>().toEqualTypeOf<Known<RuleProblemCode>>();
  });

  it("register every extensible enumeration", () => {
    expect(Object.keys(EXTENSIBLE_ENUMERATIONS).sort()).toEqual([
      "AnomalyType",
      "ArchitecturalRole",
      "DependencyScope",
      "DiagnosticCode",
      "EdgeKind",
      "EdgeMechanism",
      "EndpointProtocol",
      "EntryPointKind",
      "ExternalKind",
      "ImportKind",
      "ResolutionMethod",
      "RuleProblemCode",
      "RuleType",
      "SnapshotKind",
      "SymbolKind",
      "SymbolModifier",
      "VcsType",
    ]);
  });

  it("contain no duplicates and only kebab-case values", () => {
    for (const values of [
      EDGE_KINDS,
      EDGE_MECHANISMS,
      RESOLUTION_METHODS,
      IMPORT_KINDS,
      SYMBOL_KINDS,
      SYMBOL_MODIFIERS,
      FILE_ROLES,
      ARCHITECTURAL_ROLES,
      EXTERNAL_KINDS,
      ANOMALY_TYPES,
      RULE_TYPES,
      DIAGNOSTIC_CODES,
      ANALYSIS_LEVELS,
      DEPENDENCY_SCOPES,
      ENDPOINT_PROTOCOLS,
      ENTRY_POINT_KINDS,
      RULE_PROBLEM_CODES,
      SEVERITIES,
      SNAPSHOT_KINDS,
      VCS_TYPES,
      VISIBILITIES,
    ]) {
      expect(new Set(values).size).toBe(values.length);
      for (const value of values) {
        expect(value).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
        expect(isExtensionValue(value)).toBe(false);
      }
    }
  });

  it("assign a category to every symbol kind and a precedence to every kind", () => {
    for (const kind of SYMBOL_KINDS) {
      expect(SYMBOL_CATEGORIES).toContain(SYMBOL_KIND_CATEGORY[kind]);
      expect(symbolCategoryOf(kind)).toBe(SYMBOL_KIND_CATEGORY[kind]);
    }
    expect(symbolCategoryOf("x-widget")).toBeUndefined();
    expect([...SYMBOL_KIND_PRECEDENCE].sort()).toEqual([...SYMBOL_KINDS].sort());
  });

  it("list directional anomaly types among anomaly types", () => {
    for (const type of DIRECTIONAL_ANOMALY_TYPES) expect(ANOMALY_TYPES).toContain(type);
  });

  it("register external namespaces with valid kinds", () => {
    for (const [namespace, entry] of Object.entries(EXTERNAL_NAMESPACES)) {
      expect(namespace).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(EXTERNAL_KINDS).toContain(entry.kind);
    }
  });
});

describe("severityRank", () => {
  it("orders info < warning < error", () => {
    expect(severityRank("info")).toBeLessThan(severityRank("warning"));
    expect(severityRank("warning")).toBeLessThan(severityRank("error"));
  });
});

describe("isExtensionValue", () => {
  it("accepts x- prefixed kebab-case values only", () => {
    expect(isExtensionValue("x-foo")).toBe(true);
    expect(isExtensionValue("x-acme-event")).toBe(true);
    expect(isExtensionValue("x-")).toBe(false);
    expect(isExtensionValue("x-Has Spaces")).toBe(false);
    expect(isExtensionValue("x-acme:god")).toBe(false);
    expect(isExtensionValue("imports")).toBe(false);
  });
});
