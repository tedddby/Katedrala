export interface Entity<K> {
  readonly id: K;
}

export class EntityNotFoundError<K> extends Error {
  constructor(
    readonly entity: string,
    readonly id: K,
  ) {
    super(`${entity} ${String(id)} was not found`);
    this.name = "EntityNotFoundError";
  }
}

/** Base class of all repositories: entities of type T identified by keys of type K. */
export abstract class Repository<T extends Entity<K>, K = string> {
  protected abstract readonly entityName: string;

  abstract findById(id: K): Promise<T | undefined>;

  abstract save(entity: T): Promise<void>;

  async getOrThrow(id: K): Promise<T> {
    const entity = await this.findById(id);
    if (entity === undefined) {
      throw new EntityNotFoundError(this.entityName, id);
    }
    return entity;
  }
}
