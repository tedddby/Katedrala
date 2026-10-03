/**
 * Symbol collection: which declarations of a file are symbols, how they are named and how they nest.
 *
 * Symbols are the file's top-level declarations, the members of namespaces, ambient modules and
 * `declare global` blocks, and the members of classes (including class expressions assigned to symbols).
 * Declarations inside function bodies are not symbols. CommonJS exports (`exports.x = function () {}`,
 * `module.exports = { a: () => {} }`) and expression default exports (`export default {...}`) create
 * symbols for their values.
 *
 * Naming is two-phase with {@link SymbolNamer}: every declaration is declared first, then local names are
 * assigned, so that kind precedence (not source order) decides which declaration gets the bare name.
 * Declarations with the same identity (overloads, interface and namespace merging, get/set pairs) become one
 * symbol with several declaration sites. Declarations inside `declare global { }` (and their members) carry
 * the key `global`, so they never merge with module declarations of the same name and kind: the module's
 * declaration keeps the bare name, the global one is `<name>~<kind>-global`.
 *
 * Members of namespaces and modules record whether their body exports them (`DeclarationSite.exported`), as
 * TypeScript's binder decides: with an inner `export`, or implicitly in an ambient body without export
 * declarations. Other declarations leave it open (file-level exports are collected separately).
 */
import {
  qualifiedNameOf,
  type Range,
  type SymbolKind,
  type SymbolModifier,
  type Visibility,
} from "@katedrala/ir";
import { SymbolNamer } from "@katedrala/plugin-api";
import ts from "typescript";
import {
  assignedValueSignature,
  bindingSignature,
  functionSignature,
  moduleSignature,
  objectMemberSignature,
  propertySignature,
  typeAliasSignature,
  typeDeclarationSignature,
  variableSignature,
} from "./signatures.js";
import {
  boundNames,
  commonJsExportOf,
  decomposeChain,
  exportAssignmentChain,
  hasBody,
  isFunctionValue,
  isRequireCallSyntax,
  isVoidLiteral,
  parentOf,
  propertyNameText,
  skipOuterExpressions,
  variableKeyword,
} from "./syntax.js";
import { rangeOf } from "./text.js";
import { variableImportOf, type IdentifierTest } from "./variable-imports.js";
import { K } from "./kinds.js";

const {
  canHaveModifiers,
  getCombinedModifierFlags,
  getModifiers,
  isBindingElement,
  isCallSignatureDeclaration,
  isClassDeclaration,
  isClassExpression,
  isConstructSignatureDeclaration,
  isConstructorDeclaration,
  isEnumDeclaration,
  isExportAssignment,
  isExportDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionLike,
  isGetAccessorDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isMethodSignature,
  isModuleBlock,
  isModuleDeclaration,
  isNamespaceImport,
  isObjectLiteralExpression,
  isParameterPropertyDeclaration,
  isPrivateIdentifier,
  isPropertyAssignment,
  isPropertyDeclaration,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isTypeAliasDeclaration,
  isVariableDeclaration,
  isVariableStatement,
} = ts;

/** The syntactic form a symbol was declared with. */
export type DeclarationForm =
  | "function"
  | "class"
  | "interface"
  | "type-alias"
  | "enum"
  | "namespace"
  | "module"
  | "variable"
  | "binding"
  | "member"
  | "parameter-property"
  | "default-expression"
  | "commonjs-export"
  | "commonjs-member";

/** One declaration of a symbol (several for overloads and merged declarations). */
export interface DeclarationSite {
  readonly form: DeclarationForm;
  /** The declaration node: modifiers and decorators are read from it. */
  readonly node: ts.Node;
  readonly range: Range;
  readonly signature: string | undefined;
  readonly modifiers: readonly SymbolModifier[];
  readonly visibility: Visibility | undefined;
  /** An abstract class, or an interface declaring a method, call or construct signature. */
  readonly abstract: boolean;
  /** Whether this declaration is an implementation (a function-like declaration with a body). */
  readonly implementation: boolean;
  /** Function-like node of a callable (parameters, return type). */
  readonly functionNode: ts.SignatureDeclaration | undefined;
  /** Class-like node of a class. */
  readonly classNode: ts.ClassLikeDeclaration | undefined;
  /** Initializer or assigned value. */
  readonly value: ts.Expression | undefined;
  /** Declared type annotation (variables, properties, parameter properties, accessors). */
  readonly typeNode: ts.TypeNode | undefined;
  /**
   * Whether the declaration is exported from the namespace or module body it is declared in; undefined for
   * declarations outside such bodies (file level, `declare global`, class members).
   */
  readonly exported: boolean | undefined;
}

/** A symbol of the file. */
export interface SymbolInfo {
  readonly localName: string;
  readonly name: string;
  /** Escaped qualified name. */
  readonly qualifiedName: string;
  readonly kind: SymbolKind;
  readonly isStatic: boolean;
  readonly parent: SymbolInfo | undefined;
  /** Declared directly inside `declare global { }`. */
  readonly global: boolean;
  /** Declaration sites in source order. */
  readonly sites: readonly DeclarationSite[];
  /** Direct children in source order. */
  readonly children: readonly SymbolInfo[];
}

/** The symbols of a file and the lookups other passes need. */
export interface FileDeclarations {
  /** Symbols in source order, parents before their members. */
  readonly symbols: readonly SymbolInfo[];
  /** Names of top-level declarations and imports (`exports.x = ...` creates no symbol for these). */
  readonly topLevelNames: ReadonlySet<string>;
  /** The symbol whose subtree a node starts (for `from` attribution). */
  ownerOf(node: ts.Node): SymbolInfo | undefined;
  /** Whether nodes of a syntax kind may start a symbol's subtree (a fast pre-check for {@link ownerOf}). */
  mayOwn(kind: ts.SyntaxKind): boolean;
  /** The symbol a declaration node (found by name lookup) declares. */
  symbolOfDeclaration(node: ts.Node): SymbolInfo | undefined;
  /** The symbol whose parameters a function-like node declares. */
  symbolOfFunction(node: ts.Node): SymbolInfo | undefined;
  /** The symbol of a class-like node. */
  symbolOfClass(node: ts.Node): SymbolInfo | undefined;
  /** The symbol created for a CommonJS export name. */
  commonJsExport(name: string): SymbolInfo | undefined;
  /**
   * The binding expression a CommonJS export name was assigned (`exports.a = a`, `module.exports = { a }`,
   * `module.exports = { b: lib.b }`), for names without a symbol of their own; the first assignment wins.
   */
  commonJsAlias(name: string): ts.Expression | undefined;
  /** Whether an object literal is the value of `module.exports = { ... }` or `export = { ... }`. */
  isExportsObject(node: ts.Node): boolean;
}

/** Scope-analysis tests the collection needs (see `collectDeclarations`). */
export interface DeclarationTests {
  /** Whether an identifier is unbound in the file (`module` and `exports` denote the CommonJS globals). */
  readonly isGlobal: IdentifierTest;
  /** Whether a `require` identifier loads modules (`requireTestOf`). */
  readonly isRequire: IdentifierTest;
}

interface MutableSymbolInfo extends SymbolInfo {
  readonly sites: DeclarationSite[];
  readonly children: MutableSymbolInfo[];
}

interface Pending {
  readonly handle: number;
  readonly name: string;
  readonly segments: readonly string[];
  readonly kind: SymbolKind;
  readonly isStatic: boolean;
  readonly parent: Pending | undefined;
  readonly global: boolean;
  /** The naming key of the symbol and of its members (`global` inside `declare global`). */
  readonly key: string | undefined;
  readonly site: DeclarationSite;
  /** Nodes whose subtrees are attributed to the symbol. */
  readonly owners: readonly ts.Node[];
  /** Declaration nodes through which the symbol is found by name lookup. */
  readonly bindings: readonly ts.Node[];
}

/**
 * How a namespace or module body exports its members: `explicit`ly (members declared with `export`) or
 * `implicit`ly (every member).
 */
type BodyExports = "explicit" | "implicit";

interface Scope {
  readonly parent: Pending | undefined;
  readonly segments: readonly string[];
  readonly kind: "file" | "namespace" | "module" | "global";
  /** The naming key of declarations in the scope (`global` inside `declare global`, at any depth). */
  readonly key: string | undefined;
  /** For namespace and module bodies: how the body exports its members. */
  readonly exports?: BodyExports;
}

/** The naming key of declarations inside `declare global { }`. */
const GLOBAL_KEY = "global";

/**
 * The scope of the members of a symbol (namespace, module or class members). `exports` is given for the
 * bodies of namespaces and modules only.
 */
function memberScope(owner: Pending, kind: Scope["kind"], exports?: BodyExports): Scope {
  return {
    parent: owner,
    segments: owner.segments,
    kind,
    key: owner.key,
    ...(exports === undefined ? {} : { exports }),
  };
}

/**
 * Whether a namespace or module declaration is in an ambient context: in a declaration file, or declared with
 * `declare` itself or inside a namespace or module that is.
 */
function isAmbient(declaration: ts.ModuleDeclaration): boolean {
  if (declaration.getSourceFile().isDeclarationFile) return true;
  for (
    let current: ts.Node | undefined = declaration;
    current !== undefined;
    current = parentOf(current)
  ) {
    if (
      isModuleDeclaration(current) &&
      (getCombinedModifierFlags(current) & ts.ModifierFlags.Ambient) !== 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * How the body of a namespace or module declaration exports its members, as TypeScript's binder decides (its
 * "export context"): an ambient body (`declare namespace`, `declare module`, any declaration file) without
 * export declarations or assignments exports every member; any other body only the members declared with
 * `export`.
 */
function bodyExportsOf(declaration: ts.ModuleDeclaration): BodyExports {
  if (!isAmbient(declaration)) return "explicit";
  const body = declaration.body;
  const declaresExports =
    body !== undefined &&
    isModuleBlock(body) &&
    body.statements.some(
      (statement) => isExportDeclaration(statement) || isExportAssignment(statement),
    );
  return declaresExports ? "explicit" : "implicit";
}

/**
 * Whether a declaration carries `export`: its own modifier (a variable's or destructured name's is on its
 * statement), or implicitly as an inner namespace of a dotted name (`namespace A.B {}`).
 */
function hasExportModifier(node: ts.Node): boolean {
  return (getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

/** Forms that declare an export of their body by construction (`export default`, `export = { ... }`). */
const EXPORT_FORMS = new Set<DeclarationForm>(["default-expression", "commonjs-member"]);

interface SiteInput {
  readonly form: DeclarationForm;
  readonly node: ts.Node;
  readonly rangeNode: ts.Node;
  readonly signature: string | undefined;
  readonly modifiers?: readonly SymbolModifier[];
  readonly visibility?: Visibility;
  readonly abstract?: boolean;
  readonly functionNode?: ts.SignatureDeclaration;
  readonly classNode?: ts.ClassLikeDeclaration;
  readonly value?: ts.Expression;
  readonly typeNode?: ts.TypeNode;
}

interface DeclareInput {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly scope: Scope;
  readonly isStatic?: boolean;
  readonly site: SiteInput;
  readonly owners: readonly ts.Node[];
  readonly bindings?: readonly ts.Node[];
}

/** Modifiers readable from modifier flags (syntactic modifiers, and JSDoc modifiers in JavaScript). */
function flagModifiers(node: ts.Node): SymbolModifier[] {
  if (!canHaveModifiers(node) && !isVariableDeclaration(node) && !isBindingElement(node)) {
    return [];
  }
  const flags = getCombinedModifierFlags(node as ts.Declaration);
  const result: SymbolModifier[] = [];
  if ((flags & ts.ModifierFlags.Abstract) !== 0) result.push("abstract");
  if ((flags & ts.ModifierFlags.Static) !== 0) result.push("static");
  if ((flags & ts.ModifierFlags.Async) !== 0) result.push("async");
  if ((flags & ts.ModifierFlags.Readonly) !== 0) result.push("readonly");
  if ((flags & ts.ModifierFlags.Ambient) !== 0) result.push("declare");
  if ((flags & ts.ModifierFlags.Override) !== 0) result.push("override");
  if ((flags & ts.ModifierFlags.Const) !== 0) result.push("const");
  if ((flags & ts.ModifierFlags.Default) !== 0) result.push("default");
  return result;
}

/** Modifiers of a function value (`async`, generator). */
function functionValueModifiers(value: ts.Node | undefined): SymbolModifier[] {
  if (value === undefined || !isFunctionLike(value)) return [];
  const result: SymbolModifier[] = [];
  if (canHaveModifiers(value) && getModifiers(value)?.some((m) => m.kind === K.AsyncKeyword)) {
    result.push("async");
  }
  if (
    (isFunctionExpression(value) || isFunctionDeclaration(value) || isMethodDeclaration(value)) &&
    value.asteriskToken !== undefined
  ) {
    result.push("generator");
  }
  return result;
}

function isStaticMember(node: ts.Node): boolean {
  return (
    canHaveModifiers(node) &&
    (getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Static) !== 0
  );
}

function memberVisibility(node: ts.Node, name: ts.Node | undefined): Visibility {
  if (name !== undefined && isPrivateIdentifier(name)) return "private";
  const flags = getCombinedModifierFlags(node as ts.Declaration);
  if ((flags & ts.ModifierFlags.Private) !== 0) return "private";
  if ((flags & ts.ModifierFlags.Protected) !== 0) return "protected";
  return "public";
}

function declaresBehaviour(node: ts.InterfaceDeclaration): boolean {
  return node.members.some(
    (member) =>
      isMethodSignature(member) ||
      isCallSignatureDeclaration(member) ||
      isConstructSignatureDeclaration(member),
  );
}

function hasAccessorKeyword(node: ts.PropertyDeclaration): boolean {
  return getModifiers(node)?.some((m) => m.kind === K.AccessorKeyword) ?? false;
}

/** Kind of a symbol created for a value: function, class, or the given fallback. */
function valueKind(value: ts.Expression | undefined, fallback: SymbolKind): SymbolKind {
  const unwrapped = value === undefined ? undefined : skipOuterExpressions(value);
  if (isFunctionValue(unwrapped)) return "function";
  if (unwrapped !== undefined && isClassExpression(unwrapped)) return "class";
  return fallback;
}

/**
 * Whether an exported or assigned expression denotes an existing binding (an identifier or a member chain
 * rooted at one, or at a `require()` call) rather than a new value.
 */
export function isBindingExpression(expression: ts.Expression): boolean {
  const { root } = decomposeChain(skipOuterExpressions(expression));
  return isIdentifier(root) || isRequireCallSyntax(root);
}

class Collector {
  readonly #file: ts.SourceFile;
  readonly #tests: DeclarationTests;
  readonly #namer = new SymbolNamer();
  readonly #pending: Pending[] = [];
  readonly #topLevelNames: Set<string>;
  readonly #commonJs = new Map<string, Pending>();
  readonly #commonJsAliases = new Map<string, ts.Expression>();
  readonly #exportsObjects = new Set<ts.Node>();
  #commonJsDefault = false;

  constructor(file: ts.SourceFile, tests: DeclarationTests) {
    this.#file = file;
    this.#tests = tests;
    this.#topLevelNames = topLevelNamesOf(file);
  }

  collect(): FileDeclarations {
    const scope: Scope = { parent: undefined, segments: [], kind: "file", key: undefined };
    for (const statement of this.#file.statements) this.#statement(statement, scope);
    return this.#finish();
  }

  /** Declare a symbol; declarations whose name is missing (syntax errors) are skipped. */
  #declare(input: DeclareInput): Pending | undefined {
    if (input.name.trim() === "") return undefined;
    const segments = [...input.scope.segments, input.name];
    const isStatic = input.isStatic ?? false;
    const key = input.scope.key;
    const handle = this.#namer.declare({
      qualifiedName: qualifiedNameOf(segments),
      kind: input.kind,
      isStatic,
      ...(key === undefined ? {} : { key }),
    });
    const site = input.site;
    const exports = input.scope.exports;
    const exported =
      exports === undefined
        ? undefined
        : exports === "implicit" || EXPORT_FORMS.has(site.form) || hasExportModifier(site.node);
    const pending: Pending = {
      handle,
      name: input.name,
      segments,
      kind: input.kind,
      isStatic,
      parent: input.scope.parent,
      global: input.scope.kind === "global",
      key,
      site: {
        form: site.form,
        node: site.node,
        range: rangeOf(this.#file, site.rangeNode),
        signature: site.signature,
        modifiers: site.modifiers ?? [],
        visibility: site.visibility,
        abstract: site.abstract ?? false,
        implementation: site.functionNode !== undefined && hasBody(site.functionNode),
        functionNode: site.functionNode,
        classNode: site.classNode,
        value: site.value,
        typeNode: site.typeNode,
        exported,
      },
      owners: input.owners,
      bindings: input.bindings ?? [],
    };
    this.#pending.push(pending);
    return pending;
  }

  #statement(statement: ts.Statement, scope: Scope): void {
    const file = this.#file;
    if (isFunctionDeclaration(statement)) {
      const isDefault = (getCombinedModifierFlags(statement) & ts.ModifierFlags.Default) !== 0;
      const name = statement.name?.text ?? (isDefault ? "default" : undefined);
      if (name === undefined) return;
      this.#declare({
        name,
        kind: "function",
        scope,
        site: {
          form: "function",
          node: statement,
          rangeNode: statement,
          signature: functionSignature(file, statement),
          modifiers: [...flagModifiers(statement), ...functionValueModifiers(statement)],
          functionNode: statement,
        },
        owners: [statement],
        bindings: statement.name === undefined ? [] : [statement],
      });
    } else if (isClassDeclaration(statement)) {
      const isDefault = (getCombinedModifierFlags(statement) & ts.ModifierFlags.Default) !== 0;
      const name = statement.name?.text ?? (isDefault ? "default" : undefined);
      if (name === undefined) return;
      const modifiers = flagModifiers(statement);
      const pending = this.#declare({
        name,
        kind: "class",
        scope,
        site: {
          form: "class",
          node: statement,
          rangeNode: statement,
          signature: typeDeclarationSignature(file, statement),
          modifiers,
          abstract: modifiers.includes("abstract"),
          classNode: statement,
        },
        owners: [statement],
        bindings: statement.name === undefined ? [] : [statement],
      });
      if (pending !== undefined) this.#classMembers(statement, pending);
    } else if (isInterfaceDeclaration(statement)) {
      this.#declare({
        name: statement.name.text,
        kind: "interface",
        scope,
        site: {
          form: "interface",
          node: statement,
          rangeNode: statement,
          signature: typeDeclarationSignature(file, statement),
          modifiers: flagModifiers(statement),
          abstract: declaresBehaviour(statement),
        },
        owners: [statement],
        bindings: [statement],
      });
    } else if (isTypeAliasDeclaration(statement)) {
      this.#declare({
        name: statement.name.text,
        kind: "type-alias",
        scope,
        site: {
          form: "type-alias",
          node: statement,
          rangeNode: statement,
          signature: typeAliasSignature(file, statement),
          modifiers: flagModifiers(statement),
        },
        owners: [statement],
        bindings: [statement],
      });
    } else if (isEnumDeclaration(statement)) {
      this.#declare({
        name: statement.name.text,
        kind: "enum",
        scope,
        site: {
          form: "enum",
          node: statement,
          rangeNode: statement,
          signature: typeDeclarationSignature(file, statement),
          modifiers: flagModifiers(statement),
        },
        owners: [statement],
        bindings: [statement],
      });
    } else if (isModuleDeclaration(statement)) {
      this.#module(statement, scope);
    } else if (isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        this.#variable(declaration, statement, scope);
      }
    } else if (isExportAssignment(statement)) {
      if (scope.kind === "file" || scope.kind === "module")
        this.#exportAssignment(statement, scope);
    } else if (scope.kind === "file") {
      this.#commonJsStatement(statement, scope);
    }
  }

  #module(declaration: ts.ModuleDeclaration, scope: Scope): void {
    if ((declaration.flags & ts.NodeFlags.GlobalAugmentation) !== 0) {
      const body = declaration.body;
      if (body !== undefined && isModuleBlock(body)) {
        const global: Scope = { parent: undefined, segments: [], kind: "global", key: GLOBAL_KEY };
        for (const statement of body.statements) this.#statement(statement, global);
      }
      return;
    }
    if (isStringLiteral(declaration.name)) {
      const pending = this.#declare({
        name: JSON.stringify(declaration.name.text),
        kind: "module",
        scope,
        site: {
          form: "module",
          node: declaration,
          rangeNode: declaration,
          signature: moduleSignature(declaration, ""),
          modifiers: flagModifiers(declaration),
        },
        owners: [declaration],
        bindings: [declaration],
      });
      const body = declaration.body;
      if (pending !== undefined && body !== undefined && isModuleBlock(body)) {
        const inner = memberScope(pending, "module", bodyExportsOf(declaration));
        for (const statement of body.statements) this.#statement(statement, inner);
      }
      return;
    }
    // `namespace A.B.C {}` nests module declarations; each level is a namespace.
    let current: ts.ModuleDeclaration = declaration;
    let currentScope = scope;
    let dotted: string[] = [];
    for (;;) {
      const name = current.name.text;
      dotted = (current.flags & ts.NodeFlags.NestedNamespace) !== 0 ? [...dotted, name] : [name];
      const pending = this.#declare({
        name,
        kind: "namespace",
        scope: currentScope,
        site: {
          form: "namespace",
          node: current,
          rangeNode: current,
          signature: moduleSignature(current, dotted.join(".")),
          modifiers: flagModifiers(current),
        },
        owners: [current],
        bindings: [current],
      });
      if (pending === undefined) return;
      currentScope = memberScope(pending, "namespace", bodyExportsOf(current));
      const body: ts.ModuleBody | undefined = current.body;
      if (body !== undefined && isModuleDeclaration(body) && isIdentifier(body.name)) {
        current = body;
        continue;
      }
      if (body !== undefined && isModuleBlock(body)) {
        for (const statement of body.statements) this.#statement(statement, currentScope);
      }
      return;
    }
  }

  #variable(
    declaration: ts.VariableDeclaration,
    statement: ts.VariableStatement,
    scope: Scope,
  ): void {
    const file = this.#file;
    if (variableImportOf(file, declaration, this.#tests.isRequire) !== undefined) return;
    const keyword = variableKeyword(declaration);
    const constLike = keyword !== "let" && keyword !== "var";
    const modifiers = flagModifiers(declaration);
    if (isIdentifier(declaration.name)) {
      const value = declaration.initializer;
      const unwrapped = value === undefined ? undefined : skipOuterExpressions(value);
      const kind = valueKind(value, constLike ? "constant" : "variable");
      const single = statement.declarationList.declarations.length === 1;
      const functionNode = isFunctionValue(unwrapped) ? unwrapped : undefined;
      const classNode =
        unwrapped !== undefined && isClassExpression(unwrapped) ? unwrapped : undefined;
      const pending = this.#declare({
        name: declaration.name.text,
        kind,
        scope,
        site: {
          form: "variable",
          node: declaration,
          rangeNode: single ? statement : declaration,
          signature: variableSignature(file, keyword, declaration, unwrapped),
          modifiers: [...modifiers, ...functionValueModifiers(functionNode)],
          ...(functionNode === undefined ? {} : { functionNode }),
          ...(classNode === undefined ? {} : { classNode }),
          ...(value === undefined ? {} : { value }),
          ...(declaration.type === undefined ? {} : { typeNode: declaration.type }),
        },
        owners: [declaration],
        bindings: [
          declaration,
          ...(functionNode === undefined ? [] : [functionNode]),
          ...(classNode === undefined ? [] : [classNode]),
        ],
      });
      if (classNode !== undefined && pending !== undefined) this.#classMembers(classNode, pending);
      return;
    }
    for (const { element, name } of boundNames(declaration.name)) {
      this.#declare({
        name: name.text,
        kind: constLike ? "constant" : "variable",
        scope,
        site: {
          form: "binding",
          node: element,
          rangeNode: element,
          signature: bindingSignature(keyword, name.text),
          modifiers,
        },
        owners: [element],
        bindings: [element],
      });
    }
  }

  /** `export default <expression>` and `export = <expression>`. */
  #exportAssignment(statement: ts.ExportAssignment, scope: Scope): void {
    const expression = statement.expression;
    if (isBindingExpression(expression)) return;
    const unwrapped = skipOuterExpressions(expression);
    if (statement.isExportEquals === true && isObjectLiteralExpression(unwrapped)) {
      this.#objectMembers(unwrapped, scope);
      return;
    }
    this.#defaultExpression(expression, statement, scope, statement.isExportEquals !== true);
  }

  /** A symbol named `default` for an exported or assigned expression. */
  #defaultExpression(
    expression: ts.Expression,
    statement: ts.Statement,
    scope: Scope,
    exportDefault: boolean,
  ): void {
    const file = this.#file;
    const unwrapped = skipOuterExpressions(expression);
    const functionNode = isFunctionValue(unwrapped) ? unwrapped : undefined;
    const classNode = isClassExpression(unwrapped) ? unwrapped : undefined;
    const start = exportDefault ? expression.getStart(file) : statement.getStart(file);
    const pending = this.#declare({
      name: "default",
      kind: valueKind(expression, "constant"),
      scope,
      site: {
        form: "default-expression",
        node: statement,
        rangeNode: statement,
        signature: assignedValueSignature(file, start, undefined, unwrapped),
        modifiers: [
          ...(exportDefault ? (["default"] as const) : []),
          ...functionValueModifiers(functionNode),
        ],
        ...(functionNode === undefined ? {} : { functionNode }),
        ...(classNode === undefined ? {} : { classNode }),
        value: expression,
      },
      owners: [expression],
      bindings: [
        ...(functionNode === undefined ? [] : [functionNode]),
        ...(classNode === undefined ? [] : [classNode]),
      ],
    });
    if (classNode !== undefined && pending !== undefined) this.#classMembers(classNode, pending);
  }

  /** Record the binding expression a CommonJS export name is assigned (the first assignment wins). */
  #alias(name: string, value: ts.Expression): void {
    if (!this.#commonJsAliases.has(name))
      this.#commonJsAliases.set(name, skipOuterExpressions(value));
  }

  /**
   * CommonJS exports at the top level: `exports.x = ...`, `module.exports.x = ...`, `module.exports = ...`
   * (also `exports = module.exports = ...`, see `commonJsExportOf`).
   */
  #commonJsStatement(statement: ts.Statement, scope: Scope): void {
    const commonJs = commonJsExportOf(statement, this.#tests.isGlobal);
    if (commonJs === undefined) return;
    const { target, value } = commonJs;
    // `exports.a = exports.b = void 0` (compiled modules declare their exports up front): no value yet, the
    // export's symbol comes from the assignment of its value.
    if (isVoidLiteral(exportAssignmentChain(value, this.#tests.isGlobal).value)) return;
    const unwrapped = skipOuterExpressions(value);
    if (target.kind === "module") {
      if (isObjectLiteralExpression(unwrapped)) {
        this.#objectMembers(unwrapped, scope);
      } else if (!isBindingExpression(value) && !this.#commonJsDefault) {
        this.#commonJsDefault = true;
        this.#defaultExpression(value, statement, scope, false);
      }
      return;
    }
    const name = target.name;
    if (isBindingExpression(value)) {
      // `exports.a = a`: the export is an existing binding, which `exports.a` denotes.
      this.#alias(name, value);
      return;
    }
    if (this.#topLevelNames.has(name) || this.#commonJs.has(name)) return;
    const file = this.#file;
    const functionNode = isFunctionValue(unwrapped) ? unwrapped : undefined;
    const classNode = isClassExpression(unwrapped) ? unwrapped : undefined;
    const pending = this.#declare({
      name,
      kind: valueKind(value, "constant"),
      scope,
      site: {
        form: "commonjs-export",
        node: statement,
        rangeNode: statement,
        signature: assignedValueSignature(file, statement.getStart(file), commonJs.left, unwrapped),
        modifiers: functionValueModifiers(functionNode),
        ...(functionNode === undefined ? {} : { functionNode }),
        ...(classNode === undefined ? {} : { classNode }),
        value,
      },
      owners: [value],
      bindings: [
        ...(functionNode === undefined ? [] : [functionNode]),
        ...(classNode === undefined ? [] : [classNode]),
      ],
    });
    if (pending === undefined) return;
    this.#commonJs.set(name, pending);
    if (classNode !== undefined) this.#classMembers(classNode, pending);
  }

  /**
   * Functions and classes defined inline in `module.exports = { ... }` (and `export = { ... }`); other
   * properties naming existing bindings (`{ load, save: store.save }`) are aliases.
   */
  #objectMembers(object: ts.ObjectLiteralExpression, scope: Scope): void {
    const file = this.#file;
    this.#exportsObjects.add(object);
    for (const property of object.properties) {
      if (isShorthandPropertyAssignment(property)) {
        this.#alias(property.name.text, property.name);
        continue;
      }
      if (!isPropertyAssignment(property) && !isMethodDeclaration(property)) continue;
      const name = propertyNameText(file, property.name);
      if (isPropertyAssignment(property) && isBindingExpression(property.initializer)) {
        this.#alias(name, property.initializer);
        continue;
      }
      if (this.#topLevelNames.has(name) || this.#commonJs.has(name)) continue;
      if (isMethodDeclaration(property)) {
        const pending = this.#declare({
          name,
          kind: "function",
          scope,
          site: {
            form: "commonjs-member",
            node: property,
            rangeNode: property,
            signature: objectMemberSignature(file, property),
            modifiers: functionValueModifiers(property),
            functionNode: property,
          },
          owners: [property],
          bindings: [property],
        });
        if (pending !== undefined) this.#commonJs.set(name, pending);
        continue;
      }
      const unwrapped = skipOuterExpressions(property.initializer);
      const functionNode = isFunctionValue(unwrapped) ? unwrapped : undefined;
      const classNode = isClassExpression(unwrapped) ? unwrapped : undefined;
      if (functionNode === undefined && classNode === undefined) continue;
      const pending = this.#declare({
        name,
        kind: valueKind(property.initializer, "constant"),
        scope,
        site: {
          form: "commonjs-member",
          node: property,
          rangeNode: property,
          signature: objectMemberSignature(file, property),
          modifiers: functionValueModifiers(functionNode),
          ...(functionNode === undefined ? {} : { functionNode }),
          ...(classNode === undefined ? {} : { classNode }),
          value: property.initializer,
        },
        owners: [property.initializer],
        bindings: [
          ...(functionNode === undefined ? [] : [functionNode]),
          ...(classNode === undefined ? [] : [classNode]),
        ],
      });
      if (pending === undefined) continue;
      this.#commonJs.set(name, pending);
      if (classNode !== undefined) this.#classMembers(classNode, pending);
    }
  }

  #classMembers(node: ts.ClassLikeDeclaration, owner: Pending): void {
    const file = this.#file;
    const scope = memberScope(owner, "namespace");
    for (const member of node.members) {
      if (isMethodDeclaration(member)) {
        this.#declare({
          name: propertyNameText(file, member.name),
          kind: "method",
          scope,
          isStatic: isStaticMember(member),
          site: {
            form: "member",
            node: member,
            rangeNode: member,
            signature: functionSignature(file, member),
            modifiers: [
              ...flagModifiers(member),
              ...functionValueModifiers(member),
              ...(member.questionToken === undefined ? [] : (["optional"] as const)),
            ],
            visibility: memberVisibility(member, member.name),
            functionNode: member,
          },
          owners: [member],
        });
      } else if (isConstructorDeclaration(member)) {
        this.#declare({
          name: "constructor",
          kind: "constructor",
          scope,
          site: {
            form: "member",
            node: member,
            rangeNode: member,
            signature: functionSignature(file, member),
            modifiers: flagModifiers(member),
            visibility: memberVisibility(member, undefined),
            functionNode: member,
          },
          owners: [member],
        });
        for (const parameter of member.parameters) {
          if (!isParameterPropertyDeclaration(parameter, member) || !isIdentifier(parameter.name)) {
            continue;
          }
          this.#declare({
            name: parameter.name.text,
            kind: "property",
            scope,
            site: {
              form: "parameter-property",
              node: parameter,
              rangeNode: parameter,
              signature: propertySignature(file, parameter),
              modifiers: [
                ...flagModifiers(parameter),
                ...(parameter.questionToken === undefined ? [] : (["optional"] as const)),
              ],
              visibility: memberVisibility(parameter, undefined),
              ...(parameter.type === undefined ? {} : { typeNode: parameter.type }),
            },
            owners: [parameter],
          });
        }
      } else if (isPropertyDeclaration(member)) {
        this.#declare({
          name: propertyNameText(file, member.name),
          kind: hasAccessorKeyword(member) ? "accessor" : "property",
          scope,
          isStatic: isStaticMember(member),
          site: {
            form: "member",
            node: member,
            rangeNode: member,
            signature: propertySignature(file, member),
            modifiers: [
              ...flagModifiers(member),
              ...(member.questionToken === undefined ? [] : (["optional"] as const)),
            ],
            visibility: memberVisibility(member, member.name),
            ...(member.initializer === undefined ? {} : { value: member.initializer }),
            ...(member.type === undefined ? {} : { typeNode: member.type }),
          },
          owners: [member],
        });
      } else if (isGetAccessorDeclaration(member) || isSetAccessorDeclaration(member)) {
        const typeNode = isGetAccessorDeclaration(member)
          ? member.type
          : member.parameters[0]?.type;
        this.#declare({
          name: propertyNameText(file, member.name),
          kind: "accessor",
          scope,
          isStatic: isStaticMember(member),
          site: {
            form: "member",
            node: member,
            rangeNode: member,
            signature: functionSignature(file, member),
            modifiers: flagModifiers(member),
            visibility: memberVisibility(member, member.name),
            functionNode: member,
            ...(typeNode === undefined ? {} : { typeNode }),
          },
          owners: [member],
        });
      }
    }
  }

  #finish(): FileDeclarations {
    const localNames = this.#namer.assign();
    const byLocalName = new Map<string, MutableSymbolInfo>();
    const symbols: MutableSymbolInfo[] = [];
    const owners = new Map<ts.Node, SymbolInfo>();
    const bindings = new Map<ts.Node, SymbolInfo>();
    const functions = new Map<ts.Node, SymbolInfo>();
    const classes = new Map<ts.Node, SymbolInfo>();
    const localNameOf = (pending: Pending): string => localNames[pending.handle] ?? pending.name;
    for (const pending of this.#pending) {
      const localName = localNameOf(pending);
      let info = byLocalName.get(localName);
      if (info === undefined) {
        const parent =
          pending.parent === undefined ? undefined : byLocalName.get(localNameOf(pending.parent));
        info = {
          localName,
          name: pending.name,
          qualifiedName: qualifiedNameOf(pending.segments),
          kind: pending.kind,
          isStatic: pending.isStatic,
          parent,
          global: pending.global,
          sites: [],
          children: [],
        };
        byLocalName.set(localName, info);
        symbols.push(info);
        parent?.children.push(info);
      }
      info.sites.push(pending.site);
      for (const node of pending.owners) if (!owners.has(node)) owners.set(node, info);
      for (const node of pending.bindings) if (!bindings.has(node)) bindings.set(node, info);
      const { functionNode, classNode } = pending.site;
      if (functionNode !== undefined && !functions.has(functionNode))
        functions.set(functionNode, info);
      if (classNode !== undefined && !classes.has(classNode)) classes.set(classNode, info);
    }
    const ownerKinds = new Uint8Array(K.Count + 1);
    for (const node of owners.keys()) ownerKinds[node.kind] = 1;
    const commonJs = new Map<string, SymbolInfo>();
    for (const [name, pending] of this.#commonJs) {
      const info = byLocalName.get(localNameOf(pending));
      if (info !== undefined) commonJs.set(name, info);
    }
    const aliases = this.#commonJsAliases;
    const exportsObjects = this.#exportsObjects;
    return {
      symbols,
      topLevelNames: this.#topLevelNames,
      ownerOf: (node) => owners.get(node),
      mayOwn: (kind) => ownerKinds[kind] === 1,
      symbolOfDeclaration: (node) => bindings.get(node),
      symbolOfFunction: (node) => functions.get(node),
      symbolOfClass: (node) => classes.get(node),
      commonJsExport: (name) => commonJs.get(name),
      commonJsAlias: (name) => (commonJs.has(name) ? undefined : aliases.get(name)),
      isExportsObject: (node) => exportsObjects.has(node),
    };
  }
}

/** Names declared or imported at the top level of a file. */
function topLevelNamesOf(file: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of file.statements) {
    if (
      (isFunctionDeclaration(statement) ||
        isClassDeclaration(statement) ||
        isInterfaceDeclaration(statement) ||
        isTypeAliasDeclaration(statement) ||
        isEnumDeclaration(statement) ||
        isImportEqualsDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      names.add(statement.name.text);
    } else if (isModuleDeclaration(statement) && isIdentifier(statement.name)) {
      names.add(statement.name.text);
    } else if (isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (isIdentifier(declaration.name)) names.add(declaration.name.text);
        else for (const { name } of boundNames(declaration.name)) names.add(name.text);
      }
    } else if (isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name !== undefined) names.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings !== undefined) {
        if (isNamespaceImport(bindings)) names.add(bindings.name.text);
        else for (const element of bindings.elements) names.add(element.name.text);
      }
    }
  }
  return names;
}

/**
 * Collect the symbols of a bound source file. `tests` decide whether `module` and `exports` denote the
 * CommonJS globals and whether `require` loads modules.
 */
export function collectDeclarations(
  file: ts.SourceFile,
  tests: DeclarationTests,
): FileDeclarations {
  return new Collector(file, tests).collect();
}
