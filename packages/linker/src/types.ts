/**
 * Public input and output types of the linker.
 */
import type {
  Diagnostic,
  DirectoryEntity,
  DocumentDetail,
  DocumentLimits,
  EdgeEntity,
  EntryPointEntry,
  ExternalEntity,
  FileAnalysis,
  FileEntity,
  FileRole,
  LanguageSummary,
  PackageEntity,
  RepositoryStats,
  SymbolEntity,
} from "@katedrala/ir";
import type { AdapterProject, FileExtraction } from "@katedrala/plugin-api";

/** One listed file of the snapshot, as prepared by discovery and extraction. */
export interface LinkFile {
  /** Normalized path relative to the analysis root (IR path convention: POSIX, no leading `./`). */
  path: string;
  /** Size in bytes as stored. */
  size: number;
  /** Language identifier, e.g. `typescript`, `json`, `unknown`. */
  language: string;
  /** Adapter-specific dialect, e.g. `tsx`. */
  dialect?: string;
  role: FileRole;
  /**
   * How deeply the file was analyzed. The stage that sets `failed` or `skipped` reports why (core's
   * extraction emits `read-failed`, `parse-failed` and `file-too-large`); the linker does not repeat it.
   */
  status: FileAnalysis["status"];
  /** Why the file was skipped or failed (e.g. `file-too-large`). */
  reason?: string;
  /** The language adapter that processed the file. */
  adapter?: { id: string; version: string };
  /** Line count of the normalized text, for files whose content was read. */
  lines?: number;
  /** `sha256:<hex>` of the normalized text, for files whose content was read. */
  hash?: string;
  /** The adapter's extraction, for parsed and partially parsed files. */
  extraction?: FileExtraction;
}

/** Project-level knowledge prepared by one language adapter for the snapshot. */
export interface LinkProject {
  /** Identifier of the adapter that created the project (matches `LinkFile.adapter.id`). */
  adapterId: string;
  project: AdapterProject;
}

/** Everything the linker needs to build the structural part of an architecture document. */
export interface LinkInput {
  /** Every listed file of the snapshot (any order; paths must be unique and normalized). */
  files: readonly LinkFile[];
  /** One project per adapter that prepared one (adapter ids must be unique). */
  projects: readonly LinkProject[];
  /** Name of the repository, used as the name of the root directory. */
  repositoryName: string;
  /** How much detail the document contains (symbols listed, relationship granularity). */
  detail: DocumentDetail;
  /** List bounds (the linker applies `maxProvenancePerEdge`). */
  limits: DocumentLimits;
}

/**
 * The structural part of an architecture document. Every array is in the canonical order of docs/IR.md, so
 * the sections can be placed into a document as they are.
 */
export interface LinkResult {
  directories: DirectoryEntity[];
  packages: PackageEntity[];
  files: FileEntity[];
  /** Empty when `detail.symbols` is false. */
  symbols: SymbolEntity[];
  externals: ExternalEntity[];
  edges: EdgeEntity[];
  entryPoints: EntryPointEntry[];
  diagnostics: Diagnostic[];
  /** Sorted by descending line count, then by language. */
  languages: LanguageSummary[];
  stats: Omit<RepositoryStats, "endpoints">;
}
