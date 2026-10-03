/**
 * Content-addressed extraction cache keys.
 */
import { createHash } from "node:crypto";
import { PLUGIN_API_VERSION } from "@katedrala/plugin-api";
import { canonicalJson } from "../util/canonical-json.js";

/**
 * Version of the cache entry format and key derivation. Bump it whenever cached entries written by an older
 * Katedrala could be misread (it is part of every key and of every file-system entry).
 */
export const CACHE_FORMAT_VERSION = 1;

/** Everything an extraction depends on (see `FileExtraction` in `@katedrala/plugin-api`). */
export interface ExtractionCacheKeyInput {
  adapterId: string;
  adapterVersion: string;
  /** Digest of the adapter's options (see {@link adapterOptionsDigest}). */
  optionsDigest: string;
  /** Normalized path of the file. */
  path: string;
  language: string;
  dialect?: string | undefined;
  /** `sha256:<hex>` of the normalized content (`contentHash`). */
  contentHash: string;
}

/**
 * The cache key of an extraction: the lower-case hex SHA-256 of a canonical serialization (a JSON array in a
 * fixed order) of {@link CACHE_FORMAT_VERSION}, the plugin API version and every input component. An absent
 * dialect is distinct from an empty one.
 */
export function extractionCacheKey(input: ExtractionCacheKeyInput): string {
  const serialized = JSON.stringify([
    "katedrala-extraction",
    CACHE_FORMAT_VERSION,
    PLUGIN_API_VERSION,
    input.adapterId,
    input.adapterVersion,
    input.optionsDigest,
    input.path,
    input.language,
    input.dialect ?? null,
    input.contentHash,
  ]);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

/**
 * `sha256:<hex>` of an adapter's options in canonical JSON (sorted keys), so that equal options always yield
 * the same cache keys. Absent options digest like `null`.
 */
export function adapterOptionsDigest(options: unknown): string {
  return `sha256:${createHash("sha256")
    .update(canonicalJson(options ?? null), "utf8")
    .digest("hex")}`;
}

/** Whether a string is a well-formed cache key (64 lower-case hex digits). */
export function isExtractionCacheKey(key: string): boolean {
  return /^[0-9a-f]{64}$/.test(key);
}
