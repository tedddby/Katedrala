/**
 * Type guards for identifiers, by prefix (see `ID_PREFIXES` in `@katedrala/ir`). Internal to the package.
 */
import { ID_PREFIXES } from "@katedrala/ir";
import type {
  AggregatedDependency,
  ComponentId,
  ExternalId,
  FileId,
  LayerId,
  ModuleId,
  PackageId,
  SymbolId,
} from "@katedrala/ir";

/** Whether `id` is a file identifier (`file:`). */
export function isFileId(id: string): id is FileId {
  return id.startsWith(ID_PREFIXES.file);
}

/** Whether `id` is a symbol identifier (`sym:`). */
export function isSymbolId(id: string): id is SymbolId {
  return id.startsWith(ID_PREFIXES.symbol);
}

/** Whether `id` is a package identifier (`pkg:`). */
export function isPackageId(id: string): id is PackageId {
  return id.startsWith(ID_PREFIXES.package);
}

/** Whether `id` is an external identifier (`ext:`). */
export function isExternalId(id: string): id is ExternalId {
  return id.startsWith(ID_PREFIXES.external);
}

/** Whether `id` is a component identifier (`cmp:`). */
export function isComponentId(id: string): id is ComponentId {
  return id.startsWith(ID_PREFIXES.component);
}

/** Whether `id` is a module identifier (`mod:`). */
export function isModuleId(id: string): id is ModuleId {
  return id.startsWith(ID_PREFIXES.module);
}

/** Whether `id` is a layer identifier (`layer:`). */
export function isLayerId(id: string): id is LayerId {
  return id.startsWith(ID_PREFIXES.layer);
}

/** Whether `id` can be the `entity` of an IR `AggregatedDependency` (package, component, module, layer, external). */
export function isAggregatedEntity(id: string): id is AggregatedDependency["entity"] {
  return (
    isPackageId(id) || isComponentId(id) || isModuleId(id) || isLayerId(id) || isExternalId(id)
  );
}
