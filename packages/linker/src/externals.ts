/**
 * External entities (packages, built-ins, environment variables, services) and their namespaces.
 */
import { EXTERNAL_NAMESPACES, compareStrings, externalId, isExtensionValue } from "@katedrala/ir";
import type { ExternalEntity, ExternalId, ExternalKind, ExternalNamespace } from "@katedrala/ir";

function isRegisteredNamespace(namespace: string): namespace is keyof typeof EXTERNAL_NAMESPACES {
  return Object.hasOwn(EXTERNAL_NAMESPACES, namespace);
}

/**
 * The external namespace for a namespace reported by an adapter: registered namespaces (`npm`, `node`, ...)
 * and plugin namespaces (`x-...`) are kept; anything else is moved into the plugin space as `x-<namespace>`,
 * so identifiers always follow the IR's namespace registry.
 */
export function externalNamespace(namespace: string): ExternalNamespace {
  if (isRegisteredNamespace(namespace) || isExtensionValue(namespace)) return namespace;
  return `x-${namespace}`;
}

/**
 * The external namespace of the packages of a packaging ecosystem: the registered package namespace of the
 * same name (`npm` → `npm`, `cargo` → `cargo`), a plugin namespace as is, otherwise `x-<ecosystem>`.
 */
export function namespaceOfEcosystem(ecosystem: string): ExternalNamespace {
  if (isRegisteredNamespace(ecosystem) && EXTERNAL_NAMESPACES[ecosystem].kind === "package") {
    return ecosystem;
  }
  if (isExtensionValue(ecosystem)) return ecosystem;
  return `x-${ecosystem}`;
}

/** Collects the external entities of a document; one entity per identifier. */
export class ExternalRegistry {
  readonly #entities = new Map<ExternalId, ExternalEntity>();

  /**
   * Find or create an external. The first registration of an identifier determines its kind (registration
   * happens in a deterministic order). Returns undefined for blank names, which have no identifier.
   */
  register(
    kind: ExternalKind,
    namespace: ExternalNamespace,
    name: string,
  ): ExternalEntity | undefined {
    if (name.trim() === "") return undefined;
    const id = externalId(namespace, name);
    const existing = this.#entities.get(id);
    if (existing !== undefined) return existing;
    const entity: ExternalEntity = { id, kind, namespace, name };
    this.#entities.set(id, entity);
    return entity;
  }

  /** Every registered external sorted by id, with `declared` taken from `declared` when present. */
  entities(declared: ReadonlyMap<ExternalId, boolean>): ExternalEntity[] {
    return [...this.#entities.values()]
      .sort((a, b) => compareStrings(a.id, b.id))
      .map((entity) => {
        const flag = declared.get(entity.id);
        return flag === undefined ? { ...entity } : { ...entity, declared: flag };
      });
  }
}
