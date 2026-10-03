export function groupBy<T, K extends PropertyKey>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [item]);
    } else {
      bucket.push(item);
    }
  }
  return groups;
}

export function sumBy<T>(items: Iterable<T>, valueOf: (item: T) => number): number {
  let total = 0;
  for (const item of items) {
    total += valueOf(item);
  }
  return total;
}
