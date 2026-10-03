export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function truncate(input: string, maxLength: number, ellipsis = "..."): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxLength - ellipsis.length)).trimEnd()}${ellipsis}`;
}

export function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}
