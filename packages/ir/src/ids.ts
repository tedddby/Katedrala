/**
 * Stable identifiers.
 *
 * Identifiers are deterministic functions of what an entity *is* (its path, its qualified name, its
 * endpoints), never of when or how it was discovered, of the order of declarations, or of line numbers.
 * Analyzing the same repository twice yields the same identifiers, and an entity keeps its identifier across
 * commits as long as its defining properties do not change. This is what makes architecture diffs, history,
 * caching and external consumers possible. See docs/IR.md for the normative definitions.
 */
import type {
  AnomalyId,
  ComponentId,
  DirectoryId,
  EdgeId,
  EndpointId,
  EntityId,
  EntityKind,
  ExternalId,
  FileId,
  LayerId,
  ModuleId,
  PackageId,
  RepositoryId,
  SymbolId,
  ViolationId,
} from "./types/common.js";
import { shortHash } from "./hash.js";
import { normalizePath } from "./paths.js";

/** Identifier prefix of each entity kind. */
export const ID_PREFIXES = {
  repository: "repo:",
  directory: "dir:",
  file: "file:",
  symbol: "sym:",
  package: "pkg:",
  external: "ext:",
  component: "cmp:",
  module: "mod:",
  layer: "layer:",
  endpoint: "endpoint:",
} as const satisfies Record<EntityKind, string>;

/** Error thrown when an identifier cannot be constructed from the given parts. */
export class InvalidIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIdentifierError";
  }
}

function requireNonEmpty(value: string, what: string): string {
  if (value.trim() === "") throw new InvalidIdentifierError(`${what} must not be empty`);
  return value;
}

/**
 * Normalize a git remote URL: drop the scheme, credentials, port and a trailing `.git`, rewrite scp-like
 * `git@host:owner/repo` to `host/owner/repo`, and lower-case the host. Returns undefined for unusable input.
 *
 * @example normalizeRemoteUrl("git@github.com:acme/shop.git") === "github.com/acme/shop"
 */
export function normalizeRemoteUrl(url: string): string | undefined {
  const input = url.trim();
  if (input === "") return undefined;
  let host: string;
  let path: string;
  const withScheme = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(input);
  if (withScheme !== null) {
    const [, scheme = "", remainder = ""] = withScheme;
    // Local remotes have no stable, machine-independent identity.
    if (scheme.toLowerCase() === "file") return undefined;
    const rest = remainder.replace(/^[^@/]*@/, "");
    const slash = rest.indexOf("/");
    host = (slash === -1 ? rest : rest.slice(0, slash)).replace(/:\d+$/, "");
    path = slash === -1 ? "" : rest.slice(slash + 1);
  } else {
    // scp-like syntax: [user@]host:path. A single-letter "host" is a Windows drive letter, not a remote.
    const scp = /^(?:[^@\s/]+@)?([^:\s/]+):(.+)$/.exec(input);
    if (scp === null || scp[1] === undefined || scp[2] === undefined || scp[1].length === 1) {
      return undefined;
    }
    host = scp[1];
    path = scp[2];
  }
  host = host.toLowerCase();
  path = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  if (host === "") return undefined;
  return path === "" ? host : `${host}/${path}`;
}

/** `repo:<normalized remote or name>` */
export function repositoryId(nameOrRemote: string): RepositoryId {
  return `repo:${requireNonEmpty(nameOrRemote, "Repository name")}`;
}

/** `dir:<path>`; the root directory ("") is `dir:`. The path is normalized. */
export function directoryId(path: string): DirectoryId {
  return `dir:${normalizePath(path)}`;
}

/** `file:<path>`. The path is normalized. */
export function fileId(path: string): FileId {
  return `file:${requireNonEmpty(normalizePath(path), "File path")}`;
}

// ─── Symbols ─────────────────────────────────────────────────────────────────

/** Disambiguators are lower-case alphanumeric words joined by hyphens, e.g. `namespace`, `method-static`. */
const DISAMBIGUATOR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Encode one segment of a qualified name: `%` → `%25`, `.` → `%2E`, `~` → `%7E`. Identifiers of common
 * languages never contain these characters, so qualified names stay readable; string and computed member
 * names (e.g. `"foo.bar"`, `[Symbol.iterator]`) remain unambiguous.
 */
export function escapeNameSegment(segment: string): string {
  return segment.replaceAll("%", "%25").replaceAll(".", "%2E").replaceAll("~", "%7E");
}

/** Inverse of {@link escapeNameSegment}. */
export function unescapeNameSegment(segment: string): string {
  return segment.replaceAll("%2E", ".").replaceAll("%7E", "~").replaceAll("%25", "%");
}

/** Build a qualified name from raw (unescaped) segments, e.g. `["PaymentService", "charge"]`. */
export function qualifiedNameOf(segments: readonly string[]): string {
  if (segments.length === 0) throw new InvalidIdentifierError("A qualified name needs a segment");
  return segments
    .map((segment) => escapeNameSegment(requireNonEmpty(segment, "Name segment")))
    .join(".");
}

/** Split a qualified name into raw (unescaped) segments. */
export function qualifiedNameSegments(qualifiedName: string): string[] {
  return qualifiedName.split(".").map(unescapeNameSegment);
}

/** Escape a path for a symbol identifier: `%` → `%25`, `#` → `%23`. */
function escapeSymbolPath(path: string): string {
  return path.replaceAll("%", "%25").replaceAll("#", "%23");
}

function unescapeSymbolPath(path: string): string {
  return path.replaceAll("%23", "#").replaceAll("%25", "%");
}

/**
 * `sym:<escaped path>#<qualified name>[~<disambiguator>]`.
 *
 * @param qualifiedName - an escaped qualified name (see {@link qualifiedNameOf}).
 * @param disambiguator - distinguishes distinct declarations sharing a qualified name (see docs/IR.md).
 */
export function symbolId(
  filePath: string,
  qualifiedName: string,
  disambiguator?: string,
): SymbolId {
  const path = requireNonEmpty(normalizePath(filePath), "Symbol file path");
  requireNonEmpty(qualifiedName, "Symbol qualified name");
  if (qualifiedName.includes("~")) {
    throw new InvalidIdentifierError(`Qualified name contains an unescaped "~": ${qualifiedName}`);
  }
  if (disambiguator !== undefined && !DISAMBIGUATOR.test(disambiguator)) {
    throw new InvalidIdentifierError(
      `Invalid symbol disambiguator: ${JSON.stringify(disambiguator)}`,
    );
  }
  const suffix = disambiguator === undefined ? "" : `~${disambiguator}`;
  return `sym:${escapeSymbolPath(path)}#${qualifiedName}${suffix}`;
}

export interface ParsedSymbolId {
  path: string;
  /** The escaped qualified name. */
  qualifiedName: string;
  disambiguator?: string;
}

/** Parse a symbol identifier produced by {@link symbolId}; undefined when malformed. */
export function parseSymbolId(id: string): ParsedSymbolId | undefined {
  if (!id.startsWith("sym:")) return undefined;
  const body = id.slice(4);
  const hash = body.indexOf("#");
  if (hash <= 0 || hash === body.length - 1) return undefined;
  const path = unescapeSymbolPath(body.slice(0, hash));
  const rest = body.slice(hash + 1);
  const tilde = rest.indexOf("~");
  if (tilde === -1) return { path, qualifiedName: rest };
  const qualifiedName = rest.slice(0, tilde);
  const disambiguator = rest.slice(tilde + 1);
  if (qualifiedName === "" || !DISAMBIGUATOR.test(disambiguator)) return undefined;
  return { path, qualifiedName, disambiguator };
}

/**
 * The part of a symbol identifier after `#` (qualified name plus disambiguator), used by adapters as the
 * file-local name of a symbol.
 */
export function symbolLocalName(qualifiedName: string, disambiguator?: string): string {
  return disambiguator === undefined ? qualifiedName : `${qualifiedName}~${disambiguator}`;
}

// ─── Packages, externals, architecture ──────────────────────────────────────

/** Ecosystem names are lower-case words joined by hyphens, e.g. `npm`, `cargo`. */
const ECOSYSTEM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `pkg:<ecosystem>:<manifest directory>`, e.g. `pkg:npm:packages/api`; the root manifest is `pkg:npm:`.
 * Location-based so that names may repeat (fixtures, examples) and renaming a package keeps its identity.
 */
export function packageId(ecosystem: string, manifestDirectory: string): PackageId {
  if (!ECOSYSTEM.test(ecosystem)) {
    throw new InvalidIdentifierError(`Invalid package ecosystem: ${JSON.stringify(ecosystem)}`);
  }
  return `pkg:${ecosystem}:${normalizePath(manifestDirectory)}`;
}

/**
 * External identifier namespaces: the registry in `EXTERNAL_NAMESPACES` (e.g. `npm`, `node`, `pypi`, `env`,
 * `http`), or plugin-reserved `x-<name>` namespaces.
 */
export type ExternalNamespace =
  | "npm"
  | "node"
  | "pypi"
  | "python"
  | "maven"
  | "jdk"
  | "go"
  | "go-std"
  | "cargo"
  | "rust-std"
  | "nuget"
  | "dotnet"
  | "env"
  | "http"
  | "datastore"
  | `x-${string}`;

/** `ext:<namespace>:<name>` */
export function externalId(namespace: ExternalNamespace, name: string): ExternalId {
  return `ext:${namespace}:${requireNonEmpty(name, "External name")}`;
}

/** `cmp:<path>`; a component rooted at the analysis root is `cmp:`. The path is normalized. */
export function componentId(path: string): ComponentId {
  return `cmp:${normalizePath(path)}`;
}

/** `mod:<key>`, see {@link declaredModuleKey} and {@link inferredModuleKey}. */
export function moduleId(key: string): ModuleId {
  return `mod:${requireNonEmpty(key, "Module key")}`;
}

/** The key of a declared module: its configured name (which must not contain `#` or `~`). */
export function declaredModuleKey(name: string): string {
  if (/[#~]/.test(name))
    throw new InvalidIdentifierError(`Module names must not contain "#" or "~": ${name}`);
  return requireNonEmpty(name, "Module name");
}

/**
 * The key of an inferred module: its anchor directory, followed by `#<stem>` for modules anchored on a
 * file-name stem; `~inferred` is appended when the key equals a declared module's key.
 */
export function inferredModuleKey(
  anchor: { directory: string; stem?: string },
  collidesWithDeclared = false,
): string {
  const directory = normalizePath(anchor.directory);
  const key = anchor.stem === undefined ? directory : `${directory}#${anchor.stem}`;
  const base = key === "" ? "." : key;
  return collidesWithDeclared ? `${base}~inferred` : base;
}

/** `layer:<name>` */
export function layerId(name: string): LayerId {
  return `layer:${requireNonEmpty(name, "Layer name")}`;
}

/** `endpoint:<16 hex digits of SHA-256("<protocol>\n<method>\n<path>\n<handler>")>` */
export function endpointId(
  protocol: string,
  method: string,
  path: string,
  handler: string,
): EndpointId {
  return `endpoint:${shortHash(`${protocol}\n${method}\n${path}\n${handler}`)}`;
}

// ─── Hashed identifiers ──────────────────────────────────────────────────────

/** `edge:<16 hex digits of SHA-256("<kind>\n<source>\n<target>")>` */
export function edgeId(kind: string, source: string, target: string): EdgeId {
  return `edge:${shortHash(`${kind}\n${source}\n${target}`)}`;
}

/** `anomaly:<type>:<16 hex digits of SHA-256 of the sorted subject ids joined by "\n">` */
export function anomalyId(type: string, subjects: readonly string[]): AnomalyId {
  const key = [...new Set(subjects)].sort(compareStrings).join("\n");
  return `anomaly:${type}:${shortHash(key)}`;
}

/** `anomaly:<type>:<16 hex digits of SHA-256("<source>\n<target>")>`, for directional anomaly types. */
export function directionalAnomalyId(type: string, source: string, target: string): AnomalyId {
  return `anomaly:${type}:${shortHash(`${source}\n${target}`)}`;
}

/**
 * `violation:<rule id>:<16 hex digits of SHA-256("<rule>\n<source>\n<target>\n<discriminator>")>`, where a
 * missing target or discriminator is the empty string. The discriminator must be a stable identity component
 * (never a measured value).
 */
export function violationId(
  rule: string,
  source: string,
  target?: string,
  discriminator?: string,
): ViolationId {
  return `violation:${rule}:${shortHash(`${rule}\n${source}\n${target ?? ""}\n${discriminator ?? ""}`)}`;
}

// ─── Inspection ──────────────────────────────────────────────────────────────

const PREFIX_TO_KIND = new Map<string, EntityKind>(
  Object.entries(ID_PREFIXES).map(([kind, prefix]) => [prefix, kind as EntityKind]),
);

/** The entity kind an identifier denotes, or undefined for unknown prefixes. */
export function entityKindOf(id: string): EntityKind | undefined {
  const colon = id.indexOf(":");
  if (colon === -1) return undefined;
  return PREFIX_TO_KIND.get(id.slice(0, colon + 1));
}

/** Whether a string is a well-formed identifier of a known entity kind. */
export function isEntityId(id: string): id is EntityId {
  return entityKindOf(id) !== undefined;
}

/**
 * The canonical order of identifiers and other strings in documents: ascending by UTF-16 code units
 * (JavaScript's default string comparison), independent of locale.
 */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
