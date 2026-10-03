/**
 * Syntax helpers shared by the extraction passes. Everything here is purely syntactic (no scopes).
 */
import ts from "typescript";
import { MAX_TEXT_LENGTH, collapseWhitespace, truncate } from "./text.js";
import { K } from "./kinds.js";

const {
  canHaveDecorators,
  canHaveModifiers,
  getCombinedNodeFlags,
  getDecorators,
  getModifiers,
  isArrowFunction,
  isAsExpression,
  isAwaitExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isComputedPropertyName,
  isConstructorDeclaration,
  isElementAccessExpression,
  isExpressionStatement,
  isFunctionDeclaration,
  isFunctionExpression,
  isGetAccessorDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isNoSubstitutionTemplateLiteral,
  isNonNullExpression,
  isNumericLiteral,
  isOmittedExpression,
  isParameter,
  isParenthesizedExpression,
  isPrivateIdentifier,
  isPropertyAccessExpression,
  isQualifiedName,
  isSatisfiesExpression,
  isSetAccessorDeclaration,
  isStringLiteral,
  isTypeAssertionExpression,
  isVariableDeclaration,
  isVoidExpression,
} = ts;

/**
 * The operand of an indirect-call comma expression `(0, x)`, which compilers and bundlers (tsc, Babel,
 * esbuild) emit to call an imported function without a `this` value: `(0, lib.f)(a)`. Its value is `x`.
 */
function indirectOperand(node: ts.Expression): ts.Expression | undefined {
  return isBinaryExpression(node) &&
    node.operatorToken.kind === K.CommaToken &&
    isNumericLiteral(node.left)
    ? node.right
    : undefined;
}

/** Strip parentheses, non-null assertions and indirect-call comma expressions (`(x)`, `x!`, `(0, x)`). */
export function skipParentheses(node: ts.Expression): ts.Expression {
  let current = node;
  for (;;) {
    if (isParenthesizedExpression(current) || isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    const operand = indirectOperand(current);
    if (operand === undefined) return current;
    current = operand;
  }
}

/**
 * Strip parentheses, non-null assertions, indirect-call comma expressions and type-level wrappers that do not
 * change the runtime value (`x as T`, `<T>x`, `x satisfies T`).
 */
export function skipOuterExpressions(node: ts.Expression): ts.Expression {
  let current = node;
  for (;;) {
    if (
      isParenthesizedExpression(current) ||
      isNonNullExpression(current) ||
      isAsExpression(current) ||
      isSatisfiesExpression(current) ||
      isTypeAssertionExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    const operand = indirectOperand(current);
    if (operand === undefined) return current;
    current = operand;
  }
}

/** {@link skipOuterExpressions}, also looking through `await`. */
export function skipOuterAndAwait(node: ts.Expression): ts.Expression {
  let current = skipOuterExpressions(node);
  while (isAwaitExpression(current)) current = skipOuterExpressions(current.expression);
  return current;
}

/** The text of a string-like literal (`"x"`, `` `x` ``) or a numeric literal, else undefined. */
export function literalText(node: ts.Node): string | undefined {
  if (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) || isNumericLiteral(node)) {
    return node.text;
  }
  return undefined;
}

/** Text of an identifier or private identifier (`#x` keeps its `#`). */
export function memberNameText(name: ts.MemberName): string {
  return name.text;
}

/** Source text of an expression on one line, bounded. */
export function expressionText(file: ts.SourceFile, node: ts.Node): string {
  return truncate(collapseWhitespace(node.getText(file)), MAX_TEXT_LENGTH);
}

/**
 * The name of a property-like declaration: identifiers and private names as written, string and numeric
 * literals by value, literal computed names (`["x"]`) by value, other computed names as
 * `[<expression text>]`. Blank names are written as JSON strings so that they are never empty.
 */
export function propertyNameText(file: ts.SourceFile, name: ts.PropertyName): string {
  let text: string;
  if (isComputedPropertyName(name)) {
    const literal = literalText(skipOuterExpressions(name.expression));
    text = literal ?? `[${expressionText(file, name.expression)}]`;
  } else if (isIdentifier(name) || isPrivateIdentifier(name)) {
    text = name.text;
  } else {
    text = name.text;
  }
  return text.trim() === "" ? JSON.stringify(text) : text;
}

/** A member access chain decomposed into its root and member names (`a.b["c"]` → `a`, `["b", "c"]`). */
export interface MemberChain {
  readonly root: ts.Expression;
  readonly members: readonly string[];
}

/**
 * Decompose a member access chain: property accesses and element accesses with literal keys, looking
 * through parentheses and non-null assertions. The root is the first expression that is not such an access.
 */
export function decomposeChain(expression: ts.Expression): MemberChain {
  const members: string[] = [];
  let current = skipParentheses(expression);
  for (;;) {
    if (isPropertyAccessExpression(current)) {
      const member = memberNameText(current.name);
      // A missing name (`a.` while typing) is not a member.
      if (member !== "") members.push(member);
      current = skipParentheses(current.expression);
      continue;
    }
    if (isElementAccessExpression(current)) {
      const key = literalText(skipParentheses(current.argumentExpression));
      if (key === undefined) break;
      members.push(key);
      current = skipParentheses(current.expression);
      continue;
    }
    break;
  }
  members.reverse();
  return { root: current, members };
}

/**
 * The node naming the first member a chain accesses on its root (`f().a.b` with root `f()` → `a`): the name of
 * a property access or the key of an element access. Undefined when the chain accesses no member of `root`.
 */
export function firstMemberNode(expression: ts.Expression, root: ts.Node): ts.Node | undefined {
  let current = skipParentheses(expression);
  let first: ts.Node | undefined;
  while (current !== root) {
    if (isPropertyAccessExpression(current)) {
      if (memberNameText(current.name) !== "") first = current.name;
      current = skipParentheses(current.expression);
    } else if (isElementAccessExpression(current)) {
      first = current.argumentExpression;
      current = skipParentheses(current.expression);
    } else {
      return undefined;
    }
  }
  return first;
}

/** Decompose an entity name (`a.b.c` in a type position) into its root identifier and member names. */
export function decomposeEntityName(name: ts.EntityName): {
  root: ts.Identifier;
  members: readonly string[];
} {
  const members: string[] = [];
  let current: ts.EntityName = name;
  while (isQualifiedName(current)) {
    members.push(current.right.text);
    current = current.left;
  }
  members.reverse();
  return { root: current, members };
}

declare const requireCallBrand: unique symbol;
declare const dynamicImportBrand: unique symbol;

/**
 * A call recognized as `require(...)` by syntax. Branded, so that a negative check does not narrow other
 * call expressions away.
 */
export type RequireCall = ts.CallExpression & { readonly [requireCallBrand]: true };

/** A dynamic `import(...)` call (branded like {@link RequireCall}). */
export type DynamicImportCall = ts.CallExpression & { readonly [dynamicImportBrand]: true };

/** A `require(...)` call by syntax (whether `require` is the global one is decided by scope analysis). */
export function isRequireCallSyntax(node: ts.Node): node is RequireCall {
  if (!isCallExpression(node) || node.arguments.length === 0) return false;
  const callee = skipParentheses(node.expression);
  return isIdentifier(callee) && callee.text === "require";
}

/** The `require` identifier of a call accepted by {@link isRequireCallSyntax}. */
export function requireIdentifierOf(call: ts.CallExpression): ts.Identifier | undefined {
  const callee = skipParentheses(call.expression);
  return isIdentifier(callee) ? callee : undefined;
}

/** Whether a call's callee is the identifier `name` or a member named `name` (`createRequire`, `m.createRequire`). */
function calls(call: ts.Expression, name: string): boolean {
  if (!isCallExpression(call)) return false;
  const callee = skipParentheses(call.expression);
  if (isIdentifier(callee)) return callee.text === name;
  return isPropertyAccessExpression(callee) && callee.name.text === name;
}

/**
 * Whether a declaration found for the name `require` binds a module loader rather than an ordinary value:
 * `const require = createRequire(import.meta.url)` (Node.js `module.createRequire`) or the `require` parameter
 * of an AMD factory (`define(function (require, exports, module) { ... })`). Calls of such a `require` load
 * modules, exactly like the CommonJS global (TypeScript collects them as module references as well).
 */
export function isModuleLoaderDeclaration(declaration: ts.Node): boolean {
  if (isVariableDeclaration(declaration)) {
    return (
      isIdentifier(declaration.name) &&
      declaration.name.text === "require" &&
      declaration.initializer !== undefined &&
      calls(skipOuterExpressions(declaration.initializer), "createRequire")
    );
  }
  if (isParameter(declaration)) {
    const factory = declaration.parent;
    return (
      isIdentifier(declaration.name) &&
      declaration.name.text === "require" &&
      (isFunctionExpression(factory) || isArrowFunction(factory)) &&
      isCallExpression(factory.parent) &&
      factory.parent.arguments.includes(factory) &&
      calls(factory.parent, "define")
    );
  }
  return false;
}

/** A dynamic `import(...)` call. */
export function isDynamicImportCall(node: ts.Node): node is DynamicImportCall {
  return isCallExpression(node) && node.expression.kind === K.ImportKeyword;
}

/** A module specifier argument: the literal value, or the source text of a non-literal expression. */
export interface SpecifierArgument {
  readonly specifier: string;
  readonly literal: boolean;
}

/** Read the specifier argument of `require(...)` / `import(...)`. */
export function specifierArgument(
  file: ts.SourceFile,
  argument: ts.Expression | undefined,
): SpecifierArgument | undefined {
  if (argument === undefined) return undefined;
  const unwrapped = skipOuterExpressions(argument);
  if (isStringLiteral(unwrapped) || isNoSubstitutionTemplateLiteral(unwrapped)) {
    return { specifier: unwrapped.text, literal: true };
  }
  return { specifier: expressionText(file, argument), literal: false };
}

/** Whether a node has a syntactic modifier keyword. */
export function hasModifier(node: ts.Node, kind: ts.ModifierSyntaxKind): boolean {
  if (!canHaveModifiers(node)) return false;
  return getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false;
}

/** Decorators of a node in source order. */
export function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return canHaveDecorators(node) ? (getDecorators(node) ?? []) : [];
}

/** Whether a function-like value (arrow function or function expression). */
export function isFunctionValue(
  node: ts.Node | undefined,
): node is ts.ArrowFunction | ts.FunctionExpression {
  return node !== undefined && (isArrowFunction(node) || isFunctionExpression(node));
}

/** Whether a parameter is TypeScript's `this` pseudo-parameter. */
export function isThisParameter(parameter: ts.ParameterDeclaration): boolean {
  return isIdentifier(parameter.name) && parameter.name.text === "this";
}

/** The index of a parameter among the runtime parameters of its function (ignoring `this`). */
export function parameterIndex(parameter: ts.ParameterDeclaration): number {
  const owner = parameter.parent;
  let index = 0;
  for (const candidate of owner.parameters) {
    if (candidate === parameter) return index;
    if (!isThisParameter(candidate)) index += 1;
  }
  return index;
}

/** An element of a destructuring pattern that binds an identifier. */
export interface BoundName {
  readonly element: ts.BindingElement;
  readonly name: ts.Identifier;
}

/** Every identifier bound by a destructuring pattern (nested patterns included), in source order. */
export function boundNames(pattern: ts.BindingPattern): BoundName[] {
  const result: BoundName[] = [];
  const visit = (current: ts.BindingPattern): void => {
    for (const element of current.elements) {
      if (isOmittedExpression(element)) continue;
      if (isIdentifier(element.name)) result.push({ element, name: element.name });
      else visit(element.name);
    }
  };
  visit(pattern);
  return result;
}

/** The root declaration of a binding element (walking up nested patterns). */
export function bindingRoot(
  element: ts.BindingElement,
): ts.VariableDeclaration | ts.ParameterDeclaration | ts.BindingElement {
  let current: ts.Node = element.parent.parent;
  while (isBindingElement(current)) current = current.parent.parent;
  return current as ts.VariableDeclaration | ts.ParameterDeclaration;
}

/** Whether a function-like node has a body (an implementation as opposed to an overload signature). */
export function hasBody(node: ts.Node): boolean {
  return (
    (isFunctionDeclaration(node) ||
      isMethodDeclaration(node) ||
      isConstructorDeclaration(node) ||
      isGetAccessorDeclaration(node) ||
      isSetAccessorDeclaration(node) ||
      isFunctionExpression(node) ||
      isArrowFunction(node)) &&
    node.body !== undefined
  );
}

/** Whether a JSX tag name denotes an intrinsic element (`div`, `my-element`), like TypeScript decides. */
export function isIntrinsicJsxName(name: string): boolean {
  const first = name.charCodeAt(0);
  return (first >= 0x61 && first <= 0x7a) || name.includes("-");
}

/** The left-hand side target of a CommonJS export assignment (`module.exports = ...`, `exports.x = ...`). */
export type CommonJsAssignmentTarget =
  | { readonly kind: "module"; readonly root: ts.Identifier }
  | { readonly kind: "property"; readonly name: string; readonly root: ts.Identifier };

/**
 * Recognize `module.exports`, `module.exports.x` and `exports.x` (also with literal element access) on the
 * left of an assignment. Whether `module`/`exports` are the CommonJS globals is decided by scope analysis.
 */
export function commonJsAssignmentTarget(
  left: ts.Expression,
): CommonJsAssignmentTarget | undefined {
  const { root, members } = decomposeChain(left);
  if (!isIdentifier(root)) return undefined;
  if (root.text === "module" && members[0] === "exports") {
    if (members.length === 1) return { kind: "module", root };
    const name = members[1];
    if (members.length === 2 && name !== undefined && name !== "") {
      return { kind: "property", name, root };
    }
    return undefined;
  }
  const name = members[0];
  if (root.text === "exports" && members.length === 1 && name !== undefined && name !== "") {
    return { kind: "property", name, root };
  }
  return undefined;
}

/** The value a chain of CommonJS export assignments assigns, and the nested assignment targets. */
export interface ExportAssignmentChain {
  /** The value finally assigned (`v` in `exports.a = exports.b = v`). */
  readonly value: ts.Expression;
  /** The nested targets (`exports.b`), which are written rather than read. */
  readonly targets: readonly ts.Expression[];
}

/**
 * Look through nested CommonJS export assignments in an assigned value: `exports.a = exports.b = void 0`, as
 * compilers emit to declare every export up front. `isGlobal` decides whether `module`/`exports` are the
 * CommonJS globals.
 */
export function exportAssignmentChain(
  value: ts.Expression,
  isGlobal: (identifier: ts.Identifier) => boolean,
): ExportAssignmentChain {
  const targets: ts.Expression[] = [];
  let current = value;
  for (;;) {
    const nested = skipParentheses(current);
    if (!isBinaryExpression(nested) || nested.operatorToken.kind !== K.EqualsToken) break;
    const target = commonJsAssignmentTarget(nested.left);
    if (target === undefined || !isGlobal(target.root)) break;
    targets.push(skipParentheses(nested.left));
    current = nested.right;
  }
  return { value: current, targets };
}

/** A top-level CommonJS export assignment (see {@link commonJsExportOf}). */
export interface CommonJsExport {
  readonly target: CommonJsAssignmentTarget;
  /** The expression naming the export: `module.exports`, `exports.x` or `module.exports.x`. */
  readonly left: ts.Expression;
  /** The value assigned to it. */
  readonly value: ts.Expression;
}

/** The `x = y` assignment an expression is, looking through parentheses. */
function assignmentExpression(node: ts.Expression): ts.BinaryExpression | undefined {
  const expression = skipParentheses(node);
  return isBinaryExpression(expression) && expression.operatorToken.kind === K.EqualsToken
    ? expression
    : undefined;
}

/** Whether an expression is the identifier `exports` denoting the CommonJS global. */
function isExportsGlobal(
  node: ts.Expression,
  isGlobal: (identifier: ts.Identifier) => boolean,
): boolean {
  const expression = skipParentheses(node);
  return isIdentifier(expression) && expression.text === "exports" && isGlobal(expression);
}

/**
 * The CommonJS export a top-level statement makes: `module.exports = value`, `exports.x = value` and
 * `module.exports.x = value`, also when the export assignment rebinds the `exports` variable at the same
 * time, as Express does: `exports = module.exports = createApplication` and `module.exports = exports =
 * value` assign `value` to `module.exports`. Rebinding `exports` alone (`exports = value`) exports nothing.
 * The extraction takes `exports` for an alias of `module.exports` throughout the file (`exports.x = ...`
 * stays an export of `x`), which the rebinding makes true. `isGlobal` decides whether `module` and
 * `exports` are the CommonJS globals.
 */
export function commonJsExportOf(
  statement: ts.Statement,
  isGlobal: (identifier: ts.Identifier) => boolean,
): CommonJsExport | undefined {
  const assignment = assignmentOf(statement);
  if (assignment === undefined) return undefined;
  if (isExportsGlobal(assignment.left, isGlobal)) {
    // `exports = module.exports = value`
    const inner = assignmentExpression(assignment.right);
    const target = inner === undefined ? undefined : commonJsAssignmentTarget(inner.left);
    if (inner === undefined || target?.kind !== "module" || !isGlobal(target.root))
      return undefined;
    return { target, left: inner.left, value: inner.right };
  }
  const target = commonJsAssignmentTarget(assignment.left);
  if (target === undefined || !isGlobal(target.root)) return undefined;
  const inner = target.kind === "module" ? assignmentExpression(assignment.right) : undefined;
  // `module.exports = exports = value`
  const value =
    inner !== undefined && isExportsGlobal(inner.left, isGlobal) ? inner.right : assignment.right;
  return { target, left: assignment.left, value };
}

/** `void 0` (any `void` of a literal): the placeholder value compilers assign to exports before their values. */
export function isVoidLiteral(node: ts.Expression): boolean {
  const unwrapped = skipParentheses(node);
  return (
    isVoidExpression(unwrapped) && literalText(skipParentheses(unwrapped.expression)) !== undefined
  );
}

/** A top-level `x = y` assignment expression statement. */
export function assignmentOf(statement: ts.Statement): ts.BinaryExpression | undefined {
  if (!isExpressionStatement(statement)) return undefined;
  const expression = skipParentheses(statement.expression);
  if (isBinaryExpression(expression) && expression.operatorToken.kind === K.EqualsToken) {
    return expression;
  }
  return undefined;
}

/** Whether a variable declaration list is `const`, `using` or `await using`. */
export function variableKeyword(
  declaration: ts.VariableDeclaration,
): "const" | "let" | "var" | "using" | "await using" {
  const flags = getCombinedNodeFlags(declaration);
  if ((flags & ts.NodeFlags.Using) !== 0) {
    return (flags & ts.NodeFlags.Const) !== 0 ? "await using" : "using";
  }
  if ((flags & ts.NodeFlags.Const) !== 0) return "const";
  if ((flags & ts.NodeFlags.Let) !== 0) return "let";
  return "var";
}

/**
 * The parent of a node, or undefined for a source file. (TypeScript's typings declare `parent` as always
 * present, but a source file has none.)
 */
export function parentOf(node: ts.Node): ts.Node | undefined {
  return node.parent;
}
