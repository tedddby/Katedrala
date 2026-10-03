/**
 * Classification of module specifiers and npm package names.
 */

/** A bare specifier split into the package it names and the subpath inside the package. */
export interface PackageSpecifier {
  /** `name` or `@scope/name`. */
  packageName: string;
  /** `.` for the package itself, otherwise `./<rest>`. */
  subpath: string;
}

const MAX_PACKAGE_NAME_LENGTH = 214;

/** Whether a specifier is relative: `.`, `..`, or starting with `./` or `../`. */
export function isRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

/**
 * Whether a specifier is an absolute path (`/x`, `\x`, `C:\x`, `C:/x`) or a URL (`file:///x`,
 * `https://host/x`, `data:...`). Such specifiers never denote files of a snapshot.
 */
export function isAbsoluteOrUrlSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("/") ||
    specifier.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(specifier) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)
  );
}

function isUrlSafeName(part: string): boolean {
  return part !== "" && encodeURIComponent(part) === part;
}

/**
 * Whether `name` is a syntactically valid npm package name: `name` or `@scope/name`, URL-safe
 * characters only, not starting with `.` or `_`, at most 214 characters. Upper-case letters are accepted
 * (legacy packages use them).
 */
export function isValidPackageName(name: string): boolean {
  if (name.length > MAX_PACKAGE_NAME_LENGTH) return false;
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash === -1) return false;
    const scope = name.slice(1, slash);
    const local = name.slice(slash + 1);
    return isUrlSafeName(scope) && isUrlSafeName(local) && !/^[._]/.test(local);
  }
  return isUrlSafeName(name) && !/^[._]/.test(name);
}

/**
 * Split a bare specifier into package name and subpath (`@scope/pkg/sub/x` → `@scope/pkg`, `./sub/x`);
 * undefined when the specifier does not start with a valid package name.
 */
export function parsePackageSpecifier(specifier: string): PackageSpecifier | undefined {
  const segments = specifier.split("/");
  const nameSegments = specifier.startsWith("@") ? 2 : 1;
  if (segments.length < nameSegments) return undefined;
  const packageName = segments.slice(0, nameSegments).join("/");
  if (!isValidPackageName(packageName)) return undefined;
  const rest = segments.slice(nameSegments).join("/");
  return { packageName, subpath: rest === "" ? "." : `./${rest}` };
}

/** A location inside a `node_modules` directory: the package installed there and the path inside it. */
export interface InstalledLocation {
  /** `name` or `@scope/name`: the directory below `node_modules`. */
  packageName: string;
  /** The rest of the path inside the package ("" for the package directory itself). */
  path: string;
}

/**
 * The package a path into `node_modules` points at: the package directory after the last `node_modules`
 * segment (so `.pnpm/<id>/node_modules/<name>` counts as `<name>`); undefined when the path has no
 * `node_modules` segment or no valid package name follows the last one.
 *
 * @example installedLocationOf("node_modules/@types/react/index.d.ts") → `@types/react`, `index.d.ts`
 */
export function installedLocationOf(path: string): InstalledLocation | undefined {
  const segments = path.split("/");
  const last = segments.lastIndexOf("node_modules");
  if (last === -1) return undefined;
  const rest = segments.slice(last + 1);
  const nameSegments = rest[0]?.startsWith("@") === true ? 2 : 1;
  if (rest.length < nameSegments) return undefined;
  const packageName = rest.slice(0, nameSegments).join("/");
  if (!isValidPackageName(packageName)) return undefined;
  return { packageName, path: rest.slice(nameSegments).join("/") };
}

/**
 * The package whose types a DefinitelyTyped package provides (`@types/react` → `react`,
 * `@types/babel__core` → `@babel/core`); any other name unchanged.
 */
export function runtimePackageName(packageName: string): string {
  if (!packageName.startsWith("@types/")) return packageName;
  const typed = packageName.slice("@types/".length);
  const separator = typed.indexOf("__");
  const name =
    separator === -1 ? typed : `@${typed.slice(0, separator)}/${typed.slice(separator + 2)}`;
  return isValidPackageName(name) ? name : packageName;
}

/**
 * Every split of a specifier into a candidate package name and subpath at a `/` boundary, longest name
 * first (`a/b/c` → `a/b/c` + `.`, `a/b` + `./c`, `a` + `./b/c`). Used to find the longest workspace
 * package name a specifier starts with.
 */
export function packageNameCandidates(specifier: string): PackageSpecifier[] {
  const segments = specifier.split("/");
  const candidates: PackageSpecifier[] = [];
  for (let length = segments.length; length >= 1; length--) {
    const packageName = segments.slice(0, length).join("/");
    if (packageName === "") continue;
    const rest = segments.slice(length).join("/");
    candidates.push({ packageName, subpath: rest === "" ? "." : `./${rest}` });
  }
  return candidates;
}
