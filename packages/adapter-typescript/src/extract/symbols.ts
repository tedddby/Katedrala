/**
 * Assembly of `ExtractedSymbol`s from collected declarations: ranges and merged declarations, modifiers,
 * visibility, abstractness, decorators (including parameter decorators), declared and return types,
 * initializers and constant values.
 */
import { compareStrings, type SymbolModifier } from "@katedrala/ir";
import type { ExtractedDecorator, ExtractedSymbol, TypeRef } from "@katedrala/plugin-api";
import ts from "typescript";
import { MAX_ARGUMENTS, type ArgumentSummarizer } from "./arguments.js";
import type { DeclarationSite, FileDeclarations, SymbolInfo } from "./declarations.js";
import type { Resolver } from "./resolver.js";
import {
  decoratorsOf,
  expressionText,
  isDynamicImportCall,
  isRequireCallSyntax,
  isThisParameter,
  skipOuterAndAwait,
  skipOuterExpressions,
  skipParentheses,
} from "./syntax.js";
import { normalizeLineEndings, startOf, truncate } from "./text.js";
import { K } from "./kinds.js";

const {
  getJSDocReturnType,
  getJSDocType,
  isCallExpression,
  isConstructorDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isNewExpression,
  isNumericLiteral,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isSetAccessorDeclaration,
} = ts;

const CALLABLE_KINDS = new Set(["function", "method", "constructor", "accessor"]);
const VARIABLE_KINDS = new Set(["constant", "variable", "function", "class"]);

/** The declaration giving a symbol's range: the first implementation, else the first declaration. */
function primarySite(symbol: SymbolInfo): DeclarationSite | undefined {
  return symbol.sites.find((site) => site.implementation) ?? symbol.sites[0];
}

/** Initializers summarized as a constant's value (literals, templates, objects, arrays). */
const VALUE_INITIALIZERS = new Set<ts.SyntaxKind>([
  K.StringLiteral,
  K.NoSubstitutionTemplateLiteral,
  K.TemplateExpression,
  K.NumericLiteral,
  K.TrueKeyword,
  K.FalseKeyword,
  K.NullKeyword,
  K.ObjectLiteralExpression,
  K.ArrayLiteralExpression,
]);

/** Whether a constant's initializer is summarized as its value (literals, templates, objects, arrays). */
function isValueInitializer(node: ts.Expression): boolean {
  if (VALUE_INITIALIZERS.has(node.kind)) return true;
  return isPrefixUnaryExpression(node) && isNumericLiteral(skipOuterExpressions(node.operand));
}

class SymbolAssembler {
  readonly #file: ts.SourceFile;
  readonly #resolver: Resolver;
  readonly #summarizer: ArgumentSummarizer;
  readonly #javascript: boolean;

  constructor(
    file: ts.SourceFile,
    resolver: Resolver,
    summarizer: ArgumentSummarizer,
    javascript: boolean,
  ) {
    this.#file = file;
    this.#resolver = resolver;
    this.#summarizer = summarizer;
    this.#javascript = javascript;
  }

  assemble(symbol: SymbolInfo): ExtractedSymbol {
    const primary = primarySite(symbol);
    const extracted: ExtractedSymbol = {
      localName: symbol.localName,
      name: symbol.name,
      qualifiedName: symbol.qualifiedName,
      kind: symbol.kind,
      range: primary?.range ?? { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
    };
    if (symbol.parent !== undefined) extracted.parent = symbol.parent.localName;
    // Stated for members of namespaces and modules only; merged declarations export alike (TypeScript
    // rejects mixing exported and local declarations), so any exported one decides.
    const stated = symbol.sites.flatMap((site) =>
      site.exported === undefined ? [] : [site.exported],
    );
    if (stated.length > 0) extracted.exported = stated.includes(true);
    if (symbol.sites.length > 1) {
      extracted.declarations = symbol.sites.map((site) =>
        site.signature === undefined
          ? { range: site.range }
          : { range: site.range, signature: site.signature },
      );
    }
    const visibility = primary?.visibility;
    if (visibility !== undefined) extracted.visibility = visibility;
    if (symbol.sites.some((site) => site.abstract)) extracted.abstract = true;
    const modifiers = this.#modifiers(symbol);
    if (modifiers.length > 0) extracted.modifiers = modifiers;
    const decorators = symbol.sites.flatMap((site) => this.#decorators(site));
    if (decorators.length > 0) extracted.decorators = decorators;
    if (primary?.signature !== undefined) extracted.signature = primary.signature;
    const declaredType = this.#declaredType(symbol);
    if (declaredType !== undefined) extracted.declaredType = declaredType;
    const returnType = this.#returnType(symbol, primary);
    if (returnType !== undefined) extracted.returnType = returnType;
    const value = primary?.value;
    if (value !== undefined && VARIABLE_KINDS.has(symbol.kind)) {
      const initializer = this.#initializer(value);
      if (initializer !== undefined) extracted.initializer = initializer;
      if (symbol.kind === "constant") {
        const unwrapped = skipOuterExpressions(value);
        if (isValueInitializer(unwrapped)) extracted.value = this.#summarizer.summarize(unwrapped);
      }
    }
    return extracted;
  }

  #modifiers(symbol: SymbolInfo): SymbolModifier[] {
    const all = new Set<SymbolModifier>();
    for (const site of symbol.sites) for (const modifier of site.modifiers) all.add(modifier);
    return [...all].sort(compareStrings);
  }

  #typeNodeOf(node: ts.Node, explicit: ts.TypeNode | undefined): ts.TypeNode | undefined {
    if (explicit !== undefined) return explicit;
    return this.#javascript ? getJSDocType(node) : undefined;
  }

  #declaredType(symbol: SymbolInfo): TypeRef | undefined {
    if (CALLABLE_KINDS.has(symbol.kind) && symbol.kind !== "accessor" && symbol.kind !== "function")
      return undefined;
    for (const site of symbol.sites) {
      if (
        site.form === "default-expression" ||
        site.form === "commonjs-export" ||
        site.form === "commonjs-member"
      ) {
        continue;
      }
      const typeNode = this.#typeNodeOf(site.node, site.typeNode);
      if (typeNode === undefined) continue;
      return this.#resolver.typeRefOf(typeNode);
    }
    return undefined;
  }

  #returnType(symbol: SymbolInfo, primary: DeclarationSite | undefined): TypeRef | undefined {
    if (!CALLABLE_KINDS.has(symbol.kind) || symbol.kind === "constructor") return undefined;
    const sites =
      primary === undefined
        ? symbol.sites
        : [primary, ...symbol.sites.filter((site) => site !== primary)];
    for (const site of sites) {
      const fn = site.functionNode;
      if (fn === undefined || isSetAccessorDeclaration(fn)) continue;
      const typeNode = fn.type ?? (this.#javascript ? getJSDocReturnType(fn) : undefined);
      if (typeNode !== undefined) return this.#resolver.typeRefOf(typeNode);
    }
    return undefined;
  }

  #initializer(value: ts.Expression): ExtractedSymbol["initializer"] {
    const expression = skipOuterAndAwait(value);
    if (isNewExpression(expression)) {
      const callee = this.#resolver.resolveExpression(expression.expression);
      if (callee.status !== "resolved" || callee.target === undefined) return undefined;
      return {
        kind: "new",
        callee: callee.target,
        arguments: this.#summarizer.summarizeAll(expression.arguments ?? []),
      };
    }
    if (
      isCallExpression(expression) &&
      !isRequireCallSyntax(expression) &&
      !isDynamicImportCall(expression)
    ) {
      const callee = this.#resolver.resolveExpression(expression.expression);
      if (callee.status !== "resolved" || callee.target === undefined) return undefined;
      return {
        kind: "call",
        callee: callee.target,
        arguments: this.#summarizer.summarizeAll(expression.arguments),
      };
    }
    return undefined;
  }

  #decorators(site: DeclarationSite): ExtractedDecorator[] {
    const result = decoratorsOf(site.node).map((decorator) =>
      this.#decorator(decorator, undefined),
    );
    const fn = site.functionNode;
    if (
      fn !== undefined &&
      (isMethodDeclaration(fn) || isConstructorDeclaration(fn)) &&
      fn === site.node
    ) {
      let index = 0;
      for (const parameter of fn.parameters) {
        if (isThisParameter(parameter)) continue;
        for (const decorator of decoratorsOf(parameter))
          result.push(this.#decorator(decorator, index));
        index += 1;
      }
    }
    return result;
  }

  #decorator(decorator: ts.Decorator, parameterIndex: number | undefined): ExtractedDecorator {
    const expression = skipParentheses(decorator.expression);
    const invoked = isCallExpression(expression);
    const callee = invoked ? expression.expression : expression;
    const args = invoked ? expression.arguments.slice(0, MAX_ARGUMENTS) : [];
    const position = startOf(this.#file, decorator);
    const entry: ExtractedDecorator = {
      name: decoratorName(this.#file, callee),
      invoked,
      arguments: args.map((argument) => this.#summarizer.summarize(argument)),
      text: args.map((argument) => truncate(normalizeLineEndings(argument.getText(this.#file)))),
      line: position.line,
      column: position.column,
    };
    const target = this.#resolver.bindingOf(this.#resolver.resolveExpression(callee), true);
    if (target !== undefined) entry.target = target;
    if (parameterIndex !== undefined) entry.parameterIndex = parameterIndex;
    return entry;
  }
}

/** The name of a decorator as written: an identifier or a member chain of identifiers, without `@`. */
function decoratorName(file: ts.SourceFile, callee: ts.Expression): string {
  const parts: string[] = [];
  let current = skipParentheses(callee);
  while (isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = skipParentheses(current.expression);
  }
  if (isIdentifier(current)) return [current.text, ...parts].join(".");
  return expressionText(file, callee);
}

/** Assemble the extracted symbols of a file, in source order. */
export function assembleSymbols(
  file: ts.SourceFile,
  declarations: FileDeclarations,
  resolver: Resolver,
  summarizer: ArgumentSummarizer,
  javascript: boolean,
): ExtractedSymbol[] {
  const assembler = new SymbolAssembler(file, resolver, summarizer, javascript);
  return declarations.symbols.map((symbol) => assembler.assemble(symbol));
}
