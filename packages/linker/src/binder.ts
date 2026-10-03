/**
 * Binding: following import bindings and re-export chains to declarations (ECMAScript `ResolveExport`
 * semantics plus the CommonJS interop documented in the plugin-api extraction contract), walking member
 * paths (module namespaces, lexical and owned children, declared types, initializers, base types),
 * resolving unbound names (an adapter's name resolver, else the global scope) and instance types.
 *
 * CommonJS interop: the value of a module (`require()`, `import x = require()`, the default import of a
 * module without a default export, `require("./x").y`) is its export assignment (`=`) when that binds.
 * Members of that value are looked up among the module's other named exports first (`module.exports.y =`
 * after `module.exports = X`), then on the assigned declaration. Otherwise the value is the module
 * namespace: an export assignment without targets is how adapters report `module.exports = { a, b }`, whose
 * properties are the named exports `a` and `b`.
 *
 * Termination and determinism: one export query shares an ES resolve set, so every (module, name) pair is
 * visited at most once per query; queries started recursively by member walks and type lookups are guarded
 * by in-progress sets. A result is memoized only when it was computed without cutting such a recursion, so
 * memoized values never depend on the order in which queries happen. `export *` modules are searched only
 * when their star closure can provide the name, which skips work without changing any result.
 */
import { SYMBOL_KIND_PRECEDENCE, compareStrings, sortedUnique } from "@katedrala/ir";
import type {
  ExportEntry,
  ExternalEntity,
  FileId,
  ResolutionMethod,
  SymbolId,
} from "@katedrala/ir";
import type {
  BindingRef,
  NameCandidate,
  NameResolver,
  ReferenceKind,
  ReferenceTarget,
  TypeRef,
} from "@katedrala/plugin-api";
import type { FileRecord, ModuleTarget, SymbolRecord } from "./model.js";
import type { SpecifierPurpose } from "./modules.js";
import { clampConfidence } from "./modules.js";
import { compareById, compareExportEntries } from "./order.js";

/** What a name denotes after binding. */
export type Denotation =
  /** Declarations sharing one name (several when, e.g., a value and a type do), sorted by id. */
  | { readonly type: "symbols"; readonly symbols: readonly SymbolRecord[] }
  /**
   * A module namespace (several files for package-level modules), sorted by path. In modules without an
   * extraction (data, styles, assets, files that were not parsed), `path` is the member path reached
   * inside them, which cannot be looked up.
   */
  | {
      readonly type: "module";
      readonly files: readonly FileRecord[];
      readonly path?: readonly string[];
    }
  /**
   * An external module with the member path reached inside it. `alternatives` are further external modules
   * that may provide the binding instead (a name that only several external star modules can provide).
   */
  | {
      readonly type: "external";
      readonly external: ExternalEntity;
      readonly path: readonly string[];
      readonly alternatives?: readonly ExternalEntity[];
    };

type ExternalDenotation = Extract<Denotation, { type: "external" }>;

/** A (possibly partial) binding of a reference, an export or a type. */
export interface Bound {
  readonly denotation: Denotation;
  /** Paths of the re-exporting files traversed, in order. */
  readonly via: readonly string[];
  /** The final resolution step so far. */
  readonly method: ResolutionMethod;
  readonly confidence: number;
  /** Whether the denotation is accessed as an instance (members prefer non-static declarations). */
  readonly instance: boolean;
  /** Member names that could not be resolved (partial binding: the denotation is the deepest entity). */
  readonly unresolvedPath?: readonly string[];
  /**
   * For the value of a module with an export assignment and further named exports: that module, whose named
   * exports are members of the value, preferred over members of the assigned declaration. Only member walks
   * read it; their results never carry it.
   */
  readonly exportsOf?: readonly FileRecord[];
  /**
   * The binding is a guess among `export *` modules whose names are unknown (see {@link openStarBinding}).
   * Enclosing star exports prefer star modules known to provide the name over it, and never find a guess
   * ambiguous with them.
   */
  readonly open?: true;
}

/** Every binding of a reference target, and why there is none. */
export interface Resolution {
  readonly bounds: readonly Bound[];
  /**
   * Nothing is bound because the target is a member of a value whose type this analysis cannot determine
   * (a call result without a declared return type, a value reached through an unresolved member path).
   */
  readonly untyped: boolean;
  /**
   * Nothing is bound because the target may be provided by files whose names cannot be looked up: files
   * excluded from the analysis, or code that was not analyzed (re-exported with `export *`).
   */
  readonly excluded: boolean;
}

/** Observation confidence per heuristic resolution step. */
export const CONFIDENCE = {
  "declared-type": 0.9,
  "constructor-type": 0.9,
  "return-type": 0.8,
  "inherited-member": 0.85,
  "global-scope": 0.8,
  /** A member path that could only be resolved partially. */
  partial: 0.7,
} as const;

/** Maximum number of base-type levels searched for inherited members. */
export const MAX_INHERITANCE_DEPTH = 8;

/** Whether a reference occurs in a type position or a value position (used to choose among symbols). */
export type Position = "type" | "value";

/** The position of a reference kind. */
export function positionOf(kind: ReferenceKind): Position {
  switch (kind) {
    case "type":
    case "extends":
    case "implements":
    case "embed":
    case "derive":
      return "type";
    case "call":
    case "new":
    case "construct":
    case "tagged-template":
    case "macro":
    case "decorator":
    case "jsx":
    case "value":
      return "value";
  }
}

const CONSTRUCTIBLE_KINDS: ReadonlySet<string> = new Set(["class", "struct", "record"]);

/** Whether a symbol can be instantiated (a class, struct or record). */
export function isConstructible(symbol: SymbolRecord): boolean {
  return CONSTRUCTIBLE_KINDS.has(symbol.kind);
}

const PRECEDENCE = new Map<string, number>(
  SYMBOL_KIND_PRECEDENCE.map((kind, index) => [kind, index]),
);

function positionRank(symbol: SymbolRecord, position: Position): number {
  if (position === "type") {
    return symbol.category === "type" ? 0 : symbol.category === "namespace" ? 1 : 2;
  }
  const valueLike =
    symbol.category === "callable" ||
    symbol.category === "value" ||
    isConstructible(symbol) ||
    symbol.kind === "enum";
  return valueLike ? 0 : symbol.category === "namespace" ? 1 : 2;
}

function comparePick(a: SymbolRecord, b: SymbolRecord, position: Position): number {
  return (
    positionRank(a, position) - positionRank(b, position) ||
    (PRECEDENCE.get(a.kind) ?? PRECEDENCE.size) - (PRECEDENCE.get(b.kind) ?? PRECEDENCE.size) ||
    compareStrings(a.kind, b.kind) ||
    compareStrings(a.id, b.id)
  );
}

/**
 * The declaration a reference denotes among several sharing its name: the one fitting the position (types
 * for type positions; callables, values and instantiable types for value positions), then by the IR's kind
 * precedence, then by id.
 */
export function pickSymbol(
  symbols: readonly SymbolRecord[],
  position: Position,
): SymbolRecord | undefined {
  let best: SymbolRecord | undefined;
  for (const symbol of symbols) {
    if (best === undefined || comparePick(symbol, best, position) < 0) best = symbol;
  }
  return best;
}

/** What the binder needs from the rest of the linker. */
export interface BinderHost {
  /** Every listed file by path. */
  readonly files: ReadonlyMap<string, FileRecord>;
  /** The module a specifier written in a file outside of an import entry denotes. */
  specifier(file: FileRecord, specifier: string, purpose: SpecifierPurpose): ModuleTarget;
  /** A child module of a module file (`AdapterProject.resolveMember`). */
  member(moduleFile: FileRecord, name: string): ModuleTarget | undefined;
  /** The name resolver prepared by the file's adapter project, when it has one. */
  nameResolver(file: FileRecord): NameResolver | undefined;
  /** Report a failing name resolver. */
  nameLookupFailed(file: FileRecord, error: unknown): void;
  /** Symbols declared in the global scope with this local name, sorted by id. */
  globals(name: string): readonly SymbolRecord[];
}

const AMBIGUOUS = Symbol("ambiguous");
const EXCLUDED = Symbol("excluded");
/**
 * Result of an export query: a binding, nothing (`null`), an ambiguous star export, or a name that may be
 * provided by files whose names cannot be looked up (`EXCLUDED`: files excluded from the analysis, code that
 * was not analyzed).
 */
type ExportResult = Bound | null | typeof AMBIGUOUS | typeof EXCLUDED;

function isBound(result: ExportResult): result is Bound {
  return result !== null && result !== AMBIGUOUS && result !== EXCLUDED;
}

function bound(
  denotation: Denotation,
  via: readonly string[],
  confidence: number,
  method: ResolutionMethod = "import-binding",
): Bound {
  return { denotation, via, method, confidence, instance: false };
}

function moduleDenotation(files: readonly FileRecord[], path: readonly string[] = []): Denotation {
  return path.length === 0 ? { type: "module", files } : { type: "module", files, path };
}

function externalDenotation(external: ExternalEntity, path: readonly string[]): Denotation {
  return { type: "external", external, path };
}

/** An external denotation with `members` appended to its path (keeping its alternatives). */
function deeper(denotation: ExternalDenotation, members: readonly string[]): Denotation {
  return members.length === 0
    ? denotation
    : { ...denotation, path: [...denotation.path, ...members] };
}

/** The path inside an external module that an imported name adds (none for namespace-like imports). */
function namedPath(imported: string): string[] {
  return imported === "*" || imported === "=" || imported === "default" ? [] : [imported];
}

/**
 * Files without an extraction (JSON, styles, assets, code that was not analyzed) are opaque: their names
 * cannot be looked up.
 */
function isOpaque(files: readonly FileRecord[]): boolean {
  return files.every((file) => file.extraction === undefined);
}

/**
 * Whether a module consists of files no adapter analyzes (data, styles, assets, other languages). The other
 * files without an extraction are code that was not analyzed (skipped, failed), which may declare any name.
 */
export function isDataModule(files: readonly FileRecord[]): boolean {
  return files.every(
    (file) => file.extraction === undefined && file.input.status === "unsupported",
  );
}

function denotationKey(denotation: Denotation): string {
  switch (denotation.type) {
    case "symbols":
      return `s\u0000${denotation.symbols.map((symbol) => symbol.id).join("\u0000")}`;
    case "module":
      return `m\u0000${denotation.files.map((file) => file.path).join("\u0000")}\u0001${(denotation.path ?? []).join("\u0000")}`;
    case "external":
      return `e\u0000${denotation.external.id}\u0000${denotation.path.join("\u0000")}\u0001${(denotation.alternatives ?? []).map((external) => external.id).join("\u0000")}`;
  }
}

/** Merge the bindings of one name: symbol denotations are united, otherwise the first one wins. */
function mergeBounds(bounds: readonly Bound[]): Bound | null {
  const [first] = bounds;
  if (first === undefined) return null;
  if (bounds.length === 1) return first;
  const symbols = new Map<SymbolId, SymbolRecord>();
  for (const item of bounds) {
    if (item.denotation.type !== "symbols") return first;
    for (const symbol of item.denotation.symbols) symbols.set(symbol.id, symbol);
  }
  return {
    ...first,
    denotation: { type: "symbols", symbols: [...symbols.values()].sort(compareById) },
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

function pushByName<K, V>(map: Map<K, Map<string, V[]>>, key: K, name: string, value: V): void {
  let byName = map.get(key);
  if (byName === undefined) {
    byName = new Map();
    map.set(key, byName);
  }
  push(byName, name, value);
}

function groupKey(symbol: SymbolRecord): string {
  return `${symbol.file.path}\u0000${symbol.qualifiedName}`;
}

function isSymbolRecord(owner: SymbolRecord | ExternalEntity): owner is SymbolRecord {
  return "localName" in owner;
}

/** Whether a symbol is declared in a namespace (or module) declaration. */
function isNamespaceMember(symbol: SymbolRecord): boolean {
  return symbol.parent?.category === "namespace";
}

/** A binding without `exportsOf`, which applies to the member walk starting from it only. */
function withoutExportsOf(item: Bound): Bound {
  if (item.exportsOf === undefined) return item;
  const { exportsOf: _exportsOf, ...rest } = item;
  return rest;
}

/** The walk state after a member found among the exports of a module. */
function exportedMember(state: Bound, next: Bound): Bound {
  return {
    ...state,
    denotation: next.denotation,
    via: [...state.via, ...next.via],
    method: "namespace-member",
    confidence: Math.min(state.confidence, next.confidence),
    instance: false,
  };
}

function nothing(): Resolution {
  return { bounds: [], untyped: false, excluded: false };
}

/** Names a file exports itself (not through `export *`), except `default` and `=`, which stars never provide. */
function ownExportNames(file: FileRecord): string[] {
  const names: string[] = [];
  const add = (name: string): void => {
    if (name !== "default" && name !== "=" && name !== "*") names.push(name);
  };
  for (const name of file.exportTable.local.keys()) add(name);
  for (const name of file.exportTable.indirect.keys()) add(name);
  if (file.extraction?.exports.length === 0) {
    // Files without export lists export the top-level symbols the adapter marked exported.
    for (const symbol of file.symbols) {
      if (symbol.parent === undefined && symbol.extracted.exported === true) add(symbol.name);
    }
  }
  return names;
}

/** Two ascending lists of distinct positions merged into one. */
function ascending(a: readonly number[], b: readonly number[]): readonly number[] {
  if (b.length === 0) return a;
  if (a.length === 0) return b;
  return [...a, ...b].sort((x, y) => x - y);
}

/**
 * A module re-exported with `export *` that may provide a name, although its names are unknown. `path` is the
 * member path of the name in the module (the name itself unless it was re-exported under another one).
 */
type OpenCandidate =
  | {
      readonly type: "external";
      readonly external: ExternalEntity;
      readonly path?: readonly string[];
      readonly confidence: number;
    }
  /** Code that was not analyzed (skipped, failed): a name it provides is kept as a member path. */
  | {
      readonly type: "unanalyzed";
      readonly files: readonly FileRecord[];
      readonly path?: readonly string[];
      readonly confidence: number;
    }
  /** Files excluded from the analysis, or a module reaching such files through `export *`. */
  | { readonly type: "unknown"; readonly key: string }
  /** The guess of a star module that re-exports such modules itself (an `open` binding). */
  | { readonly type: "guess"; readonly bound: Bound };

function openCandidateKey(candidate: OpenCandidate): string {
  switch (candidate.type) {
    case "external":
      return `e\u0000${candidate.external.id}`;
    case "unanalyzed":
      return `m\u0000${candidate.files.map((file) => file.path).join("\u0000")}`;
    case "unknown":
      return candidate.key;
    case "guess":
      return `g\u0000${denotationKey(candidate.bound.denotation)}`;
  }
}

/** The candidates a guess was made among. */
function guessedCandidates(guess: Bound): OpenCandidate[] {
  const { denotation, confidence } = guess;
  switch (denotation.type) {
    case "external":
      return [denotation.external, ...(denotation.alternatives ?? [])].map((external) => ({
        type: "external",
        external,
        path: denotation.path,
        confidence,
      }));
    case "module":
      return [
        {
          type: "unanalyzed",
          files: denotation.files,
          ...(denotation.path === undefined ? {} : { path: denotation.path }),
          confidence,
        },
      ];
    case "symbols":
      return [{ type: "unknown", key: `s\u0000${denotationKey(denotation)}` }];
  }
}

function openBound(denotation: Denotation, file: FileRecord, confidence: number): Bound {
  return { ...bound(denotation, [file.path], confidence), open: true };
}

/**
 * The binding of a name no star module is known to provide, when star modules whose names are unknown may
 * provide it. Presumably exactly one of the n distinct candidates does, so the confidence is at most 1/n.
 * External modules are bound (several as `alternatives`); else a single module that was not analyzed, with
 * the name as its member path; else (only files whose names cannot be looked up) nothing can be bound:
 * `EXCLUDED`. Bindings are `open`; the guess of an enclosed star export counts with each module it was made
 * among.
 */
function openStarBinding(
  file: FileRecord,
  name: string,
  candidates: readonly OpenCandidate[],
): ExportResult {
  const distinct = new Map<string, OpenCandidate>();
  for (const candidate of candidates) {
    const key = openCandidateKey(candidate);
    if (!distinct.has(key)) distinct.set(key, candidate);
  }
  const [single, ...others] = distinct.values();
  if (single === undefined) return null;
  // Keeps the files the enclosed guess traversed.
  if (single.type === "guess" && others.length === 0) return single.bound;
  const seen = new Set<string>();
  const externals: Extract<OpenCandidate, { type: "external" }>[] = [];
  const unanalyzed: Extract<OpenCandidate, { type: "unanalyzed" }>[] = [];
  for (const candidate of distinct.values()) {
    const items = candidate.type === "guess" ? guessedCandidates(candidate.bound) : [candidate];
    for (const item of items) {
      const key = openCandidateKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      if (item.type === "external") externals.push(item);
      else if (item.type === "unanalyzed") unanalyzed.push(item);
    }
  }
  const share = 1 / seen.size;
  const [first, ...rest] = externals;
  if (first !== undefined) {
    const path = first.path ?? [name];
    const denotation: Denotation =
      rest.length === 0
        ? externalDenotation(first.external, path)
        : {
            type: "external",
            external: first.external,
            path,
            alternatives: rest.map((item) => item.external),
          };
    return openBound(
      denotation,
      file,
      Math.min(share, ...externals.map((item) => item.confidence)),
    );
  }
  const [module] = unanalyzed;
  if (module !== undefined && seen.size === 1) {
    return openBound(
      moduleDenotation(module.files, module.path ?? [name]),
      file,
      module.confidence,
    );
  }
  return EXCLUDED;
}

/** What the `export *` closure of a file provides. */
interface StarClosure {
  /** Names exported by the file and by every file it reaches through `export *`. */
  readonly names: ReadonlySet<string>;
  /**
   * Whether it reaches modules whose names are unknown (externals, files excluded from the analysis, code
   * that was not analyzed).
   */
  readonly open: boolean;
}

/** The star exports of a file that can provide a name, by position in `exportTable.stars`. */
interface StarIndex {
  /** Per name, the positions of the star exports whose closure provides it, ascending. */
  readonly byName: ReadonlyMap<string, readonly number[]>;
  /** Positions of the star exports that may provide any name, ascending. */
  readonly open: readonly number[];
}

type TypeQuery = "declared" | "return" | "initializer";

/** Binds names to declarations across files. Construct after imports were resolved. */
export class Binder {
  readonly #host: BinderHost;
  readonly #files: readonly FileRecord[];
  /** Symbols of one file sharing a qualified name (merged declarations of different kinds). */
  readonly #groups = new Map<string, SymbolRecord[]>();
  readonly #lexical = new Map<SymbolRecord, Map<string, SymbolRecord[]>>();
  readonly #owned = new Map<SymbolRecord, SymbolRecord[]>();
  readonly #ownedByName = new Map<SymbolRecord, Map<string, SymbolRecord[]>>();
  readonly #partials = new Map<SymbolRecord, SymbolRecord[]>();
  #ownersResolved = false;
  /** Number of recursions cut so far; a result is memoized only if no cut happened while computing it. */
  #cuts = 0;
  readonly #exportMemo = new Map<string, ExportResult>();
  readonly #exportsInProgress = new Set<string>();
  readonly #typeMemo = new Map<string, Bound | null>();
  readonly #typesInProgress = new Set<string>();
  readonly #basesMemo = new Map<SymbolRecord, readonly Denotation[]>();
  readonly #basesInProgress = new Set<SymbolRecord>();
  /** Star closures and star indexes depend on export tables and module resolution only. */
  readonly #closures = new Map<FileRecord, StarClosure>();
  readonly #starIndexes = new Map<FileRecord, StarIndex>();

  /**
   * @param files - every listed file, sorted by path; symbols must have `parent` and `partOf` assigned.
   * @param host - access to module resolution, name resolvers and the global scope.
   */
  constructor(files: readonly FileRecord[], host: BinderHost) {
    this.#host = host;
    this.#files = files;
    for (const file of files) {
      for (const symbol of file.symbols) {
        push(this.#groups, groupKey(symbol), symbol);
        if (symbol.parent !== undefined) {
          pushByName(this.#lexical, symbol.parent, symbol.name, symbol);
        }
        if (symbol.partOf !== undefined) push(this.#partials, symbol.partOf, symbol);
      }
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Resolve the semantic owner of every symbol with a `receiver` (members declared outside their type), then
   * make owned members visible to member lookups. Call once, before binding references.
   */
  resolveOwners(): void {
    for (const file of this.#files) {
      for (const symbol of file.symbols) {
        const receiver = symbol.extracted.receiver;
        if (receiver === undefined) continue;
        const owner = this.#resolveTarget(file, receiver.type.ref, symbol.localName).find(
          (item) => item.unresolvedPath === undefined,
        );
        if (owner === undefined) continue;
        if (owner.denotation.type === "symbols") {
          const picked = pickSymbol(owner.denotation.symbols, "type");
          if (picked !== undefined && picked !== symbol && picked !== symbol.parent) {
            symbol.owner = picked;
          }
        } else if (owner.denotation.type === "external") {
          symbol.owner = owner.denotation.external;
        }
      }
    }
    for (const file of this.#files) {
      for (const symbol of file.symbols) {
        const owner = symbol.owner;
        if (owner === undefined || !isSymbolRecord(owner)) continue;
        push(this.#owned, owner, symbol);
        pushByName(this.#ownedByName, owner, symbol.name, symbol);
      }
    }
    this.#ownersResolved = true;
    // Results computed before owned members became visible may be incomplete.
    this.#exportMemo.clear();
    this.#typeMemo.clear();
    this.#basesMemo.clear();
  }

  /** Every binding of a reference target written in `file` (several for ambiguous unbound names). */
  resolveTarget(
    file: FileRecord,
    target: ReferenceTarget,
    from: string | undefined,
  ): readonly Bound[] {
    return this.#resolveTarget(file, target, from);
  }

  /**
   * Bind a reference target and say why nothing was bound: `untyped` when the target is a member of a value
   * whose type this analysis cannot determine (a call result without a declared return type, a value reached
   * through an unresolved member path), `excluded` when it may be provided by files whose names cannot be
   * looked up (excluded from the analysis, or code that was not analyzed); otherwise a binding should exist
   * but does not (an unknown name, a member a module does not export).
   */
  resolveReference(
    file: FileRecord,
    target: ReferenceTarget,
    from: string | undefined,
  ): Resolution {
    return this.#resolveReference(file, target, from);
  }

  /**
   * The export entries of a file in canonical order: declarations each name denotes (resolved through
   * re-exports) and the resolved module of re-exports.
   *
   * @param includeSymbols - whether to list `symbols` (false when the document omits symbols).
   */
  exportEntries(file: FileRecord, includeSymbols: boolean): ExportEntry[] {
    const entries: ExportEntry[] = [];
    for (const extracted of file.extraction?.exports ?? []) {
      const symbols: SymbolId[] = [];
      let target: FileId | ExternalEntity["id"] | undefined;
      if (extracted.from !== undefined) {
        const module = this.#host.specifier(file, extracted.from, "re-export");
        if (module.status === "resolved") target = module.files[0]?.id;
        else if (module.status === "external" || module.status === "builtin") {
          target = module.external.id;
        }
        const imported = extracted.imported ?? extracted.name;
        if (extracted.name !== "*" && imported !== "*") {
          const result = this.#importedFromTarget(module, imported, undefined);
          if (isBound(result) && result.denotation.type === "symbols") {
            symbols.push(...result.denotation.symbols.map((symbol) => symbol.id));
          }
        }
      } else {
        for (const binding of extracted.targets ?? []) {
          const result = this.#exportTarget(file, binding, new Set());
          if (isBound(result) && result.denotation.type === "symbols") {
            symbols.push(...result.denotation.symbols.map((symbol) => symbol.id));
          }
        }
      }
      entries.push({
        name: extracted.name,
        ...(includeSymbols && symbols.length > 0 ? { symbols: sortedUnique(symbols) } : {}),
        ...(extracted.from === undefined ? {} : { from: extracted.from }),
        ...(target === undefined ? {} : { target }),
        typeOnly: extracted.typeOnly,
      });
    }
    return entries.sort(compareExportEntries);
  }

  /** Symbols of `file` that are targets of the file's own (local) exports, including `default` and `=`. */
  locallyExported(file: FileRecord): Set<SymbolRecord> {
    const exported = new Set<SymbolRecord>();
    for (const extracted of file.extraction?.exports ?? []) {
      if (extracted.from !== undefined) continue;
      for (const binding of extracted.targets ?? []) {
        const result = this.#exportTarget(file, binding, new Set());
        if (!isBound(result) || result.denotation.type !== "symbols") continue;
        for (const symbol of result.denotation.symbols) {
          if (symbol.file === file) exported.add(symbol);
        }
      }
    }
    return exported;
  }

  // ─── Export resolution ─────────────────────────────────────────────────────

  /** A memoized export query with a fresh resolve set. */
  #exportFresh(file: FileRecord, name: string): ExportResult {
    const key = `${file.path}\u0000${name}`;
    const memo = this.#exportMemo.get(key);
    if (memo !== undefined) return memo;
    if (this.#exportsInProgress.has(key)) {
      this.#cuts++;
      return null;
    }
    this.#exportsInProgress.add(key);
    const cuts = this.#cuts;
    const result = this.#exportIn(file, name, new Set());
    this.#exportsInProgress.delete(key);
    if (this.#cuts === cuts) this.#exportMemo.set(key, result);
    return result;
  }

  /** ES `ResolveExport(name, resolveSet)` on one file. */
  #exportIn(file: FileRecord, name: string, set: Set<string>): ExportResult {
    const key = `${file.path}\u0000${name}`;
    if (set.has(key)) return null;
    set.add(key);
    const extraction = file.extraction;
    // Code that was not analyzed may export any name; files no adapter analyzes export none.
    if (extraction === undefined) return isDataModule([file]) ? null : EXCLUDED;
    const table = file.exportTable;
    const locals = table.local.get(name);
    if (locals !== undefined) {
      const bounds: Bound[] = [];
      let ambiguous = false;
      let excluded = false;
      for (const entry of locals) {
        for (const binding of entry.targets ?? []) {
          const result = this.#exportTarget(file, binding, set);
          if (result === AMBIGUOUS) ambiguous = true;
          else if (result === EXCLUDED) excluded = true;
          else if (result !== null) bounds.push(result);
        }
      }
      return mergeBounds(bounds) ?? (ambiguous ? AMBIGUOUS : excluded ? EXCLUDED : null);
    }
    const indirect = table.indirect.get(name);
    if (indirect !== undefined) {
      const module = this.#host.specifier(file, indirect.from, "re-export");
      const result = this.#importedFromTarget(module, indirect.imported ?? indirect.name, set);
      return isBound(result) ? { ...result, via: [file.path, ...result.via] } : result;
    }
    // Neither `default` nor `=` is ever provided by `export *`.
    if (name === "default" || name === "=") return null;
    if (table.stars.length > 0) return this.#starExport(file, name, set);
    if (extraction.exports.length === 0) return this.#implicitExport(file, name);
    return null;
  }

  /**
   * `export * from` resolution: every star module that can provide the name is searched; different results
   * make the name ambiguous (ES semantics). Star modules whose names are unknown (externals, files excluded
   * from the analysis, code that was not analyzed) may provide any name; they, and the guesses of enclosed
   * star exports, count only when no star module is known to provide the name (see {@link openStarBinding}).
   */
  #starExport(file: FileRecord, name: string, set: Set<string>): ExportResult {
    const stars = file.exportTable.stars;
    const index = this.#starIndexOf(file);
    let found: Bound | null = null;
    const open: OpenCandidate[] = [];
    for (const position of ascending(index.byName.get(name) ?? [], index.open)) {
      const entry = stars[position];
      if (entry === undefined) continue;
      const module = this.#host.specifier(file, entry.from, "re-export");
      switch (module.status) {
        case "resolved": {
          if (isOpaque(module.files)) {
            // Searched only when not every file is data (see #closureOf).
            open.push({ type: "unanalyzed", files: module.files, confidence: module.confidence });
            break;
          }
          const result = this.#inModule(module.files, name, set);
          if (result === AMBIGUOUS) return AMBIGUOUS;
          if (result === EXCLUDED) {
            const paths = module.files.map((reached) => reached.path);
            open.push({ type: "unknown", key: `r\u0000${paths.join("\u0000")}` });
          }
          if (!isBound(result)) break;
          const candidate: Bound = {
            ...result,
            via: [file.path, ...result.via],
            confidence: Math.min(result.confidence, module.confidence),
          };
          if (candidate.open === true) open.push({ type: "guess", bound: candidate });
          else if (found === null) found = candidate;
          else if (denotationKey(found.denotation) !== denotationKey(candidate.denotation)) {
            return AMBIGUOUS;
          }
          break;
        }
        case "external":
          open.push({ type: "external", external: module.external, confidence: module.confidence });
          break;
        case "builtin":
          open.push({ type: "external", external: module.external, confidence: 1 });
          break;
        case "excluded":
          open.push({ type: "unknown", key: `x\u0000${module.paths.join("\u0000")}` });
          break;
        case "unresolved":
        case "non-literal":
          break;
      }
    }
    return found ?? openStarBinding(file, name, open);
  }

  /**
   * Which star exports of a file can provide which names: a star module whose closure has the name (or may
   * have any name) is a candidate; the others cannot provide it, so searching them would only return null.
   */
  #starIndexOf(file: FileRecord): StarIndex {
    const memo = this.#starIndexes.get(file);
    if (memo !== undefined) return memo;
    const byName = new Map<string, number[]>();
    const open: number[] = [];
    file.exportTable.stars.forEach((entry, position) => {
      const module = this.#host.specifier(file, entry.from, "re-export");
      switch (module.status) {
        case "resolved": {
          const closures = module.files.map((reached) => this.#closureOf(reached));
          if (closures.some((closure) => closure.open)) {
            open.push(position);
            return;
          }
          const names = new Set<string>();
          for (const closure of closures) for (const name of closure.names) names.add(name);
          for (const name of names) push(byName, name, position);
          return;
        }
        case "external":
        case "builtin":
        case "excluded":
          open.push(position);
          return;
        case "unresolved":
        case "non-literal":
          return;
      }
    });
    const index: StarIndex = { byName, open };
    this.#starIndexes.set(file, index);
    return index;
  }

  /**
   * The names a file and every file it reaches through `export *` export, and whether it reaches modules
   * whose names are unknown. A superset of what an export query can find through the file, cycles included.
   * Files no adapter analyzes export no names; code that was not analyzed may export any.
   */
  #closureOf(start: FileRecord): StarClosure {
    const memo = this.#closures.get(start);
    if (memo !== undefined) return memo;
    const names = new Set<string>();
    let open = false;
    const queue = [start];
    const queued = new Set(queue);
    for (let next = 0; next < queue.length; next++) {
      const file = queue[next];
      if (file === undefined) continue;
      if (file.extraction === undefined) {
        if (!isDataModule([file])) open = true;
        continue;
      }
      for (const name of ownExportNames(file)) names.add(name);
      for (const entry of file.exportTable.stars) {
        const module = this.#host.specifier(file, entry.from, "re-export");
        if (module.status === "resolved") {
          for (const reached of module.files) {
            if (queued.has(reached)) continue;
            queued.add(reached);
            queue.push(reached);
          }
        } else if (
          module.status === "external" ||
          module.status === "builtin" ||
          module.status === "excluded"
        ) {
          open = true;
        }
      }
    }
    const closure: StarClosure = { names, open };
    this.#closures.set(start, closure);
    return closure;
  }

  /** For files without export lists: top-level symbols the adapter marked as exported. */
  #implicitExport(file: FileRecord, name: string): ExportResult {
    const symbols = file.symbols
      .filter(
        (symbol) =>
          symbol.parent === undefined && symbol.extracted.exported === true && symbol.name === name,
      )
      .sort(compareById);
    return symbols.length === 0 ? null : bound({ type: "symbols", symbols }, [], 1);
  }

  /** What a local export target (or a re-exported binding) denotes, within an export query. */
  #exportTarget(file: FileRecord, binding: BindingRef, set: Set<string>): ExportResult {
    switch (binding.type) {
      case "symbol": {
        const symbol = file.symbolsByLocalName.get(binding.localName);
        if (symbol === undefined) return null;
        const start = bound({ type: "symbols", symbols: [symbol] }, [], 1, "local-declaration");
        return this.#completeWalk(start, binding.members);
      }
      case "import": {
        const record = file.bindings.get(binding.local);
        const module = record === undefined ? undefined : file.moduleTargets[record.importIndex];
        if (record === undefined || module === undefined) return null;
        const result = this.#importedFromTarget(module, record.binding.imported, set);
        if (!isBound(result)) return result;
        return this.#completeWalk({ ...result, via: [file.path, ...result.via] }, binding.members);
      }
      case "module": {
        // `module.exports = require("./x")`: the value of that module.
        const module = this.#host.specifier(file, binding.specifier, "inline");
        const result = this.#importedFromTarget(module, "=", set);
        if (!isBound(result)) return result;
        return this.#completeWalk({ ...result, via: [file.path, ...result.via] }, binding.members);
      }
      case "name": {
        for (const candidate of this.#resolveName(file, binding.name, undefined)) {
          const walked = this.#completeWalk(candidate, binding.members);
          if (isBound(walked)) return walked;
        }
        return null;
      }
      case "local":
      case "parameter":
        return null;
    }
  }

  /**
   * What an imported name denotes in a module target (`#imported` for resolved modules).
   *
   * @param set - the resolve set of the enclosing export query; undefined starts fresh queries.
   */
  #importedFromTarget(
    target: ModuleTarget,
    imported: string,
    set: Set<string> | undefined,
  ): ExportResult {
    switch (target.status) {
      case "non-literal":
      case "unresolved":
        return null;
      case "excluded":
        return EXCLUDED;
      case "external":
        return bound(
          externalDenotation(target.external, namedPath(imported)),
          [],
          target.confidence,
        );
      case "builtin":
        return bound(externalDenotation(target.external, namedPath(imported)), [], 1);
      case "resolved": {
        if (target.members !== undefined) {
          const start = bound(moduleDenotation(target.files), [], target.confidence);
          return this.#completeWalk(start, target.members);
        }
        const result = this.#imported(target.files, imported, set);
        if (!isBound(result)) return result;
        return { ...result, confidence: Math.min(result.confidence, target.confidence) };
      }
    }
  }

  /**
   * What an imported name denotes in a module: `*` the namespace; `=` the module's value; `default` the
   * default export, else the value of a module with an export assignment, else the namespace of a CommonJS
   * module; any other name a named export, else a member of the export assignment (destructuring a
   * `require()` of `module.exports = Class`, TypeScript named imports from `export =` modules). In opaque
   * modules, the name is kept as a path.
   */
  #imported(
    files: readonly FileRecord[],
    imported: string,
    set: Set<string> | undefined,
  ): ExportResult {
    if (isOpaque(files)) return bound(moduleDenotation(files, namedPath(imported)), [], 1);
    switch (imported) {
      case "*":
        return bound(moduleDenotation(files), [], 1);
      case "=":
        return this.#moduleValue(files, set);
      case "default":
        if (this.#hasExport(files, "default")) return this.#inModule(files, "default", set);
        if (this.#hasExport(files, "=")) return this.#moduleValue(files, set);
        return files.every((file) => file.extraction?.moduleFormat === "commonjs")
          ? bound(moduleDenotation(files), [], 1)
          : null;
      default: {
        const named = this.#inModule(files, imported, set);
        if (named !== null || !this.#hasExport(files, "=")) return named;
        const assigned = this.#inModule(files, "=", set);
        if (!isBound(assigned)) return assigned === EXCLUDED ? EXCLUDED : null;
        return this.#completeWalk(withoutExportsOf(assigned), [imported]);
      }
    }
  }

  /**
   * The value of a module (`require()`, `import x = require()`): its export assignment when that binds, with
   * the module's other named exports as preferred members (`exportsOf`); else the namespace (an export
   * assignment without targets or of an unknown value).
   */
  #moduleValue(files: readonly FileRecord[], set: Set<string> | undefined): ExportResult {
    const namespace = bound(moduleDenotation(files), [], 1);
    if (!this.#hasExport(files, "=")) return namespace;
    const assigned = this.#inModule(files, "=", set);
    if (assigned === null) return namespace;
    if (!isBound(assigned)) return assigned;
    return this.#hasNamedExports(files) ? { ...assigned, exportsOf: files } : assigned;
  }

  #hasExport(files: readonly FileRecord[], name: string): boolean {
    return files.some(
      (file) => file.exportTable.local.has(name) || file.exportTable.indirect.has(name),
    );
  }

  /** Whether a module exports names besides its export assignment. */
  #hasNamedExports(files: readonly FileRecord[]): boolean {
    return files.some((file) => {
      const table = file.exportTable;
      return (
        table.indirect.size > 0 ||
        table.stars.length > 0 ||
        table.local.size > (table.local.has("=") ? 1 : 0)
      );
    });
  }

  /** An export query over a module of one or more files. */
  #inModule(
    files: readonly FileRecord[],
    name: string,
    set: Set<string> | undefined,
  ): ExportResult {
    const results: Bound[] = [];
    let ambiguous = false;
    let excluded = false;
    for (const file of files) {
      const result =
        set === undefined ? this.#exportFresh(file, name) : this.#exportIn(file, name, set);
      if (result === AMBIGUOUS) ambiguous = true;
      else if (result === EXCLUDED) excluded = true;
      else if (result !== null) results.push(result);
    }
    return mergeBounds(results) ?? (ambiguous ? AMBIGUOUS : excluded ? EXCLUDED : null);
  }

  // ─── Reference targets ─────────────────────────────────────────────────────

  #resolveTarget(
    file: FileRecord,
    target: ReferenceTarget,
    from: string | undefined,
  ): readonly Bound[] {
    return this.#resolveReference(file, target, from).bounds;
  }

  #resolveReference(
    file: FileRecord,
    target: ReferenceTarget,
    from: string | undefined,
  ): Resolution {
    if (target.type !== "instance") return this.#resolveBinding(file, target, from);
    const outer = this.#resolveReference(file, target.of, from);
    const bounds: Bound[] = [];
    // The instance's type is unknown when its value could not be typed: no `of` binding at all because
    // `of` is itself untyped, a partially resolved `of`, or a value without a determinable type.
    let untyped = outer.untyped;
    let excluded = outer.excluded;
    for (const of of outer.bounds) {
      if (of.unresolvedPath !== undefined) {
        untyped = true;
        continue;
      }
      const instance = this.#instanceOf(of, target.via);
      if (instance === undefined) {
        untyped = true;
        continue;
      }
      const walked = this.#walk(instance, target.members);
      if (walked === EXCLUDED) excluded = true;
      else if (walked !== undefined) bounds.push(walked);
    }
    const none = bounds.length === 0;
    return { bounds, untyped: none && untyped, excluded: none && excluded };
  }

  #resolveBinding(
    file: FileRecord,
    target: Exclude<ReferenceTarget, { type: "instance" }>,
    from: string | undefined,
  ): Resolution {
    switch (target.type) {
      case "import":
        return this.#walkFrom(this.#importBound(file, target.local), target.members);
      case "symbol": {
        const symbol = file.symbolsByLocalName.get(target.localName);
        if (symbol === undefined) return nothing();
        const start = bound({ type: "symbols", symbols: [symbol] }, [], 1, "local-declaration");
        return this.#walkAll([start], target.members);
      }
      case "module": {
        // `require("./x").y`, `import("./x").T`: members of the value the module evaluates to.
        const module = this.#host.specifier(file, target.specifier, "inline");
        return this.#walkFrom(this.#startFrom(module, "="), target.members);
      }
      case "name":
        return this.#walkAll(this.#resolveName(file, target.name, from), target.members);
      case "local":
      case "parameter":
        return nothing();
    }
  }

  /** The bindings reached from the start of a reference through an import or an inline module. */
  #walkFrom(start: Bound | typeof EXCLUDED | undefined, members: readonly string[]): Resolution {
    if (start === EXCLUDED) return { bounds: [], untyped: false, excluded: true };
    return start === undefined ? nothing() : this.#walkAll([start], members);
  }

  #importBound(file: FileRecord, local: string): Bound | typeof EXCLUDED | undefined {
    const record = file.bindings.get(local);
    const module = record === undefined ? undefined : file.moduleTargets[record.importIndex];
    if (record === undefined || module === undefined) return undefined;
    return this.#startFrom(module, record.binding.imported);
  }

  /** What `imported` of a module target denotes, as the start of a reference. */
  #startFrom(target: ModuleTarget, imported: string): Bound | typeof EXCLUDED | undefined {
    const result = this.#importedFromTarget(target, imported, undefined);
    if (result === EXCLUDED) return EXCLUDED;
    return isBound(result) ? { ...result, method: "import-binding", instance: false } : undefined;
  }

  #resolveName(file: FileRecord, name: string, from: string | undefined): Bound[] {
    const resolver = this.#host.nameResolver(file);
    if (resolver === undefined) {
      return this.#host
        .globals(name)
        .map((symbol) =>
          bound(
            { type: "symbols", symbols: [symbol] },
            [],
            CONFIDENCE["global-scope"],
            "global-scope",
          ),
        );
    }
    let candidates: readonly NameCandidate[];
    try {
      candidates = resolver.lookup(
        from === undefined ? { name, fromFile: file.path } : { name, fromFile: file.path, from },
      );
    } catch (error) {
      this.#host.nameLookupFailed(file, error);
      return [];
    }
    const seen = new Set<SymbolId>();
    const bounds: Bound[] = [];
    for (const candidate of candidates) {
      const symbol = this.#host.files
        .get(candidate.path)
        ?.symbolsByLocalName.get(candidate.localName);
      if (symbol === undefined || seen.has(symbol.id)) continue;
      seen.add(symbol.id);
      bounds.push(
        bound(
          { type: "symbols", symbols: [symbol] },
          [],
          clampConfidence(candidate.confidence),
          candidate.method,
        ),
      );
    }
    return bounds;
  }

  /** The instance a value is: of its declared type, of the class it constructs, or of a call's result. */
  #instanceOf(
    of: Bound,
    via: "declared-type" | "constructor-type" | "call-result",
  ): Bound | undefined {
    const denotation = of.denotation;
    if (denotation.type === "module") return undefined;
    if (via !== "call-result") {
      return {
        ...of,
        method: via,
        confidence: Math.min(of.confidence, CONFIDENCE[via]),
        instance: true,
      };
    }
    if (denotation.type === "external") return { ...of, instance: true };
    const callee = pickSymbol(denotation.symbols, "value");
    if (callee === undefined) return undefined;
    if (callee.extracted.returnType !== undefined) {
      const type = this.#typeOf(callee, "return");
      if (type === undefined || type.denotation.type === "module") return undefined;
      return {
        denotation: type.denotation,
        via: of.via,
        method: "return-type",
        confidence: Math.min(of.confidence, type.confidence, CONFIDENCE["return-type"]),
        instance: true,
      };
    }
    if (isConstructible(callee)) {
      return {
        ...of,
        denotation: { type: "symbols", symbols: [callee] },
        method: "constructor-type",
        confidence: Math.min(of.confidence, CONFIDENCE["constructor-type"]),
        instance: true,
      };
    }
    return undefined;
  }

  // ─── Member walks ──────────────────────────────────────────────────────────

  #walkAll(starts: readonly Bound[], members: readonly string[]): Resolution {
    const bounds: Bound[] = [];
    let excluded = false;
    for (const start of starts) {
      const walked = this.#walk(start, members);
      if (walked === EXCLUDED) excluded = true;
      else if (walked !== undefined) bounds.push(walked);
    }
    return { bounds, untyped: false, excluded: bounds.length === 0 && excluded };
  }

  /** Walk members and require every member to resolve. */
  #completeWalk(start: Bound, members: readonly string[]): ExportResult {
    if (members.length === 0) return start;
    const walked = this.#walk(start, members);
    if (walked === EXCLUDED) return EXCLUDED;
    return walked === undefined || walked.unresolvedPath !== undefined ? null : walked;
  }

  /**
   * Resolve `members` one by one from `start`. Returns undefined when a module namespace does not export a
   * member (the reference is unresolved), `EXCLUDED` when the member may be provided by files whose names
   * cannot be looked up, a binding with `unresolvedPath` when a member of a symbol cannot be found (partial
   * resolution), and stops at externals and at modules without an extraction with the remaining path
   * appended. A member found among a module's exports or in a namespace declaration is a `namespace-member`
   * step.
   */
  #walk(start: Bound, members: readonly string[]): Bound | typeof EXCLUDED | undefined {
    let state = withoutExportsOf(start);
    let exportsOf = start.exportsOf;
    let index = 0;
    const typeVisits = new Set<SymbolRecord>();
    while (index < members.length) {
      const member = members[index];
      if (member === undefined) break;
      if (exportsOf !== undefined) {
        // A member of a module's value: the module's own named exports come first.
        const named = this.#inModule(exportsOf, member, undefined);
        exportsOf = undefined;
        if (isBound(named)) {
          state = exportedMember(state, named);
          exportsOf = named.exportsOf;
          index++;
          typeVisits.clear();
          continue;
        }
      }
      const denotation = state.denotation;
      if (denotation.type === "external") {
        return { ...state, denotation: deeper(denotation, members.slice(index)) };
      }
      if (denotation.type === "module") {
        if (isOpaque(denotation.files)) {
          // Nothing inside can be looked up: keep the path, as for externals.
          const path = [...(denotation.path ?? []), ...members.slice(index)];
          return { ...state, denotation: moduleDenotation(denotation.files, path) };
        }
        const next = this.#moduleMember(denotation.files, member);
        if (next === EXCLUDED) return EXCLUDED;
        if (!isBound(next)) return undefined;
        state = exportedMember(state, next);
        exportsOf = next.exportsOf;
        index++;
        typeVisits.clear();
        continue;
      }
      const preferStatic = this.#preferStatic(state);
      const children = this.#children(denotation.symbols, member, preferStatic);
      if (children.length > 0) {
        state = {
          ...state,
          denotation: { type: "symbols", symbols: children },
          ...(children.some(isNamespaceMember) ? { method: "namespace-member" as const } : {}),
          instance: false,
        };
        index++;
        typeVisits.clear();
        continue;
      }
      const typed = this.#implicitType(denotation.symbols, typeVisits);
      if (typed !== undefined) {
        const confidence = Math.min(state.confidence, typed.confidence);
        if (typed.denotation.type === "external") {
          return {
            ...state,
            denotation: deeper(typed.denotation, members.slice(index)),
            method: typed.method,
            confidence,
          };
        }
        state = {
          ...state,
          denotation: typed.denotation,
          method: typed.method,
          confidence,
          instance: typed.denotation.type === "symbols",
        };
        continue;
      }
      if (denotation.symbols.some((symbol) => symbol.category === "type")) {
        const inherited = this.#inherited(denotation.symbols, member, preferStatic);
        if (inherited !== undefined) {
          const confidence = Math.min(state.confidence, CONFIDENCE["inherited-member"]);
          if (inherited.type === "external") {
            return {
              ...state,
              denotation: deeper(inherited, members.slice(index)),
              method: "inherited-member",
              confidence,
            };
          }
          state = {
            ...state,
            denotation: inherited,
            method: "inherited-member",
            confidence,
            instance: false,
          };
          index++;
          typeVisits.clear();
          continue;
        }
      }
      return {
        ...state,
        confidence: Math.min(state.confidence, CONFIDENCE.partial),
        unresolvedPath: members.slice(index),
      };
    }
    return state;
  }

  /** A member of a module namespace: an export, else a child module (`resolveMember`). */
  #moduleMember(files: readonly FileRecord[], member: string): ExportResult {
    const result = this.#inModule(files, member, undefined);
    if (isBound(result)) return result;
    const [first] = files;
    const child = first === undefined ? undefined : this.#host.member(first, member);
    if (child !== undefined) {
      const module = this.#importedFromTarget(child, "*", undefined);
      if (module !== null) return module;
    }
    return result === EXCLUDED ? EXCLUDED : null;
  }

  /** Static members for access on a type itself, instance members for access on an instance. */
  #preferStatic(state: Bound): boolean | undefined {
    if (state.instance) return false;
    const denotation = state.denotation;
    return denotation.type === "symbols" &&
      denotation.symbols.some((symbol) => symbol.category === "type")
      ? true
      : undefined;
  }

  /**
   * The symbols whose members are members of `symbols`: the symbols themselves, the other declarations of
   * their qualified names (e.g. a class and its merged namespace) and all parts of partial types.
   */
  #containers(symbols: readonly SymbolRecord[]): SymbolRecord[] {
    const found = new Map<SymbolId, SymbolRecord>();
    const addGroup = (symbol: SymbolRecord): void => {
      for (const member of this.#groups.get(groupKey(symbol)) ?? [symbol]) {
        found.set(member.id, member);
      }
    };
    for (const symbol of symbols) {
      addGroup(symbol);
      const canonical = symbol.partOf ?? symbol;
      if (canonical !== symbol) addGroup(canonical);
      for (const partial of this.#partials.get(canonical) ?? []) addGroup(partial);
    }
    return [...found.values()].sort(compareById);
  }

  /**
   * Children named `name`: lexical children, members owned through `receiver` and the lexical children of
   * owned symbols (e.g. `impl` blocks). Static or instance members are preferred when both exist.
   */
  #children(
    symbols: readonly SymbolRecord[],
    name: string,
    preferStatic: boolean | undefined,
  ): SymbolRecord[] {
    const found = new Map<SymbolId, SymbolRecord>();
    for (const container of this.#containers(symbols)) {
      for (const child of this.#lexical.get(container)?.get(name) ?? []) found.set(child.id, child);
      if (!this.#ownersResolved) continue;
      for (const child of this.#ownedByName.get(container)?.get(name) ?? []) {
        found.set(child.id, child);
      }
      for (const owned of this.#owned.get(container) ?? []) {
        for (const child of this.#lexical.get(owned)?.get(name) ?? []) found.set(child.id, child);
      }
    }
    const children = [...found.values()].sort(compareById);
    if (preferStatic === undefined || children.length < 2) return children;
    const preferred = children.filter((child) => child.isStatic === preferStatic);
    return preferred.length > 0 ? preferred : children;
  }

  /**
   * The type a value-like symbol has when a member is not found on it: its declared type, else the type its
   * initializer constructs or returns. Each symbol is followed at most once per member.
   */
  #implicitType(symbols: readonly SymbolRecord[], visits: Set<SymbolRecord>): Bound | undefined {
    for (const symbol of symbols) {
      if (visits.has(symbol)) continue;
      visits.add(symbol);
      if (symbol.extracted.declaredType !== undefined) {
        const type = this.#typeOf(symbol, "declared");
        if (type !== undefined) {
          return {
            ...type,
            method: "declared-type",
            confidence: Math.min(type.confidence, CONFIDENCE["declared-type"]),
          };
        }
      }
      if (symbol.extracted.initializer !== undefined) {
        const type = this.#typeOf(symbol, "initializer");
        if (type !== undefined) return type;
      }
    }
    return undefined;
  }

  /** A memoized type lookup of a symbol (declared type, return type or initializer type). */
  #typeOf(symbol: SymbolRecord, query: TypeQuery): Bound | undefined {
    const key = `${symbol.id}\u0000${query}`;
    const memo = this.#typeMemo.get(key);
    if (memo !== undefined) return memo ?? undefined;
    if (this.#typesInProgress.has(key)) {
      this.#cuts++;
      return undefined;
    }
    this.#typesInProgress.add(key);
    const cuts = this.#cuts;
    const result = this.#computeType(symbol, query);
    this.#typesInProgress.delete(key);
    if (this.#cuts === cuts) this.#typeMemo.set(key, result ?? null);
    return result;
  }

  #computeType(symbol: SymbolRecord, query: TypeQuery): Bound | undefined {
    switch (query) {
      case "declared":
        return this.#resolveTypeRef(symbol, symbol.extracted.declaredType);
      case "return":
        return this.#resolveTypeRef(symbol, symbol.extracted.returnType);
      case "initializer": {
        const initializer = symbol.extracted.initializer;
        if (initializer === undefined) return undefined;
        const via = initializer.kind === "new" ? "constructor-type" : "call-result";
        for (const callee of this.#resolveTarget(
          symbol.file,
          initializer.callee,
          symbol.localName,
        )) {
          if (callee.unresolvedPath !== undefined) continue;
          const instance = this.#instanceOf(callee, via);
          if (instance !== undefined) return instance;
        }
        return undefined;
      }
    }
  }

  #resolveTypeRef(symbol: SymbolRecord, type: TypeRef | undefined): Bound | undefined {
    if (type === undefined) return undefined;
    return this.#resolveTarget(symbol.file, type.ref, symbol.localName).find(
      (item) => item.unresolvedPath === undefined && item.denotation.type !== "module",
    );
  }

  // ─── Inheritance ───────────────────────────────────────────────────────────

  /**
   * Search the base types of `symbols` (depth-first, `extends`/`embed` before `implements`/`derive`, at most
   * {@link MAX_INHERITANCE_DEPTH} levels) for a member. When no internal base declares it, the first
   * external base reached is returned (the member is presumably inherited from it).
   */
  #inherited(
    symbols: readonly SymbolRecord[],
    member: string,
    preferStatic: boolean | undefined,
  ): Denotation | undefined {
    const visited = new Set<SymbolRecord>(this.#containers(symbols));
    let external: Denotation | undefined;
    const search = (
      current: readonly SymbolRecord[],
      depth: number,
    ): SymbolRecord[] | undefined => {
      for (const base of this.#basesOf(current)) {
        if (base.type === "external") {
          external ??= base;
          continue;
        }
        if (base.type !== "symbols") continue;
        const fresh = this.#containers(base.symbols).filter((symbol) => !visited.has(symbol));
        if (fresh.length === 0) continue;
        for (const symbol of fresh) visited.add(symbol);
        const found = this.#children(fresh, member, preferStatic);
        if (found.length > 0) return found;
        if (depth < MAX_INHERITANCE_DEPTH) {
          const deeperFound = search(fresh, depth + 1);
          if (deeperFound !== undefined) return deeperFound;
        }
      }
      return undefined;
    };
    const found = search(symbols, 1);
    if (found !== undefined) return { type: "symbols", symbols: found };
    return external;
  }

  /** The resolved base types of every container of `symbols`, without duplicates. */
  #basesOf(symbols: readonly SymbolRecord[]): Denotation[] {
    const seen = new Set<string>();
    const bases: Denotation[] = [];
    for (const container of this.#containers(symbols)) {
      for (const base of this.#basesOfSymbol(container)) {
        const key = denotationKey(base);
        if (seen.has(key)) continue;
        seen.add(key);
        bases.push(base);
      }
    }
    return bases;
  }

  #basesOfSymbol(symbol: SymbolRecord): readonly Denotation[] {
    const memo = this.#basesMemo.get(symbol);
    if (memo !== undefined) return memo;
    if (this.#basesInProgress.has(symbol)) {
      this.#cuts++;
      return [];
    }
    this.#basesInProgress.add(symbol);
    const cuts = this.#cuts;
    const bases: Denotation[] = [];
    for (const reference of symbol.file.heritage.get(symbol.localName) ?? []) {
      const base = this.#resolveTarget(symbol.file, reference.target, symbol.localName).find(
        (item) => item.unresolvedPath === undefined,
      );
      if (base !== undefined && base.denotation.type !== "module") bases.push(base.denotation);
    }
    this.#basesInProgress.delete(symbol);
    if (this.#cuts === cuts) this.#basesMemo.set(symbol, bases);
    return bases;
  }
}
