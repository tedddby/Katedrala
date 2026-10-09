/**
 * Layer membership (§4.3 partition and pruning, §4.4 declared layers; docs/ALGORITHMS.md, "Layers"): which
 * source files form which layer, before the layers are ordered.
 *
 * - Declared layers [DERIVED] are exact: each takes the `source` files its globs matched, the first layer in
 *   list order keeps a file several layers match, and overlaps and layers without a match are reported as
 *   `configuration-warning`s (D-24, D-50, D-71).
 * - Inferred layers [KATEDRALA HEURISTIC] are the files with the same `FileLabel.label`; a label is kept when
 *   it has enough members or a member that a location, configuration or detector vote places in it, and
 *   fewer than two kept labels give no layers at all.
 *
 * Determinism: files in id order, layers in name order (inferred) or list order (declared); messages are
 * built from sorted paths and are bounded by `limits.maxEvidenceEntities`.
 */
import { compareStrings, layerId, sortById, sortedUnique } from "@katedrala/ir";
import type { Diagnostic, DocumentLimits, FileId } from "@katedrala/ir";
import type { ArchitectureModel } from "@katedrala/model";
import { formatList } from "../evidence.js";
import type { DeclaredLayerSpec, FileLabel, LayerDraft, LayersResult } from "../types.js";

/** Inferred layers before ordering [KATEDRALA HEURISTIC]: the kept labels and their members. */
export interface LayerPartition {
  /** Kept layer names, sorted by `compareStrings` (node `i` of the layer graph is `layers[i]`). */
  readonly layers: readonly string[];
  /** Member files of each kept layer (source files, sorted by id), parallel to `layers`. */
  readonly members: readonly (readonly FileId[])[];
}

/**
 * The inferred layers' membership [KATEDRALA HEURISTIC] (§4.3, plan 4.5):
 *
 * - the members of layer `L` are the `source` files whose `FileLabel.label` is `L` (labels are `null` for ⊥
 *   and below `minLabelScore`, so unlabelled files are in no layer, and tests and declarations, which have
 *   no label (D-17), never are);
 * - a label is kept when it has at least `minLayerFiles` members, or one member with a location,
 *   configuration or detector vote for it: a deliberate `routes/` directory with one file is a layer, one
 *   stray `x.controller.ts` is not;
 * - with fewer than two kept labels there is no layering, and the result is empty.
 *
 * Complexity: O(F log F + Σ votes). Determinism: files in id order, layers sorted by name.
 */
export function partitionLayers(
  model: ArchitectureModel,
  labels: ReadonlyMap<FileId, FileLabel>,
  minLayerFiles: number,
): LayerPartition {
  const members = new Map<string, FileId[]>();
  const placed = new Set<string>();
  for (const file of sortById(model.document.files)) {
    // Layers contain source files only (D-17, D-50).
    if (file.role !== "source") continue;
    const fileLabel = labels.get(file.id);
    const label = fileLabel?.label;
    if (fileLabel === undefined || label === undefined || label === null) continue;
    const list = members.get(label);
    if (list === undefined) members.set(label, [file.id]);
    else list.push(file.id);
    // §4.3 pruning: a vote other than a naming vote places the file deliberately.
    if (fileLabel.votes.some((vote) => vote.label === label && vote.source !== "naming")) {
      placed.add(label);
    }
  }
  const kept = [...members.keys()]
    .filter((label) => (members.get(label)?.length ?? 0) >= minLayerFiles || placed.has(label))
    .sort(compareStrings);
  // §4.3: fewer than two layers are no layering.
  if (kept.length < 2) return { layers: [], members: [] };
  return { layers: kept, members: kept.map((label) => members.get(label) ?? []) };
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
 * The declared layers [DERIVED] (§4.4, plan 4.5): when the configuration declares layers, no layer is
 * inferred and every file outside them has no layer.
 *
 * - D-50: a declared layer's members are the `source` files among its glob matches (`spec.files`), so tests
 *   and declarations are never layer members; a file several layers match belongs to the first in list order
 *   (list order is meaningful: the `layers` section is a list, outermost first);
 * - overlaps give one `configuration-warning` per pair of the layer that keeps the files and a layer that
 *   loses them (D-24), worded like the overlap warnings of declared modules: "Files match several declared
 *   layers", both layers, the rule ("the first in list order keeps them"), the number of files and the first
 *   paths, at most `limits.maxEvidenceEntities`. It has no line, so the document never depends on the
 *   configuration text;
 * - D-71: a declared layer whose globs match no source file is kept with `files: []` (rules may name it), with
 *   a `configuration-warning`. A layer that loses every match to earlier layers is kept empty too; its
 *   overlap warnings explain why;
 * - ranks come from the configuration (`spec.rank`: explicit, else the list position, ties allowed); there is
 *   no `inference`.
 *
 * Layers are returned by rank, then id (the IR's order). Diagnostics come per layer in list order (its
 * overlap warnings by the list position of the keeping layer, then its empty-match warning); the engine sorts
 * all diagnostics afterwards. They are located at `configurationFile` when it is given.
 *
 * Complexity: O(S log S) for S declared file matches. Determinism: list order and sorted file ids only.
 *
 * @throws {RangeError} when two declared layers have the same name (the engine's validator rejects it).
 */
export function declaredLayers(
  model: ArchitectureModel,
  declared: readonly DeclaredLayerSpec[],
  limits: DocumentLimits,
  configurationFile?: FileId,
): LayersResult {
  const names = new Set<string>();
  for (const spec of declared) {
    if (names.has(spec.name)) {
      throw new RangeError(`Declared layer names must be unique: "${spec.name}"`);
    }
    names.add(spec.name);
  }
  const location = configurationFile === undefined ? {} : { file: configurationFile };
  const sources = new Set(
    model.document.files.filter((file) => file.role === "source").map((file) => file.id),
  );
  const keeperOf = new Map<FileId, number>();
  const diagnostics: Diagnostic[] = [];
  const layers = declared.map((spec, index): LayerDraft => {
    const matched = sortedUnique(spec.files);
    // D-50: layers contain source files only.
    const candidates = matched.filter((file) => sources.has(file));
    const members: FileId[] = [];
    /** Keeper (list position) → the files this layer loses to it. */
    const lost = new Map<number, FileId[]>();
    for (const file of candidates) {
      const keeper = keeperOf.get(file);
      if (keeper === undefined) {
        // D-50: the first declared layer in list order keeps the file.
        keeperOf.set(file, index);
        members.push(file);
        continue;
      }
      const list = lost.get(keeper);
      if (list === undefined) lost.set(keeper, [file]);
      else list.push(file);
    }
    // D-24: one warning per pair of a keeping and a losing layer, with bounded example paths.
    for (const keeper of [...lost.keys()].sort((a, b) => a - b)) {
      const overlap = lost.get(keeper) ?? [];
      const keeperName = declared[keeper]?.name ?? "";
      const verb = overlap.length === 1 ? "matches" : "match";
      const object = overlap.length === 1 ? "it" : "them";
      diagnostics.push({
        code: "configuration-warning",
        severity: "warning",
        message:
          `Files match several declared layers: ${files(overlap.length)} ${verb} both "${keeperName}" ` +
          `and "${spec.name}", and the first in list order ("${keeperName}") keeps ${object}` +
          examples(overlap, limits.maxEvidenceEntities),
        ...location,
      });
    }
    // D-71: a layer that matches no source file is kept, with a warning, so that rules can still name it.
    if (candidates.length === 0) {
      diagnostics.push({
        code: "configuration-warning",
        severity: "warning",
        message:
          matched.length === 0
            ? `Declared layer "${spec.name}" matches no file; it is kept without member files`
            : `Declared layer "${spec.name}" matches ${files(matched.length)}, none of them a source ` +
              "file (layers contain source files only); it is kept without member files",
        ...location,
      });
    }
    // Keys in the order of the IR's LayerEntity; declared layers carry no inference.
    return {
      id: layerId(spec.name),
      name: spec.name,
      origin: "declared",
      rank: spec.rank,
      files: members,
    };
  });
  layers.sort((a, b) => a.rank - b.rank || compareStrings(a.id, b.id));
  return { layers, diagnostics };
}
