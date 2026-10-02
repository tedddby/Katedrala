/**
 * Version of the Katedrala IR schema (semantic versioning, independent of the Katedrala version).
 *
 * - MAJOR: incompatible changes — removing or renaming a field, changing a field's type or meaning, changing an
 *   identifier derivation, removing an enumeration value.
 * - MINOR: compatible additions — new optional fields, new enumeration values, new document kinds, new
 *   union branches.
 * - PATCH: documentation and schema-description fixes only.
 *
 * Tolerant reading (normative for consumers): a consumer that supports major version N must accept every
 * N.x.y document, ignore properties it does not know, and treat enumeration values it does not know as an
 * "other" value (e.g. an unknown symbol kind by its `category`, an unknown edge kind as a generic dependency).
 * The published consumer schemas (`<kind>.schema.json`, `$id` per major version) encode this; the strict
 * schemas (`<kind>.strict.schema.json`) validate exactly the current version and are meant for producers.
 */
export const IR_SCHEMA_VERSION = "1.0.0";

/** Document kinds produced by Katedrala, each with its own JSON Schemas. */
export const DOCUMENT_KINDS = [
  "katedrala.architecture",
  "katedrala.impact",
  "katedrala.diff",
  "katedrala.health",
  "katedrala.explain",
  "katedrala.validation",
  "katedrala.history",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * The `$id` of a published JSON Schema: the tolerant consumer schema is identified per major version
 * (`urn:katedrala:schema:<kind>:<major>`), the strict producer schema per exact version
 * (`urn:katedrala:schema:<kind>:<version>:strict`).
 */
export function schemaUri(kind: DocumentKind, variant: "consumer" | "strict" = "consumer"): string {
  const name = kind.slice("katedrala.".length);
  return variant === "consumer"
    ? `urn:katedrala:schema:${name}:${String(majorVersion(IR_SCHEMA_VERSION))}`
    : `urn:katedrala:schema:${name}:${IR_SCHEMA_VERSION}:strict`;
}

/** Major component of a semantic version string, or undefined when the string is not `x.y.z`. */
export function majorVersion(version: string): number | undefined {
  const match = /^(\d+)\.\d+\.\d+(?:[-+].*)?$/.exec(version);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** Whether a document with the given schema version can be read by this version of the IR. */
export function isCompatibleSchemaVersion(version: string): boolean {
  const major = majorVersion(version);
  return major !== undefined && major === majorVersion(IR_SCHEMA_VERSION);
}
