/** Minimal in-memory tables, used until the Postgres migration lands. */
export interface Table<Row extends { id: string }> {
  get(id: string): Row | undefined;
  all(): Row[];
  where(predicate: (row: Row) => boolean): Row[];
  upsert(row: Row): Row;
  delete(id: string): boolean;
}

const tables = new Map<string, Map<string, unknown>>();

export function table<Row extends { id: string }>(name: string): Table<Row> {
  let rows = tables.get(name);
  if (rows === undefined) {
    rows = new Map();
    tables.set(name, rows);
  }
  const store = rows as Map<string, Row>;
  return {
    get: (id) => store.get(id),
    all: () => [...store.values()],
    where: (predicate) => [...store.values()].filter(predicate),
    upsert: (row) => {
      store.set(row.id, row);
      return row;
    },
    delete: (id) => store.delete(id),
  };
}

let sequence = 0;

export function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence.toString(36).padStart(4, "0")}`;
}
