/** "1 member", "3 members": a count with its noun in agreement. */
export function counted(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The verb of "n of m rest on it", in agreement with n. */
export function rests(n: number): string {
  return n === 1 ? "rests" : "rest";
}

/** "Auth", "Auth and Users", "Gateway, Auth and Users": names joined the way the page's prose lists them. */
export function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
