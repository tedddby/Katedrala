/**
 * Framework detectors add framework-level semantics (HTTP controllers, routes, services, repositories,
 * dependency injection, data models, external APIs) on top of the generic structural model.
 *
 * Detectors run after linking, see the linked structure through a {@link DocumentIndex} (adjacency in
 * canonical order) and the raw per-file extractions, and return additions. They never modify generic
 * analysis code paths, keeping framework knowledge separate from architecture analysis.
 */
import type {
  ArchitecturalRole,
  Confidence,
  Diagnostic,
  DocumentIndex,
  EdgeKind,
  EdgeMechanism,
  EntryPointEntry,
  Evidence,
  ExternalEntity,
  FileId,
  NodeId,
  PackageEntity,
  ResolutionMethod,
  SymbolId,
} from "@katedrala/ir";
import type { FileExtraction } from "./extraction.js";

export interface FrameworkContext {
  /** Index over the linked structural document (files, symbols, edges, packages, externals). */
  readonly index: DocumentIndex;
  /** Raw extraction of an analyzed file, for patterns that need argument summaries or initializers. */
  extraction(file: FileId): FileExtraction | undefined;
  /** Packages of the snapshot, for dependency-based applicability checks. */
  readonly packages: readonly PackageEntity[];
  /**
   * Text of a listed non-code project file (e.g. `nest-cli.json`, `schema.prisma`, `serverless.yml`); files
   * read contribute to the project configuration digest.
   */
  readText(path: string): Promise<string | undefined>;
  /** Report a problem as a document diagnostic. */
  report(diagnostic: Diagnostic): void;
}

export interface FrameworkDetector {
  /** Stable identifier, e.g. `express`. */
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  /** Cheap applicability check (e.g. a manifest declares the framework). */
  applies(context: FrameworkContext): boolean;
  detect(context: FrameworkContext): FrameworkFindings | Promise<FrameworkFindings>;
}

export interface RoleAssignment {
  /** The file or symbol playing the role. */
  entity: FileId | SymbolId;
  role: ArchitecturalRole;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface DetectedEdge {
  kind: EdgeKind;
  source: NodeId;
  target: NodeId;
  file: FileId;
  line: number;
  column: number;
  mechanism: EdgeMechanism;
  resolution: ResolutionMethod;
  confidence: Confidence;
  typeOnly?: boolean;
  detail?: string;
}

/** An HTTP endpoint exposed by the application (e.g. an Express route or a NestJS handler). */
export interface DetectedEndpoint {
  protocol: "http" | `x-${string}`;
  /** Upper-case method, or `*` for all methods. */
  method: string;
  /** Normalized path template, e.g. `/users/:id`. */
  path: string;
  /** False when a prefix could not be determined statically. */
  pathComplete: boolean;
  handler: FileId | SymbolId;
  file: FileId;
  line: number;
  column: number;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface DetectedEntryPoint {
  entity: FileId | SymbolId;
  kind: EntryPointEntry["kind"];
  /** What declared it, e.g. `nest-cli.json#entryFile`. */
  source: string;
}

export interface FrameworkFindings {
  roles: RoleAssignment[];
  edges: DetectedEdge[];
  externals: ExternalEntity[];
  endpoints: DetectedEndpoint[];
  entryPoints: DetectedEntryPoint[];
}
