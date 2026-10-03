/**
 * Exported names of a file (ES modules, TypeScript `export =`, CommonJS), in source order.
 *
 * Local exports with the same name are merged into one entry with several targets (e.g. `export const
 * User` and `export type User`). Re-exports (`export ... from`) are listed per statement. `typeOnly` is
 * derived from syntax: `export type`, type-qualified specifiers, or targets that are all interfaces, type
 * aliases or type-only imports.
 */
import type { BindingRef, ExtractedExport } from "@katedrala/plugin-api";
import ts from "typescript";
import { isBindingExpression, type FileDeclarations, type SymbolInfo } from "./declarations.js";
import { uniqueBindings, type Resolver } from "./resolver.js";
import {
  boundNames,
  commonJsExportOf,
  hasModifier,
  propertyNameText,
  skipOuterExpressions,
} from "./syntax.js";
import { startOf } from "./text.js";
import { K } from "./kinds.js";

const {
  isClassDeclaration,
  isEnumDeclaration,
  isExportAssignment,
  isExportDeclaration,
  isFunctionDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isModuleDeclaration,
  isNamedExports,
  isNamedImports,
  isNamespaceExport,
  isNamespaceImport,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isTypeAliasDeclaration,
  isVariableStatement,
} = ts;

const TYPE_ONLY_KINDS = new Set(["interface", "type-alias"]);

interface LocalExport {
  readonly entry: ExtractedExport;
  targets: BindingRef[];
  typeOnlyTargets: boolean;
}

class ExportCollector {
  readonly #file: ts.SourceFile;
  readonly #declarations: FileDeclarations;
  readonly #resolver: Resolver;
  readonly #entries: ExtractedExport[] = [];
  readonly #local = new Map<string, LocalExport>();
  readonly #typeOnlyImports = new Set<string>();

  constructor(file: ts.SourceFile, declarations: FileDeclarations, resolver: Resolver) {
    this.#file = file;
    this.#declarations = declarations;
    this.#resolver = resolver;
  }

  collect(): ExtractedExport[] {
    for (const statement of this.#file.statements) this.#statement(statement);
    for (const local of this.#local.values()) {
      if (local.targets.length > 0) local.entry.targets = local.targets;
    }
    return this.#entries;
  }

  #symbolRef(symbol: SymbolInfo): BindingRef {
    return { type: "symbol", localName: symbol.localName, members: [] };
  }

  #isTypeOnlyTarget(target: BindingRef): boolean {
    if (target.type === "symbol") {
      const symbol = this.#declarations.symbols.find(
        (candidate) => candidate.localName === target.localName,
      );
      return symbol !== undefined && TYPE_ONLY_KINDS.has(symbol.kind);
    }
    return (
      target.type === "import" &&
      target.members.length === 0 &&
      this.#typeOnlyImports.has(target.local)
    );
  }

  /** Add (or merge into) a local export. */
  #addLocal(
    name: string,
    node: ts.Node,
    targets: readonly BindingRef[],
    syntaxTypeOnly: boolean,
  ): void {
    if (name === "") return;
    const typeOnlyTargets =
      targets.length > 0 && targets.every((target) => this.#isTypeOnlyTarget(target));
    const existing = this.#local.get(name);
    if (existing !== undefined) {
      existing.targets = uniqueBindings([...existing.targets, ...targets]);
      existing.typeOnlyTargets = existing.typeOnlyTargets && (syntaxTypeOnly || typeOnlyTargets);
      existing.entry.typeOnly = existing.typeOnlyTargets;
      return;
    }
    const position = startOf(this.#file, node);
    const typeOnly = syntaxTypeOnly || typeOnlyTargets;
    const entry: ExtractedExport = { name, typeOnly, line: position.line, column: position.column };
    this.#entries.push(entry);
    this.#local.set(name, { entry, targets: uniqueBindings(targets), typeOnlyTargets: typeOnly });
  }

  #addReExport(
    node: ts.Node,
    name: string,
    from: string,
    imported: string | undefined,
    typeOnly: boolean,
  ): void {
    if (name === "") return;
    const position = startOf(this.#file, node);
    const entry: ExtractedExport = {
      name,
      from,
      typeOnly,
      line: position.line,
      column: position.column,
    };
    if (imported !== undefined) entry.imported = imported;
    this.#entries.push(entry);
  }

  /** Targets of an exported or assigned expression: the symbol created for it, or the binding it names. */
  #expressionTargets(expression: ts.Expression): BindingRef[] {
    const owner = this.#declarations.ownerOf(expression);
    if (owner !== undefined) return [this.#symbolRef(owner)];
    if (!isBindingExpression(expression)) return [];
    const unwrapped = skipOuterExpressions(expression);
    if (isIdentifier(unwrapped)) return this.#resolver.bindingsOfName(unwrapped);
    const binding = this.#resolver.bindingOf(this.#resolver.resolveExpression(unwrapped));
    return binding === undefined ? [] : [binding];
  }

  #statement(statement: ts.Statement): void {
    this.#noteTypeOnlyImports(statement);
    if (isExportDeclaration(statement)) {
      this.#exportDeclaration(statement);
      return;
    }
    if (isExportAssignment(statement)) {
      if (statement.isExportEquals === true) {
        this.#exportAssignment(statement, statement.expression);
      } else {
        this.#addLocal("default", statement, this.#expressionTargets(statement.expression), false);
      }
      return;
    }
    if (hasModifier(statement, K.ExportKeyword)) {
      this.#exportedDeclaration(statement);
      return;
    }
    this.#commonJs(statement);
  }

  #noteTypeOnlyImports(statement: ts.Statement): void {
    if (isImportDeclaration(statement) && statement.importClause !== undefined) {
      const clause = statement.importClause;
      const clauseTypeOnly = clause.phaseModifier === K.TypeKeyword;
      if (clause.name !== undefined && clauseTypeOnly) this.#typeOnlyImports.add(clause.name.text);
      const named = clause.namedBindings;
      if (named !== undefined && isNamespaceImport(named) && clauseTypeOnly) {
        this.#typeOnlyImports.add(named.name.text);
      } else if (named !== undefined && isNamedImports(named)) {
        for (const element of named.elements) {
          if (clauseTypeOnly || element.isTypeOnly) this.#typeOnlyImports.add(element.name.text);
        }
      }
    } else if (isImportEqualsDeclaration(statement) && statement.isTypeOnly) {
      this.#typeOnlyImports.add(statement.name.text);
    }
  }

  #exportDeclaration(statement: ts.ExportDeclaration): void {
    const clause = statement.exportClause;
    const specifier = statement.moduleSpecifier;
    if (specifier !== undefined) {
      if (!isStringLiteral(specifier)) return;
      const from = specifier.text;
      if (clause === undefined) {
        this.#addReExport(statement, "*", from, undefined, statement.isTypeOnly);
      } else if (isNamespaceExport(clause)) {
        this.#addReExport(statement, clause.name.text, from, "*", statement.isTypeOnly);
      } else {
        for (const element of clause.elements) {
          this.#addReExport(
            element,
            element.name.text,
            from,
            (element.propertyName ?? element.name).text,
            statement.isTypeOnly || element.isTypeOnly,
          );
        }
      }
      return;
    }
    if (clause === undefined || !isNamedExports(clause)) return;
    for (const element of clause.elements) {
      const local = element.propertyName ?? element.name;
      const targets = isIdentifier(local) ? this.#resolver.bindingsOfName(local) : [];
      this.#addLocal(
        element.name.text,
        element,
        targets,
        statement.isTypeOnly || element.isTypeOnly,
      );
    }
  }

  #exportedDeclaration(statement: ts.Statement): void {
    const isDefault = hasModifier(statement, K.DefaultKeyword);
    if (isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const names = isIdentifier(declaration.name)
          ? [{ node: declaration, name: declaration.name }]
          : boundNames(declaration.name).map(({ element, name }) => ({ node: element, name }));
        for (const { node, name } of names) {
          const symbol = this.#declarations.symbolOfDeclaration(node);
          const targets =
            symbol === undefined ? this.#resolver.bindingsOfName(name) : [this.#symbolRef(symbol)];
          this.#addLocal(name.text, node, targets, false);
        }
      }
      return;
    }
    if (isImportEqualsDeclaration(statement)) {
      this.#addLocal(
        statement.name.text,
        statement,
        this.#resolver.bindingsOfName(statement.name),
        statement.isTypeOnly,
      );
      return;
    }
    if (
      isFunctionDeclaration(statement) ||
      isClassDeclaration(statement) ||
      isInterfaceDeclaration(statement) ||
      isTypeAliasDeclaration(statement) ||
      isEnumDeclaration(statement) ||
      (isModuleDeclaration(statement) && isIdentifier(statement.name))
    ) {
      const symbol = this.#declarations.ownerOf(statement);
      const name = isDefault ? "default" : statement.name?.text;
      if (name === undefined) return;
      this.#addLocal(name, statement, symbol === undefined ? [] : [this.#symbolRef(symbol)], false);
    }
  }

  /**
   * `exports.x = ...`, `module.exports.x = ...`, `module.exports = ...` at the top level (also `exports =
   * module.exports = ...`, see `commonJsExportOf`).
   */
  #commonJs(statement: ts.Statement): void {
    const commonJs = commonJsExportOf(statement, (identifier) =>
      this.#resolver.isGlobal(identifier),
    );
    if (commonJs === undefined) return;
    const { target, value } = commonJs;
    if (target.kind === "property") {
      let targets = this.#expressionTargets(value);
      if (targets.length === 0 && this.#declarations.topLevelNames.has(target.name)) {
        // `exports.x = ...` where `x` is declared at the top level: the declaration is the export.
        targets = this.#topLevelBindings(target.name, statement);
      }
      this.#addLocal(target.name, statement, targets, false);
      return;
    }
    this.#exportAssignment(statement, value);
  }

  /**
   * An export assignment (`module.exports = value`, `export = value`): an object literal exports each of its
   * properties by name, plus `=` without targets; any other value exports `=`.
   */
  #exportAssignment(statement: ts.Statement, value: ts.Expression): void {
    const unwrapped = skipOuterExpressions(value);
    if (!isObjectLiteralExpression(unwrapped)) {
      this.#addLocal("=", statement, this.#expressionTargets(value), false);
      return;
    }
    for (const property of unwrapped.properties) {
      if (isShorthandPropertyAssignment(property)) {
        this.#addLocal(
          property.name.text,
          property,
          this.#resolver.bindingsOfName(property.name),
          false,
        );
      } else if (isPropertyAssignment(property)) {
        this.#addLocal(
          propertyNameText(this.#file, property.name),
          property,
          this.#expressionTargets(property.initializer),
          false,
        );
      } else if (isMethodDeclaration(property)) {
        const owner = this.#declarations.ownerOf(property);
        this.#addLocal(
          propertyNameText(this.#file, property.name),
          property,
          owner === undefined ? [] : [this.#symbolRef(owner)],
          false,
        );
      }
    }
    this.#addLocal("=", statement, [], false);
  }

  #topLevelBindings(name: string, statement: ts.Statement): BindingRef[] {
    const symbols = this.#declarations.symbols.filter(
      (symbol) =>
        symbol.parent === undefined &&
        !symbol.global &&
        symbol.name === name &&
        symbol.sites.every((site) => site.node !== statement),
    );
    return symbols.map((symbol) => this.#symbolRef(symbol));
  }
}

/** Collect the exported names of a file in source order. */
export function collectExports(
  file: ts.SourceFile,
  declarations: FileDeclarations,
  resolver: Resolver,
): ExtractedExport[] {
  return new ExportCollector(file, declarations, resolver).collect();
}
