/**
 * Bounded, serializable summaries of argument and initializer expressions (`ArgumentSummary`), for framework
 * detection: at most 8 arguments, 16 array elements, 32 object properties and 16 template substitutions,
 * nesting depth 4, strings of at most 200 characters.
 */
import type { ArgumentSummary } from "@katedrala/plugin-api";
import ts from "typescript";
import type { Resolver } from "./resolver.js";
import {
  expressionText,
  isRequireCallSyntax,
  literalText,
  requireIdentifierOf,
  skipOuterExpressions,
  specifierArgument,
} from "./syntax.js";
import { rangeOf, truncate } from "./text.js";
import { K } from "./kinds.js";

const {
  isArrayLiteralExpression,
  isArrowFunction,
  isBlock,
  isCallExpression,
  isComputedPropertyName,
  isFunctionExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isPrefixUnaryExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isSpreadElement,
  isStringLiteral,
  isTemplateExpression,
} = ts;

/** Maximum number of summarized arguments per invocation. */
export const MAX_ARGUMENTS = 8;
const MAX_ELEMENTS = 16;
const MAX_PROPERTIES = 32;
const MAX_SUBSTITUTIONS = 16;
const MAX_DEPTH = 4;

/** Placeholder written for each substitution in a template's text. */
export const TEMPLATE_PLACEHOLDER = "${…}";

const OTHER: ArgumentSummary = { type: "other" };

/** Expressions summarized with nested summaries. */
const COMPOSITE_KINDS = new Set<ts.SyntaxKind>([
  K.TemplateExpression,
  K.ObjectLiteralExpression,
  K.ArrayLiteralExpression,
  K.SpreadElement,
  K.CallExpression,
]);

/** Expressions summarized as references when they resolve (identifiers and member chains). */
const CHAIN_KINDS = new Set<ts.SyntaxKind>([
  K.Identifier,
  K.PropertyAccessExpression,
  K.ElementAccessExpression,
  K.ThisKeyword,
]);

/** The text of a template literal with each substitution replaced by {@link TEMPLATE_PLACEHOLDER}. */
export function templateText(
  node: ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral,
): string {
  if (isNoSubstitutionTemplateLiteral(node)) return node.text;
  let text = node.head.text;
  for (const span of node.templateSpans) text += `${TEMPLATE_PLACEHOLDER}${span.literal.text}`;
  return text;
}

/** Summarizes expressions of one file. */
export class ArgumentSummarizer {
  readonly #file: ts.SourceFile;
  readonly #resolver: Resolver;

  constructor(file: ts.SourceFile, resolver: Resolver) {
    this.#file = file;
    this.#resolver = resolver;
  }

  /** Summaries of the first {@link MAX_ARGUMENTS} arguments. */
  summarizeAll(nodes: readonly ts.Expression[] | undefined, depth = 1): ArgumentSummary[] {
    return (nodes ?? []).slice(0, MAX_ARGUMENTS).map((node) => this.summarize(node, depth));
  }

  /**
   * Summary of one expression at a nesting depth (1 for an argument). Summaries never nest deeper than
   * {@link MAX_DEPTH}: composite values (objects, arrays, templates, calls, spreads) at the deepest level
   * are summarized as `other`, functions without their result.
   */
  summarize(node: ts.Expression, depth = 1): ArgumentSummary {
    if (depth > MAX_DEPTH) return OTHER;
    const expression = skipOuterExpressions(node);
    if (depth === MAX_DEPTH && COMPOSITE_KINDS.has(expression.kind)) return OTHER;
    if (isStringLiteral(expression) || isNoSubstitutionTemplateLiteral(expression)) {
      return { type: "string", value: truncate(expression.text) };
    }
    if (isNumericLiteral(expression)) return numberSummary(Number(expression.text));
    if (isPrefixUnaryExpression(expression)) return this.#prefixUnary(expression);
    if (expression.kind === K.TrueKeyword) return { type: "boolean", value: true };
    if (expression.kind === K.FalseKeyword) return { type: "boolean", value: false };
    if (expression.kind === K.NullKeyword) return { type: "null" };
    if (isTemplateExpression(expression)) {
      return {
        type: "template",
        text: truncate(templateText(expression)),
        substitutions: expression.templateSpans
          .slice(0, MAX_SUBSTITUTIONS)
          .map((span) => this.summarize(span.expression, depth + 1)),
      };
    }
    if (isArrowFunction(expression) || isFunctionExpression(expression)) {
      return this.#function(expression, depth);
    }
    if (isObjectLiteralExpression(expression)) return this.#object(expression, depth);
    if (isArrayLiteralExpression(expression)) {
      const elements = expression.elements;
      return {
        type: "array",
        length: elements.length,
        elements: elements
          .slice(0, MAX_ELEMENTS)
          .map((element) => this.summarize(element, depth + 1)),
      };
    }
    if (isSpreadElement(expression)) {
      return { type: "spread", argument: this.summarize(expression.expression, depth + 1) };
    }
    if (isCallExpression(expression)) return this.#call(expression, depth);
    if (CHAIN_KINDS.has(expression.kind)) return this.#reference(expression);
    return OTHER;
  }

  #prefixUnary(node: ts.PrefixUnaryExpression): ArgumentSummary {
    const operand = skipOuterExpressions(node.operand);
    if (!isNumericLiteral(operand)) return OTHER;
    const value = Number(operand.text);
    if (node.operator === K.MinusToken) return numberSummary(-value);
    if (node.operator === K.PlusToken) return numberSummary(value);
    return OTHER;
  }

  #function(node: ts.ArrowFunction | ts.FunctionExpression, depth: number): ArgumentSummary {
    const range = rangeOf(this.#file, node);
    if (isArrowFunction(node) && !isBlock(node.body) && depth < MAX_DEPTH) {
      return { type: "function", range, returns: this.summarize(node.body, depth + 1) };
    }
    return { type: "function", range };
  }

  #object(node: ts.ObjectLiteralExpression, depth: number): ArgumentSummary {
    const properties: Array<{ key: string; value: ArgumentSummary }> = [];
    for (const property of node.properties.slice(0, MAX_PROPERTIES)) {
      if (isPropertyAssignment(property)) {
        properties.push({
          key: this.#key(property.name),
          value: this.summarize(property.initializer, depth + 1),
        });
      } else if (isShorthandPropertyAssignment(property)) {
        properties.push({
          key: property.name.text,
          value: this.summarize(property.name, depth + 1),
        });
      } else if (isSpreadAssignment(property)) {
        properties.push({
          key: "...",
          value: { type: "spread", argument: this.summarize(property.expression, depth + 1) },
        });
      } else {
        properties.push({
          key: this.#key(property.name),
          value: { type: "function", range: rangeOf(this.#file, property) },
        });
      }
    }
    return { type: "object", properties };
  }

  #key(name: ts.PropertyName): string {
    if (isComputedPropertyName(name)) {
      const literal = literalText(skipOuterExpressions(name.expression));
      return truncate(literal ?? `[${expressionText(this.#file, name.expression)}]`);
    }
    return truncate(name.text);
  }

  #call(node: ts.CallExpression, depth: number): ArgumentSummary {
    if (isRequireCallSyntax(node)) {
      const identifier = requireIdentifierOf(node);
      const specifier = specifierArgument(this.#file, node.arguments[0]);
      if (
        identifier !== undefined &&
        this.#resolver.isRequire(identifier) &&
        specifier?.literal === true
      ) {
        return {
          type: "reference",
          target: { type: "module", specifier: specifier.specifier, members: [] },
        };
      }
      return OTHER;
    }
    if (node.expression.kind === K.ImportKeyword) return OTHER;
    const callee = this.#resolver.resolveExpression(node.expression);
    if (callee.status !== "resolved" || callee.target === undefined) return OTHER;
    return {
      type: "call",
      callee: callee.target,
      arguments: this.summarizeAll(node.arguments, depth + 1),
    };
  }

  #reference(node: ts.Expression): ArgumentSummary {
    const resolution = this.#resolver.resolveExpression(node);
    if (
      (resolution.status === "resolved" || resolution.status === "untyped") &&
      resolution.target !== undefined
    ) {
      return { type: "reference", target: resolution.target };
    }
    return OTHER;
  }
}

function numberSummary(value: number): ArgumentSummary {
  return Number.isFinite(value) ? { type: "number", value } : OTHER;
}
