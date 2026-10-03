/**
 * Lexical name lookup over the symbol tables created by TypeScript's binder.
 *
 * The lookup follows TypeScript's own name resolution (the checker's `resolveName`) closely enough for
 * dependency extraction, without the type checker:
 * - scopes are searched from the innermost outwards through each container's `locals`;
 * - names are looked up with a *meaning* (value, type or namespace), so that `function f(User: number)`
 *   does not hide an imported type `User` in type positions;
 * - parameters and type parameters are visible in a function's signature, other locals only in its body;
 * - decorators are resolved outside the decorated class element (and outside the class);
 * - merged namespaces see each other's exports; enum members are in scope inside their enum; class and
 *   interface type parameters, class expression names and function expression names are handled
 *   syntactically.
 *
 * Results are cached per scope container: the outcome of continuing a lookup from a container depends only
 * on the container, the name, the meaning and whether the lookup came from a function's body.
 */
import ts from "typescript";
import { localsOf, symbolOf } from "./ts-internals.js";
import { bindingRoot, parentOf } from "./syntax.js";
import { K } from "./kinds.js";

const {
  escapeLeadingUnderscores,
  isBindingElement,
  isCallExpression,
  isClassElement,
  isClassExpression,
  isClassLike,
  isExportAssignment,
  isExportSpecifier,
  isIdentifier,
  isImportEqualsDeclaration,
  isNamespaceExport,
  isParameter,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isStringLiteral,
  isTypeParameterDeclaration,
  isVariableDeclaration,
} = ts;

/** What a name is looked up as. `namespace` is the root of a qualified name in a type position. */
export type Meaning = "value" | "type" | "namespace";

const VALUE = 1;
const TYPE = 2;
const NAMESPACE = 4;
const ALL = VALUE | TYPE | NAMESPACE;

/** Meanings provided by declaration kinds (variables are special-cased for `require` aliases). */
const MEANINGS = new Uint8Array(ts.SyntaxKind.Count + 1);
for (const [kinds, meanings] of [
  [[K.ImportClause, K.ImportSpecifier, K.NamespaceImport, K.ImportEqualsDeclaration], ALL],
  [[K.EnumDeclaration], ALL],
  [[K.Parameter, K.FunctionDeclaration, K.FunctionExpression, K.EnumMember], VALUE],
  [[K.ClassDeclaration, K.ClassExpression], VALUE | TYPE],
  [[K.ModuleDeclaration], VALUE | NAMESPACE],
  [
    [
      K.InterfaceDeclaration,
      K.TypeAliasDeclaration,
      K.TypeParameter,
      K.JSDocTypedefTag,
      K.JSDocCallbackTag,
    ],
    TYPE,
  ],
] as const) {
  for (const kind of kinds) MEANINGS[kind] = meanings;
}

const MEANING_BITS: Readonly<Record<Meaning, number>> = {
  value: VALUE,
  type: TYPE,
  namespace: NAMESPACE,
};

/** Whether a declaration found under a name provides the requested meaning. */
export function providesMeaning(declaration: ts.Node, meaning: Meaning): boolean {
  if (isVariableDeclaration(declaration) || isBindingElement(declaration)) {
    // CommonJS `require` bindings are aliases of a module (all meanings), like TypeScript treats them.
    return meaning === "value" || isRequireAlias(declaration);
  }
  return ((MEANINGS[declaration.kind] ?? 0) & MEANING_BITS[meaning]) !== 0;
}

function isRequireAlias(declaration: ts.Node): boolean {
  const variable = isBindingElement(declaration) ? bindingRoot(declaration) : declaration;
  if (!isVariableDeclaration(variable) || variable.initializer === undefined) return false;
  let initializer: ts.Expression = variable.initializer;
  while (isPropertyAccessExpression(initializer) || isParenthesizedExpression(initializer)) {
    initializer = initializer.expression;
  }
  return (
    isCallExpression(initializer) &&
    isIdentifier(initializer.expression) &&
    initializer.expression.text === "require"
  );
}

/** Whether a declaration is a parameter or a name bound inside a parameter's destructuring pattern. */
function isParameterLike(declaration: ts.Node): boolean {
  if (isParameter(declaration) || isTypeParameterDeclaration(declaration)) return true;
  return isBindingElement(declaration) && isParameter(bindingRoot(declaration));
}

// Scope container kinds, as a table indexed by syntax kind (avoids property loads on other nodes).
const HAS_LOCALS = 1;
const FUNCTION_LIKE = 2;
const EXPORTS = 4;
const ENUM = 8;
const TYPE_PARAMETERS = 16;
const FUNCTION_NAME = 32;
const DECORATOR = 64;

const SCOPE_FLAGS = new Uint8Array(K.Count + 1);
for (const kind of [
  K.Block,
  K.CaseBlock,
  K.CatchClause,
  K.ClassStaticBlockDeclaration,
  K.ConditionalType,
  K.ForStatement,
  K.ForInStatement,
  K.ForOfStatement,
  K.JSDocCallbackTag,
  K.JSDocEnumTag,
  K.JSDocTypedefTag,
  K.MappedType,
  K.TypeAliasDeclaration,
]) {
  SCOPE_FLAGS[kind] = HAS_LOCALS;
}
for (const kind of [
  K.ArrowFunction,
  K.CallSignature,
  K.Constructor,
  K.ConstructorType,
  K.ConstructSignature,
  K.FunctionDeclaration,
  K.FunctionType,
  K.GetAccessor,
  K.IndexSignature,
  K.JSDocFunctionType,
  K.JSDocSignature,
  K.MethodDeclaration,
  K.MethodSignature,
  K.SetAccessor,
]) {
  SCOPE_FLAGS[kind] = HAS_LOCALS | FUNCTION_LIKE;
}
SCOPE_FLAGS[K.FunctionExpression] = HAS_LOCALS | FUNCTION_LIKE | FUNCTION_NAME;
SCOPE_FLAGS[K.SourceFile] = HAS_LOCALS | EXPORTS;
SCOPE_FLAGS[K.ModuleDeclaration] = HAS_LOCALS | EXPORTS;
SCOPE_FLAGS[K.EnumDeclaration] = ENUM;
SCOPE_FLAGS[K.ClassDeclaration] = TYPE_PARAMETERS;
SCOPE_FLAGS[K.ClassExpression] = TYPE_PARAMETERS;
SCOPE_FLAGS[K.InterfaceDeclaration] = TYPE_PARAMETERS;
SCOPE_FLAGS[K.Decorator] = DECORATOR;

function functionBody(node: ts.Node): ts.Node | undefined {
  return (node as ts.Node & { readonly body?: ts.Node }).body;
}

function matching(
  declarations: readonly ts.Declaration[] | undefined,
  meaning: Meaning,
  accept?: (declaration: ts.Declaration) => boolean,
): readonly ts.Declaration[] | undefined {
  if (declarations === undefined) return undefined;
  const result = declarations.filter(
    (declaration) =>
      (accept === undefined || accept(declaration)) && providesMeaning(declaration, meaning),
  );
  return result.length > 0 ? result : undefined;
}

const NONE: readonly ts.Declaration[] = Object.freeze([]);

function lookupInScope(
  flags: number,
  location: ts.Node,
  restricted: boolean,
  name: ts.__String,
  meaning: Meaning,
): readonly ts.Declaration[] | undefined {
  if ((flags & HAS_LOCALS) !== 0) {
    const local = localsOf(location)?.get(name);
    if (local !== undefined) {
      // Locals of a function are visible in its body; its signature only sees parameters and type parameters.
      const found = matching(local.declarations, meaning, restricted ? isParameterLike : undefined);
      if (found !== undefined) return found;
    }
  }
  if ((flags & EXPORTS) !== 0) {
    // Exports of merged namespace declarations, and exported import aliases (`export import A = N.B`),
    // which the binder only records among exports.
    const isModule = location.kind === K.ModuleDeclaration;
    const exported = symbolOf(location)?.exports?.get(name);
    const found = matching(
      exported?.declarations,
      meaning,
      (declaration) =>
        !isExportSpecifier(declaration) &&
        !isExportAssignment(declaration) &&
        !isNamespaceExport(declaration) &&
        (isModule || isImportEqualsDeclaration(declaration)),
    );
    if (found !== undefined) return found;
  }
  if ((flags & ENUM) !== 0 && meaning === "value") {
    const member = (location as ts.EnumDeclaration).members.find(
      (candidate) =>
        (isIdentifier(candidate.name) || isStringLiteral(candidate.name)) &&
        escapeLeadingUnderscores(candidate.name.text) === name,
    );
    if (member !== undefined) return [member];
  }
  if ((flags & TYPE_PARAMETERS) !== 0) {
    const declaration = location as ts.ClassLikeDeclaration | ts.InterfaceDeclaration;
    if (meaning === "type") {
      const parameter = declaration.typeParameters?.find(
        (candidate) => candidate.name.escapedText === name,
      );
      if (parameter !== undefined) return [parameter];
    }
    if (
      isClassExpression(declaration) &&
      meaning !== "namespace" &&
      declaration.name?.escapedText === name
    ) {
      return [declaration];
    }
  }
  if (
    (flags & FUNCTION_NAME) !== 0 &&
    meaning === "value" &&
    (location as ts.FunctionExpression).name?.escapedText === name
  ) {
    return [location as ts.FunctionExpression];
  }
  return undefined;
}

/** The nearest ancestor of a node that matters to lookups, and its child on the path from the node. */
interface Hop {
  readonly location: ts.Node;
  readonly child: ts.Node;
}

/**
 * Lookups walk this many nodes up one by one before they skip runs of nodes by {@link Hop}s: names are
 * usually a few nodes below their scope, where walking is cheaper than recording hops.
 */
const STEPS_BEFORE_HOPS = 16;

/**
 * Name lookup for one file, with a per-container cache. Create one per file (it holds references to the
 * file's nodes).
 */
export class ScopeLookup {
  readonly #bound: boolean;
  /** Per scope container: one table per (meaning, restricted) combination, keyed by escaped name. */
  readonly #cache = new Map<
    ts.Node,
    Array<Map<ts.__String, readonly ts.Declaration[]> | undefined>
  >();
  /**
   * For nodes that are not scope containers: the nearest ancestor that is one. Lookups skip runs of other
   * nodes in one step, so that names deep inside long operator chains (`a + a + ... + a`, `k === 1 || ...`)
   * are looked up in constant time instead of time proportional to their depth.
   */
  readonly #hops = new Map<ts.Node, Hop>();

  /** `bound`: whether the file was bound; without scopes every lookup finds nothing. */
  constructor(bound: boolean) {
    this.#bound = bound;
  }

  /**
   * The declarations a name denotes at a location, innermost scope first; empty when the name is not bound
   * in the file (a global or an undeclared name). `start` is the node the name occurs at.
   */
  lookup(name: ts.__String, start: ts.Node, meaning: Meaning): readonly ts.Declaration[] {
    if (!this.#bound) return NONE;
    const meaningSlot = meaning === "value" ? 0 : meaning === "type" ? 2 : 4;
    const visited: Array<{ readonly location: ts.Node; readonly slot: number }> = [];
    /** Nodes passed (after the first steps) since the last scope container: they all hop to the next one. */
    const passed: ts.Node[] = [];
    let steps = 0;
    let lastLocation: ts.Node = start;
    let location = parentOf(start);
    let result: readonly ts.Declaration[] = NONE;
    while (location !== undefined) {
      const flags = SCOPE_FLAGS[location.kind] ?? 0;
      if (flags === 0) {
        if (steps < STEPS_BEFORE_HOPS) {
          steps += 1;
        } else {
          const hop = this.#hops.get(location);
          if (hop !== undefined) {
            lastLocation = hop.child;
            location = hop.location;
            continue;
          }
          passed.push(location);
        }
        lastLocation = location;
        location = parentOf(location);
        continue;
      }
      if (passed.length > 0) {
        const hop: Hop = { location, child: lastLocation };
        for (const node of passed) this.#hops.set(node, hop);
        passed.length = 0;
      }
      if ((flags & DECORATOR) !== 0) {
        // Decorators are evaluated where the class is declared, not inside the decorated element.
        let target: ts.Node = location;
        if (isParameter(target.parent)) target = target.parent;
        if (isClassElement(target.parent) || isClassLike(target.parent)) target = target.parent;
        lastLocation = target;
        location = parentOf(target);
        continue;
      }
      const restricted = (flags & FUNCTION_LIKE) !== 0 && lastLocation !== functionBody(location);
      const slot = meaningSlot + (restricted ? 1 : 0);
      const cached = this.#cache.get(location)?.[slot]?.get(name);
      if (cached !== undefined) {
        result = cached;
        break;
      }
      visited.push({ location, slot });
      const found = lookupInScope(flags, location, restricted, name, meaning);
      if (found !== undefined) {
        result = found;
        break;
      }
      lastLocation = location;
      location = parentOf(location);
    }
    for (const { location: scope, slot } of visited) {
      let tables = this.#cache.get(scope);
      if (tables === undefined) {
        tables = [];
        this.#cache.set(scope, tables);
      }
      let table = tables[slot];
      if (table === undefined) {
        table = new Map();
        tables[slot] = table;
      }
      table.set(name, result);
    }
    return result;
  }
}
