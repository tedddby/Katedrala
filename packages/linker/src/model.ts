/**
 * Internal records: what the linker knows about files, symbols and module specifiers while it binds. Not
 * exported from the package entry point.
 */
import type {
  EdgeKind,
  ExternalEntity,
  FileId,
  NodeId,
  PackageId,
  Provenance,
  ResolutionMethod,
  SymbolCategory,
  SymbolId,
  SymbolKind,
} from "@katedrala/ir";
import type {
  AdapterProject,
  ExtractedExport,
  ExtractedReference,
  ExtractedSymbol,
  FileExtraction,
  ImportBinding,
} from "@katedrala/plugin-api";
import type { LinkFile } from "./types.js";

/** An import binding of a file, with the index of the import that introduced it. */
export interface ImportBindingRecord {
  /** Index into the file's `extraction.imports` (and `FileRecord.moduleTargets`). */
  readonly importIndex: number;
  readonly binding: ImportBinding;
}

/** A file's exports, indexed for export resolution. */
export interface ExportTable {
  /** Local exports (no `from`) by exported name, in source order. */
  readonly local: ReadonlyMap<string, readonly ExtractedExport[]>;
  /** The first re-export (`export { a as b } from`, `export * as ns from`) per exported name. */
  readonly indirect: ReadonlyMap<string, ExtractedExport & { from: string }>;
  /** `export * from` entries in source order. */
  readonly stars: readonly (ExtractedExport & { from: string })[];
}

/** A listed file and everything the linker derived about it. */
export interface FileRecord {
  readonly input: LinkFile;
  readonly path: string;
  readonly id: FileId;
  readonly extraction: FileExtraction | undefined;
  /** Id of the adapter that processed the file. */
  readonly adapterId: string | undefined;
  /** The project of that adapter, when one was prepared. */
  readonly project: AdapterProject | undefined;
  /** The owning package: the nearest ancestor-or-self directory with a manifest. */
  readonly packageId: PackageId | undefined;
  /** Declared symbols in source order (duplicates and invalid local names removed). */
  readonly symbols: readonly SymbolRecord[];
  readonly symbolsByLocalName: ReadonlyMap<string, SymbolRecord>;
  /** Import bindings by local name (the first binding of a name wins). */
  readonly bindings: ReadonlyMap<string, ImportBindingRecord>;
  /** Resolved module of each import, by import index; filled by the import stage. */
  readonly moduleTargets: ModuleTarget[];
  readonly exportTable: ExportTable;
  /**
   * Heritage references (`extends`, `embed`, then `implements`, `derive`; each in source order) by the local
   * name of the declaring symbol.
   */
  readonly heritage: ReadonlyMap<string, readonly ExtractedReference[]>;
}

/** A declared symbol and its relationships to other symbols. */
export interface SymbolRecord {
  readonly id: SymbolId;
  /** Qualified name plus disambiguator: the part of the identifier after `#`. */
  readonly localName: string;
  /** Escaped qualified name, taken from the local name (before the first `~`). */
  readonly qualifiedName: string;
  /** Simple, unescaped name. */
  readonly name: string;
  readonly kind: SymbolKind;
  readonly category: SymbolCategory;
  /** Whether the symbol is a static member (modifier `static` or a `-static` disambiguator). */
  readonly isStatic: boolean;
  readonly file: FileRecord;
  readonly extracted: ExtractedSymbol;
  /** Lexically enclosing symbol. */
  parent: SymbolRecord | undefined;
  /** Semantic owner for members declared outside their type (from `receiver`). */
  owner: SymbolRecord | ExternalEntity | undefined;
  /** Canonical declaration of a partial type split across files. */
  partOf: SymbolRecord | undefined;
}

/** The outcome of resolving a module specifier. */
export type ModuleTarget =
  | {
      readonly status: "resolved";
      /** Listed files the specifier denotes, sorted by path; never empty. */
      readonly files: readonly FileRecord[];
      readonly method: ResolutionMethod;
      readonly confidence: number;
      readonly unit?: string;
      /** Trailing names to look up from the resolved module's exports. */
      readonly members?: readonly string[];
    }
  | {
      readonly status: "external";
      readonly external: ExternalEntity;
      readonly method: ResolutionMethod;
      readonly confidence: number;
    }
  | { readonly status: "builtin"; readonly external: ExternalEntity }
  | {
      /**
       * Resolved to files of the snapshot that are not listed: they exist (project resolvers match the
       * snapshot's files) but are excluded from the analysis, so their names cannot be looked up.
       */
      readonly status: "excluded";
      /** The files, sorted; never empty. */
      readonly paths: readonly string[];
      readonly method: ResolutionMethod;
      readonly unit?: string;
    }
  | { readonly status: "unresolved"; readonly reason: string; readonly method?: ResolutionMethod }
  | { readonly status: "non-literal" };

/** One observation of a relationship, before aggregation into edges. */
export interface Observation {
  readonly kind: EdgeKind;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly provenance: Provenance;
}
