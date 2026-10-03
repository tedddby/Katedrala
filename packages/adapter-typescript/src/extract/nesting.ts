/**
 * Nesting limits that keep TypeScript's parser and binder well inside the stack of any thread, so that what a
 * file's extraction yields does not depend on where it runs.
 *
 * TypeScript's parser and binder recurse along the syntax tree, and the JavaScript engine bounds the stack:
 * 984 KB on the main thread and 4 MB in a worker thread (Node.js defaults). How deeply a file may be nested
 * before they exhaust it therefore depends on the thread, and also on the Node.js version and on how much of
 * the code the JIT has optimized. Measured with this adapter (cold JIT, Node.js 25.6 and 22.23, x64; the
 * deepest input that still worked):
 *
 * | Construct                                | Parser, main | Binder, main | Parser, worker | Binder, worker |
 * | ---------------------------------------- | -----------: | -----------: | -------------: | -------------: |
 * | `||` chain (operands)                     |    unlimited |          780 |      unlimited |          3,232 |
 * | call chain `q.a().a()` (links)            |    unlimited |          592 |      unlimited |          2,448 |
 * | nested tuple types `[[...]]`              |          460 |            - |          1,888 |              - |
 * | nested type arguments `A<A<...>>`         |          508 |            - |          2,096 |              - |
 * | `a < a < ...` in TypeScript (operators)   |          512 |    unlimited |          2,112 |      unlimited |
 * | nested arrays, parentheses, call args     |      600-680 |            - |    2,480-2,800 |              - |
 * | nested blocks                             |        1,792 |        1,112 |          7,360 |          4,672 |
 * | `if (a) {} else if` chain (branches)      |        3,456 |        2,560 |         16,768 |         11,776 |
 * | `a ? 1 : a ? ...` chain                   |        2,560 |        2,560 |         16,896 |         11,328 |
 * | `a = a = ...` chain                       |        5,984 |    unlimited |         24,704 |      unlimited |
 *
 * ("-": the parser fails first; the binder then uses less stack per level than the parser.) So the same file
 * could be extracted without scopes (`partial`) in the main thread and completely in a worker thread, or fail
 * to parse in one and parse in the other. Warm (optimized) code goes 1.5 to 3 times deeper than cold code;
 * Node.js 22 is up to 40% shallower than Node.js 25 for some constructs (conditional types, JSX).
 *
 * Instead, the nesting of every parsed file is measured before binding, by a walk with its own stack: each
 * edge of the syntax tree weighs about the stack the parser (respectively the binder) uses to descend it, in
 * units of 0.3 KB, rounded up; edges whose construct was not measured get the weight of the most expensive
 * edge measured (a level of nested tuple types, about 2 KB). The heaviest path from the root is the file's
 * nesting, and fixed limits decide, identically everywhere:
 * - nesting by the binder's weights over {@link MAX_BINDING_NESTING}: the file is not bound and is extracted
 *   without scopes (`partial`, with a diagnostic);
 * - nesting by the parser's weights over {@link MAX_PARSING_NESTING}: the file is not analyzed (`failed`),
 *   exactly as when the parser exhausts the stack, which then never happens below the limit.
 *
 * Both limits are 1,000 units, about 300 KB of stack. The weights per construct (in the comments below) are
 * the stack each level needs at that depth: for 76 constructs (those of the table among them), files nested
 * up to the limits were parsed, bound and extracted with the smallest main-thread stack that still
 * worked (`node --stack-size`, cold, Node.js 22.23 and 25.6). None needed more than 328 KB, including the
 * 60 KB Node.js itself uses: a margin of 3.0 or more on the main thread, and of 12 or more in a worker thread.
 * (Per level, shallow nesting costs more than the deepest working nesting suggests: during a very deep
 * recursion the JIT optimizes the frames.) Within the limits: 200 `||` operands, 166 links of a call chain,
 * 125 levels of nested arrays, call arguments or type arguments, 500 levels of `? :`, 1,000 of `else if` and
 * of `a = b = ...` (500 of `else if` within the limit for binding); long chains of `+`, `,` and `.`
 * operations cost nothing (both iterate over them).
 *
 * The measurement is exact for what the parser commits to. TypeScript's parser also speculates: in a
 * TypeScript file, `<` after an expression is first read as the start of type arguments (`f<T>(x)`), and an
 * ambiguous `(` as the start of an arrow function's parameters, and the attempt is discarded when it fails.
 * Chains of `<` comparisons are weighed for it (see {@link LESS_THAN_SPECULATION}); other discarded attempts
 * leave no trace in the tree (see the residual risk in docs/ARCHITECTURE.md).
 */
import ts from "typescript";
import { jsDocOf } from "./ts-internals.js";

const S = ts.SyntaxKind;

/** Limit of the nesting measured with the parser's weights (units of about 0.3 KB of stack). */
export const MAX_PARSING_NESTING = 1000;

/** Limit of the nesting measured with the binder's weights (units of about 0.3 KB of stack). */
export const MAX_BINDING_NESTING = 1000;

/**
 * Weight of every edge not listed below: at least the most expensive edge measured (2.4 KB; a level of nested
 * tuple types takes 1.98 KB of parser stack, of type arguments 1.81 KB, of call arguments 1.48 KB, of arrays
 * 1.38 KB).
 */
const HEAVY = 8;

/**
 * Parser weight per `<` (or `<<`) of a chain of comparisons in a TypeScript file, beyond the first: each one
 * is a level of the attempt to read the rest of the chain as type arguments (1.78 KB of stack per level).
 */
const LESS_THAN_SPECULATION = 7;

/** The nesting of a file: the heaviest path from the root by the parser's and by the binder's weights. */
export interface Nesting {
  readonly parsing: number;
  readonly binding: number;
}

/** Why a file nested beyond {@link MAX_PARSING_NESTING} is not analyzed (whether or not it parsed). */
export const NESTED_TOO_DEEPLY_TO_PARSE =
  'the file is nested beyond the limit for parsing (see "Nesting limits" in docs/ARCHITECTURE.md)';

/** Why a file nested beyond {@link MAX_BINDING_NESTING} is extracted without scopes. */
export const NESTED_TOO_DEEPLY_TO_BIND =
  'the file is nested beyond the limit for binding (see "Nesting limits" in docs/ARCHITECTURE.md)';

/** Whether an error is the JavaScript engine's stack overflow. */
export function isStackOverflow(error: unknown): boolean {
  return error instanceof RangeError && /call stack/i.test(error.message);
}

const UNARY = new Set<ts.SyntaxKind>([
  S.PrefixUnaryExpression,
  S.TypeOfExpression,
  S.VoidExpression,
  S.DeleteExpression,
  S.AwaitExpression,
]);

/** Statements that nest a statement: the branches of an `if`, the body of a loop or of a label. */
const STATEMENTS_WITH_BODIES: readonly ts.SyntaxKind[] = [
  S.IfStatement,
  S.LabeledStatement,
  S.WhileStatement,
  S.DoStatement,
  S.ForStatement,
  S.ForInStatement,
  S.ForOfStatement,
];

/** Statements whose nesting in one another the parser's weights treat as a chain. */
const STATEMENT_CHAINS = new Set<ts.SyntaxKind>([...STATEMENTS_WITH_BODIES, S.Block]);

const LOGICAL = new Set<ts.SyntaxKind>([
  S.AmpersandAmpersandToken,
  S.BarBarToken,
  S.QuestionQuestionToken,
  S.AmpersandAmpersandEqualsToken,
  S.BarBarEqualsToken,
  S.QuestionQuestionEqualsToken,
]);

/** Nodes whose `expression` child extends a chain the parser builds in a loop (`a.b`, `a[0]`, `a()`, ...). */
const ACCESS_CHAINS = new Set<ts.SyntaxKind>([
  S.PropertyAccessExpression,
  S.ElementAccessExpression,
  S.CallExpression,
  S.NonNullExpression,
  S.ExpressionWithTypeArguments,
  S.AsExpression,
  S.SatisfiesExpression,
]);

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= S.FirstAssignment && kind <= S.LastAssignment;
}

function isBinary(node: ts.Node, operator?: ts.SyntaxKind): node is ts.BinaryExpression {
  return (
    node.kind === S.BinaryExpression &&
    (operator === undefined || (node as ts.BinaryExpression).operatorToken.kind === operator)
  );
}

function isLessThan(node: ts.Node): node is ts.BinaryExpression {
  if (node.kind !== S.BinaryExpression) return false;
  const operator = (node as ts.BinaryExpression).operatorToken.kind;
  return operator === S.LessThanToken || operator === S.LessThanLessThanToken;
}

/** `[a] = b` and `({ a } = b)`, which the binder binds recursively. */
function isDestructuring(node: ts.Node): boolean {
  if (!isBinary(node, S.EqualsToken)) return false;
  const left = node.left.kind;
  return left === S.ObjectLiteralExpression || left === S.ArrayLiteralExpression;
}

/** Whether `child` is the statement a statement with a body nests (see {@link STATEMENTS_WITH_BODIES}). */
function isNestedStatement(parent: ts.Node, child: ts.Node): boolean {
  if (parent.kind === S.IfStatement) {
    const statement = parent as ts.IfStatement;
    return child === statement.thenStatement || child === statement.elseStatement;
  }
  return child === (parent as ts.IterationStatement | ts.LabeledStatement).statement;
}

function isConditionalBranch(parent: ts.Node, child: ts.Node): boolean {
  const conditional = parent as ts.ConditionalExpression;
  return child === conditional.whenTrue || child === conditional.whenFalse;
}

function isConditionalTypeBranch(parent: ts.Node, child: ts.Node): boolean {
  const conditional = parent as ts.ConditionalTypeNode;
  return child === conditional.trueType || child === conditional.falseType;
}

/**
 * The stack (in units of about 0.3 KB) to descend from `parent` to `child`. `lessThanRun` is the number of `<`
 * comparisons of the chain `parent` ends (0 unless `parent` is one), counted in TypeScript files only.
 */
type Weight = (parent: ts.Node, child: ts.Node, lessThanRun: number) => number;

/** Parser weights of the children of nodes, by the parent's syntax kind ({@link HEAVY} when absent). */
const PARSING: Array<Weight | undefined> = [];

/** Binder weights of the children of nodes, by the parent's syntax kind ({@link HEAVY} when absent). */
const BINDING: Array<Weight | undefined> = [];

function weigh(
  table: Array<Weight | undefined>,
  kinds: Iterable<ts.SyntaxKind>,
  weight: Weight,
): void {
  for (const kind of kinds) table[kind] = weight;
}

// The parser's weights. Chains it builds in a loop cost nothing.
weigh(PARSING, ACCESS_CHAINS, (parent, child) =>
  child === (parent as ts.PropertyAccessExpression).expression ? 0 : HEAVY,
);
weigh(PARSING, [S.TaggedTemplateExpression], (parent, child) =>
  child === (parent as ts.TaggedTemplateExpression).tag ? 0 : HEAVY,
);
weigh(PARSING, [S.ArrayType], () => 0);
weigh(PARSING, [S.IndexedAccessType], (parent, child) =>
  child === (parent as ts.IndexedAccessTypeNode).objectType ? 0 : HEAVY,
);
weigh(PARSING, [S.QualifiedName], (parent, child) =>
  child === (parent as ts.QualifiedName).left ? 0 : HEAVY,
);
weigh(PARSING, [S.BinaryExpression], (parent, child, lessThanRun) => {
  const binary = parent as ts.BinaryExpression;
  // The left operand is parsed before the operator: chains of binary operations are loops.
  if (child === binary.left) return 0;
  const operator = binary.operatorToken.kind;
  // `a = b = c` (0.15 KB per level) and `a ** b ** c` (0.42 KB) nest to the right.
  if (isAssignmentOperator(operator)) {
    return isBinary(child) && isAssignmentOperator(child.operatorToken.kind) ? 1 : HEAVY;
  }
  if (operator === S.AsteriskAsteriskToken) {
    return isBinary(child, S.AsteriskAsteriskToken) ? 2 : HEAVY;
  }
  return HEAVY + LESS_THAN_SPECULATION * Math.max(0, lessThanRun - 1);
});
// `a ? b : c ? d : e` (0.37 KB per level; `a ? b ? c : d : e`, 0.56 KB).
weigh(PARSING, [S.ConditionalExpression], (parent, child) =>
  isConditionalBranch(parent, child) && child.kind === S.ConditionalExpression ? 2 : HEAVY,
);
// `!!x`, `typeof await x` (0.31 KB per level).
weigh(PARSING, UNARY, (_parent, child) => (UNARY.has(child.kind) ? 2 : HEAVY));
// `yield yield x` (0.28 KB per level).
weigh(PARSING, [S.YieldExpression], (_parent, child) =>
  child.kind === S.YieldExpression ? 1 : HEAVY,
);
// `new new X` (0.23 KB per level); arguments are heavy.
weigh(PARSING, [S.NewExpression], (parent, child) =>
  child === (parent as ts.NewExpression).expression && child.kind === S.NewExpression ? 1 : HEAVY,
);
// `if (a) {} else if`, `for (;;) for (;;)`, labels (0.24 to 0.27 KB per level).
weigh(PARSING, STATEMENTS_WITH_BODIES, (parent, child) =>
  isNestedStatement(parent, child) && STATEMENT_CHAINS.has(child.kind) ? 1 : HEAVY,
);
// Nested blocks (0.50 KB per level) and functions (0.49 KB per edge, with the next rule).
weigh(PARSING, [S.Block], (_parent, child) =>
  child.kind === S.Block || child.kind === S.FunctionDeclaration ? 2 : HEAVY,
);
weigh(PARSING, [S.FunctionDeclaration], (parent, child) =>
  child === (parent as ts.FunctionDeclaration).body ? 2 : HEAVY,
);
// Nested namespaces (0.53 KB per edge, with the next rule).
weigh(PARSING, [S.ModuleDeclaration], (parent, child) =>
  child === (parent as ts.ModuleDeclaration).body ? 2 : HEAVY,
);
weigh(PARSING, [S.ModuleBlock], (_parent, child) =>
  child.kind === S.ModuleDeclaration ? 2 : HEAVY,
);
// Nested JSX elements (0.58 KB per level).
weigh(PARSING, [S.JsxElement, S.JsxFragment], (_parent, child) =>
  child.kind === S.JsxElement || child.kind === S.JsxFragment ? 3 : HEAVY,
);
// `T extends 0 ? 0 : T extends 1 ? ...` (0.35 KB per level).
weigh(PARSING, [S.ConditionalType], (parent, child) =>
  isConditionalTypeBranch(parent, child) && child.kind === S.ConditionalType ? 2 : HEAVY,
);
// `keyof keyof T` (0.21 KB per level).
weigh(PARSING, [S.TypeOperator], (_parent, child) => (child.kind === S.TypeOperator ? 1 : HEAVY));

// The binder's weights.
weigh(BINDING, ACCESS_CHAINS, (parent, child) => {
  if (child !== (parent as ts.PropertyAccessExpression).expression) return HEAVY;
  // `a.b().c` (0.59 to 0.73 KB per edge); optional chains `a?.b()` (0.81 KB).
  return (parent.flags & ts.NodeFlags.OptionalChain) !== 0 ? 4 : 3;
});
weigh(BINDING, [S.BinaryExpression], (parent, child) => {
  const binary = parent as ts.BinaryExpression;
  if (child !== binary.left && child !== binary.right) return HEAVY;
  // Operands of `&&`, `||` and `??` are bound recursively (1.12 KB per level).
  if (LOGICAL.has(binary.operatorToken.kind)) return 5;
  // Other nested binary operations are bound by a loop (`a + b + c`, `a = b = c`, `a, b, c`).
  return isBinary(child) && !isDestructuring(binary) && !isDestructuring(child) ? 0 : HEAVY;
});
// `a ? b : c ? d : e` (0.37 KB per level).
weigh(BINDING, [S.ConditionalExpression], (parent, child) =>
  isConditionalBranch(parent, child) && child.kind === S.ConditionalExpression ? 2 : HEAVY,
);
// `!!x`, `typeof await x`, `yield yield x` (0.53 to 0.62 KB per level).
weigh(BINDING, [...UNARY, S.YieldExpression], () => 3);
// `new new X` (0.53 KB per level); arguments are heavy.
weigh(BINDING, [S.NewExpression], (parent, child) =>
  child === (parent as ts.NewExpression).expression ? 3 : HEAVY,
);
// `else if` chains, labels (0.32 to 0.34 KB per level), `while` and `do` (0.46 KB).
weigh(
  BINDING,
  [S.IfStatement, S.LabeledStatement, S.WhileStatement, S.DoStatement],
  (parent, child) => (isNestedStatement(parent, child) ? 2 : HEAVY),
);
// Nested `for` loops (0.67 KB per level).
weigh(BINDING, [S.ForStatement, S.ForInStatement, S.ForOfStatement], (parent, child) =>
  isNestedStatement(parent, child) ? 3 : HEAVY,
);
// Nested blocks (0.72 KB per level) and functions (0.75 KB per edge, with the next rule).
weigh(BINDING, [S.Block], (_parent, child) =>
  child.kind === S.Block || child.kind === S.FunctionDeclaration ? 3 : HEAVY,
);
weigh(BINDING, [S.FunctionDeclaration], (parent, child) =>
  child === (parent as ts.FunctionDeclaration).body ? 3 : HEAVY,
);
// Nested namespaces (0.72 KB per edge, with the next rule).
weigh(BINDING, [S.ModuleDeclaration], (parent, child) =>
  child === (parent as ts.ModuleDeclaration).body ? 3 : HEAVY,
);
weigh(BINDING, [S.ModuleBlock], (_parent, child) =>
  child.kind === S.ModuleDeclaration ? 3 : HEAVY,
);
// Nested JSX elements (0.81 KB per level).
weigh(BINDING, [S.JsxElement, S.JsxFragment], (_parent, child) =>
  child.kind === S.JsxElement || child.kind === S.JsxFragment ? 4 : HEAVY,
);
// Conditional types nested in their branches (0.50 KB per level).
weigh(BINDING, [S.ConditionalType], (parent, child) =>
  isConditionalTypeBranch(parent, child) ? 3 : HEAVY,
);
// `keyof keyof T`, `T[][]` (0.53 KB per level).
weigh(BINDING, [S.TypeOperator, S.ArrayType], () => 3);

/** Length of the chain of `<` comparisons that ends at `node` (`a < b < c` → 2 at its root). */
function lessThanRunOf(node: ts.Node): number {
  let run = 0;
  for (let current: ts.Node = node; isLessThan(current); current = current.left) run += 1;
  return run;
}

/**
 * Measure the nesting of a parsed file, without recursion (see the module documentation).
 *
 * @param typeScript - whether the file is parsed as TypeScript (not JavaScript), where the parser speculates
 *   on type arguments.
 */
export function measureNesting(file: ts.SourceFile, typeScript: boolean): Nesting {
  const javascript = !typeScript;
  let parsing = 0;
  let binding = 0;
  // Pending nodes, and per node the weights of its path and, for `<` comparisons, the length of their chain.
  const nodes: ts.Node[] = [file];
  const costs: number[] = [0, 0, 0];
  let parent: ts.Node = file;
  let parentParsingWeight: Weight | undefined;
  let parentBindingWeight: Weight | undefined;
  let parentParsing = 0;
  let parentBinding = 0;
  let parentRun = 0;
  const push = (child: ts.Node): undefined => {
    const childParsing = parentParsing + (parentParsingWeight?.(parent, child, parentRun) ?? HEAVY);
    const childBinding = parentBinding + (parentBindingWeight?.(parent, child, parentRun) ?? HEAVY);
    if (child.kind <= S.LastToken && (typeScript || jsDocOf(child).length === 0)) {
      // Identifiers, keywords, literals and punctuation have no children (in JavaScript files, the end of
      // file token carries the JSDoc comments that follow the last statement).
      if (childParsing > parsing) parsing = childParsing;
      if (childBinding > binding) binding = childBinding;
      return undefined;
    }
    nodes.push(child);
    // The left operand of a `<` comparison in a chain ends the chain one comparison earlier.
    const run = parentRun > 0 && child === (parent as ts.BinaryExpression).left ? parentRun - 1 : 0;
    costs.push(childParsing, childBinding, run);
    return undefined;
  };
  const pushAll = (children: ts.NodeArray<ts.Node>): undefined => {
    for (const child of children) push(child);
    return undefined;
  };
  for (;;) {
    const node = nodes.pop();
    if (node === undefined) break;
    const run = costs.pop() ?? 0;
    parentBinding = costs.pop() ?? 0;
    parentParsing = costs.pop() ?? 0;
    if (parentParsing > parsing) parsing = parentParsing;
    if (parentBinding > binding) binding = parentBinding;
    parent = node;
    parentParsingWeight = PARSING[node.kind];
    parentBindingWeight = BINDING[node.kind];
    parentRun = typeScript && isLessThan(node) ? run || lessThanRunOf(node) : 0;
    ts.forEachChild(node, push, pushAll);
    if (javascript) for (const comment of jsDocOf(node)) push(comment);
  }
  return { parsing, binding };
}
