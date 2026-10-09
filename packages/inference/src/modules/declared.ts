/**
 * Declared modules (§3.14; docs/ALGORITHMS.md, "Modules", 5.13): the modules a configuration names in its
 * `modules` section, with exact membership, and the rule that keeps the identifiers of inferred modules
 * distinct from declared ones.
 *
 * Declared membership is exact glob membership restricted to the roles components own (D-22): code, tests
 * and declarations, never manifests or documentation. A file matched by several declared modules belongs to
 * the one whose name sorts first (D-23), and every overlap is reported as a `configuration-warning` (D-24).
 * Declared modules are always produced: when they match nothing (kept empty, with a warning, because rules may
 * name them) and when module inference is disabled (D-21). Inferred modules never contain a declared file:
 * declared files are not inference nodes (P0, §3.14).
 *
 * Requirement recorded for the rules milestone (§3.14, ADR-012, D-73): module selectors and `scope: modules`
 * match declared modules unless a rule opts in to inferred ones, so that rule violations never depend on a
 * heuristic.
 *
 * Determinism: modules are processed in name order (`compareStrings`), files in identifier order; nothing
 * depends on the order of configuration keys (D-23) or of the document's arrays.
 */
import {
  compareStrings,
  declaredModuleKey,
  inferredModuleKey,
  moduleId,
  sortedUnique,
} from "@katedrala/ir";
import type { Diagnostic, FileId, FileRole, ModuleAnchor, ModuleId } from "@katedrala/ir";
import type { ArchitectureModel } from "@katedrala/model";
import { formatList } from "../evidence.js";
import type { DeclaredModuleSpec, ScopeClustering } from "../types.js";

/** What {@link resolveDeclaredModules} reads [DERIVED] (§3.14, §6.2; plan 4.4, "Declared modules"). */
export interface DeclaredModulesInput {
  readonly model: ArchitectureModel;
  /** The declared modules with their globs resolved to files (`Declarations.modules`). */
  readonly specs: readonly DeclaredModuleSpec[];
  /** The roles of the files modules may contain: `settings.componentFileRoles` (D-22). */
  readonly fileRoles: ReadonlySet<FileRole>;
  /** `limits.maxEvidenceEntities`: how many paths an overlap warning lists at most. */
  readonly maxExamples: number;
  /** The configuration file when it is a file of the snapshot: where the warnings point. */
  readonly configurationFile?: FileId;
}

/** A declared module with its exact membership [DERIVED] (§3.14). */
export interface DeclaredModule {
  /** `mod:<name>`. */
  readonly id: ModuleId;
  readonly name: string;
  /**
   * Member files, sorted: the matched files with a role in `fileRoles` that no declared module of a smaller
   * name claims (D-22, D-23).
   */
  readonly files: readonly FileId[];
  /** The files the `entry` globs match, sorted; absent when `entry` is not configured (§3.12). */
  readonly entry?: readonly FileId[];
}

/** The declared modules of a configuration [DERIVED] (§3.14). */
export interface DeclaredModules {
  /** Sorted by name, which is identifier order. */
  readonly modules: readonly DeclaredModule[];
  /**
   * Every declared member file and its module. Iterate {@link DeclaredModules.modules} where order matters.
   */
  readonly owners: ReadonlyMap<FileId, ModuleId>;
  /** Overlap and empty-match warnings (D-24, D-71), in module name order. */
  readonly diagnostics: readonly Diagnostic[];
}

/** The path of a file identifier (`file:<path>`). */
function pathOf(file: FileId): string {
  return file.slice("file:".length);
}

/** `1 file`, `2 files`. */
function files(count: number): string {
  return `${count} ${count === 1 ? "file" : "files"}`;
}

/**
 * `: a, b and 3 more` for the first `maxExamples` paths of sorted files, or "" when none may be listed. The
 * list is bounded like evidence entities (IR: sort, then truncate), so a broad glob cannot flood the
 * diagnostics.
 */
function examples(sorted: readonly FileId[], maxExamples: number): string {
  const shown = sorted.slice(0, Math.max(0, maxExamples)).map(pathOf);
  if (shown.length === 0) return "";
  const rest = sorted.length - shown.length;
  return `: ${formatList(rest > 0 ? [...shown, `${rest} more`] : shown)}`;
}

/**
 * Resolve the declared modules of a configuration [DERIVED] (§3.14; plan 4.4, "Declared modules"):
 *
 * 1. Specs are processed in name order (`compareStrings`), whatever order they arrive in (D-23).
 * 2. A module's candidates are the files of `spec.files` whose role is in `fileRoles` (D-22: a module groups
 *    code, its tests and declarations, not manifests or documentation); files the document does not list
 *    are ignored.
 * 3. A candidate already claimed by a module whose name sorts first stays there (D-23: overlaps resolve by
 *    name, never by configuration key order, so the canonical configuration JSON and `analysisDigest`
 *    describe every result). For each pair of the module that keeps files and a module that loses them, one
 *    `configuration-warning` (D-24) starting "Files match several declared modules" names both modules and
 *    the rule, and gives the number of files and at most `maxExamples` of their paths.
 * 4. The id is `mod:<name>` (`declaredModuleKey`); declared modules have no anchor and no `inference`.
 * 5. A module whose globs match no file with a role in `fileRoles` is kept with no files (rules may name it)
 *    and gets a `configuration-warning` (D-71). A module that loses every file to overlaps is kept empty too;
 *    its overlap warnings explain why.
 *
 * Warnings carry the configuration file as their `file` when it is a snapshot file, and no line, so key
 * order never shows in the document (D-23).
 *
 * Complexity: O(Σ spec sizes · log) for the defensive sorting of each spec's lists, plus O(S log S) for S
 * specs. Determinism: name order, identifier order; maps are only read by key.
 *
 * @throws {RangeError} when two specs share a name (the `modules` section is a map, so the engine never
 *   produces them).
 * @throws {InvalidIdentifierError} (from `@katedrala/ir`) when a name is empty or contains `#` or `~`, which
 *   the engine's validator rejects.
 */
export function resolveDeclaredModules(input: DeclaredModulesInput): DeclaredModules {
  const { model, fileRoles, maxExamples, configurationFile } = input;
  // D-23: overlaps resolve by name, never by configuration order.
  const specs = [...input.specs].sort((a, b) => compareStrings(a.name, b.name));
  const location = configurationFile === undefined ? {} : { file: configurationFile };
  const keeperOf = new Map<FileId, string>();
  const owners = new Map<FileId, ModuleId>();
  const modules: DeclaredModule[] = [];
  const diagnostics: Diagnostic[] = [];
  const roles = [...fileRoles].sort(compareStrings).join(", ");

  specs.forEach((spec, index) => {
    if (index > 0 && specs[index - 1]?.name === spec.name) {
      throw new RangeError(`Declared module names must be unique: "${spec.name}"`);
    }
    const id = moduleId(declaredModuleKey(spec.name));
    const matched = sortedUnique(spec.files);
    const members: FileId[] = [];
    /** Keeper name → the files this module loses to it. */
    const lost = new Map<string, FileId[]>();
    let candidates = 0;
    for (const file of matched) {
      const entity = model.index.file(file);
      // D-22: membership is restricted to the roles components own.
      if (entity === undefined || !fileRoles.has(entity.role)) continue;
      candidates++;
      const keeper = keeperOf.get(file);
      if (keeper === undefined) {
        keeperOf.set(file, spec.name);
        owners.set(file, id);
        members.push(file);
      } else {
        const list = lost.get(keeper);
        if (list === undefined) lost.set(keeper, [file]);
        else list.push(file);
      }
    }
    // D-24: one warning per pair of a keeping and a losing module, with bounded example paths.
    for (const keeper of [...lost.keys()].sort(compareStrings)) {
      const overlap = lost.get(keeper) ?? [];
      const verb = overlap.length === 1 ? "matches" : "match";
      const object = overlap.length === 1 ? "it" : "them";
      diagnostics.push({
        code: "configuration-warning",
        severity: "warning",
        message:
          `Files match several declared modules: ${files(overlap.length)} ${verb} both "${keeper}" and ` +
          `"${spec.name}", and the first by name ("${keeper}") keeps ${object}` +
          examples(overlap, maxExamples),
        ...location,
      });
    }
    // D-71: a module that matches nothing is kept, with a warning.
    if (candidates === 0) {
      diagnostics.push({
        code: "configuration-warning",
        severity: "warning",
        message:
          matched.length === 0
            ? `Declared module "${spec.name}" matches no file; it is kept without member files`
            : `Declared module "${spec.name}" matches ${files(matched.length)}, none with a role modules ` +
              `contain (inference.components.file_roles: ${roles}); it is kept without member files`,
        ...location,
      });
    }
    modules.push(
      spec.entry === undefined
        ? { id, name: spec.name, files: members }
        : { id, name: spec.name, files: members, entry: sortedUnique(spec.entry) },
    );
  });
  return { modules, owners, diagnostics };
}

/**
 * The identifier of an inferred module [DERIVED] (§3.10 "Collisions"; IR.md, "Identifiers"):
 * `mod:<inferredModuleKey(anchor)>`, with `~inferred` appended when the unit's key equals the name of a
 * declared module. Declared names never contain `#` or `~` and inferred keys escape `~`, so the result never
 * equals another declared or inferred identifier.
 *
 * Complexity: O(length of the anchor). Determinism: a pure function of its arguments.
 *
 * @example inferredModuleId({ key: "src", anchor: { directory: "src" } }, new Set(["src"])) === "mod:src~inferred"
 * @throws {InvalidIdentifierError} (from `@katedrala/ir`) when the anchor's stem is empty or contains `%`, `#`,
 *   `~` or `/`.
 */
export function inferredModuleId(
  unit: { readonly key: string; readonly anchor: ModuleAnchor },
  declaredNames: ReadonlySet<string>,
): ModuleId {
  return moduleId(inferredModuleKey(unit.anchor, declaredNames.has(unit.key)));
}

/**
 * One scope's clustering with the module identifier of each of its units [DERIVED]: the input of the module
 * stage's later phases (P7 attachment, P8 surface, P9 evidence).
 */
export interface InferredScope {
  readonly clustering: ScopeClustering;
  /** `ids[u]` is the identifier of `clustering.units[u]` ({@link inferredModuleId}). */
  readonly ids: readonly ModuleId[];
}

/**
 * Give every unit of every scope its module identifier [DERIVED] (§3.10): `mod:<key>`, with `~inferred` on a
 * collision with a declared module's name ({@link inferredModuleId}). Scopes keep their order.
 *
 * Complexity: O(units + declared modules). Determinism: a pure function of its arguments.
 */
export function identifyInferredModules(
  clusterings: readonly ScopeClustering[],
  declared: DeclaredModules,
): InferredScope[] {
  const names = new Set(declared.modules.map((module) => module.name));
  return clusterings.map((clustering) => ({
    clustering,
    ids: clustering.units.map((unit) => inferredModuleId(unit, names)),
  }));
}
