/** "1 member", "3 members": a count with its noun in agreement. */
export function counted(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The verb of "n of m rest on it", in agreement with n. */
export function rests(n: number): string {
  return n === 1 ? "rests" : "rest";
}
