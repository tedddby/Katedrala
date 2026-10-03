/**
 * The reference walk: one pass over the whole syntax tree that records references (with the enclosing
 * symbol as `from`), imports found in code (import declarations, `require()`, `import()`, `import("m")`
 * types, JSDoc imports) and facts (environment reads, `fetch` calls).
 *
 * Member chains are handled at their outermost node, so that `a.b.c()` yields one reference (root `a`,
 * members `["b", "c"]`). Identifiers in type positions are only recorded through type references, type
 * queries and heritage clauses.
 *
 * The walk keeps its own stack of pending nodes instead of recursing, so that its depth does not depend on
 * the tree's: long operator chains (`"a" + "b" + ...` in generated template caches, `||` guards, comma
 * sequences) and long call chains are walked like any other code. Each pending node carries the context it
 * was scheduled in (the enclosing symbol and whether it is in a type position).
 */
import type {
  ExtractedFact,
  ExtractedImport,
  ExtractedReference,
  ImportBinding,
  ReferenceKind,
} from "@katedrala/plugin-api";
import ts from "typescript";
import type { ResolvedTypeScriptAdapterOptions } from "../options.js";
import { ArgumentSummarizer, templateText } from "./arguments.js";
import { isBindingExpression, type FileDeclarations } from "./declarations.js";
import {
  importTypeMembers,
  importTypeSpecifier,
  type ChainResolution,
  type Resolver,
} from "./resolver.js";
import type { Meaning } from "./scope.js";
import {
  assignmentOf,
  bindingRoot,
  commonJsExportOf,
  decomposeChain,
  exportAssignmentChain,
  firstMemberNode,
  isIntrinsicJsxName,
  isRequireCallSyntax,
  literalText,
  requireIdentifierOf,
  skipOuterExpressions,
  skipParentheses,
  specifierArgument,
} from "./syntax.js";
import { jsDocOf } from "./ts-internals.js";
import { startOf, truncate } from "./text.js";
import { K } from "./kinds.js";

const {
  forEachChild,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isClassLike,
  isComputedPropertyName,
  isExpressionStatement,
  isExternalModuleReference,
  isIdentifier,
  isImportClause,
  isImportSpecifier,
  isJSDocCallbackTag,
  isJSDocImportTag,
  isJSDocTypedefTag,
  isJsxNamespacedName,
  isMetaProperty,
  isNamedExports,
  isNamespaceImport,
  isNewExpression,
  isNoSubstitutionTemplateLiteral,
  isNonNullExpression,
  isNumericLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParameter,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isQualifiedName,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isStringLiteral,
  isTemplateExpression,
  isTypeAssertionExpression,
  isTypeNode,
  isTypePredicateNode,
  isVariableDeclaration,
  isVariableStatement,
} = ts;

/** An import found by the walk, with its offset for source ordering. */
export interface PositionedImport {
  readonly offset: number;
  readonly entry: ExtractedImport;
}

/** Syntax usage the module format depends on. */
export interface ModuleUsage {
  /** `require()`, `module.exports` or `exports` (the CommonJS globals) are used. */
  readonly commonJs: boolean;
  /** `import.meta` is used. */
  readonly importMeta: boolean;
}

/** Everything the walk records. */
export interface WalkResult {
  readonly references: ExtractedReference[];
  readonly imports: PositionedImport[];
  readonly facts: ExtractedFact[];
  readonly usage: ModuleUsage;
}

const INVOCATIONS = new Set<ReferenceKind>(["call", "new", "tagged-template", "decorator"]);
const GLOBAL_OBJECTS = new Set(["globalThis", "global", "window", "self"]);
const PROCESS_MODULES = new Set(["process", "node:process"]);

/** Parents whose identifier children are all references (the common expression contexts). */
const REFERENCE_PARENTS = new Set<ts.SyntaxKind>([
  K.CallExpression,
  K.NewExpression,
  K.BinaryExpression,
  K.ExpressionStatement,
  K.ReturnStatement,
  K.ArrayLiteralExpression,
  K.SpreadElement,
  K.SpreadAssignment,
  K.TemplateSpan,
  K.ConditionalExpression,
  K.ParenthesizedExpression,
  K.AwaitExpression,
  K.PrefixUnaryExpression,
  K.PostfixUnaryExpression,
  K.ElementAccessExpression,
  K.IfStatement,
  K.JsxExpression,
  K.ShorthandPropertyAssignment,
  K.AsExpression,
  K.SatisfiesExpression,
  K.NonNullExpression,
  K.TypeOfExpression,
  K.VoidExpression,
  K.DeleteExpression,
  K.ThrowStatement,
  K.YieldExpression,
  K.ComputedPropertyName,
]);

/** Whether an identifier is a reference (as opposed to a declared name, a property name or a label). */
function isReferenceIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (REFERENCE_PARENTS.has(parent.kind)) return true;
  if (isPropertyAccessExpression(parent)) return parent.expression === node;
  if (isQualifiedName(parent)) return parent.left === node;
  if (isJsxNamespacedName(parent) || isTypePredicateNode(parent)) return false;
  const named = parent as ts.Node & {
    readonly name?: ts.Node;
    readonly propertyName?: ts.Node;
    readonly label?: ts.Node;
    readonly tagName?: ts.Node;
  };
  return (
    named.name !== node &&
    named.propertyName !== node &&
    named.label !== node &&
    named.tagName !== node
  );
}

/** Literal-like arguments that make an untyped call worth recording. */
const REGISTRATION_ARGUMENTS = new Set<ts.SyntaxKind>([
  K.StringLiteral,
  K.NoSubstitutionTemplateLiteral,
  K.TemplateExpression,
  K.ArrowFunction,
  K.FunctionExpression,
  K.ObjectLiteralExpression,
]);

/** Arguments that are member chains (recorded when they resolve to a binding). */
const CHAIN_ARGUMENTS = new Set<ts.SyntaxKind>([
  K.Identifier,
  K.PropertyAccessExpression,
  K.ElementAccessExpression,
  K.ThisKeyword,
]);

function isAssignmentTarget(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    isBinaryExpression(parent) &&
    parent.left === node &&
    parent.operatorToken.kind === K.EqualsToken
  );
}

function isImportMeta(node: ts.Node): boolean {
  return isMetaProperty(node) && node.keywordToken === K.ImportKeyword && node.name.text === "meta";
}

/** The host of `fetch` with an absolute URL (`https://api.example.com/x` → `api.example.com`). */
export function hostOfUrl(url: string): string | undefined {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i.exec(url);
  const scheme = match?.[1];
  const authority = match?.[2];
  if (
    scheme === undefined ||
    authority === undefined ||
    authority === "" ||
    authority.includes("${")
  ) {
    return undefined;
  }
  try {
    const host = new URL(`${scheme}://${authority}`).host;
    return host === "" ? undefined : host;
  } catch {
    return undefined;
  }
}

/** A node waiting to be walked, with the context it was scheduled in. */
interface PendingVisit {
  readonly node: ts.Node;
  readonly from: string | undefined;
  readonly inType: boolean;
}

class Walker {
  readonly #file: ts.SourceFile;
  readonly #resolver: Resolver;
  readonly #summarizer: ArgumentSummarizer;
  readonly #declarations: FileDeclarations;
  readonly #recordUntypedCalls: boolean;
  readonly #javascript: boolean;
  readonly #references: ExtractedReference[] = [];
  readonly #imports: PositionedImport[] = [];
  readonly #facts: ExtractedFact[] = [];
  readonly #recorded = new Set<ts.Node>();
  /** Nested CommonJS export targets (`exports.b` in `exports.a = exports.b = x`), which are not reads. */
  readonly #exportTargets = new Set<ts.Node>();
  /** Nodes still to walk, the next one last. */
  readonly #stack: PendingVisit[] = [];
  /** Nodes scheduled while walking the current node, in source order. */
  readonly #scheduled: PendingVisit[] = [];
  #commonJs = false;
  #importMeta = false;
  #from: string | undefined;
  #inType = false;
  readonly #dispatch: ReadonlyArray<((node: ts.Node) => boolean) | undefined>;

  constructor(
    file: ts.SourceFile,
    resolver: Resolver,
    declarations: FileDeclarations,
    options: ResolvedTypeScriptAdapterOptions,
    javascript: boolean,
  ) {
    this.#file = file;
    this.#resolver = resolver;
    this.#summarizer = new ArgumentSummarizer(file, resolver);
    this.#declarations = declarations;
    this.#recordUntypedCalls = options.recordUntypedCalls;
    this.#javascript = javascript;
    this.#dispatch = this.#handlers();
  }

  walk(): WalkResult {
    this.#visit(this.#file);
    this.#drain();
    return {
      references: this.#references,
      imports: this.#imports,
      facts: this.#facts,
      usage: { commonJs: this.#commonJs, importMeta: this.#importMeta },
    };
  }

  /** Schedule a node to be walked in the current context (after the node being walked). */
  readonly #visit = (node: ts.Node): void => {
    // A block body: `forEachChild` stops at the first truthy callback result.
    this.#scheduled.push({ node, from: this.#from, inType: this.#inType });
  };

  /**
   * Walk scheduled nodes until none is left, depth first: the nodes a node schedules are walked before its
   * following siblings, in the order they were scheduled.
   */
  #drain(): void {
    for (;;) {
      for (let index = this.#scheduled.length - 1; index >= 0; index -= 1) {
        const scheduled = this.#scheduled[index];
        if (scheduled !== undefined) this.#stack.push(scheduled);
      }
      this.#scheduled.length = 0;
      const next = this.#stack.pop();
      if (next === undefined) return;
      this.#from = next.from;
      this.#inType = next.inType;
      this.#enter(next.node);
    }
  }

  /** Walk one node: its symbol (for `from` attribution), its JSDoc, then the node itself. */
  #enter(node: ts.Node): void {
    const owner = this.#declarations.mayOwn(node.kind)
      ? this.#declarations.ownerOf(node)
      : undefined;
    if (owner !== undefined) this.#from = owner.localName;
    if (this.#javascript) this.#visitJsDoc(node);
    this.#visitNode(node);
  }

  #visitAll(nodes: readonly ts.Node[] | undefined): void {
    if (nodes !== undefined) for (const node of nodes) this.#visit(node);
  }

  /** Handlers by syntax kind; a handler returns false to fall back to the generic traversal. */
  #handlers(): ReadonlyArray<((node: ts.Node) => boolean) | undefined> {
    const handlers: Array<((node: ts.Node) => boolean) | undefined> = [];
    const on = (
      kinds: readonly ts.SyntaxKind[],
      action: (node: ts.Node) => boolean | undefined,
    ): void => {
      const handler = (node: ts.Node): boolean => action(node) !== false;
      for (const kind of kinds) handlers[kind] = handler;
    };
    on([K.Identifier], (node) => {
      this.#identifier(node as ts.Identifier);
    });
    on([K.PropertyAccessExpression], (node) => {
      if (this.#exportTargets.has(node)) return;
      this.#chain(node as ts.PropertyAccessExpression, "value", undefined, "value");
    });
    on([K.ElementAccessExpression], (node) => {
      if (this.#exportTargets.has(node)) return;
      this.#elementAccess(node as ts.ElementAccessExpression);
    });
    on([K.CallExpression], (node) => {
      this.#call(node as ts.CallExpression);
    });
    on([K.NewExpression], (node) => {
      this.#new(node as ts.NewExpression);
    });
    on([K.TaggedTemplateExpression], (node) => {
      this.#taggedTemplate(node as ts.TaggedTemplateExpression);
    });
    on([K.Decorator], (node) => {
      this.#decorator(node as ts.Decorator);
    });
    on([K.HeritageClause], (node) => {
      this.#heritageClause(node as ts.HeritageClause);
    });
    on([K.TypeReference], (node) => {
      this.#typeReference(node as ts.TypeReferenceNode);
    });
    on([K.TypeQuery], (node) => {
      this.#typeQuery(node as ts.TypeQueryNode);
    });
    on([K.ImportType], (node) => {
      this.#importType(node as ts.ImportTypeNode);
    });
    on([K.ExpressionWithTypeArguments], (node) => {
      this.#expressionWithTypeArguments(node as ts.ExpressionWithTypeArguments);
    });
    on([K.JsxSelfClosingElement, K.JsxOpeningElement], (node) => {
      this.#jsxTag(node as ts.JsxSelfClosingElement | ts.JsxOpeningElement);
    });
    on([K.ImportDeclaration], (node) => {
      this.#importDeclaration(node as ts.ImportDeclaration);
    });
    on([K.ImportEqualsDeclaration], (node) => {
      this.#importEquals(node as ts.ImportEqualsDeclaration);
    });
    on([K.ExportDeclaration], (node) => {
      this.#exportDeclaration(node as ts.ExportDeclaration);
    });
    on([K.ExportAssignment], (node) => {
      this.#exportAssignment(node as ts.ExportAssignment);
    });
    on([K.VariableDeclaration], (node) => {
      this.#variableDeclaration(node as ts.VariableDeclaration);
    });
    on([K.MetaProperty], (node) => {
      if (isImportMeta(node)) this.#importMeta = true;
    });
    on([K.JsxClosingElement, K.ThisKeyword, K.SuperKeyword], () => true);
    on([K.ExpressionStatement], (node) => this.#commonJsExport(node as ts.ExpressionStatement));
    return handlers;
  }

  #visitNode(node: ts.Node): void {
    const handler = this.#dispatch[node.kind];
    if (handler?.(node) === true) return;
    if (isTypeNode(node)) {
      this.#visitTypes([node], true);
      return;
    }
    forEachChild(node, this.#visit);
  }

  /** Visit nodes in a type position (`children`: visit their children rather than the nodes). */
  #visitTypes(nodes: readonly ts.Node[] | undefined, children = false): void {
    if (nodes === undefined) return;
    const saved = this.#inType;
    this.#inType = true;
    try {
      for (const node of nodes) {
        if (children) forEachChild(node, this.#visit);
        else this.#visit(node);
      }
    } finally {
      this.#inType = saved;
    }
  }

  // ─── References ────────────────────────────────────────────────────────────

  #identifier(node: ts.Identifier): void {
    if (this.#inType || node.text === "" || !isReferenceIdentifier(node)) return;
    this.#chain(node, "value", undefined, "value");
  }

  #elementAccess(node: ts.ElementAccessExpression): void {
    if (literalText(skipParentheses(node.argumentExpression)) !== undefined) {
      this.#chain(node, "value", undefined, "value");
      return;
    }
    this.#visit(node.expression);
    this.#visit(node.argumentExpression);
  }

  /** Resolve and record a member chain used as `kind`. */
  #chain(
    expression: ts.Expression,
    kind: ReferenceKind,
    args: readonly ts.Expression[] | undefined,
    meaning: Meaning,
  ): void {
    const resolution = this.#resolver.resolveExpression(expression, meaning);
    this.#noteUsage(resolution);
    this.#environmentRead(resolution, expression);
    if (resolution.requireCall !== undefined) this.#require(resolution.requireCall, []);
    switch (resolution.status) {
      case "broken":
        this.#visit(resolution.root);
        return;
      case "dropped":
        return;
      case "untyped":
        if (kind === "call" && this.#recordUntypedCalls && this.#qualifies(args)) {
          this.#push(resolution, kind, args);
        }
        return;
      case "resolved": {
        if (resolution.target?.type === "instance" && resolution.target.members.length === 0)
          return;
        // `new C(a).m()` / `f(a).m()`: the construction or call itself (and its arguments) are references
        // too, so the member is positioned at its name rather than at the shared root. A `require()` root
        // was already recorded as an import above.
        const invoked =
          resolution.requireCall === undefined &&
          (isNewExpression(resolution.root) || isCallExpression(resolution.root));
        const anchor = invoked ? firstMemberNode(expression, resolution.root) : undefined;
        this.#push(resolution, kind, args, anchor);
        if (invoked) this.#visit(resolution.root);
        return;
      }
    }
  }

  /** Record a reference, positioned at `anchor` (by default the chain's root). */
  #push(
    resolution: ChainResolution,
    kind: ReferenceKind,
    args: readonly ts.Expression[] | undefined,
    anchor: ts.Node = resolution.root,
  ): void {
    const target = resolution.target;
    if (target === undefined) return;
    const position = startOf(this.#file, anchor);
    const reference: ExtractedReference = {
      kind,
      target,
      typeOnly: this.#inType || resolution.typeOnly,
      line: position.line,
      column: position.column,
    };
    if (this.#from !== undefined) reference.from = this.#from;
    if (INVOCATIONS.has(kind)) reference.arguments = this.#summarizer.summarizeAll(args);
    this.#references.push(reference);
  }

  /**
   * Untyped receivers are recorded only for calls that look like registrations: an argument is a string,
   * a template, a function, an object, or a resolvable binding.
   */
  #qualifies(args: readonly ts.Expression[] | undefined): boolean {
    for (const argument of args ?? []) {
      const expression = skipOuterExpressions(argument);
      if (REGISTRATION_ARGUMENTS.has(expression.kind)) return true;
      if (
        (CHAIN_ARGUMENTS.has(expression.kind) || isRequireCallSyntax(expression)) &&
        this.#resolver.resolveExpression(expression).status === "resolved"
      ) {
        return true;
      }
    }
    return false;
  }

  #call(node: ts.CallExpression): void {
    const callee = node.expression;
    if (callee.kind === K.ImportKeyword) {
      this.#dynamicImport(node, []);
      this.#visitNonLiteralArguments(node);
      return;
    }
    if (isRequireCallSyntax(node)) {
      const identifier = requireIdentifierOf(node);
      if (identifier !== undefined && this.#resolver.isRequire(identifier)) {
        this.#require(node, []);
        this.#visitNonLiteralArguments(node);
        return;
      }
    }
    if (callee.kind !== K.SuperKeyword) {
      this.#httpRequest(node);
      this.#chain(callee, "call", node.arguments, "value");
    }
    this.#visitTypes(node.typeArguments);
    this.#visitAll(node.arguments);
  }

  #visitNonLiteralArguments(node: ts.CallExpression): void {
    node.arguments.forEach((argument, index) => {
      if (index > 0 || specifierArgument(this.#file, argument)?.literal !== true) {
        this.#visit(argument);
      }
    });
  }

  #new(node: ts.NewExpression): void {
    this.#chain(node.expression, "new", node.arguments ?? [], "value");
    this.#visitTypes(node.typeArguments);
    this.#visitAll(node.arguments);
  }

  #taggedTemplate(node: ts.TaggedTemplateExpression): void {
    this.#chain(node.tag, "tagged-template", [node.template], "value");
    this.#visitTypes(node.typeArguments);
    this.#visit(node.template);
  }

  #decorator(node: ts.Decorator): void {
    const expression = skipParentheses(node.expression);
    if (isCallExpression(expression)) {
      this.#chain(expression.expression, "decorator", expression.arguments, "value");
      this.#visitTypes(expression.typeArguments);
      this.#visitAll(expression.arguments);
      return;
    }
    this.#chain(expression, "decorator", [], "value");
  }

  #heritageClause(clause: ts.HeritageClause): void {
    const isClass = isClassLike(clause.parent);
    const kind: ReferenceKind = clause.token === K.ExtendsKeyword ? "extends" : "implements";
    const valuePosition = isClass && kind === "extends";
    for (const type of clause.types) {
      const saved = this.#inType;
      this.#inType = saved || !valuePosition;
      try {
        this.#chain(type.expression, kind, undefined, valuePosition ? "value" : "type");
      } finally {
        this.#inType = saved;
      }
      this.#visitTypes(type.typeArguments);
    }
  }

  #typeReference(node: ts.TypeReferenceNode): void {
    this.#entityName(node.typeName, "type", "type");
    this.#visitTypes(node.typeArguments);
  }

  #typeQuery(node: ts.TypeQueryNode): void {
    this.#entityName(node.exprName, "type", "value");
    this.#visitTypes(node.typeArguments);
  }

  #entityName(name: ts.EntityName, kind: ReferenceKind, meaning: Meaning): void {
    const resolution = this.#resolver.resolveEntityName(name, meaning);
    if (resolution.status !== "resolved") return;
    if (resolution.target?.type === "instance" && resolution.target.members.length === 0) return;
    const saved = this.#inType;
    this.#inType = true;
    try {
      this.#push(resolution, kind, undefined);
    } finally {
      this.#inType = saved;
    }
  }

  #importType(node: ts.ImportTypeNode): void {
    const specifier = importTypeSpecifier(node);
    if (specifier !== undefined) {
      this.#addImport(node, {
        specifier,
        literal: true,
        kind: "static",
        mechanism: "type-import",
        typeOnly: true,
        bindings: [],
      });
      const position = startOf(this.#file, node);
      const reference: ExtractedReference = {
        kind: "type",
        target: { type: "module", specifier, members: importTypeMembers(node) },
        typeOnly: true,
        line: position.line,
        column: position.column,
      };
      if (this.#from !== undefined) reference.from = this.#from;
      this.#references.push(reference);
    }
    this.#visitTypes(node.typeArguments);
  }

  /** Instantiation expressions (`f<T>`) in values; heritage clauses are handled by their clause. */
  #expressionWithTypeArguments(node: ts.ExpressionWithTypeArguments): void {
    if (this.#inType) {
      this.#chain(node.expression, "type", undefined, "type");
    } else {
      this.#chain(node.expression, "value", undefined, "value");
    }
    this.#visitTypes(node.typeArguments);
  }

  #jsxTag(node: ts.JsxSelfClosingElement | ts.JsxOpeningElement): void {
    const tag = node.tagName;
    if ((isIdentifier(tag) && !isIntrinsicJsxName(tag.text)) || isPropertyAccessExpression(tag)) {
      this.#chain(tag, "jsx", undefined, "value");
    }
    this.#visitTypes(node.typeArguments);
    this.#visit(node.attributes);
  }

  // ─── Imports ───────────────────────────────────────────────────────────────

  #addImport(
    node: ts.Node,
    entry: Omit<ExtractedImport, "line" | "column" | "from">,
    fileLevel = false,
  ): void {
    if (this.#recorded.has(node)) return;
    this.#recorded.add(node);
    const offset = node.getStart(this.#file);
    const position = startOf(this.#file, node);
    const result: ExtractedImport = { ...entry, line: position.line, column: position.column };
    if (!fileLevel && this.#from !== undefined) result.from = this.#from;
    this.#imports.push({ offset, entry: result });
  }

  #require(call: ts.CallExpression, bindings: ImportBinding[]): void {
    const specifier = specifierArgument(this.#file, call.arguments[0]);
    if (specifier === undefined) return;
    this.#commonJs = true;
    this.#addImport(call, {
      specifier: specifier.specifier,
      literal: specifier.literal,
      kind: "static",
      mechanism: "require-call",
      typeOnly: false,
      bindings,
    });
  }

  #dynamicImport(call: ts.CallExpression, bindings: ImportBinding[]): void {
    const specifier = specifierArgument(this.#file, call.arguments[0]);
    if (specifier === undefined) return;
    this.#addImport(call, {
      specifier: specifier.specifier,
      literal: specifier.literal,
      kind: "dynamic",
      mechanism: "dynamic-import",
      typeOnly: false,
      bindings,
    });
  }

  #importDeclaration(node: ts.ImportDeclaration): void {
    const specifier = node.moduleSpecifier;
    if (!isStringLiteral(specifier)) return;
    const clause = node.importClause;
    if (clause === undefined) {
      this.#addImport(node, {
        specifier: specifier.text,
        literal: true,
        kind: "side-effect",
        mechanism: "side-effect-import",
        typeOnly: false,
        bindings: [],
      });
      return;
    }
    const bindings = clauseBindings(clause, false);
    this.#addImport(node, {
      specifier: specifier.text,
      literal: true,
      kind: "static",
      mechanism: "import-declaration",
      typeOnly:
        clause.phaseModifier === K.TypeKeyword ||
        (bindings.length > 0 && bindings.every((binding) => binding.typeOnly)),
      bindings,
    });
  }

  #jsDocImport(tag: ts.JSDocImportTag): void {
    const specifier = tag.moduleSpecifier;
    if (!isStringLiteral(specifier)) return;
    this.#addImport(
      tag,
      {
        specifier: specifier.text,
        literal: true,
        kind: "static",
        mechanism: "type-import",
        typeOnly: true,
        bindings: tag.importClause === undefined ? [] : clauseBindings(tag.importClause, true),
      },
      true,
    );
  }

  #importEquals(node: ts.ImportEqualsDeclaration): void {
    const reference = node.moduleReference;
    if (!isExternalModuleReference(reference)) return;
    const specifier = specifierArgument(this.#file, reference.expression);
    if (specifier === undefined) return;
    this.#addImport(node, {
      specifier: specifier.specifier,
      literal: specifier.literal,
      kind: "static",
      mechanism: "import-equals",
      typeOnly: node.isTypeOnly,
      bindings:
        node.name.text === ""
          ? []
          : [{ local: node.name.text, imported: "=", typeOnly: node.isTypeOnly }],
    });
  }

  #exportDeclaration(node: ts.ExportDeclaration): void {
    const specifier = node.moduleSpecifier;
    if (specifier === undefined || !isStringLiteral(specifier)) return;
    const clause = node.exportClause;
    const named = clause !== undefined && isNamedExports(clause) ? clause : undefined;
    this.#addImport(node, {
      specifier: specifier.text,
      literal: true,
      kind: "re-export",
      mechanism: named === undefined ? "export-all" : "export-from",
      typeOnly:
        node.isTypeOnly ||
        (named !== undefined &&
          named.elements.length > 0 &&
          named.elements.every((element) => element.isTypeOnly)),
      bindings: [],
    });
  }

  #exportAssignment(node: ts.ExportAssignment): void {
    if (isBindingExpression(node.expression)) {
      this.#visitBindingExpression(node.expression);
      return;
    }
    this.#visit(node.expression);
  }

  /**
   * An exported binding expression: no reference (the export records it), but `require()` is an import, the
   * types of `x satisfies T`, `x as T` and `<T>x` are type references and `process.env.X` is an environment
   * read.
   */
  #visitBindingExpression(expression: ts.Expression): void {
    let current = expression;
    for (;;) {
      if (
        isAsExpression(current) ||
        isSatisfiesExpression(current) ||
        isTypeAssertionExpression(current)
      ) {
        this.#visitTypes([current.type]);
        current = current.expression;
      } else if (isParenthesizedExpression(current) || isNonNullExpression(current)) {
        current = current.expression;
      } else {
        break;
      }
    }
    const { root } = decomposeChain(current);
    if (isRequireCallSyntax(root)) {
      this.#visit(root);
      return;
    }
    this.#environmentRead(this.#resolver.resolveExpression(current), current);
  }

  #variableDeclaration(node: ts.VariableDeclaration): void {
    const variableImport = this.#resolver.variableImport(node);
    if (variableImport !== undefined) {
      const bindings = variableImport.bindings.map((binding) => ({
        local: binding.local,
        imported: binding.imported,
        typeOnly: false,
      }));
      if (variableImport.mechanism === "require-call") this.#require(variableImport.call, bindings);
      else this.#dynamicImport(variableImport.call, bindings);
      if (!isIdentifier(node.name)) this.#visit(node.name);
      if (node.type !== undefined) this.#visit(node.type);
      return;
    }
    this.#environmentDestructuring(node);
    forEachChild(node, this.#visit);
  }

  /**
   * The value finally assigned by nested CommonJS export assignments (`exports.a = exports.b = void 0`, as
   * TypeScript emits), whose targets are marked as export targets rather than reads.
   */
  #skipExportTargets(value: ts.Expression): ts.Expression {
    const chain = exportAssignmentChain(value, (identifier) => this.#resolver.isGlobal(identifier));
    for (const target of chain.targets) this.#exportTargets.add(target);
    return chain.value;
  }

  /**
   * Top-level CommonJS export assignments: the target (with an `exports` variable it rebinds, as in
   * `exports = module.exports = value`) is not a reference, the value is visited.
   */
  #commonJsExport(statement: ts.ExpressionStatement): boolean {
    if (statement.parent !== this.#file) return false;
    const commonJs = commonJsExportOf(statement, (identifier) =>
      this.#resolver.isGlobal(identifier),
    );
    if (commonJs === undefined) return false;
    this.#commonJs = true;
    const { target, value } = commonJs;
    const assigned = this.#skipExportTargets(value);
    if (assigned !== value) {
      // The nested targets are skipped by the walk; a binding is the export itself (no reference).
      if (isBindingExpression(assigned)) this.#visitBindingExpression(assigned);
      else this.#visit(value);
      return true;
    }
    const unwrapped = skipOuterExpressions(value);
    if (target.kind === "module" && isObjectLiteralExpression(unwrapped)) {
      for (const property of unwrapped.properties) {
        if (isShorthandPropertyAssignment(property)) continue;
        if (isPropertyAssignment(property) && isBindingExpression(property.initializer)) {
          this.#visitBindingExpression(property.initializer);
          continue;
        }
        this.#visit(property);
      }
      return true;
    }
    if (isBindingExpression(value)) {
      this.#visitBindingExpression(value);
      return true;
    }
    this.#visit(value);
    return true;
  }

  // ─── Facts and usage ───────────────────────────────────────────────────────

  #noteUsage(resolution: ChainResolution): void {
    const root = resolution.root;
    if (isImportMeta(root)) {
      this.#importMeta = true;
      return;
    }
    if (
      isIdentifier(root) &&
      (root.text === "exports" ||
        (root.text === "module" && resolution.members[0] === "exports")) &&
      this.#resolver.isGlobal(root)
    ) {
      this.#commonJs = true;
    }
  }

  #fact(
    type: ExtractedFact["type"],
    node: ts.Node,
    attributes: Record<string, string>,
    from: string | undefined = this.#from,
  ): void {
    const position = startOf(this.#file, node);
    const fact: ExtractedFact = { type, line: position.line, column: position.column, attributes };
    if (from !== undefined) fact.from = from;
    this.#facts.push(fact);
  }

  /**
   * What `identifier` denotes when it is the `process` global or an import of the `process` module named
   * `process` (the module) or `env` (its `env` export).
   */
  #processBinding(identifier: ts.Identifier): "module" | "env" | undefined {
    const name = identifier.text;
    if (name !== "process" && name !== "env") return undefined;
    if (name === "process" && this.#resolver.isGlobal(identifier)) return "module";
    for (const declaration of this.#resolver.lookup(identifier, "value")) {
      const imported = this.#importedFromProcess(declaration);
      if (imported === undefined) continue;
      if (name === "env" && imported === "env") return "env";
      if (name === "process" && (imported === "default" || imported === "*" || imported === "=")) {
        return "module";
      }
    }
    return undefined;
  }

  /** The exported name a declaration imports from the `process` module, if it imports from it. */
  #importedFromProcess(declaration: ts.Declaration): string | undefined {
    let importDeclaration: ts.ImportDeclaration | ts.JSDocImportTag | undefined;
    let imported: string | undefined;
    if (isImportClause(declaration)) {
      importDeclaration = declaration.parent;
      imported = "default";
    } else if (isNamespaceImport(declaration)) {
      importDeclaration = declaration.parent.parent;
      imported = "*";
    } else if (isImportSpecifier(declaration)) {
      importDeclaration = declaration.parent.parent.parent;
      imported = (declaration.propertyName ?? declaration.name).text;
    } else if (isVariableDeclaration(declaration) || isBindingElement(declaration)) {
      const root = isBindingElement(declaration) ? bindingRoot(declaration) : declaration;
      const variableImport = isVariableDeclaration(root)
        ? this.#resolver.variableImport(root)
        : undefined;
      if (variableImport === undefined || !PROCESS_MODULES.has(variableImport.specifier))
        return undefined;
      return variableImport.bindings.find((binding) => binding.name === declaration.name)?.imported;
    }
    const specifier = importDeclaration?.moduleSpecifier;
    return specifier !== undefined &&
      isStringLiteral(specifier) &&
      PROCESS_MODULES.has(specifier.text)
      ? imported
      : undefined;
  }

  /** The members after `env` when a chain reads the environment object (`process.env.X` → `["X"]`). */
  #environmentPath(root: ts.Node, members: readonly string[]): readonly string[] | undefined {
    if (isImportMeta(root)) return members[0] === "env" ? members.slice(1) : undefined;
    if (!isIdentifier(root)) return undefined;
    if (GLOBAL_OBJECTS.has(root.text) && members[0] === "process" && members[1] === "env") {
      return this.#resolver.isGlobal(root) ? members.slice(2) : undefined;
    }
    const binding = this.#processBinding(root);
    if (binding === "env") return members;
    if (binding === "module" && members[0] === "env") return members.slice(1);
    return undefined;
  }

  /**
   * The members read on a local variable or parameter that aliases the environment object
   * (`const env = process.env`, `function load(env = process.env)`).
   */
  #environmentAliasPath(
    identifier: ts.Identifier,
    members: readonly string[],
  ): readonly string[] | undefined {
    for (const declaration of this.#resolver.lookup(identifier, "value")) {
      if (
        (isVariableDeclaration(declaration) || isParameter(declaration)) &&
        isIdentifier(declaration.name) &&
        declaration.initializer !== undefined
      ) {
        const { root, members: aliased } = decomposeChain(
          skipOuterExpressions(declaration.initializer),
        );
        if (this.#environmentPath(root, aliased)?.length === 0) return members;
      }
    }
    return undefined;
  }

  #environmentRead(resolution: ChainResolution, expression: ts.Expression): void {
    if (isAssignmentTarget(expression)) return;
    let path = this.#environmentPath(resolution.root, resolution.members);
    if (path === undefined && resolution.status === "untyped" && isIdentifier(resolution.root)) {
      path = this.#environmentAliasPath(resolution.root, resolution.members);
    }
    const name = path?.[0];
    if (name !== undefined)
      this.#fact("environment-read", resolution.root, { name: truncate(name) });
  }

  /**
   * `const { A, B: b } = process.env` reads `A` and `B`, each from the symbol its binding declares (at the
   * top level) or else from the enclosing symbol.
   */
  #environmentDestructuring(node: ts.VariableDeclaration): void {
    if (!isObjectBindingPattern(node.name) || node.initializer === undefined) return;
    const { root, members } = decomposeChain(skipOuterExpressions(node.initializer));
    const path = this.#environmentPath(root, members);
    if (path === undefined || path.length > 0) return;
    for (const element of node.name.elements) {
      if (element.dotDotDotToken !== undefined) continue;
      const key = element.propertyName ?? element.name;
      const name = isIdentifier(key)
        ? key.text
        : isComputedPropertyName(key)
          ? literalText(skipOuterExpressions(key.expression))
          : isStringLiteral(key) || isNumericLiteral(key)
            ? key.text
            : undefined;
      if (name === undefined) continue;
      const owner = this.#declarations.ownerOf(element)?.localName ?? this.#from;
      this.#fact("environment-read", key, { name: truncate(name) }, owner);
    }
  }

  /** Calls of the global `fetch(url, init?)`. */
  #httpRequest(node: ts.CallExpression): void {
    const callee = skipParentheses(node.expression);
    let isFetch = false;
    if (isIdentifier(callee)) {
      isFetch = callee.text === "fetch" && this.#resolver.isGlobal(callee);
    } else if (isPropertyAccessExpression(callee) && callee.name.text === "fetch") {
      const root = skipParentheses(callee.expression);
      isFetch =
        isIdentifier(root) && GLOBAL_OBJECTS.has(root.text) && this.#resolver.isGlobal(root);
    }
    if (!isFetch) return;
    const attributes: Record<string, string> = { client: "fetch" };
    const urlArgument = node.arguments[0];
    if (urlArgument !== undefined) {
      const url = skipOuterExpressions(urlArgument);
      const text =
        isStringLiteral(url) || isNoSubstitutionTemplateLiteral(url) || isTemplateExpression(url)
          ? templateOrLiteralText(url)
          : undefined;
      if (text !== undefined) {
        attributes.url = truncate(text);
        const host = hostOfUrl(text);
        if (host !== undefined) attributes.host = truncate(host);
      }
    }
    const method = this.#httpMethod(node.arguments[1]);
    if (method !== undefined) attributes.method = method;
    this.#fact("http-request", callee, attributes);
  }

  #httpMethod(init: ts.Expression | undefined): string | undefined {
    if (init === undefined) return "GET";
    const options = skipOuterExpressions(init);
    if (!isObjectLiteralExpression(options)) return undefined;
    let spread = false;
    for (const property of options.properties) {
      if (isSpreadAssignment(property)) spread = true;
      if (
        (isPropertyAssignment(property) || isShorthandPropertyAssignment(property)) &&
        (isIdentifier(property.name) || isStringLiteral(property.name)) &&
        property.name.text === "method"
      ) {
        if (!isPropertyAssignment(property)) return undefined;
        const value = literalText(skipOuterExpressions(property.initializer));
        return value === undefined ? undefined : truncate(value.toUpperCase());
      }
    }
    return spread ? undefined : "GET";
  }

  // ─── JSDoc ─────────────────────────────────────────────────────────────────

  /** The symbol JSDoc on a node documents: the node's own symbol, or the single declaration of a statement. */
  #jsDocOwner(node: ts.Node): string | undefined {
    const own = this.#declarations.ownerOf(node);
    if (own !== undefined) return own.localName;
    if (isVariableStatement(node) && node.declarationList.declarations.length === 1) {
      const declaration = node.declarationList.declarations[0];
      if (declaration !== undefined) {
        const owner = this.#declarations.ownerOf(declaration);
        if (owner !== undefined) return owner.localName;
      }
    }
    if (isExpressionStatement(node)) {
      const value =
        commonJsExportOf(node, (identifier) => this.#resolver.isGlobal(identifier))?.value ??
        assignmentOf(node)?.right;
      const owner = value === undefined ? undefined : this.#declarations.ownerOf(value);
      if (owner !== undefined) return owner.localName;
    }
    return this.#from;
  }

  #visitJsDoc(node: ts.Node): void {
    const comments = jsDocOf(node);
    if (comments.length === 0) return;
    const from = this.#from;
    const owner = this.#jsDocOwner(node);
    for (const comment of comments) {
      for (const tag of comment.tags ?? []) {
        if (isJSDocImportTag(tag)) {
          this.#jsDocImport(tag);
          continue;
        }
        const fileLevel = isJSDocTypedefTag(tag) || isJSDocCallbackTag(tag);
        this.#from = fileLevel ? undefined : owner;
        this.#visitTypes([tag], true);
      }
    }
    this.#from = from;
  }
}

function clauseBindings(clause: ts.ImportClause, forceTypeOnly: boolean): ImportBinding[] {
  const typeOnly = forceTypeOnly || clause.phaseModifier === K.TypeKeyword;
  const bindings: ImportBinding[] = [];
  if (clause.name !== undefined) {
    bindings.push({ local: clause.name.text, imported: "default", typeOnly });
  }
  const named = clause.namedBindings;
  if (named !== undefined) {
    if (isNamespaceImport(named)) {
      bindings.push({ local: named.name.text, imported: "*", typeOnly });
    } else {
      for (const element of named.elements) {
        bindings.push({
          local: element.name.text,
          imported: (element.propertyName ?? element.name).text,
          typeOnly: typeOnly || element.isTypeOnly,
        });
      }
    }
  }
  // Names missing because of syntax errors bind nothing.
  return bindings.filter((binding) => binding.local !== "");
}

function templateOrLiteralText(
  node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression,
): string {
  return isStringLiteral(node) ? node.text : templateText(node);
}

/** Walk a bound source file and record its references, code imports and facts. */
export function walkFile(
  file: ts.SourceFile,
  resolver: Resolver,
  declarations: FileDeclarations,
  options: ResolvedTypeScriptAdapterOptions,
  javascript: boolean,
): WalkResult {
  return new Walker(file, resolver, declarations, options, javascript).walk();
}
