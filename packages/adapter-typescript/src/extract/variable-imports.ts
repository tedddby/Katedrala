/**
 * Variable declarations that import a module and bind its exports, CommonJS and dynamic-import style:
 *
 * - `const x = require("m")` binds `x` to the module object (`=`);
 * - `const { a, b: c } = require("m")` binds `a` → `a` and `c` → `b`;
 * - `const y = require("m").x` (or `require("m")["x"]`) binds `y` → `x`;
 * - `const ns = await import("m")` binds `ns` to the namespace object (`*`);
 * - `const { a } = await import("m")` binds `a` → `a`.
 *
 * Only literal specifiers bind names. Such declarations are imports, not symbols: references to the bound
 * names are `import` references. `require` is a module loader where it is the CommonJS global, a local
 * `createRequire(...)` result or an AMD factory's parameter ({@link requireTestOf}).
 */
import ts from "typescript";
import type { ScopeLookup } from "./scope.js";
import {
  decomposeChain,
  isDynamicImportCall,
  isModuleLoaderDeclaration,
  isRequireCallSyntax,
  literalText,
  requireIdentifierOf,
  skipOuterExpressions,
  specifierArgument,
} from "./syntax.js";

const {
  isAwaitExpression,
  isComputedPropertyName,
  isElementAccessExpression,
  isIdentifier,
  isObjectBindingPattern,
  isPropertyAccessExpression,
} = ts;

/** One name bound by an import-like variable declaration. */
export interface VariableImportBinding {
  readonly local: string;
  readonly imported: string;
  readonly name: ts.Identifier;
}

/** An import-like variable declaration. */
export interface VariableImport {
  readonly call: ts.CallExpression;
  readonly mechanism: "require-call" | "dynamic-import";
  readonly specifier: string;
  readonly bindings: readonly VariableImportBinding[];
}

/** A property of an identifier decided by scope analysis (e.g. whether it denotes a global). */
export type IdentifierTest = (identifier: ts.Identifier) => boolean;

/**
 * Whether a `require` identifier loads modules where it occurs: it is unbound (the CommonJS global), or it is
 * bound to a module loader (`const require = createRequire(...)`, an AMD factory's `require` parameter).
 */
export function requireTestOf(scopes: ScopeLookup): IdentifierTest {
  return (identifier) => {
    const declarations = scopes.lookup(identifier.escapedText, identifier, "value");
    return declarations.length === 0 || declarations.some(isModuleLoaderDeclaration);
  };
}

function propertyKey(name: ts.PropertyName): string | undefined {
  if (isIdentifier(name)) return name.text;
  if (isComputedPropertyName(name)) return literalText(skipOuterExpressions(name.expression));
  return literalText(name);
}

/**
 * Analyze a variable declaration; undefined when it is not an import-like declaration. `isRequire` decides
 * whether a `require` identifier loads modules ({@link requireTestOf}).
 */
export function variableImportOf(
  file: ts.SourceFile,
  declaration: ts.VariableDeclaration,
  isRequire: IdentifierTest,
): VariableImport | undefined {
  if (declaration.initializer === undefined) return undefined;
  let initializer = skipOuterExpressions(declaration.initializer);
  let awaited = false;
  if (isAwaitExpression(initializer)) {
    awaited = true;
    initializer = skipOuterExpressions(initializer.expression);
  }
  let member: string | undefined;
  if (
    !awaited &&
    (isPropertyAccessExpression(initializer) || isElementAccessExpression(initializer))
  ) {
    const chain = decomposeChain(initializer);
    if (chain.members.length !== 1 || !isRequireCallSyntax(chain.root)) return undefined;
    member = chain.members[0];
    initializer = chain.root;
  }
  let mechanism: VariableImport["mechanism"];
  if (isRequireCallSyntax(initializer) && !awaited) {
    const identifier = requireIdentifierOf(initializer);
    if (identifier === undefined || !isRequire(identifier)) return undefined;
    mechanism = "require-call";
  } else if (isDynamicImportCall(initializer) && awaited) {
    mechanism = "dynamic-import";
  } else {
    return undefined;
  }
  const specifier = specifierArgument(file, initializer.arguments[0]);
  if (specifier?.literal !== true) return undefined;

  const bindings: VariableImportBinding[] = [];
  if (isIdentifier(declaration.name)) {
    if (declaration.name.text === "") return undefined;
    const imported = member ?? (mechanism === "require-call" ? "=" : "*");
    bindings.push({ local: declaration.name.text, imported, name: declaration.name });
  } else if (isObjectBindingPattern(declaration.name) && member === undefined) {
    for (const element of declaration.name.elements) {
      if (element.dotDotDotToken !== undefined || !isIdentifier(element.name)) continue;
      if (element.name.text === "") continue;
      const imported =
        element.propertyName === undefined ? element.name.text : propertyKey(element.propertyName);
      if (imported === undefined) continue;
      bindings.push({ local: element.name.text, imported, name: element.name });
    }
  } else {
    return undefined;
  }
  return { call: initializer, mechanism, specifier: specifier.specifier, bindings };
}

/** The binding of an import-like declaration that declares `name` (the identifier node itself). */
export function variableImportBindingFor(
  variableImport: VariableImport,
  name: ts.Identifier,
): VariableImportBinding | undefined {
  return variableImport.bindings.find((binding) => binding.name === name);
}
