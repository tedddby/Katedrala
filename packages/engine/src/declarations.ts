/**
 * Declarations: the configured modules, layers and roles with their globs resolved to the files of a
 * document (milestone 5 plan 5.4). The engine resolves globs with core's matcher, so `@katedrala/inference`
 * takes file lists and never depends on picomatch (D-59, ADR-013).
 */
import { createPathMatcher } from "@katedrala/core";
import type {
  ConfiguredRoleSpec,
  Declarations,
  DeclaredLayerSpec,
  DeclaredModuleSpec,
  InferenceConfiguration,
  LayersConfiguration,
  ModulesConfiguration,
} from "@katedrala/inference";
import {
  compareStrings,
  type ArchitecturalRole,
  type FileEntity,
  type FileId,
} from "@katedrala/ir";

/**
 * Resolve the declarations of a configuration to files [DERIVED: exact glob membership, design §3.14, §4.3,
 * §4.2].
 *
 * - **Modules** are sorted by name (D-23): configuration key order never carries meaning, so a formatter that
 *   sorts YAML keys changes nothing. The short form (a glob list) gives `{ name, files }`; the long form adds
 *   `entry` when it is configured.
 * - **Layers** keep their list order (outermost first); `rank` is the explicit rank, else the position in the
 *   list. `layers` is absent when no layer is declared, which means layers are inferred.
 * - **Roles** (`inference.roles`) are sorted by role.
 * - `configurationFile` is passed through; inference places its configuration warnings there.
 *
 * Globs follow core's semantics (`createPathMatcher`): picomatch relative to the analysis root, dotfiles
 * included, a pattern also matches the files below a matching directory, and `!pattern` excludes for the
 * whole list. Every matched file is listed, whatever its role: role filtering is policy and belongs to
 * inference (D-17, D-22, D-50), as do overlap resolution, empty-match warnings and `when_declared`
 * (plan 5.4).
 *
 * Complexity: O(F log F) to order the files, plus O(F · P · D) per declaration for F files, P patterns and
 * path depth D (ancestor matching). Determinism: file lists are in file-id order whatever the order of
 * `files`, and no result depends on the order of configuration keys. The configuration is expected to be
 * validated (`INFERENCE_CONFIGURATION_SECTIONS`). References: plan 3.4, 5.1, 5.4; design §6.2, §6.3.
 *
 * @throws {TypeError} (from `createPathMatcher`) for a glob the validators reject.
 */
export function resolveDeclarations(
  files: readonly FileEntity[],
  sections: {
    readonly modules?: ModulesConfiguration;
    readonly layers?: LayersConfiguration;
    readonly inference?: InferenceConfiguration;
  },
  configurationFile?: FileId,
): Declarations {
  const ordered = [...files].sort((a, b) => compareStrings(a.id, b.id));
  const matching = (globs: readonly string[]): FileId[] => {
    const matches = createPathMatcher(globs);
    return ordered.filter((file) => matches(file.path)).map((file) => file.id);
  };

  // D-23: modules by name, never by configuration key order.
  const modules = Object.entries(sections.modules ?? {})
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([name, declared]): DeclaredModuleSpec => {
      if (Array.isArray(declared)) return { name, files: matching(declared) };
      return {
        name,
        files: matching(declared.files),
        ...(declared.entry === undefined ? {} : { entry: matching(declared.entry) }),
      };
    });

  // D-50: declared layers keep their list order (the first layer that matches a file keeps it); the rank
  // defaults to the position.
  const layers = sections.layers?.map((layer, index): DeclaredLayerSpec => ({
    name: layer.name,
    rank: layer.rank ?? index,
    files: matching(layer.files),
  }));

  const roles = Object.entries(sections.inference?.roles ?? {})
    .flatMap(([role, globs]): ConfiguredRoleSpec[] =>
      globs === undefined ? [] : [{ role: role as ArchitecturalRole, files: matching(globs) }],
    )
    .sort((a, b) => compareStrings(a.role, b.role));

  return {
    modules,
    ...(layers === undefined ? {} : { layers }),
    roles,
    ...(configurationFile === undefined ? {} : { configurationFile }),
  };
}
