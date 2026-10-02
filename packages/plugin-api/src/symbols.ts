/**
 * Symbol naming shared by all language adapters, implementing the IR's normative symbol identity rule
 * (docs/IR.md, "Symbols"):
 *
 * - A symbol's identity within its file is (qualified name, kind, static-ness, key). Declarations with the same
 *   identity are one symbol (function overloads, interface/namespace declaration merging, re-declarations).
 * - Among distinct identities sharing a qualified name, the bare local name goes to the one that comes first
 *   by kind precedence (`SYMBOL_KIND_PRECEDENCE`), then instance before static, then by key. Source order
 *   never matters, so reordering declarations does not change identifiers.
 * - The others get `<qualified name>~<kind>[-static][-<key>]`, e.g. `Foo~namespace`, `create~method-static`.
 *
 * Naming is two-phase: declare every declaration of a file, then assign.
 */
import { SYMBOL_KIND_PRECEDENCE, compareStrings, type SymbolKind } from "@katedrala/ir";

export interface SymbolDeclarationInput {
  /** Escaped qualified name (see `qualifiedNameOf` in `@katedrala/ir`). */
  qualifiedName: string;
  kind: SymbolKind;
  /** Static members are distinct from instance members with the same name. */
  isStatic?: boolean;
  /**
   * Content-derived discriminator for declarations that are otherwise identical, in kebab-case (e.g. the
   * implemented trait of a Rust `impl` method). Never a position or a counter.
   */
  key?: string;
}

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PRECEDENCE = new Map<string, number>(
  SYMBOL_KIND_PRECEDENCE.map((kind, index) => [kind, index]),
);

function compareIdentities(a: SymbolDeclarationInput, b: SymbolDeclarationInput): number {
  const pa = PRECEDENCE.get(a.kind) ?? PRECEDENCE.size;
  const pb = PRECEDENCE.get(b.kind) ?? PRECEDENCE.size;
  return (
    pa - pb ||
    compareStrings(a.kind, b.kind) ||
    Number(a.isStatic ?? false) - Number(b.isStatic ?? false) ||
    compareStrings(a.key ?? "", b.key ?? "")
  );
}

function identityKey(input: SymbolDeclarationInput): string {
  return `${input.qualifiedName}\u0000${input.kind}\u0000${input.isStatic === true ? "s" : "i"}\u0000${input.key ?? ""}`;
}

function disambiguator(input: SymbolDeclarationInput): string {
  return [input.kind, input.isStatic === true ? "static" : undefined, input.key]
    .filter((part): part is string => part !== undefined && part !== "")
    .join("-");
}

export class SymbolNamer {
  readonly #declarations: SymbolDeclarationInput[] = [];
  #localNames: string[] | undefined;
  #merged: boolean[] | undefined;

  /**
   * Register a declaration (in source order) and return its handle.
   *
   * @throws {Error} after {@link assign} was called, or for an invalid key.
   */
  declare(input: SymbolDeclarationInput): number {
    if (this.#localNames !== undefined) throw new Error("SymbolNamer: declare() after assign()");
    if (input.qualifiedName === "") throw new Error("SymbolNamer: empty qualified name");
    if (input.qualifiedName.includes("~")) {
      throw new Error(`SymbolNamer: qualified name must be escaped: ${input.qualifiedName}`);
    }
    if (input.key !== undefined && !KEY.test(input.key)) {
      throw new Error(`SymbolNamer: invalid key ${JSON.stringify(input.key)}`);
    }
    this.#declarations.push({ ...input });
    return this.#declarations.length - 1;
  }

  /** Assign local names to every declared handle (idempotent). Index the result by handle. */
  assign(): readonly string[] {
    if (this.#localNames !== undefined) return this.#localNames;
    const byName = new Map<string, Map<string, SymbolDeclarationInput>>();
    for (const declaration of this.#declarations) {
      let identities = byName.get(declaration.qualifiedName);
      if (identities === undefined) {
        identities = new Map();
        byName.set(declaration.qualifiedName, identities);
      }
      const key = identityKey(declaration);
      if (!identities.has(key)) identities.set(key, declaration);
    }
    const nameOfIdentity = new Map<string, string>();
    for (const [qualifiedName, identities] of byName) {
      const ordered = [...identities.values()].sort(compareIdentities);
      ordered.forEach((identity, index) => {
        const localName =
          index === 0 ? qualifiedName : `${qualifiedName}~${disambiguator(identity)}`;
        nameOfIdentity.set(identityKey(identity), localName);
      });
    }
    const seen = new Set<string>();
    const merged: boolean[] = [];
    const localNames = this.#declarations.map((declaration) => {
      const key = identityKey(declaration);
      merged.push(seen.has(key));
      seen.add(key);
      const localName = nameOfIdentity.get(key);
      if (localName === undefined) throw new Error("SymbolNamer: unnamed declaration");
      return localName;
    });
    this.#merged = merged;
    this.#localNames = localNames;
    return localNames;
  }

  /** The local name of a declared handle (assigns names on first use). */
  localName(handle: number): string {
    const name = this.assign()[handle];
    if (name === undefined) throw new Error(`SymbolNamer: unknown handle ${handle}`);
    return name;
  }

  /** Whether the declaration merged into an earlier declaration with the same identity. */
  isMerged(handle: number): boolean {
    this.assign();
    return this.#merged?.[handle] ?? false;
  }
}
