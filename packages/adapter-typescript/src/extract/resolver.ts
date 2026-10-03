/**
 * Resolution of identifiers and member chains to the targets of the extraction contract.
 *
 * A chain such as `a.b.c` is resolved from its root:
 * - an import binding → `{ type: "import", local, members }`;
 * - a symbol of this file → `{ type: "symbol", localName, members }`, descending into namespace members and
 *   static class members declared in the file (`N.f` → the symbol `N.f`);
 * - `this.x` inside a class → the member symbol `C.x` (or an instance of `C` when `x` is not declared);
 *   inside a method of `module.exports = { ... }` → the CommonJS export `x`; `super.m` → the extends-clause
 *   target with the member appended;
 * - `exports.x` / `module.exports.x` → the symbol created for the export `x`, or the binding it was assigned
 *   (`exports.x = x`, `module.exports = { x }`);
 * - `require("m").x` → `{ type: "module", specifier, members }`;
 * - `new C().x` / `f().x` → an `instance` target, when `C` / `f` is a binding (never an instance: targets do
 *   not nest along call chains, so `f().g().h` is not resolved and its links are recorded one by one);
 * - a local variable or parameter → an `instance` target when its type is known (declared type, `new X()`,
 *   a resolvable call; nested at most {@link MAX_LOCAL_TYPE_DEPTH} deep), the bare `local`/`parameter`
 *   binding when it is untyped, nothing otherwise;
 * - an unbound identifier → `{ type: "name" }`, unless it is a built-in global.
 */
import { SYMBOL_KIND_PRECEDENCE, type SymbolKind } from "@katedrala/ir";
import type { BindingRef, ReferenceTarget, TypeRef } from "@katedrala/plugin-api";
import ts from "typescript";
import type { FileDeclarations, SymbolInfo } from "./declarations.js";
import { isBuiltinGlobal } from "./globals.js";
import type { Meaning, ScopeLookup } from "./scope.js";
import {
  bindingRoot,
  boundNames,
  decomposeChain,
  decomposeEntityName,
  isDynamicImportCall,
  isRequireCallSyntax,
  isThisParameter,
  parameterIndex,
  parentOf,
  requireIdentifierOf,
  skipOuterAndAwait,
  specifierArgument,
} from "./syntax.js";
import { startOf } from "./text.js";
import {
  requireTestOf,
  variableImportBindingFor,
  variableImportOf,
  type IdentifierTest,
  type VariableImport,
} from "./variable-imports.js";
import { K } from "./kinds.js";

const {
  canHaveModifiers,
  getCombinedModifierFlags,
  getJSDocType,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isClassDeclaration,
  isClassLike,
  isClassStaticBlockDeclaration,
  isConstructorDeclaration,
  isDecorator,
  isEnumDeclaration,
  isExpressionWithTypeArguments,
  isExternalModuleReference,
  isFunctionDeclaration,
  isFunctionExpression,
  isGetAccessorDeclaration,
  isIdentifier,
  isImportClause,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportSpecifier,
  isImportTypeNode,
  isInterfaceDeclaration,
  isJSDocNonNullableType,
  isJSDocNullableType,
  isJSDocOptionalType,
  isLiteralTypeNode,
  isMetaProperty,
  isMethodDeclaration,
  isModuleBlock,
  isModuleDeclaration,
  isNamespaceImport,
  isNewExpression,
  isObjectLiteralExpression,
  isParameter,
  isParenthesizedTypeNode,
  isPropertyAssignment,
  isPropertyDeclaration,
  isSetAccessorDeclaration,
  isSourceFile,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  isVariableStatement,
} = ts;

/**
 * Outcome of resolving a chain:
 * - `resolved`: `target` is a reference target;
 * - `untyped`: the root is a local variable or parameter of unknown type (`target` is its binding);
 * - `dropped`: the chain denotes something that is never referenced (a built-in, a function-local
 *   declaration, a value of a known non-declaration type);
 * - `broken`: the root is not resolvable syntax (e.g. a call result); the caller visits `root` itself.
 */
export type ChainStatus = "resolved" | "untyped" | "dropped" | "broken";

/** The result of resolving a chain. */
export interface ChainResolution {
  readonly status: ChainStatus;
  readonly root: ts.Node;
  readonly members: readonly string[];
  readonly target: ReferenceTarget | undefined;
  /** The root is a type-only import binding. */
  readonly typeOnly: boolean;
  /** The chain is rooted at a `require()` call with a literal specifier. */
  readonly requireCall: ts.CallExpression | undefined;
}

/** An import binding found by name lookup. */
export interface ImportBindingInfo {
  readonly local: string;
  readonly typeOnly: boolean;
}

type LocalReceiver =
  | { type: "local"; name: string; declaredAt: { line: number; column: number }; members: string[] }
  | { type: "parameter"; owner?: string; index: number; name: string; members: string[] };

type LocalInfo =
  | {
      readonly kind: "instance";
      readonly via: "declared-type" | "constructor-type" | "call-result";
      readonly of: ReferenceTarget;
      readonly typeArguments: readonly TypeRef[];
      readonly receiver: LocalReceiver;
    }
  | { readonly kind: "untyped"; readonly receiver: LocalReceiver }
  | { readonly kind: "opaque" };

const OPAQUE: LocalInfo = { kind: "opaque" };

/**
 * Maximum nesting of `instance` targets in the type of a local (`const rows = await repo.find()` where `repo`
 * is itself typed by a call result, ...). Deeper types make the local untyped: every reference through a local
 * embeds its type, so unbounded nesting would make extractions grow quadratically along chains of locals.
 */
const MAX_LOCAL_TYPE_DEPTH = 4;

/** Maximum number of locals whose types are being determined at once (dependencies through initializers). */
const MAX_LOCAL_RESOLUTION_DEPTH = 64;

/** Maximum depth of `import x = N.y` aliases and of CommonJS export aliases followed while resolving. */
const MAX_ALIAS_DEPTH = 8;

/** The number of `instance` targets nested in a target (0 for a binding). */
function instanceDepth(target: ReferenceTarget): number {
  let depth = 0;
  for (let current = target; current.type === "instance"; current = current.of) depth += 1;
  return depth;
}

const PRECEDENCE = new Map<string, number>(
  SYMBOL_KIND_PRECEDENCE.map((kind, index) => [kind, index]),
);

const TYPE_KINDS = new Set<SymbolKind>(["class", "interface", "type-alias", "enum"]);
const NAMESPACE_KINDS = new Set<SymbolKind>(["namespace", "module", "enum", "class"]);
const VALUELESS_KINDS = new Set<SymbolKind>(["interface", "type-alias"]);
const MEMBER_KINDS = new Set<SymbolKind>(["method", "property", "accessor"]);

function precedenceOf(symbol: SymbolInfo): number {
  return PRECEDENCE.get(symbol.kind) ?? PRECEDENCE.size;
}

function kindProvides(kind: SymbolKind, last: boolean, meaning: Meaning): boolean {
  if (meaning === "value") return !VALUELESS_KINDS.has(kind);
  if (meaning === "type" && last) return TYPE_KINDS.has(kind);
  return NAMESPACE_KINDS.has(kind);
}

/** Initializers whose value has a known type that is not a declaration (literals, functions, ...). */
const OPAQUE_INITIALIZERS = new Set<ts.SyntaxKind>([
  K.StringLiteral,
  K.NoSubstitutionTemplateLiteral,
  K.TemplateExpression,
  K.NumericLiteral,
  K.BigIntLiteral,
  K.RegularExpressionLiteral,
  K.TrueKeyword,
  K.FalseKeyword,
  K.NullKeyword,
  K.ArrayLiteralExpression,
  K.ObjectLiteralExpression,
  K.ArrowFunction,
  K.FunctionExpression,
  K.ClassExpression,
  K.PrefixUnaryExpression,
  K.PostfixUnaryExpression,
  K.TypeOfExpression,
  K.VoidExpression,
  K.DeleteExpression,
  K.JsxElement,
  K.JsxSelfClosingElement,
  K.JsxFragment,
]);

/** Binary operators whose result is one of their operands (the result type is not known). */
const OPERAND_OPERATORS = new Set<ts.SyntaxKind>([
  K.BarBarToken,
  K.QuestionQuestionToken,
  K.AmpersandAmpersandToken,
  K.CommaToken,
  K.EqualsToken,
]);

function isOpaqueInitializer(node: ts.Expression): boolean {
  if (OPAQUE_INITIALIZERS.has(node.kind)) return true;
  return isBinaryExpression(node) && !OPERAND_OPERATORS.has(node.operatorToken.kind);
}

/** Type annotations that say nothing about the value (`any`, `unknown`, JSDoc `*` and `?`). */
function isUntypedAnnotation(node: ts.TypeNode): boolean {
  return (
    node.kind === K.AnyKeyword ||
    node.kind === K.UnknownKeyword ||
    node.kind === K.JSDocAllType ||
    node.kind === K.JSDocUnknownType
  );
}

function isNullishType(node: ts.TypeNode): boolean {
  return (
    node.kind === K.UndefinedKeyword ||
    node.kind === K.VoidKeyword ||
    (isLiteralTypeNode(node) && node.literal.kind === K.NullKeyword)
  );
}

/** Look through parentheses, JSDoc nullability markers and unions with `null`/`undefined`. */
function unwrapTypeNode(node: ts.TypeNode): ts.TypeNode {
  let current = node;
  for (;;) {
    if (isParenthesizedTypeNode(current)) {
      current = current.type;
    } else if (
      isJSDocNullableType(current) ||
      isJSDocNonNullableType(current) ||
      isJSDocOptionalType(current)
    ) {
      current = current.type;
    } else if (isUnionTypeNode(current)) {
      const meaningful = current.types.filter((type) => !isNullishType(type));
      const single = meaningful.length === 1 ? meaningful[0] : undefined;
      if (single === undefined) return current;
      current = single;
    } else {
      return current;
    }
  }
}

/** The literal specifier of `import("m")` in a type position. */
export function importTypeSpecifier(node: ts.ImportTypeNode): string | undefined {
  const argument = node.argument;
  return isLiteralTypeNode(argument) && isStringLiteral(argument.literal)
    ? argument.literal.text
    : undefined;
}

/** Member names of an `import("m").A.B` qualifier. */
export function importTypeMembers(node: ts.ImportTypeNode): string[] {
  if (node.qualifier === undefined) return [];
  const { root, members } = decomposeEntityName(node.qualifier);
  return [root.text, ...members];
}

function isStaticMember(node: ts.Node): boolean {
  return (
    canHaveModifiers(node) &&
    (getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Static) !== 0
  );
}

/** What `this` denotes inside a class: an instance of the class, or the class itself (static members). */
export interface ThisContext {
  readonly cls: ts.ClassLikeDeclaration;
  readonly isStatic: boolean;
}

/** {@link walkUp}: the answer is not decided at this ancestor; continue with its parent. */
const CONTINUE: unique symbol = Symbol("continue");

/** {@link walkUp} takes this many steps before it consults and fills its memo (short walks are cheaper). */
const STEPS_BEFORE_MEMO = 16;

/**
 * Walk up from `node` until `step(child, ancestor)` decides an answer (`otherwise` at the root). The answer
 * only depends on the path, so `memo` (when given) records it for the nodes passed after the first steps:
 * later walks through them stop there, which keeps walks from many nodes of one deep expression linear overall.
 */
function walkUp<T>(
  node: ts.Node,
  step: (child: ts.Node, ancestor: ts.Node) => T | typeof CONTINUE,
  otherwise: T,
  memo: Map<ts.Node, T> | undefined,
): T {
  const passed: ts.Node[] = [];
  let steps = 0;
  let child = node;
  let ancestor = parentOf(node);
  let answer = otherwise;
  while (ancestor !== undefined) {
    if (memo !== undefined && steps >= STEPS_BEFORE_MEMO) {
      if (memo.has(child)) {
        answer = memo.get(child) as T;
        break;
      }
      passed.push(child);
    }
    steps += 1;
    const outcome = step(child, ancestor);
    if (outcome !== CONTINUE) {
      answer = outcome;
      break;
    }
    child = ancestor;
    ancestor = parentOf(ancestor);
  }
  if (memo !== undefined) for (const visited of passed) memo.set(visited, answer);
  return answer;
}

function thisContextStep(
  child: ts.Node,
  ancestor: ts.Node,
): ThisContext | undefined | typeof CONTINUE {
  if (isFunctionDeclaration(ancestor) || isFunctionExpression(ancestor)) return undefined;
  if (isClassStaticBlockDeclaration(ancestor)) {
    return isClassLike(ancestor.parent) ? { cls: ancestor.parent, isStatic: true } : undefined;
  }
  if (
    isMethodDeclaration(ancestor) ||
    isConstructorDeclaration(ancestor) ||
    isGetAccessorDeclaration(ancestor) ||
    isSetAccessorDeclaration(ancestor)
  ) {
    // `this` in a computed member name or a decorator refers to the enclosing `this`.
    if (child !== ancestor.name && !isDecorator(child)) {
      return isClassLike(ancestor.parent)
        ? { cls: ancestor.parent, isStatic: isStaticMember(ancestor) }
        : undefined;
    }
  } else if (isPropertyDeclaration(ancestor)) {
    // The initializer, and `typeof this` queries in the type, refer to the instance (or class).
    if (child === ancestor.initializer || child === ancestor.type) {
      return isClassLike(ancestor.parent)
        ? { cls: ancestor.parent, isStatic: isStaticMember(ancestor) }
        : undefined;
    }
  } else if (isSourceFile(ancestor) || isModuleBlock(ancestor)) {
    return undefined;
  }
  return CONTINUE;
}

/**
 * The class whose instance (or constructor, for static members) `this` denotes at a node. `memo` caches
 * answers along the way (see {@link walkUp}).
 */
export function thisContextOf(
  node: ts.Node,
  memo?: Map<ts.Node, ThisContext | undefined>,
): ThisContext | undefined {
  return walkUp(node, thisContextStep, undefined, memo);
}

function objectThisStep(
  child: ts.Node,
  ancestor: ts.Node,
): ts.ObjectLiteralExpression | undefined | typeof CONTINUE {
  if (
    isMethodDeclaration(ancestor) ||
    isGetAccessorDeclaration(ancestor) ||
    isSetAccessorDeclaration(ancestor)
  ) {
    // `this` in a computed member name or a decorator refers to the enclosing `this`.
    if (child !== ancestor.name && !isDecorator(child)) {
      return isObjectLiteralExpression(ancestor.parent) ? ancestor.parent : undefined;
    }
  } else if (isFunctionExpression(ancestor)) {
    const property = ancestor.parent;
    return isPropertyAssignment(property) &&
      property.initializer === ancestor &&
      isObjectLiteralExpression(property.parent)
      ? property.parent
      : undefined;
  } else if (
    isFunctionDeclaration(ancestor) ||
    isClassLike(ancestor) ||
    isClassStaticBlockDeclaration(ancestor) ||
    isSourceFile(ancestor) ||
    isModuleBlock(ancestor)
  ) {
    return undefined;
  }
  return CONTINUE;
}

/**
 * The object literal `this` denotes at a node when it occurs in one of its methods (`{ m() { this.x } }`,
 * `{ m: function () { this.x } }`, arrow functions included), i.e. the object the method is called on.
 * `memo` caches answers along the way (see {@link walkUp}).
 */
export function objectThisContextOf(
  node: ts.Node,
  memo?: Map<ts.Node, ts.ObjectLiteralExpression | undefined>,
): ts.ObjectLiteralExpression | undefined {
  return walkUp(node, objectThisStep, undefined, memo);
}

/** Whether a resolved target is a binding (as opposed to an `instance` target). */
export function isBindingRef(target: ReferenceTarget | undefined): target is BindingRef {
  return target !== undefined && target.type !== "instance";
}

function bindingKey(target: BindingRef): string {
  switch (target.type) {
    case "import":
      return `import\u0000${target.local}\u0000${target.members.join(".")}`;
    case "symbol":
      return `symbol\u0000${target.localName}\u0000${target.members.join(".")}`;
    case "module":
      return `module\u0000${target.specifier}\u0000${target.members.join(".")}`;
    case "name":
      return `name\u0000${target.name}\u0000${target.members.join(".")}`;
    case "local":
      return `local\u0000${target.name}\u0000${target.declaredAt.line}:${target.declaredAt.column}`;
    case "parameter":
      return `parameter\u0000${target.owner ?? ""}\u0000${target.index}`;
  }
}

/** Remove duplicate bindings, keeping the first occurrence. */
export function uniqueBindings(targets: readonly BindingRef[]): BindingRef[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = bindingKey(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Options of a {@link Resolver}. */
export interface ResolverOptions {
  /** Whether the file was bound (scope information is available). */
  readonly bound: boolean;
  /** Whether the file is JavaScript (JSDoc types count as declared types). */
  readonly javascript: boolean;
  /** Name lookup of the file. */
  readonly scopes: ScopeLookup;
}

/** Resolves names and chains of one file. */
export class Resolver {
  readonly #file: ts.SourceFile;
  readonly #declarations: FileDeclarations;
  readonly #options: ResolverOptions;
  readonly #isRequire: IdentifierTest;
  readonly #locals = new Map<ts.Node, LocalInfo>();
  readonly #inProgress = new Set<ts.Node>();
  readonly #variableImports = new Map<ts.VariableDeclaration, VariableImport | undefined>();
  readonly #symbolsByLocalName: ReadonlyMap<string, SymbolInfo>;
  /** What `this` denotes below a node (see `thisContextOf` and `objectThisContextOf`). */
  readonly #thisContexts = new Map<ts.Node, ThisContext | undefined>();
  readonly #objectContexts = new Map<ts.Node, ts.ObjectLiteralExpression | undefined>();
  #topLevel: ReadonlyMap<string, readonly ts.Declaration[]> | undefined;
  #aliasDepth = 0;

  constructor(file: ts.SourceFile, declarations: FileDeclarations, options: ResolverOptions) {
    this.#file = file;
    this.#declarations = declarations;
    this.#options = options;
    this.#isRequire = requireTestOf(options.scopes);
    this.#symbolsByLocalName = new Map(
      declarations.symbols.map((symbol) => [symbol.localName, symbol]),
    );
  }

  /** Whether an identifier is unbound (the global of that name); always true without scopes. */
  isGlobal(identifier: ts.Identifier): boolean {
    return this.#options.scopes.lookup(identifier.escapedText, identifier, "value").length === 0;
  }

  /**
   * Whether a `require` identifier loads modules: the CommonJS global, or a local module loader such as
   * `const require = createRequire(import.meta.url)` (see `requireTestOf`). Always true without scopes.
   */
  isRequire(identifier: ts.Identifier): boolean {
    return this.#isRequire(identifier);
  }

  /** The declarations an identifier denotes at its location with a meaning (see {@link ScopeLookup}). */
  lookup(identifier: ts.Identifier, meaning: Meaning): readonly ts.Declaration[] {
    return this.#options.scopes.lookup(identifier.escapedText, identifier, meaning);
  }

  /** The import-like analysis of a variable declaration (cached). */
  variableImport(declaration: ts.VariableDeclaration): VariableImport | undefined {
    if (this.#variableImports.has(declaration)) return this.#variableImports.get(declaration);
    const result = variableImportOf(this.#file, declaration, this.#isRequire);
    this.#variableImports.set(declaration, result);
    return result;
  }

  /** The import binding a declaration found by name lookup introduces, if it is one. */
  importBindingOf(declaration: ts.Node): ImportBindingInfo | undefined {
    if (isImportClause(declaration)) {
      if (declaration.name === undefined) return undefined;
      return { local: declaration.name.text, typeOnly: isTypeOnlyClause(declaration) };
    }
    if (isImportSpecifier(declaration)) {
      const clause = declaration.parent.parent;
      return {
        local: declaration.name.text,
        typeOnly: declaration.isTypeOnly || isTypeOnlyClause(clause),
      };
    }
    if (isNamespaceImport(declaration)) {
      return { local: declaration.name.text, typeOnly: isTypeOnlyClause(declaration.parent) };
    }
    if (
      isImportEqualsDeclaration(declaration) &&
      isExternalModuleReference(declaration.moduleReference)
    ) {
      return { local: declaration.name.text, typeOnly: declaration.isTypeOnly };
    }
    if (isVariableDeclaration(declaration) && isIdentifier(declaration.name)) {
      const variableImport = this.variableImport(declaration);
      if (variableImport === undefined) return undefined;
      const binding = variableImportBindingFor(variableImport, declaration.name);
      return binding === undefined ? undefined : { local: binding.local, typeOnly: false };
    }
    if (isBindingElement(declaration) && isIdentifier(declaration.name)) {
      const root = bindingRoot(declaration);
      if (!isVariableDeclaration(root)) return undefined;
      const variableImport = this.variableImport(root);
      if (variableImport === undefined) return undefined;
      const binding = variableImportBindingFor(variableImport, declaration.name);
      return binding === undefined ? undefined : { local: binding.local, typeOnly: false };
    }
    return undefined;
  }

  /** Resolve an expression chain (`a.b.c`, `this.x`, `require("m").y`). */
  resolveExpression(expression: ts.Expression, meaning: Meaning = "value"): ChainResolution {
    const { root, members } = decomposeChain(expression);
    return this.#resolveChain(root, members, meaning);
  }

  /** Resolve an entity name in a type position (`A`, `ns.A`) or a `typeof` query. */
  resolveEntityName(name: ts.EntityName, meaning: Meaning): ChainResolution {
    const { root, members } = decomposeEntityName(name);
    // `typeof this.x` is parsed with an identifier named `this`.
    if (root.text === "this") return this.#resolveThis(root, members);
    return this.#resolveIdentifier(root, members, meaning);
  }

  /** The binding a resolution denotes (`resolved` bindings, and `untyped` locals when allowed). */
  bindingOf(resolution: ChainResolution, allowLocals = false): BindingRef | undefined {
    if (resolution.status === "resolved" || (allowLocals && resolution.status === "untyped")) {
      return isBindingRef(resolution.target) ? resolution.target : undefined;
    }
    return undefined;
  }

  /**
   * Every binding a name at the top level of the file denotes, in any meaning (several when a value and a
   * type share the name, e.g. `const User` and `type User`): used for export targets. Without scopes (the
   * binder failed), the file's top-level declarations are searched by name, which is exact at the top level.
   */
  bindingsOfName(identifier: ts.Identifier): BindingRef[] {
    const declarations = new Set<ts.Declaration>();
    if (this.#options.bound) {
      for (const meaning of ["value", "type", "namespace"] as const) {
        for (const declaration of this.lookup(identifier, meaning)) {
          declarations.add(declaration);
        }
      }
    } else {
      for (const declaration of this.#topLevelDeclarations().get(identifier.text) ?? []) {
        declarations.add(declaration);
      }
    }
    if (declarations.size === 0) {
      const unbound = this.#unbound(identifier, []);
      const binding = this.bindingOf(unbound);
      return binding === undefined ? [] : [binding];
    }
    const result: BindingRef[] = [];
    const symbols: SymbolInfo[] = [];
    for (const declaration of declarations) {
      const binding = this.importBindingOf(declaration);
      if (binding !== undefined) {
        result.push({ type: "import", local: binding.local, members: [] });
        continue;
      }
      if (
        isImportEqualsDeclaration(declaration) &&
        !isExternalModuleReference(declaration.moduleReference)
      ) {
        const alias = this.bindingOf(this.#resolveAlias(declaration, [], "value"));
        if (alias !== undefined) result.push(alias);
        continue;
      }
      const symbol = this.#declarations.symbolOfDeclaration(declaration);
      if (symbol !== undefined && !symbols.includes(symbol)) symbols.push(symbol);
    }
    symbols.sort((a, b) => precedenceOf(a) - precedenceOf(b));
    for (const symbol of symbols)
      result.push({ type: "symbol", localName: symbol.localName, members: [] });
    return uniqueBindings(result);
  }

  /** The file's top-level declarations by name, as the binder records them (for files without scopes). */
  #topLevelDeclarations(): ReadonlyMap<string, readonly ts.Declaration[]> {
    if (this.#topLevel !== undefined) return this.#topLevel;
    const table = new Map<string, ts.Declaration[]>();
    const add = (name: ts.ModuleName | undefined, declaration: ts.Declaration): void => {
      if (name === undefined || !isIdentifier(name) || name.text === "") return;
      const list = table.get(name.text);
      if (list === undefined) table.set(name.text, [declaration]);
      else list.push(declaration);
    };
    for (const statement of this.#file.statements) {
      if (isImportDeclaration(statement)) {
        const clause = statement.importClause;
        if (clause === undefined) continue;
        add(clause.name, clause);
        const named = clause.namedBindings;
        if (named === undefined) continue;
        if (isNamespaceImport(named)) add(named.name, named);
        else for (const element of named.elements) add(element.name, element);
      } else if (isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (isIdentifier(declaration.name)) add(declaration.name, declaration);
          else for (const { element, name } of boundNames(declaration.name)) add(name, element);
        }
      } else if (isModuleDeclaration(statement)) {
        if ((statement.flags & ts.NodeFlags.GlobalAugmentation) === 0)
          add(statement.name, statement);
      } else if (
        isFunctionDeclaration(statement) ||
        isClassDeclaration(statement) ||
        isInterfaceDeclaration(statement) ||
        isTypeAliasDeclaration(statement) ||
        isEnumDeclaration(statement) ||
        isImportEqualsDeclaration(statement)
      ) {
        add(statement.name, statement);
      }
    }
    this.#topLevel = table;
    return table;
  }

  /** The type reference an annotation denotes, when its root names a binding. */
  typeRefOf(node: ts.TypeNode): TypeRef | undefined {
    const type = unwrapTypeNode(node);
    let ref: BindingRef | undefined;
    let typeArguments: ts.NodeArray<ts.TypeNode> | undefined;
    if (isTypeReferenceNode(type)) {
      ref = this.bindingOf(this.resolveEntityName(type.typeName, "type"));
      typeArguments = type.typeArguments;
    } else if (isExpressionWithTypeArguments(type)) {
      ref = this.bindingOf(this.resolveExpression(type.expression, "type"));
      typeArguments = type.typeArguments;
    } else if (isImportTypeNode(type) && !type.isTypeOf) {
      const specifier = importTypeSpecifier(type);
      if (specifier !== undefined) {
        ref = { type: "module", specifier, members: importTypeMembers(type) };
      }
      typeArguments = type.typeArguments;
    }
    if (ref === undefined) return undefined;
    const typeRefs = this.typeRefsOf(typeArguments);
    return typeRefs.length > 0 ? { ref, arguments: typeRefs } : { ref };
  }

  /** Type references of type arguments that name bindings. */
  typeRefsOf(nodes: readonly ts.TypeNode[] | undefined): TypeRef[] {
    const result: TypeRef[] = [];
    for (const node of nodes ?? []) {
      const typeRef = this.typeRefOf(node);
      if (typeRef !== undefined) result.push(typeRef);
    }
    return result;
  }

  #resolveChain(
    root: ts.Expression,
    members: readonly string[],
    meaning: Meaning,
  ): ChainResolution {
    if (isIdentifier(root)) return this.#resolveIdentifier(root, members, meaning);
    if (root.kind === K.ThisKeyword) return this.#resolveThis(root, members);
    if (root.kind === K.SuperKeyword) return this.#resolveSuper(root, members);
    if (isRequireCallSyntax(root)) {
      const identifier = requireIdentifierOf(root);
      if (identifier !== undefined && this.isRequire(identifier)) {
        const specifier = specifierArgument(this.#file, root.arguments[0]);
        if (specifier?.literal === true) {
          return {
            ...resolved(root, members, {
              type: "module",
              specifier: specifier.specifier,
              members: [...members],
            }),
            requireCall: root,
          };
        }
      }
      return broken(root, members);
    }
    if (isMetaProperty(root)) return dropped(root, members);
    // `new C().m()` and `f().m()`: members of a constructed value or of a call result, when the callee is a
    // binding. A callee that is itself an instance (`f().g().m()`) is not resolved: targets never nest along a
    // chain, which keeps them (and the extraction) linear in the chain's length. The walker records the
    // inner links on their own.
    if (
      members.length > 0 &&
      (isNewExpression(root) || (isCallExpression(root) && !isDynamicImportCall(root)))
    ) {
      const callee = this.#calleeBinding(root.expression);
      if (callee === undefined) return broken(root, members);
      if (isCallExpression(root)) {
        return resolved(root, members, {
          type: "instance",
          via: "call-result",
          of: callee,
          members: [...members],
        });
      }
      const typeArguments = this.typeRefsOf(root.typeArguments);
      return resolved(root, members, {
        type: "instance",
        via: "constructor-type",
        of: callee,
        ...(typeArguments.length > 0 ? { typeArguments } : {}),
        members: [...members],
      });
    }
    return broken(root, members);
  }

  /** The binding a callee denotes, if it is one (a chain rooted at a call or construction never is). */
  #calleeBinding(callee: ts.Expression): BindingRef | undefined {
    const { root, members } = decomposeChain(callee);
    if ((isCallExpression(root) && !isRequireCallSyntax(root)) || isNewExpression(root)) {
      return undefined;
    }
    return this.bindingOf(this.#resolveChain(root, members, "value"));
  }

  #resolveIdentifier(
    identifier: ts.Identifier,
    members: readonly string[],
    meaning: Meaning,
  ): ChainResolution {
    if (!this.#options.bound) return dropped(identifier, members);
    const lookupMeaning = meaning === "type" && members.length > 0 ? "namespace" : meaning;
    const declarations = this.lookup(identifier, lookupMeaning);
    if (declarations.length === 0) return this.#unbound(identifier, members);

    for (const declaration of declarations) {
      const binding = this.importBindingOf(declaration);
      if (binding !== undefined) {
        return {
          ...resolved(identifier, members, {
            type: "import",
            local: binding.local,
            members: [...members],
          }),
          typeOnly: binding.typeOnly,
        };
      }
    }
    for (const declaration of declarations) {
      if (
        isImportEqualsDeclaration(declaration) &&
        !isExternalModuleReference(declaration.moduleReference)
      ) {
        const alias = this.#resolveAlias(declaration, members, meaning);
        return { ...alias, root: identifier };
      }
    }
    const symbols: SymbolInfo[] = [];
    for (const declaration of declarations) {
      const symbol = this.#declarations.symbolOfDeclaration(declaration);
      if (symbol !== undefined && !symbols.includes(symbol)) symbols.push(symbol);
    }
    if (symbols.length > 0) {
      symbols.sort((a, b) => precedenceOf(a) - precedenceOf(b));
      return this.#symbolChain(identifier, symbols, members, meaning);
    }
    const variable = declarations.find(
      (declaration) =>
        isVariableDeclaration(declaration) ||
        isParameter(declaration) ||
        isBindingElement(declaration),
    );
    if (variable !== undefined) return this.#localChain(identifier, variable, members);
    return dropped(identifier, members);
  }

  /** `import x = N.y`: resolve `N.y` where the alias is declared, then append the members. */
  #resolveAlias(
    declaration: ts.ImportEqualsDeclaration,
    members: readonly string[],
    meaning: Meaning,
  ): ChainResolution {
    const reference = declaration.moduleReference;
    if (isExternalModuleReference(reference) || this.#aliasDepth >= MAX_ALIAS_DEPTH) {
      return dropped(declaration, members);
    }
    this.#aliasDepth += 1;
    try {
      const { root, members: aliasMembers } = decomposeEntityName(reference);
      return this.#resolveIdentifier(root, [...aliasMembers, ...members], meaning);
    } finally {
      this.#aliasDepth -= 1;
    }
  }

  #unbound(identifier: ts.Identifier, members: readonly string[]): ChainResolution {
    const name = identifier.text;
    const commonJsName =
      name === "exports"
        ? members[0]
        : name === "module" && members[0] === "exports"
          ? members[1]
          : undefined;
    if (commonJsName !== undefined) {
      const rest = members.slice(name === "exports" ? 1 : 2);
      const target = this.#commonJsMember(commonJsName, rest);
      if (target !== undefined) return resolved(identifier, members, target);
    }
    if (name === "" || isBuiltinGlobal(name)) return dropped(identifier, members);
    return resolved(identifier, members, { type: "name", name, members: [...members] });
  }

  /**
   * The target of the CommonJS export `name` followed by `rest` (`exports.name.rest`, `this.name.rest` in a
   * method of `module.exports = { ... }`): the symbol the export created, else the binding it was assigned
   * (`exports.name = name`, `module.exports = { name }`), resolved where it was assigned.
   */
  #commonJsMember(name: string, rest: readonly string[]): ReferenceTarget | undefined {
    const symbol = this.#declarations.commonJsExport(name);
    if (symbol !== undefined) {
      return { type: "symbol", localName: symbol.localName, members: [...rest] };
    }
    const alias = this.#declarations.commonJsAlias(name);
    if (alias === undefined || this.#aliasDepth >= MAX_ALIAS_DEPTH) return undefined;
    this.#aliasDepth += 1;
    try {
      const { root, members } = decomposeChain(alias);
      return this.bindingOf(this.#resolveChain(root, [...members, ...rest], "value"));
    } finally {
      this.#aliasDepth -= 1;
    }
  }

  #child(
    symbol: SymbolInfo,
    name: string,
    last: boolean,
    meaning: Meaning,
  ): SymbolInfo | undefined {
    if (symbol.kind === "namespace" || symbol.kind === "module") {
      const named = symbol.children.filter((child) => child.name === name);
      if (named.length <= 1) return named[0];
      return named.find((child) => kindProvides(child.kind, last, meaning)) ?? named[0];
    }
    if (symbol.kind === "class" && meaning === "value") {
      return symbol.children.find(
        (child) => child.name === name && child.isStatic && MEMBER_KINDS.has(child.kind),
      );
    }
    return undefined;
  }

  #symbolChain(
    root: ts.Node,
    candidates: readonly SymbolInfo[],
    members: readonly string[],
    meaning: Meaning,
  ): ChainResolution {
    let current = candidates[0];
    if (current === undefined) return dropped(root, members);
    const first = members[0];
    if (candidates.length > 1 && first !== undefined) {
      const withMember = candidates.find(
        (candidate) => this.#child(candidate, first, members.length === 1, meaning) !== undefined,
      );
      if (withMember !== undefined) current = withMember;
    }
    let index = 0;
    while (index < members.length) {
      const name = members[index];
      if (name === undefined) break;
      const child = this.#child(current, name, index === members.length - 1, meaning);
      if (child === undefined) break;
      current = child;
      index += 1;
    }
    return resolved(root, members, {
      type: "symbol",
      localName: current.localName,
      members: members.slice(index),
    });
  }

  #resolveThis(node: ts.Node, members: readonly string[]): ChainResolution {
    const first = members[0];
    if (first === undefined) return dropped(node, members);
    const context = thisContextOf(node, this.#thisContexts);
    if (context === undefined) {
      // A method of `module.exports = { ... }`: `this.x` is the export `x` (when called on the exports).
      const object = objectThisContextOf(node, this.#objectContexts);
      const target =
        object !== undefined && this.#declarations.isExportsObject(object)
          ? this.#commonJsMember(first, members.slice(1))
          : undefined;
      return target === undefined ? dropped(node, members) : resolved(node, members, target);
    }
    const classSymbol = this.#declarations.symbolOfClass(context.cls);
    if (classSymbol === undefined) return dropped(node, members);
    const member = classSymbol.children.find(
      (child) =>
        child.name === first && child.isStatic === context.isStatic && MEMBER_KINDS.has(child.kind),
    );
    if (member !== undefined) {
      return resolved(node, members, {
        type: "symbol",
        localName: member.localName,
        members: members.slice(1),
      });
    }
    if (context.isStatic) {
      return resolved(node, members, {
        type: "symbol",
        localName: classSymbol.localName,
        members: [...members],
      });
    }
    return resolved(node, members, {
      type: "instance",
      via: "declared-type",
      of: { type: "symbol", localName: classSymbol.localName, members: [] },
      members: [...members],
    });
  }

  #resolveSuper(node: ts.Node, members: readonly string[]): ChainResolution {
    const first = members[0];
    if (first === undefined) return dropped(node, members);
    const context = thisContextOf(node, this.#thisContexts);
    const heritage = context?.cls.heritageClauses?.find(
      (clause) => clause.token === K.ExtendsKeyword,
    );
    const base = heritage?.types[0]?.expression;
    if (context === undefined || base === undefined) return dropped(node, members);
    const target = this.bindingOf(this.resolveExpression(base, "value"));
    if (target === undefined) return dropped(node, members);
    if (target.type === "symbol" && target.members.length === 0) {
      const baseSymbol = this.#symbolsByLocalName.get(target.localName);
      const member = baseSymbol?.children.find(
        (child) =>
          child.name === first &&
          child.isStatic === context.isStatic &&
          MEMBER_KINDS.has(child.kind),
      );
      if (member !== undefined) {
        return resolved(node, members, {
          type: "symbol",
          localName: member.localName,
          members: members.slice(1),
        });
      }
    }
    return resolved(node, members, { ...target, members: [...target.members, ...members] });
  }

  #localChain(
    root: ts.Node,
    declaration: ts.Declaration,
    members: readonly string[],
  ): ChainResolution {
    const info = this.#localInfo(declaration);
    switch (info.kind) {
      case "instance":
        return resolved(root, members, {
          type: "instance",
          via: info.via,
          of: info.of,
          ...(info.typeArguments.length > 0 ? { typeArguments: [...info.typeArguments] } : {}),
          receiver: info.receiver,
          members: [...members],
        });
      case "untyped":
        return {
          status: "untyped",
          root,
          members,
          target: { ...info.receiver, members: [...members] },
          typeOnly: false,
          requireCall: undefined,
        };
      case "opaque":
        return dropped(root, members);
    }
  }

  #receiverOf(declaration: ts.Declaration): LocalReceiver | undefined {
    if (isParameter(declaration)) {
      if (!isIdentifier(declaration.name) || isThisParameter(declaration)) return undefined;
      const owner = this.#declarations.symbolOfFunction(declaration.parent)?.localName;
      return {
        type: "parameter",
        ...(owner === undefined ? {} : { owner }),
        index: parameterIndex(declaration),
        name: declaration.name.text,
        members: [],
      };
    }
    if (
      (isVariableDeclaration(declaration) || isBindingElement(declaration)) &&
      isIdentifier(declaration.name)
    ) {
      return {
        type: "local",
        name: declaration.name.text,
        declaredAt: startOf(this.#file, declaration.name),
        members: [],
      };
    }
    return undefined;
  }

  #localInfo(declaration: ts.Declaration): LocalInfo {
    const cached = this.#locals.get(declaration);
    if (cached !== undefined) return cached;
    const receiver = this.#receiverOf(declaration);
    if (receiver === undefined) return OPAQUE;
    // A cycle (`const a = b.f(), b = a.g()`) leaves the local untyped; so does a dependency chain too long
    // to follow without exhausting the call stack (it would exceed the type depth anyway).
    if (this.#inProgress.has(declaration)) return { kind: "untyped", receiver };
    if (this.#inProgress.size >= MAX_LOCAL_RESOLUTION_DEPTH) {
      const untyped: LocalInfo = { kind: "untyped", receiver };
      this.#locals.set(declaration, untyped);
      return untyped;
    }
    this.#inProgress.add(declaration);
    let info: LocalInfo;
    try {
      info = this.#classifyLocal(declaration, receiver);
    } finally {
      this.#inProgress.delete(declaration);
    }
    this.#locals.set(declaration, info);
    return info;
  }

  #classifyLocal(declaration: ts.Declaration, receiver: LocalReceiver): LocalInfo {
    if (!isParameter(declaration) && !isVariableDeclaration(declaration)) {
      return { kind: "untyped", receiver };
    }
    const typeNode =
      declaration.type ?? (this.#options.javascript ? getJSDocType(declaration) : undefined);
    if (typeNode !== undefined) {
      if (isUntypedAnnotation(typeNode)) return { kind: "untyped", receiver };
      const typeRef = this.typeRefOf(typeNode);
      if (typeRef === undefined) return OPAQUE;
      return {
        kind: "instance",
        via: "declared-type",
        of: typeRef.ref,
        typeArguments: typeRef.arguments ?? [],
        receiver,
      };
    }
    const initializer = declaration.initializer;
    if (initializer === undefined) return { kind: "untyped", receiver };
    const value = skipOuterAndAwait(initializer);
    if (isNewExpression(value)) {
      const callee = this.#typeSource(value.expression);
      if (callee === undefined) return OPAQUE;
      return {
        kind: "instance",
        via: "constructor-type",
        of: callee,
        typeArguments: this.typeRefsOf(value.typeArguments),
        receiver,
      };
    }
    if (isCallExpression(value) && !isRequireCallSyntax(value) && !isDynamicImportCall(value)) {
      const callee = this.#typeSource(value.expression);
      if (callee === undefined) return { kind: "untyped", receiver };
      return { kind: "instance", via: "call-result", of: callee, typeArguments: [], receiver };
    }
    if (isOpaqueInitializer(value)) return OPAQUE;
    return { kind: "untyped", receiver };
  }

  /**
   * The target a local's type is derived from (the class constructed or the function called), when it resolves
   * and the local's type stays within {@link MAX_LOCAL_TYPE_DEPTH}.
   */
  #typeSource(callee: ts.Expression): ReferenceTarget | undefined {
    const resolution = this.resolveExpression(callee);
    const target = resolution.status === "resolved" ? resolution.target : undefined;
    return target !== undefined && instanceDepth(target) < MAX_LOCAL_TYPE_DEPTH
      ? target
      : undefined;
  }
}

function isTypeOnlyClause(clause: ts.ImportClause): boolean {
  return clause.phaseModifier === K.TypeKeyword || clause.parent.kind === K.JSDocImportTag;
}

function resolved(
  root: ts.Node,
  members: readonly string[],
  target: ReferenceTarget,
): ChainResolution {
  return { status: "resolved", root, members, target, typeOnly: false, requireCall: undefined };
}

function dropped(root: ts.Node, members: readonly string[]): ChainResolution {
  return {
    status: "dropped",
    root,
    members,
    target: undefined,
    typeOnly: false,
    requireCall: undefined,
  };
}

function broken(root: ts.Node, members: readonly string[]): ChainResolution {
  return {
    status: "broken",
    root,
    members,
    target: undefined,
    typeOnly: false,
    requireCall: undefined,
  };
}
