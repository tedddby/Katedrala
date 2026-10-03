/**
 * Declaration signatures: the head of a declaration on a single line (whitespace collapsed, comments
 * removed), without its body, its decorators and the `export`, `default` and `declare` keywords (which are
 * recorded as exports and modifiers), at most 200 characters.
 *
 * Examples: `class OrderService extends Base implements IOrders`, `async charge(amount: number): Promise<R>`,
 * `type Id = string | number`, `const PORT: number`, `private readonly repo: Repo`.
 */
import ts from "typescript";
import { singleLine, truncateWithEllipsis } from "./text.js";
import { K } from "./kinds.js";

const {
  canHaveModifiers,
  getDecorators,
  isArrowFunction,
  isClassExpression,
  isDecorator,
  isFunctionExpression,
  isFunctionLike,
  isMethodDeclaration,
  isModuleDeclaration,
  isPropertyDeclaration,
  isStringLiteral,
} = ts;

const OMITTED_KEYWORDS = new Set<ts.SyntaxKind>([
  K.ExportKeyword,
  K.DefaultKeyword,
  K.DeclareKeyword,
]);

function finish(text: string): string | undefined {
  // Collapsing a multi-line parameter list leaves `( a, b, )`: tidy it to `(a, b)`.
  let result = text
    .replace(/\(\s+/g, "(")
    .replace(/,\s*\)/g, ")")
    .replace(/\s+\)/g, ")");
  if (result.endsWith(";")) result = result.slice(0, -1).trimEnd();
  if (result.endsWith("=>")) result = result.slice(0, -2).trimEnd();
  return result === "" ? undefined : truncateWithEllipsis(result);
}

/** Text of `[start, end)` without the given nodes (e.g. parameter decorators). */
function textWithout(
  file: ts.SourceFile,
  start: number,
  end: number,
  excluded: readonly ts.Node[],
): string {
  let text = "";
  let position = start;
  for (const node of excluded) {
    const from = node.getStart(file);
    if (from < position || node.end > end) continue;
    text += `${file.text.slice(position, from)} `;
    position = node.end;
  }
  return text + file.text.slice(position, Math.max(position, end));
}

/** Decorators of a function-like node's parameters, in source order. */
function parameterDecorators(node: ts.Node): ts.Decorator[] {
  if (!isFunctionLike(node)) return [];
  return node.parameters.flatMap((parameter) => [...(getDecorators(parameter) ?? [])]);
}

/**
 * The head of a node from its first kept modifier to `end`, without decorators (its own and its
 * parameters') and omitted keywords.
 */
function head(file: ts.SourceFile, node: ts.Node, end: number): string {
  const modifiers = canHaveModifiers(node) ? node.modifiers : undefined;
  const parts: string[] = [];
  let rest = node.getStart(file);
  if (modifiers !== undefined && modifiers.length > 0) {
    for (const modifier of modifiers) {
      if (isDecorator(modifier) || OMITTED_KEYWORDS.has(modifier.kind)) continue;
      parts.push(modifier.getText(file));
    }
    rest = Math.max(rest, modifiers.end);
  }
  parts.push(textWithout(file, rest, end, parameterDecorators(node)));
  return singleLine(parts.join(" "));
}

/** Position of the `{` opening a class, interface or enum body, or the node's end. */
function bodyBrace(file: ts.SourceFile, node: ts.Node, members: ts.NodeArray<ts.Node>): number {
  const brace = members.pos - 1;
  return brace > node.getStart(file) && file.text.charCodeAt(brace) === 0x7b ? brace : node.end;
}

/** End of a function-like head: the start of its body, or the end of the node. */
function functionHeadEnd(file: ts.SourceFile, node: ts.SignatureDeclaration): number {
  const body = (node as ts.SignatureDeclaration & { readonly body?: ts.Node }).body;
  return body === undefined ? node.end : body.getStart(file);
}

/** End of a value head: the start of a function body or the `{` of a class, else the value's end. */
function valueHeadEnd(file: ts.SourceFile, value: ts.Expression): number {
  if (isArrowFunction(value) || isFunctionExpression(value)) {
    return functionHeadEnd(file, value);
  }
  if (isClassExpression(value)) return bodyBrace(file, value, value.members);
  return value.end;
}

/** Signature of a function, method, constructor, accessor or call signature. */
export function functionSignature(
  file: ts.SourceFile,
  node: ts.SignatureDeclaration,
): string | undefined {
  return finish(head(file, node, functionHeadEnd(file, node)));
}

/** Signature of a class, interface or enum declaration (up to its body). */
export function typeDeclarationSignature(
  file: ts.SourceFile,
  node: ts.ClassLikeDeclaration | ts.InterfaceDeclaration | ts.EnumDeclaration,
): string | undefined {
  return finish(head(file, node, bodyBrace(file, node, node.members)));
}

/** Signature of a type alias: the whole declaration. */
export function typeAliasSignature(
  file: ts.SourceFile,
  node: ts.TypeAliasDeclaration,
): string | undefined {
  return finish(head(file, node, node.end));
}

/** Signature of a namespace (`namespace A.B`) or ambient module (`module "x"`). */
export function moduleSignature(
  node: ts.ModuleDeclaration,
  dottedName: string,
): string | undefined {
  if (isStringLiteral(node.name)) return finish(`module ${JSON.stringify(node.name.text)}`);
  let outermost = node;
  while (
    (outermost.flags & ts.NodeFlags.NestedNamespace) !== 0 &&
    isModuleDeclaration(outermost.parent)
  ) {
    outermost = outermost.parent;
  }
  const keyword = (outermost.flags & ts.NodeFlags.Namespace) !== 0 ? "namespace" : "module";
  return finish(`${keyword} ${dottedName}`);
}

/** Signature of a class property or a constructor parameter property (without its initializer). */
export function propertySignature(
  file: ts.SourceFile,
  node: ts.PropertyDeclaration | ts.ParameterDeclaration,
): string | undefined {
  const marker = isPropertyDeclaration(node)
    ? (node.questionToken ?? node.exclamationToken)
    : node.questionToken;
  const end = node.type?.end ?? marker?.end ?? node.name.end;
  return finish(head(file, node, end));
}

/**
 * Signature of a variable: `const x: T` for values, `const f = async (a: A): R` for function values,
 * `const C = class extends B` for class values.
 */
export function variableSignature(
  file: ts.SourceFile,
  keyword: string,
  declaration: ts.VariableDeclaration,
  value: ts.Expression | undefined,
): string | undefined {
  if (value !== undefined && (isFunctionLike(value) || isClassExpression(value))) {
    const text = file.text.slice(declaration.name.getStart(file), valueHeadEnd(file, value));
    return finish(`${keyword} ${singleLine(text)}`);
  }
  const type =
    declaration.type === undefined ? "" : `: ${singleLine(declaration.type.getText(file))}`;
  return finish(`${keyword} ${singleLine(declaration.name.getText(file))}${type}`);
}

/** Signature of a name bound by a destructuring declaration: `const name`. */
export function bindingSignature(keyword: string, name: string): string | undefined {
  return finish(`${keyword} ${name}`);
}

/**
 * Signature of a value assigned by an expression statement or an export (`exports.x = function (a)`,
 * `module.exports = class extends B`), from `start` to the head of a function or class value, or of the
 * assignment target alone for other values.
 */
export function assignedValueSignature(
  file: ts.SourceFile,
  start: number,
  target: ts.Node | undefined,
  value: ts.Expression,
): string | undefined {
  if (isFunctionLike(value) || isClassExpression(value)) {
    return finish(singleLine(file.text.slice(start, valueHeadEnd(file, value))));
  }
  return target === undefined ? undefined : finish(singleLine(target.getText(file)));
}

/** Signature of an object literal member exported through `module.exports = { ... }`. */
export function objectMemberSignature(
  file: ts.SourceFile,
  member: ts.PropertyAssignment | ts.MethodDeclaration,
): string | undefined {
  if (isMethodDeclaration(member)) return functionSignature(file, member);
  const value = member.initializer;
  return finish(singleLine(file.text.slice(member.getStart(file), valueHeadEnd(file, value))));
}
